import { randomUUID } from 'node:crypto';
import {
  MembershipStatus,
  PrismaClient,
  TeacherEmploymentStatus,
  TeacherGender,
  UserStatus,
  UserType,
} from '@prisma/client';

const classifier =
  require('../../scripts/classify-teacher-directory-reality-0a.cjs') as {
    classifyReality: (
      prisma: PrismaClient,
      options: { asOf: Date; sampleLimit: number },
    ) => Promise<{ counts: Record<string, number>; anomalies: unknown }>;
  };

jest.setTimeout(120_000);

describe('Teacher reality classifier closeout (disposable database)', () => {
  const marker = `classifier-closeout-${randomUUID().slice(0, 8)}`;
  const asOf = new Date('2026-07-20T12:00:00.000Z');
  let prisma: PrismaClient;
  let organizationId: string;
  let schoolAId: string;
  let schoolBId: string;
  let teacherRoleId: string;
  const userIds: string[] = [];

  beforeAll(async () => {
    assertDisposableDatabase();
    prisma = new PrismaClient();
    await prisma.$connect();
    const role = await prisma.role.findFirst({
      where: {
        key: 'teacher',
        schoolId: null,
        isSystem: true,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!role) throw new Error('Synthetic classifier Teacher Role is missing');
    teacherRoleId = role.id;
    const organization = await prisma.organization.create({
      data: { name: marker, slug: marker },
      select: { id: true },
    });
    organizationId = organization.id;
    const [schoolA, schoolB] = await Promise.all([
      prisma.school.create({
        data: {
          organizationId,
          name: `${marker}-a`,
          slug: `${marker}-a`,
        },
        select: { id: true },
      }),
      prisma.school.create({
        data: {
          organizationId,
          name: `${marker}-b`,
          slug: `${marker}-b`,
        },
        select: { id: true },
      }),
    ]);
    schoolAId = schoolA.id;
    schoolBId = schoolB.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.teacherProfile.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.membership.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.school.deleteMany({
      where: { id: { in: [schoolAId, schoolBId] } },
    });
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  it('classifies structural and fail-closed fixtures without emitting PII', async () => {
    const valid = await createUser('valid', UserStatus.ACTIVE);
    await createMembership(valid, schoolAId, MembershipStatus.ACTIVE, null);
    await createProfile(valid, schoolAId, true);

    const incomplete = await createUser('incomplete', UserStatus.DISABLED);
    await createMembership(
      incomplete,
      schoolAId,
      MembershipStatus.INACTIVE,
      new Date('2026-07-19T12:00:00.000Z'),
    );
    await createProfile(incomplete, schoolAId, false);

    const missingProfile = await createUser(
      'operational-missing-profile',
      UserStatus.ACTIVE,
    );
    await createMembership(
      missingProfile,
      schoolAId,
      MembershipStatus.ACTIVE,
      null,
    );

    const missingMembership = await createUser(
      'profile-missing-membership',
      UserStatus.DISABLED,
    );
    await createProfile(missingMembership, schoolAId, true);

    const transferredLive = await createUser(
      'transferred-live-profile',
      UserStatus.DISABLED,
    );
    await createMembership(
      transferredLive,
      schoolAId,
      MembershipStatus.TRANSFERRED,
      new Date('2026-07-19T12:00:00.000Z'),
    );
    await createProfile(transferredLive, schoolAId, true);

    const report = await classifier.classifyReality(prisma, {
      asOf,
      sampleLimit: 0,
    });
    expect(report.counts.incompleteLiveProfile).toBeGreaterThanOrEqual(1);
    expect(
      report.counts.teacherUsersMissingLiveMatchingProfile,
    ).toBeGreaterThanOrEqual(1);
    expect(
      report.counts.liveProfileWithoutMatchingOperationalTeacherMembership,
    ).toBeGreaterThanOrEqual(2);
    expect(
      report.counts.transferredMembershipWhoseSourceProfileRemainsLive,
    ).toBeGreaterThanOrEqual(1);
    expect(
      report.counts
        .activeTeacherMembershipWithoutMatchingLiveDestinationProfile,
    ).toBeGreaterThanOrEqual(1);
    const serializedReport = JSON.stringify(report);
    expect(serializedReport).not.toMatch(/@closeout\.invalid|Synthetic/iu);
    expect(serializedReport).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu,
    );
  });

  it('proves the database prevents two simultaneous live Profiles', async () => {
    const userId = await createUser('live-uniqueness', UserStatus.DISABLED);
    await createProfile(userId, schoolAId, true);
    await expect(createProfile(userId, schoolBId, true)).rejects.toMatchObject({
      code: 'P2002',
    });
    await expect(
      prisma.teacherProfile.count({ where: { userId, deletedAt: null } }),
    ).resolves.toBe(1);
  });

  async function createUser(
    label: string,
    status: UserStatus,
  ): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `${marker}-${label}-${randomUUID()}@closeout.invalid`,
        firstName: 'Synthetic',
        lastName: 'Classifier',
        userType: UserType.TEACHER,
        status,
      },
      select: { id: true },
    });
    userIds.push(user.id);
    return user.id;
  }

  function createMembership(
    userId: string,
    schoolId: string,
    status: MembershipStatus,
    endedAt: Date | null,
  ) {
    return prisma.membership.create({
      data: {
        userId,
        organizationId,
        schoolId,
        roleId: teacherRoleId,
        userType: UserType.TEACHER,
        status,
        endedAt,
      },
    });
  }

  function createProfile(userId: string, schoolId: string, complete: boolean) {
    return prisma.teacherProfile.create({
      data: {
        userId,
        schoolId,
        teacherCode: complete
          ? `C${randomUUID().slice(0, 8)}`.toUpperCase()
          : null,
        firstNameAr: complete ? 'معلم' : null,
        lastNameAr: complete ? 'اختباري' : null,
        firstNameEn: complete ? 'Synthetic' : null,
        lastNameEn: complete ? 'Classifier' : null,
        gender: complete ? TeacherGender.MALE : null,
        employmentStatus: complete
          ? TeacherEmploymentStatus.ACTIVE
          : TeacherEmploymentStatus.INACTIVE,
      },
    });
  }
});

function assertDisposableDatabase(): void {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('Disposable DATABASE_URL is required');
  const databaseName = decodeURIComponent(new URL(raw).pathname.slice(1));
  if (!/^moazez_1b7_closeout_[a-z0-9_]+$/u.test(databaseName)) {
    throw new Error(
      'Classifier tests require the closeout disposable database',
    );
  }
}
