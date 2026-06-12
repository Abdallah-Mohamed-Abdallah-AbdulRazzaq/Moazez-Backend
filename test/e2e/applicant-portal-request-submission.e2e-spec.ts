import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AdmissionApplicationSource,
  AdmissionApplicationStatus,
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
const PASSWORD = 'Applicant18GPass!';
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

describe('Applicant Portal request submission (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let organizationId = '';
  let organizationToSuspendId = '';
  let docsSchoolId = '';
  let noDocsSchoolId = '';
  let schoolToSuspendId = '';
  let orgUnsafeSchoolId = '';
  let academicYearId = '';
  let gradeId = '';
  let roleId = '';
  let docsRequestId = '';
  let noDocsRequestId = '';
  let otherApplicantRequestId = '';

  let applicantAuth: AuthTokens;
  let otherApplicantAuth: AuthTokens;
  let parentAuth: AuthTokens;
  let studentAuth: AuthTokens;
  let teacherAuth: AuthTokens;
  let schoolUserAuth: AuthTokens;
  let platformAuth: AuthTokens;

  const suffix = randomUUID().split('-')[0];
  const marker = `s18g-submit-${suffix}`;
  const createdOrganizationIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdSchoolProfileIds: string[] = [];
  const createdAcademicYearIds: string[] = [];
  const createdStageIds: string[] = [];
  const createdGradeIds: string[] = [];
  const createdDocumentIds: string[] = [];
  const createdRequestIds: string[] = [];
  const createdApplicationIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdProfileIds: string[] = [];
  const createdRoleIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const activeOrganization = await createOrganization({
      slug: `${marker}-active-org`,
      name: `Sprint 18G Active Org ${suffix}`,
      status: OrganizationStatus.ACTIVE,
    });
    organizationId = activeOrganization.id;
    const organizationToSuspend = await createOrganization({
      slug: `${marker}-org-to-suspend`,
      name: `Sprint 18G Org To Suspend ${suffix}`,
      status: OrganizationStatus.ACTIVE,
    });
    organizationToSuspendId = organizationToSuspend.id;

    docsSchoolId = await createSchoolWithProfile({
      organizationId,
      slug: `${marker}-docs-school`,
      name: `${marker} Docs Academy`,
      status: SchoolStatus.ACTIVE,
      schoolName: `${marker} Docs Public`,
      shortName: `${marker} Docs`,
      city: 'Cairo',
      country: 'Egypt',
    });
    noDocsSchoolId = await createSchoolWithProfile({
      organizationId,
      slug: `${marker}-no-docs-school`,
      name: `${marker} No Docs Academy`,
      status: SchoolStatus.ACTIVE,
      schoolName: `${marker} No Docs Public`,
      city: 'Giza',
      country: 'Egypt',
    });
    schoolToSuspendId = await createSchoolWithProfile({
      organizationId,
      slug: `${marker}-school-to-suspend`,
      name: `${marker} School To Suspend`,
      status: SchoolStatus.ACTIVE,
      schoolName: `${marker} School To Suspend Public`,
      city: 'Cairo',
      country: 'Egypt',
    });
    orgUnsafeSchoolId = await createSchoolWithProfile({
      organizationId: organizationToSuspendId,
      slug: `${marker}-org-unsafe-school`,
      name: `${marker} Org Unsafe School`,
      status: SchoolStatus.ACTIVE,
      schoolName: `${marker} Org Unsafe Public`,
      city: 'Cairo',
      country: 'Egypt',
    });

    academicYearId = await createAcademicYear(docsSchoolId);
    const stageId = await createStage(docsSchoolId);
    gradeId = await createGrade(docsSchoolId, stageId);

    await createRequiredDocument({
      schoolId: docsSchoolId,
      organizationId,
      title: 'Birth certificate',
      isMandatory: true,
      sortOrder: 10,
    });
    await createRequiredDocument({
      schoolId: docsSchoolId,
      organizationId,
      title: 'Parent ID',
      isMandatory: true,
      sortOrder: 20,
    });
    await createRequiredDocument({
      schoolId: docsSchoolId,
      organizationId,
      title: `${marker} Optional`,
      isMandatory: false,
      sortOrder: 30,
    });
    await createRequiredDocument({
      schoolId: docsSchoolId,
      organizationId,
      title: `${marker} Inactive Mandatory`,
      isMandatory: true,
      isActive: false,
    });
    await createRequiredDocument({
      schoolId: docsSchoolId,
      organizationId,
      title: `${marker} Deleted Mandatory`,
      isMandatory: true,
      deletedAt: new Date(),
    });

    roleId = (
      await prisma.role.create({
        data: {
          schoolId: docsSchoolId,
          key: `${marker}-role`,
          name: `Sprint 18G Role ${suffix}`,
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

    await createApplicantAccount('primary');
    await createApplicantAccount('other');

    applicantAuth = await login(`${marker}-primary@example.test`);
    otherApplicantAuth = await login(`${marker}-other@example.test`);
    parentAuth = await login(`${marker}-parent@example.test`);
    studentAuth = await login(`${marker}-student@example.test`);
    teacherAuth = await login(`${marker}-teacher@example.test`);
    schoolUserAuth = await login(`${marker}-school-user@example.test`);
    platformAuth = await login(`${marker}-platform@example.test`);
  });

  afterAll(async () => {
    try {
      if (app) await app.close();
      await cleanupData();
    } finally {
      if (prisma) await prisma.$disconnect();
    }
  });

  it('registers submit and current document routes while keeping deferred conversion routes absent', async () => {
    const routes = listRegisteredRoutes();

    for (const implementedRoute of [
      'POST /api/v1/applicant-portal/accounts',
      'GET /api/v1/applicant-portal/profile',
      'GET /api/v1/applicant-portal/schools',
      'GET /api/v1/applicant-portal/schools/:schoolId',
      'GET /api/v1/applicant-portal/schools/:schoolId/admission-required-documents',
      'POST /api/v1/applicant-portal/requests',
      'GET /api/v1/applicant-portal/requests',
      'GET /api/v1/applicant-portal/requests/:requestId',
      'POST /api/v1/applicant-portal/requests/:requestId/submit',
      'POST /api/v1/applicant-portal/requests/:requestId/documents',
      'GET /api/v1/applicant-portal/requests/:requestId/documents',
      'GET /api/v1/applicant-portal/requests/:requestId/documents/:documentId',
      'GET /api/v1/applicant-portal/requests/:requestId/documents/:documentId/download',
      'POST /api/v1/applicant-portal/requests/:requestId/documents/:documentId/replacements',
      'DELETE /api/v1/applicant-portal/requests/:requestId/documents/:documentId',
    ]) {
      expect(routes).toContain(implementedRoute);
    }
    expect(routes).toContain(
      'GET /api/v1/admissions/applications/:applicationId/documents',
    );

    for (const absentRoute of [
      'PATCH /api/v1/applicant-portal/requests/:requestId',
      'PATCH /api/v1/applicant-portal/requests/:requestId/documents/:documentId',
      'POST /api/v1/applicant-portal/uploads',
      'POST /api/v1/applicant-portal/requests/:requestId/convert-to-parent',
      'POST /api/v1/applicant-portal/requests/:requestId/convert-to-guardian',
      'POST /api/v1/applicant-portal/requests/:requestId/convert-to-student',
      'POST /api/v1/applicant-portal/requests/:requestId/convert-to-enrollment',
      'POST /api/v1/applicant-portal/conversions',
      'GET /api/v1/admissions/applications/:applicationId/documents/:documentId',
      'PATCH /api/v1/admissions/applications/:applicationId/documents/:documentId',
      'POST /api/v1/admissions/applications/:applicationId/documents/:documentId/accept',
      'POST /api/v1/admissions/applications/:applicationId/documents/:documentId/reject',
      'POST /api/v1/admissions/applications/:applicationId/documents/:documentId/request-replacement',
      'POST /api/v1/admissions/applications/:applicationId/documents/reopen-collection',
    ]) {
      expect(routes).not.toContain(absentRoute);
    }
  });

  it('submits an own draft request and creates exactly one linked Admissions Application', async () => {
    const before = await getSideEffectSnapshot();
    const draft = await createDraftRequest(applicantAuth, {
      schoolId: docsSchoolId,
      childFirstName: 'Layla',
      childLastName: 'Hassan',
      requestedAcademicYearId: academicYearId,
      requestedGradeId: gradeId,
    });
    docsRequestId = draft.id;

    const response = await submitRequest(applicantAuth, docsRequestId, 200);

    expect(response.body).toMatchObject({
      id: docsRequestId,
      status: 'needs_action',
      school: {
        id: docsSchoolId,
        name: `${marker} Docs Public`,
      },
      childFullName: 'Layla Hassan',
      missingItemsCount: 2,
      progressValue: 40,
    });
    expectSafeRequestResponse(response.body);

    const requestDb = await prisma.applicantAdmissionRequest.findUniqueOrThrow({
      where: { id: docsRequestId },
    });
    expect(requestDb.status).toBe(ApplicantAdmissionRequestStatus.SUBMITTED);
    expect(requestDb.submittedAt).toBeInstanceOf(Date);
    expect(requestDb.applicationId).toEqual(expect.any(String));
    createdApplicationIds.push(requestDb.applicationId as string);

    const application = await prisma.application.findUniqueOrThrow({
      where: { id: requestDb.applicationId as string },
    });
    expect(application).toMatchObject({
      schoolId: docsSchoolId,
      organizationId,
      studentName: 'Layla Hassan',
      requestedAcademicYearId: academicYearId,
      requestedGradeId: gradeId,
      source: AdmissionApplicationSource.IN_APP,
      status: AdmissionApplicationStatus.DOCUMENTS_PENDING,
    });
    expect(application.submittedAt).toBeInstanceOf(Date);

    const after = await getSideEffectSnapshot();
    expect(after).toEqual({ ...before, applications: before.applications + 1 });
  });

  it('keeps repeated submit idempotent without duplicate Applications', async () => {
    const beforeCount = await prisma.application.count();

    const response = await submitRequest(applicantAuth, docsRequestId, 200);

    expect(response.body).toMatchObject({
      id: docsRequestId,
      status: 'needs_action',
      missingItemsCount: 2,
    });
    await expect(prisma.application.count()).resolves.toBe(beforeCount);
  });

  it('maps submitted when no mandatory required documents exist', async () => {
    const draft = await createDraftRequest(applicantAuth, {
      schoolId: noDocsSchoolId,
      childFirstName: 'Omar',
    });
    noDocsRequestId = draft.id;

    const response = await submitRequest(applicantAuth, noDocsRequestId, 200);

    expect(response.body).toMatchObject({
      id: noDocsRequestId,
      status: 'submitted',
      missingItemsCount: 0,
      progressValue: 50,
    });
    expectSafeRequestResponse(response.body);

    const requestDb = await prisma.applicantAdmissionRequest.findUniqueOrThrow({
      where: { id: noDocsRequestId },
    });
    createdApplicationIds.push(requestDb.applicationId as string);
    const application = await prisma.application.findUniqueOrThrow({
      where: { id: requestDb.applicationId as string },
    });
    expect(application.status).toBe(AdmissionApplicationStatus.SUBMITTED);
    expect(application.source).toBe(AdmissionApplicationSource.IN_APP);
  });

  it('lists and reads only the current applicant submitted requests', async () => {
    const otherDraft = await createDraftRequest(otherApplicantAuth, {
      schoolId: docsSchoolId,
      childFirstName: 'Mona',
    });
    otherApplicantRequestId = otherDraft.id;

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/applicant-portal/requests`)
      .query({ page: 1, limit: 100 })
      .set('Authorization', bearer(applicantAuth))
      .expect(200)
      .expect(({ body }) => {
        const serialized = JSON.stringify(body);
        expect(serialized).toContain(docsRequestId);
        expect(serialized).toContain(noDocsRequestId);
        expect(serialized).not.toContain(otherApplicantRequestId);
        expect(body.data).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: docsRequestId,
              status: 'needs_action',
            }),
            expect.objectContaining({
              id: noDocsRequestId,
              status: 'submitted',
            }),
          ]),
        );
        expectSafeRequestResponse(body);
      });

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/applicant-portal/requests/${docsRequestId}`)
      .set('Authorization', bearer(applicantAuth))
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          id: docsRequestId,
          status: 'needs_action',
        });
        expectSafeRequestResponse(body);
      });

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${otherApplicantRequestId}`,
      )
      .set('Authorization', bearer(applicantAuth))
      .expect(404);

    await submitRequest(applicantAuth, otherApplicantRequestId, 404);
  });

  it('rejects parent, student, teacher, school, and platform users from submit', async () => {
    const draft = await createDraftRequest(applicantAuth, {
      schoolId: docsSchoolId,
      childFirstName: 'Nour',
    });

    for (const auth of [
      parentAuth,
      studentAuth,
      teacherAuth,
      schoolUserAuth,
      platformAuth,
    ]) {
      await submitRequest(auth, draft.id, 403);
    }
  });

  it('rejects submit when the selected school or organization becomes unsafe', async () => {
    const schoolUnsafeDraft = await createDraftRequest(applicantAuth, {
      schoolId: schoolToSuspendId,
      childFirstName: 'Farah',
    });
    await prisma.school.update({
      where: { id: schoolToSuspendId },
      data: { status: SchoolStatus.SUSPENDED },
    });
    await submitRequest(applicantAuth, schoolUnsafeDraft.id, 404);

    const orgUnsafeDraft = await createDraftRequest(applicantAuth, {
      schoolId: orgUnsafeSchoolId,
      childFirstName: 'Youssef',
    });
    await prisma.organization.update({
      where: { id: organizationToSuspendId },
      data: { status: OrganizationStatus.SUSPENDED },
    });
    await submitRequest(applicantAuth, orgUnsafeDraft.id, 404);
  });

  it('keeps required documents, draft routes, and deferred conversion routes behavior intact', async () => {
    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/applicant-portal/schools/${docsSchoolId}/admission-required-documents`,
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
          ]),
        );
      });

    const draft = await createDraftRequest(applicantAuth, {
      schoolId: docsSchoolId,
      childFirstName: 'Salma',
    });

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/applicant-portal/requests/${draft.id}`)
      .set('Authorization', bearer(applicantAuth))
      .expect(200);

    for (const route of [
      `${GLOBAL_PREFIX}/applicant-portal/uploads`,
      `${GLOBAL_PREFIX}/applicant-portal/requests/${draft.id}/convert-to-parent`,
      `${GLOBAL_PREFIX}/applicant-portal/conversions`,
    ]) {
      await request(app.getHttpServer())
        .post(route)
        .set('Authorization', bearer(applicantAuth))
        .expect(404);
    }

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/applicant-portal/requests/${draft.id}/documents`)
      .set('Authorization', bearer(applicantAuth))
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({ data: [] });
      });

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${draft.id}/documents/${randomUUID()}/download`,
      )
      .set('Authorization', bearer(applicantAuth))
      .expect(404);

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/applicant-portal/requests/${draft.id}`)
      .set('Authorization', bearer(applicantAuth))
      .expect(404);
  });

  async function createOrganization(input: {
    slug: string;
    name: string;
    status: OrganizationStatus;
  }): Promise<{ id: string }> {
    const organization = await prisma.organization.create({
      data: {
        slug: input.slug,
        name: input.name,
        status: input.status,
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
  }): Promise<string> {
    const school = await prisma.school.create({
      data: {
        organizationId: input.organizationId,
        slug: input.slug,
        name: input.name,
        status: input.status,
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
        nameAr: `${marker} year`,
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
        nameAr: `${marker} primary`,
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
        nameAr: `${marker} grade four`,
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

  async function createApplicantAccount(label: string): Promise<void> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/applicant-portal/accounts`)
      .send({
        fullName: `Sprint 18G ${label} Applicant`,
        email: `${marker}-${label}@example.test`,
        password: PASSWORD,
        phoneNumber: '+20 100 000 0000',
        city: 'Cairo',
        relationship: 'guardian',
      })
      .expect(201);

    createdUserIds.push(response.body.userId);
    createdProfileIds.push(response.body.applicantId);
  }

  async function createDraftRequest(
    auth: AuthTokens,
    body: {
      schoolId: string;
      childFirstName: string;
      childLastName?: string;
      requestedAcademicYearId?: string;
      requestedGradeId?: string;
    },
  ): Promise<{ id: string }> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/applicant-portal/requests`)
      .set('Authorization', bearer(auth))
      .send(body)
      .expect(201);

    createdRequestIds.push(response.body.id);
    return { id: response.body.id };
  }

  async function submitRequest(
    auth: AuthTokens,
    requestId: string,
    expectedStatus: number,
  ) {
    return request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/applicant-portal/requests/${requestId}/submit`)
      .set('Authorization', bearer(auth))
      .expect(expectedStatus);
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
        schoolId: docsSchoolId,
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
        firstName: 'Sprint18G',
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
      'applicationId',
      'deletedAt',
      'submittedAt',
      'DOCUMENTS_PENDING',
      'SUBMITTED',
      'DRAFT',
      'IN_APP',
      'objectKey',
      'bucket',
      'signedUrl',
      'featureControl',
      'entitlement',
      'billing',
      'subscription',
      'plan',
      'quota',
      'staff',
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
          {
            resourceId: {
              in: [
                ...createdProfileIds,
                ...createdRequestIds,
                ...createdApplicationIds,
              ],
            },
          },
          { schoolId: { in: createdSchoolIds } },
          { organizationId: { in: createdOrganizationIds } },
        ],
      },
    });
    await prisma.applicantAdmissionRequest.deleteMany({
      where: { id: { in: createdRequestIds } },
    });
    await prisma.application.deleteMany({
      where: { id: { in: createdApplicationIds } },
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
