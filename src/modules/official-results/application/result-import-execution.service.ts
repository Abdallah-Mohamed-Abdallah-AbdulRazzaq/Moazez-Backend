import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import type {
  Prisma,
  ResultImportExecution,
  ResultImportExecutionUnit,
} from '@prisma/client';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../common/exceptions/domain-exception';
import { BullmqService } from '../../../infrastructure/queue/bullmq.service';
import { OfficialResultsError } from '../domain/official-results.error';
import { resultContentDigest } from '../domain/result-content-digest';
import { resultsBulkQueue } from '../domain/result-export.contract';
import {
  importCommitBounds,
  resultApplyImportJob,
  type ApplyImportInput,
} from '../domain/result-import-execution.contract';
import type {
  ImportReviewBinding,
  ImportUnit,
} from '../domain/result-import.contract';
import {
  ResultAuthorizationRepository,
  type ResultPermissionCheck,
} from '../infrastructure/repositories/result-authorization.repository';
import { ResultCommandRepository } from '../infrastructure/repositories/result-command.repository';
import { requireResultActor, type ResultActor } from './result-actor';
import { ResultImportCommitGate } from './result-import-commit-gate';
import {
  ResultImportService,
  type ResultImportSurface,
} from './result-import.service';
import { ResultImportValidationService } from './result-import-validation.service';
import {
  presentResultPage,
  readResultCursor,
  type ResultListQuery,
} from './result-page';

const includeUnits = {
  units: { orderBy: { sheetId: 'asc' } },
} satisfies Prisma.ResultImportExecutionInclude;
type Execution = Prisma.ResultImportExecutionGetPayload<{
  include: typeof includeUnits;
}>;
type ExecutionKey = Pick<ResultImportExecution, 'id' | 'schoolId'>;

export function ensureImportExecution(
  queue: BullmqService,
  id: string,
  dispatchRevision: number,
) {
  return queue.ensureJobFromPersistedTruth(
    resultsBulkQueue,
    resultApplyImportJob,
    { id, dispatchRevision },
    {
      jobId: resultApplyImportJob + '-' + id + '-' + dispatchRevision,
      attempts: 4,
      backoff: { type: 'exponential', delay: 2_000 },
    },
  );
}

export function presentImportExecution(
  execution: Execution,
  actor: ResultActor,
) {
  const surface =
    actor.userType === 'TEACHER'
      ? 'teacher/official-results'
      : 'official-results';
  const state = execution.units.map((unit) => unit.status);
  return {
    operationId: execution.id,
    operationType: 'IMPORT_COMMIT' as const,
    status: execution.status,
    counts: {
      total: state.length,
      completed: state.filter((value) => value === 'APPLIED').length,
      skipped: state.filter(
        (value) => value === 'NO_CHANGES' || value === 'CANCELLED',
      ).length,
      failed: state.filter((value) => value === 'FAILED').length,
      pending: state.filter(
        (value) => value === 'QUEUED' || value === 'RUNNING',
      ).length,
    },
    createdAt: execution.createdAt.toISOString(),
    updatedAt: execution.updatedAt.toISOString(),
    itemsPath: '/api/v1/' + surface + '/operations/' + execution.id + '/items',
    ...(execution.terminationReason
      ? { terminationReason: execution.terminationReason }
      : {}),
  };
}

export function presentImportExecutionUnit(unit: ResultImportExecutionUnit) {
  return {
    unitId: unit.id,
    sheetId: unit.sheetId,
    status: unit.status,
    changedCells: unit.changedCells,
    canRetry: unit.retryable,
    ...(unit.failureCode ? { failureCode: unit.failureCode } : {}),
    ...(unit.committedAt
      ? { committedAt: unit.committedAt.toISOString() }
      : {}),
  };
}

function executionStatus(statuses: ResultImportExecutionUnit['status'][]) {
  if (statuses.some((status) => status === 'QUEUED' || status === 'RUNNING'))
    return 'APPLYING' as const;
  if (statuses.includes('APPLIED'))
    return statuses.includes('FAILED') || statuses.includes('CANCELLED')
      ? ('PARTIALLY_APPLIED' as const)
      : ('APPLIED' as const);
  return statuses.includes('CANCELLED')
    ? ('CANCELLED' as const)
    : ('FAILED' as const);
}

