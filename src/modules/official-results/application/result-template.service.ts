import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod/v4';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../common/exceptions/domain-exception';
import { OfficialResultsError } from '../domain/official-results.error';
import {
  cloneResultDefinition,
  normalizeResultDefinition,
  type ResultDefinition,
} from '../domain/result-definition';
import {
  moazezStarterDefinition,
  starterTemplateId,
  starterVersionId,
} from '../domain/moazez-starter';
import { resultContentDigest } from '../domain/result-content-digest';
import { ResultAuthorizationRepository } from '../infrastructure/repositories/result-authorization.repository';
import { ResultCommandRepository } from '../infrastructure/repositories/result-command.repository';
import { ResultPreviewRepository } from '../infrastructure/repositories/result-preview.repository';
import {
  presentResultTemplate,
  presentResultTemplateVersion,
  presentStarterTemplate,
  presentStarterVersion,
  ResultTemplateRepository,
} from '../infrastructure/repositories/result-template.repository';
import { requireResultActor, type ResultActor } from './result-actor';
import {
  presentResultPage,
  readResultCursor,
  type ResultListQuery,
} from './result-page';

type Surface = 'SCHOOL' | 'TEACHER';
interface LabelInput {
  label: ResultDefinition['label'];
  description?: string;
}
interface TemplateQuery extends ResultListQuery {
  ownership?: 'SCHOOL' | 'PLATFORM';
  archived?: boolean;
  search?: string;
  groupKind?: 'CUSTOM' | 'SUBJECT';
}

@Injectable()
export class ResultTemplateService {
  constructor(
    private readonly commands: ResultCommandRepository,
    private readonly authorization: ResultAuthorizationRepository,
    private readonly templates: ResultTemplateRepository,
    private readonly previews: ResultPreviewRepository,
  ) {}

  list(surface: Surface, query: TemplateQuery) {
    return this.read(surface, async (client, actor) => {
      const { limit, cursor, ...filters } = query;
      const binding = `${actor.schoolId}:${actor.actorId}`;
      const page = readResultCursor(
        { limit, cursor },
        binding,
        'templates',
        filters,
      );
      if (page.after && !z.uuid().safeParse(page.after).success) {
        throw new ValidationDomainException('Invalid template cursor');
      }
      const starter = presentStarterTemplate();
      const includePlatform =
        filters.ownership !== 'SCHOOL' &&
        filters.archived !== true &&
        filters.groupKind !== 'CUSTOM' &&
        (!filters.search ||
          [starter.label.ar, starter.label.en].some((value) =>
            value
              .toLocaleLowerCase()
              .includes(filters.search!.toLocaleLowerCase()),
          ));
      const visible =
        surface === 'TEACHER'
          ? await this.templates.teacherVisibleVersions(client, actor)
          : undefined;
      const rows =
        filters.ownership === 'PLATFORM'
          ? []
          : await this.templates.list(
              client,
              actor,
              filters,
              page.limit,
              page.after,
              visible,
            );
      const merged = [
        ...(includePlatform && (!page.after || starter.templateId > page.after)
          ? [starter]
          : []),
        ...rows.map((row) => this.templateForSurface(row, visible)),
      ].sort((left, right) => left.templateId.localeCompare(right.templateId));
      return presentResultPage(
        merged,
        page.limit,
        ({ templateId }) => templateId,
        binding,
        'templates',
        filters,
      );
    });
  }

  detail(surface: Surface, templateId: string) {
    return this.read(surface, async (client, actor) => {
      if (templateId === starterTemplateId) return presentStarterTemplate();
      const template = await this.templates.template(client, actor, templateId);
      const visible =
        surface === 'TEACHER'
          ? await this.templates.teacherVisibleVersions(client, actor)
          : undefined;
      if (
        visible &&
        !(await this.templates.hasVisibleVersion(
          client,
          actor.schoolId,
          templateId,
          visible,
        ))
      ) {
        throw new NotFoundDomainException();
      }
      return this.templateForSurface(template, visible);
    });
  }

  private templateForSurface(
    row: Parameters<typeof presentResultTemplate>[0],
    visible?: string[],
  ) {
    const template = presentResultTemplate(row);
    if (!visible) return template;
    return {
      ...template,
      currentVersionId:
        template.currentVersionId && visible.includes(template.currentVersionId)
          ? template.currentVersionId
          : null,
      activeVersionId:
        template.activeVersionId && visible.includes(template.activeVersionId)
          ? template.activeVersionId
          : null,
      latestVersionId:
        template.latestVersionId && visible.includes(template.latestVersionId)
          ? template.latestVersionId
          : null,
    };
  }

