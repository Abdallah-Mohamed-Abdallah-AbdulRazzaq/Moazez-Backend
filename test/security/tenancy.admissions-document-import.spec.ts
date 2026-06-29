import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AdmissionApplicationSource,
  AdmissionApplicationStatus,
  AdmissionDocumentStatus,
  FileVisibility,
  LeadChannel,
  LeadStatus,
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  SchoolStatus,
  StudentStatus,
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
const DEMO_SCHOOL_SLUG = 'moazez-academy';

const TEST_SUFFIX = `adm-doc-import-security-${Date.now()}`;
const TEST_PASSWORD = 'AdmissionsDocImportSecurity123!';

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(30000);

describe('Admissions document import tenancy and access (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let demoSchoolId: string;
  let demoOrganizationId: string;
  let demoAdminUserId: string;
  let demoApplicationId: string;
  let demoApplicationDocumentId: string;
  let demoStudentId: string;
  let tenantBApplicationId: string;
  let tenantBApplicationDocumentId: string;
  let tenantBStudentId: string;

  const createdUserIds = new Set<string>();
  const createdMembershipIds = new Set<string>();
  const createdRoleIds = new Set<string>();
  const createdOrganizationIds = new Set<string>();
  const createdSchoolIds = new Set<string>();
  const createdLeadIds = new Set<string>();
  const createdApplicationIds = new Set<string>();
  const createdApplicationDocumentIds = new Set<string>();
  const createdStudentDocumentIds = new Set<string>();
  const createdFileIds = new Set<string>();
  const createdStudentIds = new Set<string>();

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const demoSchool = await prisma.school.findFirst({
      where: { slug: DEMO_SCHOOL_SLUG },
      select: { id: true, organizationId: true },
    });
    if (!demoSchool) {
      throw new Error('Demo school not found - run `npm run seed` first.');
    }
    demoSchoolId = demoSchool.id;
    demoOrganizationId = demoSchool.organizationId;

    const demoAdmin = await prisma.user.findUnique({
      where: { email: DEMO_ADMIN_EMAIL },
      select: { id: true },
    });
    if (!demoAdmin) {
      throw new Error('Demo school admin not found - run `npm run seed` first.');
    }
    demoAdminUserId = demoAdmin.id;
    await ensureSchoolAdminPermissions([
      'students.documents.manage',
      'admissions.documents.view',
    ]);

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

    const demoFixture = await createRegisteredApplicationFixture({
      schoolId: demoSchoolId,
      organizationId: demoOrganizationId,
      label: `${TEST_SUFFIX}-demo`,
    });
    demoApplicationId = demoFixture.applicationId;
    demoApplicationDocumentId = demoFixture.applicationDocumentId;
    demoStudentId = demoFixture.studentId;

    const tenantB = await createTenantB();
    const tenantBFixture = await createRegisteredApplicationFixture({
      schoolId: tenantB.schoolId,
      organizationId: tenantB.organizationId,
      label: `${TEST_SUFFIX}-tenant-b`,
    });
    tenantBApplicationId = tenantBFixture.applicationId;
    tenantBApplicationDocumentId = tenantBFixture.applicationDocumentId;
    tenantBStudentId = tenantBFixture.studentId;

    await createDocumentsViewOnlyActor();
    await createBlockedActor({
      email: `${TEST_SUFFIX}-applicant@security.moazez.local`,
      userType: UserType.APPLICANT,
      withMembership: false,
    });
    await createBlockedActor({
      email: `${TEST_SUFFIX}-parent@security.moazez.local`,
      userType: UserType.PARENT,
      roleKey: 'parent',
      withMembership: true,
    });
    await createBlockedActor({
      email: `${TEST_SUFFIX}-student@security.moazez.local`,
      userType: UserType.STUDENT,
      roleKey: 'student',
      withMembership: true,
    });
  });

  afterAll(async () => {
    if (prisma) {
      if (createdStudentIds.size > 0) {
        await prisma.auditLog.deleteMany({
          where: {
            action: 'students.document.import_from_admissions',
            resourceId: { in: [...createdStudentIds] },
          },
        });
      }
      if (createdStudentDocumentIds.size > 0) {
        await prisma.studentDocument.deleteMany({
          where: { id: { in: [...createdStudentDocumentIds] } },
        });
      }
      if (createdApplicationDocumentIds.size > 0) {
        await prisma.applicationDocument.deleteMany({
          where: { id: { in: [...createdApplicationDocumentIds] } },
        });
      }
      if (createdFileIds.size > 0) {
        await prisma.file.deleteMany({
          where: { id: { in: [...createdFileIds] } },
        });
      }
      if (createdStudentIds.size > 0) {
        await prisma.student.deleteMany({
          where: { id: { in: [...createdStudentIds] } },
        });
      }
      if (createdApplicationIds.size > 0) {
        await prisma.application.deleteMany({
          where: { id: { in: [...createdApplicationIds] } },
        });
      }
      if (createdLeadIds.size > 0) {
        await prisma.lead.deleteMany({
          where: { id: { in: [...createdLeadIds] } },
        });
      }
      if (createdUserIds.size > 0) {
        await prisma.session.deleteMany({
          where: { userId: { in: [...createdUserIds] } },
        });
      }
      if (createdMembershipIds.size > 0) {
        await prisma.membership.deleteMany({
          where: { id: { in: [...createdMembershipIds] } },
        });
      }
      if (createdUserIds.size > 0) {
        await prisma.user.deleteMany({
          where: { id: { in: [...createdUserIds] } },
        });
      }
      if (createdRoleIds.size > 0) {
        await prisma.rolePermission.deleteMany({
          where: { roleId: { in: [...createdRoleIds] } },
        });
        await prisma.role.deleteMany({
          where: { id: { in: [...createdRoleIds] } },
        });
      }
      if (createdSchoolIds.size > 0) {
        await prisma.school.deleteMany({
          where: { id: { in: [...createdSchoolIds] } },
        });
      }
      if (createdOrganizationIds.size > 0) {
        await prisma.organization.deleteMany({
          where: { id: { in: [...createdOrganizationIds] } },
        });
      }
    }

    if (app) {
      await app.close();
    }
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  async function login(email: string, password: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password })
      .expect(200);

    return response.body.accessToken;
  }

  async function ensureSchoolAdminPermissions(codes: string[]): Promise<void> {
    const role = await prisma.role.findFirst({
      where: { key: 'school_admin', schoolId: null, isSystem: true },
      select: { id: true },
    });
    if (!role) {
      throw new Error('school_admin system role not found - run `npm run seed` first.');
    }

    const permissions = await prisma.permission.findMany({
      where: { code: { in: codes } },
      select: { id: true, code: true },
    });
    const missingCodes = codes.filter(
      (code) => !permissions.some((permission) => permission.code === code),
    );
    if (missingCodes.length > 0) {
      throw new Error(`Missing permissions: ${missingCodes.join(', ')}`);
    }

    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({
        roleId: role.id,
        permissionId: permission.id,
      })),
      skipDuplicates: true,
    });
  }

  async function createTenantB(): Promise<{
    organizationId: string;
    schoolId: string;
  }> {
    const organization = await prisma.organization.create({
      data: {
        slug: `${TEST_SUFFIX}-org-b`,
        name: 'Admissions Document Import Security Org B',
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdOrganizationIds.add(organization.id);

    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        slug: `${TEST_SUFFIX}-school-b`,
        name: 'Admissions Document Import Security School B',
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdSchoolIds.add(school.id);

    return { organizationId: organization.id, schoolId: school.id };
  }

  async function createRegisteredApplicationFixture(params: {
    schoolId: string;
    organizationId: string;
    label: string;
  }): Promise<{
    applicationId: string;
    applicationDocumentId: string;
    studentId: string;
  }> {
    const lead = await prisma.lead.create({
      data: {
        schoolId: params.schoolId,
        organizationId: params.organizationId,
        studentName: `${params.label} Student`,
        primaryContactName: `${params.label} Parent`,
        phone: '+201009990000',
        email: `${params.label}@example.com`,
        channel: LeadChannel.REFERRAL,
        status: LeadStatus.NEW,
      },
      select: { id: true, studentName: true },
    });
    createdLeadIds.add(lead.id);

    const application = await prisma.application.create({
      data: {
        schoolId: params.schoolId,
        organizationId: params.organizationId,
        leadId: lead.id,
        studentName: lead.studentName,
        source: AdmissionApplicationSource.REFERRAL,
        status: AdmissionApplicationStatus.ACCEPTED,
        submittedAt: new Date('2026-04-21T08:30:00.000Z'),
      },
      select: { id: true },
    });
    createdApplicationIds.add(application.id);

    const file = await prisma.file.create({
      data: {
        organizationId: params.organizationId,
        schoolId: params.schoolId,
        bucket: 'adm-reg-doc-1b-security',
        objectKey: `admissions/${randomUUID()}.pdf`,
        originalName: 'security-document.pdf',
        mimeType: 'application/pdf',
        sizeBytes: BigInt(512),
        visibility: FileVisibility.PRIVATE,
      },
      select: { id: true },
    });
    createdFileIds.add(file.id);

    const applicationDocument = await prisma.applicationDocument.create({
      data: {
        schoolId: params.schoolId,
        applicationId: application.id,
        fileId: file.id,
        documentType: 'Security Document',
        status: AdmissionDocumentStatus.COMPLETE,
      },
      select: { id: true },
    });
    createdApplicationDocumentIds.add(applicationDocument.id);

    const student = await prisma.student.create({
      data: {
        schoolId: params.schoolId,
        organizationId: params.organizationId,
        applicationId: application.id,
        firstName: 'Security',
        lastName: 'Student',
        status: StudentStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdStudentIds.add(student.id);

    return {
      applicationId: application.id,
      applicationDocumentId: applicationDocument.id,
      studentId: student.id,
    };
  }

  async function createDocumentsViewOnlyActor(): Promise<void> {
    const permission = await prisma.permission.findUnique({
      where: { code: 'admissions.documents.view' },
      select: { id: true },
    });
    if (!permission) {
      throw new Error('admissions.documents.view permission missing.');
    }

    const role = await prisma.role.create({
      data: {
        schoolId: demoSchoolId,
        key: `${TEST_SUFFIX}-documents-view-only`,
        name: 'Admissions Document Import Security View Only',
        isSystem: false,
      },
      select: { id: true },
    });
    createdRoleIds.add(role.id);

    await prisma.rolePermission.create({
      data: {
        roleId: role.id,
        permissionId: permission.id,
      },
    });

    await createBlockedActor({
      email: `${TEST_SUFFIX}-documents-view-only@security.moazez.local`,
      userType: UserType.SCHOOL_USER,
      roleId: role.id,
      withMembership: true,
    });
  }

  async function createBlockedActor(params: {
    email: string;
    userType: UserType;
    roleKey?: string;
    roleId?: string;
    withMembership: boolean;
  }): Promise<void> {
    const passwordHash = await argon2.hash(TEST_PASSWORD, ARGON2_OPTIONS);
    const user = await prisma.user.create({
      data: {
        email: params.email,
        firstName: 'Admissions',
        lastName: params.userType,
        userType: params.userType,
        status: UserStatus.ACTIVE,
        passwordHash,
      },
      select: { id: true },
    });
    createdUserIds.add(user.id);

    if (!params.withMembership) {
      return;
    }

    let roleId = params.roleId;
    if (!roleId) {
      if (!params.roleKey) {
        throw new Error('roleKey is required when roleId is not supplied.');
      }
      roleId = (
        await prisma.role.findFirstOrThrow({
          where: {
            key: params.roleKey,
            schoolId: null,
            isSystem: true,
            deletedAt: null,
          },
          select: { id: true },
        })
      ).id;
    }

    const membership = await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId: demoOrganizationId,
        schoolId: demoSchoolId,
        roleId,
        userType: params.userType,
        status: MembershipStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdMembershipIds.add(membership.id);
  }

  function importPayload(overrides?: Partial<{
    applicationId: string;
    applicationDocumentIds: string[];
  }>): Record<string, unknown> {
    return {
      applicationId: overrides?.applicationId ?? demoApplicationId,
      applicationDocumentIds:
        overrides?.applicationDocumentIds ?? [demoApplicationDocumentId],
    };
  }

  it('rejects cross-school application ids with not-found behavior', async () => {
    const token = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/students-guardians/students/${demoStudentId}/documents/import-from-application`,
      )
      .set('Authorization', `Bearer ${token}`)
      .send(
        importPayload({
          applicationId: tenantBApplicationId,
          applicationDocumentIds: [tenantBApplicationDocumentId],
        }),
      )
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('rejects cross-school student ids with not-found behavior', async () => {
    const token = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/students-guardians/students/${tenantBStudentId}/documents/import-from-application`,
      )
      .set('Authorization', `Bearer ${token}`)
      .send(importPayload())
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('rejects cross-school ApplicationDocument ids with not-found behavior', async () => {
    const token = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/students-guardians/students/${demoStudentId}/documents/import-from-application`,
      )
      .set('Authorization', `Bearer ${token}`)
      .send(
        importPayload({
          applicationDocumentIds: [tenantBApplicationDocumentId],
        }),
      )
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('requires student document management permission', async () => {
    const token = await login(
      `${TEST_SUFFIX}-documents-view-only@security.moazez.local`,
      TEST_PASSWORD,
    );

    const response = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/students-guardians/students/${demoStudentId}/documents/import-from-application`,
      )
      .set('Authorization', `Bearer ${token}`)
      .send(importPayload())
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.scope.missing');
  });

  it.each([
    ['applicant', `${TEST_SUFFIX}-applicant@security.moazez.local`],
    ['parent', `${TEST_SUFFIX}-parent@security.moazez.local`],
    ['student', `${TEST_SUFFIX}-student@security.moazez.local`],
  ])('rejects %s actors from document import', async (_label, email) => {
    const token = await login(email, TEST_PASSWORD);

    const response = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/students-guardians/students/${demoStudentId}/documents/import-from-application`,
      )
      .set('Authorization', `Bearer ${token}`)
      .send(importPayload())
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.scope.missing');
  });
});
