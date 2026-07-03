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
const PASSWORD = 'AdmWorkflowPolicy123!';
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

type WorkflowPolicyResponse = {
  requiresPlacementTest: boolean;
  requiresInterview: boolean;
  allowDirectAcceptance: boolean;
  source: 'default' | 'school_override';
  updatedAt: string | null;
};

jest.setTimeout(90000);

describe('Admissions workflow policy (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  const suffix = randomUUID().split('-')[0];
  const marker = `adm-workflow-policy-${suffix}`;

  let organizationId = '';
  let schoolAId = '';
  let schoolBId = '';

  let schoolAManageToken = '';
  let schoolAViewToken = '';
  let schoolANoPermissionToken = '';
  let schoolBManageToken = '';
  let applicantToken = '';

  const createdOrganizationIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdRoleIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdMembershipIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const organization = await prisma.organization.create({
      data: {
        slug: `${marker}-org`,
        name: `ADM Workflow Policy ${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    organizationId = organization.id;
    createdOrganizationIds.push(organizationId);

    const [schoolA, schoolB] = await Promise.all([
      prisma.school.create({
        data: {
          organizationId,
          slug: `${marker}-school-a`,
          name: `${marker} School A`,
          status: SchoolStatus.ACTIVE,
        },
        select: { id: true },
      }),
      prisma.school.create({
        data: {
          organizationId,
          slug: `${marker}-school-b`,
          name: `${marker} School B`,
          status: SchoolStatus.ACTIVE,
        },
        select: { id: true },
      }),
    ]);
    schoolAId = schoolA.id;
    schoolBId = schoolB.id;
    createdSchoolIds.push(schoolAId, schoolBId);

    const schoolAManageRoleId = await createRoleWithPermissions({
      schoolId: schoolAId,
      label: 'school-a-manage',
      permissionCodes: [
        'admissions.applications.view',
        'admissions.applications.manage',
      ],
    });
    const schoolAViewRoleId = await createRoleWithPermissions({
      schoolId: schoolAId,
      label: 'school-a-view',
      permissionCodes: ['admissions.applications.view'],
    });
    const schoolANoPermissionRoleId = await createRoleWithPermissions({
      schoolId: schoolAId,
      label: 'school-a-none',
      permissionCodes: [],
    });
    const schoolBManageRoleId = await createRoleWithPermissions({
      schoolId: schoolBId,
      label: 'school-b-manage',
      permissionCodes: [
        'admissions.applications.view',
        'admissions.applications.manage',
      ],
    });

    await createSchoolUser({
      label: 'school-a-manage',
      schoolId: schoolAId,
      roleId: schoolAManageRoleId,
    });
    await createSchoolUser({
      label: 'school-a-view',
      schoolId: schoolAId,
      roleId: schoolAViewRoleId,
    });
    await createSchoolUser({
      label: 'school-a-none',
      schoolId: schoolAId,
      roleId: schoolANoPermissionRoleId,
    });
    await createSchoolUser({
      label: 'school-b-manage',
      schoolId: schoolBId,
      roleId: schoolBManageRoleId,
    });
    await createApplicantUser();

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

    schoolAManageToken = await login(`${marker}-school-a-manage@example.test`);
    schoolAViewToken = await login(`${marker}-school-a-view@example.test`);
    schoolANoPermissionToken = await login(`${marker}-school-a-none@example.test`);
    schoolBManageToken = await login(`${marker}-school-b-manage@example.test`);
    applicantToken = await login(`${marker}-applicant@example.test`);
  });

  afterAll(async () => {
    try {
      await cleanupData();
      if (app) await app.close();
    } finally {
      if (prisma) await prisma.$disconnect();
    }
  });

  it('returns the default strict policy when no school override exists', async () => {
    const policy = await getPolicy(schoolAViewToken);

    expect(policy).toEqual({
      requiresPlacementTest: true,
      requiresInterview: true,
      allowDirectAcceptance: false,
      source: 'default',
      updatedAt: null,
    });
    expectNoPolicyLeaks(policy);
  });

  it('requires the expected admissions application permissions', async () => {
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/admissions/workflow-policy`)
      .expect(401);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/admissions/workflow-policy`)
      .set('Authorization', bearer(schoolANoPermissionToken))
      .expect(403);

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/admissions/workflow-policy`)
      .set('Authorization', bearer(schoolAViewToken))
      .send({ requiresPlacementTest: false })
      .expect(403);
  });

  it('denies applicant access to school-side policy routes', async () => {
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/admissions/workflow-policy`)
      .set('Authorization', bearer(applicantToken))
      .expect(403);

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/admissions/workflow-policy`)
      .set('Authorization', bearer(applicantToken))
      .send({ requiresPlacementTest: false })
      .expect(403);
  });

  it('creates a school override and writes a safe audit log', async () => {
    const response = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/admissions/workflow-policy`)
      .set('Authorization', bearer(schoolAManageToken))
      .send({
        requiresPlacementTest: false,
        allowDirectAcceptance: true,
      })
      .expect(200);

    expect(response.body).toEqual({
      requiresPlacementTest: false,
      requiresInterview: true,
      allowDirectAcceptance: true,
      source: 'school_override',
      updatedAt: expect.any(String),
    });
    expectNoPolicyLeaks(response.body);

    const audit = await prisma.auditLog.findFirst({
      where: {
        action: 'admissions.workflow_policy.update',
        schoolId: schoolAId,
      },
      orderBy: { createdAt: 'desc' },
    });

    expect(audit).toEqual(
      expect.objectContaining({
        module: 'admissions',
        action: 'admissions.workflow_policy.update',
        resourceType: 'admission_workflow_policy',
        schoolId: schoolAId,
        organizationId,
      }),
    );
    expect(audit?.before).toEqual(
      expect.objectContaining({
        requiresPlacementTest: true,
        requiresInterview: true,
        allowDirectAcceptance: false,
        source: 'default',
      }),
    );
    expect(audit?.after).toEqual(
      expect.objectContaining({
        requiresPlacementTest: false,
        requiresInterview: true,
        allowDirectAcceptance: true,
        source: 'school_override',
      }),
    );
  });

  it('returns school_override after PATCH and preserves omitted fields on partial update', async () => {
    const afterCreate = await getPolicy(schoolAManageToken);
    expect(afterCreate).toEqual({
      requiresPlacementTest: false,
      requiresInterview: true,
      allowDirectAcceptance: true,
      source: 'school_override',
      updatedAt: expect.any(String),
    });

    const response = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/admissions/workflow-policy`)
      .set('Authorization', bearer(schoolAManageToken))
      .send({ requiresInterview: false })
      .expect(200);

    expect(response.body).toEqual({
      requiresPlacementTest: false,
      requiresInterview: false,
      allowDirectAcceptance: true,
      source: 'school_override',
      updatedAt: expect.any(String),
    });
    expectNoPolicyLeaks(response.body);
  });

  it('rejects empty policy patches with validation.failed', async () => {
    const response = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/admissions/workflow-policy`)
      .set('Authorization', bearer(schoolAManageToken))
      .send({})
      .expect(400);

    expect(response.body?.error?.code).toBe('validation.failed');
    expect(response.body?.error?.details).toEqual({
      field: 'body',
      reason: 'at_least_one_policy_field_required',
    });
  });

  it('keeps school policy overrides scoped per school', async () => {
    const schoolBDefault = await getPolicy(schoolBManageToken);
    expect(schoolBDefault).toEqual({
      requiresPlacementTest: true,
      requiresInterview: true,
      allowDirectAcceptance: false,
      source: 'default',
      updatedAt: null,
    });

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/admissions/workflow-policy`)
      .set('Authorization', bearer(schoolBManageToken))
      .send({ requiresPlacementTest: false })
      .expect(200);

    const [schoolA, schoolB] = await Promise.all([
      getPolicy(schoolAManageToken),
      getPolicy(schoolBManageToken),
    ]);

    expect(schoolA).toEqual({
      requiresPlacementTest: false,
      requiresInterview: false,
      allowDirectAcceptance: true,
      source: 'school_override',
      updatedAt: expect.any(String),
    });
    expect(schoolB).toEqual({
      requiresPlacementTest: false,
      requiresInterview: true,
      allowDirectAcceptance: false,
      source: 'school_override',
      updatedAt: expect.any(String),
    });
  });

  async function getPolicy(accessToken: string): Promise<WorkflowPolicyResponse> {
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/admissions/workflow-policy`)
      .set('Authorization', bearer(accessToken))
      .expect(200);

    expect(Object.keys(response.body).sort()).toEqual(
      [
        'allowDirectAcceptance',
        'requiresInterview',
        'requiresPlacementTest',
        'source',
        'updatedAt',
      ].sort(),
    );

    return response.body;
  }

  function expectNoPolicyLeaks(policy: unknown): void {
    const serialized = JSON.stringify(policy);

    for (const forbidden of [
      'policyId',
      'schoolId',
      'organizationId',
      'createdAt',
      'membershipId',
      'roleId',
      'actorId',
      'audit',
      'deletedAt',
      'passwordHash',
      'userId',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  }

  async function createRoleWithPermissions(input: {
    schoolId: string;
    label: string;
    permissionCodes: string[];
  }): Promise<string> {
    const role = await prisma.role.create({
      data: {
        schoolId: input.schoolId,
        key: `${marker}-${input.label}`,
        name: `${marker} ${input.label}`,
        isSystem: false,
      },
      select: { id: true },
    });
    createdRoleIds.push(role.id);

    for (const permissionCode of input.permissionCodes) {
      const permission = await prisma.permission.findUnique({
        where: { code: permissionCode },
        select: { id: true },
      });
      if (!permission) {
        throw new Error(
          `Missing ${permissionCode} permission - run \`npm run seed\` first.`,
        );
      }

      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: permission.id },
      });
    }

    return role.id;
  }

  async function createSchoolUser(input: {
    label: string;
    schoolId: string;
    roleId: string;
  }): Promise<void> {
    const user = await prisma.user.create({
      data: {
        email: `${marker}-${input.label}@example.test`,
        firstName: 'ADM',
        lastName: input.label,
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
        passwordHash: await argon2.hash(PASSWORD, ARGON2_OPTIONS),
        passwordChangedAt: new Date(),
        credentialVersion: 1,
      },
      select: { id: true },
    });
    createdUserIds.push(user.id);

    const membership = await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId,
        schoolId: input.schoolId,
        roleId: input.roleId,
        userType: UserType.SCHOOL_USER,
        status: MembershipStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdMembershipIds.push(membership.id);
  }

  async function createApplicantUser(): Promise<void> {
    const user = await prisma.user.create({
      data: {
        email: `${marker}-applicant@example.test`,
        firstName: 'Applicant',
        lastName: 'WorkflowPolicy',
        userType: UserType.APPLICANT,
        status: UserStatus.ACTIVE,
        passwordHash: await argon2.hash(PASSWORD, ARGON2_OPTIONS),
        passwordChangedAt: new Date(),
        credentialVersion: 1,
      },
      select: { id: true },
    });
    createdUserIds.push(user.id);
  }

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password: PASSWORD })
      .expect(200);

    return response.body.accessToken;
  }

  function bearer(accessToken: string): string {
    return `Bearer ${accessToken}`;
  }

  async function cleanupData(): Promise<void> {
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { actorId: { in: createdUserIds } },
          { schoolId: { in: createdSchoolIds } },
        ],
      },
    });
    await prisma.admissionWorkflowPolicy.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.session.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.membership.deleteMany({
      where: { id: { in: createdMembershipIds } },
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