  version(surface: Surface, templateId: string, versionId: string) {
    return this.read(surface, async (client, actor) => {
      if (templateId === starterTemplateId && versionId === starterVersionId)
        return presentStarterVersion();
      if (surface === 'TEACHER') {
        const authorized = await this.templates.teacherVisibleVersions(
          client,
          actor,
        );
        if (!authorized.includes(versionId))
          throw new NotFoundDomainException();
      }
      return presentResultTemplateVersion(
        await this.templates.version(client, actor, templateId, versionId),
      );
    });
  }

  create(input: LabelInput, key?: string) {
    return this.write('templates.create', input, key, async (client, actor) => {
      const template = await this.templates.create(client, actor, input);
      const value = presentResultTemplate(template);
      await this.commands.audit(
        client,
        actor,
        'templates.create',
        'result_template',
        template.id,
        { revision: template.revision },
      );
      return value;
    });
  }

  clone(
    input: LabelInput & { sourceTemplateId: string; sourceVersionId: string },
    key?: string,
  ) {
    return this.write('templates.clone', input, key, async (client, actor) => {
      const platform =
        input.sourceTemplateId === starterTemplateId &&
        input.sourceVersionId === starterVersionId;
      const source = platform
        ? moazezStarterDefinition()
        : ((
            await this.templates.version(
              client,
              actor,
              input.sourceTemplateId,
              input.sourceVersionId,
            )
          ).definition as unknown as ResultDefinition);
      const copy = cloneResultDefinition(source, input.label);
      const template = await this.templates.create(client, actor, input);
      const version = await this.templates.append(
        client,
        actor,
        template,
        copy.definition,
        {
          kind: platform ? 'PLATFORM_CLONE' : 'SCHOOL_CLONE',
          sourceTemplateId: input.sourceTemplateId,
          sourceVersionId: input.sourceVersionId,
          fieldLineage: Object.fromEntries(copy.fieldLineage),
          unitLineage: Object.fromEntries(copy.unitLineage),
        },
      );
      const current = await this.templates.template(client, actor, template.id);
      await this.commands.audit(
        client,
        actor,
        'templates.clone',
        'result_template',
        current.id,
        {
          revision: current.revision,
          templateVersionId: version.id,
          sourceVersionId: input.sourceVersionId,
        },
      );
      return presentResultTemplate(current);
    });
  }

  createVersion(
    id: string,
    input: { expectedLatestVersionId: string | null; definition: unknown },
    key?: string,
  ) {
    return this.write(
      'templates.versions.create',
      { id, ...input },
      key,
      async (client, actor) => {
        const template = await this.templates.template(client, actor, id);
        if (template.latestVersionId !== input.expectedLatestVersionId) {
          throw new OfficialResultsError('revision.stale');
        }
        const previous = template.latestVersionId
          ? await this.templates.version(
              client,
              actor,
              template.id,
              template.latestVersionId,
            )
          : null;
        const normalized = normalizeResultDefinition(
          input.definition,
          (previous?.definition as unknown as ResultDefinition) ?? null,
          true,
        );
        const version = await this.templates.append(
          client,
          actor,
          template,
          normalized.definition,
          {
            kind: 'SCHOOL',
            predecessorId: previous?.id ?? null,
          },
        );
        await this.commands.audit(
          client,
          actor,
          'templates.versions.create',
          'result_template_version',
          version.id,
          {
            templateId: id,
            version: version.version,
            contentDigest: version.contentDigest,
          },
        );
        return {
          ...presentResultTemplateVersion(version),
          identityMap: normalized.identityMap,
        };
      },
    );
  }

  activationPreview(
    id: string,
    input: { versionId: string; expectedTemplateRevision: number },
  ) {
    const actor = requireResultActor('SCHOOL');
    return this.commands.transaction(async (client) => {
      const access = await this.authorization.permissions(client, actor, {
        write: true,
      });
      this.authorization.requirePermission(
        access,
        'official_results.templates.manage',
      );
      const template = await this.templates.template(client, actor, id);
      if (template.revision !== input.expectedTemplateRevision)
        throw new OfficialResultsError('revision.stale');
      const version = await this.templates.version(
        client,
        actor,
        id,
        input.versionId,
      );
      const impact = await this.templates.activationImpact(
        client,
        actor,
        template,
        version,
      );
      return {
        ...(await this.previews.create(
          client,
          actor,
          'TEMPLATE_ACTIVATION',
          id,
          impact,
        )),
        impact,
        impacts: [
          {
            kind: 'TEMPLATE_ACTIVATION' as const,
            resourceId: id,
            before: {
              versionId: template.activeVersionId,
              revision: template.revision,
            },
            after: { versionId: version.id, revision: template.revision + 1 },
          },
        ],
        blockers: [],
      };
    });
  }

