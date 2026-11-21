import { Injectable } from '@nestjs/common';
import type { Prisma, ResultOperation } from '@prisma/client';
import { z } from 'zod/v4';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import type { ResultActor } from '../../application/result-actor';

export const materializationItem = z.object({
  sheetId: z.uuid(),
  reportingPeriodId: z.uuid(),
  classroomId: z.uuid(),
  groupId: z.uuid(),
  status: z.literal('COMPLETED'),
  created: z.boolean(),
  pendingPlacementCount: z.number().int().min(0).optional(),
});
export type MaterializationItem = z.infer<typeof materializationItem>;

export const releaseOperationItem = z.object({
  sheetId: z.uuid(),
  slotId: z.uuid(),
  releaseUnitId: z.uuid(),
  status: z.literal('COMPLETED'),
  candidateId: z.uuid().optional(),
  publicationId: z.uuid().optional(),
});
export const resultOperationItem = z.union([
  materializationItem,
  releaseOperationItem,
]);
type OperationItem = z.infer<typeof resultOperationItem>;

export const resultOperationCounts = z.object({
  total: z.number().int().min(0),
  completed: z.number().int().min(0),
  failed: z.number().int().min(0),
  pending: z.number().int().min(0),
  skipped: z.number().int().min(0),
});

export function presentResultOperation(
  operation: ResultOperation,
  actor: ResultActor,
) {
  const surface =
    actor.userType === 'TEACHER'
      ? 'teacher/official-results'
      : 'official-results';
  return {
    operationId: operation.id,
    operationType: operation.operationType,
    status: operation.status,
    counts: resultOperationCounts.parse(operation.counts),
    createdAt: operation.createdAt.toISOString(),
    updatedAt: operation.updatedAt.toISOString(),
    itemsPath: '/api/v1/' + surface + '/operations/' + operation.id + '/items',
  };
}

@Injectable()
export class ResultOperationRepository {
  createMaterialization(
    client: Prisma.TransactionClient,
    actor: ResultActor,
    items: MaterializationItem[],
  ) {
    return this.createBatch(client, actor, 'SHEET_MATERIALIZATION', items);
  }

  createBatch(
    client: Prisma.TransactionClient,
    actor: ResultActor,
    type: string,
    items: OperationItem[],
  ) {
    const counts = {
      total: items.length,
      completed: items.length,
      failed: 0,
      pending: 0,
      skipped: 0,
    };
    return client.resultOperation.create({
      data: {
        schoolId: actor.schoolId,
        actorId: actor.actorId,
        operationType: type,
        status: 'COMPLETED',
        counts,
        items,
      },
    });
  }

  async materialization(
    client: Prisma.TransactionClient,
    actor: ResultActor,
    id: string,
  ) {
    const operation = await client.resultOperation.findFirst({
      where: {
        id,
        schoolId: actor.schoolId,
        actorId: actor.actorId,
      },
    });
    if (!operation) throw new NotFoundDomainException();
    return {
      operation,
      items: z.array(resultOperationItem).parse(operation.items),
    };
  }
}
