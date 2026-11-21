import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type ResultImportExecutionUnit } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../../common/context/request-context';
import { DomainException } from '../../../common/exceptions/domain-exception';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { BullmqService } from '../../../infrastructure/queue/bullmq.service';
import { OfficialResultsError } from '../domain/official-results.error';
import {
  officialResultsExposed,
  officialResultsPilotWhere,
} from '../domain/result-exposure';
import { resultContentDigest } from '../domain/result-content-digest';
import type {
  ImportReviewBinding,
  ImportUnit,
} from '../domain/result-import.contract';
import { importCommitBounds } from '../domain/result-import-execution.contract';
import { ResultAuthorizationRepository } from '../infrastructure/repositories/result-authorization.repository';
import { ResultCommandRepository } from '../infrastructure/repositories/result-command.repository';
import type { ResultActor } from './result-actor';
import { ResultImportCommitGate } from './result-import-commit-gate';
import {
  ensureImportExecution,
  synchronizeImportOutcome,
} from './result-import-execution.service';

const duration = 5 * 60_000;
const maxAttempts = 4;
const pendingStates = ['QUEUED', 'APPLYING'] as const;
const include = {
  batch: {
    include: { export: { select: { id: true, mode: true, reuseUntil: true } } },
  },
  review: {
    include: {
      source: {
        select: {
          checksum: true,
          storedAt: true,
          expiresAt: true,
          deletedAt: true,
        },
      },
    },
  },
  units: { orderBy: { sheetId: 'asc' } },
} satisfies Prisma.ResultImportExecutionInclude;
type Execution = Prisma.ResultImportExecutionGetPayload<{
  include: typeof include;
}>;

function transient(error: unknown) {
  if (error instanceof Prisma.PrismaClientInitializationError) return true;
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === 'P2010') {
    // Raw PostgreSQL mutations wrap cancellation, disconnection and lock errors in P2010.
    const sqlState = error.meta?.code;
    return (
      typeof sqlState === 'string' &&
      [
        '57P01',
        '57P02',
        '57P03',
        '57014',
        '55P03',
        '40001',
        '40P01',
        '08000',
        '08003',
        '08006',
        '08007',
      ].includes(sqlState)
    );
  }
  return [
    'P1001',
    'P1002',
    'P1008',
    'P1017',
    'P2024',
    'P2028',
    'P2034',
    'P2037',
  ].includes(error.code);
}

@Injectable()
export class ResultImportApplyService {
  private readonly logger = new Logger(ResultImportApplyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: ResultAuthorizationRepository,
    private readonly commands: ResultCommandRepository,
    private readonly gate: ResultImportCommitGate,
    private readonly queue: BullmqService,
  ) {}

  async run(id: string, revision: number) {
    const operation = await this.prisma.resultImportExecution.findUnique({
      where: { id },
      include,
    });
    if (
      !operation ||
      !officialResultsExposed(operation.schoolId) ||
      operation.dispatchRevision !== revision ||
      (operation.status !== 'QUEUED' && operation.status !== 'APPLYING')
    )
      return;
    const actor = operation.batch.actorContext as unknown as ResultActor;
    const context = createRequestContext(
      'official-results-apply-' + operation.id,
    );
    context.actor = { id: actor.actorId, userType: actor.userType };
    context.activeMembership = {
      membershipId: actor.membershipId,
      organizationId: actor.organizationId,
      schoolId: actor.schoolId,
      roleId: actor.roleId,
      permissions: [],
    };
    const plan = operation.review.units as unknown as ImportUnit[];
    const binding = operation.review.binding as unknown as ImportReviewBinding;
    const units = new Map(plan.map((item) => [item.context.sheetId, item]));
    await runWithRequestContext(context, async () => {
      try {
        await this.prisma.resultImportExecution.updateMany({
          where: {
            id,
            schoolId: operation.schoolId,
            status: 'QUEUED',
            dispatchRevision: revision,
          },
          data: { status: 'APPLYING' },
        });
        for (const unit of operation.units) {
          if (unit.status !== 'QUEUED' && unit.status !== 'RUNNING') continue;
          await this.runUnit(
            operation,
            unit,
            units.get(unit.sheetId),
            actor,
            binding,
            plan,
          );
        }
      } finally {
        await this.commands.transaction((client) =>
          synchronizeImportOutcome(client, {
            id,
            schoolId: operation.schoolId,
          }),
        );
      }
    });
  }

