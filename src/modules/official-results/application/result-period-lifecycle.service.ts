import { Injectable } from '@nestjs/common';
import type { Prisma, ResultReportingPeriodStatus } from '@prisma/client';
import { z } from 'zod/v4';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import { OfficialResultsError } from '../domain/official-results.error';
import { resultContentDigest } from '../domain/result-content-digest';
import { ResultAuthorizationRepository } from '../infrastructure/repositories/result-authorization.repository';
import { ResultCommandRepository } from '../infrastructure/repositories/result-command.repository';
import { ResultPreviewRepository } from '../infrastructure/repositories/result-preview.repository';
import { requireResultActor } from './result-actor';
import { presentResultPeriod } from './result-catalog.service';

const targetStatus = z.enum(['OPEN', 'ENTRY_CLOSED']);
export const reasonedPeriodCommand = z.strictObject({
  expectedRevision: z.number().int().positive(),
  reason: z.string().trim().min(1).max(2_000),
});
export const periodReopenPreview = reasonedPeriodCommand.extend({
  targetStatus,
});
export const reopenPeriodCommand = reasonedPeriodCommand
  .extend({
    targetStatus: targetStatus.optional(),
    previewId: z.uuid().optional(),
    previewDigest: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .optional(),
  })
  .refine((input) => Boolean(input.previewId) === Boolean(input.previewDigest));
export const revokeResultAccess = reasonedPeriodCommand.pick({ reason: true });
export type ReasonedPeriodInput = z.infer<typeof reasonedPeriodCommand>;
export type PeriodPreviewInput = z.infer<typeof periodReopenPreview>;
export type PeriodReopenInput = z.infer<typeof reopenPeriodCommand>;
export type RevokeResultAccessInput = z.infer<typeof revokeResultAccess>;

async function loadPeriod(
  client: Prisma.TransactionClient,
  schoolId: string,
  id: string,
  write: boolean,
) {
  if (write)
    await client.$queryRaw`
    SELECT id FROM result_reporting_periods
    WHERE school_id = ${schoolId}::uuid AND id = ${id}::uuid FOR UPDATE
  `;
  const current = await client.resultReportingPeriod.findFirst({
    where: { schoolId, id, academicYear: { deletedAt: null } },
  });
  if (!current) throw new NotFoundDomainException();
  return current;
}

async function periodImpact(
  client: Prisma.TransactionClient,
  schoolId: string,
  periodId: string,
) {
  const [row] = await client.$queryRaw<
    {
      sheets: number;
      eligibleSlots: number;
      publishedSlots: number;
      missingRequiredCells: number;
      pendingReviews: number;
      pendingImports: number;
      sheetEvidence: string | null;
      lastPublication: string | null;
    }[]
  >`
    WITH sheets AS (
      SELECT id, sheet_revision, data_generation, roster_generation, draft_definition_version_id
      FROM result_sheets WHERE school_id = ${schoolId}::uuid AND reporting_period_id = ${periodId}::uuid
    ), eligible AS (
      SELECT id, sheet_id FROM result_slots
      WHERE school_id = ${schoolId}::uuid AND reporting_period_id = ${periodId}::uuid
        AND roster_state = 'ELIGIBLE' AND NOT group_exempt
    ), releases AS (
      SELECT DISTINCT ON (cr.slot_id) cr.slot_id, cr.publication_id
      FROM result_current_releases cr JOIN eligible e ON cr.slot_id = e.id
      WHERE cr.school_id = ${schoolId}::uuid ORDER BY cr.slot_id, cr.publication_id DESC
    )
    SELECT (SELECT count(*)::int FROM sheets) AS "sheets",
      (SELECT count(*)::int FROM eligible) AS "eligibleSlots",
      (SELECT count(*)::int FROM releases) AS "publishedSlots",
      (SELECT count(*)::int FROM eligible e JOIN sheets s ON s.id=e.sheet_id
        JOIN result_field_definitions f ON f.definition_version_id=s.draft_definition_version_id
        LEFT JOIN result_cells c ON c.school_id=${schoolId}::uuid AND c.slot_id=e.id AND c.field_id=f.field_id
        WHERE f.school_id=${schoolId}::uuid AND f.required AND f.kind <> 'CALCULATED'
          AND (c.id IS NULL OR c.status = 'MISSING')) AS "missingRequiredCells",
      (SELECT count(*)::int FROM result_release_candidate_states cs
        JOIN result_release_candidates c ON c.id=cs.candidate_id JOIN sheets s ON s.id=c.sheet_id
        WHERE cs.school_id=${schoolId}::uuid AND cs.status IN ('SUBMITTED','APPROVED','READY_FOR_DIRECT')) AS "pendingReviews",
      (SELECT count(*)::int FROM result_import_batches b JOIN result_exports x ON x.id=b.export_id
        WHERE b.school_id=${schoolId}::uuid AND x.reporting_period_id=${periodId}::uuid
          AND b.status IN ('UPLOADED','VALIDATING','READY_TO_CONFIRM','APPLYING')) AS "pendingImports",
      (SELECT md5(string_agg(id::text || ':' || sheet_revision || ':' || data_generation || ':' || roster_generation, ',' ORDER BY id)) FROM sheets) AS "sheetEvidence",
      (SELECT md5(string_agg(slot_id::text || ':' || publication_id::text, ',' ORDER BY slot_id)) FROM releases) AS "lastPublication"
  `;
  const { sheetEvidence, lastPublication, ...summary } = row;
  return { summary, evidence: { sheetEvidence, lastPublication } };
}

