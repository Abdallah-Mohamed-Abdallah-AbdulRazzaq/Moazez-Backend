import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { UserType } from '@prisma/client';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import {
  createRequestContext,
  getRequestContext,
  runWithRequestContext,
} from '../../src/common/context/request-context';
import { GlobalExceptionFilter } from '../../src/common/exceptions/global-exception.filter';
import { PermissionsGuard } from '../../src/common/guards/permissions.guard';
import { PRISMA_CLIENT_OPTIONS } from '../../src/infrastructure/database/prisma-client-options.provider';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { PERMISSION_CODES } from '../../src/modules/iam/reference-data/permission-catalog';
import { TEACHER_PERMISSIONS } from '../../src/modules/iam/reference-data/system-role-catalog';
import { requireResultActor } from '../../src/modules/official-results/application/result-actor';
import { resultContracts } from '../../src/modules/official-results/dto/result-openapi.contract';
import { ResultAuthorizationRepository } from '../../src/modules/official-results/infrastructure/repositories/result-authorization.repository';
import { ResultCommandRepository } from '../../src/modules/official-results/infrastructure/repositories/result-command.repository';
import { ResultFoundationRepository } from '../../src/modules/official-results/infrastructure/repositories/result-foundation.repository';
import { OfficialResultsModule } from '../../src/modules/official-results/official-results.module';
import {
  assertResultsTestDatabase,
  createResultsSchool,
} from '../fixtures/official-results.fixture';

const api = '/api/v1';
const management = `${api}/official-results`;
const instructor = `${api}/teacher/official-results`;
const schoolPermissions = PERMISSION_CODES.filter((code) =>
  code.startsWith('official_results.'),
);
const teacherPermissions = TEACHER_PERMISSIONS.filter((code) =>
  code.startsWith('official_results.'),
);
type SchoolFixture = Awaited<ReturnType<typeof createResultsSchool>>;

interface PeriodResponse {
  data: { reportingPeriodId: string; revision: number };
}

