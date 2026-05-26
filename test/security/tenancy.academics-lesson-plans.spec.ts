import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  CurriculumStatus,
  LessonPlanItemStatus,
  LessonPlanStatus,
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  SchoolStatus,
  TimetableConfigStatus,
  TimetableEntryStatus,
  TimetablePeriodType,
  TimetableScopeType,
  UserStatus,
  UserType,
} from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';

const GLOBAL_PREFIX = '/api/v1';
const PASSWORD = 'Sprint15DSecurity123!';
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

type AcademicBase = {
  academicYearId: string;
  termId: string;
  stageId: string;
  gradeId: string;
  sectionId: string;
  classroomId: string;
  subjectId: string;
};

type LessonPlanTree = {
  allocationId: string;
  teacherUserId: string;
  curriculumId: string;
  unitId: string;
  lessonId: string;
  timetableConfigId: string;
  periodId: string;
  timetableEntryId: string;
  lessonPlanId: string;
  itemId: string;
};

jest.setTimeout(180000);

describe('Academics lesson plans tenancy isolation (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let organizationAId = '';
  let organizationBId = '';
  let schoolAId = '';
  let schoolBId = '';
  let adminAUserId = '';
  let adminBUserId = '';
  let viewerUserId = '';
  let adminAEmail = '';
  let adminBEmail = '';
  let viewerEmail = '';
  let academicA: AcademicBase;
  let academicB: AcademicBase;
  let treeA: LessonPlanTree;
  let treeB: LessonPlanTree;
  let viewerRoleId = '';
  let adminAAuth: AuthTokens;
  let adminBAuth: AuthTokens;
  let viewerAuth: AuthTokens;

  const suffix = randomUUID().split('-')[0];
  const marker = `s15d-sec-${suffix}`;
  const createdOrganizationIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const [schoolAdminRole, lessonPlansViewPermission] = await Promise.all([
      findSystemRole('school_admin'),
      prisma.permission.findUnique({
        where: { code: 'academics.lesson_plans.view' },
        select: { id: true },
      }),
    ]);
    if (!lessonPlansViewPermission) {
      throw new Error('Missing academics.lesson_plans.view permission.');
    }

    organizationAId = await createOrganization('a');
    organizationBId = await createOrganization('b');
    schoolAId = await createSchool(organizationAId, 'a');
    schoolBId = await createSchool(organizationBId, 'b');
    academicA = await createAcademicBase(schoolAId, 'a');
    academicB = await createAcademicBase(schoolBId, 'b');

    viewerRoleId = await createViewerRole(lessonPlansViewPermission.id);

    adminAEmail = `${marker}-admin-a@example.test`;
    adminBEmail = `${marker}-admin-b@example.test`;
    viewerEmail = `${marker}-viewer@example.test`;
    adminAUserId = await createUserWithMembership({
      email: adminAEmail,
      firstName: 'Tenant',
      lastName: 'AdminA',
      userType: UserType.SCHOOL_USER,
      roleId: schoolAdminRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    adminBUserId = await createUserWithMembership({
      email: adminBEmail,
      firstName: 'Tenant',
      lastName: 'AdminB',
      userType: UserType.SCHOOL_USER,
      roleId: schoolAdminRole.id,
      organizationId: organizationBId,
      schoolId: schoolBId,
    });
    viewerUserId = await createUserWithMembership({
      email: viewerEmail,
      firstName: 'View',
      lastName: 'Only',
      userType: UserType.SCHOOL_USER,
      roleId: viewerRoleId,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });

    treeA = await createLessonPlanTree({
      schoolId: schoolAId,
      organizationId: organizationAId,
      academic: academicA,
      adminUserId: adminAUserId,
      label: 'a',
    });
    treeB = await createLessonPlanTree({
      schoolId: schoolBId,
      organizationId: organizationBId,
      academic: academicB,
      adminUserId: adminBUserId,
      label: 'b',
    });

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    );
    await app.init();

    adminAAuth = await login(adminAEmail);
    adminBAuth = await login(adminBEmail);
    viewerAuth = await login(viewerEmail);
  });

  afterAll(async () => {
    try {
      if (app) await app.close();
      await cleanupSecurityData();
    } finally {
      if (prisma) await prisma.$disconnect();
    }
  });

  it('prevents school A from reading school B lesson plan', async () => {
    await request(app.getHttpServer())
      .get(planUrl(treeB.lessonPlanId))
      .set('Authorization', bearer(adminAAuth))
      .expect(404)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.lesson_plan.not_found',
        );
        expectNoObjectKey(response.body, 'schoolId');
        expectNoObjectKey(response.body, 'organizationId');
      });

    await request(app.getHttpServer())
      .get(planUrl(treeB.lessonPlanId))
      .set('Authorization', bearer(adminBAuth))
      .expect(200)
      .expect((response) => {
        expect(response.body.lessonPlanId).toBe(treeB.lessonPlanId);
        expectNoObjectKey(response.body, 'schoolId');
        expectNoObjectKey(response.body, 'organizationId');
      });
  });

  it('prevents school A from mutating school B lesson plan', async () => {
    await request(app.getHttpServer())
      .patch(planUrl(treeB.lessonPlanId))
      .set('Authorization', bearer(adminAAuth))
      .send({ title: 'Cross School Update' })
      .expect(404);

    await request(app.getHttpServer())
      .post(`${planUrl(treeB.lessonPlanId)}/items`)
      .set('Authorization', bearer(adminAAuth))
      .send({ unitId: treeB.unitId, lessonId: treeB.lessonId })
      .expect(404);

    await request(app.getHttpServer())
      .post(`${planUrl(treeB.lessonPlanId)}/items/${treeB.itemId}/start`)
      .set('Authorization', bearer(adminAAuth))
      .expect(404);
  });

  it('prevents school A from attaching school B curriculum, lesson, or timetable entry', async () => {
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/lesson-plans`)
      .set('Authorization', bearer(adminAAuth))
      .send({
        academicYearId: academicA.academicYearId,
        termId: academicA.termId,
        teacherSubjectAllocationId: treeA.allocationId,
        curriculumId: treeB.curriculumId,
        title: 'Wrong School Curriculum',
        weekStartDate: '2026-09-14',
        weekEndDate: '2026-09-18',
      })
      .expect(422)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.lesson_plan.invalid_scope',
        );
        expectNoObjectKey(response.body, 'schoolId');
        expectNoObjectKey(response.body, 'organizationId');
      });

    await request(app.getHttpServer())
      .post(`${planUrl(treeA.lessonPlanId)}/items`)
      .set('Authorization', bearer(adminAAuth))
      .send({
        unitId: treeB.unitId,
        lessonId: treeB.lessonId,
      })
      .expect(422)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.lesson_plan.invalid_item_scope',
        );
      });

    await request(app.getHttpServer())
      .post(`${planUrl(treeA.lessonPlanId)}/items`)
      .set('Authorization', bearer(adminAAuth))
      .send({
        unitId: treeA.unitId,
        lessonId: treeA.lessonId,
        timetableEntryId: treeB.timetableEntryId,
      })
      .expect(422)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.lesson_plan.invalid_item_scope',
        );
      });
  });

  it('allows same-school read-only access but blocks mutation', async () => {
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/lesson-plans`)
      .set('Authorization', bearer(viewerAuth))
      .expect(200)
      .expect((response) => {
        expect(
          response.body.items.map(
            (item: { lessonPlanId: string }) => item.lessonPlanId,
          ),
        ).toContain(treeA.lessonPlanId);
        expectNoObjectKey(response.body, 'schoolId');
        expectNoObjectKey(response.body, 'organizationId');
      });

    await request(app.getHttpServer())
      .get(planUrl(treeA.lessonPlanId))
      .set('Authorization', bearer(viewerAuth))
      .expect(200)
      .expect((response) => {
        expect(response.body.lessonPlanId).toBe(treeA.lessonPlanId);
        expectNoObjectKey(response.body, 'schoolId');
        expectNoObjectKey(response.body, 'organizationId');
      });

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/lesson-plans`)
      .set('Authorization', bearer(viewerAuth))
      .send({
        academicYearId: academicA.academicYearId,
        termId: academicA.termId,
        teacherSubjectAllocationId: treeA.allocationId,
        curriculumId: treeA.curriculumId,
        title: 'Viewer Cannot Create',
        weekStartDate: '2026-09-21',
        weekEndDate: '2026-09-25',
      })
      .expect(403)
      .expect((response) => {
        expect(response.body?.error?.code).toBe('auth.scope.missing');
        expectNoObjectKey(response.body, 'schoolId');
        expectNoObjectKey(response.body, 'organizationId');
      });

    await request(app.getHttpServer())
      .patch(planUrl(treeA.lessonPlanId))
      .set('Authorization', bearer(viewerAuth))
      .send({ title: 'Viewer Cannot Update' })
      .expect(403);
  });

  function planUrl(lessonPlanId: string): string {
    return `${GLOBAL_PREFIX}/academics/lesson-plans/${lessonPlanId}`;
  }

  async function findSystemRole(key: string): Promise<{ id: string }> {
    const role = await prisma.role.findFirst({
      where: { key, schoolId: null, isSystem: true, deletedAt: null },
      select: { id: true },
    });
    if (!role) throw new Error(`Missing system role: ${key}`);
    return role;
  }

  async function createOrganization(label: string): Promise<string> {
    const organization = await prisma.organization.create({
      data: {
        slug: `${marker}-org-${label}`,
        name: `Sprint 15D Security Org ${label} ${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);
    return organization.id;
  }

  async function createSchool(
    inputOrganizationId: string,
    label: string,
  ): Promise<string> {
    const school = await prisma.school.create({
      data: {
        organizationId: inputOrganizationId,
        slug: `${marker}-school-${label}`,
        name: `Sprint 15D Security School ${label} ${suffix}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdSchoolIds.push(school.id);
    return school.id;
  }

  async function createViewerRole(permissionId: string): Promise<string> {
    const role = await prisma.role.create({
      data: {
        schoolId: schoolAId,
        key: `${marker}-viewer`,
        name: `Sprint 15D Lesson Plans Viewer ${suffix}`,
        description: 'View-only role for lesson plan tenancy tests',
        isSystem: false,
      },
      select: { id: true },
    });
    createdRoleIds.push(role.id);
    await prisma.rolePermission.create({
      data: {
        roleId: role.id,
        permissionId,
      },
    });

    return role.id;
  }

  async function createUserWithMembership(params: {
    email: string;
    firstName: string;
    lastName: string;
    userType: UserType;
    roleId: string;
    organizationId: string;
    schoolId: string;
  }): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: params.email,
        firstName: params.firstName,
        lastName: params.lastName,
        userType: params.userType,
        status: UserStatus.ACTIVE,
        passwordHash: await argon2.hash(PASSWORD, ARGON2_OPTIONS),
      },
      select: { id: true },
    });
    createdUserIds.push(user.id);

    await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId: params.organizationId,
        schoolId: params.schoolId,
        roleId: params.roleId,
        userType: params.userType,
        status: MembershipStatus.ACTIVE,
      },
    });

    return user.id;
  }

  async function createAcademicBase(
    inputSchoolId: string,
    label: string,
  ): Promise<AcademicBase> {
    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId: inputSchoolId,
        nameAr: `${marker}-${label}-year-ar`,
        nameEn: `${marker}-${label}-year`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-06-30T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    const term = await prisma.term.create({
      data: {
        schoolId: inputSchoolId,
        academicYearId: academicYear.id,
        nameAr: `${marker}-${label}-term-ar`,
        nameEn: `${marker}-${label}-term`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    const stage = await prisma.stage.create({
      data: {
        schoolId: inputSchoolId,
        nameAr: `${marker}-${label}-stage-ar`,
        nameEn: `${marker}-${label}-stage`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const grade = await prisma.grade.create({
      data: {
        schoolId: inputSchoolId,
        stageId: stage.id,
        nameAr: `${marker}-${label}-grade-ar`,
        nameEn: `${marker}-${label}-grade`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const section = await prisma.section.create({
      data: {
        schoolId: inputSchoolId,
        gradeId: grade.id,
        nameAr: `${marker}-${label}-section-ar`,
        nameEn: `${marker}-${label}-section`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const classroom = await prisma.classroom.create({
      data: {
        schoolId: inputSchoolId,
        sectionId: section.id,
        nameAr: `${marker}-${label}-class-ar`,
        nameEn: `${marker}-${label}-class`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const subject = await prisma.subject.create({
      data: {
        schoolId: inputSchoolId,
        nameAr: `${marker}-${label}-subject-ar`,
        nameEn: `${marker}-${label}-subject`,
        code: `S15DSEC-${label.toUpperCase()}-${suffix}`,
        isActive: true,
      },
      select: { id: true },
    });

    return {
      academicYearId: academicYear.id,
      termId: term.id,
      stageId: stage.id,
      gradeId: grade.id,
      sectionId: section.id,
      classroomId: classroom.id,
      subjectId: subject.id,
    };
  }

  async function createLessonPlanTree(params: {
    schoolId: string;
    organizationId: string;
    academic: AcademicBase;
    adminUserId: string;
    label: string;
  }): Promise<LessonPlanTree> {
    const teacherUserId = await createUserWithMembership({
      email: `${marker}-teacher-${params.label}@example.test`,
      firstName: `Teacher${params.label.toUpperCase()}`,
      lastName: 'Planner',
      userType: UserType.TEACHER,
      roleId: (await findSystemRole('teacher')).id,
      organizationId: params.organizationId,
      schoolId: params.schoolId,
    });
    const allocation = await prisma.teacherSubjectAllocation.create({
      data: {
        schoolId: params.schoolId,
        teacherUserId,
        subjectId: params.academic.subjectId,
        classroomId: params.academic.classroomId,
        termId: params.academic.termId,
      },
      select: { id: true },
    });
    const curriculum = await prisma.curriculum.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.academic.academicYearId,
        termId: params.academic.termId,
        gradeId: params.academic.gradeId,
        subjectId: params.academic.subjectId,
        title: `${marker}-${params.label}-curriculum`,
        status: CurriculumStatus.DRAFT,
        createdByUserId: params.adminUserId,
        updatedByUserId: params.adminUserId,
      },
      select: { id: true },
    });
    const unit = await prisma.curriculumUnit.create({
      data: {
        schoolId: params.schoolId,
        curriculumId: curriculum.id,
        title: `${marker}-${params.label}-unit`,
        sortOrder: 0,
      },
      select: { id: true },
    });
    const lesson = await prisma.curriculumLesson.create({
      data: {
        schoolId: params.schoolId,
        curriculumId: curriculum.id,
        unitId: unit.id,
        title: `${marker}-${params.label}-lesson`,
        sortOrder: 0,
      },
      select: { id: true },
    });
    const timetableConfig = await prisma.timetableConfig.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.academic.academicYearId,
        termId: params.academic.termId,
        name: `${marker}-${params.label}-config`,
        weekStartDay: 0,
        activeDays: [0, 1, 2, 3, 4],
        scopeType: TimetableScopeType.CLASSROOM,
        scopeKey: params.academic.classroomId,
        classroomId: params.academic.classroomId,
        status: TimetableConfigStatus.ACTIVE,
      },
      select: { id: true },
    });
    const period = await prisma.timetablePeriod.create({
      data: {
        schoolId: params.schoolId,
        timetableConfigId: timetableConfig.id,
        periodIndex: 1,
        label: `${marker}-${params.label}-period`,
        startTime: '08:00',
        endTime: '08:45',
        type: TimetablePeriodType.CLASS,
        isInstructional: true,
      },
      select: { id: true },
    });
    const timetableEntry = await prisma.timetableEntry.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.academic.academicYearId,
        termId: params.academic.termId,
        timetableConfigId: timetableConfig.id,
        periodId: period.id,
        dayOfWeek: 1,
        gradeId: params.academic.gradeId,
        sectionId: params.academic.sectionId,
        classroomId: params.academic.classroomId,
        subjectId: params.academic.subjectId,
        teacherUserId,
        teacherSubjectAllocationId: allocation.id,
        status: TimetableEntryStatus.ACTIVE,
      },
      select: { id: true },
    });
    const lessonPlan = await prisma.lessonPlan.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.academic.academicYearId,
        termId: params.academic.termId,
        teacherSubjectAllocationId: allocation.id,
        teacherUserId,
        classroomId: params.academic.classroomId,
        subjectId: params.academic.subjectId,
        curriculumId: curriculum.id,
        title: `${marker}-${params.label}-plan`,
        status: LessonPlanStatus.DRAFT,
        weekStartDate: new Date('2026-09-07T00:00:00.000Z'),
        weekEndDate: new Date('2026-09-11T00:00:00.000Z'),
        createdByUserId: params.adminUserId,
        updatedByUserId: params.adminUserId,
      },
      select: { id: true },
    });
    const item = await prisma.lessonPlanItem.create({
      data: {
        schoolId: params.schoolId,
        lessonPlanId: lessonPlan.id,
        curriculumId: curriculum.id,
        unitId: unit.id,
        lessonId: lesson.id,
        timetableEntryId: timetableEntry.id,
        plannedDate: new Date('2026-09-08T00:00:00.000Z'),
        dayOfWeek: 2,
        periodId: period.id,
        periodLabel: `${marker}-${params.label}-period`,
        title: `${marker}-${params.label}-item`,
        status: LessonPlanItemStatus.PLANNED,
        sortOrder: 0,
        createdByUserId: params.adminUserId,
        updatedByUserId: params.adminUserId,
      },
      select: { id: true },
    });

    return {
      allocationId: allocation.id,
      teacherUserId,
      curriculumId: curriculum.id,
      unitId: unit.id,
      lessonId: lesson.id,
      timetableConfigId: timetableConfig.id,
      periodId: period.id,
      timetableEntryId: timetableEntry.id,
      lessonPlanId: lessonPlan.id,
      itemId: item.id,
    };
  }

  async function login(email: string): Promise<AuthTokens> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password: PASSWORD })
      .expect(200);

    return {
      accessToken: response.body.accessToken,
      refreshToken: response.body.refreshToken,
    };
  }

  function bearer(tokens: AuthTokens): string {
    return `Bearer ${tokens.accessToken}`;
  }

  function expectNoObjectKey(value: unknown, forbiddenKey: string): void {
    if (!value || typeof value !== 'object') return;

    if (Array.isArray(value)) {
      for (const item of value) expectNoObjectKey(item, forbiddenKey);
      return;
    }

    for (const [key, nested] of Object.entries(value)) {
      expect(key).not.toBe(forbiddenKey);
      expectNoObjectKey(nested, forbiddenKey);
    }
  }

  async function cleanupSecurityData(): Promise<void> {
    if (!prisma) return;

    await prisma.session.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { actorId: { in: createdUserIds } },
          { schoolId: { in: createdSchoolIds } },
          { organizationId: { in: createdOrganizationIds } },
        ],
      },
    });
    await prisma.lessonPlanItem.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.lessonPlan.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.timetableEntry.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.timetablePeriod.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.timetableConfig.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.curriculumLesson.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.curriculumUnit.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.curriculum.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.teacherSubjectAllocation.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.subject.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.classroom.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.section.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.grade.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.stage.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.term.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.academicYear.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.membership.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: createdUserIds } },
    });
    await prisma.rolePermission.deleteMany({
      where: { roleId: { in: createdRoleIds } },
    });
    await prisma.role.deleteMany({
      where: { id: { in: createdRoleIds } },
    });
    await prisma.school.deleteMany({
      where: { id: { in: createdSchoolIds } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: createdOrganizationIds } },
    });
  }
});