@Injectable()
export class ResultPeriodLifecycleService {
  constructor(
    private readonly commands: ResultCommandRepository,
    private readonly auth: ResultAuthorizationRepository,
    private readonly previews: ResultPreviewRepository,
  ) {}

  revokeWindow(
    periodId: string,
    windowId: string,
    input: RevokeResultAccessInput,
    key?: string,
  ) {
    const actor = requireResultActor('SCHOOL');
    return this.commands.transaction(async (client) => {
      const access = await this.auth.permissions(client, actor, {
        write: true,
      });
      this.auth.requirePermission(access, 'official_results.archives.manage');
      return this.commands.idempotent(
        client,
        actor,
        'periods.revoke_window',
        key,
        { periodId, windowId, input },
        async () => {
          await loadPeriod(client, actor.schoolId, periodId, true);
          const revokedAt = new Date();
          const row = await client.resultCorrectionWindow.updateMany({
            where: {
              id: windowId,
              reportingPeriodId: periodId,
              schoolId: actor.schoolId,
              revokedAt: null,
            },
            data: { revokedAt },
          });
          if (!row.count) throw new NotFoundDomainException();
          const response = { id: windowId, revokedAt: revokedAt.toISOString() };
          await this.commands.audit(
            client,
            actor,
            'periods.revoke_window',
            'ResultCorrectionWindow',
            windowId,
            { ...response, periodId, reason: input.reason },
          );
          return response;
        },
      );
    });
  }

  revokeEntitlement(id: string, input: RevokeResultAccessInput, key?: string) {
    const actor = requireResultActor('SCHOOL');
    return this.commands.transaction(async (client) => {
      const access = await this.auth.permissions(client, actor, {
        write: true,
      });
      this.auth.requirePermission(access, 'official_results.archives.manage');
      return this.commands.idempotent(
        client,
        actor,
        'archives.revoke_entitlement',
        key,
        { id, input },
        async () => {
          const revokedAt = new Date();
          const row = await client.resultReadEntitlement.updateMany({
            where: { id, schoolId: actor.schoolId, revokedAt: null },
            data: {
              revokedAt,
              revokedById: actor.actorId,
              revokeReason: input.reason,
            },
          });
          if (!row.count) throw new NotFoundDomainException();
          const response = { id, revokedAt: revokedAt.toISOString() };
          await this.commands.audit(
            client,
            actor,
            'archives.revoke_entitlement',
            'ResultReadEntitlement',
            id,
            { ...response, reason: input.reason },
          );
          return response;
        },
      );
    });
  }

