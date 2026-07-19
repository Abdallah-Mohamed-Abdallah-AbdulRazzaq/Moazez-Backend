import { Prisma, type UserStatus, type UserType } from '@prisma/client';
import type {
  TeacherCredentialStatus,
  TeacherLifecycleUserState,
} from '../../../teachers/lifecycle/application/teacher-lifecycle-unit-of-work';

const TEACHER_LIFECYCLE_USER_SELECT = Prisma.validator<Prisma.UserSelect>()({
  id: true,
  firstName: true,
  lastName: true,
  userType: true,
  status: true,
  passwordHash: true,
  mustChangePassword: true,
  passwordProvisionedAt: true,
  passwordChangedAt: true,
  credentialVersion: true,
  deletedAt: true,
});

type TeacherLifecycleUserDatabaseRecord = Prisma.UserGetPayload<{
  select: typeof TEACHER_LIFECYCLE_USER_SELECT;
}>;

export async function findTeacherLifecycleUserState(
  transaction: Prisma.TransactionClient,
  userId: string,
): Promise<TeacherLifecycleUserState | null> {
  const record = await transaction.user.findUnique({
    where: { id: userId },
    select: TEACHER_LIFECYCLE_USER_SELECT,
  });
  return record ? projectTeacherLifecycleUserState(record) : null;
}

export async function updateTeacherLifecycleDisplayNames(
  transaction: Prisma.TransactionClient,
  input: { userId: string; firstName: string; lastName: string },
): Promise<TeacherLifecycleUserState> {
  const record = await transaction.user.update({
    where: { id: input.userId },
    data: { firstName: input.firstName, lastName: input.lastName },
    select: TEACHER_LIFECYCLE_USER_SELECT,
  });
  return projectTeacherLifecycleUserState(record);
}

export async function setTeacherLifecycleUserStatus(
  transaction: Prisma.TransactionClient,
  userId: string,
  status: UserStatus,
): Promise<TeacherLifecycleUserState> {
  const record = await transaction.user.update({
    where: { id: userId },
    data: { status },
    select: TEACHER_LIFECYCLE_USER_SELECT,
  });
  return projectTeacherLifecycleUserState(record);
}

export async function setTeacherLifecycleUserType(
  transaction: Prisma.TransactionClient,
  userId: string,
  userType: UserType,
): Promise<TeacherLifecycleUserState> {
  const record = await transaction.user.update({
    where: { id: userId },
    data: { userType },
    select: TEACHER_LIFECYCLE_USER_SELECT,
  });
  return projectTeacherLifecycleUserState(record);
}

export function projectTeacherLifecycleUserState(
  record: TeacherLifecycleUserDatabaseRecord,
): TeacherLifecycleUserState {
  const hasPassword = Boolean(record.passwordHash);
  return {
    id: record.id,
    firstName: record.firstName,
    lastName: record.lastName,
    userType: record.userType,
    status: record.status,
    deletedAt: record.deletedAt,
    credential: {
      hasPassword,
      status: deriveCredentialStatus({
        hasPassword,
        mustChangePassword: record.mustChangePassword,
        passwordProvisionedAt: record.passwordProvisionedAt,
        passwordChangedAt: record.passwordChangedAt,
      }),
      mustChangePassword: record.mustChangePassword,
      passwordProvisionedAt: record.passwordProvisionedAt,
      passwordChangedAt: record.passwordChangedAt,
      credentialVersion: record.credentialVersion,
    },
  };
}

function deriveCredentialStatus(input: {
  hasPassword: boolean;
  mustChangePassword: boolean;
  passwordProvisionedAt: Date | null;
  passwordChangedAt: Date | null;
}): TeacherCredentialStatus {
  if (!input.hasPassword) return 'missing';
  if (
    input.mustChangePassword &&
    input.passwordProvisionedAt !== null &&
    input.passwordChangedAt === null
  ) {
    return 'temporary_or_must_change';
  }
  return input.mustChangePassword ? 'must_change' : 'set';
}