export async function synchronizeImportOutcome(
  client: Prisma.TransactionClient,
  key: ExecutionKey,
) {
  // Aggregate after individual grade transactions to avoid holding the operation lock while applying marks.
  const locked = await client.$queryRaw<{ id: string }[]>`
    SELECT id FROM result_import_executions
    WHERE id = ${key.id}::uuid AND school_id = ${key.schoolId}::uuid FOR UPDATE
  `;
  if (!locked.length) return;
  const current = await client.resultImportExecution.findFirstOrThrow({
    where: key,
    include: includeUnits,
  });
  if (current.status !== 'QUEUED' && current.status !== 'APPLYING') return;
  const status = executionStatus(current.units.map((unit) => unit.status));
  if (current.status === status) return;
  await client.resultImportExecution.updateMany({
    where: key,
    data: { status },
  });
  await client.resultImportBatch.updateMany({
    where: {
      id: current.batchId,
      schoolId: current.schoolId,
      revision: current.batchRevision,
      status: 'APPLYING',
    },
    data: { status },
  });
}

@Injectable()
export class ResultImportExecutionService {
  private readonly logger = new Logger(ResultImportExecutionService.name);

  constructor(
    private readonly auth: ResultAuthorizationRepository,
    private readonly commands: ResultCommandRepository,
    private readonly imports: ResultImportService,
    private readonly validation: ResultImportValidationService,
    private readonly gate: ResultImportCommitGate,
    private readonly queue: BullmqService,
  ) {}

  async confirm(
    surface: ResultImportSurface,
    batchId: string,
    input: ApplyImportInput<'confirm'>,
    key?: string,
  ) {
    const actor = requireResultActor(surface);
    const receipt = await this.commands.transaction(async (client) => {
      const access = await this.auth.permissions(client, actor, {
        write: true,
      });
      this.auth.requirePermission(access, 'official_results.entries.manage');
      const { batch, review } = await this.imports.requireBatch(
        client,
        access,
        batchId,
        'IMPORT',
      );
      return this.commands.idempotent(
        client,
        actor,
        'IMPORT_CONFIRM',
        key,
        { batchId, input },
        async () => {
          if (
            !review ||
            batch.status !== 'READY_TO_CONFIRM' ||
            batch.revision !== input.expectedBatchRevision ||
            review.expiresAt <= new Date() ||
            review.id !== input.previewId ||
            review.digest !== input.previewDigest
          )
            throw new OfficialResultsError('preview.stale');
          const binding = review.binding as unknown as ImportReviewBinding;
          const units = (review.units as unknown as ImportUnit[])
            .filter(
              (unit) =>
                unit.status !== 'EXCLUDED' &&
                binding.selectedSheetIds.includes(unit.context.sheetId),
            )
            .sort((a, b) => a.context.sheetId.localeCompare(b.context.sheetId));
          if (
            resultContentDigest(binding) !== review.digest ||
            resultContentDigest(binding.selectedSheetIds) !==
              resultContentDigest(input.selectedSheetIds) ||
            (input.clearReason !== undefined &&
              input.clearReason !== binding.clearReason) ||
            units.some((unit) => unit.status === 'BLOCKED') ||
            !units.some((unit) => unit.status === 'READY') ||
            units.length !== binding.selectedSheetIds.length
          )
            throw new OfficialResultsError('preview.stale');
          if (
            resultContentDigest(binding.requiredWarningIds) !==
            resultContentDigest(input.acknowledgedWarningIds)
          )
            throw new OfficialResultsError('import.acknowledgment_required');
          const claimed = await client.resultImportBatch.updateMany({
            where: {
              id: batch.id,
              schoolId: batch.schoolId,
              revision: batch.revision,
              status: 'READY_TO_CONFIRM',
            },
            data: { status: 'APPLYING' },
          });
          if (!claimed.count) throw new OfficialResultsError('preview.stale');
          for (const unit of units)
            if (unit.status === 'READY')
              await this.gate.lockAndVerify(client, access, unit);
          if (batch.expiresAt <= new Date() || review.expiresAt <= new Date())
            throw new OfficialResultsError('import.export_expired');
          const operation = await client.resultImportExecution.create({
            data: {
              id: randomUUID(),
              schoolId: batch.schoolId,
              batchId: batch.id,
              batchRevision: batch.revision,
              reviewId: review.id,
            },
            select: { id: true },
          });
          await client.resultImportExecutionUnit.createMany({
            data: units.map((unit) => ({
              id: randomUUID(),
              schoolId: batch.schoolId,
              executionId: operation.id,
              sheetId: unit.context.sheetId,
              status: unit.status === 'READY' ? 'QUEUED' : 'NO_CHANGES',
            })),
          });
          await this.commands.audit(
            client,
            actor,
            'imports.confirm',
            'ResultImportExecution',
            operation.id,
            {
              batchId,
              previewId: review.id,
              previewDigest: review.digest,
              sheets: units.length,
            },
          );
          return { operationId: operation.id };
        },
      );
    }, importCommitBounds);
    const current = await this.commands.readSnapshot(async (client) =>
      this.findForActor(
        client,
        await this.auth.permissions(client, actor),
        receipt.operationId,
        'IMPORT',
      ),
    );
    if (current.status === 'QUEUED' || current.status === 'APPLYING')
      await this.enqueue(current.id, current.dispatchRevision);
    return presentImportExecution(current, actor);
  }