  activate(
    id: string,
    input: {
      versionId: string;
      expectedTemplateRevision: number;
      previewId: string;
      previewDigest: string;
    },
    key?: string,
  ) {
    return this.write(
      'templates.activate',
      { id, ...input },
      key,
      async (client, actor) => {
        await this.previews.load(
          client,
          actor,
          'TEMPLATE_ACTIVATION',
          id,
          input.previewId,
          input.previewDigest,
        );
        const template = await this.templates.template(client, actor, id);
        if (template.revision !== input.expectedTemplateRevision)
          throw new OfficialResultsError('revision.stale');
        const version = await this.templates.version(
          client,
          actor,
          id,
          input.versionId,
        );
        const impact = await this.templates.activationImpact(
          client,
          actor,
          template,
          version,
        );
        if (resultContentDigest(impact) !== input.previewDigest)
          throw new OfficialResultsError('preview.stale');
        const active = await this.templates.setState(client, actor, template, {
          activeVersionId: version.id,
        });
        await this.commands.audit(
          client,
          actor,
          'templates.activate',
          'result_template',
          id,
          {
            revision: active.revision,
            activeVersionId: version.id,
            previousVersionId: template.activeVersionId,
          },
        );
        return presentResultTemplate(active);
      },
    );
  }

  archive(
    id: string,
    input: { expectedRevision: number; reason: string },
    key?: string,
  ) {
    return this.write(
      'templates.archive',
      { id, ...input },
      key,
      async (client, actor) => {
        const current = await this.templates.template(client, actor, id);
        if (current.revision !== input.expectedRevision)
          throw new OfficialResultsError('revision.stale');
        const updated = await this.templates.setState(client, actor, current, {
          archivedAt: new Date(),
        });
        await this.commands.audit(
          client,
          actor,
          'templates.archive',
          'result_template',
          id,
          { reason: input.reason, revision: updated.revision },
        );
        return presentResultTemplate(updated);
      },
    );
  }

  presets(surface: Surface, query: ResultListQuery) {
    return this.read(surface, (_client, actor) => {
      const binding = `${actor.schoolId}:${actor.actorId}`;
      const { limit, after } = readResultCursor(
        query,
        binding,
        'field-presets',
      );
      const entries = moazezStarterDefinition()
        .fields.filter((item) => item.editRule === 'INHERIT_SHEET')
        .sort((left, right) => left.id.localeCompare(right.id))
        .filter((item) => !after || item.id > after)
        .slice(0, limit + 1)
        .map(({ id, code, label, kind, constraints, allowedStates }) => ({
          presetId: id,
          code,
          label,
          kind,
          constraints,
          allowedStates,
          ownership: 'PLATFORM',
        }));
      return Promise.resolve(
        presentResultPage(
          entries,
          limit,
          ({ presetId }) => presetId,
          binding,
          'field-presets',
        ),
      );
    });
  }

  private read<T>(
    surface: Surface,
    execute: (
      client: Prisma.TransactionClient,
      actor: ResultActor,
    ) => Promise<T>,
  ) {
    const actor = requireResultActor(surface);
    return this.commands.transaction(async (client) => {
      const access = await this.authorization.permissions(client, actor);
      this.authorization.requirePermission(
        access,
        'official_results.templates.view',
      );
      return execute(client, actor);
    });
  }

  private write<T extends Prisma.InputJsonObject>(
    operation: string,
    input: object,
    key: string | undefined,
    execute: (
      client: Prisma.TransactionClient,
      actor: ResultActor,
    ) => Promise<T>,
  ) {
    const actor = requireResultActor('SCHOOL');
    return this.commands.transaction(async (client) => {
      const access = await this.authorization.permissions(client, actor, {
        write: true,
        policyChange: true,
      });
      this.authorization.requirePermission(
        access,
        'official_results.templates.manage',
      );
      return this.commands.idempotent(
        client,
        actor,
        operation,
        key,
        input,
        () => execute(client, actor),
      );
    });
  }
}
