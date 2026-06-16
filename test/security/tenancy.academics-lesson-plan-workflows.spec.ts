import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AcademicCalendarEventScopeType,
  AcademicCalendarEventType,
  CurriculumStatus,
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
const PASSWORD = 'Sprint22ELessonPlanSecurity123!';
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
  closedTermId: string;
  stageId: string;
  gradeId: string;
  sectionId: string;
  classroomId: string;
  subjectId: string;
};

type LessonTree = {
  teacherUserId: string;
  allocationId: string;
  closedAllocationId: string;
  curriculumId: string;
  unitId: string;
  lessonId: string;
  lessonPlanId: string;
  itemId: string;
  timetableEntryId: string;
};

jest.setTimeout(180000);

describe('Academics lesson plan workflow tenancy and permissions (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let organizationAId = '';
  let organizationBId = '';
  let schoolAId = '';
  let schoolBId = '';
  let adminAUserId = '';
  let adminBUserId = '';
  let adminAEmail = '';
  let adminBEmail = '';
  let viewerEmail = '';
  let noPermissionEmail = '';
  let teacherEmail = '';
  let academicA: AcademicBase;
  let academicB: AcademicBase;
  let treeA: LessonTree;
  let treeB: LessonTree;
  let adminAAuth: AuthTokens;
  let adminBAuth: AuthTokens;
  let viewerAuth: AuthTokens;
  let noPermissionAuth: AuthTokens;
  let teacherAuth: AuthTokens;

  const suffix = randomUUID().split('-')[0];
  const marker = `s22e-sec-${suffix}`;
  const createdOrganizationIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const [schoolAdminRole, teacherRole, viewPermission, managePermission] =
      await Promise.all([
        findSystemRole('school_admin'),
        findSystemRole('teacher'),
        findPermission('academics.lesson_plans.view'),
        findPermission('academics.lesson_plans.manage'),
      ]);

    organizationAId = await createOrganization('a');
    organizationBId = await createOrganization('b');
    schoolAId = await createSchool(organizationAId, 'a');
    schoolBId = await createSchool(organizationBId, 'b');
    academicA = await createAcademicBase(schoolAId, 'a');
    academicB = await createAcademicBase(schoolBId, 'b');

    const viewerRoleId = await createRole({
      schoolId: schoolAId,
      key: `${marker}-viewer`,
      name: `Sprint 22E Viewer ${suffix}`,
      permissionIds: [viewPermission.id],
    });
    const noPermissionRoleId = await createRole({
      schoolId: schoolAId,
      key: `${marker}-empty`,
      name: `Sprint 22E Empty ${suffix}`,
      permissionIds: [],
    });

    adminAEmail = `${marker}-admin-a@example.test`;
    adminBEmail = `${marker}-admin-b@example.test`;
    viewerEmail = `${marker}-viewer@example.test`;
    noPermissionEmail = `${marker}-empty@example.test`;
    teacherEmail = `${marker}-teacher-role@example.test`;
    adminAUserId = await createUserWithMembership({
      email: adminAEmail,
      firstName: 'Sec',
      lastName: 'AdminA',
      userType: UserType.SCHOOL_USER,
      roleId: schoolAdminRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    adminBUserId = await createUserWithMembership({
      email: adminBEmail,
      firstName: 'Sec',
      lastName: 'AdminB',
      userType: UserType.SCHOOL_USER,
      roleId: schoolAdminRole.id,
      organizationId: organizationBId,
      schoolId: schoolBId,
    });
    await createUserWithMembership({
      email: viewerEmail,
      firstName: 'View',
      lastName: 'Only',
      userType: UserType.SCHOOL_USER,
      roleId: viewerRoleId,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    await createUserWithMembership({
      email: noPermissionEmail,
      firstName: 'No',
      lastName: 'Perms',
      userType: UserType.SCHOOL_USER,
      roleId: noPermissionRoleId,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    await createUserWithMembership({
      email: teacherEmail,
      firstName: 'Teacher',
      lastName: 'Role',
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });

    treeA = await createLessonTree({
      schoolId: schoolAId,
      academic: academicA,
      adminUserId: adminAUserId,
      label: 'a',
    });
    treeB = await createLessonTree({
      schoolId: schoolBId,
      academic: academicB,
      adminUserId: adminBUserId,
      label: 'b',
    });
    await createHoliday({
      schoolId: schoolBId,
      academic: academicB,
      adminUserId: adminBUserId,
      date: '2026-09-02',
      label: 'school-b-only',
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
    noPermissionAuth = await login(noPermissionEmail);
    teacherAuth = await login(teacherEmail);
  });

  afterAll(async () => {
    try {
      if (app) await app.close();
      await cleanupData();
    } finally {
      if (prisma) await prisma.$disconnect();
    }
  });

  it('denies read workflows without lesson-plan view permission', async () => {
    for (const path of ['weeks', 'summary', 'validation']) {
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/academics/lesson-plans/${path}`)
        .query({ termId: academicA.termId })
        .set('Authorization', bearer(noPermissionAuth))
        .expect(403);
    }
  });

  it('denies write workflows without lesson-plan manage permission', async () => {
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/lesson-plans/auto-plan`)
      .set('Authorization', bearer(viewerAuth))
      .send({
        termId: academicA.termId,
        teacherSubjectAllocationId: treeA.allocationId,
      })
      .expect(403);

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/academics/lesson-plans/items/${treeA.itemId}/move`)
      .set('Authorization', bearer(viewerAuth))
      .send({ plannedDate: '2026-09-08' })
      .expect(403);
  });

  it('rejects cross-school term and teacher allocation references', async () => {
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/lesson-plans/weeks`)
      .query({ termId: academicB.termId })
      .set('Authorization', bearer(adminAAuth))
      .expect(422)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.lesson_plan.invalid_scope',
        );
        expectNoObjectKey(response.body, 'schoolId');
      });

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/lesson-plans/auto-plan`)
      .set('Authorization', bearer(adminAAuth))
      .send({
        termId: academicA.termId,
        teacherSubjectAllocationId: treeB.allocationId,
      })
      .expect(422)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.lesson_plan.invalid_scope',
        );
      });
  });

  it('rejects cross-school timetable entries when moving an item', async () => {
    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/academics/lesson-plans/items/${treeA.itemId}/move`)
      .set('Authorization', bearer(adminAAuth))
      .send({
        plannedDate: '2026-09-08',
        timetableEntryId: treeB.timetableEntryId,
      })
      .expect(422)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.lesson_plan.invalid_timetable_entry',
        );
      });
  });

  it('does not let another school calendar event affect holiday-aware weeks', async () => {
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/lesson-plans/weeks`)
      .query({
        termId: academicA.termId,
        teacherSubjectAllocationId: treeA.allocationId,
        from: '2026-09-02',
        to: '2026-09-02',
      })
      .set('Authorization', bearer(adminAAuth))
      .expect(200)
      .expect((response) => {
        expect(response.body.weeks[0].holidayDays).toEqual([]);
        expectNoObjectKey(response.body, 'schoolId');
        expectNoObjectKey(response.body, 'deletedAt');
      });

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/lesson-plans/weeks`)
      .query({
        termId: academicB.termId,
        teacherSubjectAllocationId: treeB.allocationId,
        from: '2026-09-02',
        to: '2026-09-02',
      })
      .set('Authorization', bearer(adminBAuth))
      .expect(200)
      .expect((response) => {
        expect(response.body.weeks[0].holidayDays).toHaveLength(1);
      });
  });

  it('returns safe summary responses without tenant or internal fields', async () => {
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/lesson-plans/summary`)
      .query({ termId: academicA.termId })
      .set('Authorization', bearer(adminAAuth))
      .expect(200)
      .expect((response) => {
        expect(response.body.byTeacherAllocation[0].teacher).toMatchObject({
          id: treeA.teacherUserId,
          firstName: 'Sec',
        });
        expectNoObjectKey(response.body, 'schoolId');
        expectNoObjectKey(response.body, 'organizationId');
        expectNoObjectKey(response.body, 'membershipId');
        expectNoObjectKey(response.body, 'email');
        expectNoObjectKey(response.body, 'deletedAt');
      });
  });

  it('denies app teacher role from dashboard lesson-plan workflow routes by default', async () => {
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/lesson-plans/weeks`)
      .query({ termId: academicA.termId })
      .set('Authorization', bearer(teacherAuth))
      .expect(403);
  });

  it('denies closed-term mutations', async () => {
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/lesson-plans/auto-plan`)
      .set('Authorization', bearer(adminAAuth))
      .send({
        termId: academicA.closedTermId,
        teacherSubjectAllocationId: treeA.closedAllocationId,
      })
      .expect(409)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.lesson_plan.closed_term',
        );
      });
  });

  async function findSystemRole(key: string): Promise<{ id: string }> {
    const role = await prisma.role.findFirst({
      where: { key, schoolId: null, isSystem: true, deletedAt: null },
      select: { id: true },
    });
    if (!role) throw new Error(`Missing system role: ${key}`);
    return role;
  }

  async function findPermission(code: string): Promise<{ id: string }> {
    const permission = await prisma.permission.findUnique({
      where: { code },
      select: { id: true },
    });
    if (!permission) throw new Error(`Missing permission: ${code}`);
    return permission;
  }

  async function createRole(input: {
    schoolId: string;
    key: string;
    name: string;
    permissionIds: string[];
  }): Promise<string> {
    const role = await prisma.role.create({
      data: {
        schoolId: input.schoolId,
        key: input.key,
        name: input.name,
        isSystem: false,
      },
      select: { id: true },
    });
    createdRoleIds.push(role.id);

    for (const permissionId of input.permissionIds) {
      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId },
      });
    }

    return role.id;
  }

  async function createOrganization(label: string): Promise<string> {
    const organization = await prisma.organization.create({
      data: {
        slug: `${marker}-${label}-org`,
        name: `Sprint 22E Sec Org ${label} ${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);
    return organization.id;
  }

  async function createSchool(
    organizationId: string,
    label: string,
  ): Promise<string> {
    const school = await prisma.school.create({
      data: {
        organizationId,
        slug: `${marker}-${label}-school`,
        name: `Sprint 22E Sec School ${label} ${suffix}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdSchoolIds.push(school.id);
    return school.id;
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
    schoolId: string,
    label: string,
  ): Promise<AcademicBase> {
    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId,
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
        schoolId,
        academicYearId: academicYear.id,
        nameAr: `${marker}-${label}-term-ar`,
        nameEn: `${marker}-${label}-term`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    const closedTerm = await prisma.term.create({
      data: {
        schoolId,
        academicYearId: academicYear.id,
        nameAr: `${marker}-${label}-closed-term-ar`,
        nameEn: `${marker}-${label}-closed-term`,
        startDate: new Date('2027-01-01T00:00:00.000Z'),
        endDate: new Date('2027-03-31T00:00:00.000Z'),
        isActive: false,
      },
      select: { id: true },
    });
    const stage = await prisma.stage.create({
      data: {
        schoolId,
        nameAr: `${marker}-${label}-stage-ar`,
        nameEn: `${marker}-${label}-stage`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const grade = await prisma.grade.create({
      data: {
        schoolId,
        stageId: stage.id,
        nameAr: `${marker}-${label}-grade-ar`,
        nameEn: `${marker}-${label}-grade`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const section = await prisma.section.create({
      data: {
        schoolId,
        gradeId: grade.id,
        nameAr: `${marker}-${label}-section-ar`,
        nameEn: `${marker}-${label}-section`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const classroom = await prisma.classroom.create({
      data: {
        schoolId,
        sectionId: section.id,
        nameAr: `${marker}-${label}-class-ar`,
        nameEn: `${marker}-${label}-class`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const subject = await prisma.subject.create({
      data: {
        schoolId,
        nameAr: `${marker}-${label}-subject-ar`,
        nameEn: `${marker}-${label}-subject`,
        code: `S22ESEC-${label}-${suffix}`,
        isActive: true,
      },
      select: { id: true },
    });

    return {
      academicYearId: academicYear.id,
      termId: term.id,
      closedTermId: closedTerm.id,
      stageId: stage.id,
      gradeId: grade.id,
      sectionId: section.id,
      classroomId: classroom.id,
      subjectId: subject.id,
    };
  }

  async function createLessonTree(input: {
    schoolId: string;
    academic: AcademicBase;
    adminUserId: string;
    label: string;
  }): Promise<LessonTree> {
    const teacherRole = await findSystemRole('teacher');
    const teacherUserId = await createUserWithMembership({
      email: `${marker}-${input.label}-teacher@example.test`,
      firstName: 'Sec',
      lastName: `Teacher${input.label}`,
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
      organizationId: input.label === 'a' ? organizationAId : organizationBId,
      schoolId: input.schoolId,
    });
    const allocation = await prisma.teacherSubjectAllocation.create({
      data: {
        schoolId: input.schoolId,
        teacherUserId,
        subjectId: input.academic.subjectId,
        classroomId: input.academic.classroomId,
        termId: input.academic.termId,
      },
      select: { id: true },
    });
    const closedAllocation = await prisma.teacherSubjectAllocation.create({
      data: {
        schoolId: input.schoolId,
        teacherUserId,
        subjectId: input.academic.subjectId,
        classroomId: input.academic.classroomId,
        termId: input.academic.closedTermId,
      },
      select: { id: true },
    });
    const curriculum = await prisma.curriculum.create({
      data: {
        schoolId: input.schoolId,
        academicYearId: input.academic.academicYearId,
        termId: input.academic.termId,
        gradeId: input.academic.gradeId,
        subjectId: input.academic.subjectId,
        title: `${marker}-${input.label}-curriculum`,
        status: CurriculumStatus.ACTIVE,
        createdByUserId: input.adminUserId,
        updatedByUserId: input.adminUserId,
      },
      select: { id: true },
    });
    const unit = await prisma.curriculumUnit.create({
      data: {
        schoolId: input.schoolId,
        curriculumId: curriculum.id,
        title: `${marker}-${input.label}-unit`,
        sortOrder: 0,
      },
      select: { id: true },
    });
    const lesson = await prisma.curriculumLesson.create({
      data: {
        schoolId: input.schoolId,
        curriculumId: curriculum.id,
        unitId: unit.id,
        title: `${marker}-${input.label}-lesson`,
        sortOrder: 0,
      },
      select: { id: true },
    });
    const config = await prisma.timetableConfig.create({
      data: {
        schoolId: input.schoolId,
        academicYearId: input.academic.academicYearId,
        termId: input.academic.termId,
        name: `${marker}-${input.label}-config`,
        weekStartDay: 0,
        activeDays: [0, 1, 2, 3, 4],
        scopeType: TimetableScopeType.CLASSROOM,
        scopeKey: input.academic.classroomId,
        classroomId: input.academic.classroomId,
        status: TimetableConfigStatus.ACTIVE,
      },
      select: { id: true },
    });
    const period = await prisma.timetablePeriod.create({
      data: {
        schoolId: input.schoolId,
        timetableConfigId: config.id,
        periodIndex: 1,
        label: `${marker}-${input.label}-period`,
        startTime: '08:00',
        endTime: '08:45',
        type: TimetablePeriodType.CLASS,
        isInstructional: true,
      },
      select: { id: true },
    });
    const timetableEntry = await prisma.timetableEntry.create({
      data: {
        schoolId: input.schoolId,
        academicYearId: input.academic.academicYearId,
        termId: input.academic.termId,
        timetableConfigId: config.id,
        periodId: period.id,
        dayOfWeek: 2,
        gradeId: input.academic.gradeId,
        sectionId: input.academic.sectionId,
        classroomId: input.academic.classroomId,
        subjectId: input.academic.subjectId,
        teacherUserId,
        teacherSubjectAllocationId: allocation.id,
        status: TimetableEntryStatus.ACTIVE,
      },
      select: { id: true },
    });
    const lessonPlan = await prisma.lessonPlan.create({
      data: {
        schoolId: input.schoolId,
        academicYearId: input.academic.academicYearId,
        termId: input.academic.termId,
        teacherSubjectAllocationId: allocation.id,
        teacherUserId,
        classroomId: input.academic.classroomId,
        subjectId: input.academic.subjectId,
        curriculumId: curriculum.id,
        title: `${marker}-${input.label}-plan`,
        status: 'DRAFT',
        weekStartDate: new Date('2026-09-01T00:00:00.000Z'),
        weekEndDate: new Date('2026-09-07T00:00:00.000Z'),
        createdByUserId: input.adminUserId,
        updatedByUserId: input.adminUserId,
      },
      select: { id: true },
    });
    const item = await prisma.lessonPlanItem.create({
      data: {
        schoolId: input.schoolId,
        lessonPlanId: lessonPlan.id,
        curriculumId: curriculum.id,
        unitId: unit.id,
        lessonId: lesson.id,
        timetableEntryId: timetableEntry.id,
        plannedDate: new Date('2026-09-01T00:00:00.000Z'),
        dayOfWeek: 2,
        periodId: period.id,
        periodLabel: `${marker}-${input.label}-period`,
        title: `${marker}-${input.label}-item`,
        status: 'PLANNED',
        sortOrder: 0,
        createdByUserId: input.adminUserId,
        updatedByUserId: input.adminUserId,
      },
      select: { id: true },
    });

    return {
      teacherUserId,
      allocationId: allocation.id,
      closedAllocationId: closedAllocation.id,
      curriculumId: curriculum.id,
      unitId: unit.id,
      lessonId: lesson.id,
      lessonPlanId: lessonPlan.id,
      itemId: item.id,
      timetableEntryId: timetableEntry.id,
    };
  }

  async function createHoliday(input: {
    schoolId: string;
    academic: AcademicBase;
    adminUserId: string;
    date: string;
    label: string;
  }): Promise<void> {
    await prisma.academicCalendarEvent.create({
      data: {
        schoolId: input.schoolId,
        academicYearId: input.academic.academicYearId,
        termId: input.academic.termId,
        title: `${marker}-${input.label}`,
        type: AcademicCalendarEventType.HOLIDAY,
        scopeType: AcademicCalendarEventScopeType.SCHOOL,
        allDay: true,
        startDate: new Date(`${input.date}T00:00:00.000Z`),
        endDate: new Date(`${input.date}T23:59:59.000Z`),
        createdByUserId: input.adminUserId,
        updatedByUserId: input.adminUserId,
      },
    });
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

  async function cleanupData(): Promise<void> {
    if (!prisma) return;

    await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { actorId: { in: createdUserIds } },
          { schoolId: { in: createdSchoolIds } },
          { organizationId: { in: createdOrganizationIds } },
        ],
      },
    });
    await prisma.lessonPlanItem.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
    await prisma.lessonPlan.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
    await prisma.timetableEntry.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
    await prisma.timetablePeriod.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
    await prisma.timetableConfig.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
    await prisma.academicCalendarEvent.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
    await prisma.curriculumLesson.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
    await prisma.curriculumUnit.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
    await prisma.curriculum.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
    await prisma.teacherSubjectAllocation.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
    await prisma.subject.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
    await prisma.classroom.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
    await prisma.section.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
    await prisma.grade.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
    await prisma.stage.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
    await prisma.term.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
    await prisma.academicYear.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
    await prisma.membership.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: createdRoleIds } } });
    await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
    await prisma.school.deleteMany({ where: { id: { in: createdSchoolIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: createdOrganizationIds } } });
  }
});