  async cancel(
    surface: ResultImportSurface,
    id: string,
    input: ApplyImportInput<'cancel'>,
    key?: string,
  ) {
    const actor = requireResultActor(surface);
    await this.commands.transaction(async (client) => {
      const access = await this.auth.permissions(client, actor, {
        write: true,
      });
      const { batch } = await this.imports.requireBatch(
        client,
        access,
        id,
        'IMPORT',
      );
      await this.commands.idempotent(
        client,
        actor,
        'IMPORT_CANCEL',
        key,
        { id, input },
        async () => {
          if (batch.revision !== input.expectedBatchRevision)
            throw new OfficialResultsError('revision.stale');
          const execution = await this.lockExecution(
            client,
            batch.schoolId,
            batch.id,
            batch.revision,
          );
          if (batch.status !== 'APPLYING' || !execution)
            throw new OfficialResultsError('import.no_cancellable_units');
          const dropped = await client.resultImportExecutionUnit.updateMany({
            where: {
              executionId: execution.id,
              schoolId: batch.schoolId,
              status: 'QUEUED',
            },
            data: { status: 'CANCELLED', retryable: false, failureCode: null },
          });
          if (!dropped.count)
            throw new OfficialResultsError('import.no_cancellable_units');
          const slot = { id: execution.id, schoolId: batch.schoolId };
          await client.resultImportExecution.updateMany({
            where: slot,
            data: {
              terminationReason: 'CANCELLED',
              cancellationNote: input.reason,
            },
          });
          await synchronizeImportOutcome(client, slot);
          await this.commands.audit(
            client,
            actor,
            'imports.cancel',
            'ResultImportExecution',
            execution.id,
            {
              batchId: batch.id,
              cancelledUnits: dropped.count,
              reason: input.reason,
            },
          );
          return { batchId: batch.id };
        },
      );
    });
    return this.imports.detail(surface, id, 'IMPORT');
  }

