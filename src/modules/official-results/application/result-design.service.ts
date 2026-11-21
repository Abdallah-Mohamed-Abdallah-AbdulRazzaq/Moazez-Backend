import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod/v4';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import { starterVersionId } from '../domain/moazez-starter';
import { OfficialResultsError } from '../domain/official-results.error';
import { resultContentDigest } from '../domain/result-content-digest';
import { fieldMappingSchema } from '../domain/result-mapping';
import {
  normalizeResultDefinition,
  type ResultDefinition,
} from '../domain/result-definition';
import { ResultAuthorizationRepository } from '../infrastructure/repositories/result-authorization.repository';
import { ResultCommandRepository } from '../infrastructure/repositories/result-command.repository';
import {
  ResultDesignRepository,
  type DraftFieldMapping,
} from '../infrastructure/repositories/result-design.repository';
import { ResultPreviewRepository } from '../infrastructure/repositories/result-preview.repository';
import { ResultReleaseRepository } from '../infrastructure/repositories/result-release.repository';
import { ResultTemplateRepository } from '../infrastructure/repositories/result-template.repository';
import { requireResultActor } from './result-actor';

type Surface = 'SCHOOL' | 'TEACHER';

interface DraftExpectation {
  expectedDefinitionVersionId: string;
  expectedSheetRevision: number;
}

interface AdoptionInput extends DraftExpectation {
  targetDefinitionVersionId: string;
  fieldMapping: DraftFieldMapping[];
}

interface DesignInput extends DraftExpectation {
  sheetId: string;
  definition: unknown;
  reason: string;
  originTemplateVersionId?: string;
}

interface DesignDecision {
  definitionVersionId: string;
  contentDigest: string;
  decision: 'APPROVE' | 'RETURN';
  comment?: string;
}

const adoptionBinding = z.strictObject({
  expectedDefinitionVersionId: z.uuid(),
  expectedSheetRevision: z.number().int(),
  targetDefinitionVersionId: z.uuid(),
  fieldMapping: z.array(fieldMappingSchema).max(300),
  policyVersionId: z.uuid().nullable(),
  fingerprint: z.string(),
});

@Injectable()
export class ResultDesignService {
  constructor(
    private readonly commands: ResultCommandRepository,
    private readonly authorization: ResultAuthorizationRepository,
    private readonly designs: ResultDesignRepository,
    private readonly previews: ResultPreviewRepository,
    private readonly templates: ResultTemplateRepository,
    private readonly releases: ResultReleaseRepository,
  ) {}

  create(surface: Surface, input: DesignInput, key?: string) {
    return this.withSheet(
      surface,
      input.sheetId,
      false,
      async (client, actor, sheet, context) => {
        return this.commands.idempotent(
          client,
          actor,
          'designs.create',
          key,
          input,
          async () => {
            this.expectDraft(sheet, input);
            const { definition, identityMap } = normalizeResultDefinition(
              input.definition,
              sheet.draft,
              true,
            );
            if (
              definition.groupKind !== sheet.group.kind ||
              definition.fields.length >
                context.settings.importLimits.maxTotalFields ||
              definition.fields.filter((field) => field.kind !== 'CALCULATED')
                .length > context.settings.importLimits.maxManualFields
            ) {
              throw new OfficialResultsError('schema.invalid');
            }
            if (surface === 'TEACHER')
              this.assertTeacherProtection(
                definition,
                sheet.draft,
                sheet.accepted,
              );
            if (
              surface === 'TEACHER' &&
              input.originTemplateVersionId &&
              input.originTemplateVersionId !== starterVersionId
            ) {
              const visible = await this.templates.teacherVisibleVersions(
                client,
                actor,
              );
              if (!visible.includes(input.originTemplateVersionId))
                throw new NotFoundDomainException();
            }

            const result = await this.designs.create(
              client,
              actor,
              sheet.id,
              definition,
              input.reason,
              input.originTemplateVersionId,
            );
            await this.commands.audit(
              client,
              actor,
              'designs.create',
              'result_design_candidate',
              result.candidateId,
              {
                sheetId: sheet.id,
                definitionVersionId: result.definitionVersionId,
                contentDigest: result.contentDigest,
                reason: input.reason,
                policyVersionId: context.policyVersionId,
              },
            );
            return {
              ...result,
              identityMap,
              sheetRevision: sheet.sheetRevision + 1,
            };
          },
        );
      },
    );
  }

