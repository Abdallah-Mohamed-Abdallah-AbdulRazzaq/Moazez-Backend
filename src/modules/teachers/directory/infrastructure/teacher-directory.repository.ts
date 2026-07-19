import { Injectable } from '@nestjs/common';
import {
  Prisma,
  UserType,
  type MembershipStatus,
  type TeacherEmploymentStatus,
  type TeacherGender,
  type UserStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { projectTeacherCredentialSummary } from '../../lifecycle/application/teacher-lifecycle-unit-of-work';
import { projectTeacherProfileCompleteness } from '../../profile/domain/teacher-profile.integrity';
import type {
  TeacherDirectoryPage,
  TeacherDirectoryRecord,
  TeacherProfileCompletenessFilter,
} from '../domain/teacher-directory.types';

const MEMBERSHIP_SELECT = {
  status: true,
  endedAt: true,
} as const satisfies Prisma.MembershipSelect;

const USER_SELECT_BASE = {
  id: true,
  email: true,
  username: true,
  contactEmail: true,
  phone: true,
  firstName: true,
  lastName: true,
  status: true,
  passwordHash: true,
  mustChangePassword: true,
  passwordProvisionedAt: true,
  passwordChangedAt: true,
  credentialVersion: true,
} as const satisfies Prisma.UserSelect;

function exactMembershipWhere(schoolId: string): Prisma.MembershipWhereInput {
  return {
    schoolId,
    userType: UserType.TEACHER,
    deletedAt: null,
    role: {
      is: {
        key: 'teacher',
        deletedAt: null,
        OR: [{ schoolId: null }, { schoolId }],
      },
    },
  };
}

function identityWhere(schoolId: string): Prisma.UserWhereInput {
  return {
    deletedAt: null,
    userType: UserType.TEACHER,
    memberships: { some: exactMembershipWhere(schoolId) },
  };
}

function buildListSelect(schoolId: string) {
  return {
    id: true,
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
    createdAt: true,
    updatedAt: true,
    user: {
      select: {
        ...USER_SELECT_BASE,
        memberships: {
          where: exactMembershipWhere(schoolId),
          orderBy: [{ startedAt: 'desc' as const }, { id: 'asc' as const }],
          take: 1,
          select: MEMBERSHIP_SELECT,
        },
      },
    },
  } as const satisfies Prisma.TeacherProfileSelect;
}

function buildDetailSelect(schoolId: string) {
  return {
    ...buildListSelect(schoolId),
    employmentType: true,
    experienceYears: true,
    hireDate: true,
    workingDays: true,
    workStartTime: true,
    workEndTime: true,
    notesAr: true,
    notesEn: true,
  } as const satisfies Prisma.TeacherProfileSelect;
}

type TeacherListDatabaseRecord = Prisma.TeacherProfileGetPayload<{
  select: ReturnType<typeof buildListSelect>;
}>;
type TeacherDetailDatabaseRecord = Prisma.TeacherProfileGetPayload<{
  select: ReturnType<typeof buildDetailSelect>;
}>;

export interface ListTeacherDirectoryInput {
  schoolId: string;
  search?: string;
  accountStatus?: UserStatus;
  membershipStatus?: MembershipStatus;
  employmentStatus?: TeacherEmploymentStatus;
  gender?: TeacherGender;
  profileCompleteness?: TeacherProfileCompletenessFilter;
  page: number;
  limit: number;
}

@Injectable()
export class TeacherDirectoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async list(input: ListTeacherDirectoryInput): Promise<TeacherDirectoryPage> {
    const where = buildDirectoryWhere(input);
    const skip = (input.page - 1) * input.limit;
    const recordsQuery = this.scopedPrisma.teacherProfile.findMany({
      where,
      orderBy: [
        { firstNameEn: { sort: 'asc', nulls: 'last' } },
        { lastNameEn: { sort: 'asc', nulls: 'last' } },
        { firstNameAr: { sort: 'asc', nulls: 'last' } },
        { lastNameAr: { sort: 'asc', nulls: 'last' } },
        { id: 'asc' },
      ],
      skip,
      take: input.limit,
      select: buildListSelect(input.schoolId),
    });
    const totalQuery = this.scopedPrisma.teacherProfile.count({ where });
    const [records, total] = await this.prisma.$transaction(
      [recordsQuery, totalQuery],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return {
      items: (records as TeacherListDatabaseRecord[]).map((record) =>
        projectTeacherDirectoryRecord(record),
      ),
      total,
    };
  }

  async findById(input: {
    schoolId: string;
    teacherId: string;
  }): Promise<TeacherDirectoryRecord | null> {
    const record = await this.scopedPrisma.teacherProfile.findFirst({
      where: {
        id: input.teacherId,
        schoolId: input.schoolId,
        deletedAt: null,
        user: { is: identityWhere(input.schoolId) },
      },
      select: buildDetailSelect(input.schoolId),
    });
    return record
      ? projectTeacherDirectoryRecord(record as TeacherDetailDatabaseRecord)
      : null;
  }
}

function buildDirectoryWhere(
  input: ListTeacherDirectoryInput,
): Prisma.TeacherProfileWhereInput {
  const normalizedSearch = input.search?.trim();
  const membershipWhere: Prisma.MembershipWhereInput = {
    ...exactMembershipWhere(input.schoolId),
    ...(input.membershipStatus ? { status: input.membershipStatus } : {}),
  };
  const clauses: Prisma.TeacherProfileWhereInput[] = [
    {
      schoolId: input.schoolId,
      deletedAt: null,
      ...(input.employmentStatus
        ? { employmentStatus: input.employmentStatus }
        : {}),
      ...(input.gender ? { gender: input.gender } : {}),
      user: {
        is: {
          deletedAt: null,
          userType: UserType.TEACHER,
          ...(input.accountStatus ? { status: input.accountStatus } : {}),
          memberships: { some: membershipWhere },
        },
      },
    },
  ];

  if (input.profileCompleteness) {
    clauses.push(profileCompletenessWhere(input.profileCompleteness));
  }
  if (normalizedSearch) {
    clauses.push({
      OR: [
        { teacherCode: contains(normalizedSearch) },
        { firstNameAr: contains(normalizedSearch) },
        { lastNameAr: contains(normalizedSearch) },
        { firstNameEn: contains(normalizedSearch) },
        { lastNameEn: contains(normalizedSearch) },
        { department: contains(normalizedSearch) },
        { specialization: contains(normalizedSearch) },
        {
          user: {
            is: {
              OR: [
                { email: containsRequired(normalizedSearch) },
                { username: contains(normalizedSearch) },
                { contactEmail: contains(normalizedSearch) },
                { phone: contains(normalizedSearch) },
                { firstName: containsRequired(normalizedSearch) },
                { lastName: containsRequired(normalizedSearch) },
              ],
            },
          },
        },
      ],
    });
  }
  return { AND: clauses };
}

function contains(value: string): Prisma.StringNullableFilter {
  return { contains: value, mode: Prisma.QueryMode.insensitive };
}

function containsRequired(value: string): Prisma.StringFilter {
  return { contains: value, mode: Prisma.QueryMode.insensitive };
}

function profileCompletenessWhere(
  filter: TeacherProfileCompletenessFilter,
): Prisma.TeacherProfileWhereInput {
  const complete: Prisma.TeacherProfileWhereInput = {
    teacherCode: { not: null },
    firstNameAr: { not: '' },
    lastNameAr: { not: '' },
    firstNameEn: { not: '' },
    lastNameEn: { not: '' },
    gender: { not: null },
  };
  return filter === 'complete'
    ? complete
    : {
        OR: [
          { teacherCode: null },
          { firstNameAr: null },
          { firstNameAr: '' },
          { lastNameAr: null },
          { lastNameAr: '' },
          { firstNameEn: null },
          { firstNameEn: '' },
          { lastNameEn: null },
          { lastNameEn: '' },
          { gender: null },
        ],
      };
}

function projectTeacherDirectoryRecord(
  record: TeacherListDatabaseRecord | TeacherDetailDatabaseRecord,
): TeacherDirectoryRecord {
  const membership = record.user.memberships[0];
  if (!membership) {
    throw new Error('Teacher Directory identity composition failed');
  }
  const detail = record as Partial<TeacherDetailDatabaseRecord>;
  return {
    id: record.id,
    userId: record.userId,
    loginEmail: record.user.email,
    username: record.user.username,
    contactEmail: record.user.contactEmail,
    phone: record.user.phone,
    teacherCode: record.teacherCode,
    firstNameAr: record.firstNameAr,
    lastNameAr: record.lastNameAr,
    firstNameEn: record.firstNameEn,
    lastNameEn: record.lastNameEn,
    displayFirstName: record.user.firstName,
    displayLastName: record.user.lastName,
    gender: record.gender,
    department: record.department,
    specialization: record.specialization,
    employmentType: detail.employmentType ?? null,
    experienceYears: detail.experienceYears ?? null,
    hireDate: detail.hireDate ?? null,
    workingDays: detail.workingDays ?? [],
    workStartTime: detail.workStartTime ?? null,
    workEndTime: detail.workEndTime ?? null,
    notesAr: detail.notesAr ?? null,
    notesEn: detail.notesEn ?? null,
    accountStatus: record.user.status,
    membershipStatus: membership.status,
    membershipEndedAt: membership.endedAt,
    employmentStatus: record.employmentStatus,
    profileCompleteness: projectTeacherProfileCompleteness(record),
    credentialSummary: projectTeacherCredentialSummary(record.user),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
