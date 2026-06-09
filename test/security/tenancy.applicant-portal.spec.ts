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
const PASSWORD = 'Applicant18BPass!';
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

type AuthTokens = {
  accessToken: string;
};

describe('Applicant Portal tenancy and app boundary (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let organizationId = '';
  let schoolId = '';
  let roleId = '';
  let applicantUserId = '';
  let applicantProfileId = '';
  let otherApplicantProfileId = '';
  let applicantAuth: AuthTokens;
  let schoolUserAuth: AuthTokens;
  let parentAuth: AuthTokens;
  let teacherAuth: AuthTokens;
  let studentAuth: AuthTokens;
  let serviceAccountAuth: AuthTokens;

  const suffix = randomUUID().split('-')[0];
  const marker = `s18b-security-${suffix}`;
  const createdUserIds: string[] = [];
  const createdProfileIds: string[] = [];
  const createdRoleIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdOrganizationIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const organization = await prisma.organization.create({
      data: {
        slug: `${marker}-org`,
        name: `Sprint 18B Security Org ${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    organizationId = organization.id;
    createdOrganizationIds.push(organization.id);

    const school = await prisma.school.create({
      data: {
        organizationId,
        slug: `${marker}-school`,
        name: `Sprint 18B Security School ${suffix}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    schoolId = school.id;
    createdSchoolIds.push(school.id);

    const role = await prisma.role.create({
      data: {
        schoolId,
        key: `${marker}-role`,
        name: `Sprint 18B Security Role ${suffix}`,
        isSystem: false,
      },
      select: { id: true },
    });
    roleId = role.id;
    createdRoleIds.push(role.id);

    await Promise.all([
      createUserWithMembership(UserType.SCHOOL_USER, 'school-user'),
      createUserWithMembership(UserType.PARENT, 'parent'),
      createUserWithMembership(UserType.TEACHER, 'teacher'),
      createUserWithMembership(UserType.STUDENT, 'student'),
      createMembershiplessUser(UserType.SERVICE_ACCOUNT, 'service-account'),
    ]);

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
    applicantAuth = await login(`${marker}-primary@example.test`);

    const otherApplicant = await createApplicantAccount('other');
    otherApplicantProfileId = otherApplicant.applicantId;

    schoolUserAuth = await login(`${marker}-school-user@example.test`);
    parentAuth = await login(`${marker}-parent@example.test`);
    teacherAuth = await login(`${marker}-teacher@example.test`);
    studentAuth = await login(`${marker}-student@example.test`);
    serviceAccountAuth = await login(`${marker}-service-account@example.test`);
  });

  afterAll(async () => {
    try {
      if (app) await app.close();
      await cleanupData();
    } finally {
      if (prisma) await prisma.$disconnect();
    }
  });

  it('allows applicant profile access without school membership', async () => {
    const membershipCount = await prisma.membership.count({
      where: {
        userId: applicantUserId,
        status: MembershipStatus.ACTIVE,
        deletedAt: null,
      },
    });
    expect(membershipCount).toBe(0);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/applicant-portal/profile`)
      .set('Authorization', bearer(applicantAuth))
      .expect(200);

    expect(response.body).toMatchObject({
      applicantId: applicantProfileId,
      userId: applicantUserId,
      userType: 'applicant',
    });
  });

  it('does not expose another applicant profile through guessed ids', async () => {
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/applicant-portal/profile`)
      .query({ applicantId: otherApplicantProfileId })
      .set('Authorization', bearer(applicantAuth))
      .expect(200);

    expect(response.body.applicantId).toBe(applicantProfileId);
    expect(response.body.applicantId).not.toBe(otherApplicantProfileId);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/applicant-portal/profile/${otherApplicantProfileId}`)
      .set('Authorization', bearer(applicantAuth))
      .expect(404);
  });

  it('rejects applicant tokens from Parent, Student, Teacher, Admissions, and Platform surfaces', async () => {
    const deniedRoutes = [
      `${GLOBAL_PREFIX}/parent/home`,
      `${GLOBAL_PREFIX}/student/home`,
      `${GLOBAL_PREFIX}/teacher/home`,
      `${GLOBAL_PREFIX}/admissions/applications`,
      `${GLOBAL_PREFIX}/platform-admin/overview`,
    ];

    for (const route of deniedRoutes) {
      const response = await request(app.getHttpServer())
        .get(route)
        .set('Authorization', bearer(applicantAuth))
        .expect(403);

      expect(response.body?.error?.code).toBe('auth.scope.missing');
    }
  });

  it('rejects non-applicant actors from Applicant Portal profile access', async () => {
    for (const auth of [schoolUserAuth, parentAuth, teacherAuth, studentAuth]) {
      const response = await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/applicant-portal/profile`)
        .set('Authorization', bearer(auth))
        .expect(403);

      expect(response.body?.error?.code).toBe('auth.scope.missing');
    }
  });

  it('rejects non-applicant membershipless users on applicant-marked routes', async () => {
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/applicant-portal/profile`)
      .set('Authorization', bearer(serviceAccountAuth))
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.scope.missing');
  });

  async function createApplicantAccount(label: string): Promise<{
    userId: string;
    applicantId: string;
  }> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/applicant-portal/accounts`)
      .send({
        fullName: `Sprint 18B ${label} Applicant`,
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
        schoolId,
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
        firstName: `Sprint18B`,
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

  function bearer(tokens: AuthTokens): string {
    return `Bearer ${tokens.accessToken}`;
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
    await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
    await prisma.school.deleteMany({
      where: { id: { in: createdSchoolIds } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: createdOrganizationIds } },
    });
  }
});
