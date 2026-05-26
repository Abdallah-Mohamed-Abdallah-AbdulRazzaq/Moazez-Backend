import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  CurriculumStatus,
  FileVisibility,
  LessonContentItemType,
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
const PASSWORD = 'Sprint15CSecurity123!';
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
  subjectId: string;
};

type CurriculumTree = {
  curriculumId: string;
  unitId: string;
  lessonId: string;
  contentItemId: string;
};

jest.setTimeout(180000);

describe('Academics lesson content tenancy isolation (security)', () => {
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
  let treeA: CurriculumTree;
  let treeB: CurriculumTree;
  let fileAId = '';
  let fileBId = '';
  let viewerRoleId = '';
  let adminAAuth: AuthTokens;
  let adminBAuth: AuthTokens;
  let viewerAuth: AuthTokens;

  const suffix = randomUUID().split('-')[0];
  const marker = `s15c-sec-${suffix}`;
  const createdOrganizationIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];
  const createdFileIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const [schoolAdminRole, curriculumViewPermission] = await Promise.all([
      findSystemRole('school_admin'),
      prisma.permission.findUnique({
        where: { code: 'academics.curriculum.view' },
        select: { id: true },
      }),
    ]);
    if (!curriculumViewPermission) {
      throw new Error('Missing academics.curriculum.view permission.');
    }

    organizationAId = await createOrganization('a');
    organizationBId = await createOrganization('b');
    schoolAId = await createSchool(organizationAId, 'a');
    schoolBId = await createSchool(organizationBId, 'b');
    academicA = await createAcademicBase(schoolAId, 'a');
    academicB = await createAcademicBase(schoolBId, 'b');

    viewerRoleId = await createViewerRole(curriculumViewPermission.id);

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

    fileAId = await createFile(schoolAId, organizationAId, adminAUserId, 'a');
    fileBId = await createFile(schoolBId, organizationBId, adminBUserId, 'b');

    treeA = await createCurriculumTree({
      schoolId: schoolAId,
      academic: academicA,
      createdByUserId: adminAUserId,
      label: 'a',
    });
    treeB = await createCurriculumTree({
      schoolId: schoolBId,
      academic: academicB,
      createdByUserId: adminBUserId,
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

  it('prevents school A from reading school B lesson content', async () => {
    await request(app.getHttpServer())
      .get(contentListUrl(treeB))
      .set('Authorization', bearer(adminAAuth))
      .expect(404)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.lesson_content.not_found',
        );
        expectNoObjectKey(response.body, 'schoolId');
        expectNoObjectKey(response.body, 'organizationId');
      });

    await request(app.getHttpServer())
      .get(contentDetailUrl(treeB))
      .set('Authorization', bearer(adminAAuth))
      .expect(404)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.lesson_content.not_found',
        );
        expectNoObjectKey(response.body, 'schoolId');
        expectNoObjectKey(response.body, 'organizationId');
      });

    await request(app.getHttpServer())
      .get(contentDetailUrl(treeB))
      .set('Authorization', bearer(adminBAuth))
      .expect(200)
      .expect((response) => {
        expect(response.body.contentItemId).toBe(treeB.contentItemId);
        expectNoObjectKey(response.body, 'schoolId');
        expectNoObjectKey(response.body, 'organizationId');
      });
  });

  it('prevents school A from mutating school B lesson content', async () => {
    await request(app.getHttpServer())
      .post(contentListUrl(treeB))
      .set('Authorization', bearer(adminAAuth))
      .send({
        type: LessonContentItemType.TEXT,
        title: 'Cross School Create',
        bodyText: 'Nope',
      })
      .expect(404);

    await request(app.getHttpServer())
      .patch(contentDetailUrl(treeB))
      .set('Authorization', bearer(adminAAuth))
      .send({ title: 'Cross School Update' })
      .expect(404);

    await request(app.getHttpServer())
      .delete(contentDetailUrl(treeB))
      .set('Authorization', bearer(adminAAuth))
      .expect(404);
  });

  it('prevents school A from attaching a school B file to lesson content', async () => {
    await request(app.getHttpServer())
      .post(contentListUrl(treeA))
      .set('Authorization', bearer(adminAAuth))
      .send({
        type: LessonContentItemType.FILE,
        title: 'Wrong School File',
        fileId: fileBId,
      })
      .expect(404)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.lesson_content.file_not_found',
        );
        expectNoObjectKey(response.body, 'schoolId');
        expectNoObjectKey(response.body, 'organizationId');
      });

    await request(app.getHttpServer())
      .post(contentListUrl(treeA))
      .set('Authorization', bearer(adminAAuth))
      .send({
        type: LessonContentItemType.FILE,
        title: 'Same School File',
        fileId: fileAId,
      })
      .expect(201)
      .expect((response) => {
        expect(response.body.file).toMatchObject({
          fileId: fileAId,
          filename: `${marker}-a-file.txt`,
        });
        expectNoObjectKey(response.body, 'schoolId');
        expectNoObjectKey(response.body, 'organizationId');
      });
  });

  it('allows same-school view-only reads but blocks mutations', async () => {
    await request(app.getHttpServer())
      .get(contentListUrl(treeA))
      .set('Authorization', bearer(viewerAuth))
      .expect(200)
      .expect((response) => {
        expect(
          response.body.items.map(
            (item: { contentItemId: string }) => item.contentItemId,
          ),
        ).toContain(treeA.contentItemId);
        expectNoObjectKey(response.body, 'schoolId');
        expectNoObjectKey(response.body, 'organizationId');
      });

    await request(app.getHttpServer())
      .post(contentListUrl(treeA))
      .set('Authorization', bearer(viewerAuth))
      .send({
        type: LessonContentItemType.TEXT,
        title: 'Viewer Cannot Create',
        bodyText: 'Nope',
      })
      .expect(403)
      .expect((response) => {
        expect(response.body?.error?.code).toBe('auth.scope.missing');
      });

    await request(app.getHttpServer())
      .patch(contentDetailUrl(treeA))
      .set('Authorization', bearer(viewerAuth))
      .send({ title: 'Viewer Cannot Update' })
      .expect(403);

    await request(app.getHttpServer())
      .delete(contentDetailUrl(treeA))
      .set('Authorization', bearer(viewerAuth))
      .expect(403);
  });

  function contentListUrl(tree: CurriculumTree): string {
    return `${GLOBAL_PREFIX}/academics/curriculum/${tree.curriculumId}/units/${tree.unitId}/lessons/${tree.lessonId}/content`;
  }

  function contentDetailUrl(tree: CurriculumTree): string {
    return `${contentListUrl(tree)}/${tree.contentItemId}`;
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
        name: `Sprint 15C Security Org ${label} ${suffix}`,
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
        name: `Sprint 15C Security School ${label} ${suffix}`,
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
        name: `Sprint 15C Lesson Content Viewer ${suffix}`,
        description: 'View-only role for lesson content tenancy tests',
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
    const subject = await prisma.subject.create({
      data: {
        schoolId: inputSchoolId,
        nameAr: `${marker}-${label}-subject-ar`,
        nameEn: `${marker}-${label}-subject`,
        code: `S15CSEC-${label.toUpperCase()}-${suffix}`,
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
      subjectId: subject.id,
    };
  }

  async function createFile(
    inputSchoolId: string,
    inputOrganizationId: string,
    uploaderId: string,
    label: string,
  ): Promise<string> {
    const file = await prisma.file.create({
      data: {
        organizationId: inputOrganizationId,
        schoolId: inputSchoolId,
        uploaderId,
        bucket: 'test-bucket',
        objectKey: `${marker}/${label}/file.txt`,
        originalName: `${marker}-${label}-file.txt`,
        mimeType: 'text/plain',
        sizeBytes: BigInt(12),
        visibility: FileVisibility.PRIVATE,
      },
      select: { id: true },
    });
    createdFileIds.push(file.id);
    return file.id;
  }

  async function createCurriculumTree(params: {
    schoolId: string;
    academic: AcademicBase;
    createdByUserId: string;
    label: string;
  }): Promise<CurriculumTree> {
    const curriculum = await prisma.curriculum.create({
      data: {
        schoolId: params.schoolId,
        academicYearId: params.academic.academicYearId,
        termId: params.academic.termId,
        gradeId: params.academic.gradeId,
        subjectId: params.academic.subjectId,
        title: `${marker}-${params.label}-curriculum`,
        status: CurriculumStatus.DRAFT,
        createdByUserId: params.createdByUserId,
        updatedByUserId: params.createdByUserId,
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
    const content = await prisma.lessonContentItem.create({
      data: {
        schoolId: params.schoolId,
        curriculumId: curriculum.id,
        unitId: unit.id,
        lessonId: lesson.id,
        type: LessonContentItemType.TEXT,
        title: `${marker}-${params.label}-content`,
        bodyText: 'Seeded content',
        sortOrder: 0,
        createdByUserId: params.createdByUserId,
        updatedByUserId: params.createdByUserId,
      },
      select: { id: true },
    });

    return {
      curriculumId: curriculum.id,
      unitId: unit.id,
      lessonId: lesson.id,
      contentItemId: content.id,
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
    await prisma.lessonContentItem.deleteMany({
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
    await prisma.file.deleteMany({
      where: { id: { in: createdFileIds } },
    });
    await prisma.subject.deleteMany({
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
