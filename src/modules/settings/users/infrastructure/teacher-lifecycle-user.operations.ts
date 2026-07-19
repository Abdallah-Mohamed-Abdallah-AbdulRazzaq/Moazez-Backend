import { Prisma, type UserStatus, type UserType } from '@prisma/client';
import type {
  TeacherLifecycleIdentityConflictField,
  TeacherLifecycleInvitedUserInput,
  TeacherLifecycleUserIdentityFields,
  TeacherLifecycleUserState,
} from '../../../teachers/lifecycle/application/teacher-lifecycle-unit-of-work';
import { projectTeacherCredentialSummary as projectCredentialSummary } from '../../../teachers/lifecycle/application/teacher-lifecycle-unit-of-work';

const TEACHER_LIFECYCLE_USER_SELECT = Prisma.validator<Prisma.UserSelect>()({
  id: true,
  email: true,
  username: true,
  contactEmail: true,
  phone: true,
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

export async function findTeacherLifecycleIdentityConflicts(
  transaction: Prisma.TransactionClient,
  input: { userId: string; fields: TeacherLifecycleUserIdentityFields },
): Promise<TeacherLifecycleIdentityConflictField[]> {
  return findIdentityConflicts(transaction, input.fields, input.userId);
}

export async function findTeacherLifecycleProvisioningIdentityConflicts(
  transaction: Prisma.TransactionClient,
  fields: TeacherLifecycleUserIdentityFields,
): Promise<TeacherLifecycleIdentityConflictField[]> {
  return findIdentityConflicts(transaction, fields);
}

async function findIdentityConflicts(
  transaction: Prisma.TransactionClient,
  fieldsInput: TeacherLifecycleUserIdentityFields,
  excludedUserId?: string,
): Promise<TeacherLifecycleIdentityConflictField[]> {
  const conditions: Prisma.UserWhereInput[] = [];
  if (fieldsInput.loginEmail !== undefined) {
    conditions.push({ email: fieldsInput.loginEmail });
  }
  if (fieldsInput.phone !== undefined && fieldsInput.phone !== null) {
    conditions.push({ phone: fieldsInput.phone });
  }
  if (conditions.length === 0) return [];

  const conflicts = await transaction.user.findMany({
    where: {
      ...(excludedUserId ? { id: { not: excludedUserId } } : {}),
      OR: conditions,
    },
    orderBy: { id: 'asc' },
    take: 2,
    select: { email: true, phone: true },
  });
  const fields = new Set<TeacherLifecycleIdentityConflictField>();
  for (const conflict of conflicts) {
    if (
      fieldsInput.loginEmail !== undefined &&
      conflict.email === fieldsInput.loginEmail
    ) {
      fields.add(
        fieldsInput.username !== undefined ? 'username' : 'loginEmail',
      );
    }
    if (
      fieldsInput.phone !== undefined &&
      conflict.phone === fieldsInput.phone
    ) {
      fields.add('phone');
    }
  }
  return [...fields].sort();
}

export async function createTeacherLifecycleInvitedUser(
  transaction: Prisma.TransactionClient,
  input: TeacherLifecycleInvitedUserInput,
): Promise<TeacherLifecycleUserState> {
  const record = await transaction.user.create({
    data: {
      email: input.loginEmail,
      username: input.username ?? null,
      contactEmail: input.contactEmail ?? null,
      phone: input.phone ?? null,
      firstName: input.firstName,
      lastName: input.lastName,
      userType: 'TEACHER',
      status: 'INVITED',
    },
    select: TEACHER_LIFECYCLE_USER_SELECT,
  });
  return projectTeacherLifecycleUserState(record);
}

export async function updateTeacherLifecycleIdentityFields(
  transaction: Prisma.TransactionClient,
  input: { userId: string; fields: TeacherLifecycleUserIdentityFields },
): Promise<TeacherLifecycleUserState> {
  const record = await transaction.user.update({
    where: { id: input.userId },
    data: {
      ...(input.fields.loginEmail !== undefined
        ? { email: input.fields.loginEmail }
        : {}),
      ...(input.fields.username !== undefined
        ? { username: input.fields.username }
        : {}),
      ...(input.fields.contactEmail !== undefined
        ? { contactEmail: input.fields.contactEmail }
        : {}),
      ...(input.fields.phone !== undefined
        ? { phone: input.fields.phone }
        : {}),
    },
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
  return {
    id: record.id,
    loginEmail: record.email,
    username: record.username,
    contactEmail: record.contactEmail,
    phone: record.phone,
    firstName: record.firstName,
    lastName: record.lastName,
    userType: record.userType,
    status: record.status,
    deletedAt: record.deletedAt,
    credential: projectCredentialSummary(record),
  };
}
