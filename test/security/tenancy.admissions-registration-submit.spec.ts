import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AdmissionApplicationSource,
  AdmissionApplicationStatus,
  LeadChannel,
  LeadStatus,
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

const DEMO_ADMIN_EMAIL = 'admin@academy.moazez.dev';
const DEMO_ADMIN_PASSWORD = 'School123!';
const DEMO_SCHOOL_SLUG = 'moazez-academy';

const TEST_SUFFIX = `ars${Date.now()}`;
const TEST_PASSWORD = 'AdmissionsRegisterSecurity123!';

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(30000);

describe('Accepted application registration submit tenancy and access (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let demoSchoolId: string;
  let demoOrganizationId: string;
  let demoApplicationId: string;
  let tenantBApplicationId: string;

  const createdUserIds = new Set<string>();
  const createdMembershipIds = new Set<string>();
  const createdRoleIds = new Set<string>();
  const createdOrganizationIds = new Set<string>();
  const createdSchoolIds = new Set<string>();
  const createdLeadIds = new Set<string>();
  const createdApplicationIds = new Set<string>();

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

    await createAdmissionsOnlyActor();
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

    demoApplicationId = await createApplication({
      schoolId: demoSchoolId,
      organizationId: demoOrganizationId,
      label: `${TEST_SUFFIX}-demo`,
    });

    const tenantB = await createTenantB();
    tenantBApplicationId = await createApplication({
      schoolId: tenantB.schoolId,
      organizationId: tenantB.organizationId,
      label: `${TEST_SUFFIX}-tenant-b`,
    });
  });

  afterAll(async () => {
    if (prisma) {
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

  async function createAdmissionsOnlyActor(): Promise<void> {
    const permission = await prisma.permission.findUnique({
      where: { code: 'admissions.applications.manage' },
      select: { id: true },
    });
    if (!permission) {
      throw new Error('admissions.applications.manage permission missing.');
    }

    const role = await prisma.role.create({
      data: {
        schoolId: demoSchoolId,
        key: `${TEST_SUFFIX}-admissions-only`,
        name: 'Admissions Register Submit Security Admissions Only',
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
      email: `${TEST_SUFFIX}-admissions-only@security.moazez.local`,
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

  async function createTenantB(): Promise<{
    organizationId: string;
    schoolId: string;
  }> {
    const organization = await prisma.organization.create({
      data: {
        slug: `${TEST_SUFFIX}-org-b`,
        name: 'Admissions Register Submit Security Org B',
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdOrganizationIds.add(organization.id);

    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        slug: `${TEST_SUFFIX}-school-b`,
        name: 'Admissions Register Submit Security School B',
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdSchoolIds.add(school.id);

    return { organizationId: organization.id, schoolId: school.id };
  }

  async function createApplication(params: {
    schoolId: string;
    organizationId: string;
    label: string;
  }): Promise<string> {
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
      select: { id: true },
    });
    createdLeadIds.add(lead.id);

    const application = await prisma.application.create({
      data: {
        schoolId: params.schoolId,
        organizationId: params.organizationId,
        leadId: lead.id,
        studentName: `${params.label} Student`,
        source: AdmissionApplicationSource.REFERRAL,
        status: AdmissionApplicationStatus.SUBMITTED,
        submittedAt: new Date('2026-04-21T08:30:00.000Z'),
      },
      select: { id: true },
    });
    createdApplicationIds.add(application.id);

    return application.id;
  }

  function validPayload(): Record<string, unknown> {
    return {
      student: {
        full_name_en: 'Security Submit Student',
        dateOfBirth: '2017-03-10',
      },
      guardians: [
        {
          profile: {
            full_name: 'Security Submit Guardian',
            relation: 'Mother',
            phone_primary: '+201009998877',
          },
        },
      ],
      enrollment: {
        academicYearId: randomUUID(),
        gradeId: randomUUID(),
        sectionId: randomUUID(),
        classroomId: randomUUID(),
        enrollmentDate: '2026-09-01',
      },
    };
  }

  it('rejects cross-school application ids with not-found behavior', async () => {
    const token = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/admissions/applications/${tenantBApplicationId}/register`,
      )
      .set('Authorization', `Bearer ${token}`)
      .send(validPayload())
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('requires both admissions manage and student registration permissions', async () => {
    const token = await login(
      `${TEST_SUFFIX}-admissions-only@security.moazez.local`,
      TEST_PASSWORD,
    );

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/admissions/applications/${demoApplicationId}/register`)
      .set('Authorization', `Bearer ${token}`)
      .send(validPayload())
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.scope.missing');
  });

  it.each([
    ['applicant', `${TEST_SUFFIX}-applicant@security.moazez.local`],
    ['parent', `${TEST_SUFFIX}-parent@security.moazez.local`],
    ['student', `${TEST_SUFFIX}-student@security.moazez.local`],
  ])('rejects %s actors from accepted application registration', async (_label, email) => {
    const token = await login(email, TEST_PASSWORD);

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/admissions/applications/${demoApplicationId}/register`)
      .set('Authorization', `Bearer ${token}`)
      .send(validPayload())
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.scope.missing');
  });

  it('rejects body-provided applicationId before it can override the route source', async () => {
    const token = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const payload = validPayload();
    payload.student = {
      ...(payload.student as Record<string, unknown>),
      applicationId: randomUUID(),
    };

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/admissions/applications/${demoApplicationId}/register`)
      .set('Authorization', `Bearer ${token}`)
      .send(payload)
      .expect(400);

    expect(response.body?.error?.code).toBe('validation.failed');
  });
});
