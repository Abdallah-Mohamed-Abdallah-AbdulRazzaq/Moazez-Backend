import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import {
  FileVisibility,
  type Prisma,
  type ResultIssueReport,
} from '@prisma/client';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { BullmqService } from '../../../infrastructure/queue/bullmq.service';
import { StorageService } from '../../../infrastructure/storage/storage.service';
import { OfficialResultsError } from '../domain/official-results.error';
import {
  officialResultsExposed,
  officialResultsPilotWhere,
} from '../domain/result-exposure';
import { csvRecord, encodeSpreadsheetText } from '../domain/result-csv';
import { resultsBulkQueue } from '../domain/result-export.contract';
import type {
  ImportFinding,
  ImportReviewBinding,
} from '../domain/result-import.contract';
import {
  ResultAuthorizationRepository,
  type ResultPermissionCheck,
} from '../infrastructure/repositories/result-authorization.repository';
import { ResultCommandRepository } from '../infrastructure/repositories/result-command.repository';
import { requireResultActor, type ResultActor } from './result-actor';
import { ResultExportService } from './result-export.service';
import {
  ResultImportService,
  type ResultImportSurface,
} from './result-import.service';
import { ResultImportValidationService } from './result-import-validation.service';

export const resultIssueReportJob = 'official-results-issue-report';
const mediaType = 'text/csv; charset=utf-8';
const leaseMs = 2 * 60_000;
const maxAttempts = 4;
const day = 86_400_000;
const exactReport = {
  review: {
    select: { binding: true, issues: true, batch: true },
  },
} satisfies Prisma.ResultIssueReportInclude;

function fileDescriptor(report: ResultIssueReport, actor: ResultActor) {
  const prefix =
    actor.userType === 'TEACHER'
      ? '/api/v1/teacher/official-results'
      : '/api/v1/official-results';
  return {
    fileId: report.fileId,
    filename: 'MOAZEZ_RESULTS_ISSUES_' + report.id + '.csv',
    mediaType,
    sizeBytes: report.sizeBytes!,
    expiresAt: report.expiresAt.toISOString(),
    downloadPath: prefix + '/files/' + report.fileId + '/download',
  };
}

export function presentResultIssueReport(
  report: ResultIssueReport,
  actor: ResultActor,
) {
  const prefix =
    actor.userType === 'TEACHER'
      ? '/api/v1/teacher/official-results'
      : '/api/v1/official-results';
  const ready =
    report.status === 'READY' &&
    report.expiresAt > new Date() &&
    !report.deletedAt;
  const running = report.status === 'GENERATING';
  const queued = report.status === 'QUEUED';
  const status = ready
    ? 'COMPLETED'
    : running
      ? 'RUNNING'
      : queued
        ? 'QUEUED'
        : 'FAILED';
  return {
    operationId: report.id,
    operationType: 'ISSUE_REPORT' as const,
    status,
    counts: {
      total: 1,
      completed: Number(ready),
      failed: Number(status === 'FAILED'),
      pending: Number(running || queued),
      skipped: 0,
    },
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
    itemsPath: prefix + '/operations/' + report.id + '/items',
    ...(ready ? { file: fileDescriptor(report, actor) } : {}),
  } as const;
}

@Injectable()
export class ResultIssueReportService {
  private readonly logger = new Logger(ResultIssueReportService.name);

  constructor(
    private readonly commands: ResultCommandRepository,
    private readonly imports: ResultImportService,
    private readonly auth: ResultAuthorizationRepository,
    private readonly validator: ResultImportValidationService,
    private readonly exports: ResultExportService,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly queue: BullmqService,
  ) {}

  async create(surface: ResultImportSurface, batchId: string, key?: string) {
    const actor = requireResultActor(surface);
    const receipt = await this.commands.transaction(async (client) => {
      const access = await this.auth.permissions(client, actor);
      const { batch, review } = await this.imports.requireBatch(
        client,
        access,
        batchId,
        'VIEW',
      );
      return this.commands.idempotent(
        client,
        actor,
        'ISSUE_REPORT',
        key,
        { batchId },
        async () => {
          if (!review) throw new OfficialResultsError('preview.stale');
          const policy = await this.auth.currentPolicy(client, actor.schoolId);
          const id = randomUUID();
          const fileId = randomUUID();
          await client.resultIssueReport.create({
            data: {
              id,
              fileId,
              schoolId: actor.schoolId,
              batchId: batch.id,
              reviewId: review.id,
              revision: review.revision,
              bucket: this.storage.resolveBucket(FileVisibility.PRIVATE),
              objectKey:
                'official-results/' +
                actor.schoolId +
                '/issues/' +
                id +
                '/' +
                fileId,
              expiresAt: new Date(
                Date.now() + policy.policy.temporaryFileRetentionDays * day,
              ),
            },
            select: { id: true },
          });
          await this.commands.audit(
            client,
            actor,
            'imports.issue_report',
            'ResultIssueReport',
            id,
            { batchId, revision: review.revision },
          );
          return { id };
        },
      );
    });
    const report = await this.commands.readSnapshot(async (client) =>
      this.read(client, await this.auth.permissions(client, actor), {
        id: receipt.id,
      }),
    );
    try {
      if (report.status === 'QUEUED' || report.status === 'GENERATING')
        await this.enqueue(report.id);
    } catch {
      this.logger.warn({
        event: 'official_results.issue_report.enqueue_deferred',
        reportId: report.id,
      });
    }
    return presentResultIssueReport(report, actor);
  }

