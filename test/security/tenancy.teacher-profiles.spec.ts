import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma, UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  withSoftDeleted,
} from '../../src/common/context/request-context';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { TeacherProfileRepository } from '../../src/modules/teachers/profile/infrastructure/teacher-profile.repository';

jest.setTimeout(120000);

describe('TeacherProfile data foundation and tenancy', () => {
  const marker = `teacher-profile-1a-${randomUUID().slice(0, 8)}`;
  let prisma: PrismaService;
  let repository: TeacherProfileRepository;
  let organizationId: string;
  let schoolAId: string;
  let schoolBId: string;
  const createdUserIds: string[] = [];
  const createdFileIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    repository = new TeacherProfileRepository(prisma);

    const organization = await prisma.organization.create({
      data: { name: `${marker}-organization`, slug: `${marker}-organization` },
      select: { id: true },
    });
    organizationId = organization.id;
    const [schoolA, schoolB] = await Promise.all([
      prisma.school.create({
        data: {
          organizationId,
          name: `${marker}-school-a`,
          slug: `${marker}-school-a`,
        },
        select: { id: true },
      }),
      prisma.school.create({
        data: {
          organizationId,
          name: `${marker}-school-b`,
          slug: `${marker}-school-b`,
        },
        select: { id: true },
      }),
    ]);
    schoolAId = schoolA.id;
    schoolBId = schoolB.id;
  });

  afterEach(async () => {
    await prisma.teacherProfile.deleteMany({
      where: { schoolId: { in: [schoolAId, schoolBId] } },
    });
    if (createdFileIds.length > 0) {
      await prisma.file.deleteMany({
        where: { id: { in: createdFileIds.splice(0) } },
      });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds.splice(0) } },
      });
    }
  });

  afterAll(async () => {
    await prisma.teacherProfile.deleteMany({
      where: { schoolId: { in: [schoolAId, schoolBId] } },
    });
    await prisma.file.deleteMany({
      where: { schoolId: { in: [schoolAId, schoolBId] } },
    });
    await prisma.school.deleteMany({
      where: { id: { in: [schoolAId, schoolBId] } },
    });
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  it('injects school scope, excludes soft-deleted rows, and allows explicit history', async () => {
    const userA = await createTeacherUser('scope-a');
    const userB = await createTeacherUser('scope-b');
    const archivedUser = await createTeacherUser('archived');
    const profileA = await createProfile(schoolAId, userA.id);
    const profileB = await createProfile(schoolBId, userB.id, {
      department: 'School B Department',
      notesEn: 'School B note',
    });
    const archived = await createProfile(schoolAId, archivedUser.id, {
      deletedAt: new Date('2026-07-01T00:00:00.000Z'),
    });

    await inSchoolA(async () => {
      await expect(
        repository.findLiveByCurrentSchoolProfileId(profileA.id),
      ).resolves.toMatchObject({
        id: profileA.id,
        schoolId: schoolAId,
      });
      await expect(
        repository.findLiveByCurrentSchoolProfileId(profileB.id),
      ).resolves.toBeNull();
      await expect(
        repository.findLiveByCurrentSchoolProfileId(archived.id),
      ).resolves.toBeNull();
      const archivedRecord =
        await repository.findCurrentSchoolByUserIdIncludingArchived(
          archivedUser.id,
        );
      expect(archivedRecord?.id).toBe(archived.id);
      expect(archivedRecord?.deletedAt).toBeInstanceOf(Date);

      const scoped = prisma.scoped as unknown as PrismaService;

      await expect(
        scoped.teacherProfile.findMany({
          where: { id: profileB.id },
          select: { id: true },
        }),
      ).resolves.toEqual([]);
      await expectSchoolBProfilePreserved(profileB.id);
      await expect(
        scoped.teacherProfile.findMany({
          where: { id: profileA.id },
          select: { id: true },
        }),
      ).resolves.toEqual([{ id: profileA.id }]);
      await expect(
        scoped.teacherProfile.findMany({
          where: { id: archived.id },
          select: { id: true },
        }),
      ).resolves.toEqual([]);
      await expect(
        withSoftDeleted(() =>
          scoped.teacherProfile.findMany({
            where: { id: archived.id },
            select: { id: true },
          }),
        ),
      ).resolves.toEqual([{ id: archived.id }]);

      await expect(
        scoped.teacherProfile.findUnique({
          where: { id: profileB.id },
          select: { id: true },
        }),
      ).resolves.toBeNull();
      await expectSchoolBProfilePreserved(profileB.id);
      await expect(
        scoped.teacherProfile.findUnique({
          where: { id: profileA.id },
          select: { id: true },
        }),
      ).resolves.toEqual({ id: profileA.id });
      await expect(
        scoped.teacherProfile.findUnique({
          where: { id: archived.id },
          select: { id: true },
        }),
      ).resolves.toBeNull();
      await expect(
        withSoftDeleted(() =>
          scoped.teacherProfile.findUnique({
            where: { id: archived.id },
            select: { id: true },
          }),
        ),
      ).resolves.toEqual({ id: archived.id });

      await expect(
        scoped.teacherProfile.count({ where: { id: profileB.id } }),
      ).resolves.toBe(0);
      await expectSchoolBProfilePreserved(profileB.id);
      await expect(
        scoped.teacherProfile.count({ where: { id: profileA.id } }),
      ).resolves.toBe(1);
      await expect(
        scoped.teacherProfile.count({ where: { id: archived.id } }),
      ).resolves.toBe(0);
      await expect(
        withSoftDeleted(() =>
          scoped.teacherProfile.count({ where: { id: archived.id } }),
        ),
      ).resolves.toBe(1);

      await expect(
        scoped.teacherProfile.update({
          where: { id: profileB.id },
          data: {
            department: 'must-not-cross-scope',
            notesEn: 'must-not-cross-scope',
          },
          select: { id: true },
        }),
      ).rejects.toMatchObject({ code: 'P2025' });
      await expectSchoolBProfilePreserved(profileB.id);
      await expect(
        scoped.teacherProfile.update({
          where: { id: profileA.id },
          data: { department: 'School A Updated Department' },
          select: { id: true, department: true },
        }),
      ).resolves.toEqual({
        id: profileA.id,
        department: 'School A Updated Department',
      });

      await expect(
        scoped.teacherProfile.updateMany({
          where: { id: profileB.id },
          data: { department: 'must-not-cross-scope' },
        }),
      ).resolves.toEqual({ count: 0 });
      await expectSchoolBProfilePreserved(profileB.id);

      await expect(
        scoped.teacherProfile.delete({
          where: { id: profileB.id },
          select: { id: true },
        }),
      ).rejects.toMatchObject({ code: 'P2025' });
      await expectSchoolBProfilePreserved(profileB.id);
      await expect(
        scoped.teacherProfile.deleteMany({ where: { id: profileB.id } }),
      ).resolves.toEqual({ count: 0 });
      await expectSchoolBProfilePreserved(profileB.id);
    });
  });

  it('enforces one profile per school/User and one live profile globally', async () => {
    const user = await createTeacherUser('history');
    await createProfile(schoolAId, user.id, {
      deletedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    await createProfile(schoolBId, user.id, {
      deletedAt: new Date('2026-06-01T00:00:00.000Z'),
    });

    await expect(
      createProfile(schoolAId, user.id, {
        deletedAt: new Date('2026-07-01T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'P2002' });

    await prisma.teacherProfile.deleteMany({ where: { userId: user.id } });
    await createProfile(schoolAId, user.id);
    await expect(createProfile(schoolBId, user.id)).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  it('allows null codes, scopes non-null code uniqueness to a school', async () => {
    const users = await Promise.all([
      createTeacherUser('code-1'),
      createTeacherUser('code-2'),
      createTeacherUser('code-3'),
      createTeacherUser('code-4'),
      createTeacherUser('code-5'),
    ]);
    await createProfile(schoolAId, users[0].id, { teacherCode: null });
    await createProfile(schoolAId, users[1].id, { teacherCode: null });
    await createProfile(schoolAId, users[2].id, { teacherCode: 'T01' });
    await expect(
      createProfile(schoolAId, users[3].id, { teacherCode: 'T01' }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      createProfile(schoolBId, users[4].id, { teacherCode: 'T01' }),
    ).resolves.toBeDefined();
  });

  it('enforces same-school avatar tenancy and Restrict relations', async () => {
    const user = await createTeacherUser('avatar');
    const otherUser = await createTeacherUser('avatar-cross');
    const fileA = await createFile(schoolAId, 'a');
    const fileB = await createFile(schoolBId, 'b');
    await createProfile(schoolAId, user.id, { avatarFileId: fileA.id });

    await expect(
      createProfile(schoolAId, otherUser.id, { avatarFileId: fileB.id }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.user.delete({ where: { id: user.id } }),
    ).rejects.toMatchObject({
      code: 'P2003',
    });
    await expect(
      prisma.file.delete({ where: { id: fileA.id } }),
    ).rejects.toMatchObject({
      code: 'P2003',
    });
    await expect(
      prisma.school.delete({ where: { id: schoolAId } }),
    ).rejects.toMatchObject({
      code: 'P2003',
    });
  });

  it.each([
    ['lowercase code', { teacherCode: 't01' }],
    ['whitespace code', { teacherCode: 'T 01' }],
    ['negative experience', { experienceYears: -1 }],
    ['excessive experience', { experienceYears: 61 }],
    ['unpaired time', { workStartTime: time('08:00'), workEndTime: null }],
    [
      'reversed time',
      { workStartTime: time('15:00'), workEndTime: time('08:00') },
    ],
    [
      'more than seven work days',
      {
        workingDays: [
          'SUNDAY',
          'MONDAY',
          'TUESDAY',
          'WEDNESDAY',
          'THURSDAY',
          'FRIDAY',
          'SATURDAY',
          'SUNDAY',
        ],
      },
    ],
  ])('rejects the %s integrity violation', async (_label, data) => {
    const user = await createTeacherUser(`check-${randomUUID().slice(0, 6)}`);
    await expect(
      createProfile(
        schoolAId,
        user.id,
        data as Prisma.TeacherProfileUncheckedCreateInput,
      ),
    ).rejects.toBeDefined();
  });

  it('enforces non-null working days at the PostgreSQL boundary', async () => {
    const columns = await prisma.$queryRaw<Array<{ is_nullable: string }>>`
      SELECT is_nullable
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'teacher_profiles'
        AND column_name = 'working_days'
    `;
    expect(columns).toEqual([{ is_nullable: 'NO' }]);

    const insertUser = await createTeacherUser('null-working-days-insert');
    await expect(
      prisma.$executeRaw`
        INSERT INTO "teacher_profiles" (
          "school_id",
          "user_id",
          "employment_status",
          "working_days",
          "updated_at"
        ) VALUES (
          CAST(${schoolAId} AS UUID),
          CAST(${insertUser.id} AS UUID),
          'INACTIVE'::"teacher_employment_status",
          CAST(${null} AS "teacher_work_day"[]),
          CURRENT_TIMESTAMP
        )
      `,
    ).rejects.toBeDefined();
    await expect(
      prisma.teacherProfile.count({ where: { userId: insertUser.id } }),
    ).resolves.toBe(0);

    const updateUser = await createTeacherUser('null-working-days-update');
    const updateProfile = await createProfile(schoolAId, updateUser.id);
    await expect(
      prisma.$executeRaw`
        UPDATE "teacher_profiles"
        SET "working_days" = CAST(${null} AS "teacher_work_day"[])
        WHERE "id" = CAST(${updateProfile.id} AS UUID)
      `,
    ).rejects.toBeDefined();
    await expect(
      prisma.teacherProfile.findUnique({
        where: { id: updateProfile.id },
        select: { workingDays: true },
      }),
    ).resolves.toEqual({ workingDays: [] });
  });

  it('installs the enums, table, partial index, and all named checks', async () => {
    const enums = await prisma.$queryRaw<Array<{ typname: string }>>`
      SELECT typname
      FROM pg_type
      WHERE typname IN (
        'teacher_gender',
        'teacher_employment_status',
        'teacher_employment_type',
        'teacher_work_day'
      )
      ORDER BY typname
    `;
    const indexes = await prisma.$queryRaw<
      Array<{ indexname: string; indexdef: string }>
    >`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND tablename = 'teacher_profiles'
    `;
    const checks = await prisma.$queryRaw<Array<{ conname: string }>>`
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = 'teacher_profiles'::regclass
        AND contype = 'c'
      ORDER BY conname
    `;

    expect(enums.map((row) => row.typname)).toEqual([
      'teacher_employment_status',
      'teacher_employment_type',
      'teacher_gender',
      'teacher_work_day',
    ]);
    const indexNames = indexes.map((row) => row.indexname);
    expect(indexNames).toContain('teacher_profiles_one_live_per_user_idx');
    expect(indexNames).toContain('teacher_profiles_school_id_teacher_code_key');
    expect(indexNames).toContain('teacher_profiles_school_id_user_id_key');
    expect(
      indexes.find(
        (row) => row.indexname === 'teacher_profiles_one_live_per_user_idx',
      )?.indexdef,
    ).toContain('WHERE (deleted_at IS NULL)');
    expect(checks.map((row) => row.conname)).toEqual([
      'teacher_profiles_experience_years_range_chk',
      'teacher_profiles_teacher_code_normalized_chk',
      'teacher_profiles_work_time_order_chk',
      'teacher_profiles_work_time_pair_chk',
      'teacher_profiles_working_days_cardinality_chk',
    ]);
  });

  it('does not register a runtime route or AppModule import', () => {
    const appModule = readFileSync(
      join(process.cwd(), 'src/app.module.ts'),
      'utf8',
    );
    expect(appModule).not.toContain('TeachersModule');
    expect(appModule).not.toContain("from './modules/teachers");
    expect(
      readFileSync(
        join(process.cwd(), 'src/modules/teachers/teachers.module.ts'),
        'utf8',
      ),
    ).not.toContain('controllers:');
  });

  async function createTeacherUser(label: string) {
    const user = await prisma.user.create({
      data: {
        email: `${marker}-${label}@example.invalid`,
        firstName: 'Legacy',
        lastName: 'Display',
        userType: UserType.TEACHER,
      },
      select: { id: true },
    });
    createdUserIds.push(user.id);
    return user;
  }

  async function createFile(schoolId: string, label: string) {
    const file = await prisma.file.create({
      data: {
        organizationId,
        schoolId,
        bucket: `${marker}-private`,
        objectKey: `${marker}/${label}/${randomUUID()}`,
        originalName: `${label}.png`,
        mimeType: 'image/png',
        sizeBytes: 1n,
        visibility: 'PRIVATE',
      },
      select: { id: true },
    });
    createdFileIds.push(file.id);
    return file;
  }

  function createProfile(
    schoolId: string,
    userId: string,
    data: Partial<Prisma.TeacherProfileUncheckedCreateInput> = {},
  ) {
    return prisma.teacherProfile.create({
      data: {
        schoolId,
        userId,
        employmentStatus: 'INACTIVE',
        workingDays: [],
        ...data,
      },
      select: { id: true },
    });
  }

  function inSchoolA<T>(callback: () => Promise<T>): Promise<T> {
    const context = createRequestContext(`${marker}-request`);
    context.activeMembership = {
      membershipId: randomUUID(),
      organizationId,
      schoolId: schoolAId,
      roleId: randomUUID(),
      permissions: [],
    };
    return runWithRequestContext(context, callback);
  }

  async function expectSchoolBProfilePreserved(profileId: string) {
    await expect(
      prisma.teacherProfile.findUnique({
        where: { id: profileId },
        select: {
          id: true,
          schoolId: true,
          department: true,
          notesEn: true,
          deletedAt: true,
        },
      }),
    ).resolves.toEqual({
      id: profileId,
      schoolId: schoolBId,
      department: 'School B Department',
      notesEn: 'School B note',
      deletedAt: null,
    });
  }
});

function time(value: string): Date {
  return new Date(`1970-01-01T${value}:00.000Z`);
}
