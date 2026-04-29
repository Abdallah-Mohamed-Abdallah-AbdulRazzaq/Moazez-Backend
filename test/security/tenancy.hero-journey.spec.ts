import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  GradeAssessmentApprovalStatus,
  GradeAssessmentDeliveryMode,
  GradeAssessmentType,
  GradeScopeType,
  HeroMissionStatus,
  MembershipStatus,
  OrganizationStatus,
  Prisma,
  PrismaClient,
  SchoolStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';

const GLOBAL_PREFIX = '/api/v1';
const DEMO_ADMIN_EMAIL = 'admin@academy.moazez.dev';
const DEMO_ADMIN_PASSWORD = 'School123!';
const TENANT_B_ORG_SLUG = 'hero-journey-tenancy-org-b';
const TENANT_B_SCHOOL_SLUG = 'hero-journey-tenancy-school-b';

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(60000);

describe('Hero Journey tenancy isolation (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let demoSchoolId: string;
  let demoOrganizationId: string;
  let tenantBSchoolId: string;
  let tenantBOrganizationId: string;

  let demoYearId: string;
  let demoTermId: string;
  let demoStageId: string;
  let demoSubjectId: string;
  let demoAssessmentId: string;
  let demoBadgeId: string;
  let demoMissionId: string;
  let demoArchivedMissionId: string;
  let demoDeletedMissionId: string;

  let tenantBYearId: string;
  let tenantBTermId: string;
  let tenantBStageId: string;
  let tenantBSubjectId: string;
  let tenantBAssessmentId: string;
  let tenantBBadgeId: string;
  let tenantBMissionId: string;

  let noAccessEmail: string;
  let badgeViewerEmail: string;
  let heroViewerEmail: string;
  let teacherEmail: string;
  let parentEmail: string;
  let studentEmail: string;

  const password = 'HeroSecurity123!';
  const testSuffix = `hero-security-${Date.now()}`;
  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];
  const createdAcademicYearIds: string[] = [];
  const createdTermIds: string[] = [];
  const createdStageIds: string[] = [];
  const createdSubjectIds: string[] = [];
  const createdAssessmentIds: string[] = [];
  const createdBadgeIds: string[] = [];
  const createdMissionIds: string[] = [];

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
      heroViewPermission,
      heroManagePermission,
      badgeViewPermission,
      badgeManagePermission,
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
        where: { code: 'reinforcement.hero.view' },
        select: { id: true },
      }),
      prisma.permission.findUnique({
        where: { code: 'reinforcement.hero.manage' },
        select: { id: true },
      }),
      prisma.permission.findUnique({
        where: { code: 'reinforcement.hero.badges.view' },
        select: { id: true },
      }),
      prisma.permission.findUnique({
        where: { code: 'reinforcement.hero.badges.manage' },
        select: { id: true },
      }),
    ]);

    if (
      !schoolAdminRole ||
      !teacherRole ||
      !parentRole ||
      !studentRole ||
      !heroViewPermission ||
      !heroManagePermission ||
      !badgeViewPermission ||
      !badgeManagePermission
    ) {
      throw new Error('Hero Journey roles or permissions missing - run seed.');
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
    const badgeViewerRoleId = await createCustomRole('badge-viewer', [
      badgeViewPermission.id,
    ]);
    const heroViewerRoleId = await createCustomRole('hero-viewer', [
      heroViewPermission.id,
    ]);

    noAccessEmail = `${testSuffix}-no-access@security.moazez.local`;
    badgeViewerEmail = `${testSuffix}-badge-viewer@security.moazez.local`;
    heroViewerEmail = `${testSuffix}-hero-viewer@security.moazez.local`;
    teacherEmail = `${testSuffix}-teacher@security.moazez.local`;
    parentEmail = `${testSuffix}-parent@security.moazez.local`;
    studentEmail = `${testSuffix}-student@security.moazez.local`;

    await createUserWithMembership(
      noAccessEmail,
      UserType.SCHOOL_USER,
      noAccessRoleId,
    );
    await createUserWithMembership(
      badgeViewerEmail,
      UserType.SCHOOL_USER,
      badgeViewerRoleId,
    );
    await createUserWithMembership(
      heroViewerEmail,
      UserType.SCHOOL_USER,
      heroViewerRoleId,
    );
    await createUserWithMembership(teacherEmail, UserType.TEACHER, teacherRole.id);
    await createUserWithMembership(parentEmail, UserType.PARENT, parentRole.id);
    await createUserWithMembership(studentEmail, UserType.STUDENT, studentRole.id);

    const orgB = await prisma.organization.upsert({
      where: { slug: TENANT_B_ORG_SLUG },
      update: { status: OrganizationStatus.ACTIVE },
      create: {
        slug: TENANT_B_ORG_SLUG,
        name: 'Hero Journey Tenancy Org B',
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
        name: 'Hero Journey Tenancy School B',
        status: SchoolStatus.ACTIVE,
      },
    });
    tenantBSchoolId = schoolB.id;
    await cleanupTenantSchool(tenantBSchoolId);

    const demo = await createAcademicFixture('a', demoSchoolId);
    demoYearId = demo.yearId;
    demoTermId = demo.termId;
    demoStageId = demo.stageId;
    demoSubjectId = demo.subjectId;
    demoAssessmentId = demo.assessmentId;

    const tenantB = await createAcademicFixture('b', tenantBSchoolId);
    tenantBYearId = tenantB.yearId;
    tenantBTermId = tenantB.termId;
    tenantBStageId = tenantB.stageId;
    tenantBSubjectId = tenantB.subjectId;
    tenantBAssessmentId = tenantB.assessmentId;

    demoBadgeId = await createBadgeFixture(demoSchoolId, 'a');
    tenantBBadgeId = await createBadgeFixture(tenantBSchoolId, 'b');
    demoMissionId = await createMissionFixture({
      schoolId: demoSchoolId,
      academicYearId: demoYearId,
      termId: demoTermId,
      stageId: demoStageId,
      subjectId: demoSubjectId,
      assessmentId: demoAssessmentId,
      badgeId: demoBadgeId,
      titleSuffix: 'mission-a',
      status: HeroMissionStatus.DRAFT,
    });
    demoArchivedMissionId = await createMissionFixture({
      schoolId: demoSchoolId,
      academicYearId: demoYearId,
      termId: demoTermId,
      stageId: demoStageId,
      subjectId: demoSubjectId,
      assessmentId: demoAssessmentId,
      badgeId: demoBadgeId,
      titleSuffix: 'mission-archived-a',
      status: HeroMissionStatus.ARCHIVED,
    });
    demoDeletedMissionId = await createMissionFixture({
      schoolId: demoSchoolId,
      academicYearId: demoYearId,
      termId: demoTermId,
      stageId: demoStageId,
      subjectId: demoSubjectId,
      assessmentId: demoAssessmentId,
      badgeId: demoBadgeId,
      titleSuffix: 'mission-deleted-a',
      status: HeroMissionStatus.DRAFT,
      deletedAt: new Date(),
    });
    tenantBMissionId = await createMissionFixture({
      schoolId: tenantBSchoolId,
      academicYearId: tenantBYearId,
      termId: tenantBTermId,
      stageId: tenantBStageId,
      subjectId: tenantBSubjectId,
      assessmentId: tenantBAssessmentId,
      badgeId: tenantBBadgeId,
      titleSuffix: 'mission-b',
      status: HeroMissionStatus.DRAFT,
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
      await prisma.heroJourneyEvent.deleteMany({
        where: { missionId: { in: createdMissionIds } },
      });
      await prisma.heroStudentBadge.deleteMany({
        where: { missionId: { in: createdMissionIds } },
      });
      await prisma.heroMissionObjectiveProgress.deleteMany({
        where: { objective: { missionId: { in: createdMissionIds } } },
      });
      await prisma.heroMissionProgress.deleteMany({
        where: { missionId: { in: createdMissionIds } },
      });
      await prisma.heroMissionObjective.deleteMany({
        where: { missionId: { in: createdMissionIds } },
      });
      await prisma.heroMission.deleteMany({
        where: { id: { in: createdMissionIds } },
      });
      await prisma.heroBadge.deleteMany({
        where: { id: { in: createdBadgeIds } },
      });
      await prisma.gradeAssessment.deleteMany({
        where: { id: { in: createdAssessmentIds } },
      });
      await prisma.subject.deleteMany({
        where: { id: { in: createdSubjectIds } },
      });
      await prisma.stage.deleteMany({
        where: { id: { in: createdStageIds } },
      });
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

  it('school A cannot read, list, update, or delete school B badges', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/hero/badges/${tenantBBadgeId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    const list = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/hero/badges`)
      .query({ search: testSuffix, includeDeleted: true })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(list.body.items.map((badge: { id: string }) => badge.id)).toContain(
      demoBadgeId,
    );
    expect(list.body.items.map((badge: { id: string }) => badge.id)).not.toContain(
      tenantBBadgeId,
    );

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/reinforcement/hero/badges/${tenantBBadgeId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nameEn: 'Leaked' })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/reinforcement/hero/badges/${tenantBBadgeId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  it('school A cannot create missions using school B resources', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/hero/missions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(missionPayload({ stageId: tenantBStageId }))
      .expect(404);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/hero/missions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(missionPayload({ subjectId: tenantBSubjectId }))
      .expect(404);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/hero/missions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(
        missionPayload({
          linkedAssessmentId: tenantBAssessmentId,
          objectiveAssessmentId: tenantBAssessmentId,
        }),
      )
      .expect(404);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/hero/missions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(missionPayload({ badgeRewardId: tenantBBadgeId }))
      .expect(404);
  });

  it('school A cannot read, list, update, publish, archive, or delete school B missions', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    const list = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/hero/missions`)
      .query({ search: testSuffix, includeArchived: true })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const missionIds = list.body.items.map((mission: { id: string }) => mission.id);
    expect(missionIds).toContain(demoMissionId);
    expect(missionIds).not.toContain(tenantBMissionId);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/hero/missions/${tenantBMissionId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/reinforcement/hero/missions/${tenantBMissionId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ titleEn: 'Leaked' })
      .expect(404);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/hero/missions/${tenantBMissionId}/publish`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/hero/missions/${tenantBMissionId}/archive`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reason: 'No leak' })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/reinforcement/hero/missions/${tenantBMissionId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  it('enforces badge view and manage permissions', async () => {
    const noAccess = await login(noAccessEmail);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/hero/badges`)
      .set('Authorization', `Bearer ${noAccess.accessToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/hero/badges/${demoBadgeId}`)
      .set('Authorization', `Bearer ${noAccess.accessToken}`)
      .expect(403);

    const badgeViewer = await login(badgeViewerEmail);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/hero/badges`)
      .set('Authorization', `Bearer ${badgeViewer.accessToken}`)
      .send({ slug: `${testSuffix}-forbidden-badge`, nameEn: 'Forbidden' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/reinforcement/hero/badges/${demoBadgeId}`)
      .set('Authorization', `Bearer ${badgeViewer.accessToken}`)
      .send({ nameEn: 'Forbidden' })
      .expect(403);
    await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/reinforcement/hero/badges/${demoBadgeId}`)
      .set('Authorization', `Bearer ${badgeViewer.accessToken}`)
      .expect(403);
  });

  it('enforces mission view and manage permissions', async () => {
    const noAccess = await login(noAccessEmail);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/hero/missions`)
      .set('Authorization', `Bearer ${noAccess.accessToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/hero/missions/${demoMissionId}`)
      .set('Authorization', `Bearer ${noAccess.accessToken}`)
      .expect(403);

    const heroViewer = await login(heroViewerEmail);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/hero/missions`)
      .set('Authorization', `Bearer ${heroViewer.accessToken}`)
      .send(missionPayload({ titleEn: `${testSuffix}-forbidden-create` }))
      .expect(403);
    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/reinforcement/hero/missions/${demoMissionId}`)
      .set('Authorization', `Bearer ${heroViewer.accessToken}`)
      .send({ titleEn: 'Forbidden' })
      .expect(403);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/hero/missions/${demoMissionId}/publish`)
      .set('Authorization', `Bearer ${heroViewer.accessToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/hero/missions/${demoMissionId}/archive`)
      .set('Authorization', `Bearer ${heroViewer.accessToken}`)
      .send({ reason: 'Forbidden' })
      .expect(403);
    await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/reinforcement/hero/missions/${demoMissionId}`)
      .set('Authorization', `Bearer ${heroViewer.accessToken}`)
      .expect(403);
  });

  it('school admin can manage badges and missions', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    const badge = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/hero/badges`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        slug: `${testSuffix}-admin-badge`,
        nameEn: 'Admin Badge',
      })
      .expect(201);
    createdBadgeIds.push(badge.body.id);

    const mission = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/hero/missions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(
        missionPayload({
          titleEn: `${testSuffix}-admin-created`,
          badgeRewardId: badge.body.id,
        }),
      )
      .expect(201);
    createdMissionIds.push(mission.body.id);
    expect(mission.body.status).toBe('draft');

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/reinforcement/hero/missions/${mission.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ briefEn: 'Updated by admin' })
      .expect(200);

    const published = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/hero/missions/${mission.body.id}/publish`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    expect(published.body.status).toBe('published');

    const archived = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/hero/missions/${mission.body.id}/archive`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reason: 'Security test archive' })
      .expect(201);
    expect(archived.body.status).toBe('archived');
  });

  it('teacher can view missions but cannot manage them, and parent/student cannot access core Hero endpoints', async () => {
    const teacher = await login(teacherEmail);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/hero/missions`)
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/hero/missions`)
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .send(missionPayload({ titleEn: `${testSuffix}-teacher-forbidden` }))
      .expect(403);

    for (const email of [parentEmail, studentEmail]) {
      const { accessToken } = await login(email);
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/reinforcement/hero/missions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/reinforcement/hero/badges`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/reinforcement/hero/missions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(missionPayload({ titleEn: `${testSuffix}-${email}-forbidden` }))
        .expect(403);
    }
  });

  it('rejects publish for archived, deleted, and cross-school missions safely', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);

    const archived = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/hero/missions/${demoArchivedMissionId}/publish`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(409);
    expect(archived.body?.error?.code).toBe(
      'reinforcement.hero.mission.archived',
    );

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/hero/missions/${demoDeletedMissionId}/publish`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/hero/missions/${tenantBMissionId}/publish`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  it('reads do not create progress, events, badge awards, or XP ledger rows', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL);
    const before = await heroSideEffectCounts(demoSchoolId);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/hero/badges`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/hero/missions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/hero/missions/${demoMissionId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await expect(heroSideEffectCounts(demoSchoolId)).resolves.toEqual(before);
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
        firstName: 'Hero',
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

    const stage = await prisma.stage.create({
      data: {
        schoolId,
        nameAr: `${testSuffix}-stage-${suffix}-ar`,
        nameEn: `${testSuffix}-stage-${suffix}`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    createdStageIds.push(stage.id);

    const subject = await prisma.subject.create({
      data: {
        schoolId,
        nameAr: `${testSuffix}-subject-${suffix}-ar`,
        nameEn: `${testSuffix}-subject-${suffix}`,
        code: `${testSuffix}-${suffix}`.slice(0, 40),
        isActive: true,
      },
      select: { id: true },
    });
    createdSubjectIds.push(subject.id);

    const assessment = await prisma.gradeAssessment.create({
      data: {
        schoolId,
        academicYearId: year.id,
        termId: term.id,
        subjectId: subject.id,
        scopeType: GradeScopeType.STAGE,
        scopeKey: stage.id,
        stageId: stage.id,
        titleEn: `${testSuffix}-assessment-${suffix}`,
        type: GradeAssessmentType.QUIZ,
        deliveryMode: GradeAssessmentDeliveryMode.SCORE_ONLY,
        date: new Date('2026-10-01T00:00:00.000Z'),
        weight: new Prisma.Decimal(10),
        maxScore: new Prisma.Decimal(100),
        approvalStatus: GradeAssessmentApprovalStatus.PUBLISHED,
      },
      select: { id: true },
    });
    createdAssessmentIds.push(assessment.id);

    return {
      yearId: year.id,
      termId: term.id,
      stageId: stage.id,
      subjectId: subject.id,
      assessmentId: assessment.id,
    };
  }

  async function createBadgeFixture(
    schoolId: string,
    suffix: string,
  ): Promise<string> {
    const badge = await prisma.heroBadge.create({
      data: {
        schoolId,
        slug: `${testSuffix}-badge-${suffix}`,
        nameEn: `${testSuffix} Badge ${suffix}`,
        isActive: true,
      },
      select: { id: true },
    });
    createdBadgeIds.push(badge.id);
    return badge.id;
  }

  async function createMissionFixture(params: {
    schoolId: string;
    academicYearId: string;
    termId: string;
    stageId: string;
    subjectId: string;
    assessmentId: string;
    badgeId: string;
    titleSuffix: string;
    status: HeroMissionStatus;
    deletedAt?: Date | null;
  }): Promise<string> {
    const mission = await prisma.heroMission.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.academicYearId,
        termId: params.termId,
        stageId: params.stageId,
        subjectId: params.subjectId,
        linkedAssessmentId: params.assessmentId,
        titleEn: `${testSuffix}-${params.titleSuffix}`,
        requiredLevel: 1,
        rewardXp: 10,
        badgeRewardId: params.badgeId,
        status: params.status,
        deletedAt: params.deletedAt ?? null,
      },
      select: { id: true },
    });
    createdMissionIds.push(mission.id);

    await prisma.heroMissionObjective.create({
      data: {
        schoolId: params.schoolId,
        missionId: mission.id,
        type: 'MANUAL',
        titleEn: `${testSuffix}-${params.titleSuffix}-objective`,
        sortOrder: 1,
        isRequired: true,
      },
    });

    return mission.id;
  }

  function missionPayload(
    overrides?: Partial<{
      yearId: string;
      termId: string;
      stageId: string;
      subjectId: string;
      linkedAssessmentId: string;
      objectiveAssessmentId: string;
      badgeRewardId: string;
      titleEn: string;
    }>,
  ) {
    return {
      yearId: overrides?.yearId ?? demoYearId,
      termId: overrides?.termId ?? demoTermId,
      stageId: overrides?.stageId ?? demoStageId,
      subjectId: overrides?.subjectId ?? demoSubjectId,
      linkedAssessmentId: overrides?.linkedAssessmentId ?? demoAssessmentId,
      titleEn: overrides?.titleEn ?? `${testSuffix}-api-mission`,
      rewardXp: 15,
      badgeRewardId: overrides?.badgeRewardId ?? demoBadgeId,
      objectives: [
        {
          titleEn: `${testSuffix}-api-objective`,
          linkedAssessmentId:
            overrides?.objectiveAssessmentId ?? demoAssessmentId,
        },
      ],
    };
  }

  async function heroSideEffectCounts(schoolId: string) {
    const [progress, events, studentBadges, xpLedger] = await Promise.all([
      prisma.heroMissionProgress.count({ where: { schoolId } }),
      prisma.heroJourneyEvent.count({ where: { schoolId } }),
      prisma.heroStudentBadge.count({ where: { schoolId } }),
      prisma.xpLedger.count({ where: { schoolId } }),
    ]);

    return { progress, events, studentBadges, xpLedger };
  }

  async function cleanupTenantSchool(schoolId: string): Promise<void> {
    await prisma.heroJourneyEvent.deleteMany({ where: { schoolId } });
    await prisma.heroStudentBadge.deleteMany({ where: { schoolId } });
    await prisma.heroMissionObjectiveProgress.deleteMany({ where: { schoolId } });
    await prisma.heroMissionProgress.deleteMany({ where: { schoolId } });
    await prisma.heroMissionObjective.deleteMany({ where: { schoolId } });
    await prisma.heroMission.deleteMany({ where: { schoolId } });
    await prisma.heroBadge.deleteMany({ where: { schoolId } });
    await prisma.gradeAssessment.deleteMany({ where: { schoolId } });
    await prisma.subject.deleteMany({ where: { schoolId } });
    await prisma.stage.deleteMany({ where: { schoolId } });
    await prisma.term.deleteMany({ where: { schoolId } });
    await prisma.academicYear.deleteMany({ where: { schoolId } });
  }
});
