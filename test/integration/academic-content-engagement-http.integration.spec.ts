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
import { AcademicContentEngagementFixture } from '../fixtures/academic-content-engagement.fixture';

describe('ACC-11B HTTP with real JWT/session/scope/permission guards and PostgreSQL', () => {
  jest.setTimeout(120_000);
  const prisma = new PrismaService(),
    fixture = new AcademicContentEngagementFixture(prisma);
  let app: INestApplication,
    studentToken: string,
    parentToken: string,
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
    source = await fixture.publication();
    const config = new ConfigService({
      JWT_ACCESS_SECRET: 'acc11b-local-test-access-secret-32-characters',
      JWT_REFRESH_SECRET: 'acc11b-local-test-refresh-secret-32-characters',
      JWT_ACCESS_TTL: '15m',
      JWT_REFRESH_TTL: '7d',
    });
    const module = await Test.createTestingModule({
      controllers: [
        StudentAcademicContentEngagementController,
        ParentAcademicContentEngagementController,
      ],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        JwtService,
        TokenService,
        AuthRepository,
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
  });
  beforeEach(async () => fixture.resetAdmission());
  afterAll(async () => {
    try {
      if (app) await app.close();
      await fixture.dispose();
    } finally {
      await prisma.$disconnect();
    }
  });
  it('returns bounded 200 and identical durable retry on both authorized routes', async () => {
    for (const [url, token] of [
      [studentUrl(), studentToken],
      [parentUrl(), parentToken],
    ]) {
      const command = body(),
        first = await post(url, token, command).expect(200),
        retry = await post(url, token, command).expect(200);
      privateResponse(first);
      privateResponse(retry);
      expect(retry.body).toEqual(first.body);
      expect(Object.keys(first.body as object).sort()).toEqual([
        'eventId',
        'eventType',
        'publicationId',
        'recordedAt',
        'revisionId',
      ]);
    }
  });
  it('enforces real authentication, sessions, view permission, app actor type and exact child ownership', async () => {
    privateResponse(
      await request(app.getHttpServer() as import('node:http').Server)
        .post(studentUrl())
        .send(body())
        .expect(401),
    );
    privateResponse(await post(studentUrl(), parentToken).expect(403));
    privateResponse(await post(parentUrl(), studentToken).expect(403));
    privateResponse(await post(parentUrl(2), parentToken).expect(404));
    const permission = await prisma.permission.findUniqueOrThrow({
      where: { code: 'academics.academic_content.view' },
    });
    await prisma.rolePermission.deleteMany({
      where: { roleId: fixture.children[0].roleId },
    });
    try {
      privateResponse(await post().expect(403));
    } finally {
      await prisma.rolePermission.create({
        data: {
          roleId: fixture.children[0].roleId,
          permissionId: permission.id,
        },
      });
    }
    await prisma.session.updateMany({
      where: { userId: fixture.children[0].userId },
      data: { revokedAt: new Date() },
    });
    try {
      privateResponse(await post().expect(401));
    } finally {
      await prisma.session.updateMany({
        where: { userId: fixture.children[0].userId },
        data: { revokedAt: null },
      });
    }
  });
  it.each([
    'schoolId',
    'actorUserId',
    'guardianId',
    'enrollmentId',
    'revisionId',
    'recordedAt',
    'url',
    'objectKey',
    'permissions',
  ])(
    'rejects client-supplied %s through strict HTTP DTO validation',
    async (field) => {
      privateResponse(
        await post(studentUrl(), studentToken, {
          ...body(),
          [field]: 'untrusted',
        }).expect(400),
      );
    },
  );
  it('rejects missing publication precondition, malformed UUID, null optional references and incompatible shapes', async () => {
    const command = body();
    for (const value of [
      {
        clientRequestId: command.clientRequestId,
        eventType: command.eventType,
      },
      { ...command, expectedPublicationId: 'invalid' },
      { ...command, fileId: null },
      { ...command, revisionLinkId: null },
      { ...command, fileId: source.file.id },
    ])
      privateResponse(
        await post(studentUrl(), studentToken, value).expect(400),
      );
    privateResponse(
      await post(studentUrl(), studentToken, {
        ...command,
        expectedPublicationId: randomUUID(),
      }).expect(404),
    );
  });
  it('returns stable 409 for contradictory request reuse and reauthorizes before historical retry', async () => {
    const command = body();
    await post(studentUrl(), studentToken, command).expect(200);
    const conflict = await post(studentUrl(), studentToken, {
      ...command,
      eventType: 'LINK_CLICKED',
      revisionLinkId: source.link.id,
    }).expect(409);
    privateResponse(conflict);
    expect(conflict.body as unknown).toMatchObject({
      error: { code: 'academic_content.engagement.idempotency_conflict' },
    });
    await prisma.enrollment.update({
      where: { id: fixture.children[0].enrollmentId },
      data: { deletedAt: new Date() },
    });
    try {
      privateResponse(
        await post(studentUrl(), studentToken, command).expect(404),
      );
    } finally {
      await prisma.enrollment.update({
        where: { id: fixture.children[0].enrollmentId },
        data: { deletedAt: null },
      });
    }
  });
  it('returns distributed 429 with conservative Retry-After and unchanged event count', async () => {
    await prisma.academicContentEngagementAdmission.create({
      data: {
        schoolId: fixture.school.schoolId,
        actorUserId: fixture.children[0].userId,
        windowStartedAt: new Date(),
        requestCount: 60,
      },
    });
    const before = await prisma.academicContentEngagementEvent.count({
      where: { schoolId: fixture.school.schoolId },
    });
    const response = await post().expect(429);
    privateResponse(response);
    expect(response.headers['retry-after']).toBe('60');
    expect(response.body as unknown).toMatchObject({
      error: { code: 'rate_limit.exceeded' },
    });
    expect(
      await prisma.academicContentEngagementEvent.count({
        where: { schoolId: fixture.school.schoolId },
      }),
    ).toBe(before);
  });
  it('fails closed with sanitized 503 and no PII/SQL/storage URLs in error logs', async () => {
    const repository = app.get(AcademicContentEngagementRepository);
    const failure = jest
      .spyOn(repository, 'admit')
      .mockRejectedValueOnce(
        new Error(
          'SQL private-fixture private.pdf https://example.test/private-join guardian-phone',
        ),
      );
    const logger = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    try {
      const response = await post().expect(503);
      privateResponse(response);
      expect(JSON.stringify(logger.mock.calls)).not.toMatch(
        /private-fixture|private\.pdf|private-join|guardian-phone|SELECT|INSERT/,
      );
      expect(response.body as unknown).toMatchObject({
        error: { code: 'service_unavailable' },
      });
    } finally {
      failure.mockRestore();
      logger.mockRestore();
    }
  });
});
