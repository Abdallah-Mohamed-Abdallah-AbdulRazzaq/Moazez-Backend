import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
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
const ADMIN_PASSWORD = 'Sprint11FAdmin123!';
const LIMITED_PASSWORD = 'Sprint11FLimited123!';
const CHANGED_PASSWORD = 'Changed11F!!';
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

type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

jest.setTimeout(180000);

describe('Sprint 11F Identity/Credentials/Email final closeout (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let organizationAId = '';
  let organizationBId = '';
  let schoolAId = '';
  let schoolBId = '';
  let schoolAdminRoleId = '';
  let teacherRoleId = '';
  let studentRoleId = '';
  let adminEmail = '';
  let adminBEmail = '';
  let limitedTeacherEmail = '';
  let adminAuth: AuthTokens;
  let adminBAuth: AuthTokens;
  let limitedTeacherAuth: AuthTokens;
  let settingsUserId = '';
  let settingsUserLoginEmail = '';
  let bulkUserId = '';
  let deliveryUserId = '';
  let studentId = '';
  let studentLinkTargetId = '';
  let guardianId = '';
  let crossSchoolStudentUserId = '';
  let credentialBatchId = '';
  let campaignBatchId = '';

  const suffix = randomUUID().split('-')[0];
  const testMarker = `s11f-${suffix}`;
  const loginDomain = `${testMarker}.login.test`;
  const createdOrganizationIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdStudentIds: string[] = [];
  const createdGuardianIds: string[] = [];
  const createdStudentGuardianIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const [schoolAdminRole, teacherRole, studentRole] = await Promise.all([
      findSystemRole('school_admin'),
      findSystemRole('teacher'),
      findSystemRole('student'),
    ]);
    schoolAdminRoleId = schoolAdminRole.id;
    teacherRoleId = teacherRole.id;
    studentRoleId = studentRole.id;

    const organizationA = await prisma.organization.create({
      data: {
        slug: `${testMarker}-org-a`,
        name: `Sprint 11F Org A ${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    organizationAId = organizationA.id;
    createdOrganizationIds.push(organizationA.id);

    const organizationB = await prisma.organization.create({
      data: {
        slug: `${testMarker}-org-b`,
        name: `Sprint 11F Org B ${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    organizationBId = organizationB.id;
    createdOrganizationIds.push(organizationB.id);

    const schoolA = await prisma.school.create({
      data: {
        organizationId: organizationAId,
        slug: `${testMarker}-school-a`,
        name: `Sprint 11F School A ${suffix}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    schoolAId = schoolA.id;
    createdSchoolIds.push(schoolA.id);

    const schoolB = await prisma.school.create({
      data: {
        organizationId: organizationBId,
        slug: `${testMarker}-school-b`,
        name: `Sprint 11F School B ${suffix}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    schoolBId = schoolB.id;
    createdSchoolIds.push(schoolB.id);

    await prisma.schoolProfile.create({
      data: {
        schoolId: schoolAId,
        schoolName: `Sprint 11F Academy ${suffix}`,
        shortName: `S11F ${suffix}`,
        logoUrl: `https://assets.example.test/${testMarker}/logo.png`,
      },
    });
    await prisma.schoolProfile.create({
      data: {
        schoolId: schoolBId,
        schoolName: `Sprint 11F School B ${suffix}`,
      },
    });

    adminEmail = `${testMarker}-admin@example.test`;
    adminBEmail = `${testMarker}-admin-b@example.test`;
    limitedTeacherEmail = `${testMarker}-limited-teacher@example.test`;

    await createUserWithMembership({
      email: adminEmail,
      password: ADMIN_PASSWORD,
      firstName: 'Sprint11F',
      lastName: 'Admin',
      userType: UserType.SCHOOL_USER,
      roleId: schoolAdminRoleId,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });
    await createUserWithMembership({
      email: adminBEmail,
      password: ADMIN_PASSWORD,
      firstName: 'Sprint11F',
      lastName: 'AdminB',
      userType: UserType.SCHOOL_USER,
      roleId: schoolAdminRoleId,
      organizationId: organizationBId,
      schoolId: schoolBId,
    });
    await createUserWithMembership({
      email: limitedTeacherEmail,
      password: LIMITED_PASSWORD,
      firstName: 'Limited',
      lastName: 'Teacher',
      userType: UserType.TEACHER,
      roleId: teacherRoleId,
      organizationId: organizationAId,
      schoolId: schoolAId,
    });

    crossSchoolStudentUserId = await createUserWithMembership({
      email: `${testMarker}-cross-student@school-b.example.test`,
      password: ADMIN_PASSWORD,
      firstName: 'Cross',
      lastName: 'Student',
      userType: UserType.STUDENT,
      roleId: studentRoleId,
      organizationId: organizationBId,
      schoolId: schoolBId,
    });

    studentId = await createStudent({
      schoolId: schoolAId,
      organizationId: organizationAId,
      firstName: 'Linked',
      lastName: 'Student',
    });
    studentLinkTargetId = await createStudent({
      schoolId: schoolAId,
      organizationId: organizationAId,
      firstName: 'Cross',
      lastName: 'LinkTarget',
    });
    guardianId = await createGuardian({
      schoolId: schoolAId,
      organizationId: organizationAId,
      firstName: 'Linked',
      lastName: 'Guardian',
      relation: 'mother',
      email: `${testMarker}-guardian-contact@example.test`,
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

    adminAuth = await login(adminEmail, ADMIN_PASSWORD);
    adminBAuth = await login(adminBEmail, ADMIN_PASSWORD);
    limitedTeacherAuth = await login(limitedTeacherEmail, LIMITED_PASSWORD);
  });

  afterAll(async () => {
    try {
      if (app) await app.close();
      await cleanupCloseoutData();
    } finally {
      if (prisma) await prisma.$disconnect();
    }
  });

  it('registers the Sprint 11 route inventory and keeps deferred app routes absent', async () => {
    const routes = listRegisteredRoutes();

    expect(routes).toEqual(
      expect.arrayContaining([
        'GET /api/v1/settings/login-identity',
        'PUT /api/v1/settings/login-identity',
        'GET /api/v1/settings/login-identity/preview',
        'GET /api/v1/settings/users/usernames/available',
        'GET /api/v1/settings/users/credentials/status',
        'POST /api/v1/settings/users/:userId/credentials/generate',
        'POST /api/v1/settings/users/:userId/credentials/set',
        'POST /api/v1/settings/users/:userId/credentials/regenerate',
        'POST /api/v1/settings/users/credentials/bulk-preview',
        'POST /api/v1/settings/users/credentials/bulk-generate',
        'POST /api/v1/auth/change-password',
        'POST /api/v1/students-guardians/students/:studentId/account',
        'POST /api/v1/students-guardians/guardians/:guardianId/account',
        'GET /api/v1/settings/email/connection',
        'PUT /api/v1/settings/email/connection',
        'POST /api/v1/settings/email/connection/test',
        'POST /api/v1/settings/email/connection/activate',
        'POST /api/v1/settings/email/connection/disable',
        'GET /api/v1/settings/email/templates',
        'GET /api/v1/settings/email/templates/:key',
        'PUT /api/v1/settings/email/templates/:key',
        'POST /api/v1/settings/email/templates/:key/preview',
        'POST /api/v1/settings/email/templates/:key/reset-default',
        'POST /api/v1/settings/email/credential-deliveries/preview-recipients',
        'POST /api/v1/settings/email/credential-deliveries',
        'GET /api/v1/settings/email/deliveries',
        'GET /api/v1/settings/email/deliveries/:batchId',
        'GET /api/v1/settings/email/deliveries/:batchId/recipients',
        'POST /api/v1/settings/email/deliveries/:batchId/cancel',
        'POST /api/v1/settings/email/campaigns/preview-recipients',
        'POST /api/v1/settings/email/campaigns/preview',
        'POST /api/v1/settings/email/campaigns',
        'GET /api/v1/settings/email/campaigns',
        'GET /api/v1/settings/email/campaigns/:batchId',
        'GET /api/v1/teacher/schedule',
        'GET /api/v1/teacher/schedule/week',
        'GET /api/v1/student/schedule',
        'GET /api/v1/student/schedule/week',
        'GET /api/v1/parent/children/:studentId/schedule/today',
        'GET /api/v1/parent/children/:studentId/schedule/weekly',
      ]),
    );

    for (const absentRoute of [
      'GET /api/v1/parent/schedule',
      'GET /api/v1/parent/homeworks',
      'GET /api/v1/student/pickup',
      'POST /api/v1/parent/pickup/requests',
      'GET /api/v1/teacher/notifications',
      'GET /api/v1/student/notifications',
      'GET /api/v1/parent/notifications',
      'GET /api/v1/applicant-portal/identity',
      'POST /api/v1/parent/children/add',
      'GET /api/v1/teacher/messages/contacts',
      'POST /api/v1/teacher/messages/conversations',
      'POST /api/v1/teacher/messages/conversations/:conversationId/attachments',
      'POST /api/v1/teacher/messages/conversations/:conversationId/audio',
      'POST /api/v1/student/messages/conversations/:conversationId/attachments',
      'POST /api/v1/parent/messages/conversations/:conversationId/audio',
      'POST /api/v1/student/rewards/:rewardId/redeem',
      'PUT /api/v1/teacher/profile',
      'POST /api/v1/parent/profile/avatar',
      'PUT /api/v1/student/preferences',
    ]) {
      expect(routes).not.toContain(absentRoute);
    }

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/settings/login-identity`)
      .expect(401);
    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/settings/users/${randomUUID()}/credentials/generate`,
      )
      .expect(401);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/settings/email/connection`)
      .expect(401);

    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/settings/login-identity`)
      .set('Authorization', bearer(limitedTeacherAuth))
      .send({ loginDomain })
      .expect(403);
    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/settings/users/${randomUUID()}/credentials/generate`,
      )
      .set('Authorization', bearer(limitedTeacherAuth))
      .expect(403);
    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/settings/email/connection`)
      .set('Authorization', bearer(limitedTeacherAuth))
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/settings/email/campaigns`)
      .set('Authorization', bearer(limitedTeacherAuth))
      .send({
        recipientScope: { scope: 'selected', userIds: [] },
        customEmails: [`campaign-${testMarker}@example.test`],
        bodyHtml: '<p>Hello</p>',
      })
      .expect(403);

    for (const route of [
      '/student/notifications',
      '/parent/pickup',
      '/applicant-portal/identity',
    ]) {
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}${route}`)
        .set('Authorization', bearer(adminAuth))
        .expect(404);
    }
  });

  it('covers login identity and credential provisioning without exposing secrets or tenant ids', async () => {
    const username = `teacher${suffix}`;
    const contactEmail = `${testMarker}-teacher-contact@example.test`;

    const settings = await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/settings/login-identity`)
      .set('Authorization', bearer(adminAuth))
      .send({
        loginDomain,
        usernameMinLength: 3,
        usernameMaxLength: 40,
        reservedUsernames: [`reserved-${suffix}`],
        status: 'active',
      })
      .expect(200);

    expect(settings.body).toMatchObject({
      configured: true,
      loginDomain,
      status: 'active',
    });
    expectSanitized(settings.body);

    const preview = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/settings/login-identity/preview`)
      .set('Authorization', bearer(adminAuth))
      .query({ username: username.toUpperCase() })
      .expect(200);

    settingsUserLoginEmail = `${username}@${loginDomain}`;
    expect(preview.body).toEqual({
      username,
      loginEmail: settingsUserLoginEmail,
    });
    expectSanitized(preview.body);

    const availableBefore = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/settings/users/usernames/available`)
      .set('Authorization', bearer(adminAuth))
      .query({ username })
      .expect(200);
    expect(availableBefore.body).toMatchObject({
      username,
      loginEmail: settingsUserLoginEmail,
      available: true,
      reason: null,
    });

    const createdUser = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/settings/users`)
      .set('Authorization', bearer(adminAuth))
      .send({
        fullName: 'Sprint Eleven Teacher',
        username,
        contactEmail,
        roleId: teacherRoleId,
      })
      .expect(201);

    settingsUserId = createdUser.body.id;
    createdUserIds.push(settingsUserId);
    expect(createdUser.body).toMatchObject({
      id: settingsUserId,
      username,
      email: settingsUserLoginEmail,
      loginEmail: settingsUserLoginEmail,
      contactEmail,
      status: 'active',
    });
    expect(createdUser.body.email).not.toBe(contactEmail);
    expectSanitized(createdUser.body);

    const availableAfter = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/settings/users/usernames/available`)
      .set('Authorization', bearer(adminAuth))
      .query({ username })
      .expect(200);
    expect(availableAfter.body).toMatchObject({
      available: false,
      reason: 'login_email_taken',
    });

    const generated = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/settings/users/${settingsUserId}/credentials/generate`,
      )
      .set('Authorization', bearer(adminAuth))
      .expect(201);

    const temporaryPassword = generated.body.temporaryPassword as string;
    expect(temporaryPassword).toMatch(/^MZ-/);
    expect(generated.body).toMatchObject({
      mustChangePassword: true,
      credentialVersion: 1,
      user: {
        userId: settingsUserId,
        username,
        loginEmail: settingsUserLoginEmail,
        contactEmail,
        mustChangePassword: true,
        status: 'temporary_or_must_change',
        credentialVersion: 1,
      },
    });
    expectSanitized(generated.body, { allowTemporaryPassword: true });

    const tempLogin = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email: settingsUserLoginEmail, password: temporaryPassword })
      .expect(200);

    expect(tempLogin.body.user).toMatchObject({
      id: settingsUserId,
      username,
      loginEmail: settingsUserLoginEmail,
      contactEmail,
      mustChangePassword: true,
    });
    expect(tempLogin.body.user).not.toHaveProperty('passwordHash');

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/change-password`)
      .set('Authorization', `Bearer ${tempLogin.body.accessToken}`)
      .send({
        currentPassword: temporaryPassword,
        newPassword: CHANGED_PASSWORD,
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({ success: true, mustChangePassword: false });
      });

    const me = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/auth/me`)
      .set('Authorization', `Bearer ${tempLogin.body.accessToken}`)
      .expect(200);
    expect(me.body).toMatchObject({
      id: settingsUserId,
      username,
      loginEmail: settingsUserLoginEmail,
      contactEmail,
      mustChangePassword: false,
    });
    expect(me.body).not.toHaveProperty('passwordHash');

    const statusAfterChange = await credentialStatus(username);
    expect(statusAfterChange.body.items).toHaveLength(1);
    expect(statusAfterChange.body.items[0]).toMatchObject({
      userId: settingsUserId,
      status: 'set',
      hasPassword: true,
      mustChangePassword: false,
      credentialVersion: 2,
    });
    expectSanitized(statusAfterChange.body);
    expect(JSON.stringify(statusAfterChange.body)).not.toContain(
      temporaryPassword,
    );

    const bulkUsername = `bulk${suffix}`;
    const createdBulkUser = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/settings/users`)
      .set('Authorization', bearer(adminAuth))
      .send({
        fullName: 'Sprint Eleven Bulk',
        username: bulkUsername,
        contactEmail: `${testMarker}-bulk-contact@example.test`,
        roleId: teacherRoleId,
      })
      .expect(201);
    bulkUserId = createdBulkUser.body.id;
    createdUserIds.push(bulkUserId);

    const passwordBeforePreview = await prisma.user.findUniqueOrThrow({
      where: { id: bulkUserId },
      select: { passwordHash: true },
    });
    expect(passwordBeforePreview.passwordHash).toBeNull();

    const bulkPreview = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/settings/users/credentials/bulk-preview`)
      .set('Authorization', bearer(adminAuth))
      .send({ scope: 'selected', userIds: [bulkUserId] })
      .expect(201);

    expect(bulkPreview.body).toMatchObject({
      totalMatched: 1,
      eligible: 1,
      skipped: 0,
    });
    expectSanitized(bulkPreview.body);

    const passwordAfterPreview = await prisma.user.findUniqueOrThrow({
      where: { id: bulkUserId },
      select: { passwordHash: true },
    });
    expect(passwordAfterPreview.passwordHash).toBeNull();

    const bulkGenerate = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/settings/users/credentials/bulk-generate`)
      .set('Authorization', bearer(adminAuth))
      .send({ scope: 'selected', userIds: [bulkUserId] })
      .expect(201);

    const bulkTemporaryPassword = bulkGenerate.body.items[0]
      .temporaryPassword as string;
    expect(bulkGenerate.body).toMatchObject({
      totalMatched: 1,
      generated: 1,
      skipped: 0,
    });
    expect(bulkTemporaryPassword).toMatch(/^MZ-/);
    expectSanitized(bulkGenerate.body, { allowTemporaryPassword: true });

    const bulkStatus = await credentialStatus(bulkUsername);
    expect(bulkStatus.body.items[0]).toMatchObject({
      userId: bulkUserId,
      status: 'temporary_or_must_change',
      hasPassword: true,
      mustChangePassword: true,
      credentialVersion: 1,
    });
    expect(JSON.stringify(bulkStatus.body)).not.toContain(
      bulkTemporaryPassword,
    );

    const deliveryUsername = `delivery${suffix}`;
    const createdDeliveryUser = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/settings/users`)
      .set('Authorization', bearer(adminAuth))
      .send({
        fullName: 'Sprint Eleven Delivery',
        username: deliveryUsername,
        contactEmail: `${testMarker}-delivery-contact@example.test`,
        roleId: teacherRoleId,
      })
      .expect(201);
    deliveryUserId = createdDeliveryUser.body.id;
    createdUserIds.push(deliveryUserId);
  });

  it('covers student and guardian account linking through domain-owned records', async () => {
    const studentAccount = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/students/${studentId}/account`)
      .set('Authorization', bearer(adminAuth))
      .send({
        mode: 'create',
        username: `student${suffix}`,
        contactEmail: `${testMarker}-student-contact@example.test`,
        temporaryPasswordMode: 'generate',
      })
      .expect(201);
    createdUserIds.push(studentAccount.body.user.userId);

    expect(studentAccount.body).toMatchObject({
      studentId,
      linked: true,
      user: {
        username: `student${suffix}`,
        loginEmail: `student${suffix}@${loginDomain}`,
        userType: 'student',
        mustChangePassword: true,
        credentialVersion: 1,
      },
    });
    expect(studentAccount.body.temporaryPassword).toMatch(/^MZ-/);
    expectSanitized(studentAccount.body, { allowTemporaryPassword: true });

    const linkedStudent = await prisma.student.findUniqueOrThrow({
      where: { id: studentId },
      select: { userId: true },
    });
    expect(linkedStudent.userId).toBe(studentAccount.body.user.userId);

    const guardianAccount = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/students-guardians/guardians/${guardianId}/account`,
      )
      .set('Authorization', bearer(adminAuth))
      .send({
        mode: 'create',
        username: `parent${suffix}`,
        temporaryPasswordMode: 'generate',
      })
      .expect(201);
    createdUserIds.push(guardianAccount.body.user.userId);

    expect(guardianAccount.body).toMatchObject({
      guardianId,
      linked: true,
      user: {
        username: `parent${suffix}`,
        loginEmail: `parent${suffix}@${loginDomain}`,
        contactEmail: `${testMarker}-guardian-contact@example.test`,
        userType: 'parent',
        mustChangePassword: true,
        credentialVersion: 1,
      },
    });
    expect(guardianAccount.body.temporaryPassword).toMatch(/^MZ-/);
    expectSanitized(guardianAccount.body, { allowTemporaryPassword: true });

    const linkedGuardian = await prisma.guardian.findUniqueOrThrow({
      where: { id: guardianId },
      select: { userId: true },
    });
    expect(linkedGuardian.userId).toBe(guardianAccount.body.user.userId);

    const crossSchoolLink = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/students-guardians/students/${studentLinkTargetId}/account`,
      )
      .set('Authorization', bearer(adminAuth))
      .send({ mode: 'link', userId: crossSchoolStudentUserId })
      .expect(404);

    expect(crossSchoolLink.body.error.code).toBe('not_found');
    const unlinkedStudent = await prisma.student.findUniqueOrThrow({
      where: { id: studentLinkTargetId },
      select: { userId: true },
    });
    expect(unlinkedStudent.userId).toBeNull();
  });

  it('covers school email connection, templates, queued deliveries, campaigns, and no Core side effects', async () => {
    const connection = await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/settings/email/connection`)
      .set('Authorization', bearer(adminAuth))
      .send({
        providerType: 'SMTP',
        fromName: 'Sprint 11F Mail',
        fromEmail: `${testMarker}-mail@example.test`,
        replyToEmail: `${testMarker}-reply@example.test`,
        host: '127.0.0.1',
        port: 1,
        secure: false,
        username: `${testMarker}-smtp-user`,
        password: `${testMarker}-smtp-secret`,
        apiKey: `${testMarker}-api-secret`,
      })
      .expect(200);

    expect(connection.body).toMatchObject({
      configured: true,
      providerType: 'SMTP',
      hasPassword: true,
      hasApiKey: true,
      status: 'DRAFT',
    });
    expectEmailSanitized(connection.body);

    const testConnection = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/settings/email/connection/test`)
      .set('Authorization', bearer(adminAuth))
      .send({ toEmail: `${testMarker}-test-recipient@example.test` })
      .expect(201);
    expect(testConnection.body).toMatchObject({
      status: 'VERIFIED',
      deliveryMode: 'configuration_validation',
      testRecipient: `${testMarker}-test-recipient@example.test`,
    });
    expectEmailSanitized(testConnection.body);

    const activated = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/settings/email/connection/activate`)
      .set('Authorization', bearer(adminAuth))
      .expect(201);
    expect(activated.body.status).toBe('ACTIVE');
    expectEmailSanitized(activated.body);

    const fetchedConnection = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/settings/email/connection`)
      .set('Authorization', bearer(adminAuth))
      .expect(200);
    expect(fetchedConnection.body.status).toBe('ACTIVE');
    expectEmailSanitized(fetchedConnection.body);

    const templates = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/settings/email/templates`)
      .set('Authorization', bearer(adminAuth))
      .expect(200);
    expect(
      templates.body.items.map((item: { key: string }) => item.key),
    ).toEqual(['ACCOUNT_CREDENTIALS', 'PASSWORD_RESET', 'GENERAL_MESSAGE']);
    expectSanitized(templates.body);

    const updatedTemplateBody = `<p>${testMarker} persisted {{user.fullName}} from {{school.name}}</p>`;
    const updatedTemplate = await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/settings/email/templates/GENERAL_MESSAGE`)
      .set('Authorization', bearer(adminAuth))
      .send({
        subject: `${testMarker} update for {{user.fullName}}`,
        bodyHtml: updatedTemplateBody,
        bodyText: `${testMarker} update for {{user.fullName}}`,
        supportEmail: `${testMarker}-support@example.test`,
        isActive: true,
      })
      .expect(200);
    expect(updatedTemplate.body).toMatchObject({
      key: 'GENERAL_MESSAGE',
      customized: true,
      subject: `${testMarker} update for {{user.fullName}}`,
      bodyHtml: updatedTemplateBody,
    });
    expectSanitized(updatedTemplate.body);

    const previewOnlyMarker = `${testMarker}-preview-only`;
    const preview = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/settings/email/templates/GENERAL_MESSAGE/preview`)
      .set('Authorization', bearer(adminAuth))
      .send({
        subject: `${previewOnlyMarker} {{user.fullName}}`,
        bodyHtml:
          `<p>${previewOnlyMarker} {{support.phone}} ` +
          '{{credential.temporaryPassword}}</p>',
        previewData: {
          user: { fullName: 'Preview User' },
          support: { phone: null },
        },
      })
      .expect(201);
    expect(preview.body.subject).toBe(`${previewOnlyMarker} Preview User`);
    expect(preview.body.missingVariables).toContain('support.phone');
    expect(preview.body.unknownVariables).toContain(
      'credential.temporaryPassword',
    );
    expectSanitized(preview.body);

    const templateAfterPreview = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/settings/email/templates/GENERAL_MESSAGE`)
      .set('Authorization', bearer(adminAuth))
      .expect(200);
    expect(JSON.stringify(templateAfterPreview.body)).not.toContain(
      previewOnlyMarker,
    );
    expect(templateAfterPreview.body.bodyHtml).toBe(updatedTemplateBody);

    const credentialPreview = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/settings/email/credential-deliveries/preview-recipients`,
      )
      .set('Authorization', bearer(adminAuth))
      .send({
        scope: 'selected',
        userIds: [deliveryUserId],
        requireContactEmail: true,
      })
      .expect(201);
    expect(credentialPreview.body).toMatchObject({
      totalMatched: 1,
      eligible: 1,
      skipped: 0,
    });
    expectSanitized(credentialPreview.body);

    const credentialDelivery = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/settings/email/credential-deliveries`)
      .set('Authorization', bearer(adminAuth))
      .send({
        scope: 'selected',
        userIds: [deliveryUserId],
        credentialMode: 'LOGIN_INFO_ONLY',
        requireContactEmail: true,
        maxRecipients: 1,
      })
      .expect(201);
    credentialBatchId = credentialDelivery.body.batchId;
    expect(credentialDelivery.body).toMatchObject({
      batchId: credentialBatchId,
      status: 'QUEUED',
      kind: 'CREDENTIAL_DELIVERY',
      templateKey: 'ACCOUNT_CREDENTIALS',
      totalRecipients: 1,
      queuedCount: 1,
      deliveryMode: 'queued',
    });
    expectSanitized(credentialDelivery.body);

    const deliveries = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/settings/email/deliveries`)
      .set('Authorization', bearer(adminAuth))
      .query({ kind: 'CREDENTIAL_DELIVERY', limit: 10 })
      .expect(200);
    expect(
      deliveries.body.items.some(
        (item: { batchId: string }) => item.batchId === credentialBatchId,
      ),
    ).toBe(true);
    expectSanitized(deliveries.body);

    const credentialDetail = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/settings/email/deliveries/${credentialBatchId}`)
      .set('Authorization', bearer(adminAuth))
      .expect(200);
    expect(credentialDetail.body.batchId).toBe(credentialBatchId);
    expectSanitized(credentialDetail.body);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/settings/email/deliveries/${credentialBatchId}`)
      .set('Authorization', bearer(adminBAuth))
      .expect(404);

    const credentialRecipients = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/settings/email/deliveries/${credentialBatchId}/recipients`,
      )
      .set('Authorization', bearer(adminAuth))
      .expect(200);
    expect(credentialRecipients.body.items).toHaveLength(1);
    expect(credentialRecipients.body.items[0]).toMatchObject({
      userId: deliveryUserId,
      toEmail: `${testMarker}-delivery-contact@example.test`,
    });
    expectSanitized(credentialRecipients.body);

    const cancelCredential = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/settings/email/deliveries/${credentialBatchId}/cancel`,
      )
      .set('Authorization', bearer(adminAuth));
    expect([201, 409]).toContain(cancelCredential.status);
    if (cancelCredential.status === 201) {
      expect(cancelCredential.body.status).toBe('CANCELLED');
      expectSanitized(cancelCredential.body);
    } else {
      expect(cancelCredential.body.error.code).toBe(
        'settings.email.delivery_batch_not_cancelable',
      );
    }

    const campaignRecipients = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/settings/email/campaigns/preview-recipients`)
      .set('Authorization', bearer(adminAuth))
      .send({
        recipientScope: { scope: 'selected', userIds: [] },
        customEmails: [`${testMarker}-campaign@example.test`],
      })
      .expect(201);
    expect(campaignRecipients.body).toMatchObject({
      totalMatched: 1,
      eligible: 1,
      skipped: 0,
    });
    expectSanitized(campaignRecipients.body);

    const campaignPreview = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/settings/email/campaigns/preview`)
      .set('Authorization', bearer(adminAuth))
      .send({
        subject: 'General update for {{user.fullName}}',
        bodyHtml: '<p>{{school.name}} says hello to {{user.fullName}}</p>',
        previewData: {
          user: { fullName: 'Campaign Preview' },
          support: { phone: '+20 100 000 0000' },
        },
      })
      .expect(201);
    expect(campaignPreview.body).toMatchObject({
      key: 'GENERAL_MESSAGE',
      subject: 'General update for Campaign Preview',
      missingVariables: [],
      unknownVariables: [],
    });
    expectSanitized(campaignPreview.body);

    const forbiddenCampaignPreview = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/settings/email/campaigns/preview`)
      .set('Authorization', bearer(adminAuth))
      .send({
        bodyHtml: '<p>{{credential.temporaryPassword}}</p>',
      })
      .expect(422);
    expect(forbiddenCampaignPreview.body.error.code).toBe(
      'settings.email.campaign_credential_variables_forbidden',
    );

    const beforeSideEffects = await countDeferredCoreRecords();
    const campaign = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/settings/email/campaigns`)
      .set('Authorization', bearer(adminAuth))
      .send({
        recipientScope: { scope: 'selected', userIds: [] },
        customEmails: [`${testMarker}-campaign@example.test`],
        subject: `${testMarker} general campaign`,
        bodyHtml: '<p>General school update for {{user.fullName}}</p>',
        bodyText: 'General school update for {{user.fullName}}',
        maxRecipients: 1,
      })
      .expect(201);
    campaignBatchId = campaign.body.batchId;
    expect(campaign.body).toMatchObject({
      batchId: campaignBatchId,
      status: 'QUEUED',
      kind: 'GENERAL_CAMPAIGN',
      templateKey: 'GENERAL_MESSAGE',
      totalRecipients: 1,
      queuedCount: 1,
      deliveryMode: 'queued',
    });
    expectSanitized(campaign.body);

    const rejectedCampaignCreate = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/settings/email/campaigns`)
      .set('Authorization', bearer(adminAuth))
      .send({
        recipientScope: { scope: 'selected', userIds: [] },
        customEmails: [`${testMarker}-credential-variable@example.test`],
        bodyHtml: '<p>{{credential.temporaryPassword}}</p>',
      })
      .expect(422);
    expect(rejectedCampaignCreate.body.error.code).toBe(
      'settings.email.campaign_credential_variables_forbidden',
    );

    const campaignList = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/settings/email/campaigns`)
      .set('Authorization', bearer(adminAuth))
      .query({ limit: 10 })
      .expect(200);
    expect(
      campaignList.body.items.some(
        (item: { batchId: string }) => item.batchId === campaignBatchId,
      ),
    ).toBe(true);
    expectSanitized(campaignList.body);

    const campaignDetail = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/settings/email/campaigns/${campaignBatchId}`)
      .set('Authorization', bearer(adminAuth))
      .expect(200);
    expect(campaignDetail.body.batchId).toBe(campaignBatchId);
    expect(campaignDetail.body.kind).toBe('GENERAL_CAMPAIGN');
    expectSanitized(campaignDetail.body);

    const afterSideEffects = await countDeferredCoreRecords();
    expect(afterSideEffects).toEqual(beforeSideEffects);
  });

  async function findSystemRole(key: string): Promise<{ id: string }> {
    const role = await prisma.role.findFirst({
      where: { key, schoolId: null, isSystem: true, deletedAt: null },
      select: { id: true },
    });
    if (!role) throw new Error(`Missing system role: ${key}`);
    return role;
  }

  async function createUserWithMembership(params: {
    email: string;
    password: string;
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
        passwordHash: await argon2.hash(params.password, ARGON2_OPTIONS),
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

  async function createStudent(params: {
    schoolId: string;
    organizationId: string;
    firstName: string;
    lastName: string;
  }): Promise<string> {
    const student = await prisma.student.create({
      data: {
        schoolId: params.schoolId,
        organizationId: params.organizationId,
        firstName: params.firstName,
        lastName: params.lastName,
        status: StudentStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdStudentIds.push(student.id);
    return student.id;
  }

  async function createGuardian(params: {
    schoolId: string;
    organizationId: string;
    firstName: string;
    lastName: string;
    relation: string;
    email: string;
  }): Promise<string> {
    const guardian = await prisma.guardian.create({
      data: {
        schoolId: params.schoolId,
        organizationId: params.organizationId,
        firstName: params.firstName,
        lastName: params.lastName,
        phone: `${testMarker}-${params.relation}-phone`,
        email: params.email,
        relation: params.relation,
        isPrimary: true,
      },
      select: { id: true },
    });
    createdGuardianIds.push(guardian.id);
    return guardian.id;
  }

  async function login(email: string, password: string): Promise<AuthTokens> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password })
      .expect(200);

    return {
      accessToken: response.body.accessToken,
      refreshToken: response.body.refreshToken,
    };
  }

  async function credentialStatus(search: string) {
    return request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/settings/users/credentials/status`)
      .set('Authorization', bearer(adminAuth))
      .query({ search, limit: 5 })
      .expect(200);
  }

  async function countDeferredCoreRecords(): Promise<{
    communicationAnnouncements: number;
    communicationNotifications: number;
    xpLedgerEntries: number;
    rewardRedemptions: number;
  }> {
    const [
      communicationAnnouncements,
      communicationNotifications,
      xpLedgerEntries,
      rewardRedemptions,
    ] = await Promise.all([
      prisma.communicationAnnouncement.count({
        where: { schoolId: schoolAId },
      }),
      prisma.communicationNotification.count({
        where: { schoolId: schoolAId },
      }),
      prisma.xpLedger.count({ where: { schoolId: schoolAId } }),
      prisma.rewardRedemption.count({ where: { schoolId: schoolAId } }),
    ]);

    return {
      communicationAnnouncements,
      communicationNotifications,
      xpLedgerEntries,
      rewardRedemptions,
    };
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

  function bearer(tokens: AuthTokens): string {
    return `Bearer ${tokens.accessToken}`;
  }

  function expectEmailSanitized(value: unknown): void {
    expectSanitized(value);
    const serialized = JSON.stringify(value);
    expect(serialized).not.toContain(`${testMarker}-smtp-secret`);
    expect(serialized).not.toContain(`${testMarker}-api-secret`);
  }

  function expectSanitized(
    value: unknown,
    options?: { allowTemporaryPassword?: boolean },
  ): void {
    for (const key of [
      'passwordHash',
      'encryptedPassword',
      'encryptedApiKey',
      'schoolId',
      'organizationId',
    ]) {
      expectNoObjectKey(value, key);
    }

    if (!options?.allowTemporaryPassword) {
      expectNoObjectKey(value, 'temporaryPassword');
      expect(JSON.stringify(value)).not.toMatch(/MZ-[A-Z0-9-]+/);
    }
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

  async function cleanupCloseoutData(): Promise<void> {
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
    await prisma.schoolEmailDeliveryBatch.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.schoolEmailTemplate.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.schoolEmailConnection.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.schoolLoginSettings.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.studentGuardian.deleteMany({
      where: { id: { in: createdStudentGuardianIds } },
    });
    await prisma.student.deleteMany({
      where: { id: { in: createdStudentIds } },
    });
    await prisma.guardian.deleteMany({
      where: { id: { in: createdGuardianIds } },
    });
    await prisma.schoolProfile.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.membership.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: createdUserIds } },
    });
    await prisma.school.deleteMany({
      where: { id: { in: createdSchoolIds } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: createdOrganizationIds } },
    });
  }
});
