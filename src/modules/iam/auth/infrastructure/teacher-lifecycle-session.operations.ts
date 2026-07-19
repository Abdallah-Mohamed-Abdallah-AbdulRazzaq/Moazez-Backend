import type { Prisma } from '@prisma/client';

export async function revokeTeacherLifecycleUserSessionsInTransaction(
  transaction: Prisma.TransactionClient,
  userId: string,
  revokedAt: Date,
): Promise<number> {
  const result = await transaction.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt },
  });
  return result.count;
}
