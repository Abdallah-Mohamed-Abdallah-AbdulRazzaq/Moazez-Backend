import { createHash, randomUUID } from 'node:crypto';
import { Injectable, Logger, PayloadTooLargeException } from '@nestjs/common';
import {
  FileVisibility,
  Prisma,
  type ResultImportBatch,
  type ResultImportReview,
} from '@prisma/client';
import {
  DomainException,
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../common/exceptions/domain-exception';
import { BullmqService } from '../../../infrastructure/queue/bullmq.service';
import { StorageService } from '../../../infrastructure/storage/storage.service';
import type { UploadedMultipartFile } from '../../files/uploads/domain/uploaded-file';
import { OfficialResultsError } from '../domain/official-results.error';
import { resultsBulkQueue } from '../domain/result-export.contract';
import {
  blankImportSummary,
  resultValidateJob,
  validateImportOptions,
  type ImportCorrection,
  type ImportChange,
  type ImportFinding,
  type ImportInput,
  type ImportReviewBinding,
  type ImportRowSummary,
  type ImportSummary,
  type ImportUnit,
} from '../domain/result-import.contract';
import { platformResultLimits } from '../domain/result-policy';
import {
  ResultAuthorizationRepository,
  type ResultPermissionCheck,
} from '../infrastructure/repositories/result-authorization.repository';
import { ResultCommandRepository } from '../infrastructure/repositories/result-command.repository';
import { requireResultActor } from './result-actor';
import { ResultImportValidationService } from './result-import-validation.service';
import {
  presentResultPage,
  readResultCursor,
  type ResultListQuery,
} from './result-page';

export type ResultImportSurface = 'SCHOOL' | 'TEACHER';
type Direction = 'VIEW' | 'IMPORT';
type ReportPart = 'issues' | 'changes' | 'rows';
const day = 86_400_000;
const editable = [
  'CORRECTIONS_REQUIRED',
  'READY_TO_CONFIRM',
  'NO_CHANGES',
  'FAILED',
] as const;
const editableFilter = Array.from(editable);

type Batch = ResultImportBatch;
const outcomeSelection = {
  id: true,
  terminationReason: true,
  units: {
    select: {
      id: true,
      sheetId: true,
      status: true,
      changedCells: true,
      failureCode: true,
    },
  },
} satisfies Prisma.ResultImportExecutionSelect;
type Outcome = Prisma.ResultImportExecutionGetPayload<{
  select: typeof outcomeSelection;
}>;
type Review = Pick<
  ResultImportReview,
  'id' | 'revision' | 'digest' | 'binding' | 'summary' | 'units' | 'expiresAt'
>;

export function presentImportBatch(
  batch: Batch,
  review: Review | null,
  outcome: Outcome | null,
) {
  const expired =
    batch.expiresAt <= new Date() &&
    [
      'UPLOADED',
      'VALIDATING',
      'READY_TO_CONFIRM',
      'NO_CHANGES',
      'CORRECTIONS_REQUIRED',
    ].includes(batch.status);
  const status = expired ? 'EXPIRED' : batch.status;
  const binding = review?.binding as unknown as ImportReviewBinding | undefined;
  const units = (review?.units ?? []) as unknown as ImportUnit[];
  const canConfirm =
    status === 'READY_TO_CONFIRM' &&
    Boolean(review && review.expiresAt > new Date());
  const executed = new Map(outcome?.units.map((unit) => [unit.sheetId, unit]));
  return {
    batchId: batch.id,
    exportId: batch.exportId,
    batchRevision: batch.revision,
    sourceVersion: batch.sourceVersion,
    status,
    summary: review
      ? (review.summary as unknown as ImportSummary)
      : blankImportSummary(),
    canConfirm,
    ...(outcome ? { operationId: outcome.id } : {}),
    ...(outcome?.terminationReason
      ? { terminationReason: outcome.terminationReason }
      : {}),
    ...(batch.failureCode ? { failureCode: batch.failureCode } : {}),
    ...(review && binding
      ? {
          preview: {
            id: review.id,
            revision: review.revision,
            digest: review.digest,
            digestAlgorithm: 'SHA256_CANONICAL_JSON_V1' as const,
            binding,
          },
        }
      : {}),
    sheetUnits: units.map((unit) => {
      const state = executed.get(unit.context.sheetId);
      return {
        sheetId: unit.context.sheetId,
        changedCells: state?.changedCells ?? unit.changes.length,
        status: state?.status ?? unit.status,
        ...(state?.failureCode ? { failureCode: state.failureCode } : {}),
        canConfirm: canConfirm && unit.status === 'READY',
        observedDataGeneration: unit.context.snapshotDataGeneration,
        expectedSheetRevision: unit.context.sheetRevision,
      };
    }),
    createdAt: batch.createdAt.toISOString(),
    expiresAt: batch.expiresAt.toISOString(),
  };
}

export async function ensureImportValidation(
  queue: BullmqService,
  id: string,
  revision: number,
) {
  await queue.ensureJobFromPersistedTruth(
    resultsBulkQueue,
    resultValidateJob,
    { id, revision },
    {
      jobId: resultValidateJob + '-' + id + '-' + revision,
      attempts: 4,
      backoff: { type: 'exponential', delay: 2_000 },
    },
  );
}

const owning = (access: ResultPermissionCheck) => ({
  schoolId: access.actor.schoolId,
  creatorId: access.actor.actorId,
});
const reviewKey = (batch: Batch) => ({
  schoolId: batch.schoolId,
  batchId: batch.id,
  sourceVersion: batch.sourceVersion,
  revision: batch.revision,
});

@Injectable()
export class ResultImportService {
  private readonly logger = new Logger(ResultImportService.name);

  constructor(
    private readonly auth: ResultAuthorizationRepository,
    private readonly commands: ResultCommandRepository,
    private readonly validator: ResultImportValidationService,
    private readonly storage: StorageService,
    private readonly queue: BullmqService,
  ) {}

  async upload(
    surface: ResultImportSurface,
    input: ImportInput<'intake'>,
    file: UploadedMultipartFile | undefined,
    key?: string,
    id?: string,
  ) {
    const actor = requireResultActor(surface);
    const bytes = file?.buffer;
    if (!bytes?.length)
      throw new ValidationDomainException(
        'An Official Results file is required',
      );
    if (bytes.length > platformResultLimits.maxUploadBytes)
      throw new PayloadTooLargeException();
    if (Boolean(id) !== (input.expectedBatchRevision !== undefined))
      throw new ValidationDomainException(
        'Only a replacement requires expectedBatchRevision',
      );
    const checksum = createHash('sha256').update(bytes).digest('hex');
    const staged = await this.commands.transaction(async (client) => {
      const access = await this.auth.permissions(client, actor);
      const selected = await this.validator.assertExportScope(
        client,
        access,
        input.exportId,
        'IMPORT',
      );
      const parent = selected.row;
      if (parent.mode !== 'EDIT_DRAFT')
        throw new OfficialResultsError('import.readonly_export');
      if (parent.reuseUntil <= new Date())
        throw new OfficialResultsError('import.export_expired');
      if (parent.status !== 'READY') throw new NotFoundDomainException();
      if (bytes.length > selected.maxFileSize)
        throw new PayloadTooLargeException();

      return this.commands.idempotent(
        client,
        actor,
        id ? 'IMPORT_SOURCE_REPLACE' : 'IMPORT_SOURCE_UPLOAD',
        key,
        {
          id: id ?? null,
          input,
          checksum,
        },
        async () => {
          const now = new Date();
          const options = input.validateOptions ?? {};
          let batch: Batch;
          if (id) {
            const target = await this.requireBatch(
              client,
              access,
              id,
              'IMPORT',
            );
            if (target.batch.exportId !== input.exportId)
              throw new NotFoundDomainException();
            batch = await this.nextRevision(
              client,
              target.batch,
              input.expectedBatchRevision!,
              {
                sourceVersion: target.batch.sourceVersion + 1,
                options,
                corrections: [],
              },
            );
          } else {
            batch = await client.resultImportBatch.create({
              data: {
                schoolId: actor.schoolId,
                creatorId: actor.actorId,
                actorContext: actor,
                exportId: parent.id,
                expiresAt: parent.reuseUntil,
                options,
                corrections: [],
              },
            });
          }
          const sourceId = randomUUID();
          await client.resultImportSource.create({
            data: {
              id: sourceId,
              schoolId: batch.schoolId,
              batchId: batch.id,
              version: batch.sourceVersion,
              format: parent.format,
              options,
              sizeBytes: bytes.length,
              checksum,
              bucket: this.storage.resolveBucket(FileVisibility.PRIVATE),
              objectKey:
                'official-results/' +
                actor.schoolId +
                '/imports/' +
                batch.id +
                '/' +
                sourceId,
              expiresAt: new Date(now.getTime() + selected.retentionDays * day),
            },
          });
          await this.commands.audit(
            client,
            actor,
            'imports.stage',
            'ResultImportBatch',
            batch.id,
            {
              revision: batch.revision,
              sourceVersion: batch.sourceVersion,
              sizeBytes: bytes.length,
            },
          );
          return { batchId: batch.id, sourceId, revision: batch.revision };
        },
      );
    });

    const source = await this.commands.readSnapshot(async (client) => {
      const access = await this.auth.permissions(client, actor);
      const { batch } = await this.requireBatch(
        client,
        access,
        staged.batchId,
        'IMPORT',
      );
      return client.resultImportSource.findFirstOrThrow({
        where: {
          id: staged.sourceId,
          batchId: batch.id,
          schoolId: batch.schoolId,
        },
      });
    });
    if (
      !source.storedAt &&
      !source.deletedAt &&
      source.expiresAt > new Date()
    ) {
      await this.storage.saveObject({
        bucket: source.bucket,
        objectKey: source.objectKey,
        body: bytes,
        sizeBytes: bytes.length,
        contentType: 'application/octet-stream',
        metadata: { sha256: source.checksum },
      });
      await this.commands.transaction(async (client) => {
        const access = await this.auth.permissions(client, actor);
        await this.requireBatch(client, access, staged.batchId, 'IMPORT');
        await client.resultImportSource.updateMany({
          where: {
            id: source.id,
            schoolId: source.schoolId,
            storedAt: null,
            deletedAt: null,
          },
          data: { storedAt: new Date() },
        });
      });
    }
    await this.enqueue(staged.batchId, staged.revision);
    return this.detail(surface, staged.batchId, 'IMPORT');
  }

  async correct(
    surface: ResultImportSurface,
    id: string,
    input: ImportInput<'correct'>,
    key?: string,
  ) {
    return this.refresh(
      surface,
      id,
      input,
      'IMPORT_CORRECT',
      key,
      async (target, client) => {
        const current = await client.resultImportReview.findFirst({
          where: reviewKey(target),
          select: { rows: true, issues: true, units: true, binding: true },
        });
        if (!current) throw new OfficialResultsError('preview.stale');
        const rows = new Map(
          (current.rows as unknown as ImportRowSummary[]).map((row) => [
            row.rowRef,
            row,
          ]),
        );
        const visible = new Map(
          (current.binding as unknown as ImportReviewBinding).fields.map(
            (field) => [field.sheetId, new Set(field.fieldIds)],
          ),
        );
        const issues = current.issues as unknown as ImportFinding[];
        const observed = new Map(
          (current.units as unknown as ImportUnit[]).flatMap((unit) =>
            unit.changes.map(
              (change) =>
                [
                  change.rowRef + ':' + change.fieldId,
                  change.expectedCellVersion,
                ] as const,
            ),
          ),
        );
        for (const issue of issues)
          if (issue.comparison && issue.rowRef && issue.fieldId)
            observed.set(
              issue.rowRef + ':' + issue.fieldId,
              issue.comparison.currentVersion,
            );
        const prior = new Map(
          (target.corrections as unknown as ImportCorrection[]).map((item) => [
            item.rowRef + ':' + item.fieldId,
            item,
          ]),
        );
        for (const item of input.changes) {
          const row = rows.get(item.rowRef);
          const itemKey = item.rowRef + ':' + item.fieldId;
          if (!row?.sheetId || !visible.get(row.sheetId)?.has(item.fieldId))
            throw new NotFoundDomainException();
          const version = observed.get(itemKey);
          if (
            (item.expectedCellVersion !== undefined &&
              item.expectedCellVersion !== version) ||
            (issues.some(
              (issue) =>
                issue.rowRef === item.rowRef &&
                issue.fieldId === item.fieldId &&
                issue.comparison,
            ) &&
              item.expectedCellVersion === undefined)
          )
            throw new OfficialResultsError('preview.stale');
          prior.set(itemKey, item);
        }
        const options = validateImportOptions.parse(target.options);
        return {
          options: {
            ...options,
            ...(input.clearReason ? { clearReason: input.clearReason } : {}),
          },
          corrections: [...prior.values()],
        };
      },
    );
  }

  revalidate(
    surface: ResultImportSurface,
    id: string,
    input: ImportInput<'revalidate'>,
    key?: string,
  ) {
    return this.refresh(
      surface,
      id,
      input,
      'IMPORT_REVALIDATE',
      key,
      async (target, client) => {
        const options = validateImportOptions.parse(target.options);
        if (input.selectedSheetIds) {
          const reviewed = await client.resultImportReview.findFirst({
            where: reviewKey(target),
            select: { binding: true },
          });
          const binding = reviewed?.binding as unknown as
            | ImportReviewBinding
            | undefined;
          const allowed = new Set(
            binding?.fields.map((entry) => entry.sheetId) ?? [],
          );
          if (input.selectedSheetIds.some((sheetId) => !allowed.has(sheetId)))
            throw new NotFoundDomainException();
        }
        return {
          options: {
            ...options,
            ...(input.selectedSheetIds
              ? { selectedSheetIds: input.selectedSheetIds }
              : {}),
          },
        };
      },
    );
  }

  detail(surface: ResultImportSurface, id: string, action: Direction = 'VIEW') {
    const actor = requireResultActor(surface);
    return this.commands.readSnapshot(async (client) => {
      const access = await this.auth.permissions(client, actor);
      const target = await this.requireBatch(client, access, id, action);
      return presentImportBatch(target.batch, target.review, target.outcome);
    });
  }

  list(surface: ResultImportSurface, query: ResultListQuery) {
    const actor = requireResultActor(surface);
    return this.commands.readSnapshot(async (client) => {
      const access = await this.auth.permissions(client, actor);
      this.auth.requirePermission(access, 'official_results.imports.view');
      const scope = actor.schoolId + ':' + actor.actorId;
      const { limit, after } = readResultCursor(query, scope, 'imports');
      const visible: ReturnType<typeof presentImportBatch>[] = [];
      let cursor = after;
      while (visible.length <= limit) {
        const candidates = await client.resultImportBatch.findMany({
          where: {
            ...owning(access),
            ...(cursor ? { id: { gt: cursor } } : {}),
          },
          orderBy: { id: 'asc' },
          take: limit + 1,
        });
        for (const batch of candidates) {
          try {
            const { review, outcome } = await this.authorizeBatch(
              client,
              access,
              batch,
              'VIEW',
            );
            visible.push(presentImportBatch(batch, review, outcome));
            if (visible.length > limit) break;
          } catch (error) {
            if (
              !(error instanceof NotFoundDomainException) &&
              (!(error instanceof DomainException) ||
                error.code !== 'official_results.scope.subject_unavailable')
            )
              throw error;
          }
        }
        if (candidates.length <= limit) break;
        cursor = candidates[candidates.length - 1].id;
      }
      return presentResultPage(
        visible,
        limit,
        (row) => row.batchId,
        scope,
        'imports',
      );
    });
  }

  report(
    surface: ResultImportSurface,
    id: string,
    part: ReportPart,
    query: ResultListQuery,
  ) {
    const actor = requireResultActor(surface);
    return this.commands.readSnapshot(async (client) => {
      const access = await this.auth.permissions(client, actor);
      const target = await this.requireBatch(client, access, id, 'VIEW');
      const scope = actor.schoolId + ':' + actor.actorId + ':' + id;
      const filter = { revision: target.batch.revision };
      const { limit, after } = readResultCursor(query, scope, part, filter);
      if (after !== null && !/^[0-9]{1,9}$/u.test(after))
        throw new ValidationDomainException('Invalid result cursor');
      const begin = after === null ? 0 : Number(after) + 1;
      const report = await client.resultImportReview.findFirst({
        where: reviewKey(target.batch),
        select: { rows: true, issues: true, units: true },
      });
      const values: (ImportFinding | ImportRowSummary | ImportChange)[] =
        !report
          ? []
          : part === 'issues'
            ? (report.issues as unknown as ImportFinding[])
            : part === 'rows'
              ? (report.rows as unknown as ImportRowSummary[])
              : (report.units as unknown as ImportUnit[]).flatMap(
                  (unit) => unit.changes,
                );
      const indexed = values
        .slice(begin, begin + limit + 1)
        .map((value, index) => ({ value, index: begin + index }));
      const page = presentResultPage(
        indexed,
        limit,
        (item) => String(item.index),
        scope,
        part,
        filter,
      );
      return { ...page, items: page.items.map((item) => item.value) };
    });
  }

  private async refresh(
    surface: ResultImportSurface,
    id: string,
    input: { expectedBatchRevision: number },
    operation: string,
    key: string | undefined,
    updated: (
      batch: Batch,
      tx: Prisma.TransactionClient,
    ) => Promise<Prisma.ResultImportBatchUpdateManyMutationInput>,
  ) {
    const actor = requireResultActor(surface);
    const receipt = await this.commands.transaction(async (client) => {
      const access = await this.auth.permissions(client, actor);
      const { batch } = await this.requireBatch(client, access, id, 'IMPORT');
      return this.commands.idempotent(
        client,
        actor,
        operation,
        key,
        { id, input },
        async () => {
          const finish = await this.nextRevision(
            client,
            batch,
            input.expectedBatchRevision,
            await updated(batch, client),
          );
          await this.commands.audit(
            client,
            actor,
            'imports.revalidate',
            'ResultImportBatch',
            batch.id,
            { revision: finish.revision },
          );
          return { batchId: finish.id, revision: finish.revision };
        },
      );
    });
    await this.enqueue(receipt.batchId, receipt.revision);
    return this.detail(surface, receipt.batchId, 'IMPORT');
  }

  async requireBatch(
    client: Prisma.TransactionClient,
    access: ResultPermissionCheck,
    id: string,
    action: Direction,
  ) {
    const batch = await client.resultImportBatch.findFirst({
      where: { id, ...owning(access) },
    });
    if (!batch) throw new NotFoundDomainException();
    return this.authorizeBatch(client, access, batch, action);
  }

  private async authorizeBatch(
    client: Prisma.TransactionClient,
    access: ResultPermissionCheck,
    batch: Batch,
    action: Direction,
  ) {
    const review = await client.resultImportReview.findFirst({
      where: reviewKey(batch),
      select: {
        id: true,
        revision: true,
        digest: true,
        binding: true,
        summary: true,
        units: true,
        expiresAt: true,
      },
    });
    await this.validator.assertReviewScope(
      client,
      access,
      batch,
      (review?.binding ?? null) as unknown as ImportReviewBinding | null,
      action,
    );
    const outcome = await client.resultImportExecution.findFirst({
      where: {
        batchId: batch.id,
        schoolId: batch.schoolId,
        batchRevision: batch.revision,
      },
      select: outcomeSelection,
    });
    return { batch, review, outcome };
  }

  private async nextRevision(
    client: Prisma.TransactionClient,
    batch: Batch,
    revision: number,
    data: Prisma.ResultImportBatchUpdateManyMutationInput,
  ) {
    if (batch.expiresAt <= new Date())
      throw new OfficialResultsError('import.export_expired');
    const updated = await client.resultImportBatch.updateMany({
      where: {
        id: batch.id,
        schoolId: batch.schoolId,
        revision,
        status: { in: editableFilter },
      },
      data: {
        ...data,
        revision: { increment: 1 },
        status: 'UPLOADED',
        failureCode: null,
        attempts: 0,
      },
    });
    if (!updated.count) throw new OfficialResultsError('revision.stale');
    return client.resultImportBatch.findFirstOrThrow({
      where: { id: batch.id, schoolId: batch.schoolId },
    });
  }

  private async enqueue(id: string, revision: number) {
    try {
      await ensureImportValidation(this.queue, id, revision);
    } catch {
      this.logger.warn({
        event: 'official_results.import.enqueue_deferred',
        batchId: id,
        revision,
      });
    }
  }
}
