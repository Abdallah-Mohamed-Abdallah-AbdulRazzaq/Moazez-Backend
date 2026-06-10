import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ApplicantAdmissionRequestStatus,
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
const PASSWORD = 'Applicant18FPass!';
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(45000);

type AuthTokens = {
  accessToken: string;
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

type SideEffectSnapshot = {
  memberships: number;
  applications: number;
  applicationDocuments: number;
  files: number;
  students: number;
  guardians: number;
  studentGuardianLinks: number;
  enrollments: number;
};

describe('Applicant Portal request ownership (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let organizationId = '';
  let activeSchoolId = '';
  let otherActiveSchoolId = '';
  let suspendedSchoolId = '';
  let archivedSchoolId = '';
  let deletedSchoolId = '';
  let suspendedOrganizationSchoolId = '';
  let archivedOrganizationSchoolId = '';
  let deletedOrganizationSchoolId = '';
  let academicYearId = '';
  let gradeId = '';
  let applicantUserId = '';
  let applicantProfileId = '';
  let applicantRequestId = '';
  let otherApplicantRequestId = '';
  let roleId = '';

  let applicantAuth: AuthTokens;
  let otherApplicantAuth: AuthTokens;
  let parentAuth: AuthTokens;
  let studentAuth: AuthTokens;
  let teacherAuth: AuthTokens;
  let schoolUserAuth: AuthTokens;
  let platformAuth: AuthTokens;

  const suffix = randomUUID().split('-')[0];
  const marker = `s18f-requests-${suffix}`;
  const createdOrganizationIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdSchoolProfileIds: string[] = [];
  const createdAcademicYearIds: string[] = [];
  const createdStageIds: string[] = [];
  const createdGradeIds: string[] = [];
  const createdDocumentIds: string[] = [];
  const createdRequestIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdProfileIds: string[] = [];
  const createdRoleIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const activeOrganization = await createOrganization({
      slug: `${marker}-active-org`,
      name: `Sprint 18F Active Org ${suffix}`,
      status: OrganizationStatus.ACTIVE,
    });
    organizationId = activeOrganization.id;
    const suspendedOrganization = await createOrganization({
      slug: `${marker}-suspended-org`,
      name: `Sprint 18F Suspended Org ${suffix}`,
      status: OrganizationStatus.SUSPENDED,
    });
    const archivedOrganization = await createOrganization({
      slug: `${marker}-archived-org`,
      name: `Sprint 18F Archived Org ${suffix}`,
      status: OrganizationStatus.ARCHIVED,
    });
    const deletedOrganization = await createOrganization({
      slug: `${marker}-deleted-org`,
      name: `Sprint 18F Deleted Org ${suffix}`,
      status: OrganizationStatus.ACTIVE,
      deletedAt: new Date(),
    });

    activeSchoolId = await createSchoolWithProfile({
      organizationId,
      slug: `${marker}-active`,
      name: `${marker} Active Academy`,
      status: SchoolStatus.ACTIVE,
      schoolName: `${marker} Active Public`,
      shortName: `${marker} Active`,
      city: 'Cairo',
      country: 'Egypt',
    });
    otherActiveSchoolId = await createSchoolWithProfile({
      organizationId,
      slug: `${marker}-other-active`,
      name: `${marker} Other Active Academy`,
      status: SchoolStatus.ACTIVE,
      schoolName: `${marker} Other Active Public`,
      city: 'Giza',
      country: 'Egypt',
    });
    suspendedSchoolId = await createSchoolWithProfile({
      organizationId,
      slug: `${marker}-suspended`,
      name: `${marker} Suspended Academy`,
      status: SchoolStatus.SUSPENDED,
      schoolName: `${marker} Suspended Public`,
      city: 'Cairo',
    });
    archivedSchoolId = await createSchoolWithProfile({
      organizationId,
      slug: `${marker}-archived`,
      name: `${marker} Archived Academy`,
      status: SchoolStatus.ARCHIVED,
      schoolName: `${marker} Archived Public`,
      city: 'Cairo',
    });
    deletedSchoolId = await createSchoolWithProfile({
      organizationId,
      slug: `${marker}-deleted`,
      name: `${marker} Deleted Academy`,
      status: SchoolStatus.ACTIVE,
      schoolName: `${marker} Deleted Public`,
      city: 'Cairo',
      deletedAt: new Date(),
    });
    suspendedOrganizationSchoolId = await createSchoolWithProfile({
      organizationId: suspendedOrganization.id,
      slug: `${marker}-suspended-org-school`,
      name: `${marker} Suspended Org Academy`,
      status: SchoolStatus.ACTIVE,
      schoolName: `${marker} Suspended Org Public`,
      city: 'Cairo',
    });
    archivedOrganizationSchoolId = await createSchoolWithProfile({
      organizationId: archivedOrganization.id,
      slug: `${marker}-archived-org-school`,
      name: `${marker} Archived Org Academy`,
      status: SchoolStatus.ACTIVE,
      schoolName: `${marker} Archived Org Public`,
      city: 'Cairo',
    });
    deletedOrganizationSchoolId = await createSchoolWithProfile({
      organizationId: deletedOrganization.id,
      slug: `${marker}-deleted-org-school`,
      name: `${marker} Deleted Org Academy`,
      status: SchoolStatus.ACTIVE,
      schoolName: `${marker} Deleted Org Public`,
      city: 'Cairo',
    });

    academicYearId = await createAcademicYear(activeSchoolId);
    const stageId = await createStage(activeSchoolId);
    gradeId = await createGrade(activeSchoolId, stageId);

    await createRequiredDocument({
      schoolId: activeSchoolId,
      organizationId,
      title: 'Birth certificate',
      isMandatory: true,
      sortOrder: 10,
    });
    await createRequiredDocument({
      schoolId: activeSchoolId,
      organizationId,
      title: 'Parent ID',
      isMandatory: true,
      sortOrder: 20,
    });
    await createRequiredDocument({
      schoolId: activeSchoolId,
      organizationId,
      title: 'Optional family photo',
      isMandatory: false,
      sortOrder: 30,
    });
    await createRequiredDocument({
      schoolId: activeSchoolId,
      organizationId,
      title: `${marker} Inactive Mandatory`,
      isMandatory: true,
      isActive: false,
    });
    await createRequiredDocument({
      schoolId: activeSchoolId,
      organizationId,
      title: `${marker} Deleted Mandatory`,
      isMandatory: true,
      deletedAt: new Date(),
    });

    roleId = (
      await prisma.role.create({
        data: {
          schoolId: activeSchoolId,
          key: `${marker}-role`,
          name: `Sprint 18F Role ${suffix}`,
          isSystem: false,
        },
        select: { id: true },
      })
    ).id;
    createdRoleIds.push(roleId);

    await createUserWithMembership(UserType.PARENT, 'parent');
    await createUserWithMembership(UserType.STUDENT, 'student');
    await createUserWithMembership(UserType.TEACHER, 'teacher');
    await createUserWithMembership(UserType.SCHOOL_USER, 'school-user');
    await createMembershiplessUser(UserType.PLATFORM_USER, 'platform');

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

    const applicant = await createApplicantAccount('primary');
    applicantUserId = applicant.userId;
    applicantProfileId = applicant.applicantId;
    const otherApplicant = await createApplicantAccount('other');

    applicantAuth = await login(`${marker}-primary@example.test`);
    otherApplicantAuth = await login(`${marker}-other@example.test`);
    parentAuth = await login(`${marker}-parent@example.test`);
    studentAuth = await login(`${marker}-student@example.test`);
    teacherAuth = await login(`${marker}-teacher@example.test`);
    schoolUserAuth = await login(`${marker}-school-user@example.test`);
    platformAuth = await login(`${marker}-platform@example.test`);

    expect(otherApplicant.userId).toBeDefined();
  });

  afterAll(async () => {
    try {
      if (app) await app.close();
      await cleanupData();
    } finally {
      if (prisma) await prisma.$disconnect();
    }
  });

  it('registers request and document routes while keeping deferred document actions absent', async () => {
    const routes = listRegisteredRoutes();

    expect(routes).toContain('POST /api/v1/applicant-portal/requests');
    expect(routes).toContain('GET /api/v1/applicant-portal/requests');
    expect(routes).toContain(
      'GET /api/v1/applicant-portal/requests/:requestId',
    );
    expect(routes).toContain(
      'POST /api/v1/applicant-portal/requests/:requestId/submit',
    );

    for (const documentRoute of [
      'POST /api/v1/applicant-portal/requests/:requestId/documents',
      'GET /api/v1/applicant-portal/requests/:requestId/documents',
      'GET /api/v1/applicant-portal/requests/:requestId/documents/:documentId',
    ]) {
      expect(routes).toContain(documentRoute);
    }

    for (const absentRoute of [
      'PATCH /api/v1/applicant-portal/requests/:requestId',
      'GET /api/v1/applicant-portal/requests/:requestId/documents/:documentId/download',
      'DELETE /api/v1/applicant-portal/requests/:requestId/documents/:documentId',
      'PATCH /api/v1/applicant-portal/requests/:requestId/documents/:documentId',
      'POST /api/v1/applicant-portal/uploads',
    ]) {
      expect(routes).not.toContain(absentRoute);
    }
  });

  it('allows an applicant to create a draft request for an active discoverable school', async () => {
    const before = await getSideEffectSnapshot();
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/applicant-portal/requests`)
      .set('Authorization', bearer(applicantAuth))
      .send({
        schoolId: activeSchoolId,
        childFirstName: 'Layla',
        childLastName: 'Hassan',
        childDateOfBirth: '2018-04-12',
        childGender: 'female',
        childNationality: 'Egyptian',
        requestedAcademicYearId: academicYearId,
        requestedGradeId: gradeId,
        previousSchool: 'ABC School',
        notes: 'Needs bus route info.',
      })
      .expect(201);

    applicantRequestId = response.body.id;
    createdRequestIds.push(applicantRequestId);

    expect(response.body).toMatchObject({
      id: applicantRequestId,
      status: 'draft',
      school: {
        id: activeSchoolId,
        name: `${marker} Active Public`,
        shortName: `${marker} Active`,
        city: 'Cairo',
        country: 'Egypt',
      },
      childFullName: 'Layla Hassan',
      child: {
        firstName: 'Layla',
        lastName: 'Hassan',
        fullName: 'Layla Hassan',
        dateOfBirth: '2018-04-12',
        gender: 'female',
        nationality: 'Egyptian',
      },
      requestedAcademicYear: {
        id: academicYearId,
        label: `${marker} 2026/2027`,
      },
      requestedGrade: {
        id: gradeId,
        label: `${marker} Grade 4`,
      },
      previousSchool: 'ABC School',
      notes: 'Needs bus route info.',
      missingItemsCount: 2,
      progressValue: 25,
    });
    expectSafeRequestResponse(response.body);

    const requestDb = await prisma.applicantAdmissionRequest.findUniqueOrThrow({
      where: { id: applicantRequestId },
    });
    expect(requestDb).toMatchObject({
      applicantUserId,
      applicantProfileId,
      schoolId: activeSchoolId,
      organizationId,
      requestedAcademicYearId: academicYearId,
      requestedGradeId: gradeId,
      childFirstName: 'Layla',
      childLastName: 'Hassan',
      childFullName: 'Layla Hassan',
      childGender: 'female',
      childNationality: 'Egyptian',
      previousSchool: 'ABC School',
      notes: 'Needs bus route info.',
      status: ApplicantAdmissionRequestStatus.DRAFT,
      submittedAt: null,
      applicationId: null,
      deletedAt: null,
    });

    const after = await getSideEffectSnapshot();
    expect(after).toEqual(before);
  });

  it('allows an applicant to list only own requests', async () => {
    const otherCreateResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/applicant-portal/requests`)
      .set('Authorization', bearer(otherApplicantAuth))
      .send({
        schoolId: otherActiveSchoolId,
        childFirstName: 'Omar',
        childLastName: 'Ali',
      })
      .expect(201);
    otherApplicantRequestId = otherCreateResponse.body.id;
    createdRequestIds.push(otherApplicantRequestId);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/applicant-portal/requests`)
      .query({ page: 1, limit: 100, status: 'draft' })
      .set('Authorization', bearer(applicantAuth))
      .expect(200);

    expect(response.body.meta).toMatchObject({
      page: 1,
      limit: 100,
      total: 1,
      totalPages: 1,
      hasNextPage: false,
    });
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({
      id: applicantRequestId,
      status: 'draft',
      childFullName: 'Layla Hassan',
      missingItemsCount: 2,
      progressValue: 25,
    });
    expect(JSON.stringify(response.body)).not.toContain(
      otherApplicantRequestId,
    );
    expectSafeRequestResponse(response.body);
  });

  it('allows an applicant to read own request and hides another applicant request', async () => {
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/applicant-portal/requests/${applicantRequestId}`)
      .set('Authorization', bearer(applicantAuth))
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          id: applicantRequestId,
          childFullName: 'Layla Hassan',
          missingItemsCount: 2,
        });
        expectSafeRequestResponse(body);
      });

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${otherApplicantRequestId}`,
      )
      .set('Authorization', bearer(applicantAuth))
      .expect(404);
  });

  it('rejects parent, student, teacher, school, and platform users from request routes', async () => {
    for (const auth of [
      parentAuth,
      studentAuth,
      teacherAuth,
      schoolUserAuth,
      platformAuth,
    ]) {
      await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/applicant-portal/requests`)
        .set('Authorization', bearer(auth))
        .send({ schoolId: activeSchoolId, childFirstName: 'Mona' })
        .expect(403);
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/applicant-portal/requests`)
        .set('Authorization', bearer(auth))
        .expect(403);
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/applicant-portal/requests/${applicantRequestId}`)
        .set('Authorization', bearer(auth))
        .expect(403);
    }
  });

  it('rejects draft creation for unsafe schools and unsafe organizations', async () => {
    for (const schoolId of [
      suspendedSchoolId,
      archivedSchoolId,
      deletedSchoolId,
      suspendedOrganizationSchoolId,
      archivedOrganizationSchoolId,
      deletedOrganizationSchoolId,
      randomUUID(),
    ]) {
      await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/applicant-portal/requests`)
        .set('Authorization', bearer(applicantAuth))
        .send({ schoolId, childFirstName: 'Mona' })
        .expect(404);
    }
  });

  it('keeps required documents endpoint working and keeps deferred upload/document actions absent', async () => {
    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/applicant-portal/schools/${activeSchoolId}/admission-required-documents`,
      )
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              title: 'Birth certificate',
              isMandatory: true,
            }),
            expect.objectContaining({
              title: 'Parent ID',
              isMandatory: true,
            }),
            expect.objectContaining({
              title: 'Optional family photo',
              isMandatory: false,
            }),
          ]),
        );
      });

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${applicantRequestId}/documents`,
      )
      .set('Authorization', bearer(applicantAuth))
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({ data: [] });
      });

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/applicant-portal/uploads`)
      .set('Authorization', bearer(applicantAuth))
      .expect(404);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${applicantRequestId}/documents/${randomUUID()}/download`,
      )
      .set('Authorization', bearer(applicantAuth))
      .expect(404);
  });

  async function createOrganization(input: {
    slug: string;
    name: string;
    status: OrganizationStatus;
    deletedAt?: Date | null;
  }): Promise<{ id: string }> {
    const organization = await prisma.organization.create({
      data: {
        slug: input.slug,
        name: input.name,
        status: input.status,
        deletedAt: input.deletedAt ?? null,
      },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);
    return organization;
  }

  async function createSchoolWithProfile(input: {
    organizationId: string;
    slug: string;
    name: string;
    status: SchoolStatus;
    schoolName: string;
    shortName?: string | null;
    city: string;
    country?: string | null;
    deletedAt?: Date | null;
  }): Promise<string> {
    const school = await prisma.school.create({
      data: {
        organizationId: input.organizationId,
        slug: input.slug,
        name: input.name,
        status: input.status,
        deletedAt: input.deletedAt ?? null,
      },
      select: { id: true },
    });
    createdSchoolIds.push(school.id);

    const profile = await prisma.schoolProfile.create({
      data: {
        schoolId: school.id,
        schoolName: input.schoolName,
        shortName: input.shortName ?? null,
        city: input.city,
        country: input.country ?? null,
      },
      select: { id: true },
    });
    createdSchoolProfileIds.push(profile.id);

    return school.id;
  }

  async function createAcademicYear(schoolId: string): Promise<string> {
    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId,
        nameAr: `${marker} عام ٢٠٢٦/٢٠٢٧`,
        nameEn: `${marker} 2026/2027`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-06-30T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    createdAcademicYearIds.push(academicYear.id);
    return academicYear.id;
  }

  async function createStage(schoolId: string): Promise<string> {
    const stage = await prisma.stage.create({
      data: {
        schoolId,
        nameAr: `${marker} ابتدائي`,
        nameEn: `${marker} Primary`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    createdStageIds.push(stage.id);
    return stage.id;
  }

  async function createGrade(
    schoolId: string,
    stageId: string,
  ): Promise<string> {
    const grade = await prisma.grade.create({
      data: {
        schoolId,
        stageId,
        nameAr: `${marker} الصف الرابع`,
        nameEn: `${marker} Grade 4`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    createdGradeIds.push(grade.id);
    return grade.id;
  }

  async function createRequiredDocument(input: {
    schoolId: string;
    organizationId: string;
    title: string;
    isMandatory: boolean;
    sortOrder?: number;
    isActive?: boolean;
    deletedAt?: Date | null;
  }): Promise<void> {
    const document = await prisma.admissionRequiredDocument.create({
      data: {
        schoolId: input.schoolId,
        organizationId: input.organizationId,
        title: input.title,
        description: null,
        isMandatory: input.isMandatory,
        acceptedFileTypes: ['application/pdf'],
        maxFiles: 1,
        sortOrder: input.sortOrder ?? 0,
        isActive: input.isActive ?? true,
        deletedAt: input.deletedAt ?? null,
      },
      select: { id: true },
    });
    createdDocumentIds.push(document.id);
  }

  async function createApplicantAccount(label: string): Promise<{
    userId: string;
    applicantId: string;
  }> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/applicant-portal/accounts`)
      .send({
        fullName: `Sprint 18F ${label} Applicant`,
        email: `${marker}-${label}@example.test`,
        password: PASSWORD,
        phoneNumber: '+20 100 000 0000',
        city: 'Cairo',
        relationship: 'guardian',
      })
      .expect(201);

    createdUserIds.push(response.body.userId);
    createdProfileIds.push(response.body.applicantId);

    return {
      userId: response.body.userId,
      applicantId: response.body.applicantId,
    };
  }

  async function createUserWithMembership(
    userType: UserType,
    label: string,
  ): Promise<void> {
    const userId = await createMembershiplessUser(userType, label);
    await prisma.membership.create({
      data: {
        userId,
        organizationId,
        schoolId: activeSchoolId,
        roleId,
        userType,
        status: MembershipStatus.ACTIVE,
      },
    });
  }

  async function createMembershiplessUser(
    userType: UserType,
    label: string,
  ): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `${marker}-${label}@example.test`,
        firstName: 'Sprint18F',
        lastName: label,
        userType,
        status: UserStatus.ACTIVE,
        passwordHash: await argon2.hash(PASSWORD, ARGON2_OPTIONS),
        passwordChangedAt: new Date(),
        credentialVersion: 1,
      },
      select: { id: true },
    });
    createdUserIds.push(user.id);
    return user.id;
  }

  async function login(email: string): Promise<AuthTokens> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password: PASSWORD })
      .expect(200);

    return { accessToken: response.body.accessToken };
  }

  async function getSideEffectSnapshot(): Promise<SideEffectSnapshot> {
    const [
      memberships,
      applications,
      applicationDocuments,
      files,
      students,
      guardians,
      studentGuardianLinks,
      enrollments,
    ] = await Promise.all([
      prisma.membership.count(),
      prisma.application.count(),
      prisma.applicationDocument.count(),
      prisma.file.count(),
      prisma.student.count(),
      prisma.guardian.count(),
      prisma.studentGuardian.count(),
      prisma.enrollment.count(),
    ]);

    return {
      memberships,
      applications,
      applicationDocuments,
      files,
      students,
      guardians,
      studentGuardianLinks,
      enrollments,
    };
  }

  function bearer(tokens: AuthTokens): string {
    return `Bearer ${tokens.accessToken}`;
  }

  function expectSafeRequestResponse(body: unknown): void {
    const serialized = JSON.stringify(body);
    for (const forbidden of [
      'organizationId',
      'applicantUserId',
      'applicantProfileId',
      'deletedAt',
      'submittedAt',
      'applicationId',
      'DOCUMENTS_PENDING',
      'DRAFT',
      'featureControl',
      'featureControls',
      'entitlement',
      'billing',
      'subscription',
      'plan',
      'quota',
      'staff',
      'studentCount',
      'objectKey',
      'bucket',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  }

  function listRegisteredRoutes(): string[] {
    const expressApp = app.getHttpAdapter().getInstance() as {
      _router?: { stack?: ExpressLayer[] };
      router?: { stack?: ExpressLayer[] };
    };
    const stack = expressApp._router?.stack ?? expressApp.router?.stack ?? [];
    const routes: string[] = [];

    collectRoutes(stack, routes);

    return routes.sort();
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

  async function cleanupData(): Promise<void> {
    if (!prisma) return;

    await prisma.session.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { actorId: { in: createdUserIds } },
          { resourceId: { in: [...createdProfileIds, ...createdRequestIds] } },
          { schoolId: { in: createdSchoolIds } },
          { organizationId: { in: createdOrganizationIds } },
        ],
      },
    });
    await prisma.applicantAdmissionRequest.deleteMany({
      where: { id: { in: createdRequestIds } },
    });
    await prisma.applicantProfile.deleteMany({
      where: { id: { in: createdProfileIds } },
    });
    await prisma.membership.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: createdUserIds } },
    });
    await prisma.admissionRequiredDocument.deleteMany({
      where: { id: { in: createdDocumentIds } },
    });
    await prisma.grade.deleteMany({ where: { id: { in: createdGradeIds } } });
    await prisma.stage.deleteMany({ where: { id: { in: createdStageIds } } });
    await prisma.academicYear.deleteMany({
      where: { id: { in: createdAcademicYearIds } },
    });
    await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
    await prisma.schoolProfile.deleteMany({
      where: { id: { in: createdSchoolProfileIds } },
    });
    await prisma.school.deleteMany({
      where: { id: { in: createdSchoolIds } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: createdOrganizationIds } },
    });
  }
});
