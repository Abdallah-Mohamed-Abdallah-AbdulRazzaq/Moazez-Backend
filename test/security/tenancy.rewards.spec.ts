import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  FileVisibility,
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  RewardCatalogItemStatus,
  RewardCatalogItemType,
  RewardRedemptionRequestSource,
  RewardRedemptionStatus,
  SchoolStatus,
  StudentEnrollmentStatus,
  StudentStatus,
  UserStatus,
  UserType,
  XpSourceType,
} from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';

const GLOBAL_PREFIX = '/api/v1';
const DEMO_ADMIN_EMAIL = 'admin@academy.moazez.dev';
const DEMO_ADMIN_PASSWORD = 'School123!';
const TENANT_B_ORG_SLUG = 'rewards-tenancy-org-b';
const TENANT_B_SCHOOL_SLUG = 'rewards-tenancy-school-b';

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(45000);

describe('Rewards catalog tenancy isolation (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let demoSchoolId: string;
  let demoOrganizationId: string;
  let tenantBSchoolId: string;
  let tenantBOrganizationId: string;

  let demoYearId: string;
  let demoTermId: string;
  let demoFileId: string;
  let demoRewardId: string;
  let demoPublishedRewardId: string;
  let demoNoStockRewardId: string;
  let demoLowStockRewardId: string;
  let demoTeacherRequestRewardId: string;
  let demoStudentId: string;
  let demoEnrollmentId: string;
  let demoLowXpStudentId: string;
  let demoLowXpEnrollmentId: string;
  let demoRedemptionId: string;

  let tenantBYearId: string;
  let tenantBTermId: string;
  let tenantBFileId: string;
  let tenantBRewardId: string;
  let tenantBArchivedRewardId: string;
  let tenantBDeletedRewardId: string;
  let tenantBStudentId: string;
  let tenantBEnrollmentId: string;
  let tenantBRedemptionId: string;

  let noAccessEmail: string;
  let viewOnlyEmail: string;
  let teacherEmail: string;
  let parentEmail: string;
  let studentEmail: string;

  const password = 'RewardsSecurity123!';
  const testSuffix = `rewards-security-${Date.now()}`;
  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];
  const createdAcademicYearIds: string[] = [];
  const createdTermIds: string[] = [];
  const createdStageIds: string[] = [];
  const createdGradeIds: string[] = [];
  const createdSectionIds: string[] = [];
  const createdClassroomIds: string[] = [];
  const createdStudentIds: string[] = [];
  const createdEnrollmentIds: string[] = [];
  const createdFileIds: string[] = [];
  const createdRewardIds: string[] = [];
  const createdRedemptionIds: string[] = [];
  const createdXpLedgerIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const demoSchool = await prisma.school.findFirst({
      where: { slug: 'moazez-academy' },
      select: { id: true, organizationId: true },
    });
    if (!demoSchool) {
      throw new Error('Demo school not found - run `npm run seed` first.');
    }
    demoSchoolId = demoSchool.id;
    demoOrganizationId = demoSchool.organizationId;

    const [
      schoolAdminRole,
      teacherRole,
      parentRole,
      studentRole,
      rewardsViewPermission,
      rewardsManagePermission,
      rewardsRedemptionsViewPermission,
      rewardsRedemptionsRequestPermission,
      rewardsRedemptionsReviewPermission,
      rewardsFulfillPermission,
    ] = await Promise.all([
      prisma.role.findFirst({
        where: { key: 'school_admin', schoolId: null, isSystem: true },
        select: { id: true },
      }),
      prisma.role.findFirst({
        where: { key: 'teacher', schoolId: null, isSystem: true },
        select: { id: true },
      }),
      prisma.role.findFirst({
        where: { key: 'parent', schoolId: null, isSystem: true },
        select: { id: true },
      }),
      prisma.role.findFirst({
        where: { key: 'student', schoolId: null, isSystem: true },
        select: { id: true },
      }),
      prisma.permission.findUnique({
        where: { code: 'reinforcement.rewards.view' },
        select: { id: true },
      }),
      prisma.permission.findUnique({
        where: { code: 'reinforcement.rewards.manage' },
        select: { id: true },
      }),
      prisma.permission.findUnique({
        where: { code: 'reinforcement.rewards.redemptions.view' },
        select: { id: true },
      }),
      prisma.permission.findUnique({
        where: { code: 'reinforcement.rewards.redemptions.request' },
        select: { id: true },
      }),
      prisma.permission.findUnique({
        where: { code: 'reinforcement.rewards.redemptions.review' },
        select: { id: true },
      }),
      prisma.permission.findUnique({
        where: { code: 'reinforcement.rewards.fulfill' },
        select: { id: true },
      }),
    ]);

    if (
      !schoolAdminRole ||
      !teacherRole ||
      !parentRole ||
      !studentRole ||
      !rewardsViewPermission ||
      !rewardsManagePermission ||
      !rewardsRedemptionsViewPermission ||
      !rewardsRedemptionsRequestPermission ||
      !rewardsRedemptionsReviewPermission ||
      !rewardsFulfillPermission
    ) {
      throw new Error('Rewards roles or permissions missing - run seed.');
    }

    const demoAdmin = await prisma.user.findUnique({
      where: { email: DEMO_ADMIN_EMAIL },
      select: { id: true },
    });
    if (!demoAdmin) {
      throw new Error('Demo admin not found - run `npm run seed` first.');
    }
    await prisma.membership.updateMany({
      where: {
        userId: demoAdmin.id,
        schoolId: demoSchoolId,
        deletedAt: null,
      },
      data: {
        roleId: schoolAdminRole.id,
        userType: UserType.SCHOOL_USER,
        status: MembershipStatus.ACTIVE,
        endedAt: null,
      },
    });

    const noAccessRoleId = await createCustomRole('no-access', []);
    const viewOnlyRoleId = await createCustomRole('view-only', [
      rewardsViewPermission.id,
      rewardsRedemptionsViewPermission.id,
    ]);

    noAccessEmail = `${testSuffix}-no-access@security.moazez.local`;
    viewOnlyEmail = `${testSuffix}-view-only@security.moazez.local`;
    teacherEmail = `${testSuffix}-teacher@security.moazez.local`;
    parentEmail = `${testSuffix}-parent@security.moazez.local`;
    studentEmail = `${testSuffix}-student@security.moazez.local`;

    await createUserWithMembership(
      noAccessEmail,
      UserType.SCHOOL_USER,
      noAccessRoleId,
    );
    await createUserWithMembership(
      viewOnlyEmail,
      UserType.SCHOOL_USER,
      viewOnlyRoleId,
    );
    await createUserWithMembership(
      teacherEmail,
      UserType.TEACHER,
      teacherRole.id,
    );
    await createUserWithMembership(parentEmail, UserType.PARENT, parentRole.id);
    await createUserWithMembership(
      studentEmail,
      UserType.STUDENT,
      studentRole.id,
    );

    const orgB = await prisma.organization.upsert({
      where: { slug: TENANT_B_ORG_SLUG },
      update: { status: OrganizationStatus.ACTIVE },
      create: {
        slug: TENANT_B_ORG_SLUG,
        name: 'Rewards Tenancy Org B',
        status: OrganizationStatus.ACTIVE,
      },
    });
    tenantBOrganizationId = orgB.id;

    const schoolB = await prisma.school.upsert({
      where: {
        organizationId_slug: {
          organizationId: orgB.id,
          slug: TENANT_B_SCHOOL_SLUG,
        },
      },
      update: { status: SchoolStatus.ACTIVE },
      create: {
        organizationId: orgB.id,
        slug: TENANT_B_SCHOOL_SLUG,
        name: 'Rewards Tenancy School B',
        status: SchoolStatus.ACTIVE,
      },
    });
    tenantBSchoolId = schoolB.id;
    await cleanupTenantSchool(tenantBSchoolId);

    const demo = await createAcademicFixture('a', demoSchoolId);
    demoYearId = demo.yearId;
    demoTermId = demo.termId;
    demoFileId = await createFileFixture(
      demoSchoolId,
      demoOrganizationId,
      'reward-a.png',
    );

    const tenantB = await createAcademicFixture('b', tenantBSchoolId);
    tenantBYearId = tenantB.yearId;
    tenantBTermId = tenantB.termId;
    tenantBFileId = await createFileFixture(
      tenantBSchoolId,
      tenantBOrganizationId,
      'reward-b.png',
    );

    const demoStructure = await createClassroomFixture('a', demoSchoolId);
    const tenantBStructure = await createClassroomFixture('b', tenantBSchoolId);

    const demoStudent = await createStudentEnrollmentFixture({
      suffix: 'student-a',
      schoolId: demoSchoolId,
      organizationId: demoOrganizationId,
      academicYearId: demoYearId,
      termId: demoTermId,
      classroomId: demoStructure.classroomId,
    });
    demoStudentId = demoStudent.studentId;
    demoEnrollmentId = demoStudent.enrollmentId;

    const demoLowXpStudent = await createStudentEnrollmentFixture({
      suffix: 'low-xp-student-a',
      schoolId: demoSchoolId,
      organizationId: demoOrganizationId,
      academicYearId: demoYearId,
      termId: demoTermId,
      classroomId: demoStructure.classroomId,
    });
    demoLowXpStudentId = demoLowXpStudent.studentId;
    demoLowXpEnrollmentId = demoLowXpStudent.enrollmentId;

    const tenantBStudent = await createStudentEnrollmentFixture({
      suffix: 'student-b',
      schoolId: tenantBSchoolId,
      organizationId: tenantBOrganizationId,
      academicYearId: tenantBYearId,
      termId: tenantBTermId,
      classroomId: tenantBStructure.classroomId,
    });
    tenantBStudentId = tenantBStudent.studentId;
    tenantBEnrollmentId = tenantBStudent.enrollmentId;

    await createXpLedgerFixture({
      suffix: 'eligible-a',
      schoolId: demoSchoolId,
      academicYearId: demoYearId,
      termId: demoTermId,
      studentId: demoStudentId,
      enrollmentId: demoEnrollmentId,
      amount: 100,
    });
    await createXpLedgerFixture({
      suffix: 'eligible-b',
      schoolId: tenantBSchoolId,
      academicYearId: tenantBYearId,
      termId: tenantBTermId,
      studentId: tenantBStudentId,
      enrollmentId: tenantBEnrollmentId,
      amount: 999,
    });

    demoRewardId = await createRewardFixture({
      schoolId: demoSchoolId,
      academicYearId: demoYearId,
      termId: demoTermId,
      imageFileId: demoFileId,
      suffix: 'draft-a',
      status: RewardCatalogItemStatus.DRAFT,
    });
    demoPublishedRewardId = await createRewardFixture({
      schoolId: demoSchoolId,
      academicYearId: demoYearId,
      termId: demoTermId,
      imageFileId: demoFileId,
      suffix: 'published-a',
      status: RewardCatalogItemStatus.PUBLISHED,
    });
    demoNoStockRewardId = await createRewardFixture({
      schoolId: demoSchoolId,
      academicYearId: demoYearId,
      termId: demoTermId,
      imageFileId: demoFileId,
      suffix: 'no-stock-a',
      status: RewardCatalogItemStatus.PUBLISHED,
      isUnlimited: false,
      stockQuantity: 1,
      stockRemaining: 0,
    });
    demoLowStockRewardId = await createRewardFixture({
      schoolId: demoSchoolId,
      academicYearId: demoYearId,
      termId: demoTermId,
      imageFileId: demoFileId,
      suffix: 'low-stock-a',
      status: RewardCatalogItemStatus.PUBLISHED,
      isUnlimited: false,
      stockQuantity: 10,
      stockRemaining: 2,
    });
    demoTeacherRequestRewardId = await createRewardFixture({
      schoolId: demoSchoolId,
      academicYearId: demoYearId,
      termId: demoTermId,
      imageFileId: demoFileId,
      suffix: 'teacher-request-a',
      status: RewardCatalogItemStatus.PUBLISHED,
    });
    tenantBRewardId = await createRewardFixture({
      schoolId: tenantBSchoolId,
      academicYearId: tenantBYearId,
      termId: tenantBTermId,
      imageFileId: tenantBFileId,
      suffix: 'draft-b',
      status: RewardCatalogItemStatus.DRAFT,
    });
    tenantBArchivedRewardId = await createRewardFixture({
      schoolId: tenantBSchoolId,
      academicYearId: tenantBYearId,
      termId: tenantBTermId,
      imageFileId: tenantBFileId,
      suffix: 'archived-b',
      status: RewardCatalogItemStatus.ARCHIVED,
    });
    tenantBDeletedRewardId = await createRewardFixture({
      schoolId: tenantBSchoolId,
      academicYearId: tenantBYearId,
      termId: tenantBTermId,
      imageFileId: tenantBFileId,
      suffix: 'deleted-b',
      status: RewardCatalogItemStatus.PUBLISHED,
      deletedAt: new Date(),
    });

    demoRedemptionId = await createRedemptionFixture({
      schoolId: demoSchoolId,
      catalogItemId: demoPublishedRewardId,
      studentId: demoStudentId,
      enrollmentId: demoEnrollmentId,
      academicYearId: demoYearId,
      termId: demoTermId,
      status: RewardRedemptionStatus.REQUESTED,
    });
    tenantBRedemptionId = await createRedemptionFixture({
      schoolId: tenantBSchoolId,
      catalogItemId: tenantBRewardId,
      studentId: tenantBStudentId,
      enrollmentId: tenantBEnrollmentId,
      academicYearId: tenantBYearId,
      termId: tenantBTermId,
      status: RewardRedemptionStatus.REQUESTED,
    });

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(GLOBAL_PREFIX.replace(/^\//, ''));
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) {
      await prisma.rewardRedemption.deleteMany({
        where: { catalogItemId: { in: createdRewardIds } },
      });
      await prisma.rewardRedemption.deleteMany({
        where: { id: { in: createdRedemptionIds } },
      });
      await prisma.rewardCatalogItem.deleteMany({
        where: { id: { in: createdRewardIds } },
      });
      await prisma.xpLedger.deleteMany({
        where: { id: { in: createdXpLedgerIds } },
      });
      await prisma.enrollment.deleteMany({
        where: { id: { in: createdEnrollmentIds } },
      });
      await prisma.student.deleteMany({
        where: { id: { in: createdStudentIds } },
      });
      await prisma.file.deleteMany({ where: { id: { in: createdFileIds } } });
      await prisma.classroom.deleteMany({
        where: { id: { in: createdClassroomIds } },
      });
      await prisma.section.deleteMany({
        where: { id: { in: createdSectionIds } },
      });
      await prisma.grade.deleteMany({ where: { id: { in: createdGradeIds } } });
      await prisma.stage.deleteMany({ where: { id: { in: createdStageIds } } });
      await prisma.term.deleteMany({ where: { id: { in: createdTermIds } } });
      await prisma.academicYear.deleteMany({
        where: { id: { in: createdAcademicYearIds } },
      });
      await prisma.session.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.membership.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      await prisma.rolePermission.deleteMany({
        where: { roleId: { in: createdRoleIds } },
      });
      await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
      await prisma.$disconnect();
    }
  });

  it('school A cannot read school B reward catalog items', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/rewards/catalog/${tenantBRewardId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('school A catalog list does not include school B items', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/rewards/catalog`)
      .query({
        search: testSuffix,
        includeArchived: true,
        includeDeleted: true,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const ids = response.body.items.map((item: { id: string }) => item.id);
    expect(ids).toContain(demoRewardId);
    expect(ids).toContain(demoPublishedRewardId);
    expect(ids).not.toContain(tenantBRewardId);
    expect(ids).not.toContain(tenantBArchivedRewardId);
    expect(ids).not.toContain(tenantBDeletedRewardId);
  });

  it('school A cannot create rewards using school B references', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/rewards/catalog`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(catalogPayload({ academicYearId: tenantBYearId, termId: null }))
      .expect(404);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/rewards/catalog`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(catalogPayload({ academicYearId: null, termId: tenantBTermId }))
      .expect(404);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/rewards/catalog`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(catalogPayload({ imageFileId: tenantBFileId }))
      .expect(404);
  });

  it('school A cannot update, publish, or archive school B rewards', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/reinforcement/rewards/catalog/${tenantBRewardId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ titleEn: 'Leaked reward' })
      .expect(404);

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/rewards/catalog/${tenantBRewardId}/publish`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(404);

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/rewards/catalog/${tenantBRewardId}/archive`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reason: 'No leak' })
      .expect(404);
  });

  it('same-school actors without view permission get 403 for list and detail', async () => {
    const { accessToken } = await login(noAccessEmail);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/rewards/catalog`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/rewards/catalog/${demoRewardId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });

  it('same-school actors without manage permission get 403 for catalog mutations', async () => {
    const { accessToken } = await login(viewOnlyEmail);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/rewards/catalog`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(catalogPayload({ titleEn: `${testSuffix}-view-only-create` }))
      .expect(403);

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/reinforcement/rewards/catalog/${demoRewardId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ titleEn: `${testSuffix}-view-only-update` })
      .expect(403);

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/rewards/catalog/${demoRewardId}/publish`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(403);

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/rewards/catalog/${demoPublishedRewardId}/archive`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reason: 'Forbidden' })
      .expect(403);
  });

  it('admin can create, update, publish, and archive a reward without redemption or XP writes', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);
    const before = await catalogSideEffectCounts();

    const created = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/rewards/catalog`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(
        catalogPayload({
          titleEn: `${testSuffix}-api-admin-catalog`,
          isUnlimited: false,
          stockQuantity: 3,
          stockRemaining: 3,
        }),
      )
      .expect(201);
    createdRewardIds.push(created.body.id);

    expect(created.body).toMatchObject({
      status: 'draft',
      type: 'physical',
      stockQuantity: 3,
      stockRemaining: 3,
      isAvailable: false,
    });

    const updated = await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/reinforcement/rewards/catalog/${created.body.id}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ stockRemaining: 2, sortOrder: 7 })
      .expect(200);
    expect(updated.body).toMatchObject({
      stockRemaining: 2,
      sortOrder: 7,
    });

    const published = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/rewards/catalog/${created.body.id}/publish`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(201);
    expect(published.body).toMatchObject({
      status: 'published',
      publishedById: expect.any(String),
      isAvailable: true,
    });

    const archived = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/rewards/catalog/${created.body.id}/archive`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reason: 'Security closeout' })
      .expect(201);
    expect(archived.body).toMatchObject({
      status: 'archived',
      archivedById: expect.any(String),
      isAvailable: false,
    });

    const after = await catalogSideEffectCounts();
    expect(after.rewardRedemptions).toBe(before.rewardRedemptions);
    expect(after.xpLedger).toBe(before.xpLedger);
  });

  it('teacher can view catalog but cannot manage it', async () => {
    const { accessToken } = await login(teacherEmail);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/rewards/catalog`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/rewards/catalog/${demoRewardId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/rewards/catalog`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(catalogPayload({ titleEn: `${testSuffix}-teacher-forbidden` }))
      .expect(403);
  });

  it('parent and student actors cannot access dashboard reward catalog endpoints', async () => {
    for (const email of [parentEmail, studentEmail]) {
      const { accessToken } = await login(email);

      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/reinforcement/rewards/catalog`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    }
  });

  it('cross-school archived and soft-deleted rewards do not leak existence', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/reinforcement/rewards/catalog/${tenantBArchivedRewardId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/reinforcement/rewards/catalog/${tenantBDeletedRewardId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/rewards/catalog`)
      .query({ status: 'archived', includeDeleted: true, search: testSuffix })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const ids = response.body.items.map((item: { id: string }) => item.id);
    expect(ids).not.toContain(tenantBArchivedRewardId);
    expect(ids).not.toContain(tenantBDeletedRewardId);
  });

  it('school A overview does not include school B catalog, redemptions, XP, or recent rows', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/rewards/overview`)
      .query({
        academicYearId: demoYearId,
        termId: demoTermId,
        dateFrom: '2026-10-01',
        dateTo: '2026-10-02',
        includeArchived: true,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.xp).toMatchObject({
      totalEarnedXp: 100,
      studentsWithXp: 1,
      averageEarnedXp: 100,
    });
    expect(response.body.catalog.total).toBeGreaterThanOrEqual(1);
    expect(response.body.redemptions.total).toBeGreaterThanOrEqual(1);
    expect(
      response.body.recentRedemptions.map((row: { id: string }) => row.id),
    ).not.toContain(tenantBRedemptionId);
    expect(JSON.stringify(response.body)).not.toContain(tenantBRewardId);
    expect(JSON.stringify(response.body)).not.toContain(tenantBRedemptionId);
  });

  it('school A cannot read school B student reward summary', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    const response = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/reinforcement/rewards/students/${tenantBStudentId}/summary`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('school A catalog summary does not include school B catalog items or redemption counters', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/rewards/catalog-summary`)
      .query({
        academicYearId: demoYearId,
        termId: demoTermId,
        includeArchived: true,
        includeDeleted: true,
        dateFrom: '2026-10-01',
        dateTo: '2026-10-02',
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const itemIds = response.body.items.map((item: { id: string }) => item.id);
    expect(itemIds).toContain(demoPublishedRewardId);
    expect(itemIds).not.toContain(tenantBRewardId);
    expect(itemIds).not.toContain(tenantBArchivedRewardId);
    expect(itemIds).not.toContain(tenantBDeletedRewardId);
    expect(JSON.stringify(response.body)).not.toContain(tenantBRedemptionId);
  });

  it('same-school actors without reinforcement.rewards.view get 403 for overview and catalog summary', async () => {
    const { accessToken } = await login(noAccessEmail);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/rewards/overview`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/rewards/catalog-summary`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });

  it('same-school actors without reinforcement.rewards.redemptions.view get 403 for student summary', async () => {
    const { accessToken } = await login(noAccessEmail);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/reinforcement/rewards/students/${demoStudentId}/summary`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });

  it('admin and teacher can read overview, student summary, and catalog summary', async () => {
    for (const email of [DEMO_ADMIN_EMAIL, teacherEmail]) {
      const { accessToken } = await login(email);

      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/reinforcement/rewards/overview`)
        .query({ academicYearId: demoYearId, termId: demoTermId })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/reinforcement/rewards/students/${demoStudentId}/summary`,
        )
        .query({ academicYearId: demoYearId, termId: demoTermId })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/reinforcement/rewards/catalog-summary`)
        .query({ academicYearId: demoYearId, termId: demoTermId })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    }
  });

  it('parent and student actors cannot access core dashboard reward read-model endpoints', async () => {
    for (const email of [parentEmail, studentEmail]) {
      const { accessToken } = await login(email);

      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/reinforcement/rewards/overview`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/reinforcement/rewards/students/${demoStudentId}/summary`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/reinforcement/rewards/catalog-summary`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    }
  });

  it('read endpoints do not create rewards, redemptions, XP ledger rows, audit rows, or update stock', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);
    const before = await readModelSideEffectCounts(demoLowStockRewardId);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/rewards/overview`)
      .query({ academicYearId: demoYearId, termId: demoTermId })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/reinforcement/rewards/students/${demoStudentId}/summary`,
      )
      .query({ academicYearId: demoYearId, termId: demoTermId })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/rewards/catalog-summary`)
      .query({ academicYearId: demoYearId, termId: demoTermId })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const after = await readModelSideEffectCounts(demoLowStockRewardId);
    expect(after).toEqual(before);
  });

  it('student eligibility and recent redemptions do not leak cross-school rows', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    const summary = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/reinforcement/rewards/students/${demoStudentId}/summary`,
      )
      .query({ academicYearId: demoYearId, termId: demoTermId })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const openRedemptionIds = summary.body.eligibility.map(
      (row: { openRedemptionId: string | null }) => row.openRedemptionId,
    );
    expect(openRedemptionIds).toContain(demoRedemptionId);
    expect(openRedemptionIds).not.toContain(tenantBRedemptionId);
    expect(JSON.stringify(summary.body)).not.toContain(tenantBRedemptionId);

    const overview = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/rewards/overview`)
      .query({ academicYearId: demoYearId, termId: demoTermId })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(
      overview.body.recentRedemptions.map((row: { id: string }) => row.id),
    ).not.toContain(tenantBRedemptionId);
  });

  it('school A cannot read school B redemptions', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    const response = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/reinforcement/rewards/redemptions/${tenantBRedemptionId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('school A redemption list does not include school B redemptions', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/rewards/redemptions`)
      .query({ search: testSuffix, includeTerminal: true })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const ids = response.body.items.map((item: { id: string }) => item.id);
    expect(ids).toContain(demoRedemptionId);
    expect(ids).not.toContain(tenantBRedemptionId);
  });

  it('school A cannot create redemptions with school B resources', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/rewards/redemptions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(redemptionPayload({ catalogItemId: tenantBRewardId }))
      .expect(404);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/rewards/redemptions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(redemptionPayload({ studentId: tenantBStudentId }))
      .expect(404);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/rewards/redemptions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(redemptionPayload({ enrollmentId: tenantBEnrollmentId }))
      .expect(404);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/rewards/redemptions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(
        redemptionPayload({
          academicYearId: tenantBYearId,
          termId: null,
          catalogItemId: demoTeacherRequestRewardId,
        }),
      )
      .expect(404);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/rewards/redemptions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(
        redemptionPayload({
          termId: tenantBTermId,
          catalogItemId: demoTeacherRequestRewardId,
        }),
      )
      .expect(404);
  });

  it('school A cannot cancel school B redemptions', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    const response = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/rewards/redemptions/${tenantBRedemptionId}/cancel`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ cancellationReasonEn: 'No leak' })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('same-school actors without redemption view permission get 403 for list and detail', async () => {
    const { accessToken } = await login(noAccessEmail);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/rewards/redemptions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/reinforcement/rewards/redemptions/${demoRedemptionId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });

  it('same-school actors without redemption request permission get 403 for create and cancel', async () => {
    const { accessToken } = await login(viewOnlyEmail);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/rewards/redemptions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(redemptionPayload({ catalogItemId: demoTeacherRequestRewardId }))
      .expect(403);

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/rewards/redemptions/${demoRedemptionId}/cancel`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ cancellationReasonEn: 'Forbidden' })
      .expect(403);
  });

  it('admin can create and cancel redemption requests', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);
    const rewardId = await createRewardFixture({
      schoolId: demoSchoolId,
      academicYearId: demoYearId,
      termId: demoTermId,
      imageFileId: demoFileId,
      suffix: 'admin-redemption-api',
      status: RewardCatalogItemStatus.PUBLISHED,
      isUnlimited: false,
      stockQuantity: 2,
      stockRemaining: 2,
    });

    const created = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/rewards/redemptions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(redemptionPayload({ catalogItemId: rewardId }))
      .expect(201);
    createdRedemptionIds.push(created.body.id);

    expect(created.body).toMatchObject({
      catalogItemId: rewardId,
      studentId: demoStudentId,
      status: 'requested',
      requestSource: 'dashboard',
      eligibilitySnapshot: {
        minTotalXp: 10,
        totalEarnedXp: 100,
        eligible: true,
      },
    });

    const cancelled = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/rewards/redemptions/${created.body.id}/cancel`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ cancellationReasonEn: 'Security closeout' })
      .expect(201);

    expect(cancelled.body).toMatchObject({
      id: created.body.id,
      status: 'cancelled',
      cancelledById: expect.any(String),
      cancellationReasonEn: 'Security closeout',
    });
  });

  it('teacher can view and request redemptions but still cannot manage catalog', async () => {
    const { accessToken } = await login(teacherEmail);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/rewards/redemptions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/reinforcement/rewards/redemptions/${demoRedemptionId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const created = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/rewards/redemptions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(redemptionPayload({ catalogItemId: demoTeacherRequestRewardId }))
      .expect(201);
    createdRedemptionIds.push(created.body.id);
    expect(created.body.status).toBe('requested');

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/rewards/catalog`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(catalogPayload({ titleEn: `${testSuffix}-teacher-forbidden-2` }))
      .expect(403);
  });

  it('parent and student actors cannot access core dashboard redemption endpoints', async () => {
    for (const email of [parentEmail, studentEmail]) {
      const { accessToken } = await login(email);

      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/reinforcement/rewards/redemptions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/reinforcement/rewards/redemptions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(redemptionPayload({ catalogItemId: demoTeacherRequestRewardId }))
        .expect(403);
    }
  });

  it('duplicate open redemption requests are rejected', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/rewards/redemptions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(redemptionPayload({ catalogItemId: demoPublishedRewardId }))
      .expect(409);

    expect(response.body?.error?.code).toBe(
      'reinforcement.reward.duplicate_redemption',
    );
  });

  it('insufficient XP and no-stock limited rewards are rejected', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    const insufficient = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/rewards/redemptions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(
        redemptionPayload({
          catalogItemId: demoTeacherRequestRewardId,
          studentId: demoLowXpStudentId,
          enrollmentId: demoLowXpEnrollmentId,
        }),
      )
      .expect(422);
    expect(insufficient.body?.error?.code).toBe(
      'reinforcement.reward.insufficient_xp',
    );

    const noStock = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/rewards/redemptions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(redemptionPayload({ catalogItemId: demoNoStockRewardId }))
      .expect(409);
    expect(noStock.body?.error?.code).toBe('reinforcement.reward.out_of_stock');
  });

  it('redemption request and cancel do not write XP ledger rows or change reward stock', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);
    const rewardId = await createRewardFixture({
      schoolId: demoSchoolId,
      academicYearId: demoYearId,
      termId: demoTermId,
      imageFileId: demoFileId,
      suffix: 'side-effect-api',
      status: RewardCatalogItemStatus.PUBLISHED,
      isUnlimited: false,
      stockQuantity: 5,
      stockRemaining: 5,
    });
    const before = await redemptionSideEffectCounts(rewardId);

    const created = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/rewards/redemptions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(redemptionPayload({ catalogItemId: rewardId }))
      .expect(201);
    createdRedemptionIds.push(created.body.id);

    const afterRequest = await redemptionSideEffectCounts(rewardId);
    expect(afterRequest.xpLedger).toBe(before.xpLedger);
    expect(afterRequest.stockRemaining).toBe(before.stockRemaining);

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/rewards/redemptions/${created.body.id}/cancel`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ cancellationReasonEn: 'No stock restore expected' })
      .expect(201);

    const afterCancel = await redemptionSideEffectCounts(rewardId);
    expect(afterCancel.xpLedger).toBe(before.xpLedger);
    expect(afterCancel.stockRemaining).toBe(before.stockRemaining);
  });

  it('school A cannot approve, reject, or fulfill school B redemptions', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    for (const action of ['approve', 'reject', 'fulfill']) {
      const response = await request(app.getHttpServer())
        .post(
          `${GLOBAL_PREFIX}/reinforcement/rewards/redemptions/${tenantBRedemptionId}/${action}`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(404);

      expect(response.body?.error?.code).toBe('not_found');
    }
  });

  it('same-school actors without review or fulfill permissions get 403 for review endpoints', async () => {
    const { accessToken } = await login(viewOnlyEmail);

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/rewards/redemptions/${demoRedemptionId}/approve`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(403);

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/rewards/redemptions/${demoRedemptionId}/reject`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(403);

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/rewards/redemptions/${demoRedemptionId}/fulfill`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(403);
  });

  it('teacher cannot approve, reject, or fulfill redemptions', async () => {
    const { accessToken } = await login(teacherEmail);

    for (const action of ['approve', 'reject', 'fulfill']) {
      await request(app.getHttpServer())
        .post(
          `${GLOBAL_PREFIX}/reinforcement/rewards/redemptions/${demoRedemptionId}/${action}`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(403);
    }
  });

  it('parent and student actors cannot access core dashboard review endpoints', async () => {
    for (const email of [parentEmail, studentEmail]) {
      const { accessToken } = await login(email);

      for (const action of ['approve', 'reject', 'fulfill']) {
        await request(app.getHttpServer())
          .post(
            `${GLOBAL_PREFIX}/reinforcement/rewards/redemptions/${demoRedemptionId}/${action}`,
          )
          .set('Authorization', `Bearer ${accessToken}`)
          .send({})
          .expect(403);
      }
    }
  });

  it('approve rechecks insufficient XP and limited stock', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);
    const lowXpRewardId = await createRewardFixture({
      schoolId: demoSchoolId,
      academicYearId: demoYearId,
      termId: demoTermId,
      imageFileId: demoFileId,
      suffix: 'approve-low-xp',
      status: RewardCatalogItemStatus.PUBLISHED,
      minTotalXp: 10,
    });
    const lowXpRedemptionId = await createRedemptionFixture({
      schoolId: demoSchoolId,
      catalogItemId: lowXpRewardId,
      studentId: demoLowXpStudentId,
      enrollmentId: demoLowXpEnrollmentId,
      academicYearId: demoYearId,
      termId: demoTermId,
      status: RewardRedemptionStatus.REQUESTED,
    });

    const insufficient = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/rewards/redemptions/${lowXpRedemptionId}/approve`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(422);
    expect(insufficient.body?.error?.code).toBe(
      'reinforcement.reward.insufficient_xp',
    );

    const noStockRedemptionId = await createRedemptionFixture({
      schoolId: demoSchoolId,
      catalogItemId: demoNoStockRewardId,
      studentId: demoStudentId,
      enrollmentId: demoEnrollmentId,
      academicYearId: demoYearId,
      termId: demoTermId,
      status: RewardRedemptionStatus.REQUESTED,
    });

    const noStock = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/rewards/redemptions/${noStockRedemptionId}/approve`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(409);
    expect(noStock.body?.error?.code).toBe('reinforcement.reward.out_of_stock');
  });

  it('approve decrements limited stock exactly once and does not write XP ledger rows', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);
    const rewardId = await createRewardFixture({
      schoolId: demoSchoolId,
      academicYearId: demoYearId,
      termId: demoTermId,
      imageFileId: demoFileId,
      suffix: 'approve-stock-once',
      status: RewardCatalogItemStatus.PUBLISHED,
      isUnlimited: false,
      stockQuantity: 2,
      stockRemaining: 2,
    });
    const redemptionId = await createRedemptionFixture({
      schoolId: demoSchoolId,
      catalogItemId: rewardId,
      studentId: demoStudentId,
      enrollmentId: demoEnrollmentId,
      academicYearId: demoYearId,
      termId: demoTermId,
      status: RewardRedemptionStatus.REQUESTED,
    });
    const before = await redemptionSideEffectCounts(rewardId);

    const approved = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/rewards/redemptions/${redemptionId}/approve`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reviewNoteEn: 'Approved by security test' })
      .expect(201);

    expect(approved.body).toMatchObject({
      id: redemptionId,
      status: 'approved',
      reviewedById: expect.any(String),
      reviewNoteEn: 'Approved by security test',
      eligibilitySnapshot: {
        totalEarnedXp: 100,
        eligible: true,
        stockRemainingBeforeApproval: 2,
        stockRemainingAfterApproval: 1,
      },
    });

    const afterApprove = await redemptionSideEffectCounts(rewardId);
    expect(afterApprove.xpLedger).toBe(before.xpLedger);
    expect(afterApprove.stockRemaining).toBe(1);

    const duplicateApprove = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/rewards/redemptions/${redemptionId}/approve`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(409);
    expect(duplicateApprove.body?.error?.code).toBe(
      'reinforcement.reward.invalid_status_transition',
    );

    const cancelApproved = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/rewards/redemptions/${redemptionId}/cancel`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ cancellationReasonEn: 'Approved redemptions are fulfilled' })
      .expect(409);
    expect(cancelApproved.body?.error?.code).toBe(
      'reinforcement.redemption.not_requested',
    );

    const afterRejectedTransitions = await redemptionSideEffectCounts(rewardId);
    expect(afterRejectedTransitions.xpLedger).toBe(before.xpLedger);
    expect(afterRejectedTransitions.stockRemaining).toBe(1);
  });

  it('approve does not decrement stock for unlimited rewards', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);
    const rewardId = await createRewardFixture({
      schoolId: demoSchoolId,
      academicYearId: demoYearId,
      termId: demoTermId,
      imageFileId: demoFileId,
      suffix: 'approve-unlimited',
      status: RewardCatalogItemStatus.PUBLISHED,
      isUnlimited: true,
      stockQuantity: null,
      stockRemaining: null,
    });
    const redemptionId = await createRedemptionFixture({
      schoolId: demoSchoolId,
      catalogItemId: rewardId,
      studentId: demoStudentId,
      enrollmentId: demoEnrollmentId,
      academicYearId: demoYearId,
      termId: demoTermId,
      status: RewardRedemptionStatus.REQUESTED,
    });
    const before = await redemptionSideEffectCounts(rewardId);

    const approved = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/rewards/redemptions/${redemptionId}/approve`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(201);

    expect(approved.body).toMatchObject({
      status: 'approved',
      eligibilitySnapshot: {
        isUnlimited: true,
        stockRemainingBeforeApproval: null,
        stockRemainingAfterApproval: null,
      },
    });
    const after = await redemptionSideEffectCounts(rewardId);
    expect(after.xpLedger).toBe(before.xpLedger);
    expect(after.stockRemaining).toBeNull();
  });

  it('reject does not change stock or write XP ledger rows', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);
    const rewardId = await createRewardFixture({
      schoolId: demoSchoolId,
      academicYearId: demoYearId,
      termId: demoTermId,
      imageFileId: demoFileId,
      suffix: 'reject-side-effect',
      status: RewardCatalogItemStatus.PUBLISHED,
      isUnlimited: false,
      stockQuantity: 4,
      stockRemaining: 4,
    });
    const redemptionId = await createRedemptionFixture({
      schoolId: demoSchoolId,
      catalogItemId: rewardId,
      studentId: demoStudentId,
      enrollmentId: demoEnrollmentId,
      academicYearId: demoYearId,
      termId: demoTermId,
      status: RewardRedemptionStatus.REQUESTED,
    });
    const before = await redemptionSideEffectCounts(rewardId);

    const rejected = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/rewards/redemptions/${redemptionId}/reject`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reviewNoteEn: 'Not eligible today' })
      .expect(201);

    expect(rejected.body).toMatchObject({
      id: redemptionId,
      status: 'rejected',
      reviewedById: expect.any(String),
      reviewNoteEn: 'Not eligible today',
    });
    const after = await redemptionSideEffectCounts(rewardId);
    expect(after.xpLedger).toBe(before.xpLedger);
    expect(after.stockRemaining).toBe(before.stockRemaining);
  });

  it('fulfill requires approved status, completes approved redemptions, and writes no XP ledger rows', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);
    const rewardId = await createRewardFixture({
      schoolId: demoSchoolId,
      academicYearId: demoYearId,
      termId: demoTermId,
      imageFileId: demoFileId,
      suffix: 'fulfill-flow',
      status: RewardCatalogItemStatus.PUBLISHED,
      isUnlimited: false,
      stockQuantity: 3,
      stockRemaining: 3,
    });
    const redemptionId = await createRedemptionFixture({
      schoolId: demoSchoolId,
      catalogItemId: rewardId,
      studentId: demoStudentId,
      enrollmentId: demoEnrollmentId,
      academicYearId: demoYearId,
      termId: demoTermId,
      status: RewardRedemptionStatus.REQUESTED,
    });
    const before = await redemptionSideEffectCounts(rewardId);

    const notApproved = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/rewards/redemptions/${redemptionId}/fulfill`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(409);
    expect(notApproved.body?.error?.code).toBe(
      'reinforcement.redemption.not_approved',
    );

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/rewards/redemptions/${redemptionId}/approve`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(201);

    const afterApprove = await redemptionSideEffectCounts(rewardId);
    expect(afterApprove.xpLedger).toBe(before.xpLedger);
    expect(afterApprove.stockRemaining).toBe(2);

    const fulfilled = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/rewards/redemptions/${redemptionId}/fulfill`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fulfillmentNoteEn: 'Handed to student' })
      .expect(201);

    expect(fulfilled.body).toMatchObject({
      id: redemptionId,
      status: 'fulfilled',
      fulfilledById: expect.any(String),
      fulfillmentNoteEn: 'Handed to student',
    });

    const afterFulfill = await redemptionSideEffectCounts(rewardId);
    expect(afterFulfill.xpLedger).toBe(before.xpLedger);
    expect(afterFulfill.stockRemaining).toBe(2);

    const terminal = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/rewards/redemptions/${redemptionId}/fulfill`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(409);
    expect(terminal.body?.error?.code).toBe(
      'reinforcement.redemption.terminal',
    );
  });

  async function login(email: string): Promise<{ accessToken: string }> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({
        email,
        password: email === DEMO_ADMIN_EMAIL ? DEMO_ADMIN_PASSWORD : password,
      })
      .expect(200);

    return { accessToken: response.body.accessToken };
  }

  async function createCustomRole(
    keySuffix: string,
    permissionIds: string[],
  ): Promise<string> {
    const role = await prisma.role.create({
      data: {
        schoolId: demoSchoolId,
        key: `${testSuffix}-${keySuffix}`,
        name: `${testSuffix} ${keySuffix}`,
        isSystem: false,
      },
      select: { id: true },
    });
    createdRoleIds.push(role.id);

    if (permissionIds.length > 0) {
      await prisma.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({
          roleId: role.id,
          permissionId,
        })),
      });
    }

    return role.id;
  }

  async function createUserWithMembership(
    email: string,
    userType: UserType,
    roleId: string,
  ): Promise<void> {
    const user = await prisma.user.create({
      data: {
        email,
        firstName: 'Rewards',
        lastName: 'Security',
        userType,
        status: UserStatus.ACTIVE,
        passwordHash: await argon2.hash(password, ARGON2_OPTIONS),
      },
      select: { id: true },
    });
    createdUserIds.push(user.id);

    await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId: demoOrganizationId,
        schoolId: demoSchoolId,
        roleId,
        userType,
        status: MembershipStatus.ACTIVE,
      },
    });
  }

  async function createAcademicFixture(suffix: string, schoolId: string) {
    const year = await prisma.academicYear.create({
      data: {
        schoolId,
        nameAr: `${testSuffix}-year-${suffix}-ar`,
        nameEn: `${testSuffix}-year-${suffix}`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-06-30T00:00:00.000Z'),
        isActive: false,
      },
      select: { id: true },
    });
    createdAcademicYearIds.push(year.id);

    const term = await prisma.term.create({
      data: {
        schoolId,
        academicYearId: year.id,
        nameAr: `${testSuffix}-term-${suffix}-ar`,
        nameEn: `${testSuffix}-term-${suffix}`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        isActive: false,
      },
      select: { id: true },
    });
    createdTermIds.push(term.id);

    return { yearId: year.id, termId: term.id };
  }

  async function createFileFixture(
    schoolId: string,
    organizationId: string,
    name: string,
  ): Promise<string> {
    const file = await prisma.file.create({
      data: {
        schoolId,
        organizationId,
        bucket: 'rewards-security',
        objectKey: `${testSuffix}-${name}`,
        originalName: name,
        mimeType: 'image/png',
        sizeBytes: BigInt(256),
        visibility: FileVisibility.PRIVATE,
      },
      select: { id: true },
    });
    createdFileIds.push(file.id);
    return file.id;
  }

  async function createClassroomFixture(suffix: string, schoolId: string) {
    const stage = await prisma.stage.create({
      data: {
        schoolId,
        nameAr: `${testSuffix}-stage-${suffix}-ar`,
        nameEn: `${testSuffix}-stage-${suffix}`,
      },
      select: { id: true },
    });
    createdStageIds.push(stage.id);

    const grade = await prisma.grade.create({
      data: {
        schoolId,
        stageId: stage.id,
        nameAr: `${testSuffix}-grade-${suffix}-ar`,
        nameEn: `${testSuffix}-grade-${suffix}`,
      },
      select: { id: true },
    });
    createdGradeIds.push(grade.id);

    const section = await prisma.section.create({
      data: {
        schoolId,
        gradeId: grade.id,
        nameAr: `${testSuffix}-section-${suffix}-ar`,
        nameEn: `${testSuffix}-section-${suffix}`,
      },
      select: { id: true },
    });
    createdSectionIds.push(section.id);

    const classroom = await prisma.classroom.create({
      data: {
        schoolId,
        sectionId: section.id,
        nameAr: `${testSuffix}-classroom-${suffix}-ar`,
        nameEn: `${testSuffix}-classroom-${suffix}`,
      },
      select: { id: true },
    });
    createdClassroomIds.push(classroom.id);

    return {
      stageId: stage.id,
      gradeId: grade.id,
      sectionId: section.id,
      classroomId: classroom.id,
    };
  }

  async function createStudentEnrollmentFixture(params: {
    suffix: string;
    schoolId: string;
    organizationId: string;
    academicYearId: string;
    termId: string;
    classroomId: string;
  }) {
    const student = await prisma.student.create({
      data: {
        schoolId: params.schoolId,
        organizationId: params.organizationId,
        firstName: `Rewards ${params.suffix}`,
        lastName: 'Security',
        status: StudentStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdStudentIds.push(student.id);

    const enrollment = await prisma.enrollment.create({
      data: {
        schoolId: params.schoolId,
        studentId: student.id,
        academicYearId: params.academicYearId,
        termId: params.termId,
        classroomId: params.classroomId,
        status: StudentEnrollmentStatus.ACTIVE,
        enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
      },
      select: { id: true },
    });
    createdEnrollmentIds.push(enrollment.id);

    return { studentId: student.id, enrollmentId: enrollment.id };
  }

  async function createXpLedgerFixture(params: {
    suffix: string;
    schoolId: string;
    academicYearId: string;
    termId: string;
    studentId: string;
    enrollmentId: string;
    amount: number;
  }): Promise<string> {
    const ledger = await prisma.xpLedger.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.academicYearId,
        termId: params.termId,
        studentId: params.studentId,
        enrollmentId: params.enrollmentId,
        sourceType: XpSourceType.MANUAL_BONUS,
        sourceId: `${testSuffix}-${params.suffix}`,
        amount: params.amount,
        reason: 'Rewards security fixture',
        occurredAt: new Date('2026-10-01T00:00:00.000Z'),
      },
      select: { id: true },
    });
    createdXpLedgerIds.push(ledger.id);
    return ledger.id;
  }

  async function createRewardFixture(params: {
    schoolId: string;
    academicYearId: string;
    termId: string;
    imageFileId: string;
    suffix: string;
    status: RewardCatalogItemStatus;
    deletedAt?: Date | null;
    minTotalXp?: number | null;
    isUnlimited?: boolean;
    stockQuantity?: number | null;
    stockRemaining?: number | null;
  }): Promise<string> {
    const item = await prisma.rewardCatalogItem.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.academicYearId,
        termId: params.termId,
        imageFileId: params.imageFileId,
        titleEn: `${testSuffix}-${params.suffix}`,
        type: RewardCatalogItemType.PHYSICAL,
        status: params.status,
        minTotalXp: params.minTotalXp === undefined ? 10 : params.minTotalXp,
        isUnlimited: params.isUnlimited ?? true,
        stockQuantity: params.stockQuantity ?? null,
        stockRemaining: params.stockRemaining ?? null,
        deletedAt: params.deletedAt ?? null,
        ...(params.status === RewardCatalogItemStatus.PUBLISHED
          ? { publishedAt: new Date() }
          : {}),
        ...(params.status === RewardCatalogItemStatus.ARCHIVED
          ? { archivedAt: new Date() }
          : {}),
      },
      select: { id: true },
    });
    createdRewardIds.push(item.id);
    return item.id;
  }

  async function createRedemptionFixture(params: {
    schoolId: string;
    catalogItemId: string;
    studentId: string;
    enrollmentId: string;
    academicYearId: string;
    termId: string;
    status: RewardRedemptionStatus;
  }): Promise<string> {
    const redemption = await prisma.rewardRedemption.create({
      data: {
        schoolId: params.schoolId,
        catalogItemId: params.catalogItemId,
        studentId: params.studentId,
        enrollmentId: params.enrollmentId,
        academicYearId: params.academicYearId,
        termId: params.termId,
        status: params.status,
        requestSource: RewardRedemptionRequestSource.DASHBOARD,
        requestedAt: new Date('2026-10-02T00:00:00.000Z'),
        eligibilitySnapshot: {
          minTotalXp: 10,
          totalEarnedXp: 100,
          eligible: true,
          stockAvailable: true,
          isUnlimited: true,
          stockRemaining: null,
          catalogItemStatus: 'published',
        },
      },
      select: { id: true },
    });
    createdRedemptionIds.push(redemption.id);
    return redemption.id;
  }

  function catalogPayload(
    overrides?: Partial<{
      academicYearId: string | null;
      termId: string | null;
      titleEn: string;
      imageFileId: string | null;
      isUnlimited: boolean;
      stockQuantity: number;
      stockRemaining: number;
    }>,
  ) {
    return {
      academicYearId:
        overrides && 'academicYearId' in overrides
          ? overrides.academicYearId
          : demoYearId,
      termId:
        overrides && 'termId' in overrides ? overrides.termId : demoTermId,
      titleEn: overrides?.titleEn ?? `${testSuffix}-api-reward`,
      type: 'physical',
      minTotalXp: 10,
      isUnlimited: overrides?.isUnlimited ?? true,
      stockQuantity: overrides?.stockQuantity,
      stockRemaining: overrides?.stockRemaining,
      imageFileId:
        overrides && 'imageFileId' in overrides
          ? overrides.imageFileId
          : demoFileId,
    };
  }

  function redemptionPayload(
    overrides?: Partial<{
      catalogItemId: string;
      studentId: string;
      enrollmentId: string | null;
      academicYearId: string | null;
      termId: string | null;
      requestSource: string;
    }>,
  ) {
    return {
      catalogItemId: overrides?.catalogItemId ?? demoPublishedRewardId,
      studentId: overrides?.studentId ?? demoStudentId,
      enrollmentId:
        overrides && 'enrollmentId' in overrides
          ? overrides.enrollmentId
          : demoEnrollmentId,
      academicYearId:
        overrides && 'academicYearId' in overrides
          ? overrides.academicYearId
          : demoYearId,
      termId:
        overrides && 'termId' in overrides ? overrides.termId : demoTermId,
      requestSource: overrides?.requestSource ?? 'dashboard',
    };
  }

  async function catalogSideEffectCounts() {
    const [rewardRedemptions, xpLedger] = await Promise.all([
      prisma.rewardRedemption.count(),
      prisma.xpLedger.count(),
    ]);

    return { rewardRedemptions, xpLedger };
  }

  async function redemptionSideEffectCounts(rewardId: string) {
    const [xpLedger, reward] = await Promise.all([
      prisma.xpLedger.count(),
      prisma.rewardCatalogItem.findUnique({
        where: { id: rewardId },
        select: { stockRemaining: true },
      }),
    ]);

    return { xpLedger, stockRemaining: reward?.stockRemaining ?? null };
  }

  async function readModelSideEffectCounts(rewardId: string) {
    const [rewardCatalogItems, rewardRedemptions, xpLedger, auditLogs, reward] =
      await Promise.all([
        prisma.rewardCatalogItem.count(),
        prisma.rewardRedemption.count(),
        prisma.xpLedger.count(),
        prisma.auditLog.count(),
        prisma.rewardCatalogItem.findUnique({
          where: { id: rewardId },
          select: { stockRemaining: true },
        }),
      ]);

    return {
      rewardCatalogItems,
      rewardRedemptions,
      xpLedger,
      auditLogs,
      stockRemaining: reward?.stockRemaining ?? null,
    };
  }

  async function cleanupTenantSchool(schoolId: string): Promise<void> {
    await prisma.rewardRedemption.deleteMany({ where: { schoolId } });
    await prisma.rewardCatalogItem.deleteMany({ where: { schoolId } });
    await prisma.xpLedger.deleteMany({ where: { schoolId } });
    await prisma.enrollment.deleteMany({ where: { schoolId } });
    await prisma.student.deleteMany({ where: { schoolId } });
    await prisma.file.deleteMany({ where: { schoolId } });
    await prisma.classroom.deleteMany({ where: { schoolId } });
    await prisma.section.deleteMany({ where: { schoolId } });
    await prisma.grade.deleteMany({ where: { schoolId } });
    await prisma.stage.deleteMany({ where: { schoolId } });
    await prisma.term.deleteMany({ where: { schoolId } });
    await prisma.academicYear.deleteMany({ where: { schoolId } });
  }
});
