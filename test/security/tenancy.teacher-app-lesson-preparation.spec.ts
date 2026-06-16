import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  CurriculumStatus,
  LessonContentItemType,
  LessonPlanItemStatus,
  LessonPlanStatus,
  MembershipStatus,
  OrganizationStatus,
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
const PASSWORD = 'TeacherLessonPrepSecurity123!';
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

type AuthTokens = {
  accessToken: string;
};

type LessonSecurityFixture = {
  allocationId: string;
  lessonPlanItemId: string;
};

jest.setTimeout(120000);

describe('Teacher App lesson preparation tenancy and security', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let organizationId = '';
  let crossOrganizationId = '';
  let schoolId = '';
  let crossSchoolId = '';
  let academicYearId = '';
  let activeTermId = '';
  let closedTermId = '';
  let teacherAId = '';
  let teacherBId = '';
  let teacherAEmail = '';
  let teacherBEmail = '';
  let adminEmail = '';
  let parentEmail = '';
  let studentEmail = '';
  let teacherAuth: AuthTokens;
  let ownFixture: LessonSecurityFixture;
  let otherTeacherFixture: LessonSecurityFixture;
  let crossSchoolFixture: LessonSecurityFixture;
  let closedTermFixture: LessonSecurityFixture;
  let archivedFixture: LessonSecurityFixture;

  const suffix = randomUUID().split('-')[0];
  const marker = `s22g-security-${suffix}`;
  const cleanup = createCleanupState();

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const [teacherRole, schoolAdminRole, parentRole, studentRole] =
      await Promise.all([
        findSystemRole('teacher'),
        findSystemRole('school_admin'),
        findSystemRole('parent'),
        findSystemRole('student'),
      ]);

    organizationId = await createOrganization('main');
    crossOrganizationId = await createOrganization('cross');
    schoolId = await createSchool(organizationId, 'main');
    crossSchoolId = await createSchool(crossOrganizationId, 'cross');
    const academic = await createAcademicContext(schoolId);
    academicYearId = academic.academicYearId;
    activeTermId = academic.termId;
    closedTermId = academic.closedTermId;

    teacherAEmail = `${marker}-teacher-a@example.test`;
    teacherBEmail = `${marker}-teacher-b@example.test`;
    adminEmail = `${marker}-admin@example.test`;
    parentEmail = `${marker}-parent@example.test`;
    studentEmail = `${marker}-student@example.test`;

    teacherAId = await createUserWithMembership({
      email: teacherAEmail,
      firstName: 'Teacher',
      lastName: 'A',
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
      organizationId,
      schoolId,
    });
    teacherBId = await createUserWithMembership({
      email: teacherBEmail,
      firstName: 'Teacher',
      lastName: 'B',
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
      organizationId,
      schoolId,
    });
    await createUserWithMembership({
      email: adminEmail,
      firstName: 'School',
      lastName: 'Admin',
      userType: UserType.SCHOOL_USER,
      roleId: schoolAdminRole.id,
      organizationId,
      schoolId,
    });
    await createUserWithMembership({
      email: parentEmail,
      firstName: 'Parent',
      lastName: 'User',
      userType: UserType.PARENT,
      roleId: parentRole.id,
      organizationId,
      schoolId,
    });
    await createUserWithMembership({
      email: studentEmail,
      firstName: 'Student',
      lastName: 'User',
      userType: UserType.STUDENT,
      roleId: studentRole.id,
      organizationId,
      schoolId,
    });

    ownFixture = await createLessonFixture({
      organizationId,
      schoolId,
      academicYearId,
      termId: activeTermId,
      teacherUserId: teacherAId,
      marker: 'own',
      includeDeletedContent: true,
    });
    otherTeacherFixture = await createLessonFixture({
      organizationId,
      schoolId,
      academicYearId,
      termId: activeTermId,
      teacherUserId: teacherBId,
      marker: 'other',
    });
    closedTermFixture = await createLessonFixture({
      organizationId,
      schoolId,
      academicYearId,
      termId: closedTermId,
      teacherUserId: teacherAId,
      marker: 'closed',
    });
    archivedFixture = await createLessonFixture({
      organizationId,
      schoolId,
      academicYearId,
      termId: activeTermId,
      teacherUserId: teacherAId,
      marker: 'archived',
      lessonPlanStatus: LessonPlanStatus.ARCHIVED,
    });

    const crossAcademic = await createAcademicContext(crossSchoolId);
    const crossTeacherId = await createUserWithMembership({
      email: `${marker}-cross-teacher@example.test`,
      firstName: 'Cross',
      lastName: 'Teacher',
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
      organizationId: crossOrganizationId,
      schoolId: crossSchoolId,
    });
    crossSchoolFixture = await createLessonFixture({
      organizationId: crossOrganizationId,
      schoolId: crossSchoolId,
      academicYearId: crossAcademic.academicYearId,
      termId: crossAcademic.termId,
      teacherUserId: crossTeacherId,
      marker: 'cross',
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
      }),
    );
    await app.init();

    teacherAuth = await login(teacherAEmail);
  });

  afterAll(async () => {
    try {
      if (app) await app.close();
      await cleanupData();
    } finally {
      if (prisma) await prisma.$disconnect();
    }
  });

  it('denies non-teacher actors from Teacher App lesson-preparation routes', async () => {
    for (const email of [adminEmail, parentEmail, studentEmail]) {
      const actor = await login(email);

      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/teacher/lesson-preparation/today`)
        .query({ date: '2026-09-14' })
        .set('Authorization', bearer(actor))
        .expect(403)
        .expect((response) => {
          expect(response.body.error.code).toBe(
            'teacher_app.actor.required_teacher',
          );
        });

      await request(app.getHttpServer())
        .patch(
          `${GLOBAL_PREFIX}/teacher/lesson-preparation/${ownFixture.lessonPlanItemId}/status`,
        )
        .set('Authorization', bearer(actor))
        .send({ status: 'in_progress' })
        .expect(403);
    }
  });

  it('does not let a teacher read or update another teacher item', async () => {
    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/lesson-preparation/${otherTeacherFixture.lessonPlanItemId}`,
      )
      .set('Authorization', bearer(teacherAuth))
      .expect(404)
      .expect((response) => {
        expect(response.body.error.code).toBe(
          'teacher_app.lesson_preparation.not_found',
        );
      });

    await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/teacher/lesson-preparation/${otherTeacherFixture.lessonPlanItemId}/status`,
      )
      .set('Authorization', bearer(teacherAuth))
      .send({ status: 'in_progress' })
      .expect(404);
  });

  it('hides cross-school lesson-plan items and curriculum content', async () => {
    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/lesson-preparation/${crossSchoolFixture.lessonPlanItemId}`,
      )
      .set('Authorization', bearer(teacherAuth))
      .expect(404);

    const today = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/teacher/lesson-preparation/today`)
      .query({ date: '2026-09-14' })
      .set('Authorization', bearer(teacherAuth))
      .expect(200);

    const json = JSON.stringify(today.body);
    expect(json).toContain(ownFixture.lessonPlanItemId);
    expect(json).not.toContain(crossSchoolFixture.lessonPlanItemId);
    expect(json).not.toContain(otherTeacherFixture.lessonPlanItemId);
    expect(json).not.toContain(`${marker}-cross`);
  });

  it('does not leak tenant, membership, email, soft-delete, or raw file internals', async () => {
    const detail = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/lesson-preparation/${ownFixture.lessonPlanItemId}`,
      )
      .set('Authorization', bearer(teacherAuth))
      .expect(200);

    expect(JSON.stringify(detail.body)).not.toContain(`${marker}-own-deleted`);
    for (const key of [
      'schoolId',
      'organizationId',
      'membershipId',
      'roleId',
      'email',
      'passwordHash',
      'deletedAt',
      'objectKey',
      'bucket',
    ]) {
      expectNoObjectKey(detail.body, key);
    }
  });

  it('denies closed-term mutations and archived/read-only plan access', async () => {
    await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/teacher/lesson-preparation/${closedTermFixture.lessonPlanItemId}/status`,
      )
      .set('Authorization', bearer(teacherAuth))
      .send({ status: 'in_progress' })
      .expect(409)
      .expect((response) => {
        expect(response.body.error.code).toBe(
          'teacher_app.lesson_preparation.closed_term',
        );
      });

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/teacher/lesson-preparation/${archivedFixture.lessonPlanItemId}`,
      )
      .set('Authorization', bearer(teacherAuth))
      .expect(404);

    await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/teacher/lesson-preparation/${archivedFixture.lessonPlanItemId}/status`,
      )
      .set('Authorization', bearer(teacherAuth))
      .send({ status: 'in_progress' })
      .expect(409)
      .expect((response) => {
        expect(response.body.error.code).toBe(
          'teacher_app.lesson_preparation.read_only',
        );
      });
  });

  async function findSystemRole(key: string): Promise<{ id: string }> {
    const role = await prisma.role.findFirst({
      where: { key, schoolId: null, isSystem: true },
      select: { id: true },
    });
    if (!role) throw new Error(`${key} system role not found - run seed.`);
    return role;
  }

  async function createOrganization(label: string): Promise<string> {
    const organization = await prisma.organization.create({
      data: {
        slug: `${marker}-${label}-org`,
        name: `${marker} ${label} Org`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    cleanup.organizationIds.add(organization.id);
    return organization.id;
  }

  async function createSchool(
    organizationIdForSchool: string,
    label: string,
  ): Promise<string> {
    const school = await prisma.school.create({
      data: {
        organizationId: organizationIdForSchool,
        slug: `${marker}-${label}-school`,
        name: `${marker} ${label} School`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    cleanup.schoolIds.add(school.id);
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
    cleanup.userIds.add(user.id);

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

  async function createAcademicContext(
    schoolIdForContext: string,
  ): Promise<{ academicYearId: string; termId: string; closedTermId: string }> {
    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId: schoolIdForContext,
        nameAr: `${marker}-${schoolIdForContext}-year-ar`,
        nameEn: `${marker}-${schoolIdForContext}-year`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-06-30T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    cleanup.academicYearIds.add(academicYear.id);

    const term = await prisma.term.create({
      data: {
        schoolId: schoolIdForContext,
        academicYearId: academicYear.id,
        nameAr: `${marker}-${schoolIdForContext}-term-ar`,
        nameEn: `${marker}-${schoolIdForContext}-term`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    cleanup.termIds.add(term.id);

    const closedTerm = await prisma.term.create({
      data: {
        schoolId: schoolIdForContext,
        academicYearId: academicYear.id,
        nameAr: `${marker}-${schoolIdForContext}-closed-term-ar`,
        nameEn: `${marker}-${schoolIdForContext}-closed-term`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        isActive: false,
      },
      select: { id: true },
    });
    cleanup.termIds.add(closedTerm.id);

    return {
      academicYearId: academicYear.id,
      termId: term.id,
      closedTermId: closedTerm.id,
    };
  }

  async function createLessonFixture(params: {
    organizationId: string;
    schoolId: string;
    academicYearId: string;
    termId: string;
    teacherUserId: string;
    marker: string;
    lessonPlanStatus?: LessonPlanStatus;
    includeDeletedContent?: boolean;
  }): Promise<LessonSecurityFixture> {
    const stage = await prisma.stage.create({
      data: {
        schoolId: params.schoolId,
        nameAr: `${marker}-${params.marker}-stage-ar`,
        nameEn: `${marker}-${params.marker}-stage`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    cleanup.stageIds.add(stage.id);

    const grade = await prisma.grade.create({
      data: {
        schoolId: params.schoolId,
        stageId: stage.id,
        nameAr: `${marker}-${params.marker}-grade-ar`,
        nameEn: `${marker}-${params.marker}-grade`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    cleanup.gradeIds.add(grade.id);

    const section = await prisma.section.create({
      data: {
        schoolId: params.schoolId,
        gradeId: grade.id,
        nameAr: `${marker}-${params.marker}-section-ar`,
        nameEn: `${marker}-${params.marker}-section`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    cleanup.sectionIds.add(section.id);

    const classroom = await prisma.classroom.create({
      data: {
        schoolId: params.schoolId,
        sectionId: section.id,
        nameAr: `${marker}-${params.marker}-classroom-ar`,
        nameEn: `${marker}-${params.marker}-classroom`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    cleanup.classroomIds.add(classroom.id);

    const subject = await prisma.subject.create({
      data: {
        schoolId: params.schoolId,
        nameAr: `${marker}-${params.marker}-subject-ar`,
        nameEn: `${marker}-${params.marker}-subject`,
        code: `${suffix}-sec-${params.marker}`.toUpperCase(),
        isActive: true,
      },
      select: { id: true },
    });
    cleanup.subjectIds.add(subject.id);

    const allocation = await prisma.teacherSubjectAllocation.create({
      data: {
        schoolId: params.schoolId,
        teacherUserId: params.teacherUserId,
        subjectId: subject.id,
        classroomId: classroom.id,
        termId: params.termId,
      },
      select: { id: true },
    });
    cleanup.allocationIds.add(allocation.id);

    const curriculum = await prisma.curriculum.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.academicYearId,
        termId: params.termId,
        gradeId: grade.id,
        subjectId: subject.id,
        title: `${marker}-${params.marker}-curriculum`,
        status: CurriculumStatus.ACTIVE,
        createdByUserId: params.teacherUserId,
      },
      select: { id: true },
    });
    cleanup.curriculumIds.add(curriculum.id);

    const unit = await prisma.curriculumUnit.create({
      data: {
        schoolId: params.schoolId,
        curriculumId: curriculum.id,
        title: `${marker}-${params.marker}-unit`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    cleanup.curriculumUnitIds.add(unit.id);

    const lesson = await prisma.curriculumLesson.create({
      data: {
        schoolId: params.schoolId,
        curriculumId: curriculum.id,
        unitId: unit.id,
        title: `${marker}-${params.marker}-lesson`,
        objectives: ['objective'],
        sortOrder: 1,
      },
      select: { id: true },
    });
    cleanup.curriculumLessonIds.add(lesson.id);

    await prisma.lessonContentItem.create({
      data: {
        schoolId: params.schoolId,
        curriculumId: curriculum.id,
        unitId: unit.id,
        lessonId: lesson.id,
        type: LessonContentItemType.TEXT,
        title: `${marker}-${params.marker}-visible`,
        bodyText: 'Visible content',
        sortOrder: 1,
        createdByUserId: params.teacherUserId,
      },
    });

    const file = await prisma.file.create({
      data: {
        organizationId: params.organizationId,
        schoolId: params.schoolId,
        uploaderId: params.teacherUserId,
        bucket: `${marker}-${params.marker}-bucket`,
        objectKey: `${marker}-${params.marker}-object-key`,
        originalName: `${marker}-${params.marker}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: BigInt(512),
      },
      select: { id: true },
    });
    cleanup.fileIds.add(file.id);

    await prisma.lessonContentItem.create({
      data: {
        schoolId: params.schoolId,
        curriculumId: curriculum.id,
        unitId: unit.id,
        lessonId: lesson.id,
        type: LessonContentItemType.FILE,
        title: `${marker}-${params.marker}-file`,
        fileId: file.id,
        sortOrder: 2,
        createdByUserId: params.teacherUserId,
      },
    });

    if (params.includeDeletedContent) {
      await prisma.lessonContentItem.create({
        data: {
          schoolId: params.schoolId,
          curriculumId: curriculum.id,
          unitId: unit.id,
          lessonId: lesson.id,
          type: LessonContentItemType.TEXT,
          title: `${marker}-${params.marker}-deleted`,
          bodyText: 'Deleted content',
          sortOrder: 3,
          createdByUserId: params.teacherUserId,
          deletedAt: new Date(),
        },
      });
    }

    const lessonPlan = await prisma.lessonPlan.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.academicYearId,
        termId: params.termId,
        teacherSubjectAllocationId: allocation.id,
        teacherUserId: params.teacherUserId,
        classroomId: classroom.id,
        subjectId: subject.id,
        curriculumId: curriculum.id,
        title: `${marker}-${params.marker}-plan`,
        status: params.lessonPlanStatus ?? LessonPlanStatus.ACTIVE,
        weekStartDate: new Date('2026-09-13T00:00:00.000Z'),
        weekEndDate: new Date('2026-09-19T00:00:00.000Z'),
        createdByUserId: params.teacherUserId,
      },
      select: { id: true },
    });
    cleanup.lessonPlanIds.add(lessonPlan.id);

    const item = await prisma.lessonPlanItem.create({
      data: {
        schoolId: params.schoolId,
        lessonPlanId: lessonPlan.id,
        curriculumId: curriculum.id,
        unitId: unit.id,
        lessonId: lesson.id,
        plannedDate: new Date('2026-09-14T00:00:00.000Z'),
        dayOfWeek: 1,
        title: `${marker}-${params.marker}-item`,
        status: LessonPlanItemStatus.PLANNED,
        sortOrder: 1,
        createdByUserId: params.teacherUserId,
      },
      select: { id: true },
    });
    cleanup.lessonPlanItemIds.add(item.id);

    return {
      allocationId: allocation.id,
      lessonPlanItemId: item.id,
    };
  }

  async function login(email: string): Promise<AuthTokens> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password: PASSWORD })
      .expect(200);

    return { accessToken: response.body.accessToken };
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
    await prisma.session.deleteMany({
      where: { userId: { in: [...cleanup.userIds] } },
    });
    await prisma.lessonPlanItem.deleteMany({
      where: { id: { in: [...cleanup.lessonPlanItemIds] } },
    });
    await prisma.lessonPlan.deleteMany({
      where: { id: { in: [...cleanup.lessonPlanIds] } },
    });
    await prisma.lessonContentItem.deleteMany({
      where: { schoolId: { in: [...cleanup.schoolIds] } },
    });
    await prisma.curriculumLesson.deleteMany({
      where: { id: { in: [...cleanup.curriculumLessonIds] } },
    });
    await prisma.curriculumUnit.deleteMany({
      where: { id: { in: [...cleanup.curriculumUnitIds] } },
    });
    await prisma.curriculum.deleteMany({
      where: { id: { in: [...cleanup.curriculumIds] } },
    });
    await prisma.file.deleteMany({
      where: { id: { in: [...cleanup.fileIds] } },
    });
    await prisma.teacherSubjectAllocation.deleteMany({
      where: { id: { in: [...cleanup.allocationIds] } },
    });
    await prisma.subject.deleteMany({
      where: { id: { in: [...cleanup.subjectIds] } },
    });
    await prisma.classroom.deleteMany({
      where: { id: { in: [...cleanup.classroomIds] } },
    });
    await prisma.section.deleteMany({
      where: { id: { in: [...cleanup.sectionIds] } },
    });
    await prisma.grade.deleteMany({
      where: { id: { in: [...cleanup.gradeIds] } },
    });
    await prisma.stage.deleteMany({
      where: { id: { in: [...cleanup.stageIds] } },
    });
    await prisma.term.deleteMany({
      where: { id: { in: [...cleanup.termIds] } },
    });
    await prisma.academicYear.deleteMany({
      where: { id: { in: [...cleanup.academicYearIds] } },
    });
    await prisma.membership.deleteMany({
      where: { userId: { in: [...cleanup.userIds] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [...cleanup.userIds] } },
    });
    await prisma.school.deleteMany({
      where: { id: { in: [...cleanup.schoolIds] } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [...cleanup.organizationIds] } },
    });
  }
});

function createCleanupState() {
  return {
    organizationIds: new Set<string>(),
    schoolIds: new Set<string>(),
    userIds: new Set<string>(),
    academicYearIds: new Set<string>(),
    termIds: new Set<string>(),
    stageIds: new Set<string>(),
    gradeIds: new Set<string>(),
    sectionIds: new Set<string>(),
    classroomIds: new Set<string>(),
    subjectIds: new Set<string>(),
    allocationIds: new Set<string>(),
    curriculumIds: new Set<string>(),
    curriculumUnitIds: new Set<string>(),
    curriculumLessonIds: new Set<string>(),
    lessonPlanIds: new Set<string>(),
    lessonPlanItemIds: new Set<string>(),
    fileIds: new Set<string>(),
  };
}