  preview(surface: Surface, id: string, input: AdoptionInput) {
    return this.withSheet(
      surface,
      id,
      false,
      async (client, actor, sheet, context) => {
        this.expectDraft(sheet, input);
        const plan = await this.designs.planAdoption(
          client,
          actor,
          sheet,
          input.targetDefinitionVersionId,
          input.fieldMapping,
          surface === 'SCHOOL' &&
            context.access.permissions.has('official_results.designs.approve'),
        );
        return {
          ...(await this.previews.create(
            client,
            actor,
            'DEFINITION_ADOPTION',
            id,
            {
              ...input,
              policyVersionId: context.policyVersionId,
              fingerprint: plan.fingerprint,
            },
          )),
          impact: plan.impact,
          impacts: [
            {
              kind: 'DEFINITION_ADOPTION' as const,
              resourceId: id,
              before: {
                definitionVersionId: sheet.draftDefinitionVersionId,
                sheetRevision: sheet.sheetRevision,
              },
              after: {
                definitionVersionId: input.targetDefinitionVersionId,
                sheetRevision: sheet.sheetRevision + 1,
              },
            },
          ],
          blockers: plan.impact.blockers,
        };
      },
    );
  }

  adopt(
    surface: Surface,
    id: string,
    input: {
      previewId: string;
      previewDigest: string;
      expectedSheetRevision: number;
    },
    key?: string,
  ) {
    return this.withSheet(
      surface,
      id,
      false,
      async (client, actor, sheet, context) => {
        return this.commands.idempotent(
          client,
          actor,
          'designs.adopt',
          key,
          { id, ...input },
          async () => {
            const binding = adoptionBinding.parse(
              await this.previews.load(
                client,
                actor,
                'DEFINITION_ADOPTION',
                id,
                input.previewId,
                input.previewDigest,
              ),
            );
            if (
              input.expectedSheetRevision !== binding.expectedSheetRevision ||
              context.policyVersionId !== binding.policyVersionId
            )
              throw new OfficialResultsError('preview.stale');
            this.expectDraft(sheet, binding);
            const plan = await this.designs.planAdoption(
              client,
              actor,
              sheet,
              binding.targetDefinitionVersionId,
              binding.fieldMapping,
              surface === 'SCHOOL' &&
                context.access.permissions.has(
                  'official_results.designs.approve',
                ),
            );
            if (plan.fingerprint !== binding.fingerprint)
              throw new OfficialResultsError('preview.stale');
            const adopted = await this.designs.adopt(
              client,
              actor,
              sheet,
              binding.targetDefinitionVersionId,
              plan,
            );
            await this.releases.invalidateSheet(client, actor.schoolId, [id]);
            await this.commands.audit(
              client,
              actor,
              'designs.adopt',
              'result_sheet',
              id,
              {
                priorDefinitionVersionId: sheet.draftDefinitionVersionId,
                definitionVersionId: binding.targetDefinitionVersionId,
                affectedValues: plan.impact.affectedValues,
              },
            );
            return adopted;
          },
        );
      },
    );
  }

  decide(id: string, input: DesignDecision, key?: string) {
    const actor = requireResultActor('SCHOOL');
    return this.commands.transaction(async (client) => {
      const access = await this.authorization.permissions(client, actor, {
        write: true,
      });
      this.authorization.requirePermission(
        access,
        'official_results.designs.approve',
      );
      const candidate = await this.designs.candidate(
        client,
        actor.schoolId,
        id,
      );
      const current = await this.designs.sheet(
        client,
        actor.schoolId,
        candidate.sheetId,
        false,
      );
      const context = await this.authorization.authorizedTarget(
        client,
        access,
        current,
        'DESIGN',
        {
          write: true,
          review: true,
        },
      );
      await this.designs.sheet(client, actor.schoolId, candidate.sheetId, true);
      return this.commands.idempotent(
        client,
        actor,
        'designs.decide',
        key,
        { id, ...input },
        async () => {
          if (
            (input.decision === 'RETURN' && !input.comment) ||
            (context.settings.requireDistinctApprover &&
              candidate.authorId === actor.actorId)
          ) {
            throw new OfficialResultsError('review.required');
          }
          const result = await this.designs.decide(client, actor, id, input);
          await this.commands.audit(
            client,
            actor,
            'designs.decide',
            'result_design_candidate',
            id,
            {
              decision: input.decision,
              definitionVersionId: input.definitionVersionId,
              contentDigest: input.contentDigest,
              policyVersionId: context.policyVersionId,
              ...(input.comment ? { comment: input.comment } : {}),
            },
          );
          return result;
        },
      );
    });
  }

