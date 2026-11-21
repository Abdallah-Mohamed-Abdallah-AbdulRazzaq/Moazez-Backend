import { createHash, randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { FileVisibility, Prisma, type ResultExport } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../../common/context/request-context';
import {
  DomainException,
  NotFoundDomainException,
} from '../../../common/exceptions/domain-exception';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { BullmqService } from '../../../infrastructure/queue/bullmq.service';
import { StorageService } from '../../../infrastructure/storage/storage.service';
import { OfficialResultsError } from '../domain/official-results.error';
import { currentRosterInstant } from '../domain/reporting-dates';
import { renderResultFiles } from '../domain/result-csv';
import {
  exportRequest,
  resultsBulkQueue,
  resultsExportJob,
  type ExportCreate,
  type ExportManifest,
  type ExportRequest,
} from '../domain/result-export.contract';
import { ResultAuthorizationRepository } from '../infrastructure/repositories/result-authorization.repository';
import { ResultCommandRepository } from '../infrastructure/repositories/result-command.repository';
import { ResultPreviewRepository } from '../infrastructure/repositories/result-preview.repository';
import { ResultRosterRepository } from '../infrastructure/repositories/result-roster.repository';
import { requireResultActor, type ResultActor } from './result-actor';
import {
  exportSummary,
  ResultExportPlanService,
} from './result-export-plan.service';
import {
  presentResultPage,
  readResultCursor,
  type ResultListQuery,
} from './result-page';

const day = 86_400_000;
const leaseMs = 5 * 60_000;
const maxAttempts = 4;
type Surface = 'SCHOOL' | 'TEACHER';
type ExportSummary = ReturnType<typeof exportSummary>;

const fileMetadata = {
  id: true,
  filename: true,
  mediaType: true,
  sizeBytes: true,
  position: true,
} satisfies Prisma.ResultExportFileSelect;

const responseInclude = {
  files: {
    where: { deletedAt: null },
    orderBy: { position: 'asc' },
    select: fileMetadata,
  },
} satisfies Prisma.ResultExportInclude;

function describeExport(
  row: Prisma.ResultExportGetPayload<{ include: typeof responseInclude }>,
  surface: Surface,
) {
  const path =
    surface === 'TEACHER'
      ? '/api/v1/teacher/official-results'
      : '/api/v1/official-results';
  const expiresAt = row.expiresAt.toISOString();
  const status = row.expiresAt <= new Date() ? 'EXPIRED' : row.status;
  return {
    exportId: row.id,
    status,
    format: row.format,
    mode: row.mode,
    createdAt: row.createdAt.toISOString(),
    expiresAt,
    reuseUntil: row.reuseUntil.toISOString(),
    manifestSummary: row.summary as unknown as ExportSummary,
    ...(row.failureCode ? { failureCode: row.failureCode } : {}),
    files:
      status === 'READY'
        ? row.files.map((file) => ({
            fileId: file.id,
            filename: file.filename,
            mediaType: file.mediaType,
            sizeBytes: file.sizeBytes,
            downloadPath:
              path + '/exports/' + row.id + '/files/' + file.id + '/download',
            expiresAt,
          }))
        : [],
  };
}

@Injectable()
export class ResultExportService {
  private readonly logger = new Logger(ResultExportService.name);

  constructor(
    private readonly commands: ResultCommandRepository,
    private readonly auth: ResultAuthorizationRepository,
    private readonly previews: ResultPreviewRepository,
    private readonly planner: ResultExportPlanService,
    private readonly roster: ResultRosterRepository,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly queue: BullmqService,
  ) {}

  preview(surface: Surface, request: ExportRequest) {
    const actor = requireResultActor(surface);
    return this.commands.readSnapshot(async (client) => {
      const access = await this.auth.permissions(client, actor);
      const plan = await this.planner.plan(client, access, request);
      const evidence = await this.previews.create(
        client,
        actor,
        'EXPORT',
        null,
        {
          request,
          fingerprint: plan.fingerprint,
        },
      );
      return {
        ...evidence,
        selection: request,
        summary: plan.summary,
        impacts: plan.summary.sheets.map((sheet) => ({
          kind: 'EXPORT_SHEET' as const,
          resourceId: sheet.sheetId,
          before: { files: 0 },
          after: { rows: sheet.rows, fields: sheet.fields.length },
        })),
        blockers: plan.plans.length
          ? []
          : [{ code: 'official_results.export.empty' }],
      };
    });
  }

  async create(surface: Surface, input: ExportCreate, key?: string) {
    const actor = requireResultActor(surface);
    const receipt = await this.commands.transaction(async (client) => {
      const access = await this.auth.permissions(client, actor);
      this.auth.requirePermission(access, 'official_results.exports.create');
      return this.commands.idempotent(
        client,
        actor,
        'EXPORT_GENERATE',
        key,
        input,
        async () => {
          const result = await this.previews.load(
            client,
            actor,
            'EXPORT',
            null,
            input.previewId,
            input.previewDigest,
          );
          const binding = result as { request: unknown; fingerprint: string };
          const request = exportRequest.parse(binding.request);
          const plan = await this.planner.plan(client, access, request);
          if (plan.fingerprint !== binding.fingerprint || !plan.plans.length)
            throw new OfficialResultsError('preview.stale');

          const createdAt = new Date();
          const expiresAt = new Date(
            createdAt.getTime() + plan.retentionDays * day,
          );
          const row = await client.resultExport.create({
            data: {
              schoolId: actor.schoolId,
              creatorId: actor.actorId,
              actorContext: actor,
              reportingPeriodId: request.reportingPeriodId,
              request,
              format: request.format,
              mode: request.mode,
              selectionDigest: plan.fingerprint,
              summary: plan.summary,
              reuseUntil: new Date(
                Math.min(createdAt.getTime() + 14 * day, expiresAt.getTime()),
              ),
              createdAt,
              expiresAt,
            },
            select: { id: true },
          });
          await this.commands.audit(
            client,
            actor,
            'exports.queue',
            'ResultExport',
            row.id,
            {
              format: request.format,
              mode: request.mode,
              sheetCount: plan.summary.sheetCount,
              rowCount: plan.summary.rowCount,
            },
          );
          return { exportId: row.id };
        },
      );
    });
    const result = await this.detail(surface, receipt.exportId);
    if (result.status === 'QUEUED' || result.status === 'GENERATING') {
      try {
        await this.enqueue(receipt.exportId);
      } catch {
        this.logger.warn({
          event: 'official_results.export.enqueue_deferred',
          exportId: receipt.exportId,
        });
      }
    }
    return result;
  }

  list(surface: Surface, request: ResultListQuery) {
    const actor = requireResultActor(surface);
    return this.commands.readSnapshot(async (client) => {
      const access = await this.auth.permissions(client, actor);
      this.auth.requirePermission(access, 'official_results.exports.create');
      const owner = { schoolId: actor.schoolId, creatorId: actor.actorId };
      const cursorScope = actor.schoolId + ':' + actor.actorId;
      const { limit, after } = readResultCursor(
        request,
        cursorScope,
        'exports',
        {},
      );
      const visible: ReturnType<typeof describeExport>[] = [];
      let boundary = after;
      while (visible.length <= limit) {
        const rows = await client.resultExport.findMany({
          where: { ...owner, ...(boundary ? { id: { gt: boundary } } : {}) },
          orderBy: { id: 'asc' },
          take: limit + 1,
          include: responseInclude,
        });
        for (const row of rows) {
          try {
            await this.planner.authorizeRecordedPlan(
              client,
              access,
              row.summary as unknown as ExportSummary,
            );
            visible.push(describeExport(row, surface));
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
        if (rows.length < limit + 1) break;
        boundary = rows[rows.length - 1].id;
      }
      return presentResultPage(
        visible,
        limit,
        (row) => row.exportId,
        cursorScope,
        'exports',
        {},
      );
    });
  }

  detail(surface: Surface, id: string) {
    const actor = requireResultActor(surface);
    return this.commands.readSnapshot(async (client) => {
      const access = await this.auth.permissions(client, actor);
      const row = await client.resultExport.findFirst({
        where: { id, schoolId: actor.schoolId, creatorId: actor.actorId },
        include: responseInclude,
      });
      if (!row) throw new NotFoundDomainException();
      await this.planner.authorizeRecordedPlan(
        client,
        access,
        row.summary as unknown as ExportSummary,
      );
      return describeExport(row, surface);
    });
  }

  async download(surface: Surface, id: string, fileId: string) {
    const actor = requireResultActor(surface);
    const file = await this.commands.readSnapshot(async (client) => {
      const access = await this.auth.permissions(client, actor);
      const row = await client.resultExport.findFirst({
        where: { id, schoolId: actor.schoolId, creatorId: actor.actorId },
      });
      if (!row) throw new NotFoundDomainException();
      await this.planner.authorizeRecordedPlan(
        client,
        access,
        row.summary as unknown as ExportSummary,
      );
      if (row.expiresAt <= new Date())
        throw new OfficialResultsError('export.expired');
      if (row.status !== 'READY')
        throw new OfficialResultsError('export.not_ready');
      const files = await client.resultExportFile.findMany({
        where: {
          id: fileId,
          schoolId: actor.schoolId,
          exportId: id,
          deletedAt: null,
        },
      });
      if (!files.length) throw new NotFoundDomainException();
      const selected = files[0];
      const manifests = selected.manifest
        ? [selected]
        : await client.resultExportFile.findMany({
            where: {
              schoolId: actor.schoolId,
              exportId: id,
              deletedAt: null,
              manifest: { not: Prisma.DbNull },
            },
            select: { manifest: true },
          });
      for (const member of manifests) {
        const manifest = member.manifest as unknown as ExportManifest;
        await this.authorizeRows(client, actor, manifest);
      }
      return selected;
    });
    const stream = await this.storage.getObject({
      bucket: file.bucket,
      objectKey: file.objectKey,
    });
    return {
      stream,
      filename: file.filename,
      mediaType: file.mediaType,
      sizeBytes: file.sizeBytes,
    };
  }

  async findEditManifest(
    client: Prisma.TransactionClient,
    actor: ResultActor,
    exportId: string,
    exportRef: string,
  ) {
    const file = await client.resultExportFile.findFirst({
      where: {
        schoolId: actor.schoolId,
        exportId,
        id: exportRef,
        deletedAt: null,
        export: { status: 'READY' },
      },
      select: {
        manifest: true,
        export: { select: { reuseUntil: true, mode: true, format: true } },
      },
    });
    if (!file?.manifest) throw new NotFoundDomainException();
    return {
      ...file.export,
      manifest: file.manifest as unknown as ExportManifest,
    };
  }

  async run(id: string): Promise<void> {
    const row = await this.prisma.resultExport.findUnique({ where: { id } });
    if (!row) return;
    const actor = row.actorContext as unknown as ResultActor;
    const context = createRequestContext('official-results-export-' + row.id);
    context.actor = { id: actor.actorId, userType: actor.userType };
    context.activeMembership = {
      membershipId: actor.membershipId,
      organizationId: actor.organizationId,
      schoolId: actor.schoolId,
      roleId: actor.roleId,
      permissions: [],
    };
    await runWithRequestContext(context, () => this.generate(row, actor));
  }

  async reconcile(): Promise<void> {
    const now = new Date();
    const stale = await this.prisma.resultExport.findMany({
      where: {
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
    for (const row of stale) await this.enqueue(row.id);
    await this.prisma.resultExport.updateMany({
      where: { expiresAt: { lte: now }, status: { not: 'EXPIRED' } },
      data: { status: 'EXPIRED', leaseToken: null, leaseUntil: null },
    });
    const candidates = await this.prisma.resultExportFile.findMany({
      where: {
        deletedAt: null,
        export: { status: { in: ['FAILED', 'EXPIRED'] } },
      },
      take: 100,
      orderBy: { createdAt: 'asc' },
      select: { id: true, schoolId: true, bucket: true, objectKey: true },
    });
    for (const file of candidates) {
      try {
        await this.storage.deleteObjectAndConfirmAbsent(file);
        await this.prisma.resultExportFile.updateMany({
          where: { id: file.id, schoolId: file.schoolId, deletedAt: null },
          data: { deletedAt: new Date() },
        });
      } catch {
        this.logger.warn({
          event: 'official_results.export.cleanup_deferred',
          fileId: file.id,
        });
      }
    }
  }

  private enqueue(id: string) {
    return this.queue.ensureJobFromPersistedTruth(
      resultsBulkQueue,
      resultsExportJob,
      { id },
      {
        jobId: resultsExportJob + '-' + id,
        attempts: maxAttempts,
        backoff: { type: 'exponential', delay: 2_000 },
      },
    );
  }

  private async authorizeRows(
    client: Prisma.TransactionClient,
    actor: ResultActor,
    manifest: ExportManifest,
  ) {
    const slots = await client.resultSlot.findMany({
      where: {
        schoolId: actor.schoolId,
        id: {
          in: [...new Set(manifest.rows.map((row) => row.identity.slot_ref))],
        },
      },
      select: {
        id: true,
        sheetId: true,
        placementRevision: true,
        enrollmentId: true,
        studentId: true,
        historicalPlacement: true,
        rosterState: true,
      },
    });
    const current = new Map(slots.map((slot) => [slot.id, slot]));
    if (
      manifest.rows.some((row) => {
        const slot = current.get(row.identity.slot_ref);
        return (
          !slot ||
          slot.sheetId !== row.identity.sheet_ref ||
          slot.placementRevision !== row.placementRevision ||
          slot.enrollmentId !== row.identity.enrollment_ref
        );
      })
    )
      throw new NotFoundDomainException();
    if (manifest.request.mode !== 'EDIT_DRAFT') return;
    for (const context of manifest.sheets) {
      const selected = slots.filter((slot) => slot.sheetId === context.id);
      const sheet = await client.resultSheet.findFirst({
        where: { schoolId: actor.schoolId, id: context.id },
        select: { rosterAsOf: true },
      });
      if (!sheet) throw new NotFoundDomainException();
      const resolved = await this.roster.resolveTarget(
        client,
        actor.schoolId,
        {
          reportingPeriodId: manifest.request.reportingPeriodId,
          classroomId: context.classroomId,
          groupId: context.groupId,
        },
        false,
      );
      const instant = currentRosterInstant(
        sheet.rosterAsOf,
        resolved.period.endsOn,
        resolved.period.school.schoolProfile?.timezone ?? 'UTC',
      );
      const placements = await this.roster.placements(
        client,
        resolved.period,
        instant,
        selected.map((slot) => slot.studentId),
      );
      if (
        selected.some((slot) => {
          const active = placements.get(slot.studentId) ?? [];
          return (
            slot.rosterState !== 'ELIGIBLE' ||
            (slot.historicalPlacement
              ? active.length > 1
              : active.length !== 1 ||
                active[0].id !== slot.enrollmentId ||
                active[0].classroomId !== context.classroomId)
          );
        })
      )
        throw new NotFoundDomainException();
    }
  }

  private async generate(row: ResultExport, actor: ResultActor) {
    const now = new Date();
    const leaseToken = randomUUID();
    const claim = {
      schoolId: row.schoolId,
      id: row.id,
      status: 'GENERATING',
      leaseToken,
    } as const;
    const runnable = {
      schoolId: row.schoolId,
      id: row.id,
      expiresAt: { gt: now },
      OR: [
        { status: 'QUEUED' as const },
        { status: 'GENERATING' as const, leaseUntil: { lte: now } },
      ],
    };
    const acquired = await this.prisma.resultExport.updateMany({
      where: { ...runnable, attempts: { lt: maxAttempts } },
      data: {
        status: 'GENERATING',
        leaseToken,
        leaseUntil: new Date(now.getTime() + leaseMs),
        attempts: { increment: 1 },
      },
    });
    if (!acquired.count) {
      await this.prisma.resultExport.updateMany({
        where: { ...runnable, attempts: { gte: maxAttempts } },
        data: {
          status: 'FAILED',
          failureCode: 'official_results.export.generation_failed',
          leaseToken: null,
          leaseUntil: null,
        },
      });
      return;
    }
    const request = exportRequest.parse(row.request);
    try {
      const plan = await this.commands.readSnapshot(async (client) => {
        const access = await this.auth.permissions(client, actor);
        const planned = await this.planner.plan(client, access, request);
        if (planned.fingerprint !== row.selectionDigest)
          throw new OfficialResultsError('preview.stale');
        return planned;
      });
      const existing = await this.prisma.resultExportFile.findMany({
        where: { schoolId: row.schoolId, exportId: row.id },
        orderBy: { position: 'asc' },
      });
      const generated = await renderResultFiles({
        exportId: row.id,
        creatorId: actor.actorId,
        schoolId: actor.schoolId,
        request,
        exportedAt: row.createdAt.toISOString(),
        reuseUntil: row.reuseUntil.toISOString(),
        sheets: plan.plans,
        priorFiles: existing.map((file) => ({
          id: file.id,
          manifest: file.manifest as unknown as ExportManifest | null,
        })),
      });
      if (
        !generated.length ||
        (existing.length && generated.length !== existing.length)
      )
        throw new OfficialResultsError('preview.stale');
      const bucket = this.storage.resolveBucket(FileVisibility.PRIVATE);
      const files = existing.length
        ? existing
        : await this.commands.transaction(async (client) => {
            const fenced = await client.resultExport.updateMany({
              where: claim,
              data: { leaseUntil: new Date(Date.now() + leaseMs) },
            });
            if (!fenced.count) return null;
            return client.resultExportFile.createManyAndReturn({
              data: generated.map((file, position) => ({
                id: file.id,
                schoolId: row.schoolId,
                exportId: row.id,
                position,
                filename: file.filename,
                mediaType: file.mediaType,
                bucket,
                objectKey:
                  'official-results/' +
                  row.schoolId +
                  '/exports/' +
                  row.id +
                  '/' +
                  file.id,
                sizeBytes: file.bytes.length,
                checksum: createHash('sha256').update(file.bytes).digest('hex'),
                manifest: file.manifest ?? Prisma.DbNull,
              })),
            });
          });
      if (!files) return;
      for (const file of files) {
        const fenced = await this.prisma.resultExport.updateMany({
          where: claim,
          data: { leaseUntil: new Date(Date.now() + leaseMs) },
        });
        if (!fenced.count) return;
        const content = generated[file.position];
        if (
          content.id !== file.id ||
          content.bytes.length !== file.sizeBytes ||
          createHash('sha256').update(content.bytes).digest('hex') !==
            file.checksum
        )
          throw new OfficialResultsError('preview.stale');
        await this.storage.saveObject({
          bucket: file.bucket,
          objectKey: file.objectKey,
          body: content.bytes,
          sizeBytes: file.sizeBytes,
          contentType: file.mediaType,
          metadata: { sha256: file.checksum },
        });
      }
      await this.commands.transaction(async (client) => {
        const access = await this.auth.permissions(client, actor, {
          write: true,
        });
        await this.planner.authorizeRecordedPlan(client, access, plan.summary);
        if (row.expiresAt <= new Date())
          throw new OfficialResultsError('export.expired');
        const changed = await client.resultExport.updateMany({
          where: claim,
          data: { status: 'READY', leaseToken: null, leaseUntil: null },
        });
        if (!changed.count) return;
        await this.commands.audit(
          client,
          actor,
          'exports.ready',
          'ResultExport',
          row.id,
          { files: files.length },
        );
      });
    } catch (error) {
      const terminal = error instanceof DomainException;
      await this.prisma.resultExport.updateMany({
        where: claim,
        data: {
          status: terminal ? 'FAILED' : 'QUEUED',
          failureCode: terminal ? error.code : null,
          leaseToken: null,
          leaseUntil: null,
        },
      });
      if (!terminal) {
        this.logger.warn({
          event: 'official_results.export.retry',
          exportId: row.id,
        });
        throw new Error('official_results.export.generation_retry');
      }
    }
  }
}