describe('Official Results policy and permission boundaries', () => {
  jest.setTimeout(25_000);
  const prisma = new PrismaService();
  let app: INestApplication;
  let school: SchoolFixture;
  let otherSchool: SchoolFixture;
  let teacher: Awaited<ReturnType<typeof createTeacher>>;
  let authorization: ResultAuthorizationRepository;
  let commands: ResultCommandRepository;
  let foundation: ResultFoundationRepository;
  let period: { id: string; termId: string | null };
  let math: { id: string; subjectId: string | null };
  let customGroup: { id: string };
  let annual: { id: string };
  let allocationId: string;
  let mathSheet: { id: string };
  let otherMathSheet: { id: string };

  function schoolContext<T>(fixture: SchoolFixture, next: () => T): T {
    return fixture.run(() => {
      const scope = getRequestContext()!;
      scope.activeMembership!.permissions = schoolPermissions;
      return next();
    });
  }

  async function attachPermissions(roleId: string, codes: string[]) {
    const permissions = await prisma.permission.findMany({
      where: { code: { in: codes } },
      select: { id: true },
    });
    expect(permissions).toHaveLength(codes.length);
    await prisma.rolePermission.createMany({
      data: permissions.map(({ id }) => ({ roleId, permissionId: id })),
      skipDuplicates: true,
    });
  }

  async function createTeacher(fixture: SchoolFixture) {
    const actor = await prisma.user.create({
      data: {
        firstName: 'Scoped',
        lastName: 'Teacher',
        email: `results-teacher-${randomUUID()}@example.invalid`,
        userType: UserType.TEACHER,
      },
      select: { id: true, userType: true },
    });
    const role = await prisma.role.create({
      data: {
        schoolId: fixture.school.id,
        key: 'results-instructor',
        name: 'Results Instructor',
      },
    });
    const membership = await prisma.membership.create({
      data: {
        schoolId: fixture.school.id,
        organizationId: fixture.school.organizationId,
        userId: actor.id,
        userType: actor.userType,
        roleId: role.id,
      },
    });
    await attachPermissions(role.id, teacherPermissions);
    return {
      actor,
      role,
      run: <T>(next: () => T): T =>
        runWithRequestContext(
          {
            ...createRequestContext(),
            actor,
            activeMembership: {
              membershipId: membership.id,
              schoolId: fixture.school.id,
              organizationId: fixture.school.organizationId,
              roleId: role.id,
              permissions: teacherPermissions,
            },
          },
          next,
        ),
    };
  }

  const blankDefinition = {
    label: { ar: 'نتيجة', en: 'Result' },
    configuration: {},
    fields: [],
    releaseUnits: [],
  };

  beforeAll(async () => {
    assertResultsTestDatabase();
    [school, otherSchool] = await Promise.all([
      createResultsSchool(prisma),
      createResultsSchool(prisma),
    ]);
    const schoolRole = school.run(
      () => getRequestContext()!.activeMembership!.roleId,
    );
    const otherRole = otherSchool.run(
      () => getRequestContext()!.activeMembership!.roleId,
    );
    await Promise.all([
      attachPermissions(schoolRole, schoolPermissions),
      attachPermissions(otherRole, schoolPermissions),
    ]);
    teacher = await createTeacher(school);
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        OfficialResultsModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(PRISMA_CLIENT_OPTIONS)
      .useValue({})
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use((req: Request, _res: Response, next: NextFunction) => {
      switch (req.header('authorization')) {
        case 'Bearer school-fixture':
          return schoolContext(school, next);
        case 'Bearer other-school-fixture':
          return schoolContext(otherSchool, next);
        case 'Bearer teacher-fixture':
          return teacher.run(next);
        default:
          return next();
      }
    });
    app.useGlobalGuards(new PermissionsGuard(app.get(Reflector)));
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
    authorization = app.get(ResultAuthorizationRepository);
    commands = app.get(ResultCommandRepository);
    foundation = app.get(ResultFoundationRepository);
    period = await school.run(() =>
      foundation.createReportingPeriod({
        kind: 'TERM',
        academicYearId: school.year.id,
        termId: school.term.id,
        code: 'T1',
        name: { ar: 'الأولى', en: 'Term 1' },
        startsOn: '2026-09-01',
        endsOn: '2026-12-31',
      }),
    );
    annual = await school.run(() =>
      foundation.createReportingPeriod({
        kind: 'YEAR',
        academicYearId: school.year.id,
        code: 'Y1',
        name: { ar: 'العام', en: 'Year' },
        startsOn: '2026-09-01',
        endsOn: '2027-06-30',
      }),
    );
    math = await school.run(() =>
      foundation.createGroup({
        kind: 'SUBJECT',
        subjectId: school.subject.id,
        code: 'MATH',
        label: { ar: 'الرياضيات', en: 'Math' },
      }),
    );
    customGroup = await school.run(() =>
      foundation.createGroup({
        kind: 'CUSTOM',
        code: 'CUSTOM',
        label: { ar: 'مجموعة', en: 'Custom' },
      }),
    );
    const allocation = await prisma.teacherSubjectAllocation.create({
      data: {
        schoolId: school.school.id,
        teacherUserId: teacher.actor.id,
        termId: school.term.id,
        subjectId: school.subject.id,
        classroomId: school.classroom.id,
      },
      select: { id: true },
    });
    allocationId = allocation.id;
    const science = await prisma.subject.create({
      data: { schoolId: school.school.id, nameAr: 'العلوم', nameEn: 'Science' },
    });
    await prisma.subjectAllocation.create({
      data: {
        schoolId: school.school.id,
        academicYearId: school.year.id,
        termId: school.term.id,
        gradeId: school.grade.id,
        subjectId: science.id,
        weeklyHours: 3,
      },
    });
    await prisma.teacherSubjectAllocation.create({
      data: {
        schoolId: school.school.id,
        teacherUserId: teacher.actor.id,
        termId: school.term.id,
        subjectId: science.id,
        classroomId: school.otherClassroom.id,
      },
    });

    const createSheet = (classroomId: string) =>
      school.run(() =>
        foundation.materialize({
          reportingPeriodId: period.id,
          groupId: math.id,
          classroomId,
          rosterAsOf: new Date('2026-11-21T10:00:00.000Z'),
          definition: blankDefinition,
          acceptsDefinition: false,
        }),
      );
    mathSheet = (await createSheet(school.classroom.id)).sheet;
    otherMathSheet = (await createSheet(school.otherClassroom.id)).sheet;
  });

  afterAll(async () => {
    if (app) await app.close();
    else await prisma.$disconnect();
  });

  const schoolApi = () =>
    request(app.getHttpServer() as Parameters<typeof request>[0]);
  const withSchool = (method: 'get' | 'post' | 'patch', path: string) =>
    schoolApi()
      [method](`${management}${path}`)
      .set('Authorization', 'Bearer school-fixture');
  const withTeacher = (path: string) =>
    schoolApi()
      .get(`${instructor}${path}`)
      .set('Authorization', 'Bearer teacher-fixture');

  async function activatePolicy(
    policy: object,
    previous: string | null,
    key: string,
  ) {
    const preview = await withSchool('post', '/policy/preview')
      .send({ expectedPolicyVersionId: previous, policy })
      .expect(200);
    const staged = resultContracts.policyPreview.parse(preview.body.data);
    const input = {
      expectedPolicyVersionId: previous,
      previewId: staged.previewId,
      previewDigest: staged.previewDigest,
    };
    const activation = await withSchool('post', '/policy/activate')
      .set('Idempotency-Key', key)
      .send(input)
      .expect(200);
    return {
      input,
      result: resultContracts.policy.parse(activation.body.data),
    };
  }

  it('exposes only implemented operations in the generated Nest OpenAPI contract', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().addBearerAuth().build(),
    );
    const paths = Object.fromEntries(
      Object.entries(document.paths).filter(
        ([path]) =>
          path.startsWith(management + '/') ||
          path.startsWith(instructor + '/'),
      ),
    );
    const catalog = JSON.parse(
      readFileSync(
        join(
          process.cwd(),
          'docs/official-results/contracts/endpoint-catalog.json',
        ),
        'utf8',
      ),
    ) as {
      operations: {
        path: string;
        method: string;
        operationId: string;
        successStatus: number;
      }[];
    };
    const registered = Object.entries(paths).flatMap(([path, item]) =>
      Object.entries(item).map(
        ([method, operation]: [
          string,
          { operationId: string; responses: Record<string, unknown> },
        ]) => ({
          path,
          method: method.toUpperCase(),
          operationId: operation.operationId,
          responses: operation.responses,
        }),
      ),
    );
    expect(registered).toHaveLength(18);
    for (const endpoint of registered) {
      expect(catalog.operations).toContainEqual(
        expect.objectContaining({
          path: endpoint.path.replace(/\{([^}]+)\}/gu, ':$1'),
          method: endpoint.method,
          operationId: endpoint.operationId,
        }),
      );
      const operation = catalog.operations.find(
        ({ operationId }) => endpoint.operationId === operationId,
      )!;
      expect(endpoint.responses).toHaveProperty(
        String(operation.successStatus),
      );
    }
    const output = process.env.OFFICIAL_RESULTS_OPENAPI_OUTPUT;
    if (output)
      writeFileSync(
        output,
        JSON.stringify({ ...document, paths }, null, 2) + '\n',
      );
  });

  it('rejects foreign identifiers before returning sheet details and rejects writable tenant fields', async () => {
    await schoolApi()
      .get(`${management}/capabilities?sheetId=${mathSheet.id}`)
      .set('Authorization', 'Bearer other-school-fixture')
      .expect(404);
    await withSchool('post', '/groups')
      .set('Idempotency-Key', 'reject-school-override')
      .send({
        kind: 'CUSTOM',
        code: 'Foreign',
        label: { ar: 'مجموعة', en: 'Group' },
        schoolId: otherSchool.school.id,
      })
      .expect(400);
  });

  it('T007 grants the actual Math/class A tuple and denies Math/class B', async () => {
    const response = await withTeacher(
      `/capabilities?sheetId=${mathSheet.id}`,
    ).expect(200);
    const data = resultContracts.capabilities.parse(response.body.data);
    expect(data.capabilities.canDesign).toEqual({ allowed: true });
    expect(data.capabilities.canEnter).toEqual({ allowed: true });
    await withTeacher(`/capabilities?sheetId=${otherMathSheet.id}`).expect(404);
  });

  it('T009 does not grant publish IAM when AUTONOMOUS policy is activated', async () => {
    expect(teacherPermissions).not.toContain(
      'official_results.publications.publish',
    );
    const { input, result } = await activatePolicy(
      { teacherMode: 'AUTONOMOUS' },
      null,
      'activate-autonomous',
    );
    expect(result.policy.firstPublication).toBe('DIRECT_IF_AUTHORIZED');
    const response = await withTeacher(
      `/capabilities?sheetId=${mathSheet.id}`,
    ).expect(200);
    expect(
      resultContracts.capabilities.parse(response.body.data).capabilities
        .canPublish,
    ).toEqual({ allowed: false, reasonCode: 'MISSING_PERMISSION' });
    const replay = await withSchool('post', '/policy/activate')
      .set('Idempotency-Key', 'activate-autonomous')
      .send(input)
      .expect(200);
    expect(resultContracts.policy.parse(replay.body.data).policyVersionId).toBe(
      result.policyVersionId,
    );
    await withSchool('post', '/policy/activate')
      .set('Idempotency-Key', 'activate-autonomous')
      .send({ ...input, previewDigest: 'f'.repeat(64) })
      .expect(409);
  });

  it('T010 requires review for a MANAGED teacher holding the publish permission', async () => {
    const current = resultContracts.policy.parse(
      (await withSchool('get', '/policy').expect(200)).body.data,
    );
    await activatePolicy(
      { teacherMode: 'MANAGED' },
      current.policyVersionId,
      'activate-managed',
    );
    await attachPermissions(teacher.role.id, [
      'official_results.publications.publish',
    ]);
    const response = await withTeacher(
      `/capabilities?sheetId=${mathSheet.id}`,
    ).expect(200);
    const data = resultContracts.capabilities.parse(response.body.data);
    expect(data.capabilities.canPublish).toEqual({
      allowed: false,
      reasonCode: 'POLICY_REVIEW_REQUIRED',
    });
    expect(data.capabilities.canSubmit).toEqual({ allowed: true });
    await expect(
      teacher.run(async () =>
        commands.transaction(async (tx) => {
          const scope = requireResultActor('TEACHER');
          const access = await authorization.permissions(tx, scope, {
            write: true,
          });
          authorization.requirePermission(
            access,
            'official_results.publications.publish',
          );
          const target = await authorization.authorizedTarget(
            tx,
            access,
            {
              classroomId: school.classroom.id,
              groupId: math.id,
              reportingPeriodId: period.id,
            },
            'PUBLISH',
            { write: true },
          );
          authorization.assertDirectPublication(scope, target.settings, false);
        }),
      ),
    ).rejects.toMatchObject({ code: 'official_results.review.required' });
  });

  it('preserves exact policy preview CAS and returns localized stable error code', async () => {
    const previous = resultContracts.policy.parse(
      (await withSchool('get', '/policy').expect(200)).body.data,
    );
    const stale = resultContracts.policyPreview.parse(
      (
        await withSchool('post', '/policy/preview')
          .send({
            expectedPolicyVersionId: previous.policyVersionId,
            policy: { publicationSuspended: true },
          })
          .expect(200)
      ).body.data,
    );
    await activatePolicy(
      { teacherMode: 'MANAGED', familyHistoryEnabled: true },
      previous.policyVersionId,
      'activate-history',
    );
    const response = await withSchool('post', '/policy/activate')
      .set('Idempotency-Key', 'old-preview')
      .set('Accept-Language', 'ar')
      .send({
        expectedPolicyVersionId: stale.expectedPolicyVersionId,
        previewId: stale.previewId,
        previewDigest: stale.previewDigest,
      })
      .expect(409);
    expect(response.body).toMatchObject({
      error: {
        code: 'official_results.policy.stale',
        message: expect.stringMatching(/[\u0600-\u06ff]/u),
      },
    });
  });

  it('T014 and T015 require explicit scope for custom and year resources', async () => {
    const check = (reportingPeriodId: string, groupId: string) =>
      teacher.run(async () =>
        commands.transaction(async (tx) => {
          const scope = requireResultActor('TEACHER');
          const access = await authorization.permissions(tx, scope);
          authorization.requirePermission(
            access,
            'official_results.entries.manage',
          );
          return authorization.authorizedTarget(
            tx,
            access,
            {
              classroomId: school.classroom.id,
              reportingPeriodId,
              groupId,
            },
            'EDIT',
          );
        }),
      );
    await expect(check(period.id, customGroup.id)).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(check(annual.id, math.id)).rejects.toMatchObject({
      code: 'not_found',
    });
    const grant = await withSchool('post', '/grants')
      .set('Idempotency-Key', 'grant-custom')
      .send({
        grantee: { kind: 'USER', id: teacher.actor.id },
        scope: {
          reportingPeriodIds: [period.id],
          groupIds: [customGroup.id],
          classroomIds: [school.classroom.id],
        },
        actions: ['VIEW', 'EDIT'],
        reason: 'Authorized custom result entry',
      })
      .expect(201);
    const created = resultContracts.grant.parse(grant.body.data);
    await expect(check(period.id, customGroup.id)).resolves.toMatchObject({
      group: { id: customGroup.id },
    });
    await withSchool('post', `/grants/${created.grantId}/revoke`)
      .set('Idempotency-Key', 'revoke-custom')
      .send({
        expectedRevision: created.revision,
        reason: 'Assignment ended',
      })
      .expect(200);
    await expect(check(period.id, customGroup.id)).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('creates only one period when the command is retried concurrently', async () => {
    const input = {
      kind: 'CUSTOM',
      academicYearId: school.year.id,
      termId: school.term.id,
      code: 'november',
      name: { ar: 'نوفمبر', en: 'November' },
      startsOn: '2026-11-01',
      endsOn: '2026-11-30',
    };
    const call = () =>
      withSchool('post', '/periods')
        .set('Idempotency-Key', 'create-november')
        .send(input)
        .expect(201);
    const replies = await Promise.all([call(), call()]);
    const [{ data: first }, { data: second }] = replies.map(
      ({ body }) => body as PeriodResponse,
    );
    expect(first.reportingPeriodId).toBe(second.reportingPeriodId);
    expect(
      await prisma.resultReportingPeriod.count({
        where: { schoolId: school.school.id, code: 'november' },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: {
          schoolId: school.school.id,
          resourceId: first.reportingPeriodId,
          action: 'official_results.periods.create',
        },
      }),
    ).toBe(1);
  });

  it('T013 denies an edit waiting on a concurrent allocation revocation', async () => {
    const writerName = `or-writer-${randomUUID()}`;
    let releaseDelete!: () => void;
    const allowCommit = new Promise<void>((resolve) => {
      releaseDelete = resolve;
    });
    let deleted!: () => void;
    const deletionPending = new Promise<void>((resolve) => {
      deleted = resolve;
    });
    const revocation = prisma.$transaction(
      async (tx) => {
        await tx.teacherSubjectAllocation.delete({
          where: { id: allocationId },
        });
        deleted();
        await allowCommit;
      },
      { timeout: 15_000 },
    );
    await deletionPending;

    const edit = teacher.run(async () =>
      commands.transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config('application_name', ${writerName}, true)`;
        const scope = requireResultActor('TEACHER');
        const access = await authorization.permissions(tx, scope, {
          write: true,
        });
        authorization.requirePermission(
          access,
          'official_results.entries.manage',
        );
        await authorization.authorizedTarget(
          tx,
          access,
          {
            classroomId: school.classroom.id,
            groupId: math.id,
            reportingPeriodId: period.id,
          },
          'EDIT',
          { write: true },
        );
        await tx.resultSheet.updateMany({
          where: { schoolId: school.school.id, id: mathSheet.id },
          data: { dataGeneration: { increment: 1 } },
        });
      }),
    );
    const outcome = edit.then(
      () => null,
      (error: unknown) => error,
    );
    let blocked = false;
    try {
      const observeUntil = Date.now() + 3000;
      while (!blocked && Date.now() < observeUntil) {
        const [row] = await prisma.$queryRaw<Array<{ pending: boolean }>>`
          SELECT EXISTS(
            SELECT 1 FROM pg_stat_activity
            WHERE application_name = ${writerName} AND cardinality(pg_blocking_pids(pid)) > 0
          ) AS pending
        `;
        blocked = row.pending;
      }
    } finally {
      releaseDelete();
      await revocation;
    }
    expect(blocked).toBe(true);
    expect(await outcome).toMatchObject({ code: 'not_found' });
    expect(
      await prisma.resultSheet.findUnique({
        where: { id: mathSheet.id },
        select: { dataGeneration: true },
      }),
    ).toEqual({ dataGeneration: 0 });
  });
});
