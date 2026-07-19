import { Prisma, type TeacherEmploymentStatus } from '@prisma/client';
import type {
  TeacherLifecycleProfileManagedFields,
  TeacherLifecycleProfileState,
} from '../../lifecycle/application/teacher-lifecycle-unit-of-work';

const TEACHER_LIFECYCLE_PROFILE_SELECT =
  Prisma.validator<Prisma.TeacherProfileSelect>()({
    id: true,
    schoolId: true,
    userId: true,
    teacherCode: true,
    firstNameAr: true,
    lastNameAr: true,
    firstNameEn: true,
    lastNameEn: true,
    gender: true,
    employmentStatus: true,
    department: true,
    specialization: true,
    employmentType: true,
    experienceYears: true,
    hireDate: true,
    workingDays: true,
    workStartTime: true,
    workEndTime: true,
    notesAr: true,
    notesEn: true,
    createdAt: true,
    updatedAt: true,
    deletedAt: true,
  });

export class TeacherProfileLifecycleInvariantError extends Error {
  constructor(readonly reasonCode: string) {
    super('TeacherProfile lifecycle invariant failed');
    this.name = 'TeacherProfileLifecycleInvariantError';
  }
}

export function findLiveTeacherProfileByIdInTransaction(
  transaction: Prisma.TransactionClient,
  input: { schoolId: string; profileId: string },
): Promise<TeacherLifecycleProfileState | null> {
  return transaction.teacherProfile.findFirst({
    where: {
      id: input.profileId,
      schoolId: input.schoolId,
      deletedAt: null,
    },
    select: TEACHER_LIFECYCLE_PROFILE_SELECT,
  });
}

export function findArchivedTeacherProfileByIdInTransaction(
  transaction: Prisma.TransactionClient,
  input: { schoolId: string; profileId: string },
): Promise<TeacherLifecycleProfileState | null> {
  return transaction.teacherProfile.findFirst({
    where: {
      id: input.profileId,
      schoolId: input.schoolId,
      deletedAt: { not: null },
    },
    select: TEACHER_LIFECYCLE_PROFILE_SELECT,
  });
}

export function findTrustedTeacherProfileByIdIncludingArchivedInTransaction(
  transaction: Prisma.TransactionClient,
  input: { schoolId: string; profileId: string },
): Promise<TeacherLifecycleProfileState | null> {
  return transaction.teacherProfile.findFirst({
    where: { id: input.profileId, schoolId: input.schoolId },
    select: TEACHER_LIFECYCLE_PROFILE_SELECT,
  });
}

export function listLiveTeacherProfileFootprintsForUserInTransaction(
  transaction: Prisma.TransactionClient,
  userId: string,
): Promise<Array<{ id: string; schoolId: string; userId: string }>> {
  return transaction.teacherProfile.findMany({
    where: { userId, deletedAt: null },
    orderBy: { id: 'asc' },
    select: { id: true, schoolId: true, userId: true },
  });
}

export function findExactSchoolUserTeacherProfileFootprintInTransaction(
  transaction: Prisma.TransactionClient,
  input: { schoolId: string; userId: string },
): Promise<TeacherLifecycleProfileState | null> {
  return transaction.teacherProfile.findUnique({
    where: {
      schoolId_userId: {
        schoolId: input.schoolId,
        userId: input.userId,
      },
    },
    select: TEACHER_LIFECYCLE_PROFILE_SELECT,
  });
}

export async function createTeacherProfileInTransaction(
  transaction: Prisma.TransactionClient,
  input: {
    schoolId: string;
    userId: string;
    employmentStatus: TeacherEmploymentStatus;
    fields: TeacherLifecycleProfileManagedFields;
  },
): Promise<TeacherLifecycleProfileState> {
  const [exactFootprint, liveFootprint] = await Promise.all([
    transaction.teacherProfile.findUnique({
      where: {
        schoolId_userId: {
          schoolId: input.schoolId,
          userId: input.userId,
        },
      },
      select: { id: true },
    }),
    transaction.teacherProfile.findFirst({
      where: { userId: input.userId, deletedAt: null },
      select: { id: true },
    }),
  ]);
  if (exactFootprint) {
    throw new TeacherProfileLifecycleInvariantError(
      'same_school_profile_must_be_restored',
    );
  }
  if (liveFootprint) {
    throw new TeacherProfileLifecycleInvariantError(
      'live_teacher_profile_conflict',
    );
  }

  return transaction.teacherProfile.create({
    data: {
      schoolId: input.schoolId,
      userId: input.userId,
      employmentStatus: input.employmentStatus,
      ...profileManagedFieldsToData(input.fields),
    },
    select: TEACHER_LIFECYCLE_PROFILE_SELECT,
  });
}

export async function updateTeacherProfileInTransaction(
  transaction: Prisma.TransactionClient,
  input: {
    schoolId: string;
    profileId: string;
    fields: TeacherLifecycleProfileManagedFields;
  },
): Promise<TeacherLifecycleProfileState> {
  return updateProfileAndRead(transaction, {
    schoolId: input.schoolId,
    profileId: input.profileId,
    where: { deletedAt: null },
    data: profileManagedFieldsToData(input.fields),
  });
}

