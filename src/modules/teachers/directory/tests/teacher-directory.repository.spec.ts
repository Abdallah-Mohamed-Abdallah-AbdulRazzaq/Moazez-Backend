import {
  MembershipStatus,
  TeacherEmploymentStatus,
  TeacherGender,
  UserStatus,
} from '@prisma/client';
import type { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { TeacherDirectoryRepository } from '../infrastructure/teacher-directory.repository';
import {
  presentTeacherDirectoryDetail,
  presentTeacherDirectoryListItem,
} from '../presenters/teacher-directory.presenter';

const IDS = {
  school: '41000000-0000-4000-8000-000000000001',
  user: '41000000-0000-4000-8000-000000000002',
  profile: '41000000-0000-4000-8000-000000000003',
};

function databaseRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: IDS.profile,
    userId: IDS.user,
    teacherCode: 'T001',
    firstNameAr: 'نور',
    lastNameAr: 'علي',
    firstNameEn: 'Nour',
    lastNameEn: 'Ali',
    gender: TeacherGender.FEMALE,
    employmentStatus: TeacherEmploymentStatus.ACTIVE,
    department: 'Science',
    specialization: 'Physics',
    employmentType: 'FULL_TIME',
    experienceYears: 7,
    hireDate: new Date('2026-01-10T00:00:00.000Z'),
    workingDays: ['SUNDAY', 'MONDAY'],
    workStartTime: new Date('1970-01-01T08:00:00.000Z'),
    workEndTime: new Date('1970-01-01T15:00:00.000Z'),
    notesAr: 'ملاحظة',
    notesEn: 'Managed note',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    user: {
      id: IDS.user,
      email: 'teacher@login.example',
      username: 'teacher',
      contactEmail: 'contact@example.test',
      phone: '+201001234567',
      firstName: 'Nour',
      lastName: 'Ali',
      status: UserStatus.ACTIVE,
      passwordHash: 'never-leave-repository',
      mustChangePassword: false,
      passwordProvisionedAt: new Date('2026-01-01T00:00:00.000Z'),
      passwordChangedAt: new Date('2026-01-02T00:00:00.000Z'),
      credentialVersion: 3,
      memberships: [{ status: MembershipStatus.ACTIVE, endedAt: null }],
    },
    ...overrides,
  };
}

function setup(records = [databaseRecord()]) {
  const findMany = jest.fn().mockResolvedValue(records);
  const count = jest.fn().mockResolvedValue(records.length);
  const findFirst = jest.fn().mockResolvedValue(records[0] ?? null);
  const prisma = {
    scoped: { teacherProfile: { findMany, count, findFirst } },
    $transaction: jest.fn(async (queries) => Promise.all(queries)),
  } as unknown as PrismaService;
  return {
    repository: new TeacherDirectoryRepository(prisma),
    findMany,
    count,
    findFirst,
  };
}