  async read(
    client: Prisma.TransactionClient,
    access: ResultPermissionCheck,
    selector: { id: string } | { fileId: string },
  ) {
    const report = await client.resultIssueReport.findFirst({
      where: {
        ...selector,
        schoolId: access.actor.schoolId,
        review: { batch: { creatorId: access.actor.actorId } },
      },
      include: { review: { select: { binding: true, batch: true } } },
    });
    if (!report) throw new NotFoundDomainException();
    await this.validator.assertReviewScope(
      client,
      access,
      report.review.batch,
      report.review.binding as unknown as ImportReviewBinding,
      'VIEW',
    );
    return report;
  }

  async download(surface: ResultImportSurface, fileId: string) {
    const actor = requireResultActor(surface);
    const selection = await this.commands.readSnapshot(async (client) => {
      const access = await this.auth.permissions(client, actor);
      this.auth.requirePermission(access, 'official_results.sheets.view');
      const exported = await client.resultExportFile.findFirst({
        where: {
          id: fileId,
          schoolId: actor.schoolId,
          export: { creatorId: actor.actorId },
        },
        select: { exportId: true },
      });
      if (exported) return { exportId: exported.exportId } as const;
      const source = await client.resultImportSource.findFirst({
        where: {
          id: fileId,
          schoolId: actor.schoolId,
          batch: { creatorId: actor.actorId },
        },
        select: {
          batchId: true,
          version: true,
          id: true,
          bucket: true,
          objectKey: true,
          expiresAt: true,
          storedAt: true,
          deletedAt: true,
          sizeBytes: true,
        },
      });
      if (source) {
        const verified = await client.resultImportReview.findFirst({
          where: {
            schoolId: actor.schoolId,
            batchId: source.batchId,
            sourceVersion: source.version,
          },
          orderBy: { revision: 'asc' },
          select: { binding: true, batch: true },
        });
        const binding = verified?.binding as unknown as
          | ImportReviewBinding
          | undefined;
        if (
          !verified ||
          !binding?.fields.length ||
          binding.fields.some((unit) => !unit.fieldIds.length)
        )
          throw new NotFoundDomainException();
        await this.validator.assertReviewScope(
          client,
          access,
          verified.batch,
          binding,
          'VIEW',
        );
        if (
          !source.storedAt ||
          source.deletedAt ||
          source.expiresAt <= new Date()
        )
          throw new OfficialResultsError('export.expired');
        await this.commands.audit(
          client,
          actor,
          'imports.source_download',
          'ResultImportSource',
          source.id,
          { batchId: source.batchId, version: source.version },
        );
        return { source } as const;
      }
      const report = await this.read(client, access, { fileId });
      if (report.expiresAt <= new Date() || report.deletedAt)
        throw new OfficialResultsError('export.expired');
      if (report.status !== 'READY')
        throw new OfficialResultsError('export.not_ready');
      await this.commands.audit(
        client,
        actor,
        'imports.issue_download',
        'ResultIssueReport',
        report.id,
        { batchId: report.batchId, revision: report.revision },
      );
      return { report };
    });
    if ('exportId' in selection && selection.exportId)
      return this.exports.download(surface, selection.exportId, fileId);
    if ('source' in selection && selection.source) {
      const { source } = selection;
      const stream = await this.storage.getObject({
        bucket: source.bucket,
        objectKey: source.objectKey,
      });
      return {
        stream,
        filename: 'MOAZEZ_RESULTS_SOURCE_' + fileId + '.bin',
        mediaType: 'application/octet-stream',
        sizeBytes: source.sizeBytes,
      };
    }
    const report = selection.report!;
    const stream = await this.storage.getObject(report);
    return { ...fileDescriptor(report, actor), stream };
  }

