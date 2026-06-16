import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AcademicCalendarEventScopeType,
  AcademicCalendarEventType,
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  SchoolStatus,
  StudentEnrollmentStatus,
  StudentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';

export const GLOBAL_PREFIX = '/api/v1';
export const APP_CALENDAR_PASSWORD = 'Sprint21CAppCalendar123!';

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

type ExpressLayer = {
  route?: {
    path?: string | string[];
    methods?: Record<string, boolean>;
  };
  handle?: {
    stack?: ExpressLayer[];
  };
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

export type CalendarActor = {
  userId: string;
  email: string;
  auth: AuthTokens;
};

export type AcademicStructureFixture = {
  academicYearId: string;
  termId: string;
  stageId: string;
  gradeId: string;
  sectionId: string;
  classroomId: string;
  otherStageId: string;
  otherGradeId: string;
  otherSectionId: string;
  otherClassroomId: string;
  subjectId: string;
};

export type AppFacingCalendarFixture = {
  app: INestApplication<App>;
  prisma: PrismaClient;
  marker: string;
  organizationAId: string;
  organizationBId: string;
  schoolAId: string;
  schoolBId: string;
  teacher: CalendarActor;
  student: CalendarActor & { studentId: string };
  parent: CalendarActor;
  ownedChildStudentId: string;
  nonOwnedChildStudentId: string;
  crossSchoolStudentId: string;
  academicA: AcademicStructureFixture;
  otherAcademicA: { academicYearId: string; termId: string };
  academicB: AcademicStructureFixture;
  events: {
    school: string;
    stage: string;
    grade: string;
    section: string;
    unrelatedStage: string;
    unrelatedGrade: string;
    unrelatedSection: string;
    crossSchool: string;
    otherAcademicSameSection: string;
    softDeleted: string;
  };
  close: () => Promise<void>;
};

type TrackedIds = {
  organizationIds: string[];
  schoolIds: string[];
  roleIds: string[];
  userIds: string[];
};

export async function createAppFacingCalendarFixture(
  label: string,
): Promise<AppFacingCalendarFixture> {
  const prisma = new PrismaClient();
  await prisma.$connect();

  const suffix = randomUUID().split('-')[0];
  const marker = `s21c-${label}-${suffix}`;
  const tracked: TrackedIds = {
    organizationIds: [],
    schoolIds: [],
    roleIds: [],
    userIds: [],
  };

  let app: INestApplication<App> | null = null;

  const organizationAId = await createOrganization(prisma, tracked, {
    slug: `${marker}-org-a`,
    name: `Sprint 21C Org A ${suffix}`,
  });
  const organizationBId = await createOrganization(prisma, tracked, {
    slug: `${marker}-org-b`,
    name: `Sprint 21C Org B ${suffix}`,
  });
  const schoolAId = await createSchool(prisma, tracked, {
    organizationId: organizationAId,
    slug: `${marker}-school-a`,
    name: `Sprint 21C School A ${suffix}`,
  });
  const schoolBId = await createSchool(prisma, tracked, {
    organizationId: organizationBId,
    slug: `${marker}-school-b`,
    name: `Sprint 21C School B ${suffix}`,
  });

  const schoolARoleId = await createRole(prisma, tracked, {
    schoolId: schoolAId,
    key: `${marker}-app-role-a`,
    name: `Sprint 21C App Role A ${suffix}`,
  });
  const schoolBRoleId = await createRole(prisma, tracked, {
    schoolId: schoolBId,
    key: `${marker}-app-role-b`,
    name: `Sprint 21C App Role B ${suffix}`,
  });

  const academicA = await createAcademicStructure(prisma, {
    marker,
    label: 'a-current',
    schoolId: schoolAId,
    startYear: 2026,
    active: true,
  });
  const otherAcademicA = await createOtherAcademicContext(prisma, {
    marker,
    schoolId: schoolAId,
  });
  const academicB = await createAcademicStructure(prisma, {
    marker,
    label: 'b-current',
    schoolId: schoolBId,
    startYear: 2026,
    active: true,
  });

  const teacherEmail = `${marker}-teacher@example.test`;
  const teacherUserId = await createUserWithMembership(prisma, tracked, {
    organizationId: organizationAId,
    schoolId: schoolAId,
    roleId: schoolARoleId,
    email: teacherEmail,
    firstName: 'Sprint21C',
    lastName: 'Teacher',
    userType: UserType.TEACHER,
  });

  await prisma.teacherSubjectAllocation.create({
    data: {
      schoolId: schoolAId,
      teacherUserId,
      subjectId: academicA.subjectId,
      classroomId: academicA.classroomId,
      termId: academicA.termId,
    },
  });

  const studentEmail = `${marker}-student@example.test`;
  const studentUserId = await createUserWithMembership(prisma, tracked, {
    organizationId: organizationAId,
    schoolId: schoolAId,
    roleId: schoolARoleId,
    email: studentEmail,
    firstName: 'Sprint21C',
    lastName: 'Student',
    userType: UserType.STUDENT,
  });
  const ownedChildStudentId = await createStudentWithEnrollment(prisma, {
    organizationId: organizationAId,
    schoolId: schoolAId,
    userId: studentUserId,
    firstName: 'Owned',
    lastName: 'Child',
    academicYearId: academicA.academicYearId,
    termId: academicA.termId,
    classroomId: academicA.classroomId,
  });

  const nonOwnedChildStudentId = await createStudentWithEnrollment(prisma, {
    organizationId: organizationAId,
    schoolId: schoolAId,
    userId: null,
    firstName: 'NonOwned',
    lastName: 'Child',
    academicYearId: academicA.academicYearId,
    termId: academicA.termId,
    classroomId: academicA.otherClassroomId,
  });

  const crossSchoolStudentId = await createStudentWithEnrollment(prisma, {
    organizationId: organizationBId,
    schoolId: schoolBId,
    userId: null,
    firstName: 'Cross',
    lastName: 'Child',
    academicYearId: academicB.academicYearId,
    termId: academicB.termId,
    classroomId: academicB.classroomId,
  });

  const parentEmail = `${marker}-parent@example.test`;
  const parentUserId = await createUserWithMembership(prisma, tracked, {
    organizationId: organizationAId,
    schoolId: schoolAId,
    roleId: schoolARoleId,
    email: parentEmail,
    firstName: 'Sprint21C',
    lastName: 'Parent',
    userType: UserType.PARENT,
  });
  const guardian = await prisma.guardian.create({
    data: {
      organizationId: organizationAId,
      schoolId: schoolAId,
      userId: parentUserId,
      firstName: 'Sprint21C',
      lastName: 'Guardian',
      phone: `+1555${suffix.slice(0, 6).padEnd(6, '0')}`,
      email: parentEmail,
      relation: 'father',
      isPrimary: true,
    },
    select: { id: true },
  });
  await prisma.studentGuardian.create({
    data: {
      schoolId: schoolAId,
      studentId: ownedChildStudentId,
      guardianId: guardian.id,
      isPrimary: true,
    },
  });

  await createUserWithMembership(prisma, tracked, {
    organizationId: organizationBId,
    schoolId: schoolBId,
    roleId: schoolBRoleId,
    email: `${marker}-school-b-user@example.test`,
    firstName: 'Sprint21C',
    lastName: 'SchoolB',
    userType: UserType.SCHOOL_USER,
  });

  const events = {
    school: await createCalendarEvent(prisma, {
      schoolId: schoolAId,
      academicYearId: academicA.academicYearId,
      termId: academicA.termId,
      title: 'School visible holiday',
      type: AcademicCalendarEventType.HOLIDAY,
      scopeType: AcademicCalendarEventScopeType.SCHOOL,
      startDate: '2026-10-01T00:00:00.000Z',
      endDate: '2026-10-01T23:59:59.000Z',
    }),
    stage: await createCalendarEvent(prisma, {
      schoolId: schoolAId,
      academicYearId: academicA.academicYearId,
      termId: academicA.termId,
      title: 'Stage visible activity',
      type: AcademicCalendarEventType.ACTIVITY,
      scopeType: AcademicCalendarEventScopeType.STAGE,
      scopeId: academicA.stageId,
      startDate: '2026-10-02T00:00:00.000Z',
      endDate: '2026-10-02T23:59:59.000Z',
    }),
    grade: await createCalendarEvent(prisma, {
      schoolId: schoolAId,
      academicYearId: academicA.academicYearId,
      termId: academicA.termId,
      title: 'Grade visible other',
      type: AcademicCalendarEventType.OTHER,
      scopeType: AcademicCalendarEventScopeType.GRADE,
      scopeId: academicA.gradeId,
      startDate: '2026-10-03T00:00:00.000Z',
      endDate: '2026-10-03T23:59:59.000Z',
    }),
    section: await createCalendarEvent(prisma, {
      schoolId: schoolAId,
      academicYearId: academicA.academicYearId,
      termId: academicA.termId,
      title: 'Section visible exam',
      type: AcademicCalendarEventType.EXAM,
      scopeType: AcademicCalendarEventScopeType.SECTION,
      scopeId: academicA.sectionId,
      startDate: '2026-10-04T08:00:00.000Z',
      endDate: '2026-10-04T10:00:00.000Z',
      allDay: false,
    }),
    unrelatedStage: await createCalendarEvent(prisma, {
      schoolId: schoolAId,
      academicYearId: academicA.academicYearId,
      termId: academicA.termId,
      title: 'Unrelated stage event',
      type: AcademicCalendarEventType.ACTIVITY,
      scopeType: AcademicCalendarEventScopeType.STAGE,
      scopeId: academicA.otherStageId,
      startDate: '2026-10-05T00:00:00.000Z',
      endDate: '2026-10-05T23:59:59.000Z',
    }),
    unrelatedGrade: await createCalendarEvent(prisma, {
      schoolId: schoolAId,
      academicYearId: academicA.academicYearId,
      termId: academicA.termId,
      title: 'Unrelated grade event',
      type: AcademicCalendarEventType.OTHER,
      scopeType: AcademicCalendarEventScopeType.GRADE,
      scopeId: academicA.otherGradeId,
      startDate: '2026-10-06T00:00:00.000Z',
      endDate: '2026-10-06T23:59:59.000Z',
    }),
    unrelatedSection: await createCalendarEvent(prisma, {
      schoolId: schoolAId,
      academicYearId: academicA.academicYearId,
      termId: academicA.termId,
      title: 'Unrelated section event',
      type: AcademicCalendarEventType.EXAM,
      scopeType: AcademicCalendarEventScopeType.SECTION,
      scopeId: academicA.otherSectionId,
      startDate: '2026-10-07T08:00:00.000Z',
      endDate: '2026-10-07T10:00:00.000Z',
      allDay: false,
    }),
    crossSchool: await createCalendarEvent(prisma, {
      schoolId: schoolBId,
      academicYearId: academicB.academicYearId,
      termId: academicB.termId,
      title: 'Cross school event',
      type: AcademicCalendarEventType.EXAM,
      scopeType: AcademicCalendarEventScopeType.SCHOOL,
      startDate: '2026-10-08T08:00:00.000Z',
      endDate: '2026-10-08T10:00:00.000Z',
    }),
    otherAcademicSameSection: await createCalendarEvent(prisma, {
      schoolId: schoolAId,
      academicYearId: otherAcademicA.academicYearId,
      termId: otherAcademicA.termId,
      title: 'Same section other academic context',
      type: AcademicCalendarEventType.EXAM,
      scopeType: AcademicCalendarEventScopeType.SECTION,
      scopeId: academicA.sectionId,
      startDate: '2027-10-04T08:00:00.000Z',
      endDate: '2027-10-04T10:00:00.000Z',
      allDay: false,
    }),
    softDeleted: await createCalendarEvent(prisma, {
      schoolId: schoolAId,
      academicYearId: academicA.academicYearId,
      termId: academicA.termId,
      title: 'Soft deleted visible event',
      type: AcademicCalendarEventType.HOLIDAY,
      scopeType: AcademicCalendarEventScopeType.SCHOOL,
      startDate: '2026-10-09T00:00:00.000Z',
      endDate: '2026-10-09T23:59:59.000Z',
      deletedAt: new Date('2026-10-01T00:00:00.000Z'),
    }),
  };

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

  const teacherAuth = await login(app, teacherEmail);
  const studentAuth = await login(app, studentEmail);
  const parentAuth = await login(app, parentEmail);

  return {
    app,
    prisma,
    marker,
    organizationAId,
    organizationBId,
    schoolAId,
    schoolBId,
    teacher: { userId: teacherUserId, email: teacherEmail, auth: teacherAuth },
    student: {
      userId: studentUserId,
      email: studentEmail,
      auth: studentAuth,
      studentId: ownedChildStudentId,
    },
    parent: { userId: parentUserId, email: parentEmail, auth: parentAuth },
    ownedChildStudentId,
    nonOwnedChildStudentId,
    crossSchoolStudentId,
    academicA,
    otherAcademicA,
    academicB,
    events,
    close: async () => {
      try {
        if (app) await app.close();
        await cleanupCalendarFixtureData(prisma, tracked);
      } finally {
        await prisma.$disconnect();
      }
    },
  };
}

export function bearer(tokens: AuthTokens): string {
  return `Bearer ${tokens.accessToken}`;
}

export function listRegisteredRoutes(app: INestApplication<App>): string[] {
  const expressApp = app.getHttpAdapter().getInstance() as {
    _router?: { stack?: ExpressLayer[] };
    router?: { stack?: ExpressLayer[] };
  };
  const stack = expressApp._router?.stack ?? expressApp.router?.stack ?? [];
  const routes: string[] = [];

  collectRoutes(stack, routes);

  return routes.sort();
}

export function extractCalendarItemIds(body: unknown): string[] {
  if (!body || typeof body !== 'object' || !('items' in body)) return [];
  const items = (body as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];

  return items
    .map((item) =>
      item && typeof item === 'object' && 'id' in item
        ? String((item as { id: unknown }).id)
        : '',
    )
    .filter((id) => id.length > 0);
}

export function expectNoHiddenAppCalendarFields(value: unknown): void {
  for (const forbiddenKey of [
    'schoolId',
    'organizationId',
    'scopeKey',
    'createdByUserId',
    'updatedByUserId',
    'deletedByUserId',
    'deletedAt',
    'notes',
    'createdAt',
    'updatedAt',
  ]) {
    expectNoObjectKey(value, forbiddenKey);
  }
}

export function expectNoObjectKey(
  value: unknown,
  forbiddenKey: string,
): void {
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

async function login(
  app: INestApplication<App>,
  email: string,
): Promise<AuthTokens> {
  const response = await request(app.getHttpServer())
    .post(`${GLOBAL_PREFIX}/auth/login`)
    .send({ email, password: APP_CALENDAR_PASSWORD })
    .expect(200);

  return {
    accessToken: response.body.accessToken,
    refreshToken: response.body.refreshToken,
  };
}

async function createOrganization(
  prisma: PrismaClient,
  tracked: TrackedIds,
  params: { slug: string; name: string },
): Promise<string> {
  const organization = await prisma.organization.create({
    data: {
      slug: params.slug,
      name: params.name,
      status: OrganizationStatus.ACTIVE,
    },
    select: { id: true },
  });
  tracked.organizationIds.push(organization.id);
  return organization.id;
}

async function createSchool(
  prisma: PrismaClient,
  tracked: TrackedIds,
  params: { organizationId: string; slug: string; name: string },
): Promise<string> {
  const school = await prisma.school.create({
    data: {
      organizationId: params.organizationId,
      slug: params.slug,
      name: params.name,
      status: SchoolStatus.ACTIVE,
    },
    select: { id: true },
  });
  tracked.schoolIds.push(school.id);
  return school.id;
}

async function createRole(
  prisma: PrismaClient,
  tracked: TrackedIds,
  params: { schoolId: string; key: string; name: string },
): Promise<string> {
  const role = await prisma.role.create({
    data: {
      schoolId: params.schoolId,
      key: params.key,
      name: params.name,
      description: 'Sprint 21C app-facing calendar test role',
      isSystem: false,
    },
    select: { id: true },
  });
  tracked.roleIds.push(role.id);
  return role.id;
}

async function createUserWithMembership(
  prisma: PrismaClient,
  tracked: TrackedIds,
  params: {
    organizationId: string;
    schoolId: string;
    roleId: string;
    email: string;
    firstName: string;
    lastName: string;
    userType: UserType;
  },
): Promise<string> {
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

async function createAcademicStructure(
  prisma: PrismaClient,
  params: {
    marker: string;
    label: string;
    schoolId: string;
    startYear: number;
    active: boolean;
  },
): Promise<AcademicStructureFixture> {
  const academicYear = await prisma.academicYear.create({
    data: {
      schoolId: params.schoolId,
      nameAr: `${params.marker}-${params.label}-year-ar`,
      nameEn: `${params.marker}-${params.label}-year`,
      startDate: new Date(`${params.startYear}-09-01T00:00:00.000Z`),
      endDate: new Date(`${params.startYear + 1}-06-30T00:00:00.000Z`),
      isActive: params.active,
    },
    select: { id: true },
  });
  const term = await prisma.term.create({
    data: {
      schoolId: params.schoolId,
      academicYearId: academicYear.id,
      nameAr: `${params.marker}-${params.label}-term-ar`,
      nameEn: `${params.marker}-${params.label}-term`,
      startDate: new Date(`${params.startYear}-09-01T00:00:00.000Z`),
      endDate: new Date(`${params.startYear}-12-31T00:00:00.000Z`),
      isActive: params.active,
    },
    select: { id: true },
  });

  const main = await createClassroomTree(prisma, {
    marker: params.marker,
    label: `${params.label}-main`,
    schoolId: params.schoolId,
    sortOrder: 1,
  });
  const other = await createClassroomTree(prisma, {
    marker: params.marker,
    label: `${params.label}-other`,
    schoolId: params.schoolId,
    sortOrder: 2,
  });
  const subject = await prisma.subject.create({
    data: {
      schoolId: params.schoolId,
      nameAr: `${params.marker}-${params.label}-subject-ar`,
      nameEn: `${params.marker}-${params.label}-subject`,
      code: `${params.label}-${params.marker}`.slice(0, 40),
      color: '#2563eb',
      isActive: true,
    },
    select: { id: true },
  });

  return {
    academicYearId: academicYear.id,
    termId: term.id,
    stageId: main.stageId,
    gradeId: main.gradeId,
    sectionId: main.sectionId,
    classroomId: main.classroomId,
    otherStageId: other.stageId,
    otherGradeId: other.gradeId,
    otherSectionId: other.sectionId,
    otherClassroomId: other.classroomId,
    subjectId: subject.id,
  };
}

async function createOtherAcademicContext(
  prisma: PrismaClient,
  params: { marker: string; schoolId: string },
): Promise<{ academicYearId: string; termId: string }> {
  const academicYear = await prisma.academicYear.create({
    data: {
      schoolId: params.schoolId,
      nameAr: `${params.marker}-other-context-year-ar`,
      nameEn: `${params.marker}-other-context-year`,
      startDate: new Date('2027-09-01T00:00:00.000Z'),
      endDate: new Date('2028-06-30T00:00:00.000Z'),
      isActive: false,
    },
    select: { id: true },
  });
  const term = await prisma.term.create({
    data: {
      schoolId: params.schoolId,
      academicYearId: academicYear.id,
      nameAr: `${params.marker}-other-context-term-ar`,
      nameEn: `${params.marker}-other-context-term`,
      startDate: new Date('2027-09-01T00:00:00.000Z'),
      endDate: new Date('2027-12-31T00:00:00.000Z'),
      isActive: false,
    },
    select: { id: true },
  });

  return { academicYearId: academicYear.id, termId: term.id };
}

async function createClassroomTree(
  prisma: PrismaClient,
  params: {
    marker: string;
    label: string;
    schoolId: string;
    sortOrder: number;
  },
): Promise<{
  stageId: string;
  gradeId: string;
  sectionId: string;
  classroomId: string;
}> {
  const stage = await prisma.stage.create({
    data: {
      schoolId: params.schoolId,
      nameAr: `${params.marker}-${params.label}-stage-ar`,
      nameEn: `${params.marker}-${params.label}-stage`,
      sortOrder: params.sortOrder,
    },
    select: { id: true },
  });
  const grade = await prisma.grade.create({
    data: {
      schoolId: params.schoolId,
      stageId: stage.id,
      nameAr: `${params.marker}-${params.label}-grade-ar`,
      nameEn: `${params.marker}-${params.label}-grade`,
      sortOrder: params.sortOrder,
    },
    select: { id: true },
  });
  const section = await prisma.section.create({
    data: {
      schoolId: params.schoolId,
      gradeId: grade.id,
      nameAr: `${params.marker}-${params.label}-section-ar`,
      nameEn: `${params.marker}-${params.label}-section`,
      sortOrder: params.sortOrder,
    },
    select: { id: true },
  });
  const classroom = await prisma.classroom.create({
    data: {
      schoolId: params.schoolId,
      sectionId: section.id,
      nameAr: `${params.marker}-${params.label}-classroom-ar`,
      nameEn: `${params.marker}-${params.label}-classroom`,
      sortOrder: params.sortOrder,
    },
    select: { id: true },
  });

  return {
    stageId: stage.id,
    gradeId: grade.id,
    sectionId: section.id,
    classroomId: classroom.id,
  };
}

async function createStudentWithEnrollment(
  prisma: PrismaClient,
  params: {
    organizationId: string;
    schoolId: string;
    userId: string | null;
    firstName: string;
    lastName: string;
    academicYearId: string;
    termId: string;
    classroomId: string;
  },
): Promise<string> {
  const student = await prisma.student.create({
    data: {
      organizationId: params.organizationId,
      schoolId: params.schoolId,
      userId: params.userId,
      firstName: params.firstName,
      lastName: params.lastName,
      status: StudentStatus.ACTIVE,
    },
    select: { id: true },
  });

  await prisma.enrollment.create({
    data: {
      schoolId: params.schoolId,
      studentId: student.id,
      academicYearId: params.academicYearId,
      termId: params.termId,
      classroomId: params.classroomId,
      status: StudentEnrollmentStatus.ACTIVE,
      enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
    },
  });

  return student.id;
}

async function createCalendarEvent(
  prisma: PrismaClient,
  params: {
    schoolId: string;
    academicYearId: string;
    termId: string;
    title: string;
    type: AcademicCalendarEventType;
    scopeType: AcademicCalendarEventScopeType;
    scopeId?: string;
    startDate: string;
    endDate: string;
    allDay?: boolean;
    deletedAt?: Date;
  },
): Promise<string> {
  const scope = resolveCalendarScopeFields(params.scopeType, params.scopeId);
  const event = await prisma.academicCalendarEvent.create({
    data: {
      schoolId: params.schoolId,
      academicYearId: params.academicYearId,
      termId: params.termId,
      title: params.title,
      description: `Description for ${params.title}`,
      notes: `Internal notes for ${params.title}`,
      type: params.type,
      scopeType: params.scopeType,
      scopeKey: scope.scopeKey,
      stageId: scope.stageId,
      gradeId: scope.gradeId,
      sectionId: scope.sectionId,
      allDay: params.allDay ?? true,
      startDate: new Date(params.startDate),
      endDate: new Date(params.endDate),
      deletedAt: params.deletedAt,
    },
    select: { id: true },
  });

  return event.id;
}

function resolveCalendarScopeFields(
  scopeType: AcademicCalendarEventScopeType,
  scopeId?: string,
): {
  scopeKey: string | null;
  stageId: string | null;
  gradeId: string | null;
  sectionId: string | null;
} {
  if (scopeType === AcademicCalendarEventScopeType.SCHOOL) {
    return {
      scopeKey: null,
      stageId: null,
      gradeId: null,
      sectionId: null,
    };
  }

  if (!scopeId) {
    throw new Error(`Missing scope id for ${scopeType}`);
  }

  return {
    scopeKey: scopeId,
    stageId:
      scopeType === AcademicCalendarEventScopeType.STAGE ? scopeId : null,
    gradeId:
      scopeType === AcademicCalendarEventScopeType.GRADE ? scopeId : null,
    sectionId:
      scopeType === AcademicCalendarEventScopeType.SECTION ? scopeId : null,
  };
}

function collectRoutes(layers: ExpressLayer[], routes: string[]): void {
  for (const layer of layers) {
    if (layer.route?.path && layer.route.methods) {
      const paths = Array.isArray(layer.route.path)
        ? layer.route.path
        : [layer.route.path];
      const methods = Object.entries(layer.route.methods)
        .filter(([, enabled]) => enabled)
        .map(([method]) => method.toUpperCase());

      for (const path of paths) {
        for (const method of methods) {
          routes.push(`${method} ${normalizeRoutePath(path)}`);
        }
      }
    }

    if (layer.handle?.stack) {
      collectRoutes(layer.handle.stack, routes);
    }
  }
}

function normalizeRoutePath(path: string): string {
  return `/${path}`.replace(/\/{2,}/g, '/');
}

async function cleanupCalendarFixtureData(
  prisma: PrismaClient,
  tracked: TrackedIds,
): Promise<void> {
  await prisma.session.deleteMany({
    where: { userId: { in: tracked.userIds } },
  });
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { actorId: { in: tracked.userIds } },
        { schoolId: { in: tracked.schoolIds } },
        { organizationId: { in: tracked.organizationIds } },
      ],
    },
  });
  await prisma.academicCalendarEvent.deleteMany({
    where: { schoolId: { in: tracked.schoolIds } },
  });
  await prisma.teacherSubjectAllocation.deleteMany({
    where: { schoolId: { in: tracked.schoolIds } },
  });
  await prisma.enrollment.deleteMany({
    where: { schoolId: { in: tracked.schoolIds } },
  });
  await prisma.studentGuardian.deleteMany({
    where: { schoolId: { in: tracked.schoolIds } },
  });
  await prisma.guardian.deleteMany({
    where: { schoolId: { in: tracked.schoolIds } },
  });
  await prisma.student.deleteMany({
    where: { schoolId: { in: tracked.schoolIds } },
  });
  await prisma.subject.deleteMany({
    where: { schoolId: { in: tracked.schoolIds } },
  });
  await prisma.classroom.deleteMany({
    where: { schoolId: { in: tracked.schoolIds } },
  });
  await prisma.section.deleteMany({
    where: { schoolId: { in: tracked.schoolIds } },
  });
  await prisma.grade.deleteMany({
    where: { schoolId: { in: tracked.schoolIds } },
  });
  await prisma.stage.deleteMany({
    where: { schoolId: { in: tracked.schoolIds } },
  });
  await prisma.term.deleteMany({
    where: { schoolId: { in: tracked.schoolIds } },
  });
  await prisma.academicYear.deleteMany({
    where: { schoolId: { in: tracked.schoolIds } },
  });
  await prisma.membership.deleteMany({
    where: { userId: { in: tracked.userIds } },
  });
  await prisma.rolePermission.deleteMany({
    where: { roleId: { in: tracked.roleIds } },
  });
  await prisma.role.deleteMany({
    where: { id: { in: tracked.roleIds } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: tracked.userIds } },
  });
  await prisma.school.deleteMany({
    where: { id: { in: tracked.schoolIds } },
  });
  await prisma.organization.deleteMany({
    where: { id: { in: tracked.organizationIds } },
  });
}
