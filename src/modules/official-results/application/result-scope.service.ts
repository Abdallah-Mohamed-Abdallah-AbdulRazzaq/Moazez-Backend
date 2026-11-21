import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod/v4';
import {
  DomainException,
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../common/exceptions/domain-exception';
import { OfficialResultsError } from '../domain/official-results.error';
import { resultContentDigest } from '../domain/result-content-digest';
import { academicSelector, resultIdList } from '../domain/result-scope';
import {
  resolveTemplateRule,
  templateScopeSelector,
} from '../domain/result-template-rules';
import { sheetDefinitionSeed } from '../domain/sheet-definition-seed';
import {
  ResultAuthorizationRepository,
  type ResultPermissionCheck,
} from '../infrastructure/repositories/result-authorization.repository';
import { ResultCommandRepository } from '../infrastructure/repositories/result-command.repository';
import { ResultFoundationRepository } from '../infrastructure/repositories/result-foundation.repository';
import {
  presentResultOperation,
  ResultOperationRepository,
  type MaterializationItem,
} from '../infrastructure/repositories/result-operation.repository';
import { ResultPreviewRepository } from '../infrastructure/repositories/result-preview.repository';
import { ResultRosterRepository } from '../infrastructure/repositories/result-roster.repository';
import {
  ResultTemplateScopeRepository,
  type TemplateAssignmentInput,
} from '../infrastructure/repositories/result-template-scope.repository';
import { requireResultActor } from './result-actor';
import type { FrozenResultDefinitionInput } from './result-foundation.types';
import {
  presentResultPage,
  readResultCursor,
  type ResultListQuery,
} from './result-page';

type Surface = 'SCHOOL' | 'TEACHER';
export const resultResolutionInput = z.strictObject({
  reportingPeriodId: z.uuid(),
  academicScope: academicSelector,
  groupIds: resultIdList,
  rosterAsOf: z.iso.datetime(),
});
type ResolveInput = z.infer<typeof resultResolutionInput>;

@Injectable()
export class ResultScopeService {
  constructor(
    private readonly commands: ResultCommandRepository,
    private readonly authorization: ResultAuthorizationRepository,
    private readonly scopes: ResultTemplateScopeRepository,
    private readonly roster: ResultRosterRepository,
    private readonly foundation: ResultFoundationRepository,
    private readonly previews: ResultPreviewRepository,
    private readonly operations: ResultOperationRepository,
  ) {}

  assign(
    input: {
      expectedScopeRevision: number;
      assignment: TemplateAssignmentInput;
    },
    key?: string,
  ) {
    const actor = requireResultActor('SCHOOL');
    return this.commands.transaction(async (client) => {
      const access = await this.authorization.permissions(client, actor, {
        write: true,
        policyChange: true,
      });
      this.authorization.requirePermission(
        access,
        'official_results.scopes.manage',
      );
      return this.commands.idempotent(
        client,
        actor,
        'scopes.assign',
        key,
        input,
        async () => {
          const assigned = await this.scopes.assign(
            client,
            actor,
            input.expectedScopeRevision,
            input.assignment,
          );
          await this.commands.audit(
            client,
            actor,
            'scopes.assign',
            'result_template_assignment',
            assigned.assignmentId,
            {
              scopeRevision: assigned.scopeRevision,
              templateVersionId: assigned.assignment.templateVersionId,
              enabled: assigned.assignment.enabled,
            },
          );
          return assigned;
        },
      );
    });
  }

  list(query: ResultListQuery) {
    const actor = requireResultActor('SCHOOL');
    return this.commands.transaction(async (client) => {
      const access = await this.authorization.permissions(client, actor);
      this.authorization.requirePermission(
        access,
        'official_results.templates.view',
      );
      const { limit, after } = readResultCursor(
        query,
        actor.schoolId,
        'scope-assignments',
      );
      if (after && !z.uuid().safeParse(after).success)
        throw new ValidationDomainException('Invalid assignment cursor');
      const rows = await this.scopes.list(client, actor.schoolId, limit, after);
      const result = rows.map((row) => ({
        assignmentId: row.id,
        revision: row.scopeRevision,
        scopeRevision: row.scopeRevision,
        assignment: {
          ...templateScopeSelector.parse(row.selector),
          templateVersionId: row.templateVersionId,
          baseTemplateVersionId: row.baseTemplateVersionId,
          mode: row.mode,
          enabled: row.enabled,
        },
      }));
      return presentResultPage(
        result,
        limit,
        ({ assignmentId }) => assignmentId,
        actor.schoolId,
        'scope-assignments',
      );
    });
  }

  resolve(surface: Surface, input: ResolveInput) {
    const actor = requireResultActor(surface);
    return this.commands.transaction(async (client) => {
      const access = await this.authorization.permissions(client, actor, {
        write: true,
      });
      this.authorization.requirePermission(
        access,
        'official_results.sheets.view',
      );
      const plan = await this.plan(client, access, input, false);
      const preview = await this.previews.create(
        client,
        actor,
        'SCOPE_RESOLUTION',
        null,
        {
          input,
          fingerprint: plan.fingerprint,
        },
      );
      return { ...preview, tuples: plan.tuples, conflicts: plan.conflicts };
    });
  }

  materialize(
    surface: Surface,
    input: { previewId: string; previewDigest: string },
    key?: string,
  ) {
    const actor = requireResultActor(surface);
    return this.commands.transaction(async (client) => {
      const access = await this.authorization.permissions(client, actor, {
        write: true,
      });
      this.authorization.requirePermission(
        access,
        'official_results.sheets.create',
      );
      return this.commands.idempotent(
        client,
        actor,
        'sheets.materialize',
        key,
        input,
        async () => {
          const binding = await this.previews.load(
            client,
            actor,
            'SCOPE_RESOLUTION',
            null,
            input.previewId,
            input.previewDigest,
          );
          const parsed = z
            .strictObject({
              input: resultResolutionInput,
              fingerprint: z.string(),
            })
            .parse(binding);
          const plan = await this.plan(client, access, parsed.input, true);
          if (plan.fingerprint !== parsed.fingerprint)
            throw new OfficialResultsError('preview.stale');
          if (plan.conflicts.length)
            throw new OfficialResultsError('scope.conflict', {
              conflicts: plan.conflicts,
            });
          const items: MaterializationItem[] = [];
          for (const [index, tuple] of plan.tuples.entries()) {
            const definition = plan.definitions[index];
            const result = await this.foundation.materializeInTransaction(
              client,
              {
                reportingPeriodId: tuple.reportingPeriodId,
                classroomId: tuple.classroomId,
                groupId: tuple.groupId,
                rosterAsOf: new Date(parsed.input.rosterAsOf),
                definition,
                acceptsDefinition: tuple.templateVersionId !== null,
              },
              resultContentDigest(definition),
              plan.rosterFingerprints[index],
            );
            items.push({
              sheetId: result.sheet.id,
              reportingPeriodId: tuple.reportingPeriodId,
              classroomId: tuple.classroomId,
              groupId: tuple.groupId,
              status: 'COMPLETED' as const,
              created: result.created,
            });
          }
          const operation = await this.operations.createMaterialization(
            client,
            actor,
            items,
          );
          const response = presentResultOperation(operation, actor);
          await this.commands.audit(
            client,
            actor,
            'sheets.materialize',
            'result_operation',
            operation.id,
            response.counts,
          );
          return response;
        },
      );
    });
  }

  operation(surface: Surface, id: string) {
    return this.withOperation(surface, id, (operation, actor) =>
      presentResultOperation(operation, actor),
    );
  }

  operationItems(surface: Surface, id: string, query: ResultListQuery) {
    return this.withOperation(surface, id, (_operation, actor, items) => {
      const binding = `${actor.schoolId}:${actor.actorId}:${id}`;
      const { limit, after } = readResultCursor(
        query,
        binding,
        'materialization-items',
      );
      if (after && !z.uuid().safeParse(after).success) {
        throw new ValidationDomainException('Invalid materialization cursor');
      }
      const rows = items
        .sort((a, b) => a.sheetId.localeCompare(b.sheetId))
        .filter((item) => !after || item.sheetId > after);
      return presentResultPage(
        rows,
        limit,
        (item) => item.sheetId,
        binding,
        'materialization-items',
      );
    });
  }

  private withOperation<T>(
    surface: Surface,
    id: string,
    present: (
      operation: Awaited<
        ReturnType<ResultOperationRepository['materialization']>
      >['operation'],
      actor: ReturnType<typeof requireResultActor>,
      items: Awaited<
        ReturnType<ResultOperationRepository['materialization']>
      >['items'],
    ) => T,
  ) {
    const actor = requireResultActor(surface);
    return this.commands.transaction(async (client) => {
      const access = await this.authorization.permissions(client, actor);
      this.authorization.requirePermission(
        access,
        'official_results.sheets.view',
      );
      const { operation, items } = await this.operations.materialization(
        client,
        actor,
        id,
      );
      for (const item of items)
        await this.authorization.authorizedTarget(client, access, item, 'VIEW');
      return present(operation, actor, items);
    });
  }

  private async plan(
    client: Prisma.TransactionClient,
    access: ResultPermissionCheck,
    input: ResolveInput,
    write: boolean,
  ) {
    const { actor } = access;
    const rosterDate = new Date(input.rosterAsOf);
    const [targets, resolver] = await Promise.all([
      this.scopes.targets(
        client,
        actor.schoolId,
        input.reportingPeriodId,
        input.academicScope,
        input.groupIds,
      ),
      this.scopes.resolvedRules(client, actor.schoolId),
    ]);
    const tuples: {
      reportingPeriodId: string;
      classroomId: string;
      groupId: string;
      rosterCount: number;
      existingSheetId: string | null;
      templateVersionId: string | null;
      sourceRuleIds: string[];
      policyVersionId: string | null;
      policyRevision: number;
      draftDefinitionVersionId: string | null;
    }[] = [];
    const conflicts: {
      reportingPeriodId: string;
      classroomId: string;
      groupId: string;
      code: string;
    }[] = [];
    const definitions: FrozenResultDefinitionInput[] = [];
    const rosterFingerprints: string[] = [];
    const authorizedGroups = new Set<string>();
    const authorizedScopes = new Set<string>();
    for (const target of targets) {
      const ids = {
        reportingPeriodId: target.period.id,
        classroomId: target.academic.CLASSROOM,
        groupId: target.groupId,
      };
      try {
        const context = await this.authorization.authorizedTarget(
          client,
          access,
          ids,
          write ? 'DESIGN' : 'VIEW',
          { write },
        );
        authorizedGroups.add(target.groupId);
        if (input.academicScope.level !== 'SCHOOL')
          authorizedScopes.add(target.academic[input.academicScope.level]);
        const existing = await this.scopes.existingSheet(
          client,
          actor.schoolId,
          ids,
        );
        const winner = existing
          ? null
          : resolveTemplateRule(resolver.rules, target, resolver.facts);
        const enrollments = await this.roster.findRoster(
          client,
          context,
          rosterDate,
        );
        tuples.push({
          ...ids,
          rosterCount: enrollments.length,
          existingSheetId: existing?.id ?? null,
          draftDefinitionVersionId: existing?.draftDefinitionVersionId ?? null,
          templateVersionId: winner?.versionId ?? null,
          sourceRuleIds: winner?.sourceRuleIds ?? [],
          policyVersionId: context.policyVersionId,
          policyRevision: context.policyRevision,
        });
        definitions.push(
          winner
            ? sheetDefinitionSeed(winner.definition, {
                templateVersionId: winner.versionId,
                sourceRuleIds: winner.sourceRuleIds,
              })
            : {
                label: { ar: 'كشف نتائج حر', en: 'Freeform results sheet' },
                configuration: { groupKind: context.group.kind },
                fields: [],
                releaseUnits: [],
              },
        );
        rosterFingerprints.push(JSON.stringify(enrollments));
      } catch (error) {
        if (
          error instanceof NotFoundDomainException &&
          actor.userType === 'TEACHER'
        )
          continue;
        if (
          !(error instanceof DomainException) ||
          ![
            'official_results.scope.conflict',
            'official_results.roster.ambiguous',
            'official_results.period.closed',
          ].includes(error.code)
        ) {
          throw error;
        }
        authorizedGroups.add(target.groupId);
        if (input.academicScope.level !== 'SCHOOL')
          authorizedScopes.add(target.academic[input.academicScope.level]);
        conflicts.push({ ...ids, code: error.code });
      }
    }
    if (
      input.groupIds.some((id) => !authorizedGroups.has(id)) ||
      (input.academicScope.level !== 'SCHOOL' &&
        input.academicScope.ids.some((id) => !authorizedScopes.has(id)))
    ) {
      throw new NotFoundDomainException();
    }
    return {
      tuples,
      conflicts,
      definitions,
      rosterFingerprints,
      fingerprint: resultContentDigest({
        tuples,
        conflicts,
        definitions,
        rosterFingerprints,
      }),
    };
  }
}
