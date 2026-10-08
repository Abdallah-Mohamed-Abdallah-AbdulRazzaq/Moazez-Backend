import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
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
import { AcademicContentTeacherAnalyticsRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-teacher-analytics.repository';
import { AcademicContentEngagementExceptionFilter } from '../../src/modules/academics/academic-content/controller/academic-content-engagement-exception.filter';
import { TeacherAppAccessService } from '../../src/modules/teacher-app/access/teacher-app-access.service';
import { TeacherAppAllocationReadAdapter } from '../../src/modules/teacher-app/access/teacher-app-allocation-read.adapter';
import { TeacherAcademicContentAnalyticsUseCase } from '../../src/modules/teacher-app/academic-content/application/teacher-academic-content-analytics.use-case';
import { TeacherAcademicContentAnalyticsController } from '../../src/modules/teacher-app/academic-content/controller/teacher-academic-content-analytics.controller';
import {
  AcademicContentTeacherAnalyticsFixture,
  type AnalyticsSource,
} from '../fixtures/academic-content-teacher-analytics.fixture';
import { assertDisposablePostgresTarget } from '../helpers/disposable-postgres-target';

describe('ACC-11D HTTP through real JWT/session/scope/permission guards', () => {
  jest.setTimeout(120_000);
  const prisma = new PrismaService(),
    fixture = new AcademicContentTeacherAnalyticsFixture(prisma);
  let app: INestApplication, token: string, source: AnalyticsSource;
  const rejected: string[] = [];
  const get = (
    url = `/api/v1/teacher/academic-content/${source.content.id}/analytics`,
    bearer = token,
  ) =>
    request(app.getHttpServer() as import('node:http').Server)
      .get(url)
      .set('Authorization', `Bearer ${bearer}`);
  const privateResponse = (response: request.Response) => {
    expect(response.headers['cache-control']).toBe(
      'no-store, private, max-age=0',
    );
    expect(JSON.stringify(response.body)).not.toMatch(
      /"(actorUserId|studentId|guardianId|enrollmentId|requestFingerprint|acknowledgementId|acknowledgedAt|storageKey)":|private-join|private-link/,
    );
  };
  beforeAll(async () => {
    assertDisposablePostgresTarget({
      databaseUrl: process.env.DATABASE_URL,
      nodeEnv: process.env.NODE_ENV,
      universalRegressionMarker:
        process.env.MOAZEZ_UNIVERSAL_REGRESSION_DISPOSABLE_DB,
      localDatabasePredicate: (name) =>
        /^(?:ci_[0-9a-f]{14}|moazez_test(?:_[a-z0-9_-]+)?)$/.test(name),
      errorMessage: 'ACC-11D requires disposable PostgreSQL',
    });
    await prisma.$connect();
    await fixture.create();
    source = await fixture.ownedSource();
    const config = new ConfigService({
      JWT_ACCESS_SECRET: 'acc11d-local-access-secret-32-characters',
      JWT_REFRESH_SECRET: 'acc11d-local-refresh-secret-32-characters',
      JWT_ACCESS_TTL: '15m',
      JWT_REFRESH_TTL: '7d',
    });
    const module = await Test.createTestingModule({
      controllers: [TeacherAcademicContentAnalyticsController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        JwtService,
        TokenService,
        AuthRepository,
        AcademicContentTeacherAnalyticsRepository,
        AcademicContentEngagementExceptionFilter,
        TeacherAppAccessService,
        TeacherAppAllocationReadAdapter,
        TeacherAcademicContentAnalyticsUseCase,
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
    const issue = async (id: string, kind: string) => {
      const pair = await app.get(TokenService).issueTokens(id, kind);
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
    token = await issue(fixture.authorId, 'TEACHER');
    for (const userType of [
      'SCHOOL_USER',
      'STUDENT',
      'PARENT',
      'DISMISSAL_STAFF',
      'APPLICANT',
    ] as const) {
      const id = randomUUID();
      fixture.users.push(id);
      await prisma.user.create({
        data: {
          id,
          userType,
          email: `${id}@acc11d.test`,
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
            roleId: fixture.teacherRoleId,
          },
        });
      rejected.push(await issue(id, userType));
    }
  });
  afterAll(async () => {
    try {
      await prisma.session.deleteMany({
        where: { userId: { in: fixture.users } },
      });
      await fixture.dispose();
    } finally {
      if (app) await app.close();
      await prisma.$disconnect();
    }
  });

  it('serves exactly scoped aggregate metrics on both GET routes with private no-store', async () => {
    await fixture.event(source);
    const content = await get().expect(200);
    privateResponse(content);
    expect(content.body).toMatchObject({
      contentId: source.content.id,
      publicationId: null,
      revisionId: null,
      window: { range: '30d', timezone: 'UTC' },
      metrics: { totalEventReports: '1', distinctStudentActorsEngaged: '1' },
    });
    const publication = await get(
      `/api/v1/teacher/academic-content/${source.content.id}/publications/${source.publication.id}/analytics?range=7d`,
    ).expect(200);
    privateResponse(publication);
    expect(publication.body).toMatchObject({
      publicationId: source.publication.id,
      revisionId: source.revision.id,
      window: { range: '7d' },
    });
    const contentBody = content.body as {
      window: { from: string; toExclusive: string };
    };
    expect(
      new Date(contentBody.window.toExclusive).getTime() -
        new Date(contentBody.window.from).getTime(),
    ).toBe(30 * 86400000);
  });
  it('denies absent, malformed, expired and revoked tokens', async () => {
    privateResponse(
      await request(app.getHttpServer() as import('node:http').Server)
        .get(`/api/v1/teacher/academic-content/${source.content.id}/analytics`)
        .expect(401),
    );
    privateResponse(await get(undefined, 'invalid').expect(401));
    const expired = await app.get(JwtService).signAsync(
      {
        sub: fixture.authorId,
        sid: randomUUID(),
        type: 'access',
        userType: 'TEACHER',
      },
      { secret: 'acc11d-local-access-secret-32-characters', expiresIn: -1 },
    );
    privateResponse(await get(undefined, expired).expect(401));
    await prisma.session.updateMany({
      where: { userId: fixture.authorId },
      data: { revokedAt: new Date() },
    });
    try {
      privateResponse(await get().expect(401));
    } finally {
      await prisma.session.updateMany({
        where: { userId: fixture.authorId },
        data: { revokedAt: null },
      });
    }
  });
  it('denies non-Teacher actors even when their role carries both grants', async () => {
    for (const bearer of rejected)
      privateResponse(await get(undefined, bearer).expect(403));
  });
  it.each([
    'academics.academic_content.view',
    'academics.academic_content.analytics.own.view',
  ])(
    'independently requires %s and denies School analytics as a substitute',
    async (code) => {
      const permission = await prisma.permission.findUniqueOrThrow({
        where: { code },
      });
      const schoolAnalytics = await prisma.permission.findUniqueOrThrow({
        where: { code: 'academics.academic_content.analytics.view' },
      });
      await prisma.rolePermission.create({
        data: {
          roleId: fixture.teacherRoleId,
          permissionId: schoolAnalytics.id,
        },
      });
      await prisma.rolePermission.deleteMany({
        where: { roleId: fixture.teacherRoleId, permissionId: permission.id },
      });
      try {
        privateResponse(await get().expect(403));
      } finally {
        await prisma.rolePermission.create({
          data: { roleId: fixture.teacherRoleId, permissionId: permission.id },
        });
        await prisma.rolePermission.deleteMany({
          where: {
            roleId: fixture.teacherRoleId,
            permissionId: schoolAnalytics.id,
          },
        });
      }
    },
  );
  it('denies inactive actors and missing active membership', async () => {
    await prisma.membership.update({
      where: { id: fixture.teacherMembershipId },
      data: { status: 'INACTIVE', endedAt: new Date() },
    });
    try {
      privateResponse(await get().expect(403));
    } finally {
      await prisma.membership.update({
        where: { id: fixture.teacherMembershipId },
        data: { status: 'ACTIVE', endedAt: null },
      });
    }
    await prisma.user.update({
      where: { id: fixture.authorId },
      data: { status: 'DISABLED' },
    });
    try {
      privateResponse(await get().expect(403));
    } finally {
      await prisma.user.update({
        where: { id: fixture.authorId },
        data: { status: 'ACTIVE' },
      });
      await prisma.session.updateMany({
        where: { userId: fixture.authorId },
        data: { revokedAt: null },
      });
    }
  });
  it('denies unknown IDs, cross-School and foreign Creator with non-disclosing 404', async () => {
    const foreign = await fixture.publication('ONLINE_SESSION', 1);
    for (const contentId of [randomUUID(), foreign.content.id])
      privateResponse(
        await get(
          `/api/v1/teacher/academic-content/${contentId}/analytics`,
        ).expect(404),
      );
    await prisma.academicContent.update({
      where: { id: source.content.id },
      data: { createdByUserId: fixture.otherTeacherId },
    });
    try {
      privateResponse(await get().expect(404));
    } finally {
      await prisma.academicContent.update({
        where: { id: source.content.id },
        data: { createdByUserId: fixture.authorId },
      });
    }
    privateResponse(
      await get(
        `/api/v1/teacher/academic-content/${source.content.id}/publications/${randomUUID()}/analytics`,
      ).expect(404),
    );
  });
  it('denies partial current ownership and historical targets outside owned allocations', async () => {
    await prisma.teacherSubjectAllocation.update({
      where: { id: fixture.allocationIds[1] },
      data: { teacherUserId: fixture.otherTeacherId },
    });
    try {
      privateResponse(await get().expect(404));
    } finally {
      await prisma.teacherSubjectAllocation.update({
        where: { id: fixture.allocationIds[1] },
        data: { teacherUserId: fixture.authorId },
      });
    }
    const foreign = await fixture.successor(source, [
      fixture.foreignAllocationId,
    ]);
    privateResponse(
      await get(
        `/api/v1/teacher/academic-content/${source.content.id}/publications/${foreign.publication.id}/analytics`,
      ).expect(404),
    );
  });
  it.each([
    'schoolId',
    'organizationId',
    'teacherUserId',
    'actorUserId',
    'studentId',
    'guardianId',
    'enrollmentId',
    'recipientUserId',
    'permission',
    'from',
    'to',
    'groupBy',
  ])('rejects client %s scope/filter', async (key) => {
    privateResponse(
      await get(
        `/api/v1/teacher/academic-content/${source.content.id}/analytics?${key}=${randomUUID()}`,
      ).expect(400),
    );
  });
  it('rejects malformed IDs and invalid/repeated ranges on both routes', async () => {
    for (const suffix of [
      '?range=1d',
      '?range=',
      '?range=null',
      '?range=7d&range=30d',
      '?range[days]=7',
    ])
      privateResponse(
        await get(
          `/api/v1/teacher/academic-content/${source.content.id}/analytics${suffix}`,
        ).expect(400),
      );
    privateResponse(
      await get('/api/v1/teacher/academic-content/invalid/analytics').expect(
        400,
      ),
    );
    privateResponse(
      await get(
        `/api/v1/teacher/academic-content/${source.content.id}/publications/invalid/analytics`,
      ).expect(400),
    );
    privateResponse(
      await get(
        `/api/v1/teacher/academic-content/${source.content.id}/publications/${source.publication.id}/analytics?studentId=${randomUUID()}`,
      ).expect(400),
    );
  });
});
