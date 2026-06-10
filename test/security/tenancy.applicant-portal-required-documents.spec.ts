import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
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
const PASSWORD = 'Applicant18ESecurity!';
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(30000);

type AuthTokens = {
  accessToken: string;
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

describe('Applicant Portal required documents tenancy (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let organizationId = '';
  let activeSchoolId = '';
  let suspendedSchoolId = '';
  let deletedSchoolId = '';
  let suspendedOrganizationSchoolId = '';
  let deletedOrganizationSchoolId = '';
  let roleId = '';
  let schoolUserId = '';
  let applicantAuth: AuthTokens;
  let schoolUserAuth: AuthTokens;
  let platformAuth: AuthTokens;

  const suffix = randomUUID().split('-')[0];
  const marker = `s18e-security-${suffix}`;
  const createdOrganizationIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdDocumentIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdProfileIds: string[] = [];
  const createdRoleIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const activeOrganization = await createOrganization({
      slug: `${marker}-active-org`,
      name: `Sprint 18E Security Active Org ${suffix}`,
      status: OrganizationStatus.ACTIVE,
    });
    organizationId = activeOrganization.id;

    const suspendedOrganization = await createOrganization({
      slug: `${marker}-suspended-org`,
      name: `Sprint 18E Security Suspended Org ${suffix}`,
      status: OrganizationStatus.SUSPENDED,
    });
    const deletedOrganization = await createOrganization({
      slug: `${marker}-deleted-org`,
      name: `Sprint 18E Security Deleted Org ${suffix}`,
      status: OrganizationStatus.ACTIVE,
      deletedAt: new Date(),
    });

    activeSchoolId = await createSchoolWithProfile({
      organizationId,
      slug: `${marker}-active`,
      name: `${marker} Active Academy`,
      status: SchoolStatus.ACTIVE,
      schoolName: `${marker} Active Public`,
    });
    suspendedSchoolId = await createSchoolWithProfile({
      organizationId,
      slug: `${marker}-suspended`,
      name: `${marker} Suspended Academy`,
      status: SchoolStatus.SUSPENDED,
      schoolName: `${marker} Suspended Public`,
    });
    deletedSchoolId = await createSchoolWithProfile({
      organizationId,
      slug: `${marker}-deleted`,
      name: `${marker} Deleted Academy`,
      status: SchoolStatus.ACTIVE,
      schoolName: `${marker} Deleted Public`,
      deletedAt: new Date(),
    });
    suspendedOrganizationSchoolId = await createSchoolWithProfile({
      organizationId: suspendedOrganization.id,
      slug: `${marker}-suspended-org-school`,
      name: `${marker} Suspended Org Academy`,
      status: SchoolStatus.ACTIVE,
      schoolName: `${marker} Suspended Org Public`,
    });
    deletedOrganizationSchoolId = await createSchoolWithProfile({
      organizationId: deletedOrganization.id,
      slug: `${marker}-deleted-org-school`,
      name: `${marker} Deleted Org Academy`,
      status: SchoolStatus.ACTIVE,
      schoolName: `${marker} Deleted Org Public`,
    });

    await createRequiredDocument({
      schoolId: activeSchoolId,
      organizationId,
      title: 'Birth certificate',
      description: 'Clear scanned copy',
      acceptedFileTypes: ['application/pdf', 'image/png'],
      maxFiles: 1,
      sortOrder: 10,
    });
    await createRequiredDocument({
      schoolId: activeSchoolId,
      organizationId,
      title: 'Parent ID',
      description: null,
      acceptedFileTypes: ['image/jpeg'],
      maxFiles: 2,
      sortOrder: 20,
    });
    await createRequiredDocument({
      schoolId: activeSchoolId,
      organizationId,
      title: `${marker} Inactive Required Document`,
      isActive: false,
    });
    await createRequiredDocument({
      schoolId: activeSchoolId,
      organizationId,
      title: `${marker} Deleted Required Document`,
      deletedAt: new Date(),
    });
    await createRequiredDocument({
      schoolId: suspendedSchoolId,
      organizationId,
      title: `${marker} Suspended School Required Document`,
    });
    await createRequiredDocument({
      schoolId: deletedSchoolId,
      organizationId,
      title: `${marker} Deleted School Required Document`,
    });
    await createRequiredDocument({
      schoolId: suspendedOrganizationSchoolId,
      organizationId: suspendedOrganization.id,
      title: `${marker} Suspended Org Required Document`,
    });
    await createRequiredDocument({
      schoolId: deletedOrganizationSchoolId,
      organizationId: deletedOrganization.id,
      title: `${marker} Deleted Org Required Document`,
    });

    const role = await prisma.role.create({
      data: {
        schoolId: activeSchoolId,
        key: `${marker}-school-user-role`,
        name: `Sprint 18E Security School User ${suffix}`,
        isSystem: false,
      },
      select: { id: true },
    });
    roleId = role.id;
    createdRoleIds.push(role.id);

    schoolUserId = await createUser({
      email: `${marker}-school-user@example.test`,
      userType: UserType.SCHOOL_USER,
      firstName: 'School',
      lastName: 'User',
    });
    await prisma.membership.create({
      data: {
        userId: schoolUserId,
        organizationId,
        schoolId: activeSchoolId,
        roleId,
        userType: UserType.SCHOOL_USER,
        status: MembershipStatus.ACTIVE,
      },
    });

    await createUser({
      email: `${marker}-platform@example.test`,
      userType: UserType.PLATFORM_USER,
      firstName: 'Platform',
      lastName: 'User',
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

    await createApplicantAccount();
    applicantAuth = await login(`${marker}-applicant@example.test`);
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

  it('returns identical required document response for anonymous, applicant, school-user, and platform callers', async () => {
    const anonymousResponse = await readRequiredDocuments().expect(200);

    for (const auth of [applicantAuth, schoolUserAuth, platformAuth]) {
      const tokenResponse = await readRequiredDocuments()
        .set('Authorization', bearer(auth))
        .expect(200);

      expect(tokenResponse.body).toEqual(anonymousResponse.body);
      expectNoForbiddenDocumentFields(tokenResponse.body);
    }
  });

  it('leaks no internal tenant fields or inactive/deleted required documents', async () => {
    const response = await readRequiredDocuments().expect(200);

    expect(response.body.data).toEqual([
      {
        id: expect.any(String),
        title: 'Birth certificate',
        description: 'Clear scanned copy',
        isMandatory: true,
        acceptedFileTypes: ['application/pdf', 'image/png'],
        maxFiles: 1,
        sortOrder: 10,
      },
      {
        id: expect.any(String),
        title: 'Parent ID',
        description: null,
        isMandatory: true,
        acceptedFileTypes: ['image/jpeg'],
        maxFiles: 2,
        sortOrder: 20,
      },
    ]);
    expectNoForbiddenDocumentFields(response.body);

    const serialized = JSON.stringify(response.body);
    for (const hiddenValue of [
      organizationId,
      activeSchoolId,
      schoolUserId,
      roleId,
      `${marker} Inactive Required Document`,
      `${marker} Deleted Required Document`,
    ]) {
      expect(serialized).not.toContain(hiddenValue);
    }
  });

  it('does not expose required documents for unsafe schools or organizations', async () => {
    for (const schoolId of [
      suspendedSchoolId,
      deletedSchoolId,
      suspendedOrganizationSchoolId,
      deletedOrganizationSchoolId,
      randomUUID(),
    ]) {
      await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/applicant-portal/schools/${schoolId}/admission-required-documents`,
        )
        .expect(404);
    }

    const response = await readRequiredDocuments().expect(200);
    const serialized = JSON.stringify(response.body);
    for (const hiddenValue of [
      `${marker} Suspended School Required Document`,
      `${marker} Deleted School Required Document`,
      `${marker} Suspended Org Required Document`,
      `${marker} Deleted Org Required Document`,
    ]) {
      expect(serialized).not.toContain(hiddenValue);
    }
  });

  it('keeps applicant tokens out of non-applicant surfaces', async () => {
    for (const route of [
      `${GLOBAL_PREFIX}/parent/home`,
      `${GLOBAL_PREFIX}/student/home`,
      `${GLOBAL_PREFIX}/teacher/home`,
      `${GLOBAL_PREFIX}/admissions/applications`,
      `${GLOBAL_PREFIX}/platform-admin/overview`,
    ]) {
      const response = await request(app.getHttpServer())
        .get(route)
        .set('Authorization', bearer(applicantAuth))
        .expect(403);

      expect(response.body?.error?.code).toBe('auth.scope.missing');
    }
  });

  it('does not create memberships, admissions data, files, students, guardians, links, or enrollments', async () => {
    const before = await getSideEffectSnapshot();

    await readRequiredDocuments().expect(200);
    await readRequiredDocuments()
      .set('Authorization', bearer(applicantAuth))
      .expect(200);
    await readRequiredDocuments()
      .set('Authorization', bearer(schoolUserAuth))
      .expect(200);
    await readRequiredDocuments()
      .set('Authorization', bearer(platformAuth))
      .expect(200);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/applicant-portal/requests`)
      .send({ schoolId: activeSchoolId })
      .expect(404);

    const after = await getSideEffectSnapshot();
    expect(after).toEqual(before);
  });

  function readRequiredDocuments(): request.Test {
    return request(app.getHttpServer()).get(
      `${GLOBAL_PREFIX}/applicant-portal/schools/${activeSchoolId}/admission-required-documents`,
    );
  }

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

    await prisma.schoolProfile.create({
      data: {
        schoolId: school.id,
        schoolName: input.schoolName,
        city: 'Cairo',
      },
    });

    return school.id;
  }

  async function createRequiredDocument(input: {
    schoolId: string;
    organizationId: string;
    title: string;
    description?: string | null;
    isMandatory?: boolean;
    acceptedFileTypes?: string[];
    maxFiles?: number;
    sortOrder?: number;
    isActive?: boolean;
    deletedAt?: Date | null;
  }): Promise<void> {
    const document = await prisma.admissionRequiredDocument.create({
      data: {
        schoolId: input.schoolId,
        organizationId: input.organizationId,
        title: input.title,
        description: input.description ?? null,
        isMandatory: input.isMandatory ?? true,
        acceptedFileTypes: input.acceptedFileTypes ?? [],
        maxFiles: input.maxFiles ?? 1,
        sortOrder: input.sortOrder ?? 0,
        isActive: input.isActive ?? true,
        deletedAt: input.deletedAt ?? null,
      },
      select: { id: true },
    });
    createdDocumentIds.push(document.id);
  }

  async function createUser(input: {
    email: string;
    userType: UserType;
    firstName: string;
    lastName: string;
  }): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        userType: input.userType,
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

  async function createApplicantAccount(): Promise<void> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/applicant-portal/accounts`)
      .send({
        fullName: 'Sprint 18E Security Applicant',
        email: `${marker}-applicant@example.test`,
        password: PASSWORD,
        phoneNumber: '+20 100 000 0000',
        city: 'Cairo',
        relationship: 'guardian',
      })
      .expect(201);

    createdUserIds.push(response.body.userId);
    createdProfileIds.push(response.body.applicantId);
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

  function expectNoForbiddenDocumentFields(body: unknown): void {
    const serialized = JSON.stringify(body);
    for (const forbidden of [
      'schoolId',
      'organizationId',
      'gradeId',
      'isActive',
      'deletedAt',
      'createdAt',
      'updatedAt',
      'tenant',
      'featureControl',
      'featureControls',
      'entitlement',
      'billing',
      'subscription',
      'plan',
      'quota',
      'staff',
      'studentCount',
      'applicantCount',
      'storageKey',
      'objectKey',
      'bucket',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }

    for (const item of (body as { data: Record<string, unknown>[] }).data) {
      expect(Object.keys(item).sort()).toEqual(
        [
          'acceptedFileTypes',
          'description',
          'id',
          'isMandatory',
          'maxFiles',
          'sortOrder',
          'title',
        ].sort(),
      );
    }
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
          { resourceId: { in: createdProfileIds } },
          { schoolId: { in: createdSchoolIds } },
          { organizationId: { in: createdOrganizationIds } },
        ],
      },
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
    await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
    await prisma.schoolProfile.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.school.deleteMany({
      where: { id: { in: createdSchoolIds } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: createdOrganizationIds } },
    });
  }
});
