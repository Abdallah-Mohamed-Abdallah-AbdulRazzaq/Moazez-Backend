import { randomUUID } from 'node:crypto';
import {
  CurriculumStatus,
  LessonContentItemType,
  LessonPlanItemStatus,
  LessonPlanStatus,
  MembershipStatus,
  PrismaClient,
  UserStatus,
  UserType,
} from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import {
  APP_CALENDAR_PASSWORD,
  AppFacingCalendarFixture,
  bearer,
  createAppFacingCalendarFixture,
  expectNoObjectKey,
  GLOBAL_PREFIX,
} from '../helpers/app-facing-calendar-test-utils';

type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

type ExtraData = {
  adminAEmail: string;
  adminBEmail: string;
  noPermissionEmail: string;
  adminAAuth: AuthTokens;
  adminBAuth: AuthTokens;
  noPermissionAuth: AuthTokens;
  curriculumAId: string;
  curriculumBId: string;
  lessonPlanAId: string;
  lessonPlanBId: string;
  lessonPlanItemAId: string;
  lessonPlanItemBId: string;
  hiddenLessonPlanItemId: string;
  softDeletedSubjectId: string;
};

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

const DASHBOARD_PERMISSIONS = [
  ['academics.overview.view', 'overview', 'view'],
  ['academics.calendar.view', 'calendar', 'view'],
  ['academics.calendar.manage', 'calendar', 'manage'],
  ['academics.subjects.view', 'subjects', 'view'],
  ['academics.subjects.manage', 'subjects', 'manage'],
  ['academics.structure.view', 'structure', 'view'],
  ['academics.structure.manage', 'structure', 'manage'],
  ['academics.curriculum.view', 'curriculum', 'view'],
  ['academics.curriculum.manage', 'curriculum', 'manage'],
  ['academics.lesson_plans.view', 'lesson_plans', 'view'],
  ['academics.lesson_plans.manage', 'lesson_plans', 'manage'],
] as const;

jest.setTimeout(180000);

