import { Prisma, UserStatus, UserType } from '@prisma/client';

/** Shared Core ownership predicate; app adapters retain their existing behavior. */
export function currentParentGuardianWhere(
  parentUserId: string,
): Prisma.GuardianWhereInput {
  return {
    userId: parentUserId,
    deletedAt: null,
    user: {
      is: {
        id: parentUserId,
        userType: UserType.PARENT,
        status: UserStatus.ACTIVE,
        deletedAt: null,
      },
    },
  };
}