  private async runUnit(
    operation: Execution,
    unit: ResultImportExecutionUnit,
    plan: ImportUnit | undefined,
    actor: ResultActor,
    binding: ImportReviewBinding,
    allUnits: ImportUnit[],
  ) {
    const now = new Date();
    const leaseToken = randomUUID();
    const key = {
      id: unit.id,
      executionId: operation.id,
      schoolId: operation.schoolId,
    };
    const claimable: Prisma.ResultImportExecutionUnitWhereInput = {
      ...key,
      execution: {
        dispatchRevision: operation.dispatchRevision,
        status: { in: [...pendingStates] },
      },
      OR: [
        { status: 'QUEUED' },
        { status: 'RUNNING', leaseUntil: { lte: now } },
      ],
    };
    const claimed = await this.prisma.resultImportExecutionUnit.updateMany({
      where: { ...claimable, attempts: { lt: maxAttempts } },
      data: {
        status: 'RUNNING',
        leaseToken,
        leaseUntil: new Date(now.getTime() + duration),
        attempts: { increment: 1 },
        failureCode: null,
        retryable: false,
      },
    });
    if (!claimed.count) {
      await this.prisma.resultImportExecutionUnit.updateMany({
        where: { ...claimable, attempts: { gte: maxAttempts } },
        data: {
          status: 'FAILED',
          leaseUntil: null,
          leaseToken: null,
          retryable: true,
          failureCode: 'official_results.import.lease_exhausted',
        },
      });
      return;
    }
    const guard: Prisma.ResultImportExecutionUnitWhereInput = {
      ...key,
      status: 'RUNNING',
      leaseToken,
    };
    const claim = await this.prisma.resultImportExecutionUnit.findFirst({
      where: guard,
      select: { attempts: true },
    });
    if (!claim) return;
    try {
      await this.commands.transaction(async (client) => {
        const access = await this.auth.permissions(client, actor, {
          write: true,
        });
        if (!officialResultsExposed(operation.schoolId)) {
          await client.resultImportExecutionUnit.updateMany({
            where: guard,
            data: {
              status: 'QUEUED',
              leaseUntil: null,
              leaseToken: null,
              attempts: { decrement: 1 },
            },
          });
          return;
        }
        const fenced = await client.resultImportExecutionUnit.updateMany({
          where: { ...guard, leaseUntil: { gt: new Date() } },
          data: { leaseUntil: new Date(Date.now() + duration) },
        });
        if (!fenced.count) return;
        if (
          !plan ||
          plan.status !== 'READY' ||
          !plan.changes.length ||
          resultContentDigest(binding) !== operation.review.digest ||
          resultContentDigest(allUnits.flatMap((item) => item.changes)) !==
            binding.changeSetSha256 ||
          resultContentDigest(
            allUnits.flatMap((item) => item.validationReadSet),
          ) !== binding.validationReadSetSha256 ||
          !binding.selectedSheetIds.includes(unit.sheetId)
        )
          throw new OfficialResultsError('preview.stale');
        this.assertUnexpired(operation, actor, binding);
        const workspace = await this.gate.lockAndVerify(client, access, plan);
        this.assertUnexpired(operation, actor, binding);
        const result = await this.gate.apply(
          client,
          access,
          workspace,
          plan,
          unit.id,
        );
        if (result.changedCells.length !== plan.changes.length)
          throw new OfficialResultsError('preview.stale');
        const committed = await client.resultImportExecutionUnit.updateMany({
          where: guard,
          data: {
            status: 'APPLIED',
            leaseUntil: null,
            leaseToken: null,
            changedCells: result.changedCells.length,
            committedAt: new Date(),
          },
        });
        if (!committed.count) throw new OfficialResultsError('preview.stale');
        await this.commands.audit(
          client,
          actor,
          'imports.apply',
          'ResultImportExecutionUnit',
          unit.id,
          {
            operationId: operation.id,
            sheetId: unit.sheetId,
            changedCells: result.changedCells.length,
          },
        );
      }, importCommitBounds);
    } catch (error) {
      const retryable = transient(error);
      const willRetry = retryable && claim.attempts < maxAttempts;
      const failureCode =
        error instanceof DomainException
          ? error.code
          : 'official_results.import.commit_unavailable';
      await this.prisma.resultImportExecutionUnit.updateMany({
        where: guard,
        data: {
          status: willRetry ? 'QUEUED' : 'FAILED',
          leaseToken: null,
          leaseUntil: null,
          retryable: !willRetry && retryable,
          failureCode,
        },
      });
      if (willRetry) {
        this.logger.warn({
          event: 'official_results.import.commit_retry',
          operationId: operation.id,
          unitId: unit.id,
        });
        throw new Error('official_results.import.commit_retry');
      }
    }
  }

  private assertUnexpired(
    operation: Execution,
    actor: ResultActor,
    binding: ImportReviewBinding,
  ) {
    const { batch, review } = operation;
    const now = new Date();
    const exportState = batch.export;
    if (
      batch.revision !== operation.batchRevision ||
      batch.status !== 'APPLYING' ||
      binding.batchId !== batch.id ||
      binding.schoolId !== actor.schoolId ||
      binding.actorId !== actor.actorId ||
      binding.batchRevision !== operation.batchRevision ||
      binding.sourceVersion !== batch.sourceVersion ||
      binding.sourceByteSha256 !== review.source.checksum ||
      binding.exportId !== exportState.id ||
      exportState.mode !== 'EDIT_DRAFT' ||
      !review.source.storedAt ||
      review.source.deletedAt
    )
      throw new OfficialResultsError('preview.stale');
    if (
      batch.expiresAt <= now ||
      review.expiresAt <= now ||
      review.source.expiresAt <= now ||
      exportState.reuseUntil <= now
    )
      throw new OfficialResultsError('import.export_expired');
  }

  async reconcile() {
    const candidates = await this.prisma.resultImportExecution.findMany({
      where: {
        ...officialResultsPilotWhere(),
        status: { in: [...pendingStates] },
        units: { none: { status: 'RUNNING', leaseUntil: { gt: new Date() } } },
      },
      take: 100,
      orderBy: { updatedAt: 'asc' },
      select: { id: true, dispatchRevision: true },
    });
    for (const job of candidates)
      await ensureImportExecution(this.queue, job.id, job.dispatchRevision);
  }
}
