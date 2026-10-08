import { AcademicContentAcknowledgementRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-acknowledgement.repository';
import { AcademicContentAcknowledgementService } from '../../src/modules/academics/academic-content/application/academic-content-acknowledgement.service';
import { ParentAcademicContentAcknowledgementUseCase } from '../../src/modules/parent-app/academic-content/application/parent-academic-content.use-cases';
import { ParentAcademicContentAcknowledgementController } from '../../src/modules/parent-app/academic-content/controller/parent-academic-content-acknowledgement.controller';
import { randomUUID } from 'node:crypto';
import { INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { configureHttpApplication } from '../../src/bootstrap/http-application';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../src/common/context/request-context';
import { JwtAuthGuard } from '../../src/common/guards/jwt-auth.guard';
import { ScopeResolverGuard } from '../../src/common/guards/scope-resolver.guard';
import { PermissionsGuard } from '../../src/common/guards/permissions.guard';
import { GlobalExceptionFilter } from '../../src/common/exceptions/global-exception.filter';
import { TokenService } from '../../src/modules/iam/auth/domain/token.service';
import { AuthRepository } from '../../src/modules/iam/auth/infrastructure/auth.repository';
import { AcademicContentEngagementService } from '../../src/modules/academics/academic-content/application/academic-content-engagement.service';
import { AcademicContentEngagementRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-engagement.repository';
import { AcademicContentEngagementExceptionFilter } from '../../src/modules/academics/academic-content/controller/academic-content-engagement-exception.filter';
import { StudentAppAccessService } from '../../src/modules/student-app/access/student-app-access.service';
import { StudentAppStudentReadAdapter } from '../../src/modules/student-app/access/student-app-student-read.adapter';
import { ParentAppAccessService } from '../../src/modules/parent-app/access/parent-app-access.service';
import { ParentAppGuardianReadAdapter } from '../../src/modules/parent-app/access/parent-app-guardian-read.adapter';
import { RecordStudentAcademicContentEngagementUseCase } from '../../src/modules/student-app/academic-content/application/student-academic-content.use-cases';
import { RecordParentAcademicContentEngagementUseCase } from '../../src/modules/parent-app/academic-content/application/parent-academic-content.use-cases';
import { StudentAcademicContentEngagementController } from '../../src/modules/student-app/academic-content/controller/student-academic-content-engagement.controller';
import { ParentAcademicContentEngagementController } from '../../src/modules/parent-app/academic-content/controller/parent-academic-content-engagement.controller';
import { AcademicContentAcknowledgementFixture } from '../fixtures/academic-content-acknowledgement.fixture';

describe('ACC-11C HTTP with real JWT/session/scope/permission guards and PostgreSQL', () => {
  jest.setTimeout(120_000);
  const prisma = new PrismaService(),
    fixture = new AcademicContentAcknowledgementFixture(prisma);
  let app: INestApplication,
    studentToken: string,
    parentToken: string,
    otherParentToken: string,
    rejectedActorTokens: string[],
    source: Awaited<ReturnType<typeof fixture.publication>>;
  const studentUrl = () =>
    `/api/v1/student/academic-content/${source.content.id}/engagement-events`;
  const parentUrl = (child = 0) =>
    `/api/v1/parent/children/${fixture.children[child].studentId}/academic-content/${source.content.id}/engagement-events`;
  const body = () => ({
    clientRequestId: randomUUID(),
    eventType: 'CONTENT_VIEWED',
    expectedPublicationId: source.publication.id,
  });
  const post = (
    url = studentUrl(),
    token = studentToken,
    value: object = body(),
  ) =>
    request(app.getHttpServer() as import('node:http').Server)
      .post(url)
      .set('Authorization', `Bearer ${token}`)
      .send(value);
  const privateResponse = (response: request.Response) => {
    expect(response.headers['cache-control']).toBe(
      'no-store, private, max-age=0',
    );
    expect(JSON.stringify(response.body)).not.toMatch(
      /private-join|private-link|private\.pdf|private-fixture/,
    );
  };
  beforeAll(async () => {
    await prisma.$connect();
    await fixture.create();
    source = await fixture.note();
    const config = new ConfigService({
      JWT_ACCESS_SECRET: 'acc11c-local-test-access-secret-32-characters',
      JWT_REFRESH_SECRET: 'acc11c-local-test-refresh-secret-32-characters',
      JWT_ACCESS_TTL: '15m',
      JWT_REFRESH_TTL: '7d',
    });
    const module = await Test.createTestingModule({
      controllers: [
        ParentAcademicContentAcknowledgementController,
        StudentAcademicContentEngagementController,
        ParentAcademicContentEngagementController,
      ],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        JwtService,
        TokenService,
        AuthRepository,
        AcademicContentAcknowledgementRepository,
        AcademicContentAcknowledgementService,
        ParentAcademicContentAcknowledgementUseCase,
        AcademicContentEngagementRepository,
        AcademicContentEngagementService,
        AcademicContentEngagementExceptionFilter,
        StudentAppAccessService,
        StudentAppStudentReadAdapter,
        ParentAppAccessService,
        ParentAppGuardianReadAdapter,
        RecordStudentAcademicContentEngagementUseCase,
        RecordParentAcademicContentEngagementUseCase,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: ScopeResolverGuard },
        { provide: APP_GUARD, useClass: PermissionsGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use((_req: Request, _res: Response, next: NextFunction) =>
      runWithRequestContext(createRequestContext(), next),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    configureHttpApplication(app, {
      environment: 'test',
      corsOrigins: undefined,
      swaggerEnabled: false,
    });
    await app.init();
    const tokens = app.get(TokenService);
    const issue = async (id: string, kind: string) => {
      const pair = await tokens.issueTokens(id, kind);
      await prisma.session.create({
        data: {
          id: pair.refreshSessionId,
          userId: id,
          refreshTokenHash: pair.refreshTokenHash,
          expiresAt: pair.refreshExpiresAt,
        },
      });
      return pair.accessToken;
    };
    studentToken = await issue(fixture.children[0].userId, 'STUDENT');
    parentToken = await issue(fixture.parentId, 'PARENT');
    otherParentToken = await issue(fixture.foreignParentId, 'PARENT');
    rejectedActorTokens = [];
    for (const userType of ['TEACHER', 'SCHOOL_USER', 'APPLICANT'] as const) {
      const id = randomUUID();
      fixture.users.push(id);
      await prisma.user.create({
        data: {
          id,
          userType,
          email: `${id}@acc11c.test`,
          firstName: 'Rejected',
          lastName: 'Actor',
        },
      });
      if (userType !== 'APPLICANT')
        await prisma.membership.create({
          data: {
            userId: id,
            userType,
            schoolId: fixture.school.schoolId,
            organizationId: fixture.school.organizationId,
            roleId: fixture.parentRoleId,
          },
        });
      rejectedActorTokens.push(await issue(id, userType));
    }
  });
  beforeEach(async () => {
    await fixture.resetAdmission();
    await prisma.academicContentAcknowledgement.deleteMany({
      where: { schoolId: fixture.school.schoolId },
    });
  });
  afterAll(async () => {
    try {
      if (app) await app.close();
      await fixture.dispose();
    } finally {
      await prisma.$disconnect();
    }
  });

  const ackUrl = (child = 0) =>
    parentUrl(child).replace('engagement-events', 'acknowledgement');
  const acknowledge = (
    value: object = { expectedPublicationId: source.publication.id },
    token = parentToken,
    url = ackUrl(),
  ) => post(url, token, value);
  const status = (
    query: object = { expectedPublicationId: source.publication.id },
    token = parentToken,
    child = 0,
  ) =>
    request(app.getHttpServer() as import('node:http').Server)
      .get(ackUrl(child))
      .set('Authorization', `Bearer ${token}`)
      .query(query);

  it('returns read-only PENDING, bounded ACKNOWLEDGED, and stable original time across POST/GET retries', async () => {
    const pending = await status().expect(200);
    privateResponse(pending);
    expect(pending.body as unknown).toMatchObject({
      status: 'PENDING',
      acknowledgementId: null,
      acknowledgedAt: null,
    });
    const first = await acknowledge().expect(200),
      repeat = await acknowledge().expect(200),
      read = await status().expect(200);
    for (const response of [first, repeat, read]) privateResponse(response);
    expect(read.body).toEqual(first.body);
    expect(repeat.body).toEqual(first.body);
    expect(Object.keys(first.body as object).sort()).toEqual([
      'acknowledgedAt',
      'acknowledgementId',
      'publicationId',
      'requiresAcknowledgement',
      'revisionId',
      'status',
    ]);
    expect(first.body as unknown).toMatchObject({
      status: 'ACKNOWLEDGED',
      requiresAcknowledgement: true,
    });
  });

  it('returns NOT_REQUIRED through HTTP without a placeholder and denies its POST', async () => {
    const original = source;
    source = await fixture.note(false);
    try {
      const response = await status().expect(200);
      privateResponse(response);
      expect(response.body as unknown).toMatchObject({
        status: 'NOT_REQUIRED',
        requiresAcknowledgement: false,
        acknowledgementId: null,
        acknowledgedAt: null,
      });
      privateResponse(await acknowledge().expect(404));
      expect(
        await prisma.academicContentAcknowledgement.count({
          where: { schoolId: fixture.school.schoolId },
        }),
      ).toBe(0);
    } finally {
      source = original;
    }
  });

  it('enforces JWT, live sessions, Parent boundary, view permission and exact owned child on both routes', async () => {
    privateResponse(
      await request(app.getHttpServer() as import('node:http').Server)
        .get(ackUrl())
        .query({ expectedPublicationId: source.publication.id })
        .expect(401),
    );
    privateResponse(
      await request(app.getHttpServer() as import('node:http').Server)
        .post(ackUrl())
        .send({ expectedPublicationId: source.publication.id })
        .expect(401),
    );
    privateResponse(await status(undefined, studentToken).expect(403));
    privateResponse(await acknowledge(undefined, studentToken).expect(403));
    for (const token of rejectedActorTokens) {
      privateResponse(await status(undefined, token).expect(403));
      privateResponse(await acknowledge(undefined, token).expect(403));
    }
    privateResponse(await status(undefined, parentToken, 2).expect(404));
    privateResponse(
      await acknowledge(undefined, parentToken, ackUrl(2)).expect(404),
    );
    const permission = await prisma.permission.findUniqueOrThrow({
      where: { code: 'academics.academic_content.view' },
    });
    await prisma.rolePermission.deleteMany({
      where: { roleId: fixture.parentRoleId },
    });
    try {
      privateResponse(await status().expect(403));
      privateResponse(await acknowledge().expect(403));
    } finally {
      await prisma.rolePermission.create({
        data: { roleId: fixture.parentRoleId, permissionId: permission.id },
      });
    }
    await prisma.session.updateMany({
      where: { userId: fixture.parentId },
      data: { revokedAt: new Date() },
    });
    try {
      privateResponse(await status().expect(401));
      privateResponse(await acknowledge().expect(401));
    } finally {
      await prisma.session.updateMany({
        where: { userId: fixture.parentId },
        data: { revokedAt: null },
      });
    }
  });

  it('isolates live child and Parent acknowledgement state and denies historical retry after unlink', async () => {
    const first = await acknowledge().expect(200);
    expect(
      (await status(undefined, otherParentToken).expect(200)).body as unknown,
    ).toMatchObject({ status: 'PENDING', acknowledgementId: null });
    expect(
      (await status(undefined, parentToken, 1).expect(200)).body as unknown,
    ).toMatchObject({ status: 'PENDING', acknowledgementId: null });
    privateResponse(await status(undefined, otherParentToken, 1).expect(404));
    privateResponse(
      await acknowledge(undefined, otherParentToken, ackUrl(1)).expect(404),
    );
    await prisma.studentGuardian.deleteMany({
      where: {
        schoolId: fixture.school.schoolId,
        studentId: fixture.children[0].studentId,
        guardianId: { in: fixture.guardianIds },
      },
    });
    try {
      privateResponse(await status().expect(404));
      privateResponse(await acknowledge().expect(404));
      const row = await prisma.academicContentAcknowledgement.findUniqueOrThrow(
        {
          where: {
            id: (first.body as { acknowledgementId: string }).acknowledgementId,
          },
        },
      );
      expect(row.acknowledgedAt.toISOString()).toBe(
        (first.body as { acknowledgedAt: string }).acknowledgedAt,
      );
    } finally {
      await prisma.studentGuardian.createMany({
        data: fixture.guardianIds.map((guardianId) => ({
          schoolId: fixture.school.schoolId,
          studentId: fixture.children[0].studentId,
          guardianId,
        })),
      });
    }
  });

  it.each([
    'schoolId',
    'actorUserId',
    'guardianId',
    'enrollmentId',
    'revisionId',
    'acknowledgedAt',
    'status',
    'requestFingerprint',
    'notificationId',
    'unexpected',
  ])('rejects extra %s in body, GET query and POST query', async (field) => {
    privateResponse(
      await acknowledge({
        expectedPublicationId: source.publication.id,
        [field]: randomUUID(),
      }).expect(400),
    );
    privateResponse(
      await status({
        expectedPublicationId: source.publication.id,
        [field]: randomUUID(),
      }).expect(400),
    );
    privateResponse(
      await acknowledge()
        .query({ [field]: randomUUID() })
        .expect(400),
    );
  });
  it('rejects missing, null, malformed and repeated preconditions and malformed path UUIDs', async () => {
    for (const value of [
      {},
      { expectedPublicationId: null },
      { expectedPublicationId: 'invalid' },
      { expectedPublicationId: [source.publication.id, source.publication.id] },
    ]) {
      privateResponse(await acknowledge(value).expect(400));
      privateResponse(await status(value).expect(400));
    }
    privateResponse(
      await acknowledge(
        undefined,
        parentToken,
        ackUrl().replace(source.content.id, 'invalid'),
      ).expect(400),
    );
    privateResponse(
      await status({ expectedPublicationId: randomUUID() }).expect(404),
    );
    privateResponse(
      await acknowledge({ expectedPublicationId: randomUUID() }).expect(404),
    );
  });
  it('uses one shared engagement/acknowledgement School/actor budget and preserves GET at saturation', async () => {
    await prisma.academicContentEngagementAdmission.create({
      data: {
        schoolId: fixture.school.schoolId,
        actorUserId: fixture.parentId,
        windowStartedAt: new Date(),
        requestCount: 58,
      },
    });
    privateResponse(await acknowledge().expect(200));
    privateResponse(await post(parentUrl(), parentToken).expect(200));
    for (const response of [
      await acknowledge().expect(429),
      await post(parentUrl(), parentToken).expect(429),
    ]) {
      privateResponse(response);
      expect(response.headers['retry-after']).toBe('60');
      expect(response.body as unknown).toMatchObject({
        error: { code: 'rate_limit.exceeded' },
      });
    }
    privateResponse(await status().expect(200));
    expect(
      (
        await prisma.academicContentEngagementAdmission.findUniqueOrThrow({
          where: {
            schoolId_actorUserId: {
              schoolId: fixture.school.schoolId,
              actorUserId: fixture.parentId,
            },
          },
        })
      ).requestCount,
    ).toBe(60);
  });

  it('resolves a changed current Enrollment through the actual Parent ownership service without rewriting history', async () => {
    const first = await acknowledge().expect(200);
    const row = await prisma.academicContentAcknowledgement.findUniqueOrThrow({
      where: {
        id: (first.body as { acknowledgementId: string }).acknowledgementId,
      },
    });
    await prisma.enrollment.update({
      where: { id: fixture.children[0].enrollmentId },
      data: { status: 'WITHDRAWN' },
    });
    const current = await prisma.enrollment.create({
      data: {
        schoolId: fixture.school.schoolId,
        studentId: fixture.children[0].studentId,
        academicYearId: fixture.school.yearId,
        termId: fixture.school.termId,
        classroomId: fixture.school.classroomId,
        enrolledAt: new Date(),
      },
    });
    try {
      expect((await acknowledge().expect(200)).body).toEqual(first.body);
      expect((await status().expect(200)).body).toEqual(first.body);
      expect(
        await prisma.academicContentAcknowledgement.findUniqueOrThrow({
          where: { id: row.id },
        }),
      ).toEqual(row);
    } finally {
      await prisma.enrollment.delete({ where: { id: current.id } });
      await prisma.enrollment.update({
        where: { id: fixture.children[0].enrollmentId },
        data: { status: 'ACTIVE' },
      });
    }
  });
  it.each([
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ])(
    'sanitizes database failure to private 503 (write=%s, ownership=%s)',
    async (write, ownership) => {
      const repository = app.get(AcademicContentAcknowledgementRepository);
      const failure = (
        ownership
          ? jest.spyOn(
              app.get(ParentAppAccessService),
              'getOwnedStudentContext',
            )
          : jest.spyOn(repository, 'resolve')
      ).mockRejectedValueOnce(
        new Error(
          'SELECT private-note-body guardian-phone postgresql://credentials@foreign/secret',
        ),
      );
      const logger = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      try {
        const response = await (write ? acknowledge() : status()).expect(503);
        privateResponse(response);
        expect(response.body as unknown).toMatchObject({
          error: { code: 'service_unavailable' },
        });
        expect(JSON.stringify(response.body)).not.toMatch(
          /private-note|guardian-phone|postgresql|SELECT/,
        );
        expect(JSON.stringify(logger.mock.calls)).not.toMatch(
          /private-note|guardian-phone|postgresql|SELECT/,
        );
      } finally {
        failure.mockRestore();
        logger.mockRestore();
      }
    },
  );
});
