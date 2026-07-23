import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
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
import { BullmqService } from '../../src/infrastructure/queue/bullmq.service';
import { PrismaLearningMediaUnitOfWork } from '../../src/modules/files/uploads/infrastructure/prisma-learning-media.unit-of-work';
import { REQUIRED_PERMISSIONS_METADATA } from '../../src/common/decorators/required-permissions.decorator';
import { SCHOOL_MANAGEMENT_ONLY_METADATA } from '../../src/common/decorators/school-management-only.decorator';
import { LearningMediaController } from '../../src/modules/academics/curriculum/controller/learning-media.controller';

const PASSWORD = 'LearningMediaSecurity123!';
const GLOBAL_PREFIX = '/api/v1';
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

type TokenMap = Record<string, string>;
type UploadIntentBody = {
  id: string;
  status: string;
  uploadUrl: string;
  uploadUrlExpiresAt: string;
};
type ErrorBody = {
  error: {
    code: string;
    details?: { reasonCode?: string; retryable?: boolean };
  };
};

jest.setTimeout(180_000);

describe('Academics learning media production authorization matrix', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let transactionSpy: jest.SpiedFunction<
    PrismaLearningMediaUnitOfWork['execute']
  >;
  const suffix = randomUUID().slice(0, 8);
  const organizations: string[] = [];
  const schools: string[] = [];
  const users: string[] = [];
  const roles: string[] = [];
  const emails: Record<string, string> = {};
  const tokens: TokenMap = {};
  const ids = {
    organizationA: '',
    organizationB: '',
    schoolA: '',
    schoolB: '',
  };

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    const schoolAdmin = await prisma.role.findFirst({
      where: { key: 'school_admin', schoolId: null, isSystem: true },
      select: { id: true },
    });
    const permissions = await prisma.permission.findMany({
      where: {
        code: {
          in: ['academics.curriculum.manage', 'files.uploads.manage'],
        },
      },
      select: { id: true, code: true },
    });
    if (!schoolAdmin || permissions.length !== 2) {
      throw new Error('Learning media security seed contracts are required');
    }
    const curriculumPermissionId = permissions.find(
      (permission) => permission.code === 'academics.curriculum.manage',
    )!.id;
    const uploadPermissionId = permissions.find(
      (permission) => permission.code === 'files.uploads.manage',
    )!.id;

    ids.organizationA = await createOrganization('a');
    ids.organizationB = await createOrganization('b');
    ids.schoolA = await createSchool(ids.organizationA, 'a');
    ids.schoolB = await createSchool(ids.organizationB, 'b');
    const bothRole = await createRole('both', ids.schoolA, [
      curriculumPermissionId,
      uploadPermissionId,
    ]);
    const onlyCurriculumRole = await createRole(
      'only-curriculum',
      ids.schoolA,
      [curriculumPermissionId],
    );
    const onlyUploadsRole = await createRole('only-uploads', ids.schoolA, [
      uploadPermissionId,
    ]);

    await createActor('schoolAdmin', UserType.SCHOOL_USER, schoolAdmin.id, {
      organizationId: ids.organizationA,
      schoolId: ids.schoolA,
    });
    await createActor(
      'organizationAdmin',
      UserType.ORGANIZATION_USER,
      schoolAdmin.id,
      { organizationId: ids.organizationA, schoolId: ids.schoolA },
    );
    await createActor('customSchool', UserType.SCHOOL_USER, bothRole, {
      organizationId: ids.organizationA,
      schoolId: ids.schoolA,
    });
    await createActor(
      'customOrganization',
      UserType.ORGANIZATION_USER,
      bothRole,
      { organizationId: ids.organizationA, schoolId: ids.schoolA },
    );
    await createActor('secondManager', UserType.SCHOOL_USER, bothRole, {
      organizationId: ids.organizationA,
      schoolId: ids.schoolA,
    });
    await createActor(
      'missingCurriculum',
      UserType.SCHOOL_USER,
      onlyUploadsRole,
      { organizationId: ids.organizationA, schoolId: ids.schoolA },
    );
    await createActor(
      'missingUploads',
      UserType.SCHOOL_USER,
      onlyCurriculumRole,
      {
        organizationId: ids.organizationA,
        schoolId: ids.schoolA,
      },
    );
    for (const [label, userType] of [
      ['teacher', UserType.TEACHER],
      ['student', UserType.STUDENT],
      ['parent', UserType.PARENT],
      ['applicant', UserType.APPLICANT],
    ] as const) {
      await createActor(label, userType, bothRole, {
        organizationId: ids.organizationA,
        schoolId: ids.schoolA,
      });
    }
    await createActor('foreignAdmin', UserType.SCHOOL_USER, schoolAdmin.id, {
      organizationId: ids.organizationB,
      schoolId: ids.schoolB,
    });
    await createActor('platform', UserType.PLATFORM_USER, null, null);

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(BullmqService)
      .useValue({
        createWorker: jest.fn().mockReturnValue({ on: jest.fn() }),
        addJob: jest.fn().mockResolvedValue(undefined),
        getQueue: jest.fn(),
        getQueueReadiness: jest.fn().mockResolvedValue({
          name: 'test',
          status: 'ok',
          counts: { waiting: 0, active: 0, delayed: 0, failed: 0 },
        }),
        ping: jest.fn().mockResolvedValue(undefined),
      })
      .compile();
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
    for (const label of Object.keys(emails)) {
      tokens[label] = await login(emails[label]);
    }
    transactionSpy = jest.spyOn(
      PrismaLearningMediaUnitOfWork.prototype,
      'execute',
    );
  });

  afterAll(async () => {
    try {
      transactionSpy?.mockRestore();
      if (app) await app.close();
      await prisma.session.deleteMany({ where: { userId: { in: users } } });
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { organizationId: { in: organizations } },
            { schoolId: { in: schools } },
            { actorId: { in: users } },
          ],
        },
      });
      await prisma.fileUploadSession.deleteMany({
        where: { schoolId: { in: schools } },
      });
      await prisma.membership.deleteMany({ where: { userId: { in: users } } });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
      await prisma.rolePermission.deleteMany({
        where: { roleId: { in: roles } },
      });
      await prisma.role.deleteMany({ where: { id: { in: roles } } });
      await prisma.school.deleteMany({ where: { id: { in: schools } } });
      await prisma.organization.deleteMany({
        where: { id: { in: organizations } },
      });
    } finally {
      if (prisma) await prisma.$disconnect();
    }
  });

  it.each([
    'schoolAdmin',
    'organizationAdmin',
    'customSchool',
    'customOrganization',
  ])('allows the production management path for %s', async (label) => {
    const response = await createIntent(label).expect(201);
    const body = response.body as UploadIntentBody;
    expect(typeof body.id).toBe('string');
    expect(body.status).toBe('UPLOADING');
    expect(typeof body.uploadUrl).toBe('string');
    expect(typeof body.uploadUrlExpiresAt).toBe('string');
    expect(Object.keys(body)).not.toEqual(
      expect.arrayContaining([
        'stagingBucket',
        'stagingObjectKey',
        'finalBucket',
        'finalObjectKey',
      ]),
    );
  });

  it('retains the management-only, dual-permission route metadata contract', () => {
    expect(Reflect.getMetadata(PATH_METADATA, LearningMediaController)).toBe(
      'academics/learning-media/uploads',
    );
    expect(
      Reflect.getMetadata(
        SCHOOL_MANAGEMENT_ONLY_METADATA,
        LearningMediaController,
      ),
    ).toBe(true);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_METADATA,
        LearningMediaController,
      ),
    ).toEqual(['academics.curriculum.manage', 'files.uploads.manage']);
  });

  it.each(['missingCurriculum', 'missingUploads'])(
    'requires both permissions for %s',
    async (label) => {
      const transactionCalls = transactionSpy.mock.calls.length;
      const before = await prisma.fileUploadSession.count({
        where: { schoolId: ids.schoolA },
      });
      const response = await createIntent(label).expect(403);
      const body = response.body as ErrorBody;
      expect(body.error.code).toBe('auth.scope.missing');
      expectSafeError(body);
      expect(transactionSpy).toHaveBeenCalledTimes(transactionCalls);
      expect(
        await prisma.fileUploadSession.count({
          where: { schoolId: ids.schoolA },
        }),
      ).toBe(before);
    },
  );

  it.each(['teacher', 'student', 'parent', 'applicant', 'platform'])(
    'denies %s before a production repository transaction',
    async (label) => {
      const transactionCalls = transactionSpy.mock.calls.length;
      const before = await prisma.fileUploadSession.count({
        where: { schoolId: ids.schoolA },
      });
      const response = await createIntent(label).expect(403);
      expectSafeError(response.body);
      expect(transactionSpy).toHaveBeenCalledTimes(transactionCalls);
      expect(
        await prisma.fileUploadSession.count({
          where: { schoolId: ids.schoolA },
        }),
      ).toBe(before);
    },
  );

  it('hides a foreign-School session behind the same safe lifecycle conflict', async () => {
    const foreign = await createIntent('foreignAdmin').expect(201);
    const foreignBody = foreign.body as UploadIntentBody;
    const response = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/academics/learning-media/uploads/${foreignBody.id}/complete`,
      )
      .set('Authorization', bearer('schoolAdmin'))
      .send({})
      .expect(409);
    const body = response.body as ErrorBody;
    expect(body.error).toMatchObject({
      code: 'learning.media.upload_conflict',
      details: { reasonCode: 'session_unavailable', retryable: false },
    });
    expectSafeError(body);
  });

  it('hides an owned session from another same-School manager', async () => {
    const owned = await createIntent('schoolAdmin').expect(201);
    const ownedBody = owned.body as UploadIntentBody;
    const response = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/academics/learning-media/uploads/${ownedBody.id}/cancel`,
      )
      .set('Authorization', bearer('secondManager'))
      .send({})
      .expect(409);
    const body = response.body as ErrorBody;
    expect(body.error).toMatchObject({
      code: 'learning.media.upload_conflict',
      details: { reasonCode: 'session_not_cancellable', retryable: false },
    });
    expectSafeError(body);
  });

  function createIntent(label: string) {
    return request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/learning-media/uploads`)
      .set('Authorization', bearer(label))
      .send({
        clientRequestId: randomUUID(),
        originalName: 'security.txt',
        expectedMimeType: 'text/plain',
        expectedSizeBytes: '12',
      });
  }

  function bearer(label: string): string {
    return `Bearer ${tokens[label]}`;
  }

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password: PASSWORD })
      .expect(200);
    return (response.body as { accessToken: string }).accessToken;
  }

  async function createOrganization(label: string): Promise<string> {
    const organization = await prisma.organization.create({
      data: {
        name: `Media Security Org ${label} ${suffix}`,
        slug: `media-security-org-${label}-${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
    });
    organizations.push(organization.id);
    return organization.id;
  }

  async function createSchool(
    organizationId: string,
    label: string,
  ): Promise<string> {
    const school = await prisma.school.create({
      data: {
        organizationId,
        name: `Media Security School ${label} ${suffix}`,
        slug: `media-security-school-${label}-${suffix}`,
        status: SchoolStatus.ACTIVE,
      },
    });
    schools.push(school.id);
    return school.id;
  }

  async function createRole(
    label: string,
    schoolId: string,
    permissionIds: string[],
  ): Promise<string> {
    const role = await prisma.role.create({
      data: {
        schoolId,
        key: `media-${label}-${suffix}`,
        name: `Media ${label} ${suffix}`,
        isSystem: false,
      },
    });
    roles.push(role.id);
    await prisma.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({
        roleId: role.id,
        permissionId,
      })),
    });
    return role.id;
  }

  async function createActor(
    label: string,
    userType: UserType,
    roleId: string | null,
    membership: { organizationId: string; schoolId: string } | null,
  ): Promise<void> {
    const email = `media-security-${label.toLowerCase()}-${suffix}@example.test`;
    emails[label] = email;
    const user = await prisma.user.create({
      data: {
        email,
        firstName: label,
        lastName: 'MediaSecurity',
        userType,
        status: UserStatus.ACTIVE,
        passwordHash: await argon2.hash(PASSWORD, ARGON2_OPTIONS),
      },
    });
    users.push(user.id);
    if (roleId && membership) {
      await prisma.membership.create({
        data: {
          userId: user.id,
          organizationId: membership.organizationId,
          schoolId: membership.schoolId,
          roleId,
          userType,
          status: MembershipStatus.ACTIVE,
        },
      });
    }
  }

  function expectSafeError(body: unknown): void {
    const serialized = JSON.stringify(body);
    for (const forbidden of [
      ids.organizationA,
      ids.organizationB,
      ids.schoolA,
      ids.schoolB,
      'stagingBucket',
      'stagingObjectKey',
      'finalBucket',
      'finalObjectKey',
      'originalName',
      'checksumSha256',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  }
});
