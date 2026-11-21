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
    expect(registered).toHaveLength(59);
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