describe('TeacherDirectoryRepository', () => {
  it('uses current-school scoped Prisma, bounded pagination, and stable ordering', async () => {
    const { repository, findMany, count } = setup();
    const result = await repository.list({
      schoolId: IDS.school,
      page: 2,
      limit: 20,
    });
    const args = findMany.mock.calls[0][0];
    expect(args).toMatchObject({ skip: 20, take: 20 });
    expect(args.orderBy.at(-1)).toEqual({ id: 'asc' });
    expect(JSON.stringify(args.where)).toContain(IDS.school);
    expect(count).toHaveBeenCalledWith({ where: args.where });
    expect(result.total).toBe(1);
  });

  it.each([
    ['accountStatus', UserStatus.DISABLED],
    ['membershipStatus', MembershipStatus.SUSPENDED],
    ['employmentStatus', TeacherEmploymentStatus.INACTIVE],
    ['gender', TeacherGender.MALE],
    ['profileCompleteness', 'incomplete'],
  ] as const)('applies the supported %s filter', async (key, value) => {
    const { repository, findMany } = setup([]);
    await repository.list({
      schoolId: IDS.school,
      page: 1,
      limit: 20,
      [key]: value,
    });
    const serialized = JSON.stringify(findMany.mock.calls[0][0].where);
    if (key === 'profileCompleteness') {
      expect(serialized).toContain('"teacherCode":null');
      expect(serialized).toContain('"gender":null');
    } else {
      expect(serialized).toContain(String(value));
    }
  });

  it('combines filters and searches only the bounded approved directory fields', async () => {
    const { repository, findMany } = setup([]);
    await repository.list({
      schoolId: IDS.school,
      page: 1,
      limit: 10,
      search: 'physics',
      accountStatus: UserStatus.ACTIVE,
      membershipStatus: MembershipStatus.ACTIVE,
      employmentStatus: TeacherEmploymentStatus.ACTIVE,
      gender: TeacherGender.FEMALE,
      profileCompleteness: 'complete',
    });
    const serialized = JSON.stringify(findMany.mock.calls[0][0]);
    for (const field of [
      'teacherCode',
      'firstNameAr',
      'firstNameEn',
      'department',
      'specialization',
      'email',
      'username',
      'contactEmail',
      'phone',
    ]) {
      expect(serialized).toContain(field);
    }
    for (const forbidden of [
      'passwordHash.contains',
      'notesAr.contains',
      'sessions',
      'auditLogs',
      'objectKey',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('returns an empty page without fallback or cross-school reads', async () => {
    const { repository } = setup([]);
    await expect(
      repository.list({ schoolId: IDS.school, page: 1, limit: 20 }),
    ).resolves.toEqual({ items: [], total: 0 });
  });

  it('detail resolves through scoped Prisma with exact identity composition', async () => {
    const { repository, findFirst } = setup();
    const result = await repository.findById({
      schoolId: IDS.school,
      teacherId: IDS.profile,
    });
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(findFirst.mock.calls[0][0].where).toMatchObject({
      id: IDS.profile,
      schoolId: IDS.school,
      deletedAt: null,
    });
    expect(result?.id).toBe(IDS.profile);
  });

  it('reduces passwordHash before the application boundary', async () => {
    const { repository } = setup();
    const result = await repository.findById({
      schoolId: IDS.school,
      teacherId: IDS.profile,
    });
    expect(result?.credentialSummary).toMatchObject({
      hasPassword: true,
      status: 'set',
      credentialVersion: 3,
    });
    expect(JSON.stringify(result)).not.toContain('never-leave-repository');
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('represents an incomplete Profile without claiming active readiness', async () => {
    const { repository } = setup([
      databaseRecord({ teacherCode: null, gender: null }),
    ]);
    const result = await repository.findById({
      schoolId: IDS.school,
      teacherId: IDS.profile,
    });
    expect(result?.profileCompleteness).toEqual({
      isComplete: false,
      missingFields: ['teacherCode', 'gender'],
    });
    expect(result?.employmentStatus).toBe(TeacherEmploymentStatus.ACTIVE);
  });

  it('list presenter omits notes, schedule, internal ids, and credential material', async () => {
    const { repository } = setup();
    const record = await repository.findById({
      schoolId: IDS.school,
      teacherId: IDS.profile,
    });
    const item = presentTeacherDirectoryListItem(record!);
    for (const field of [
      'notesAr',
      'notesEn',
      'workingDays',
      'workStartTime',
      'workEndTime',
      'schoolId',
      'organizationId',
      'membershipId',
      'roleId',
      'passwordHash',
    ]) {
      expect(item).not.toHaveProperty(field);
    }
  });

  it('detail presenter includes only approved employment fields', async () => {
    const { repository } = setup();
    const record = await repository.findById({
      schoolId: IDS.school,
      teacherId: IDS.profile,
    });
    const detail = presentTeacherDirectoryDetail(record!);
    expect(detail).toMatchObject({
      hireDate: '2026-01-10',
      workingDays: ['SUNDAY', 'MONDAY'],
      workStartTime: '08:00:00',
      notesEn: 'Managed note',
    });
    expect(JSON.stringify(detail)).not.toContain('never-leave-repository');
  });
});