  private withSheet<T>(
    surface: Surface,
    id: string,
    review: boolean,
    act: (
      client: Prisma.TransactionClient,
      actor: ReturnType<typeof requireResultActor>,
      sheet: Awaited<ReturnType<ResultDesignRepository['sheet']>>,
      context: Awaited<
        ReturnType<ResultAuthorizationRepository['authorizedTarget']>
      > & {
        access: Awaited<
          ReturnType<ResultAuthorizationRepository['permissions']>
        >;
      },
    ) => Promise<T>,
  ) {
    const actor = requireResultActor(surface);
    return this.commands.transaction(async (client) => {
      const access = await this.authorization.permissions(client, actor, {
        write: true,
      });
      this.authorization.requirePermission(
        access,
        'official_results.designs.manage',
      );
      const initial = await this.designs.sheet(
        client,
        actor.schoolId,
        id,
        false,
      );
      const context = await this.authorization.authorizedTarget(
        client,
        access,
        initial,
        'DESIGN',
        { write: true, review },
      );
      const sheet = await this.designs.sheet(client, actor.schoolId, id, true);
      return act(client, actor, sheet, { ...context, access });
    });
  }

  private expectDraft(
    sheet: { draftDefinitionVersionId: string | null; sheetRevision: number },
    expected: DraftExpectation,
  ) {
    if (
      sheet.draftDefinitionVersionId !== expected.expectedDefinitionVersionId
    ) {
      throw new OfficialResultsError('schema.stale');
    }
    if (sheet.sheetRevision !== expected.expectedSheetRevision)
      throw new OfficialResultsError('revision.stale');
  }

  private assertTeacherProtection(
    definition: ResultDefinition,
    draft: ResultDefinition | null,
    accepted: ResultDefinition | null,
  ) {
    const next = new Map(definition.fields.map((field) => [field.id, field]));
    const trusted = new Map(
      accepted?.fields.map((field) => [field.id, field]) ?? [],
    );
    const baseline = new Map(
      draft?.fields.map((field) => [field.id, field]) ?? [],
    );
    const restricted = new Set<string>();
    for (const prior of [...trusted.values(), ...baseline.values()]) {
      const field = next.get(prior.id);
      if (
        prior.readRule !== 'INHERIT_SHEET' ||
        prior.editRule === 'SCHOOL_ONLY' ||
        prior.editRule === 'EXPLICIT_GRANT'
      ) {
        restricted.add(prior.id);
        const old = baseline.get(prior.id);
        if (
          old &&
          (!field || resultContentDigest(old) !== resultContentDigest(field))
        ) {
          throw new OfficialResultsError('schema.protected');
        }
      }
      if (
        field &&
        field.audiences.some((audience) => !prior.audiences.includes(audience))
      ) {
        throw new OfficialResultsError('schema.protected');
      }
    }
    const tainted = new Set(restricted);
    let changed = true;
    while (changed) {
      changed = false;
      for (const field of definition.fields) {
        if (
          !tainted.has(field.id) &&
          field.formula?.operands.some((operand) =>
            tainted.has(operand.fieldId),
          )
        ) {
          tainted.add(field.id);
          changed = true;
          const old = trusted.get(field.id);
          if (!old || resultContentDigest(old) !== resultContentDigest(field)) {
            throw new OfficialResultsError('schema.protected');
          }
        }
      }
    }
    for (const unit of definition.releaseUnits) {
      const approved =
        accepted?.releaseUnits.find((prior) => prior.id === unit.id)
          ?.derivedDisclosure ?? [];
      if (
        unit.derivedDisclosure.some(
          (rule) =>
            !approved.some(
              (prior) =>
                resultContentDigest(prior) === resultContentDigest(rule),
            ),
        )
      )
        throw new OfficialResultsError('schema.protected');
    }
  }
}
