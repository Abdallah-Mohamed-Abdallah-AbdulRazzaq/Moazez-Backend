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
import { releaseOutputs } from '../../src/modules/official-results/dto/result-release.dto';
import { aggregateOutputs } from '../../src/modules/official-results/dto/result-aggregate.dto';
import { familyOutputs } from '../../src/modules/official-results/dto/result-family.dto';
import { releaseSnapshot } from '../../src/modules/official-results/domain/result-release.contract';
import { cloneResultDefinition } from '../../src/modules/official-results/domain/result-definition';
import { sheetDefinitionSeed } from '../../src/modules/official-results/domain/sheet-definition-seed';
import { gradebookOutputs } from '../../src/modules/official-results/dto/result-gradebook.dto';
import {
  moazezStarterDefinition,
  starterTemplateId,
  starterVersionId,
} from '../../src/modules/official-results/domain/moazez-starter';
import { authoringOutputs } from '../../src/modules/official-results/dto/result-authoring.dto';
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
  const familyScopes = new Map<
    string,
    ReturnType<typeof createRequestContext>
  >();
  let coTeacher: Awaited<ReturnType<typeof createTeacher>>;
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
        key: 'results-instructor-' + actor.id,
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
    coTeacher = await createTeacher(school);
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
        case 'Bearer co-teacher-fixture':
          return coTeacher.run(next);
        default:
          const proof = familyScopes.get(req.header('authorization') ?? '');
          return proof
            ? runWithRequestContext(structuredClone(proof), next)
            : next();
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
    await prisma.teacherSubjectAllocation.createMany({
      data: [school.classroom.id, school.otherClassroom.id].map(
        (classroomId) => ({
          schoolId: school.school.id,
          teacherUserId: coTeacher.actor.id,
          termId: school.term.id,
          subjectId: school.subject.id,
          classroomId,
        }),
      ),
    });
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
          path.startsWith(instructor + '/') ||
          path.startsWith('/api/v1/student/official-results/') ||
          path.startsWith(
            '/api/v1/parent/children/{studentId}/official-results/',
          ),
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
      contracts: Record<string, { requiredFields: string[] }>;
      operations: {
        path: string;
        method: string;
        operationId: string;
        successStatus: number;
        outputContract: string;
        idempotency: string;
      }[];
    };
    const registered = Object.entries(paths).flatMap(([path, item]) =>
      Object.entries(item).map(
        ([method, operation]: [
          string,
          {
            operationId: string;
            parameters?: { name: string; in: string; required?: boolean }[];
            responses: Record<
              string,
              {
                content?: Record<
                  string,
                  {
                    schema?: {
                      properties?: { data?: { required?: string[] } };
                    };
                  }
                >;
              }
            >;
          },
        ]) => ({
          path,
          method: method.toUpperCase(),
          operationId: operation.operationId,
          responses: operation.responses,
          parameters: operation.parameters ?? [],
        }),
      ),
    );
    expect(registered).toHaveLength(89);
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
      expect(
        endpoint.responses[operation.successStatus].content?.[
          'application/json'
        ].schema?.properties?.data?.required,
      ).toEqual(
        expect.arrayContaining(
          catalog.contracts[operation.outputContract].requiredFields,
        ),
      );
      const header = endpoint.parameters.find(
        (parameter) =>
          parameter.in === 'header' && parameter.name === 'Idempotency-Key',
      );
      expect(header?.required ?? false).toBe(
        operation.idempotency === 'REQUIRED',
      );
    }
    const output = process.env.OFFICIAL_RESULTS_OPENAPI_OUTPUT;
    const generated = JSON.stringify({ ...document, paths }, null, 2) + '\n';
    if (output) writeFileSync(output, generated);
    else
      expect(
        JSON.parse(
          readFileSync(
            join(process.cwd(), 'docs/official-results/openapi.json'),
            'utf8',
          ),
        ),
      ).toEqual(JSON.parse(generated));
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

  async function authoringPeriod(code: string) {
    const created = await withSchool('post', '/periods')
      .set('Idempotency-Key', code)
      .send({
        kind: 'TERM',
        code,
        academicYearId: school.year.id,
        termId: school.term.id,
        name: { ar: 'النتائج', en: 'Reporting period' },
        startsOn: '2026-09-01',
        endsOn: '2026-12-31',
      })
      .expect(201);
    return (created.body as PeriodResponse).data.reportingPeriodId;
  }

  it('T016, T017, T021 and T022 clone, customize and pin a school version on canonical sheets', async () => {
    const starterPath =
      '/templates/' + starterTemplateId + '/versions/' + starterVersionId;
    const starter = authoringOutputs.templateVersion.parse(
      (await withSchool('get', starterPath).expect(200)).body.data,
    );
    const copy = authoringOutputs.template.parse(
      (
        await withSchool('post', '/templates/clone')
          .set('Idempotency-Key', 'clone-starter')
          .send({
            sourceTemplateId: starterTemplateId,
            sourceVersionId: starterVersionId,
            label: { ar: 'نسخة المدرسة', en: 'School copy' },
          })
          .expect(201)
      ).body.data,
    );
    const templatePath = '/templates/' + copy.templateId;
    const v1Path = templatePath + '/versions/' + copy.latestVersionId;
    const v1 = authoringOutputs.templateVersion.parse(
      (await withSchool('get', v1Path).expect(200)).body.data,
    );
    expect(v1.definition.fields[0].id).not.toBe(
      starter.definition.fields[0].id,
    );
    expect(
      v1.definition.fields.find((field) => field.code === 'total')?.formula
        ?.operands[0].fieldId,
    ).toBe(v1.definition.fields[0].id);
    expect(v1.origin.sourceVersionId).toBe(starterVersionId);
    await schoolApi()
      .get(management + v1Path)
      .set('Authorization', 'Bearer other-school-fixture')
      .expect(404);
    const activate = async (versionId: string, key: string) => {
      const template = authoringOutputs.template.parse(
        (await withSchool('get', templatePath).expect(200)).body.data,
      );
      const request = {
        versionId,
        expectedTemplateRevision: template.revision,
      };
      const preview = authoringOutputs.activationPreview.parse(
        (
          await withSchool('post', templatePath + '/activation-preview')
            .send(request)
            .expect(200)
        ).body.data,
      );
      await withSchool('post', templatePath + '/activate')
        .set('Idempotency-Key', key)
        .send({
          ...request,
          previewId: preview.previewId,
          previewDigest: preview.previewDigest,
        })
        .expect(200);
    };
    await activate(v1.templateVersionId, 'activate-school-v1');
    const reportingPeriodId = await authoringPeriod('PINNED');
    const fixedIds = [school.classroom.id, school.otherClassroom.id];
    await withSchool('post', '/scope-assignments')
      .set('Idempotency-Key', 'fixed-classrooms')
      .send({
        expectedScopeRevision: 0,
        assignment: {
          academicScope: { level: 'CLASSROOM', ids: fixedIds },
          groupScope: { kind: 'SUBJECTS', subjectIds: [school.subject.id] },
          periodSelector: {
            kind: 'EXACT_PERIODS',
            periodIds: [reportingPeriodId],
          },
          mode: 'REPLACE',
          templateVersionId: v1.templateVersionId,
          enabled: true,
        },
      })
      .expect(201);
    expect(
      (await withTeacher(v1Path).expect(200)).body.data.templateVersionId,
    ).toBe(v1.templateVersionId);
    const added = await prisma.classroom.create({
      data: {
        schoolId: school.school.id,
        sectionId: school.section.id,
        nameAr: 'فصل جديد',
        nameEn: 'Later classroom',
      },
    });
    const rosterStudent = await school.addStudent('Authoring Student');
    await prisma.enrollment.create({
      data: {
        schoolId: school.school.id,
        academicYearId: school.year.id,
        termId: school.term.id,
        studentId: rosterStudent.id,
        classroomId: school.classroom.id,
        enrolledAt: new Date('2026-09-01T08:00:00Z'),
      },
    });
    const preview = authoringOutputs.resolution.parse(
      (
        await withSchool('post', '/scope-resolutions')
          .send({
            reportingPeriodId,
            academicScope: { level: 'SCHOOL', ids: [] },
            groupIds: [math.id],
            rosterAsOf: '2026-11-21T10:00:00.000Z',
          })
          .expect(200)
      ).body.data,
    );
    expect(preview.conflicts).toEqual([]);
    expect(preview.tuples.map((tuple) => tuple.classroomId).sort()).toEqual(
      [...fixedIds, added.id].sort(),
    );
    expect(
      preview.tuples
        .filter((tuple) => tuple.templateVersionId === v1.templateVersionId)
        .map((tuple) => tuple.classroomId)
        .sort(),
    ).toEqual([...fixedIds].sort());
    const materialize = () =>
      withSchool('post', '/sheets/materialize')
        .set('Idempotency-Key', 'pinned-materialize')
        .send({
          previewId: preview.previewId,
          previewDigest: preview.previewDigest,
        })
        .expect(202);
    const outcome = authoringOutputs.operation.parse(
      (await materialize()).body.data,
    );
    expect((await materialize()).body.data).toEqual(outcome);
    const items = authoringOutputs.operationItems.parse(
      (
        await schoolApi()
          .get(outcome.itemsPath)
          .set('Authorization', 'Bearer school-fixture')
          .expect(200)
      ).body.data,
    );
    const sheetId = items.items.find(
      (item) => item.classroomId === school.classroom.id,
    )!.sheetId;
    const current = await prisma.resultSheet.findUniqueOrThrow({
      where: { id: sheetId },
      include: { draftDefinition: true, slots: true },
    });
    expect(current.slots).toEqual([
      expect.objectContaining({ studentId: rosterStudent.id }),
    ]);
    expect(current.draftDefinition?.configuration).toMatchObject({
      templateVersionId: v1.templateVersionId,
    });
    const v2 = authoringOutputs.templateVersion.parse(
      (
        await withSchool('post', templatePath + '/versions')
          .set('Idempotency-Key', 'school-v2')
          .send({
            expectedLatestVersionId: v1.templateVersionId,
            definition: {
              ...v1.definition,
              label: { ar: 'مخصص', en: 'Customized' },
            },
          })
          .expect(201)
      ).body.data,
    );
    await activate(v2.templateVersionId, 'activate-school-v2');
    expect(
      (await prisma.resultSheet.findUniqueOrThrow({ where: { id: sheetId } }))
        .draftDefinitionVersionId,
    ).toBe(current.draftDefinitionVersionId);
    expect(
      (await withSchool('get', starterPath).expect(200)).body.data,
    ).toEqual(starter);
  });

  it('T008, T023 and T099 stage a MANAGED teacher draft, preserve scores and enforce accepted protections', async () => {
    const reportingPeriodId = await authoringPeriod('FREEFORM');
    const enrolled = await school.addStudent('Freeform Student');
    await prisma.enrollment.create({
      data: {
        schoolId: school.school.id,
        academicYearId: school.year.id,
        termId: school.term.id,
        studentId: enrolled.id,
        classroomId: school.classroom.id,
        enrolledAt: new Date('2026-09-01T08:00:00Z'),
      },
    });
    const teacherPost = (path: string) =>
      schoolApi()
        .post(instructor + path)
        .set('Authorization', 'Bearer teacher-fixture');
    const scope = authoringOutputs.resolution.parse(
      (
        await teacherPost('/scope-resolutions')
          .send({
            reportingPeriodId,
            academicScope: { level: 'SCHOOL', ids: [] },
            groupIds: [math.id],
            rosterAsOf: '2026-11-21T10:00:00.000Z',
          })
          .expect(200)
      ).body.data,
    );
    expect(scope.tuples.map((tuple) => tuple.classroomId)).toEqual([
      school.classroom.id,
    ]);
    const operation = authoringOutputs.operation.parse(
      (
        await teacherPost('/sheets/materialize')
          .set('Idempotency-Key', 'freeform-materialize')
          .send({
            previewId: scope.previewId,
            previewDigest: scope.previewDigest,
          })
          .expect(202)
      ).body.data,
    );
    const list = authoringOutputs.operationItems.parse(
      (
        await schoolApi()
          .get(operation.itemsPath)
          .set('Authorization', 'Bearer teacher-fixture')
          .expect(200)
      ).body.data,
    );
    const sheetId = list.items[0].sheetId;
    const loadSheet = () =>
      prisma.resultSheet.findUniqueOrThrow({
        where: { id: sheetId },
        include: { slots: true },
      });
    const draftInput = {
      label: { ar: 'شخصي', en: 'Personal' },
      groupKind: 'SUBJECT',
      calculationPolicy: moazezStarterDefinition().calculationPolicy,
      fields: [
        {
          clientKey: 'participation',
          code: 'participation',
          label: { ar: 'المشاركة', en: 'Participation' },
          kind: 'SCORE',
          order: 1,
          requiredForFinal: true,
          constraints: { minScore: '0', maxScore: '20', inputScale: 2 },
          audiences: ['STUDENT', 'PARENT', 'STAFF'],
          readRule: 'INHERIT_SHEET',
          editRule: 'INHERIT_SHEET',
          clientUnitKey: 'progress',
        },
      ],
      releaseUnits: [
        {
          clientUnitKey: 'progress',
          code: 'PROGRESS',
          label: { ar: 'تقدم', en: 'Progress' },
          classification: 'PROGRESS',
          outputFields: [{ clientFieldKey: 'participation' }],
        },
      ],
    };
    const create = async (
      definition: object,
      key: string,
      schoolAuthor = false,
      status = 201,
    ) => {
      const sheet = await loadSheet();
      return (
        schoolAuthor ? withSchool('post', '/designs') : teacherPost('/designs')
      )
        .set('Idempotency-Key', key)
        .send({
          sheetId,
          definition,
          reason: 'Validated draft design',
          expectedDefinitionVersionId: sheet.draftDefinitionVersionId,
          expectedSheetRevision: sheet.sheetRevision,
        })
        .expect(status);
    };
    const draft = authoringOutputs.design.parse(
      (await create(draftInput, 'teacher-personal')).body.data,
    );
    const path = '/sheets/' + sheetId + '/draft-definition-';
    const review = async (
      targetDefinitionVersionId: string,
      fieldMapping: object[],
    ) => {
      const sheet = await loadSheet();
      return authoringOutputs.definitionPreview.parse(
        (
          await teacherPost(path + 'preview')
            .send({
              targetDefinitionVersionId,
              fieldMapping,
              expectedDefinitionVersionId: sheet.draftDefinitionVersionId,
              expectedSheetRevision: sheet.sheetRevision,
            })
            .expect(200)
        ).body.data,
      );
    };
    const adopt = async (
      preview: Awaited<ReturnType<typeof review>>,
      key: string,
    ) =>
      authoringOutputs.sheet.parse(
        (
          await teacherPost(path + 'adopt')
            .set('Idempotency-Key', key)
            .send({
              previewId: preview.previewId,
              previewDigest: preview.previewDigest,
              expectedSheetRevision: preview.impact.expectedSheetRevision,
            })
            .expect(200)
        ).body.data,
      );
    const selected = await adopt(
      await review(draft.definitionVersionId, []),
      'adopt-in-managed',
    );
    expect(selected.lastAcceptedDefinitionVersionId).toBeNull();
    const fieldId = draft.definition.fields[0].id;
    const slot = (await loadSheet()).slots.find(
      (row) => row.studentId === enrolled.id,
    )!;
    await schoolApi()
      .patch(instructor + '/sheets/' + sheetId + '/cells')
      .set('Authorization', 'Bearer teacher-fixture')
      .send({
        expectedDefinitionVersionId: draft.definitionVersionId,
        expectedSheetRevision: selected.sheetRevision,
        operations: [scoreOperation(slot.id, fieldId, '18.00')],
      })
      .expect(200);
    const higherLimit = {
      ...draft.definition,
      fields: draft.definition.fields.map((field) => ({
        ...field,
        constraints: { minScore: '0', maxScore: '100', inputScale: 2 },
      })),
    };
    const widened = authoringOutputs.design.parse(
      (await create(higherLimit, 'increase-maximum')).body.data,
    );
    expect((await review(widened.definitionVersionId, [])).blockers).toEqual([
      { fieldId, code: 'MAPPING_REQUIRED' },
    ]);
    const updated = await adopt(
      await review(widened.definitionVersionId, [
        { fromFieldId: fieldId, toFieldId: fieldId, action: 'PRESERVE' },
      ]),
      'preserve-raw-score',
    );
    expect(updated.lastAcceptedDefinitionVersionId).toBeNull();
    const cell = await prisma.resultCell.findFirstOrThrow({
      where: { slotId: slot.id, fieldId },
    });
    expect(cell.numericValue?.toString()).toBe('18');
    expect(cell.version).toBe(2);
    const restricted = {
      ...widened.definition,
      fields: widened.definition.fields.map((field) => ({
        ...field,
        audiences: ['STAFF'],
        readRule: 'SCHOOL_ONLY',
        editRule: 'SCHOOL_ONLY',
      })),
    };
    const schoolDesign = authoringOutputs.design.parse(
      (await create(restricted, 'protect-field', true)).body.data,
    );
    const decision = {
      definitionVersionId: schoolDesign.definitionVersionId,
      contentDigest: schoolDesign.contentDigest,
      decision: 'APPROVE',
    };
    const decisionPath = '/designs/' + schoolDesign.candidateId + '/decisions';
    await withSchool('post', decisionPath)
      .set('Idempotency-Key', 'wrong-digest')
      .send({ ...decision, contentDigest: 'f'.repeat(64) })
      .expect(409);
    await withSchool('post', decisionPath)
      .set('Idempotency-Key', 'exact-design')
      .send(decision)
      .expect(200);
    const denied = await create(
      higherLimit,
      'try-remove-protection',
      false,
      403,
    );
    expect(denied.body.error.code).toBe('official_results.schema.protected');
    expect((await loadSheet()).draftDefinitionVersionId).toBe(
      widened.definitionVersionId,
    );
  });

  function scoreOperation(
    slotId: string,
    fieldId: string,
    score: string,
    expectedCellVersion = 0,
  ) {
    return {
      slotId,
      fieldId,
      expectedCellVersion,
      operation: 'SET',
      value: { status: 'RECORDED', score },
    };
  }

  async function liveGradebook(code: string) {
    const reportingPeriodId = await authoringPeriod(code);
    const child = await school.addStudent(code);
    const enrollment = await prisma.enrollment.create({
      data: {
        schoolId: school.school.id,
        academicYearId: school.year.id,
        termId: school.term.id,
        studentId: child.id,
        classroomId: school.classroom.id,
        enrolledAt: new Date('2026-09-01T08:00:00Z'),
      },
    });
    const definition = cloneResultDefinition(moazezStarterDefinition(), {
      ar: 'كشف',
      en: code,
    }).definition;
    const internal = definition.fields.find(
      (field) => field.code === 'internal_note',
    )!;
    const scores = definition.fields.filter((field) => field.kind === 'SCORE');
    scores.forEach((item, index) => {
      item.label.en = ['Homework', 'Behavior', 'Tests'][index];
    });
    const materialize = (classroomId: string) =>
      school.run(() =>
        foundation.materialize({
          reportingPeriodId,
          groupId: math.id,
          classroomId,
          rosterAsOf: new Date('2026-11-21T10:00:00.000Z'),
          definition: sheetDefinitionSeed(definition),
          acceptsDefinition: true,
        }),
      );
    const source = (await materialize(school.classroom.id)).sheet;
    const destination = (await materialize(school.otherClassroom.id)).sheet;
    const slot = await prisma.resultSlot.findFirstOrThrow({
      where: { sheetId: source.id, studentId: child.id },
    });
    const url = '/sheets/' + source.id;
    const patch = (
      operations: object[],
      auth = 'teacher-fixture',
      key?: string,
    ) => {
      const mutation = schoolApi()
        .patch(instructor + url + '/cells')
        .set('Authorization', 'Bearer ' + auth);
      if (key) mutation.set('Idempotency-Key', key);
      return mutation.send({
        expectedDefinitionVersionId: source.draftDefinitionVersionId,
        expectedSheetRevision: source.sheetRevision,
        operations,
      });
    };
    return {
      child,
      enrollment,
      scores,
      internal,
      reportingPeriodId,
      source,
      destination,
      slot,
      patch,
      url,
    };
  }

  it('T001 and T026 run the 20/30/50 grid through the canonical draft store and hide protected notes', async () => {
    const book = await liveGradebook('FULL-GRID');
    const schoolId = school.school.id;
    const legacy = () =>
      Promise.all([
        prisma.gradeItem.count({ where: { schoolId } }),
        prisma.homeworkSubmission.count({ where: { schoolId } }),
        prisma.behaviorRecord.count({ where: { schoolId } }),
        prisma.xpLedger.count({ where: { schoolId } }),
      ]);
    const before = await legacy();
    const commands = book.scores.map((field, index) =>
      scoreOperation(
        book.slot.id,
        field.id,
        ['18.00', '27.00', '46.00'][index],
      ),
    );
    const saved = gradebookOutputs.patch.parse(
      (
        await book
          .patch(commands, 'teacher-fixture', 'exact-grid-scores')
          .expect(200)
      ).body.data,
    );
    expect(saved.changedCells).toHaveLength(3);
    expect(saved.calculatedOutputs).toContainEqual(
      expect.objectContaining({
        value: { status: 'RECORDED', score: '91.00' },
        evaluation: {
          nominalMaxScore: '100.00',
          effectiveMaxScore: '100.00',
          normalizedPercentage: '91.000000',
        },
      }),
    );
    expect(
      (
        await book
          .patch(commands, 'teacher-fixture', 'exact-grid-scores')
          .expect(200)
      ).body.data,
    ).toEqual(saved);
    expect(await legacy()).toEqual(before);
    const privateText = 'Sensitive administrator-only note';
    const note = {
      slotId: book.slot.id,
      fieldId: book.internal.id,
      expectedCellVersion: 0,
      operation: 'SET',
      value: { status: 'RECORDED', text: privateText },
    };
    await withSchool('patch', book.url + '/cells')
      .send({
        expectedDefinitionVersionId: book.source.draftDefinitionVersionId,
        expectedSheetRevision: book.source.sheetRevision,
        operations: [note],
      })
      .expect(200);
    const staff = gradebookOutputs.grid.parse(
      (
        await withSchool(
          'get',
          book.url + '/grid?studentIds=' + book.child.id,
        ).expect(200)
      ).body.data,
    );
    expect(staff.rows.items[0].cells).toContainEqual(
      expect.objectContaining({ fieldId: book.internal.id, value: note.value }),
    );
    const teacherView = (
      await withTeacher(book.url + '/grid?studentIds=' + book.child.id).expect(
        200,
      )
    ).body.data;
    expect(gradebookOutputs.grid.parse(teacherView).rows.items[0].slotId).toBe(
      book.slot.id,
    );
    expect(JSON.stringify(teacherView)).not.toContain(privateText);
    expect(JSON.stringify(teacherView)).not.toContain(book.internal.id);
    await withTeacher(
      book.url + '/grid?selectedFieldIds=' + book.internal.id,
    ).expect(404);
    await book.patch([note]).expect(403);
  });

  it('T035 and T036 enforce missing-cell CAS and merge distinct cells for two allocated teachers', async () => {
    const book = await liveGradebook('CONCURRENT-GRID');
    const [first, second, third] = book.scores.map((item) => item.id);
    const same = await Promise.all([
      book.patch([scoreOperation(book.slot.id, first, '18.00')]),
      book.patch(
        [scoreOperation(book.slot.id, first, '17.00')],
        'co-teacher-fixture',
      ),
    ]);
    expect(same.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(
      same.find((response) => response.status === 409)?.body.error.code,
    ).toBe('official_results.cell.conflict');
    const others = await Promise.all([
      book.patch([scoreOperation(book.slot.id, second, '27.00')]),
      book.patch(
        [scoreOperation(book.slot.id, third, '46.00')],
        'co-teacher-fixture',
      ),
    ]);
    expect(others.map((response) => response.status)).toEqual([200, 200]);
    const rows = await prisma.resultCell.findMany({
      where: { slotId: book.slot.id },
      include: { revisions: true },
    });
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.revisions.length)).toEqual([1, 1, 1]);
    const sheet = await prisma.resultSheet.findUniqueOrThrow({
      where: { id: book.source.id },
    });
    expect(sheet.dataGeneration).toBe(book.source.dataGeneration + 3);
    expect(sheet.sheetRevision).toBe(book.source.sheetRevision);
  });

  it('T037 and T038 reject an atomic invalid paste, retain recorded zero and refuse a stale undo', async () => {
    const book = await liveGradebook('ATOMIC-GRID');
    const [first, second] = book.scores.map((field) => field.id);
    const failed = await book
      .patch([
        scoreOperation(book.slot.id, first, '0'),
        scoreOperation(book.slot.id, second, '99.00'),
      ])
      .expect(422);
    expect(failed.body.error.details.issues).toEqual([
      expect.objectContaining({
        fieldId: second,
        code: 'official_results.cell.invalid_value',
      }),
    ]);
    expect(
      await prisma.resultCell.count({ where: { slotId: book.slot.id } }),
    ).toBe(0);
    const data = gradebookOutputs.patch.parse(
      (await book.patch([scoreOperation(book.slot.id, first, '0')]).expect(200))
        .body.data,
    );
    expect(data.changedCells[0].value).toEqual({
      status: 'RECORDED',
      score: '0.00',
    });
    await book
      .patch(
        [scoreOperation(book.slot.id, first, '18.00', 1)],
        'co-teacher-fixture',
      )
      .expect(200);
    const clear = {
      slotId: book.slot.id,
      fieldId: first,
      expectedCellVersion: 1,
      operation: 'CLEAR',
      reason: 'Undo original edit',
    };
    await book.patch([clear]).expect(409);
    const latest = gradebookOutputs.patch.parse(
      (await book.patch([{ ...clear, expectedCellVersion: 2 }]).expect(200))
        .body.data,
    );
    expect(latest.changedCells[0]).toMatchObject({
      value: { status: 'MISSING' },
      cellVersion: 3,
    });
    const record = await prisma.resultCell.findFirstOrThrow({
      where: { slotId: book.slot.id, fieldId: first },
      include: { revisions: { orderBy: { version: 'asc' } } },
    });
    expect(record.revisions.map((row) => row.version)).toEqual([1, 2, 3]);
    expect(record.revisions[2].reason).toBe('Undo original edit');
  });

  it('reconciles a transfer on the same canonical slot with exact schema mapping and append-only placement history', async () => {
    const book = await liveGradebook('TRANSFER-GRID');
    const fieldId = book.scores[0].id;
    await book
      .patch([scoreOperation(book.slot.id, fieldId, '18.00')])
      .expect(200);
    const movedAt = new Date('2026-11-21T09:59:00.000Z');
    await prisma.enrollment.update({
      where: { id: book.enrollment.id },
      data: { endedAt: movedAt, status: 'COMPLETED' },
    });
    const enrollment = await prisma.enrollment.create({
      data: {
        schoolId: school.school.id,
        academicYearId: school.year.id,
        termId: school.term.id,
        classroomId: school.otherClassroom.id,
        studentId: book.child.id,
        enrolledAt: movedAt,
      },
    });
    const reconcileAsOf = '2026-11-21T10:02:00.000Z';
    const staleWrite = await book
      .patch([scoreOperation(book.slot.id, fieldId, '19.00', 1)])
      .expect(409);
    expect(staleWrite.body.error.code).toBe('official_results.roster.changed');
    const staleGrid = gradebookOutputs.grid.parse(
      (
        await withTeacher(
          book.url + '/grid?studentIds=' + book.child.id,
        ).expect(200)
      ).body.data,
    );
    expect(staleGrid.rows.items[0].placementStatus).toBe(
      'RECONCILIATION_REQUIRED',
    );
    const preview = gradebookOutputs.rosterPreview.parse(
      (
        await withSchool('post', book.url + '/roster-preview')
          .send({
            expectedRosterGeneration: book.source.rosterGeneration,
            rosterAsOf: reconcileAsOf,
            selectedSlotIds: [book.slot.id],
          })
          .expect(200)
      ).body.data,
    );
    expect(preview.changes).toEqual([
      expect.objectContaining({
        kind: 'MOVED',
        destinationSheetId: book.destination.id,
        destinationEnrollmentId: enrollment.id,
      }),
    ]);
    const change = {
      action: 'MOVE_DRAFT',
      slotId: book.slot.id,
      expectedPlacementRevision: book.slot.placementRevision,
      reason: 'Enrollment reassignment reviewed',
      destinationSheetId: book.destination.id,
      destinationEnrollmentId: enrollment.id,
      fieldMapping: [
        { fromFieldId: fieldId, toFieldId: fieldId, action: 'PRESERVE' },
      ],
    };
    const apply = () =>
      withSchool('post', book.url + '/roster-reconcile')
        .set('Idempotency-Key', 'reviewed-transfer')
        .send({
          previewId: preview.previewId,
          previewDigest: preview.previewDigest,
          expectedRosterGeneration: book.source.rosterGeneration,
          decisions: [change],
        });
    const result = gradebookOutputs.roster.parse(
      (await apply().expect(200)).body.data,
    );
    expect((await apply().expect(200)).body.data).toEqual(result);
    expect(
      await prisma.resultSlot.count({
        where: {
          studentId: book.child.id,
          reportingPeriodId: book.reportingPeriodId,
          groupId: math.id,
        },
      }),
    ).toBe(1);
    const transferred = await prisma.resultSlot.findUniqueOrThrow({
      where: { id: book.slot.id },
      include: { placementHistory: true, cells: true },
    });
    expect(transferred.sheetId).toBe(book.destination.id);
    expect(transferred.enrollmentId).toBe(enrollment.id);
    expect(transferred.cells[0].numericValue?.toString()).toBe('18');
    expect(transferred.cells[0].definitionVersionId).toBe(
      book.destination.draftDefinitionVersionId,
    );
    expect(transferred.placementHistory).toEqual([
      expect.objectContaining({
        version: 2,
        action: 'MOVE_DRAFT',
        fromSheetId: book.source.id,
        toSheetId: book.destination.id,
      }),
    ]);
    await withTeacher('/sheets/' + book.destination.id + '/grid').expect(404);
    const teacherView = await schoolApi()
      .get(
        instructor +
          '/sheets/' +
          book.destination.id +
          '/grid?studentIds=' +
          book.child.id,
      )
      .set('Authorization', 'Bearer co-teacher-fixture')
      .expect(200);
    expect(
      gradebookOutputs.grid.parse(teacherView.body.data).rows.items[0].slotId,
    ).toBe(book.slot.id);
  });

  it('records a school-only subject exemption and reinstatement without changing enrollment', async () => {
    const book = await liveGradebook('EXEMPTION-GRID');
    const change = async (action: 'EXEMPT_GROUP' | 'REINSTATE_GROUP') => {
      const sheet = await prisma.resultSheet.findUniqueOrThrow({
        where: { id: book.source.id },
      });
      const slot = await prisma.resultSlot.findUniqueOrThrow({
        where: { id: book.slot.id },
      });
      const preview = gradebookOutputs.rosterPreview.parse(
        (
          await withSchool('post', book.url + '/roster-preview')
            .send({
              expectedRosterGeneration: sheet.rosterGeneration,
              rosterAsOf: '2026-11-21T10:00:00.000Z',
              selectedSlotIds: [slot.id],
            })
            .expect(200)
        ).body.data,
      );
      expect(preview.changes[0].kind).toBe('APPLICABILITY');
      const input = {
        expectedRosterGeneration: sheet.rosterGeneration,
        previewId: preview.previewId,
        previewDigest: preview.previewDigest,
        decisions: [
          {
            slotId: slot.id,
            expectedPlacementRevision: slot.placementRevision,
            action,
            reason: 'Reviewed subject applicability',
          },
        ],
      };
      await schoolApi()
        .post(instructor + book.url + '/roster-reconcile')
        .set('Authorization', 'Bearer teacher-fixture')
        .set('Idempotency-Key', action)
        .send(input)
        .expect(404);
      await withSchool('post', book.url + '/roster-reconcile')
        .set('Idempotency-Key', action)
        .send(input)
        .expect(200);
    };
    await change('EXEMPT_GROUP');
    expect(
      (
        await prisma.resultSlot.findUniqueOrThrow({
          where: { id: book.slot.id },
        })
      ).groupExempt,
    ).toBe(true);
    await change('REINSTATE_GROUP');
    const current = await prisma.resultSlot.findUniqueOrThrow({
      where: { id: book.slot.id },
      include: { placementHistory: { orderBy: { version: 'asc' } } },
    });
    expect(current.groupExempt).toBe(false);
    expect(current.placementHistory.map((event) => event.action)).toEqual([
      'EXEMPT_GROUP',
      'REINSTATE_GROUP',
    ]);
    expect(
      await prisma.enrollment.findUniqueOrThrow({
        where: { id: book.enrollment.id },
      }),
    ).toEqual(book.enrollment);
  });

  async function readyRelease(code: string) {
    const book = await liveGradebook(code);
    await book
      .patch(
        book.scores.map((field, index) =>
          scoreOperation(
            book.slot.id,
            field.id,
            ['18.00', '27.00', '46.00'][index],
          ),
        ),
      )
      .expect(200);
    const field = await prisma.resultFieldDefinition.findFirstOrThrow({
      where: {
        definitionVersionId: book.source.draftDefinitionVersionId!,
        fieldId: book.scores[0].id,
      },
    });
    const releaseUnitId = field.releaseUnitId!;
    const capture = async (
      intent: 'REVIEW' | 'DIRECT_PUBLICATION' = 'REVIEW',
      expectedStatus = 202,
      auth = 'teacher-fixture',
    ) => {
      const slot = await prisma.resultSlot.findUniqueOrThrow({
        where: { id: book.slot.id },
      });
      const sheet = await prisma.resultSheet.findUniqueOrThrow({
        where: { id: slot.sheetId },
      });
      const response = await schoolApi()
        .post(
          (auth === 'school-fixture' ? management : instructor) + '/candidates',
        )
        .set('Authorization', 'Bearer ' + auth)
        .set('Idempotency-Key', randomUUID())
        .send({
          sheetId: sheet.id,
          expectedSheetRevision: sheet.sheetRevision,
          intent,
          units: [
            {
              slotId: slot.id,
              releaseUnitId,
              expectedSlotRevision: slot.revision,
            },
          ],
        })
        .expect(expectedStatus);
      if (expectedStatus !== 202) return null;
      const operation = releaseOutputs.operation.parse(response.body.data);
      const items = await schoolApi()
        .get(operation.itemsPath)
        .set('Authorization', 'Bearer ' + auth)
        .expect(200);
      const candidate = await withSchool(
        'get',
        '/candidates/' + items.body.data.items[0].candidateId,
      ).expect(200);
      return releaseOutputs.candidate.parse(candidate.body.data);
    };
    return { ...book, releaseUnitId, capture };
  }

  type ResultCandidateResponse = ReturnType<
    typeof releaseOutputs.candidate.parse
  >;
  const candidateRef = (
    candidate: ResultCandidateResponse,
    revision = candidate.candidateRevision,
  ) => ({
    candidateId: candidate.candidateId,
    expectedCandidateRevision: revision,
    contentDigest: candidate.contentDigest,
  });
  const decideCandidate = (
    candidate: ResultCandidateResponse,
    changes: Record<string, unknown> = {},
  ) =>
    withSchool('post', '/reviews/decisions')
      .set('Idempotency-Key', randomUUID())
      .send({
        candidateKind: 'RESULT_RELEASE',
        ...candidateRef(candidate),
        decision: 'APPROVE',
        ...changes,
      });
  const publishCandidate = (
    candidate: ResultCandidateResponse,
    generation: number,
    previous: string | null,
    auth = 'school-fixture',
    key = randomUUID(),
    mode: 'APPROVED' | 'DIRECT' = 'APPROVED',
  ) =>
    schoolApi()
      .post(
        (auth === 'school-fixture' ? management : instructor) +
          '/publication-batches',
      )
      .set('Authorization', 'Bearer ' + auth)
      .set('Idempotency-Key', key)
      .send({
        mode,
        candidateRefs: [
          {
            ...candidateRef(
              candidate,
              candidate.candidateRevision + (mode === 'APPROVED' ? 1 : 0),
            ),
            expectedPublicationGeneration: generation,
            expectedCurrentPublicationId: previous,
          },
        ],
      });

  it('T039, T043, T044 and T047 publish exact approved values, preserve the active revision during a correction, and CAS the replacement', async () => {
    const book = await readyRelease('MANAGED-RELEASE');
    await book.capture('DIRECT_PUBLICATION', 409);
    const candidate = (await book.capture())!;
    expect(candidate.status).toBe('SUBMITTED');
    await decideCandidate(candidate, { contentDigest: 'f'.repeat(64) }).expect(
      409,
    );
    await decideCandidate(candidate).expect(200);
    expect(
      await prisma.resultCurrentRelease.count({
        where: { slotId: book.slot.id },
      }),
    ).toBe(0);
    const preview = releaseOutputs.preview.parse(
      (
        await withSchool(
          'post',
          '/candidates/' + candidate.candidateId + '/preview',
        )
          .send({ audience: 'PARENT' })
          .expect(200)
      ).body.data,
    );
    expect(preview.result.groups[0].releases[0]).toMatchObject({
      status: 'PREVIEW',
      publicationId: null,
    });
    await publishCandidate(candidate, 0, null).expect(202);
    const original = await prisma.resultCurrentRelease.findFirstOrThrow({
      where: { slotId: book.slot.id },
      include: { publication: { include: { candidate: true } } },
    });
    const resultValue = (snapshot: unknown) =>
      releaseSnapshot
        .parse(snapshot)
        .fields.find((entry) => entry.definition.code === 'total')!.value;
    expect(resultValue(original.publication.candidate.snapshot)).toEqual({
      score: '91.00',
      status: 'RECORDED',
    });
    await schoolApi()
      .post(instructor + '/corrections')
      .set('Authorization', 'Bearer teacher-fixture')
      .set('Idempotency-Key', 'correct-managed')
      .send({
        publicationId: original.publicationId,
        expectedRevision: 1,
        expectedPublicationGeneration: 1,
        reason: 'Reviewed correction',
        operations: [
          scoreOperation(book.slot.id, book.scores[0].id, '19.00', 1),
        ],
      })
      .expect(201);
    expect(
      (
        await prisma.resultCurrentRelease.findFirstOrThrow({
          where: { slotId: book.slot.id },
        })
      ).publicationId,
    ).toBe(original.publicationId);
    const revised = (await book.capture())!;
    await decideCandidate(revised).expect(200);
    const race = await Promise.all([
      publishCandidate(revised, 1, original.publicationId),
      publishCandidate(revised, 1, original.publicationId),
    ]);
    expect(race.map((response) => response.status).sort()).toEqual([202, 409]);
    const current = await prisma.resultCurrentRelease.findFirstOrThrow({
      where: { slotId: book.slot.id },
      include: { publication: { include: { candidate: true } } },
    });
    expect(current.publication.predecessorId).toBe(original.publicationId);
    expect(current.publication.revision).toBe(2);
    expect(resultValue(current.publication.candidate.snapshot)).toEqual({
      score: '92.00',
      status: 'RECORDED',
    });
    expect(
      resultValue(
        (
          await prisma.resultReleaseCandidate.findUniqueOrThrow({
            where: { id: candidate.candidateId },
          })
        ).snapshot,
      ),
    ).toEqual({ score: '91.00', status: 'RECORDED' });
    const revoke = () =>
      withSchool('post', '/publications/' + current.publicationId + '/revoke')
        .set('Idempotency-Key', 'revoke-managed')
        .send({
          expectedPublicationId: current.publicationId,
          expectedRevision: 2,
          expectedPublicationGeneration: 2,
          reason: 'Revoked school result',
        })
        .expect(200);
    const revoked = releaseOutputs.publication.parse(
      (await revoke()).body.data,
    );
    expect((await revoke()).body.data).toEqual(revoked);
    expect(revoked.status).toBe('REVOKED');
    expect(
      await prisma.resultCurrentRelease.count({
        where: { slotId: book.slot.id },
      }),
    ).toBe(0);
    expect(
      await prisma.resultReleaseEvent.count({
        where: { publicationId: current.publicationId, event: 'REVOKED' },
      }),
    ).toBe(1);
  });

  it('T041 and T045 supersede an exact approval after an editor changes relevant values', async () => {
    const book = await readyRelease('SUPERSEDED-RELEASE');
    const candidate = (await book.capture())!;
    const decision = releaseOutputs.decision.parse(
      (await decideCandidate(candidate).expect(200)).body.data,
    );
    await book
      .patch(
        [scoreOperation(book.slot.id, book.scores[0].id, '19.00', 1)],
        'co-teacher-fixture',
      )
      .expect(200);
    expect(
      (
        await withSchool('get', '/candidates/' + candidate.candidateId).expect(
          200,
        )
      ).body.data.status,
    ).toBe('SUPERSEDED');
    await publishCandidate(candidate, 0, null).expect(409);
    expect(
      (
        await prisma.resultReviewDecision.findUniqueOrThrow({
          where: { id: decision.decisionId },
        })
      ).contentDigest,
    ).toBe(candidate.contentDigest);
    expect(
      await prisma.resultCurrentRelease.count({
        where: { slotId: book.slot.id },
      }),
    ).toBe(0);
  });

  it('T042 and T097 atomically replace a published FULL unit with disjoint reviewed releases', async () => {
    const book = await readyRelease('TOPOLOGY-RELEASE');
    const original = (await book.capture())!;
    await decideCandidate(original).expect(200);
    await publishCandidate(original, 0, null).expect(202);
    const current = await prisma.resultCurrentRelease.findFirstOrThrow({
      where: { slotId: book.slot.id },
    });
    const sheet = await prisma.resultSheet.findUniqueOrThrow({
      where: { id: book.source.id },
      include: { draftDefinition: true },
    });
    const snapshot = releaseSnapshot.parse(
      (
        await prisma.resultReleaseCandidate.findUniqueOrThrow({
          where: { id: original.candidateId },
        })
      ).snapshot,
    );
    const stored = sheet.draftDefinition!.configuration as {
      resolvedDefinition: {
        fields: { id: string; code: string }[];
        releaseUnits: object[];
      };
    };
    const originalFields = stored.resolvedDefinition.fields;
    const { id: _unitId, ...originalUnit } = snapshot.unit;
    const firstIds = book.scores.slice(0, 2).map((field) => field.id);
    const secondIds = [book.scores[2].id];
    const retained = [...firstIds, ...secondIds];
    const definition = {
      ...stored.resolvedDefinition,
      fields: originalFields
        .filter(
          (field) =>
            retained.includes(field.id) || field.code === 'internal_note',
        )
        .map((field) =>
          field.code === 'internal_note'
            ? field
            : {
                ...field,
                releaseUnitId: undefined,
                clientUnitKey: firstIds.includes(field.id) ? 'work' : 'exam',
              },
        ),
      releaseUnits: [
        {
          ...originalUnit,
          clientUnitKey: 'work',
          code: 'WORK',
          outputFieldIds: firstIds,
        },
        {
          ...originalUnit,
          clientUnitKey: 'exam',
          code: 'EXAM',
          outputFieldIds: secondIds,
        },
      ],
    };
    const design = authoringOutputs.design.parse(
      (
        await withSchool('post', '/designs')
          .set('Idempotency-Key', 'stage-split-release')
          .send({
            sheetId: sheet.id,
            expectedDefinitionVersionId: sheet.draftDefinitionVersionId,
            expectedSheetRevision: sheet.sheetRevision,
            definition,
            reason: 'Review separately published coursework and exam',
          })
          .expect(201)
      ).body.data,
    );
    const path = '/sheets/' + sheet.id + '/draft-definition-';
    const map = retained.map((fieldId) => ({
      fromFieldId: fieldId,
      toFieldId: fieldId,
      action: 'PRESERVE',
    }));
    const preview = authoringOutputs.definitionPreview.parse(
      (
        await withSchool('post', path + 'preview')
          .send({
            targetDefinitionVersionId: design.definitionVersionId,
            expectedDefinitionVersionId: sheet.draftDefinitionVersionId,
            expectedSheetRevision: design.sheetRevision,
            fieldMapping: map,
          })
          .expect(200)
      ).body.data,
    );
    await withSchool('post', path + 'adopt')
      .set('Idempotency-Key', 'adopt-split-release')
      .send({
        previewId: preview.previewId,
        previewDigest: preview.previewDigest,
        expectedSheetRevision: design.sheetRevision,
      })
      .expect(200);
    await withSchool('post', '/designs/' + design.candidateId + '/decisions')
      .set('Idempotency-Key', 'accept-split-release')
      .send({
        definitionVersionId: design.definitionVersionId,
        contentDigest: design.contentDigest,
        decision: 'APPROVE',
      })
      .expect(200);
    const [newSheet, slot] = await Promise.all([
      prisma.resultSheet.findUniqueOrThrow({ where: { id: sheet.id } }),
      prisma.resultSlot.findUniqueOrThrow({ where: { id: book.slot.id } }),
    ]);
    const capture = releaseOutputs.operation.parse(
      (
        await withSchool('post', '/candidates')
          .set('Idempotency-Key', 'capture-split-release')
          .send({
            sheetId: sheet.id,
            expectedSheetRevision: newSheet.sheetRevision,
            intent: 'REVIEW',
            units: design.definition.releaseUnits.map((unit) => ({
              slotId: slot.id,
              releaseUnitId: unit.id,
              expectedSlotRevision: slot.revision,
            })),
          })
          .expect(202)
      ).body.data,
    );
    const items = (
      await schoolApi()
        .get(capture.itemsPath)
        .set('Authorization', 'Bearer school-fixture')
        .expect(200)
    ).body.data.items as { candidateId: string }[];
    const refs = [];
    for (const { candidateId } of items) {
      const candidate = releaseOutputs.candidate.parse(
        (await withSchool('get', '/candidates/' + candidateId).expect(200)).body
          .data,
      );
      await decideCandidate(candidate).expect(200);
      refs.push(candidateRef(candidate, candidate.candidateRevision + 1));
      await publishCandidate(candidate, 1, null).expect(409);
    }
    expect(
      await prisma.resultCurrentRelease.count({
        where: { slotId: slot.id, publicationId: current.publicationId },
      }),
    ).toBe(1);
    const topology = '/slots/' + slot.id + '/publication-topology';
    const plan = releaseOutputs.topologyPreview.parse(
      (
        await withSchool('post', topology + '/preview')
          .send({
            expectedPublicationGeneration: 1,
            expectedActivePublicationIds: [current.publicationId],
            targetDefinitionVersionId: design.definitionVersionId,
            candidateRefs: refs,
            preservedPublicationIds: [],
            reason: 'Replace full result with two independent releases',
          })
          .expect(200)
      ).body.data,
    );
    const replace = (key: string) =>
      withSchool('post', topology + '/replace')
        .set('Idempotency-Key', key)
        .send({
          previewId: plan.previewId,
          previewDigest: plan.previewDigest,
          expectedPublicationGeneration: 1,
        });
    const race = await Promise.all([
      replace('replace-full-release-a'),
      replace('replace-full-release-b'),
    ]);
    expect(race.map((outcome) => outcome.status).sort()).toEqual([200, 409]);
    const result = releaseOutputs.composition.parse(
      race.find((outcome) => outcome.status === 200)!.body.data,
    );
    expect(result.replacedPublicationIds).toEqual([current.publicationId]);
    expect(result.activePublications).toHaveLength(2);
    expect(result.publicationGeneration).toBe(2);
  });

  it('T040 and T046 enforce distinct reviewers and keep direct authorization free of a fake approval', async () => {
    const active = resultContracts.policy.parse(
      (await withSchool('get', '/policy').expect(200)).body.data,
    );
    const reviewedPolicy = await activatePolicy(
      { teacherMode: 'MANAGED', requireDistinctApprover: true },
      active.policyVersionId,
      'release-distinct',
    );
    const reviewed = await readyRelease('DISTINCT-REVIEWER');
    const own = (await reviewed.capture('REVIEW', 202, 'school-fixture'))!;
    await decideCandidate(own).expect(403);

    const policy = await activatePolicy(
      { teacherMode: 'AUTONOMOUS' },
      reviewedPolicy.result.policyVersionId,
      'release-autonomous',
    );
    const direct = await readyRelease('AUTONOMOUS-RELEASE');
    const frozen = (await direct.capture('DIRECT_PUBLICATION'))!;
    expect(frozen.status).toBe('READY_FOR_DIRECT');
    teacherPermissions.push('official_results.publications.publish');
    try {
      await publishCandidate(
        frozen,
        0,
        null,
        'teacher-fixture',
        randomUUID(),
        'DIRECT',
      ).expect(202);
    } finally {
      teacherPermissions.pop();
    }
    const publication = await prisma.resultPublication.findFirstOrThrow({
      where: { candidateId: frozen.candidateId },
    });
    expect(publication.authorizationMode).toBe('DIRECT');
    expect(publication.reviewDecisionId).toBeNull();
    expect(
      await prisma.resultReviewDecision.count({
        where: { candidateId: frozen.candidateId },
      }),
    ).toBe(0);
    await activatePolicy(
      { teacherMode: 'MANAGED', familyHistoryEnabled: true },
      policy.result.policyVersionId,
      'restore-managed-release',
    );
  });

  async function attachFamilyMembership(
    user: { id: string; userType: 'STUDENT' | 'PARENT' },
    schoolFixture: SchoolFixture,
  ) {
    const { school } = schoolFixture;
    const role = await prisma.role.create({
      data: {
        schoolId: school.id,
        key: 'family-' + user.id,
        name: 'Official Results Family',
      },
    });
    const codes = ['official_results.results.view'];
    await attachPermissions(role.id, codes);
    const membership = await prisma.membership.create({
      data: {
        schoolId: school.id,
        organizationId: school.organizationId,
        userId: user.id,
        userType: user.userType,
        roleId: role.id,
      },
    });
    const token = 'Bearer family-' + randomUUID();
    familyScopes.set(token, {
      ...createRequestContext(),
      actor: user,
      activeMembership: {
        membershipId: membership.id,
        roleId: role.id,
        schoolId: school.id,
        organizationId: school.organizationId,
        permissions: codes,
      },
    });
    return { token, membership };
  }

  async function familyUser(userType: 'STUDENT' | 'PARENT') {
    const account = await prisma.user.create({
      data: {
        email: 'result-family-' + randomUUID() + '@example.invalid',
        firstName: 'Results',
        lastName: 'Family',
        userType,
      },
      select: { id: true },
    });
    return { ...account, userType };
  }

  it('T048–T053 and T056 project only released fields and verify live historical identity', async () => {
    const book = await readyRelease('FAMILY-SAFE');
    const learner = await familyUser('STUDENT');
    const parent = await familyUser('PARENT');
    const [access, parentAccess] = await Promise.all([
      attachFamilyMembership(learner, school),
      attachFamilyMembership(parent, school),
    ]);
    await prisma.student.update({
      where: { id: book.child.id },
      data: { userId: learner.id },
    });
    const guardian = await prisma.guardian.create({
      data: {
        schoolId: school.school.id,
        organizationId: school.school.organizationId,
        userId: parent.id,
        firstName: 'Test',
        lastName: 'Guardian',
        phone: '+20000000000',
        relation: 'MOTHER',
      },
    });
    const link = await prisma.studentGuardian.create({
      data: {
        schoolId: school.school.id,
        guardianId: guardian.id,
        studentId: book.child.id,
      },
    });
    const periodPath = '/official-results/periods/' + book.reportingPeriodId;
    const studentResult = (token = access.token) =>
      schoolApi()
        .get(api + '/student' + periodPath + '/result')
        .set('Authorization', token);
    const parentResult = (childId = book.child.id) =>
      schoolApi()
        .get(api + '/parent/children/' + childId + periodPath + '/result')
        .set('Authorization', parentAccess.token);
    await studentResult().expect(404);
    const candidate = (await book.capture())!;
    const preview = releaseOutputs.preview.parse(
      (
        await withSchool(
          'post',
          '/candidates/' + candidate.candidateId + '/preview',
        )
          .send({ audience: 'STUDENT' })
          .expect(200)
      ).body.data,
    );
    await decideCandidate(candidate).expect(200);
    await parentResult().expect(404);
    await publishCandidate(candidate, 0, null).expect(202);
    const verified = familyOutputs.result.parse(
      (await studentResult().expect(200)).body.data,
    );
    const published = verified.groups[0].releases[0];
    expect(published.fields).toEqual(
      preview.result.groups[0].releases[0].fields,
    );
    expect(published).toMatchObject({
      status: 'PUBLISHED',
      revision: 1,
      academicPlacement: { classroom: { id: school.classroom.id } },
    });
    expect(
      await prisma.resultReadEntitlement.count({
        where: { studentId: book.child.id, schoolId: school.school.id },
      }),
    ).toBe(2);
    expect(JSON.stringify(verified)).not.toContain(book.internal.id);
    expect(JSON.stringify(verified)).not.toContain('formula');
    await withSchool('patch', book.url + '/cells')
      .send({
        expectedDefinitionVersionId: book.source.draftDefinitionVersionId,
        expectedSheetRevision: book.source.sheetRevision,
        operations: [
          {
            slotId: book.slot.id,
            fieldId: book.internal.id,
            expectedCellVersion: 0,
            operation: 'SET',
            value: { status: 'RECORDED', text: 'Restricted unpublished note' },
          },
        ],
      })
      .expect(200);
    await withSchool('post', '/corrections')
      .set('Idempotency-Key', 'pending-family-correction')
      .send({
        publicationId: published.publicationId,
        expectedRevision: 1,
        expectedPublicationGeneration: 1,
        reason: 'Restricted correction reason',
        operations: [
          scoreOperation(book.slot.id, book.scores[0].id, '19.00', 1),
        ],
      })
      .expect(201);
    expect(
      familyOutputs.result.parse((await parentResult().expect(200)).body.data)
        .groups[0].releases[0].fields,
    ).toEqual(verified.groups[0].releases[0].fields);
    const peer = await school.addStudent('Unlinked peer');
    await parentResult(peer.id).expect(404);
    await schoolApi()
      .get(api + '/student' + periodPath + '/result?studentId=' + peer.id)
      .set('Authorization', access.token)
      .expect(400);

    await prisma.enrollment.update({
      where: { id: book.enrollment.id },
      data: {
        status: 'COMPLETED',
        endedAt: new Date('2026-11-21T10:02:00.000Z'),
      },
    });
    expect((await studentResult().expect(200)).body.data.viewVersion).toBe(
      verified.viewVersion,
    );
    await parentResult().expect(200);
    await prisma.studentGuardian.delete({ where: { id: link.id } });
    await parentResult().expect(404);

    const moved = await otherSchool.addStudent('A separate enrollment');
    const other = await attachFamilyMembership(learner, otherSchool);
    await prisma.student.update({
      where: { id: book.child.id },
      data: { userId: null },
    });
    await prisma.student.update({
      where: { id: moved.id },
      data: { userId: learner.id },
    });
    await prisma.membership.update({
      where: { id: access.membership.id },
      data: { endedAt: new Date() },
    });
    expect(
      (await studentResult(other.token).expect(200)).body.data.resultSetId,
    ).toBe(verified.resultSetId);
    await prisma.user.update({
      where: { id: learner.id },
      data: { status: 'DISABLED' },
    });
    await studentResult(other.token).expect(404);
    await prisma.user.update({
      where: { id: learner.id },
      data: { status: 'ACTIVE' },
    });
    await prisma.resultReadEntitlement.updateMany({
      where: {
        schoolId: school.school.id,
        studentId: book.child.id,
        actorId: learner.id,
      },
      data: {
        revokedAt: new Date(),
        revokedById: school.actor.id,
        revokeReason: 'Test a verified revocation',
      },
    });
    await studentResult(other.token).expect(404);
    const stranger = await familyUser('STUDENT');
    const strangerScope = await attachFamilyMembership(stranger, otherSchool);
    await studentResult(strangerScope.token).expect(404);
  });

  it('T054 binds aggregate review to published sources and stales an active summary on source revocation', async () => {
    const book = await readyRelease('AGGREGATE-SAFE');
    const learner = await familyUser('STUDENT');
    const scope = await attachFamilyMembership(learner, school);
    await prisma.student.update({
      where: { id: book.child.id },
      data: { userId: learner.id },
    });
    const candidate = (await book.capture())!;
    await decideCandidate(candidate).expect(200);
    await publishCandidate(candidate, 0, null).expect(202);
    const active = await prisma.resultCurrentRelease.findFirstOrThrow({
      where: { slotId: book.slot.id },
      include: { publication: { include: { candidate: true } } },
    });
    const snapshot = releaseSnapshot.parse(
      active.publication.candidate.snapshot,
    );
    const ref = { groupId: math.id, releaseUnitId: book.releaseUnitId };
    const profile = aggregateOutputs.profile.parse(
      (
        await withSchool('post', '/aggregate-profiles')
          .set('Idempotency-Key', 'new-summary')
          .send({
            expectedProfileRevision: 0,
            definition: {
              code: 'summary',
              label: { ar: 'مجموع', en: 'Overall result' },
              reportingPeriodSelector: {
                kind: 'EXACT_PERIODS',
                periodIds: [book.reportingPeriodId],
              },
              inputs: [
                {
                  ...ref,
                  fieldId: snapshot.fields.find(
                    (field) => field.definition.code === 'total',
                  )!.definition.id,
                },
              ],
              operation: 'SUM_POINTS',
              requiredCoverage: [ref],
              audiences: ['STUDENT', 'PARENT'],
              calculationPolicy: {
                displayRounding: { mode: 'HALF_UP', scale: 2 },
              },
            },
          })
          .expect(201)
      ).body.data,
    );
    const capture = async (key: string) =>
      aggregateOutputs.candidate.parse(
        (
          await withSchool('post', '/aggregate-candidates')
            .set('Idempotency-Key', key)
            .send({
              studentId: book.child.id,
              reportingPeriodId: book.reportingPeriodId,
              profileVersionId: profile.profileVersionId,
              sourcePublicationIds: [active.publicationId],
            })
            .expect(201)
        ).body.data,
      );
    const approve = (
      staged: ReturnType<typeof aggregateOutputs.candidate.parse>,
      candidateKind = 'AGGREGATE',
    ) =>
      withSchool('post', '/reviews/decisions')
        .set('Idempotency-Key', randomUUID())
        .send({
          candidateKind,
          candidateId: staged.candidateId,
          expectedCandidateRevision: staged.candidateRevision,
          contentDigest: staged.contentDigest,
          decision: 'APPROVE',
        });
    const publish = (
      staged: ReturnType<typeof aggregateOutputs.candidate.parse>,
      previous: string | null,
    ) =>
      withSchool('post', '/aggregate-publications')
        .set('Idempotency-Key', randomUUID())
        .send({
          candidateId: staged.candidateId,
          expectedCandidateRevision: staged.candidateRevision + 1,
          contentDigest: staged.contentDigest,
          expectedCurrentAggregatePublicationId: previous,
        });
    const staged = await capture('capture-summary');
    await approve(staged, 'RESULT_RELEASE').expect(404);
    await approve(staged).expect(200);
    const aggregate = aggregateOutputs.publication.parse(
      (await publish(staged, null).expect(201)).body.data,
    );
    const result = await schoolApi()
      .get(
        api +
          '/student/official-results/periods/' +
          book.reportingPeriodId +
          '/result',
      )
      .set('Authorization', scope.token)
      .expect(200);
    expect(familyOutputs.result.parse(result.body.data).summary).toMatchObject({
      status: 'ACTIVE',
      overallScore: '91.00',
      overallMaxScore: '100.00',
    });
    const pending = await capture('capture-summary-before-revoke');
    await approve(pending).expect(200);
    await withSchool('post', '/corrections')
      .set('Idempotency-Key', 'correct-summary-input')
      .send({
        publicationId: active.publicationId,
        expectedRevision: 1,
        expectedPublicationGeneration: 1,
        reason: 'Source superseded',
        operations: [
          scoreOperation(book.slot.id, book.scores[0].id, '19.00', 1),
        ],
      })
      .expect(201);
    const corrected = (await book.capture())!;
    await decideCandidate(corrected).expect(200);
    await publishCandidate(corrected, 1, active.publicationId).expect(202);
    await publish(pending, aggregate.publicationId).expect(409);
    expect(
      (
        await prisma.resultCurrentAggregate.findFirstOrThrow({
          where: { publicationId: aggregate.publicationId },
        })
      ).stale,
    ).toBe(true);
    const safe = await schoolApi()
      .get(
        api +
          '/student/official-results/periods/' +
          book.reportingPeriodId +
          '/result',
      )
      .set('Authorization', scope.token)
      .expect(200);
    expect(familyOutputs.result.parse(safe.body.data).summary).toMatchObject({
      status: 'STALE',
      overallScore: null,
      overallMaxScore: null,
    });
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
