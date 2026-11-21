import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { ResultActor } from '../../application/result-actor';
import { OfficialResultsError } from '../../domain/official-results.error';
import { resultContentDigest } from '../../domain/result-content-digest';

export function resultCommandKey(input: string | undefined): string {
  if (!input || !/^[\x21-\x7e]{1,128}$/u.test(input)) {
    throw new ValidationDomainException(
      'Idempotency-Key must contain 1 to 128 visible ASCII characters',
    );
  }
  return input;
}

@Injectable()
export class ResultCommandRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(
    run: (tx: Prisma.TransactionClient) => Promise<T>,
    bounds?: { timeout: number },
  ): Promise<T> {
    const scoped = this.prisma.scoped as unknown as PrismaService;
    return scoped.$transaction(run, {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      ...bounds,
    });
  }

  readSnapshot<T>(
    read: (tx: Prisma.TransactionClient) => Promise<T>,
    bounds?: { timeout: number },
  ): Promise<T> {
    const scoped = this.prisma.scoped as unknown as PrismaService;
    return scoped.$transaction(read, {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      ...bounds,
    });
  }

  async idempotent<T extends Prisma.InputJsonObject>(
    transaction: Prisma.TransactionClient,
    actor: ResultActor,
    operation: string,
    keyValue: string | undefined,
    input: unknown,
    run: () => Promise<T>,
  ): Promise<T> {
    const key = resultCommandKey(keyValue);
    const requestDigest = resultContentDigest(input);
    const scope = {
      schoolId: actor.schoolId,
      actorId: actor.actorId,
      operation,
      key,
    };
    const advisoryKey = JSON.stringify([
      scope.schoolId,
      scope.actorId,
      scope.operation,
      scope.key,
    ]);
    await transaction.$queryRaw<Array<{ locked: boolean }>>`
      SELECT pg_advisory_xact_lock(hashtextextended(${advisoryKey}::text, 0)) IS NULL AS locked
    `;
    const previous = await transaction.resultCommandReceipt.findFirst({
      where: scope,
      select: { requestDigest: true, outcome: true },
    });
    if (previous) {
      if (previous.requestDigest !== requestDigest) {
        throw new OfficialResultsError('idempotency.conflict');
      }
      return previous.outcome as T;
    }
    const outcome = await run();
    await transaction.resultCommandReceipt.create({
      data: { ...scope, requestDigest, outcome },
      select: { id: true },
    });
    return outcome;
  }

  async audit(
    transaction: Prisma.TransactionClient,
    actor: ResultActor,
    action: string,
    resourceType: string,
    resourceId: string,
    after: Prisma.InputJsonObject,
  ): Promise<void> {
    await transaction.auditLog.create({
      data: {
        schoolId: actor.schoolId,
        organizationId: actor.organizationId,
        actorId: actor.actorId,
        userType: actor.userType,
        module: 'official_results',
        action: `official_results.${action}`,
        resourceType,
        resourceId,
        outcome: 'SUCCESS',
        after,
      },
      select: { id: true },
    });
  }
}