  async retry(
    surface: ResultImportSurface,
    id: string,
    input: ApplyImportInput<'retry'>,
    key?: string,
  ) {
    const actor = requireResultActor(surface);
    const receipt = await this.commands.transaction(async (client) => {
      const access = await this.auth.permissions(client, actor, {
        write: true,
      });
      this.auth.requirePermission(access, 'official_results.entries.manage');
      const { batch, review } = await this.imports.requireBatch(
        client,
        access,
        id,
        'IMPORT',
      );
      return this.commands.idempotent(
        client,
        actor,
        'IMPORT_RETRY',
        key,
        { id, input },
        async () => {
          if (batch.revision !== input.expectedBatchRevision)
            throw new OfficialResultsError('revision.stale');
          if (
            !review ||
            batch.expiresAt <= new Date() ||
            review.expiresAt <= new Date()
          )
            throw new OfficialResultsError('preview.stale');
          const execution = await this.lockExecution(
            client,
            batch.schoolId,
            batch.id,
            batch.revision,
          );
          if (
            !execution ||
            (execution.status !== 'FAILED' &&
              execution.status !== 'PARTIALLY_APPLIED') ||
            execution.terminationReason
          )
            throw new OfficialResultsError('import.retry_unavailable');
          const retrying = execution.units.filter(
            (unit) => unit.status === 'FAILED' && unit.retryable,
          );
          if (!retrying.length)
            throw new OfficialResultsError('import.retry_unavailable');
          const reviewed = new Map(
            (review.units as unknown as ImportUnit[]).map((unit) => [
              unit.context.sheetId,
              unit,
            ]),
          );
          for (const unit of retrying)
            await this.gate.lockAndVerify(
              client,
              access,
              reviewed.get(unit.sheetId)!,
            );
          await client.resultImportExecutionUnit.updateMany({
            where: {
              executionId: execution.id,
              schoolId: batch.schoolId,
              id: { in: retrying.map((unit) => unit.id) },
              status: 'FAILED',
              retryable: true,
            },
            data: {
              status: 'QUEUED',
              failureCode: null,
              retryable: false,
              attempts: 0,
            },
          });
          await client.resultImportExecution.updateMany({
            where: { id: execution.id, schoolId: batch.schoolId },
            data: { status: 'APPLYING', dispatchRevision: { increment: 1 } },
          });
          await client.resultImportBatch.updateMany({
            where: {
              id: batch.id,
              schoolId: batch.schoolId,
              revision: batch.revision,
            },
            data: { status: 'APPLYING' },
          });
          await this.commands.audit(
            client,
            actor,
            'imports.retry',
            'ResultImportExecution',
            execution.id,
            {
              batchId: batch.id,
              units: retrying.length,
            },
          );
          return {
            operationId: execution.id,
            dispatchRevision: execution.dispatchRevision + 1,
          };
        },
      );
    });
    await this.enqueue(receipt.operationId, receipt.dispatchRevision);
    return this.imports.detail(surface, id, 'IMPORT');
  }

  async findForActor(
    client: Prisma.TransactionClient,
    access: ResultPermissionCheck,
    id: string,
    action: 'IMPORT' | 'VIEW',
  ) {
    const { actor } = access;
    const execution = await client.resultImportExecution.findFirst({
      where: {
        id,
        schoolId: actor.schoolId,
        batch: { creatorId: actor.actorId, schoolId: actor.schoolId },
      },
      include: {
        ...includeUnits,
        batch: true,
        review: { select: { binding: true } },
      },
    });
    if (!execution) throw new NotFoundDomainException();
    await this.validation.assertReviewScope(
      client,
      access,
      execution.batch,
      execution.review.binding as unknown as ImportReviewBinding,
      action,
    );
    return execution;
  }

  items(execution: Execution, actor: ResultActor, query: ResultListQuery) {
    const scope = actor.schoolId + ':' + actor.actorId + ':' + execution.id;
    const { limit, after } = readResultCursor(
      query,
      scope,
      'import-execution-units',
    );
    const rows = execution.units.map(presentImportExecutionUnit);
    const offset = after ? rows.findIndex((unit) => unit.unitId === after) : -1;
    if (after && offset < 0)
      throw new ValidationDomainException('Invalid result cursor');
    return presentResultPage(
      rows.slice(offset + 1, offset + limit + 2),
      limit,
      (row) => row.unitId,
      scope,
      'import-execution-units',
    );
  }

  private async lockExecution(
    client: Prisma.TransactionClient,
    schoolId: string,
    batchId: string,
    revision: number,
  ) {
    const rows = await client.$queryRaw<{ id: string }[]>`
      SELECT id FROM result_import_executions
      WHERE school_id = ${schoolId}::uuid AND batch_id = ${batchId}::uuid AND batch_revision = ${revision}
      FOR UPDATE
    `;
    const id = rows[0]?.id;
    return id
      ? client.resultImportExecution.findFirst({
          where: { id, schoolId },
          include: includeUnits,
        })
      : null;
  }

  private async enqueue(id: string, dispatchRevision: number) {
    try {
      await ensureImportExecution(this.queue, id, dispatchRevision);
    } catch {
      this.logger.warn({
        event: 'official_results.import.commit_enqueue_deferred',
        operationId: id,
        dispatchRevision,
      });
    }
  }
}