  async run(id: string) {
    const now = new Date();
    const report = await this.prisma.resultIssueReport.findUnique({
      where: { id },
      include: exactReport,
    });
    if (
      !report ||
      report.expiresAt <= now ||
      !officialResultsExposed(report.schoolId)
    )
      return;
    const key = { id, schoolId: report.schoolId };
    const leaseToken = randomUUID();
    const runnable: Prisma.ResultIssueReportWhereInput = {
      ...key,
      OR: [
        { status: 'QUEUED' },
        { status: 'GENERATING', leaseUntil: { lte: now } },
      ],
    };
    const acquired = await this.prisma.resultIssueReport.updateMany({
      where: { ...runnable, attempts: { lt: maxAttempts } },
      data: {
        status: 'GENERATING',
        attempts: { increment: 1 },
        leaseToken,
        leaseUntil: new Date(now.getTime() + leaseMs),
      },
    });
    if (!acquired.count) {
      await this.prisma.resultIssueReport.updateMany({
        where: { ...runnable, attempts: { gte: maxAttempts } },
        data: { status: 'FAILED', leaseUntil: null, leaseToken: null },
      });
      return;
    }
    const actor = report.review.batch.actorContext as unknown as ResultActor;
    const authorized = async (client: Prisma.TransactionClient) => {
      const access = await this.auth.permissions(client, actor, {
        write: true,
      });
      await this.validator.assertReviewScope(
        client,
        access,
        report.review.batch,
        report.review.binding as unknown as ImportReviewBinding,
        'VIEW',
      );
    };
    const guard = { ...key, leaseToken, status: 'GENERATING' } as const;
    try {
      await this.commands.transaction(authorized);
      const fields = [
        'code',
        'severity',
        'message_ar',
        'message_en',
        'sheet_ref',
        'row_ref',
        'field_ref',
        'record',
        'column',
        'baseline',
        'current',
        'incoming',
      ];
      const issues = report.review.issues as unknown as ImportFinding[];
      const value = (item: object | undefined) =>
        item ? JSON.stringify(item) : '';
      const contents =
        '\ufeff' +
        csvRecord(fields) +
        issues
          .map((finding) =>
            csvRecord(
              [
                finding.code,
                finding.severity,
                finding.messageAr,
                finding.message,
                finding.sheetId ?? '',
                finding.rowRef ?? '',
                finding.fieldId ?? '',
                String(finding.location?.record ?? ''),
                String(finding.location?.column ?? ''),
                value(finding.comparison?.baseline),
                value(finding.comparison?.current),
                value(finding.comparison?.incoming),
              ].map(encodeSpreadsheetText),
            ),
          )
          .join('');
      const bytes = Buffer.from(contents);
      if (bytes.length > 20 * 1024 * 1024)
        throw new OfficialResultsError('scope.limit_exceeded');
      await this.storage.saveObject({
        bucket: report.bucket,
        objectKey: report.objectKey,
        body: bytes,
        sizeBytes: bytes.length,
        contentType: mediaType,
      });
      await this.commands.transaction(async (client) => {
        await authorized(client);
        await client.resultIssueReport.updateMany({
          where: guard,
          data: {
            status: 'READY',
            sizeBytes: bytes.length,
            leaseToken: null,
            leaseUntil: null,
          },
        });
      });
    } catch (error) {
      const final =
        error instanceof NotFoundDomainException ||
        error instanceof OfficialResultsError;
      await this.prisma.resultIssueReport.updateMany({
        where: guard,
        data: {
          status: final ? 'FAILED' : 'QUEUED',
          leaseUntil: null,
          leaseToken: null,
        },
      });
      if (!final) throw new Error('official_results.issue_report.retry');
    }
  }

  async reconcile() {
    const now = new Date();
    const jobs = await this.prisma.resultIssueReport.findMany({
      where: {
        ...officialResultsPilotWhere(),
        expiresAt: { gt: now },
        OR: [
          { status: 'QUEUED' },
          { status: 'GENERATING', leaseUntil: { lte: now } },
        ],
      },
      take: 100,
      orderBy: { updatedAt: 'asc' },
      select: { id: true },
    });
    for (const job of jobs) await this.enqueue(job.id);
    const expired = await this.prisma.resultIssueReport.findMany({
      where: {
        deletedAt: null,
        OR: [{ expiresAt: { lte: now } }, { status: 'FAILED' }],
      },
      take: 100,
    });
    for (const item of expired) {
      try {
        await this.storage.deleteObjectAndConfirmAbsent(item);
        await this.prisma.resultIssueReport.updateMany({
          where: { id: item.id, schoolId: item.schoolId, deletedAt: null },
          data: {
            deletedAt: now,
            status: 'EXPIRED',
            leaseUntil: null,
            leaseToken: null,
          },
        });
      } catch {
        this.logger.warn({
          event: 'official_results.issue_report.cleanup_deferred',
          reportId: item.id,
        });
      }
    }
  }

  private enqueue(id: string) {
    return this.queue.ensureJobFromPersistedTruth(
      resultsBulkQueue,
      resultIssueReportJob,
      { id },
      {
        jobId: resultIssueReportJob + '-' + id,
        attempts: 4,
        backoff: { type: 'exponential', delay: 2_000 },
      },
    );
  }
}