describe('Academics final completion tenancy/security sweep', () => {
  let fixture: AppFacingCalendarFixture;
  let prisma: PrismaClient;
  let extra: ExtraData;

  const suffix = randomUUID().split('-')[0];
  const marker = `s22k-sec-${suffix}`;
  const tracked = {
    roleIds: [] as string[],
    userIds: [] as string[],
    curriculumIds: [] as string[],
    unitIds: [] as string[],
    lessonIds: [] as string[],
    contentItemIds: [] as string[],
    lessonPlanIds: [] as string[],
    lessonPlanItemIds: [] as string[],
    subjectIds: [] as string[],
    allocationIds: [] as string[],
  };

  beforeAll(async () => {
    fixture = await createAppFacingCalendarFixture('academics-final-security');
    prisma = fixture.prisma;
    extra = await createExtraSecurityData();
  });

  afterAll(async () => {
    if (prisma) await cleanupExtraData();
    if (fixture) await fixture.close();
  });

  it('denies representative dashboard Academics routes to unauthenticated, app-role, and no-permission actors', async () => {
    const protectedReads = [
      `${GLOBAL_PREFIX}/academics/subjects`,
      `${GLOBAL_PREFIX}/academics/allocations/validation?termId=${fixture.academicA.termId}`,
      `${GLOBAL_PREFIX}/academics/timetable/validate?termId=${fixture.academicA.termId}&gradeId=${fixture.academicA.gradeId}`,
      `${GLOBAL_PREFIX}/academics/curriculum?termId=${fixture.academicA.termId}`,
      `${GLOBAL_PREFIX}/academics/lesson-plans?termId=${fixture.academicA.termId}`,
      `${GLOBAL_PREFIX}/academics/calendar/events?from=2026-10-01T00:00:00.000Z&to=2026-10-31T23:59:59.000Z`,
    ];

    for (const path of protectedReads) {
      await request(fixture.app.getHttpServer()).get(path).expect(401);
    }

    const deniedActors = [
      extra.noPermissionAuth,
      fixture.teacher.auth,
      fixture.student.auth,
      fixture.parent.auth,
    ];

    for (const path of protectedReads) {
      for (const auth of deniedActors) {
        await request(fixture.app.getHttpServer())
          .get(path)
          .set('Authorization', bearer(auth))
          .expect(403);
      }
    }
  });

  it('filters cross-school and soft-deleted dashboard data from representative Academics lists', async () => {
    const subjects = await request(fixture.app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/subjects`)
      .set('Authorization', bearer(extra.adminAAuth))
      .expect(200);

    const subjectIds = extractIds(subjects.body.items);
    expect(subjectIds).toContain(fixture.academicA.subjectId);
    expect(subjectIds).not.toContain(fixture.academicB.subjectId);
    expect(subjectIds).not.toContain(extra.softDeletedSubjectId);
    expectNoDashboardLeakFields(subjects.body);

    const calendar = await request(fixture.app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/calendar/events`)
      .query({ from: '2026-10-01T00:00:00.000Z', to: '2026-10-31T23:59:59.000Z' })
      .set('Authorization', bearer(extra.adminAAuth))
      .expect(200);

    const eventIds = extractIds(calendar.body.items);
    expect(eventIds).toContain(fixture.events.school);
    expect(eventIds).not.toContain(fixture.events.crossSchool);
    expect(eventIds).not.toContain(fixture.events.softDeleted);
    expectNoDashboardLeakFields(calendar.body);

    const curricula = await request(fixture.app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/curriculum`)
      .query({ termId: fixture.academicA.termId })
      .set('Authorization', bearer(extra.adminAAuth))
      .expect(200);

    const curriculumIds = extractIds(curricula.body.items);
    expect(curriculumIds).toContain(extra.curriculumAId);
    expect(curriculumIds).not.toContain(extra.curriculumBId);
    expectNoDashboardLeakFields(curricula.body);

    const lessonPlans = await request(fixture.app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/lesson-plans`)
      .query({ termId: fixture.academicA.termId })
      .set('Authorization', bearer(extra.adminAAuth))
      .expect(200);

    const lessonPlanIds = extractIds(lessonPlans.body.items);
    expect(lessonPlanIds).toContain(extra.lessonPlanAId);
    expect(lessonPlanIds).not.toContain(extra.lessonPlanBId);
    expectNoDashboardLeakFields(lessonPlans.body);
  });

  it('returns safe not-found behavior for cross-school dashboard detail ids', async () => {
    for (const path of [
      `${GLOBAL_PREFIX}/academics/curriculum/${extra.curriculumBId}`,
      `${GLOBAL_PREFIX}/academics/calendar/events/${fixture.events.crossSchool}`,
      `${GLOBAL_PREFIX}/academics/lesson-plans/${extra.lessonPlanBId}`,
    ]) {
      await request(fixture.app.getHttpServer())
        .get(path)
        .set('Authorization', bearer(extra.adminAAuth))
        .expect(404)
        .expect((response) => {
          const serialized = JSON.stringify(response.body);
          expect(serialized).not.toContain(extra.curriculumBId);
          expect(serialized).not.toContain(extra.lessonPlanBId);
          expect(serialized).not.toContain(fixture.events.crossSchool);
        });
    }
  });

  it('keeps app-facing role boundaries isolated across Teacher, Student, and Parent academics routes', async () => {
    const nonTeacherActors = [fixture.student.auth, fixture.parent.auth, extra.adminAAuth];
    for (const auth of nonTeacherActors) {
      await request(fixture.app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/teacher/lesson-preparation/today`)
        .query({ date: '2026-10-02' })
        .set('Authorization', bearer(auth))
        .expect(403);
      await request(fixture.app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/teacher/schedule`)
        .query({ date: '2026-10-02' })
        .set('Authorization', bearer(auth))
        .expect(403);
    }

    const nonStudentActors = [fixture.teacher.auth, fixture.parent.auth, extra.adminAAuth];
    for (const auth of nonStudentActors) {
      await request(fixture.app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/student/lessons/today`)
        .query({ date: '2026-10-02' })
        .set('Authorization', bearer(auth))
        .expect(403);
      await request(fixture.app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/student/calendar/events`)
        .query({ from: '2026-10-01T00:00:00.000Z', to: '2026-10-31T23:59:59.000Z' })
        .set('Authorization', bearer(auth))
        .expect(403);
      await request(fixture.app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/student/schedule`)
        .query({ date: '2026-10-02' })
        .set('Authorization', bearer(auth))
        .expect(403);
    }

    const nonParentActors = [fixture.teacher.auth, fixture.student.auth, extra.adminAAuth];
    for (const auth of nonParentActors) {
      await request(fixture.app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/parent/children/${fixture.ownedChildStudentId}/lessons/today`)
        .query({ date: '2026-10-02' })
        .set('Authorization', bearer(auth))
        .expect(403);
      await request(fixture.app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/parent/children/${fixture.ownedChildStudentId}/calendar/events`)
        .query({ from: '2026-10-01T00:00:00.000Z', to: '2026-10-31T23:59:59.000Z' })
        .set('Authorization', bearer(auth))
        .expect(403);
      await request(fixture.app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/parent/children/${fixture.ownedChildStudentId}/schedule/today`)
        .query({ date: '2026-10-02' })
        .set('Authorization', bearer(auth))
        .expect(403);
    }
  });

  it('keeps app-facing lesson responses scoped and free of tenant, storage, and teacher-only fields', async () => {
    const teacherLessons = await request(fixture.app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/lesson-preparation/today`)
      .query({ date: '2026-10-02' })
      .set('Authorization', bearer(fixture.teacher.auth))
      .expect(200);

    expect(extractIds(teacherLessons.body.items)).toContain(extra.lessonPlanItemAId);
    expect(JSON.stringify(teacherLessons.body)).toContain(`${marker}-teacher-private-note`);
    expectAppFacingSafeFields(teacherLessons.body);

    const studentLessons = await request(fixture.app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/student/lessons/today`)
      .query({ date: '2026-10-02' })
      .set('Authorization', bearer(fixture.student.auth))
      .expect(200);

    expect(extractIds(studentLessons.body.items)).toContain(extra.lessonPlanItemAId);
    expect(extractIds(studentLessons.body.items)).not.toContain(extra.hiddenLessonPlanItemId);
    expect(JSON.stringify(studentLessons.body)).not.toContain(`${marker}-teacher-private-note`);
    expectAppFacingSafeFields(studentLessons.body);

    const parentLessons = await request(fixture.app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/children/${fixture.ownedChildStudentId}/lessons/today`)
      .query({ date: '2026-10-02' })
      .set('Authorization', bearer(fixture.parent.auth))
      .expect(200);

    expect(extractIds(parentLessons.body.items)).toContain(extra.lessonPlanItemAId);
    expect(extractIds(parentLessons.body.items)).not.toContain(extra.hiddenLessonPlanItemId);
    expect(JSON.stringify(parentLessons.body)).not.toContain(`${marker}-teacher-private-note`);
    expectAppFacingSafeFields(parentLessons.body);
  });

  it('blocks representative closed-term dashboard writes without adding new product behavior', async () => {
    await request(fixture.app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/academics/subject-allocations/bulk`)
      .set('Authorization', bearer(extra.adminAAuth))
      .send({
        termId: fixture.otherAcademicA.termId,
        items: [
          {
            gradeId: fixture.academicA.gradeId,
            subjectId: fixture.academicA.subjectId,
            weeklyHours: 3,
          },
        ],
      })
      .expect(409)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.subject_allocation.closed_term',
        );
      });
  });

  async function createExtraSecurityData(): Promise<ExtraData> {
    const permissions = await Promise.all(
      DASHBOARD_PERMISSIONS.map(([code, resource, action]) =>
        findOrCreatePermission({ code, resource, action }),
      ),
    );

    const [adminARoleId, adminBRoleId, noPermissionRoleId] = await Promise.all([
      createCustomRole({
        schoolId: fixture.schoolAId,
        key: `${marker}-admin-a`,
        name: `Sprint 22K Final Admin A ${suffix}`,
        permissionIds: permissions.map((permission) => permission.id),
      }),
      createCustomRole({
        schoolId: fixture.schoolBId,
        key: `${marker}-admin-b`,
        name: `Sprint 22K Final Admin B ${suffix}`,
        permissionIds: permissions.map((permission) => permission.id),
      }),
      createCustomRole({
        schoolId: fixture.schoolAId,
        key: `${marker}-no-permission`,
        name: `Sprint 22K Final No Permission ${suffix}`,
        permissionIds: [],
      }),
    ]);

    const adminAEmail = `${marker}-admin-a@example.test`;
    const adminBEmail = `${marker}-admin-b@example.test`;
    const noPermissionEmail = `${marker}-no-permission@example.test`;
    await createUserWithMembership({
      email: adminAEmail,
      firstName: 'Final',
      lastName: 'AdminA',
      userType: UserType.SCHOOL_USER,
      roleId: adminARoleId,
      organizationId: fixture.organizationAId,
      schoolId: fixture.schoolAId,
    });
    await createUserWithMembership({
      email: adminBEmail,
      firstName: 'Final',
      lastName: 'AdminB',
      userType: UserType.SCHOOL_USER,
      roleId: adminBRoleId,
      organizationId: fixture.organizationBId,
      schoolId: fixture.schoolBId,
    });
    await createUserWithMembership({
      email: noPermissionEmail,
      firstName: 'No',
      lastName: 'Permission',
      userType: UserType.SCHOOL_USER,
      roleId: noPermissionRoleId,
      organizationId: fixture.organizationAId,
      schoolId: fixture.schoolAId,
    });

    const teacherRole = await findSystemRole('teacher');
    const teacherBUserId = await createUserWithMembership({
      email: `${marker}-teacher-b@example.test`,
      firstName: 'Final',
      lastName: 'TeacherB',
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
      organizationId: fixture.organizationBId,
      schoolId: fixture.schoolBId,
    });

    const softDeletedSubjectId = await prisma.subject
      .create({
        data: {
          schoolId: fixture.schoolAId,
          nameAr: `${marker}-soft-deleted-subject-ar`,
          nameEn: `${marker}-soft-deleted-subject`,
          code: `${marker}-DELETED`.slice(0, 40),
          isActive: true,
          deletedAt: new Date('2026-10-01T00:00:00.000Z'),
        },
        select: { id: true },
      })
      .then((subject) => subject.id);
    tracked.subjectIds.push(softDeletedSubjectId);

    const allocationA = await prisma.teacherSubjectAllocation.findFirstOrThrow({
      where: {
        schoolId: fixture.schoolAId,
        teacherUserId: fixture.teacher.userId,
        classroomId: fixture.academicA.classroomId,
        subjectId: fixture.academicA.subjectId,
        termId: fixture.academicA.termId,
      },
      select: { id: true },
    });

    const allocationB = await prisma.teacherSubjectAllocation.create({
      data: {
        schoolId: fixture.schoolBId,
        teacherUserId: teacherBUserId,
        classroomId: fixture.academicB.classroomId,
        subjectId: fixture.academicB.subjectId,
        termId: fixture.academicB.termId,
      },
      select: { id: true },
    });
    tracked.allocationIds.push(allocationB.id);

    const activeA = await createLessonContentChain({
      schoolId: fixture.schoolAId,
      academicYearId: fixture.academicA.academicYearId,
      termId: fixture.academicA.termId,
      gradeId: fixture.academicA.gradeId,
      subjectId: fixture.academicA.subjectId,
      teacherUserId: fixture.teacher.userId,
      allocationId: allocationA.id,
      classroomId: fixture.academicA.classroomId,
      label: 'a-active',
      status: LessonPlanStatus.ACTIVE,
      notes: `${marker}-teacher-private-note`,
    });

    const hiddenA = await createSoftDeletedLessonPlanItem({
      source: activeA,
      schoolId: fixture.schoolAId,
      teacherUserId: fixture.teacher.userId,
    });

    const activeB = await createLessonContentChain({
      schoolId: fixture.schoolBId,
      academicYearId: fixture.academicB.academicYearId,
      termId: fixture.academicB.termId,
      gradeId: fixture.academicB.gradeId,
      subjectId: fixture.academicB.subjectId,
      teacherUserId: teacherBUserId,
      allocationId: allocationB.id,
      classroomId: fixture.academicB.classroomId,
      label: 'b-active',
      status: LessonPlanStatus.ACTIVE,
      notes: `${marker}-cross-private-note`,
    });

    return {
      adminAEmail,
      adminBEmail,
      noPermissionEmail,
      adminAAuth: await login(adminAEmail),
      adminBAuth: await login(adminBEmail),
      noPermissionAuth: await login(noPermissionEmail),
      curriculumAId: activeA.curriculumId,
      curriculumBId: activeB.curriculumId,
      lessonPlanAId: activeA.lessonPlanId,
      lessonPlanBId: activeB.lessonPlanId,
      lessonPlanItemAId: activeA.lessonPlanItemId,
      lessonPlanItemBId: activeB.lessonPlanItemId,
      hiddenLessonPlanItemId: hiddenA.lessonPlanItemId,
      softDeletedSubjectId,
    };
  }

  async function findOrCreatePermission(params: {
    code: string;
    resource: string;
    action: string;
  }): Promise<{ id: string }> {
    const existing = await prisma.permission.findUnique({
      where: { code: params.code },
      select: { id: true },
    });
    if (existing) return existing;

    return prisma.permission.create({
      data: {
        code: params.code,
        module: 'academics',
        resource: params.resource,
        action: params.action,
        description: `Sprint 22K final sweep permission for ${params.code}.`,
      },
      select: { id: true },
    });
  }

  async function createCustomRole(params: {
    schoolId: string;
    key: string;
    name: string;
    permissionIds: string[];
  }): Promise<string> {
    const role = await prisma.role.create({
      data: {
        schoolId: params.schoolId,
        key: params.key,
        name: params.name,
        description: 'Sprint 22K final completion sweep role.',
        isSystem: false,
        rolePermissions: {
          create: params.permissionIds.map((permissionId) => ({ permissionId })),
        },
      },
      select: { id: true },
    });
    tracked.roleIds.push(role.id);
    return role.id;
  }

  async function findSystemRole(key: string): Promise<{ id: string }> {
    const role = await prisma.role.findFirst({
      where: { key, schoolId: null, isSystem: true, deletedAt: null },
      select: { id: true },
    });
    if (!role) throw new Error(`Missing system role: ${key}`);
    return role;
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
        passwordHash: await argon2.hash(APP_CALENDAR_PASSWORD, ARGON2_OPTIONS),
      },
      select: { id: true },
    });
    tracked.userIds.push(user.id);

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

  async function login(email: string): Promise<AuthTokens> {
    const response = await request(fixture.app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password: APP_CALENDAR_PASSWORD })
      .expect(200);

    return {
      accessToken: response.body.accessToken,
      refreshToken: response.body.refreshToken,
    };
  }

  async function createLessonContentChain(params: {
    schoolId: string;
    academicYearId: string;
    termId: string;
    gradeId: string;
    subjectId: string;
    teacherUserId: string;
    allocationId: string;
    classroomId: string;
    label: string;
    status: LessonPlanStatus;
    notes: string;
  }): Promise<{
    curriculumId: string;
    unitId: string;
    lessonId: string;
    lessonPlanId: string;
    lessonPlanItemId: string;
  }> {
    const curriculum = await prisma.curriculum.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.academicYearId,
        termId: params.termId,
        gradeId: params.gradeId,
        subjectId: params.subjectId,
        title: `${marker}-${params.label}-curriculum`,
        status:
          params.status === LessonPlanStatus.ARCHIVED
            ? CurriculumStatus.ARCHIVED
            : CurriculumStatus.ACTIVE,
        createdByUserId: params.teacherUserId,
        publishedAt: new Date('2026-09-01T00:00:00.000Z'),
        archivedAt:
          params.status === LessonPlanStatus.ARCHIVED
            ? new Date('2026-09-15T00:00:00.000Z')
            : null,
      },
      select: { id: true },
    });
    tracked.curriculumIds.push(curriculum.id);

    const unit = await prisma.curriculumUnit.create({
      data: {
        schoolId: params.schoolId,
        curriculumId: curriculum.id,
        title: `${marker}-${params.label}-unit`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    tracked.unitIds.push(unit.id);

    const lesson = await prisma.curriculumLesson.create({
      data: {
        schoolId: params.schoolId,
        curriculumId: curriculum.id,
        unitId: unit.id,
        title: `${marker}-${params.label}-lesson`,
        objectives: ['safe objective'],
        sortOrder: 1,
      },
      select: { id: true },
    });
    tracked.lessonIds.push(lesson.id);

    const content = await prisma.lessonContentItem.create({
      data: {
        schoolId: params.schoolId,
        curriculumId: curriculum.id,
        unitId: unit.id,
        lessonId: lesson.id,
        type: LessonContentItemType.TEXT,
        title: `${marker}-${params.label}-content`,
        bodyText: `${marker}-${params.label}-student-safe-body`,
        metadata: { teacherHint: `${marker}-teacher-facing-metadata` },
        sortOrder: 1,
        isRequired: true,
        estimatedMinutes: 10,
        createdByUserId: params.teacherUserId,
      },
      select: { id: true },
    });
    tracked.contentItemIds.push(content.id);

    const lessonPlan = await prisma.lessonPlan.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.academicYearId,
        termId: params.termId,
        teacherSubjectAllocationId: params.allocationId,
        teacherUserId: params.teacherUserId,
        classroomId: params.classroomId,
        subjectId: params.subjectId,
        curriculumId: curriculum.id,
        title: `${marker}-${params.label}-lesson-plan`,
        status: params.status,
        weekStartDate: new Date('2026-09-28T00:00:00.000Z'),
        weekEndDate: new Date('2026-10-04T00:00:00.000Z'),
        createdByUserId: params.teacherUserId,
        activatedAt:
          params.status === LessonPlanStatus.ACTIVE
            ? new Date('2026-09-20T00:00:00.000Z')
            : null,
        archivedAt:
          params.status === LessonPlanStatus.ARCHIVED
            ? new Date('2026-09-21T00:00:00.000Z')
            : null,
      },
      select: { id: true },
    });
    tracked.lessonPlanIds.push(lessonPlan.id);

    const item = await prisma.lessonPlanItem.create({
      data: {
        schoolId: params.schoolId,
        lessonPlanId: lessonPlan.id,
        curriculumId: curriculum.id,
        unitId: unit.id,
        lessonId: lesson.id,
        plannedDate: new Date('2026-10-02T00:00:00.000Z'),
        dayOfWeek: 4,
        title: `${marker}-${params.label}-lesson-plan-item`,
        notes: params.notes,
        status: LessonPlanItemStatus.PLANNED,
        sortOrder: 1,
        createdByUserId: params.teacherUserId,
      },
      select: { id: true },
    });
    tracked.lessonPlanItemIds.push(item.id);

    return {
      curriculumId: curriculum.id,
      unitId: unit.id,
      lessonId: lesson.id,
      lessonPlanId: lessonPlan.id,
      lessonPlanItemId: item.id,
    };
  }

  async function createSoftDeletedLessonPlanItem(params: {
    source: {
      curriculumId: string;
      unitId: string;
      lessonId: string;
      lessonPlanId: string;
    };
    schoolId: string;
    teacherUserId: string;
  }): Promise<{ lessonPlanId: string; lessonPlanItemId: string }> {
    const item = await prisma.lessonPlanItem.create({
      data: {
        schoolId: params.schoolId,
        lessonPlanId: params.source.lessonPlanId,
        curriculumId: params.source.curriculumId,
        unitId: params.source.unitId,
        lessonId: params.source.lessonId,
        plannedDate: new Date('2026-10-02T00:00:00.000Z'),
        dayOfWeek: 4,
        title: `${marker}-a-soft-deleted-lesson-plan-item`,
        notes: `${marker}-soft-deleted-private-note`,
        status: LessonPlanItemStatus.PLANNED,
        sortOrder: 2,
        createdByUserId: params.teacherUserId,
        deletedAt: new Date('2026-10-01T00:00:00.000Z'),
      },
      select: { id: true },
    });
    tracked.lessonPlanItemIds.push(item.id);

    return { lessonPlanId: params.source.lessonPlanId, lessonPlanItemId: item.id };
  }

  function extractIds(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) =>
        item && typeof item === 'object' && 'id' in item
          ? String((item as { id: unknown }).id)
          : item && typeof item === 'object' && 'lessonPlanItemId' in item
            ? String((item as { lessonPlanItemId: unknown }).lessonPlanItemId)
            : '',
      )
      .filter(Boolean);
  }

  function expectDashboardLeakFree(value: unknown): void {
    for (const forbiddenKey of [
      'passwordHash',
      'objectKey',
      'bucket',
      'uploaderId',
      'deletedAt',
    ]) {
      expectNoObjectKey(value, forbiddenKey);
    }
  }

  function expectNoDashboardLeakFields(value: unknown): void {
    expectDashboardLeakFree(value);
  }

  function expectAppFacingSafeFields(value: unknown): void {
    for (const forbiddenKey of [
      'schoolId',
      'organizationId',
      'membershipId',
      'roleId',
      'email',
      'passwordHash',
      'deletedAt',
      'objectKey',
      'bucket',
      'uploaderId',
      'createdByUserId',
      'updatedByUserId',
    ]) {
      expectNoObjectKey(value, forbiddenKey);
    }
  }

  async function cleanupExtraData(): Promise<void> {
    await prisma.session.deleteMany({ where: { userId: { in: tracked.userIds } } });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { actorId: { in: tracked.userIds } },
          { resourceId: { in: [...tracked.lessonPlanIds, ...tracked.curriculumIds] } },
        ],
      },
    });
    await prisma.lessonPlanItem.deleteMany({
      where: { id: { in: tracked.lessonPlanItemIds } },
    });
    await prisma.lessonPlan.deleteMany({
      where: { id: { in: tracked.lessonPlanIds } },
    });
    await prisma.lessonContentItem.deleteMany({
      where: { id: { in: tracked.contentItemIds } },
    });
    await prisma.curriculumLesson.deleteMany({
      where: { id: { in: tracked.lessonIds } },
    });
    await prisma.curriculumUnit.deleteMany({
      where: { id: { in: tracked.unitIds } },
    });
    await prisma.curriculum.deleteMany({
      where: { id: { in: tracked.curriculumIds } },
    });
    await prisma.teacherSubjectAllocation.deleteMany({
      where: { id: { in: tracked.allocationIds } },
    });
    await prisma.subject.deleteMany({
      where: { id: { in: tracked.subjectIds } },
    });
    await prisma.membership.deleteMany({ where: { userId: { in: tracked.userIds } } });
    await prisma.rolePermission.deleteMany({
      where: { roleId: { in: tracked.roleIds } },
    });
    await prisma.role.deleteMany({ where: { id: { in: tracked.roleIds } } });
    await prisma.user.deleteMany({ where: { id: { in: tracked.userIds } } });
  }
});