export async function restoreArchivedTeacherProfileInTransaction(
  transaction: Prisma.TransactionClient,
  input: {
    schoolId: string;
    profileId: string;
    userId: string;
    fields: TeacherLifecycleProfileManagedFields;
  },
): Promise<TeacherLifecycleProfileState> {
  const [exactFootprint, otherLiveFootprint] = await Promise.all([
    transaction.teacherProfile.findUnique({
      where: {
        schoolId_userId: {
          schoolId: input.schoolId,
          userId: input.userId,
        },
      },
      select: { id: true, deletedAt: true },
    }),
    transaction.teacherProfile.findFirst({
      where: {
        userId: input.userId,
        deletedAt: null,
        NOT: { id: input.profileId },
      },
      select: { id: true },
    }),
  ]);
  if (
    exactFootprint?.id !== input.profileId ||
    exactFootprint.deletedAt === null
  ) {
    throw new TeacherProfileLifecycleInvariantError(
      'archived_same_school_profile_required',
    );
  }
  if (otherLiveFootprint) {
    throw new TeacherProfileLifecycleInvariantError(
      'live_teacher_profile_conflict',
    );
  }

  return updateProfileAndRead(transaction, {
    schoolId: input.schoolId,
    profileId: input.profileId,
    where: { userId: input.userId, deletedAt: { not: null } },
    data: {
      ...profileManagedFieldsToData(input.fields),
      deletedAt: null,
    },
  });
}

export function setTeacherProfileEmploymentStatusInTransaction(
  transaction: Prisma.TransactionClient,
  input: {
    schoolId: string;
    profileId: string;
    expectedEmploymentStatus: TeacherEmploymentStatus;
    employmentStatus: TeacherEmploymentStatus;
  },
): Promise<TeacherLifecycleProfileState> {
  return updateProfileAndRead(transaction, {
    schoolId: input.schoolId,
    profileId: input.profileId,
    where: {
      deletedAt: null,
      employmentStatus: input.expectedEmploymentStatus,
    },
    data: { employmentStatus: input.employmentStatus },
  });
}

export function archiveTeacherProfileInTransaction(
  transaction: Prisma.TransactionClient,
  input: { schoolId: string; profileId: string; deletedAt: Date },
): Promise<TeacherLifecycleProfileState> {
  return updateProfileAndRead(transaction, {
    schoolId: input.schoolId,
    profileId: input.profileId,
    where: { deletedAt: null },
    data: { deletedAt: input.deletedAt },
  });
}

function profileManagedFieldsToData(
  fields: TeacherLifecycleProfileManagedFields,
) {
  return {
    ...(fields.teacherCode !== undefined
      ? { teacherCode: fields.teacherCode }
      : {}),
    ...(fields.firstNameAr !== undefined
      ? { firstNameAr: fields.firstNameAr }
      : {}),
    ...(fields.lastNameAr !== undefined
      ? { lastNameAr: fields.lastNameAr }
      : {}),
    ...(fields.firstNameEn !== undefined
      ? { firstNameEn: fields.firstNameEn }
      : {}),
    ...(fields.lastNameEn !== undefined
      ? { lastNameEn: fields.lastNameEn }
      : {}),
    ...(fields.gender !== undefined ? { gender: fields.gender } : {}),
    ...(fields.department !== undefined
      ? { department: fields.department }
      : {}),
    ...(fields.specialization !== undefined
      ? { specialization: fields.specialization }
      : {}),
    ...(fields.employmentType !== undefined
      ? { employmentType: fields.employmentType }
      : {}),
    ...(fields.experienceYears !== undefined
      ? { experienceYears: fields.experienceYears }
      : {}),
    ...(fields.hireDate !== undefined ? { hireDate: fields.hireDate } : {}),
    ...(fields.workingDays !== undefined
      ? { workingDays: fields.workingDays }
      : {}),
    ...(fields.workStartTime !== undefined
      ? { workStartTime: fields.workStartTime }
      : {}),
    ...(fields.workEndTime !== undefined
      ? { workEndTime: fields.workEndTime }
      : {}),
    ...(fields.notesAr !== undefined ? { notesAr: fields.notesAr } : {}),
    ...(fields.notesEn !== undefined ? { notesEn: fields.notesEn } : {}),
  };
}

async function updateProfileAndRead(
  transaction: Prisma.TransactionClient,
  input: {
    schoolId: string;
    profileId: string;
    where: Prisma.TeacherProfileWhereInput;
    data: Prisma.TeacherProfileUncheckedUpdateManyInput;
  },
): Promise<TeacherLifecycleProfileState> {
  const result = await transaction.teacherProfile.updateMany({
    where: {
      id: input.profileId,
      schoolId: input.schoolId,
      ...input.where,
    },
    data: input.data,
  });
  if (result.count !== 1) {
    throw new TeacherProfileLifecycleInvariantError(
      'profile_not_found_or_not_writable',
    );
  }
  return transaction.teacherProfile.findFirstOrThrow({
    where: { id: input.profileId, schoolId: input.schoolId },
    select: TEACHER_LIFECYCLE_PROFILE_SELECT,
  });
}
