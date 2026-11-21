import { createHash, randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import type {
  Prisma,
  ResultImportBatch,
  ResultImportSource,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../../common/context/request-context';
import { DomainException } from '../../../common/exceptions/domain-exception';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { BullmqService } from '../../../infrastructure/queue/bullmq.service';
import { StorageService } from '../../../infrastructure/storage/storage.service';
import { resultContentDigest } from '../domain/result-content-digest';
import {
  officialResultsExposed,
  officialResultsPilotWhere,
} from '../domain/result-exposure';
import {
  type ImportCorrection,
  type ImportReviewBinding,
  validateImportOptions,
} from '../domain/result-import.contract';
import { ResultAuthorizationRepository } from '../infrastructure/repositories/result-authorization.repository';
import { ResultCommandRepository } from '../infrastructure/repositories/result-command.repository';
import type { ResultActor } from './result-actor';
import { ensureImportValidation } from './result-import.service';
import { ResultImportValidationService } from './result-import-validation.service';

const maxAttempts = 4;
const leaseDuration = 5 * 60_000;
const terminalValidationStatus = [
  'UPLOADED',
  'VALIDATING',
  'CORRECTIONS_REQUIRED',
  'READY_TO_CONFIRM',
  'NO_CHANGES',
] as const;

@Injectable()
export class ResultImportWorkService {
  private readonly logger = new Logger(ResultImportWorkService.name);

  constructor(
    private readonly auth: ResultAuthorizationRepository,
    private readonly commands: ResultCommandRepository,
    private readonly validator: ResultImportValidationService,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly queue: BullmqService,
  ) {}

  async run(batchId: string, revision: number): Promise<void> {
    const batch = await this.prisma.resultImportBatch.findUnique({
      where: { id: batchId },
    });
    if (
      !batch ||
      batch.revision !== revision ||
      !officialResultsExposed(batch.schoolId)
    )
      return;
    const source = await this.prisma.resultImportSource.findUnique({
      where: {
        batchId_schoolId_version: {
          batchId,
          schoolId: batch.schoolId,
          version: batch.sourceVersion,
        },
      },
    });
    if (!source?.storedAt || source.deletedAt || source.expiresAt <= new Date())
      return;
    const actor = batch.actorContext as unknown as ResultActor;
    const context = createRequestContext(
      'official-results-validate-' + batchId,
    );
    context.actor = { id: actor.actorId, userType: actor.userType };
    context.activeMembership = {
      membershipId: actor.membershipId,
      organizationId: actor.organizationId,
      schoolId: actor.schoolId,
      roleId: actor.roleId,
      permissions: [],
    };
    await runWithRequestContext(context, () =>
      this.validate(batch, source, actor),
    );
  }

  private async validate(
    batch: ResultImportBatch,
    source: ResultImportSource,
    actor: ResultActor,
  ) {
    const now = new Date();
    const leaseToken = randomUUID();
    const base = {
      id: batch.id,
      schoolId: batch.schoolId,
      revision: batch.revision,
      sourceVersion: source.version,
    };
    const runnable: Prisma.ResultImportBatchWhereInput = {
      ...base,
      expiresAt: { gt: now },
      OR: [
        { status: 'UPLOADED' },
        { status: 'VALIDATING', leaseUntil: { lte: now } },
      ],
    };
    const acquired = await this.prisma.resultImportBatch.updateMany({
      where: { ...runnable, attempts: { lt: maxAttempts } },
      data: {
        status: 'VALIDATING',
        leaseToken,
        leaseUntil: new Date(now.getTime() + leaseDuration),
        attempts: { increment: 1 },
      },
    });
    if (!acquired.count) {
      await this.prisma.resultImportBatch.updateMany({
        where: { ...runnable, attempts: { gte: maxAttempts } },
        data: {
          status: 'FAILED',
          failureCode: 'official_results.import.validation_failed',
          leaseToken: null,
          leaseUntil: null,
        },
      });
      return;
    }
    const guard: Prisma.ResultImportBatchWhereInput = {
      ...base,
      status: 'VALIDATING',
      leaseToken,
    };
    try {
      const access = await this.commands.readSnapshot(async (client) => {
        const permissions = await this.auth.permissions(client, actor);
        await this.validator.assertExportScope(
          client,
          permissions,
          batch.exportId,
          'IMPORT',
        );
        return permissions;
      });
      const bytes = await this.readSource(source);
      const options = validateImportOptions.parse(batch.options);
      const corrections = batch.corrections as unknown as ImportCorrection[];
      const report = await this.commands.readSnapshot(async (client) => {
        const current = await this.auth.permissions(client, access.actor);
        return this.validator.validate(
          client,
          current,
          batch,
          source,
          bytes,
          options,
          corrections,
        );
      });
      const expiresAt = new Date(
        Math.min(
          batch.expiresAt.getTime(),
          source.expiresAt.getTime(),
          Date.now() + 30 * 60_000,
        ),
      );
      const id = randomUUID();
      const binding: ImportReviewBinding = {
        formatVersion: 'MOAZEZ_REVIEW_BINDING_V1',
        schoolId: batch.schoolId,
        actorId: actor.actorId,
        batchId: batch.id,
        batchRevision: batch.revision,
        sourceVersion: batch.sourceVersion,
        sourceByteSha256: source.checksum,
        exportId: batch.exportId,
        exportRef: report.exportRef,
        previewId: id,
        previewRevision: batch.revision,
        selectedSheetIds: report.selectedSheetIds,
        fields: report.permissionBinding,
        context: report.units
          .filter((unit) => unit.status !== 'EXCLUDED')
          .map(({ context }) => ({
            sheetId: context.sheetId,
            classroomId: context.classroomId,
            groupId: context.groupId,
            reportingPeriodId: context.reportingPeriodId,
            rosterRevision: context.rosterRevision,
            policyRevision: context.policyRevision,
            draftDefinitionVersionId: context.draftDefinitionVersionId,
            sheetRevision: context.sheetRevision,
            snapshotDataGeneration: context.snapshotDataGeneration,
            correctionUnitId: context.correctionUnitId,
          })),
        changeSetSha256: resultContentDigest(
          report.units.flatMap((unit) => unit.changes),
        ),
        validationReadSetSha256: resultContentDigest(
          report.units.flatMap((unit) => unit.validationReadSet),
        ),
        requiredWarningIds: report.warningIds,
        clearReason: options.clearReason ?? null,
        expiresAt: expiresAt.toISOString(),
      };
      const digest = resultContentDigest(binding);
      await this.commands.transaction(async (client) => {
        const current = await this.auth.permissions(client, actor, {
          write: true,
        });
        await this.validator.assertReviewScope(
          client,
          current,
          batch,
          binding,
          'IMPORT',
        );
        const changed = await client.resultImportBatch.updateMany({
          where: { ...guard, expiresAt: { gt: new Date() } },
          data: { status: report.status, leaseToken: null, leaseUntil: null },
        });
        if (!changed.count) return;
        await client.resultImportReview.create({
          data: {
            id,
            batchId: batch.id,
            schoolId: batch.schoolId,
            revision: batch.revision,
            sourceVersion: batch.sourceVersion,
            digest,
            expiresAt,
            status: report.status,
            binding,
            summary: report.summary,
            units: report.units,
            rows: report.rows,
            issues: report.issues,
            corrections,
          },
          select: { id: true },
        });
        await this.commands.audit(
          client,
          actor,
          'imports.validate',
          'ResultImportBatch',
          batch.id,
          {
            sourceVersion: batch.sourceVersion,
            revision: batch.revision,
            status: report.status,
            rows: report.summary.parsedDataRows,
            issues: report.issues.length,
          },
        );
      });
    } catch (error) {
      const terminal = error instanceof DomainException;
      await this.prisma.resultImportBatch.updateMany({
        where: guard,
        data: {
          status: terminal ? 'FAILED' : 'UPLOADED',
          leaseToken: null,
          leaseUntil: null,
          failureCode: terminal
            ? 'official_results.import.validation_unavailable'
            : null,
        },
      });
      if (!terminal) {
        this.logger.warn({
          event: 'official_results.import.validation_retry',
          batchId: batch.id,
          revision: batch.revision,
        });
        throw new Error('official_results.import.validation_retry');
      }
    }
  }

  async reconcile(now = new Date()): Promise<void> {
    const candidates = await this.prisma.resultImportBatch.findMany({
      where: {
        ...officialResultsPilotWhere(),
        expiresAt: { gt: now },
        OR: [
          { status: 'UPLOADED' },
          { status: 'VALIDATING', leaseUntil: { lte: now } },
        ],
      },
      take: 100,
      orderBy: { updatedAt: 'asc' },
      select: { id: true, schoolId: true, revision: true, sourceVersion: true },
    });
    for (const batch of candidates) {
      const source = await this.prisma.resultImportSource.findFirst({
        where: {
          schoolId: batch.schoolId,
          batchId: batch.id,
          version: batch.sourceVersion,
          deletedAt: null,
          expiresAt: { gt: now },
        },
      });
      if (!source) continue;
      if (!source.storedAt) {
        // Recover a process that stopped after writing but before recording completion.
        if (!(await this.storage.objectExists(source))) continue;
        await this.readSource(source);
        await this.prisma.resultImportSource.updateMany({
          where: {
            id: source.id,
            schoolId: source.schoolId,
            storedAt: null,
            deletedAt: null,
          },
          data: { storedAt: now },
        });
      }
      await ensureImportValidation(this.queue, batch.id, batch.revision);
    }
    await this.prisma.resultImportBatch.updateMany({
      where: {
        status: { in: [...terminalValidationStatus] },
        expiresAt: { lte: now },
      },
      data: { status: 'EXPIRED', leaseUntil: null, leaseToken: null },
    });
    const expired = await this.prisma.resultImportSource.findMany({
      where: { deletedAt: null, expiresAt: { lte: now } },
      take: 100,
      orderBy: { expiresAt: 'asc' },
      select: { id: true, schoolId: true, bucket: true, objectKey: true },
    });
    for (const source of expired) {
      try {
        await this.storage.deleteObjectAndConfirmAbsent(source);
        await this.prisma.resultImportSource.updateMany({
          where: { id: source.id, schoolId: source.schoolId, deletedAt: null },
          data: { deletedAt: now },
        });
      } catch {
        this.logger.warn({
          event: 'official_results.import.cleanup_deferred',
          sourceId: source.id,
        });
      }
    }
  }

  private async readSource(source: ResultImportSource) {
    const stream = await this.storage.getObject({
      bucket: source.bucket,
      objectKey: source.objectKey,
    });
    const parts: Buffer[] = [];
    const digest = createHash('sha256');
    let bytes = 0;
    for await (const chunk of stream as AsyncIterable<Buffer | string>) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > source.sizeBytes)
        throw new Error('official_results.import.source_integrity');
      digest.update(buffer);
      parts.push(buffer);
    }
    if (bytes !== source.sizeBytes || digest.digest('hex') !== source.checksum)
      throw new Error('official_results.import.source_integrity');
    return Buffer.concat(parts, bytes);
  }
}