  preview(id: string, input: PeriodPreviewInput) {
    const actor = requireResultActor('SCHOOL');
    return this.commands.readSnapshot(async (client) => {
      const access = await this.auth.permissions(client, actor);
      this.auth.requirePermission(access, 'official_results.periods.manage');
      this.auth.requirePermission(access, 'official_results.archives.manage');
      const period = await loadPeriod(client, actor.schoolId, id, false);
      if (period.revision !== input.expectedRevision)
        throw new OfficialResultsError('revision.stale');
      if (period.status !== 'ARCHIVED')
        throw new OfficialResultsError('period.transition_invalid');
      const plan = await periodImpact(client, actor.schoolId, id);
      const preview = await this.previews.create(
        client,
        actor,
        'PERIOD_REOPEN',
        id,
        {
          input,
          fingerprint: resultContentDigest(plan),
        },
      );
      return {
        ...preview,
        blockers: [],
        impacts: [
          {
            kind: 'PERIOD_REOPEN' as const,
            resourceId: id,
            before: { status: 'ARCHIVED' as const, revision: period.revision },
            after: {
              status: input.targetStatus,
              revision: period.revision + 1,
            },
          },
        ],
        summary: plan.summary,
        capabilities: {
          canEnter: input.targetStatus === 'OPEN',
          canReviewExisting: true,
        },
      };
    });
  }

  move(
    action: 'close' | 'archive' | 'reopen',
    id: string,
    input: PeriodReopenInput,
    key?: string,
  ) {
    const actor = requireResultActor('SCHOOL');
    return this.commands.transaction(async (client) => {
      const access = await this.auth.permissions(client, actor, {
        write: true,
      });
      const permission =
        action === 'archive' ? 'archives.manage' : 'periods.manage';
      this.auth.requirePermission(access, 'official_results.' + permission);
      return this.commands.idempotent(
        client,
        actor,
        'periods.' + action,
        key,
        { id, input },
        async () => {
          const current = await loadPeriod(client, actor.schoolId, id, true);
          if (current.revision !== input.expectedRevision)
            throw new OfficialResultsError('revision.stale');
          const requested: ResultReportingPeriodStatus =
            action === 'close'
              ? 'ENTRY_CLOSED'
              : action === 'archive'
                ? 'ARCHIVED'
                : (input.targetStatus ?? 'OPEN');
          const before = current.status;
          if (
            (action === 'close' && before !== 'OPEN') ||
            (action === 'archive' && before !== 'ENTRY_CLOSED') ||
            (action === 'reopen' && (before === 'OPEN' || before === requested))
          )
            throw new OfficialResultsError('period.transition_invalid');
          const plan = await periodImpact(client, actor.schoolId, id);
          if (action === 'reopen' && before === 'ARCHIVED') {
            this.auth.requirePermission(
              access,
              'official_results.archives.manage',
            );
            if (!input.previewDigest || !input.previewId || !input.targetStatus)
              throw new OfficialResultsError('preview.stale');
            const staged = await this.previews.load(
              client,
              actor,
              'PERIOD_REOPEN',
              id,
              input.previewId,
              input.previewDigest,
            );
            const binding = staged as {
              input: PeriodPreviewInput;
              fingerprint: string;
            };
            if (
              binding.fingerprint !== resultContentDigest(plan) ||
              resultContentDigest(binding.input) !==
                resultContentDigest({
                  expectedRevision: input.expectedRevision,
                  reason: input.reason,
                  targetStatus: input.targetStatus,
                })
            )
              throw new OfficialResultsError('preview.stale');
          }
          const updated = await client.resultReportingPeriod.updateMany({
            where: {
              schoolId: actor.schoolId,
              id,
              revision: current.revision,
              status: before,
            },
            data: { status: requested, revision: { increment: 1 } },
          });
          if (!updated.count) throw new OfficialResultsError('revision.stale');
          if (requested === 'ARCHIVED' || action === 'reopen') {
            await client.resultCorrectionWindow.updateMany({
              where: {
                schoolId: actor.schoolId,
                reportingPeriodId: id,
                revokedAt: null,
              },
              data: { revokedAt: new Date() },
            });
          }
          await this.commands.audit(
            client,
            actor,
            'periods.' + action,
            'ResultReportingPeriod',
            id,
            {
              before,
              status: requested,
              reason: input.reason,
              revision: current.revision + 1,
              impact: plan.summary,
            },
          );
          return {
            ...presentResultPeriod({
              ...current,
              status: requested,
              revision: current.revision + 1,
            }),
            closureSummary: plan.summary,
          };
        },
      );
    });
  }
}
