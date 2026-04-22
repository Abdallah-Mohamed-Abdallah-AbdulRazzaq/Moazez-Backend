import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AdmissionApplicationSource,
  AdmissionApplicationStatus,
  AdmissionDecisionType,
  AdmissionDocumentStatus,
  FileVisibility,
  InterviewStatus,
  LeadChannel,
  LeadStatus,
  MembershipStatus,
  OrganizationStatus,
  PlacementTestStatus,
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

const DEMO_ADMIN_EMAIL = 'admin@academy.moazez.dev';
const DEMO_ADMIN_PASSWORD = 'School123!';

const LIMITED_ROLE_KEY = 'admissions_security_limited_role';
const LIMITED_USER_EMAIL = 'admissions-viewer@security.moazez.local';
const LIMITED_USER_PASSWORD = 'AdmissionsViewer123!';

const TENANT_B_ORG_SLUG = 'admissions-tenancy-org-b';
const TENANT_B_SCHOOL_SLUG = 'admissions-tenancy-school-b';
const TENANT_B_ADMIN_EMAIL = 'admin-b@admissions-tenancy.moazez.local';
const TENANT_B_ADMIN_PASSWORD = 'AdmissionsB123!';

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(30000);

describe('Admissions tenancy isolation (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let demoSchoolId: string;
  let demoOrganizationId: string;
  let schoolAdminRoleId: string;
  let limitedRoleId: string;
  let limitedUserId: string;
  let demoAdminId: string;

  let tenantBSchoolId: string;
  let tenantBUserId: string;
  let tenantBOrganizationId: string;

  let demoLeadId: string;
  let demoApplicationId: string;
  let demoFileId: string;
  let demoDocumentId: string;
  let demoPlacementTestId: string;
  let demoInterviewId: string;
  let demoDecisionId: string;

  let tenantBLeadId: string;
  let tenantBApplicationId: string;
  let tenantBFileId: string;
  let tenantBDocumentId: string;
  let tenantBPlacementTestId: string;
  let tenantBInterviewId: string;
  let tenantBDecisionId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const demoSchool = await prisma.school.findFirst({
      where: { slug: 'moazez-academy' },
      select: { id: true, organizationId: true },
    });
    if (!demoSchool) {
      throw new Error('Demo school not found - run `npm run seed` first.');
    }
    demoSchoolId = demoSchool.id;
    demoOrganizationId = demoSchool.organizationId;

    const [schoolAdminRole, leadsViewPermission, applicationsViewPermission] =
      await Promise.all([
        prisma.role.findFirst({
          where: { key: 'school_admin', schoolId: null, isSystem: true },
          select: { id: true },
        }),
        prisma.permission.findUnique({
          where: { code: 'admissions.leads.view' },
          select: { id: true },
        }),
        prisma.permission.findUnique({
          where: { code: 'admissions.applications.view' },
          select: { id: true },
        }),
      ]);

    if (!schoolAdminRole || !leadsViewPermission || !applicationsViewPermission) {
      throw new Error('Admissions permissions missing - run `npm run seed` first.');
    }
    schoolAdminRoleId = schoolAdminRole.id;

    const demoAdmin = await prisma.user.findUnique({
      where: { email: DEMO_ADMIN_EMAIL },
      select: { id: true },
    });
    if (!demoAdmin) {
      throw new Error('Demo school admin not found.');
    }
    demoAdminId = demoAdmin.id;

    await prisma.membership.updateMany({
      where: {
        userId: demoAdmin.id,
        schoolId: demoSchoolId,
        deletedAt: null,
      },
      data: {
        roleId: schoolAdminRoleId,
        userType: UserType.SCHOOL_USER,
        status: MembershipStatus.ACTIVE,
        endedAt: null,
      },
    });

    const existingLimitedRole = await prisma.role.findFirst({
      where: {
        schoolId: demoSchoolId,
        key: LIMITED_ROLE_KEY,
      },
      select: { id: true },
    });

    if (existingLimitedRole) {
      limitedRoleId = existingLimitedRole.id;
      await prisma.rolePermission.deleteMany({ where: { roleId: limitedRoleId } });
    } else {
      const createdRole = await prisma.role.create({
        data: {
          schoolId: demoSchoolId,
          key: LIMITED_ROLE_KEY,
          name: 'Admissions Security Limited',
          description: 'Same-school user without admissions manage permissions',
          isSystem: false,
        },
      });
      limitedRoleId = createdRole.id;
    }

    await prisma.rolePermission.createMany({
      data: [
        {
          roleId: limitedRoleId,
          permissionId: leadsViewPermission.id,
        },
        {
          roleId: limitedRoleId,
          permissionId: applicationsViewPermission.id,
        },
      ],
      skipDuplicates: true,
    });

    const limitedPasswordHash = await argon2.hash(
      LIMITED_USER_PASSWORD,
      ARGON2_OPTIONS,
    );
    const limitedUser = await prisma.user.upsert({
      where: { email: LIMITED_USER_EMAIL },
      update: {
        firstName: 'Admissions',
        lastName: 'Viewer',
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
        passwordHash: limitedPasswordHash,
      },
      create: {
        email: LIMITED_USER_EMAIL,
        firstName: 'Admissions',
        lastName: 'Viewer',
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
        passwordHash: limitedPasswordHash,
      },
    });
    limitedUserId = limitedUser.id;

    const existingLimitedMembership = await prisma.membership.findFirst({
      where: {
        userId: limitedUserId,
        organizationId: demoOrganizationId,
        schoolId: demoSchoolId,
        roleId: limitedRoleId,
      },
      select: { id: true },
    });

    if (existingLimitedMembership) {
      await prisma.membership.update({
        where: { id: existingLimitedMembership.id },
        data: {
          status: MembershipStatus.ACTIVE,
          endedAt: null,
          userType: UserType.SCHOOL_USER,
        },
      });
    } else {
      await prisma.membership.create({
        data: {
          userId: limitedUserId,
          organizationId: demoOrganizationId,
          schoolId: demoSchoolId,
          roleId: limitedRoleId,
          userType: UserType.SCHOOL_USER,
          status: MembershipStatus.ACTIVE,
        },
      });
    }

    const orgB = await prisma.organization.upsert({
      where: { slug: TENANT_B_ORG_SLUG },
      update: { status: OrganizationStatus.ACTIVE },
      create: {
        slug: TENANT_B_ORG_SLUG,
        name: 'Admissions Tenancy Org B',
        status: OrganizationStatus.ACTIVE,
      },
    });
    tenantBOrganizationId = orgB.id;

    const schoolB = await prisma.school.upsert({
      where: {
        organizationId_slug: {
          organizationId: orgB.id,
          slug: TENANT_B_SCHOOL_SLUG,
        },
      },
      update: { status: SchoolStatus.ACTIVE },
      create: {
        organizationId: orgB.id,
        slug: TENANT_B_SCHOOL_SLUG,
        name: 'Admissions Tenancy School B',
        status: SchoolStatus.ACTIVE,
      },
    });
    tenantBSchoolId = schoolB.id;

    const adminBPasswordHash = await argon2.hash(
      TENANT_B_ADMIN_PASSWORD,
      ARGON2_OPTIONS,
    );
    const adminB = await prisma.user.upsert({
      where: { email: TENANT_B_ADMIN_EMAIL },
      update: {
        firstName: 'Tenant',
        lastName: 'Admin B',
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
        passwordHash: adminBPasswordHash,
      },
      create: {
        email: TENANT_B_ADMIN_EMAIL,
        firstName: 'Tenant',
        lastName: 'Admin B',
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
        passwordHash: adminBPasswordHash,
      },
    });
    tenantBUserId = adminB.id;

    const existingMembershipB = await prisma.membership.findFirst({
      where: {
        userId: tenantBUserId,
        organizationId: tenantBOrganizationId,
        schoolId: tenantBSchoolId,
        roleId: schoolAdminRoleId,
      },
      select: { id: true },
    });

    if (existingMembershipB) {
      await prisma.membership.update({
        where: { id: existingMembershipB.id },
        data: {
          status: MembershipStatus.ACTIVE,
          endedAt: null,
          userType: UserType.SCHOOL_USER,
        },
      });
    } else {
      await prisma.membership.create({
        data: {
          userId: tenantBUserId,
          organizationId: tenantBOrganizationId,
          schoolId: tenantBSchoolId,
          roleId: schoolAdminRoleId,
          userType: UserType.SCHOOL_USER,
          status: MembershipStatus.ACTIVE,
        },
      });
    }

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

    const demoLead = await prisma.lead.create({
      data: {
        schoolId: demoSchoolId,
        organizationId: demoOrganizationId,
        studentName: 'Admissions Security Lead A',
        primaryContactName: 'Parent A',
        phone: '+201001110000',
        email: 'parent-a@security.moazez.local',
        channel: LeadChannel.REFERRAL,
        status: LeadStatus.NEW,
        notes: 'Lead A',
      },
      select: { id: true },
    });
    demoLeadId = demoLead.id;

    const demoApplication = await prisma.application.create({
      data: {
        schoolId: demoSchoolId,
        organizationId: demoOrganizationId,
        leadId: demoLeadId,
        studentName: 'Admissions Security Applicant A',
        source: AdmissionApplicationSource.REFERRAL,
        status: AdmissionApplicationStatus.SUBMITTED,
        submittedAt: new Date('2026-04-21T08:30:00.000Z'),
      },
      select: { id: true },
    });
    demoApplicationId = demoApplication.id;

    const demoFile = await prisma.file.create({
      data: {
        organizationId: demoOrganizationId,
        schoolId: demoSchoolId,
        uploaderId: null,
        bucket: 'security-admissions',
        objectKey: `demo/${randomUUID()}.pdf`,
        originalName: 'demo-application.pdf',
        mimeType: 'application/pdf',
        sizeBytes: BigInt(2048),
        checksumSha256: null,
        visibility: FileVisibility.PRIVATE,
      },
      select: { id: true },
    });
    demoFileId = demoFile.id;

    const demoDocument = await prisma.applicationDocument.create({
      data: {
        schoolId: demoSchoolId,
        applicationId: demoApplicationId,
        fileId: demoFileId,
        documentType: 'birth_certificate',
        status: AdmissionDocumentStatus.COMPLETE,
        notes: 'Demo document',
      },
      select: { id: true },
    });
    demoDocumentId = demoDocument.id;

    const demoPlacementTest = await prisma.placementTest.create({
      data: {
        schoolId: demoSchoolId,
        applicationId: demoApplicationId,
        type: 'Placement',
        scheduledAt: new Date('2026-04-22T10:00:00.000Z'),
        score: 88.5,
        result: 'Passed',
        status: PlacementTestStatus.COMPLETED,
      },
      select: { id: true },
    });
    demoPlacementTestId = demoPlacementTest.id;

    const demoInterview = await prisma.interview.create({
      data: {
        schoolId: demoSchoolId,
        applicationId: demoApplicationId,
        scheduledAt: new Date('2026-04-23T11:00:00.000Z'),
        interviewerUserId: demoAdminId,
        status: InterviewStatus.COMPLETED,
        notes: 'Completed demo interview',
      },
      select: { id: true },
    });
    demoInterviewId = demoInterview.id;

    const demoDecision = await prisma.admissionDecision.create({
      data: {
        schoolId: demoSchoolId,
        applicationId: demoApplicationId,
        decision: AdmissionDecisionType.WAITLIST,
        reason: 'Demo decision',
        decidedByUserId: demoAdminId,
        decidedAt: new Date('2026-04-24T09:00:00.000Z'),
      },
      select: { id: true },
    });
    demoDecisionId = demoDecision.id;

    const tenantBLead = await prisma.lead.create({
      data: {
        schoolId: tenantBSchoolId,
        organizationId: tenantBOrganizationId,
        studentName: 'Admissions Security Lead B',
        primaryContactName: 'Parent B',
        phone: '+201001119999',
        email: 'parent-b@security.moazez.local',
        channel: LeadChannel.WALK_IN,
        status: LeadStatus.CONTACTED,
        notes: 'Lead B',
      },
      select: { id: true },
    });
    tenantBLeadId = tenantBLead.id;

    const tenantBApplication = await prisma.application.create({
      data: {
        schoolId: tenantBSchoolId,
        organizationId: tenantBOrganizationId,
        leadId: tenantBLeadId,
        studentName: 'Admissions Security Applicant B',
        source: AdmissionApplicationSource.WALK_IN,
        status: AdmissionApplicationStatus.SUBMITTED,
        submittedAt: new Date('2026-04-21T09:15:00.000Z'),
      },
      select: { id: true },
    });
    tenantBApplicationId = tenantBApplication.id;

    const tenantBFile = await prisma.file.create({
      data: {
        organizationId: tenantBOrganizationId,
        schoolId: tenantBSchoolId,
        uploaderId: tenantBUserId,
        bucket: 'security-admissions',
        objectKey: `tenant-b/${randomUUID()}.pdf`,
        originalName: 'tenant-b-application.pdf',
        mimeType: 'application/pdf',
        sizeBytes: BigInt(2048),
        checksumSha256: null,
        visibility: FileVisibility.PRIVATE,
      },
      select: { id: true },
    });
    tenantBFileId = tenantBFile.id;

    const tenantBDocument = await prisma.applicationDocument.create({
      data: {
        schoolId: tenantBSchoolId,
        applicationId: tenantBApplicationId,
        fileId: tenantBFileId,
        documentType: 'birth_certificate',
        status: AdmissionDocumentStatus.COMPLETE,
        notes: 'Tenant B document',
      },
      select: { id: true },
    });
    tenantBDocumentId = tenantBDocument.id;

    const tenantBPlacementTest = await prisma.placementTest.create({
      data: {
        schoolId: tenantBSchoolId,
        applicationId: tenantBApplicationId,
        type: 'Placement',
        scheduledAt: new Date('2026-04-22T13:00:00.000Z'),
        score: 91,
        result: 'Passed',
        status: PlacementTestStatus.COMPLETED,
      },
      select: { id: true },
    });
    tenantBPlacementTestId = tenantBPlacementTest.id;

    const tenantBInterview = await prisma.interview.create({
      data: {
        schoolId: tenantBSchoolId,
        applicationId: tenantBApplicationId,
        scheduledAt: new Date('2026-04-23T14:00:00.000Z'),
        interviewerUserId: tenantBUserId,
        status: InterviewStatus.COMPLETED,
        notes: 'Completed tenant B interview',
      },
      select: { id: true },
    });
    tenantBInterviewId = tenantBInterview.id;

    const tenantBDecision = await prisma.admissionDecision.create({
      data: {
        schoolId: tenantBSchoolId,
        applicationId: tenantBApplicationId,
        decision: AdmissionDecisionType.ACCEPT,
        reason: 'Tenant B decision',
        decidedByUserId: tenantBUserId,
        decidedAt: new Date('2026-04-24T11:00:00.000Z'),
      },
      select: { id: true },
    });
    tenantBDecisionId = tenantBDecision.id;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }

    if (prisma) {
      await prisma.admissionDecision.deleteMany({
        where: {
          id: { in: [demoDecisionId, tenantBDecisionId].filter(Boolean) },
        },
      });
      await prisma.interview.deleteMany({
        where: {
          id: { in: [demoInterviewId, tenantBInterviewId].filter(Boolean) },
        },
      });
      await prisma.placementTest.deleteMany({
        where: {
          id: { in: [demoPlacementTestId, tenantBPlacementTestId].filter(Boolean) },
        },
      });
      await prisma.applicationDocument.deleteMany({
        where: {
          id: { in: [demoDocumentId, tenantBDocumentId].filter(Boolean) },
        },
      });
      await prisma.file.deleteMany({
        where: {
          id: { in: [demoFileId, tenantBFileId].filter(Boolean) },
        },
      });
      await prisma.application.deleteMany({
        where: {
          id: { in: [demoApplicationId, tenantBApplicationId].filter(Boolean) },
        },
      });
      await prisma.lead.deleteMany({
        where: {
          id: { in: [demoLeadId, tenantBLeadId].filter(Boolean) },
        },
      });
      await prisma.session.deleteMany({
        where: { userId: { in: [limitedUserId, tenantBUserId].filter(Boolean) } },
      });
      await prisma.membership.deleteMany({
        where: { userId: { in: [limitedUserId, tenantBUserId].filter(Boolean) } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [limitedUserId, tenantBUserId].filter(Boolean) } },
      });
      await prisma.rolePermission.deleteMany({ where: { roleId: limitedRoleId } });
      await prisma.role.deleteMany({ where: { id: limitedRoleId } });
      await prisma.school.deleteMany({ where: { id: tenantBSchoolId } });
      await prisma.organization.deleteMany({ where: { slug: TENANT_B_ORG_SLUG } });
      await prisma.$disconnect();
    }
  });

  async function login(
    email: string,
    password: string,
  ): Promise<{ accessToken: string }> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password })
      .expect(200);

    return { accessToken: response.body.accessToken };
  }

  it('returns 404 when school A admin requests a school B lead by id', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/admissions/leads/${tenantBLeadId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A admin updates a school B lead by id', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/admissions/leads/${tenantBLeadId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'Closed' })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A admin requests a school B application by id', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/admissions/applications/${tenantBApplicationId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A admin updates a school B application by id', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/admissions/applications/${tenantBApplicationId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ studentName: 'Should Not Work' })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A admin submits a school B application by id', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/admissions/applications/${tenantBApplicationId}/submit`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A admin lists documents for a school B application id', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/admissions/applications/${tenantBApplicationId}/documents`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A admin links a document to a school B application id', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/admissions/applications/${tenantBApplicationId}/documents`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        fileId: demoFileId,
        documentType: 'report_card',
      })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A admin deletes a school B document by id', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .delete(
        `${GLOBAL_PREFIX}/admissions/applications/${tenantBApplicationId}/documents/${tenantBDocumentId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A admin requests a school B placement test by id', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/admissions/tests/${tenantBPlacementTestId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A admin updates a school B placement test by id', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/admissions/tests/${tenantBPlacementTestId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'completed' })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A admin creates a placement test for a school B application id', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/admissions/tests`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        applicationId: tenantBApplicationId,
        type: 'Placement',
        scheduledAt: '2026-04-25T10:00:00.000Z',
      })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A admin requests a school B interview by id', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/admissions/interviews/${tenantBInterviewId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A admin updates a school B interview by id', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/admissions/interviews/${tenantBInterviewId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'completed' })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A admin creates an interview for a school B application id', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/admissions/interviews`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        applicationId: tenantBApplicationId,
        scheduledAt: '2026-04-25T11:00:00.000Z',
      })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A admin requests a school B decision by id', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/admissions/decisions/${tenantBDecisionId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A admin creates a decision for a school B application id', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/admissions/decisions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        applicationId: tenantBApplicationId,
        decision: 'accept',
      })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A admin requests enroll handoff for a school B application id', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/admissions/applications/${tenantBApplicationId}/enroll`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 403 when the same-school actor lacks the leads manage permission', async () => {
    const { accessToken } = await login(LIMITED_USER_EMAIL, LIMITED_USER_PASSWORD);

    const response = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/admissions/leads/${demoLeadId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'Contacted' })
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.scope.missing');
  });

  it('returns 403 when the same-school actor lacks the applications manage permission', async () => {
    const { accessToken } = await login(LIMITED_USER_EMAIL, LIMITED_USER_PASSWORD);

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/admissions/applications/${demoApplicationId}/submit`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.scope.missing');
  });

  it('returns 403 when the same-school actor lacks the documents view permission', async () => {
    const { accessToken } = await login(LIMITED_USER_EMAIL, LIMITED_USER_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/admissions/applications/${demoApplicationId}/documents`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.scope.missing');
  });

  it('returns 403 when the same-school actor lacks the tests view permission', async () => {
    const { accessToken } = await login(LIMITED_USER_EMAIL, LIMITED_USER_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/admissions/tests`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.scope.missing');
  });

  it('returns 403 when the same-school actor lacks the tests manage permission', async () => {
    const { accessToken } = await login(LIMITED_USER_EMAIL, LIMITED_USER_PASSWORD);

    const response = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/admissions/tests/${demoPlacementTestId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'completed' })
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.scope.missing');
  });

  it('returns 403 when the same-school actor lacks the interviews view permission', async () => {
    const { accessToken } = await login(LIMITED_USER_EMAIL, LIMITED_USER_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/admissions/interviews`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.scope.missing');
  });

  it('returns 403 when the same-school actor lacks the interviews manage permission', async () => {
    const { accessToken } = await login(LIMITED_USER_EMAIL, LIMITED_USER_PASSWORD);

    const response = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/admissions/interviews/${demoInterviewId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'completed' })
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.scope.missing');
  });

  it('returns 403 when the same-school actor lacks the decisions view permission', async () => {
    const { accessToken } = await login(LIMITED_USER_EMAIL, LIMITED_USER_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/admissions/decisions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.scope.missing');
  });

  it('returns 403 when the same-school actor lacks the decisions manage permission', async () => {
    const { accessToken } = await login(LIMITED_USER_EMAIL, LIMITED_USER_PASSWORD);

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/admissions/decisions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        applicationId: demoApplicationId,
        decision: 'accept',
      })
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.scope.missing');
  });

  it('returns 403 when the same-school actor lacks the applications manage permission for enroll handoff', async () => {
    const { accessToken } = await login(LIMITED_USER_EMAIL, LIMITED_USER_PASSWORD);

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/admissions/applications/${demoApplicationId}/enroll`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.scope.missing');
  });
});
