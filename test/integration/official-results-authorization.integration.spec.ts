import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Logger, ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { UserType } from '@prisma/client';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { parse as parseCsv } from 'csv-parse/sync';
import { QueueModule } from '../../src/infrastructure/queue/queue.module';
import { BullmqService } from '../../src/infrastructure/queue/bullmq.service';
import { ResultBulkProcessor } from '../../src/modules/official-results/infrastructure/result-bulk.processor';
import { ImportValidationWorker } from '../../src/modules/files/imports/infrastructure/import-validation.worker';
import { FILES_IMPORT_RECONCILE_JOB_NAME } from '../../src/modules/files/imports/domain/import-job.types';
import { ImportJobsRepository } from '../../src/modules/files/imports/infrastructure/import-jobs.repository';
import { ImportValidationReconciliationService } from '../../src/modules/files/imports/application/import-validation-reconciliation.service';
import { ProcessImportValidationUseCase } from '../../src/modules/files/imports/application/process-import-validation.use-case';
import { StudentBulkRegistrationExecutionReconciliationService } from '../../src/modules/students/registration/application/student-bulk-registration-execution-reconciliation.service';
import { registerOfficialResultsJson } from '../../src/modules/official-results/infrastructure/result-json-transport';
import { ResultImportApplyService } from '../../src/modules/official-results/application/result-import-apply.service';
import { resultsBulkQueue } from '../../src/modules/official-results/domain/result-export.contract';
import { resultApplyImportJob } from '../../src/modules/official-results/domain/result-import-execution.contract';
import {
  renderResultsXlsx,
  resultsXlsxMediaType,
} from '../../src/modules/official-results/domain/result-xlsx-export';
import { parseResultsXlsx } from '../../src/modules/official-results/domain/result-xlsx-import';
import { reportOutputs } from '../../src/modules/official-results/dto/result-reports.dto';
import { ResultNoticeService } from '../../src/modules/official-results/application/result-notice.service';
import { ResultExportService } from '../../src/modules/official-results/application/result-export.service';
import { ResultImportWorkService } from '../../src/modules/official-results/application/result-import-work.service';
import { exportOutputs } from '../../src/modules/official-results/dto/result-export.dto';
import { importOutputs } from '../../src/modules/official-results/dto/result-import.dto';
import { csvRecord } from '../../src/modules/official-results/domain/result-csv';
import { resultContentDigest } from '../../src/modules/official-results/domain/result-content-digest';
import type { ExportManifest } from '../../src/modules/official-results/domain/result-export.contract';
import {
  createRequestContext,
  getRequestContext,
  runWithRequestContext,
} from '../../src/common/context/request-context';
import { GlobalExceptionFilter } from '../../src/common/exceptions/global-exception.filter';
import { PermissionsGuard } from '../../src/common/guards/permissions.guard';
import { PRISMA_CLIENT_OPTIONS } from '../../src/infrastructure/database/prisma-client-options.provider';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { StorageService } from '../../src/infrastructure/storage/storage.service';
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
import {
  OfficialResultsModule,
  OfficialResultsServicesModule,
} from '../../src/modules/official-results/official-results.module';
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
  jest.setTimeout(45_000);
  const prisma = new PrismaService({
    log: [{ emit: 'event', level: 'query' }],
  });
  let observedQueries = 0;
  const listenToQueries = prisma.$on.bind(prisma) as (
    event: 'query',
    listener: () => void,
  ) => void;
  listenToQueries('query', () => {
    observedQueries += 1;
  });
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
        OfficialResultsServicesModule,
        QueueModule,
      ],
      providers: [
        ImportValidationWorker,
        ResultBulkProcessor,
        { provide: ImportJobsRepository, useValue: {} },
        { provide: ProcessImportValidationUseCase, useValue: {} },
        {
          provide: ImportValidationReconciliationService,
          useValue: { reconcile: async () => {} },
        },
        {
          provide: StudentBulkRegistrationExecutionReconciliationService,
          useValue: { reconcile: async () => {} },
        },
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(PRISMA_CLIENT_OPTIONS)
      .useValue({})
      .compile();
    app = module.createNestApplication();
    registerOfficialResultsJson(app);
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
      contracts: Record<string, { kind: string; requiredFields: string[] }>;
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
                      format?: string;
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
    expect(registered).toHaveLength(137);
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
      const content = endpoint.responses[operation.successStatus].content;
      const contract = catalog.contracts[operation.outputContract];
      if (contract.kind === 'binary') {
        const schemas = Object.values(content ?? {});
        expect(schemas.length).toBeGreaterThan(0);
        expect(schemas.every(({ schema }) => schema?.format === 'binary')).toBe(
          true,
        );
      } else {
        expect(
          content?.['application/json'].schema?.properties?.data?.required,
        ).toEqual(expect.arrayContaining(contract.requiredFields));
      }
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
    await schoolApi()
      .post(instructor + '/publication-batches')
      .set('Authorization', 'Bearer teacher-fixture')
      .set('Idempotency-Key', randomUUID())
      .send({ mode: 'DIRECT', candidateRefs: [] })
      .expect(403);
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

  it('T011, T016, T017, T021 and T022 clone, customize and pin a school version on canonical sheets', async () => {
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
    const stagePeriodId = await authoringPeriod('STAGE-COVERAGE');
    await withSchool('post', '/scope-assignments')
      .set('Idempotency-Key', 'stage-coverage')
      .send({
        expectedScopeRevision: 1,
        assignment: {
          academicScope: { level: 'STAGE', ids: [school.stage.id] },
          groupScope: { kind: 'SUBJECTS', subjectIds: [school.subject.id] },
          periodSelector: {
            kind: 'EXACT_PERIODS',
            periodIds: [stagePeriodId],
          },
          mode: 'REPLACE',
          templateVersionId: v1.templateVersionId,
          enabled: true,
        },
      })
      .expect(201);
    const resolve = (actor: 'school' | 'teacher') =>
      schoolApi()
        .post(
          (actor === 'school' ? management : instructor) + '/scope-resolutions',
        )
        .set('Authorization', 'Bearer ' + actor + '-fixture')
        .send({
          reportingPeriodId: stagePeriodId,
          academicScope: { level: 'SCHOOL', ids: [] },
          groupIds: [math.id],
          rosterAsOf: '2026-11-21T10:00:00.000Z',
        })
        .expect(200);
    const stage = authoringOutputs.resolution.parse(
      (await resolve('school')).body.data,
    );
    expect(stage.tuples).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          classroomId: added.id,
          templateVersionId: v1.templateVersionId,
        }),
      ]),
    );
    const visible = authoringOutputs.resolution.parse(
      (await resolve('teacher')).body.data,
    );
    expect(visible.tuples.map(({ classroomId }) => classroomId)).toEqual([
      school.classroom.id,
    ]);
    const v1Scores = v1.definition.fields.filter(
      ({ kind }) => kind === 'SCORE',
    );
    await withSchool('patch', '/sheets/' + sheetId + '/cells')
      .send({
        expectedDefinitionVersionId: current.draftDefinitionVersionId,
        expectedSheetRevision: current.sheetRevision,
        operations: v1Scores.map((field, index) =>
          scoreOperation(
            current.slots[0].id,
            field.id,
            ['18.00', '27.00', '46.00'][index],
          ),
        ),
      })
      .expect(200);
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
    const pinnedField = v1.definition.fields[0];
    const editable = await editableExport({
      reportingPeriodId,
      slot: current.slots[0],
      scores: [pinnedField],
    });
    expect(editable.rows[0][18]).toContain('[f:' + pinnedField.id + ':value]');
    expect(editable.rows[1][18]).toBe('18.00');
    const pinnedCandidate = (await captureRelease(
      current.slots[0].id,
      v1Scores[0].releaseUnitId!,
    ))!;
    expect(pinnedCandidate.definitionVersionId).toBe(
      current.draftDefinitionVersionId,
    );
    await decideCandidate(pinnedCandidate).expect(200);
    await publishCandidate(pinnedCandidate, 0, null).expect(202);
    const pinnedPublication = await prisma.resultPublication.findFirstOrThrow({
      where: { candidateId: pinnedCandidate.candidateId },
      include: { candidate: true },
    });
    const published = releaseSnapshot.parse(
      pinnedPublication.candidate.snapshot,
    );
    expect(
      published.fields.find(({ definition }) => definition.code === 'total')
        ?.value,
    ).toEqual({ status: 'RECORDED', score: '91.00' });
    const pinnedManifest = await prisma.resultExportFile.findUniqueOrThrow({
      where: { id: editable.job.files[0].fileId },
    });
    const manifest = pinnedManifest.manifest as unknown as ExportManifest;
    expect(manifest.sheets[0].definitionVersionId).toBe(
      current.draftDefinitionVersionId,
    );
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
    const beforeUpgrade = await stagedGrade(
      { reportingPeriodId, slot, scores: [{ id: fieldId }] },
      '19.00',
    );
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
    await confirmImport(
      beforeUpgrade.batch.batchId,
      confirmation(beforeUpgrade.batch),
    ).expect(409);
    const { batch } = await stagedGrade(
      { reportingPeriodId, slot, scores: [{ id: fieldId }] },
      '19.00',
    );
    const applied = importOutputs.execution.parse(
      (await confirmImport(batch.batchId, confirmation(batch)).expect(202)).body
        .data,
    );
    expect((await waitForOperation(applied.operationId)).status).toBe(
      'APPLIED',
    );
    expect((await loadSheet()).lastAcceptedDefinitionVersionId).toBeNull();
    expect(
      (
        await prisma.resultCell.findUniqueOrThrow({ where: { id: cell.id } })
      ).numericValue?.toString(),
    ).toBe('19');
    expect(
      await prisma.resultCurrentRelease.count({ where: { slotId: slot.id } }),
    ).toBe(0);
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
    await exportTeacher('post', '/exports/preview')
      .send({
        reportingPeriodId,
        academicScope: { level: 'CLASSROOM', ids: [school.classroom.id] },
        groupIds: [math.id],
        format: 'CSV',
        mode: 'EDIT_DRAFT',
        selectedFieldIds: [fieldId],
        selectedSlotIds: [slot.id],
      })
      .expect(404);
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

  async function liveGradebook(
    code: string,
    parallelClass = false,
    customize?: (
      definition: ReturnType<typeof moazezStarterDefinition>,
    ) => void,
  ) {
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
    const parallel = parallelClass
      ? await school.addStudent(code + '-peer')
      : null;
    if (parallel)
      await prisma.enrollment.create({
        data: {
          schoolId: school.school.id,
          academicYearId: school.year.id,
          termId: school.term.id,
          studentId: parallel.id,
          classroomId: school.otherClassroom.id,
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
    customize?.(definition);
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
    const parallelSlot = parallel
      ? await prisma.resultSlot.findFirstOrThrow({
          where: { sheetId: destination.id, studentId: parallel.id },
        })
      : null;
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
      definition,
      reportingPeriodId,
      source,
      destination,
      slot,
      parallelSlot,
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

  async function readyRelease(
    code: string,
    customize?: Parameters<typeof liveGradebook>[2],
    enteredScores = 3,
  ) {
    const book = await liveGradebook(code, false, customize);
    await book
      .patch(
        book.scores
          .slice(0, enteredScores)
          .map((field, index) =>
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
    return {
      ...book,
      releaseUnitId,
      capture: (
        intent: 'REVIEW' | 'DIRECT_PUBLICATION' = 'REVIEW',
        expectedStatus = 202,
        auth = 'teacher-fixture',
      ) =>
        captureRelease(
          book.slot.id,
          releaseUnitId,
          intent,
          expectedStatus,
          auth,
        ),
    };
  }

  async function captureRelease(
    slotId: string,
    releaseUnitId: string,
    intent: 'REVIEW' | 'DIRECT_PUBLICATION' = 'REVIEW',
    expectedStatus = 202,
    auth = 'teacher-fixture',
  ) {
    const slot = await prisma.resultSlot.findUniqueOrThrow({
      where: { id: slotId },
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
    const learner = await familyUser('STUDENT');
    const access = await attachFamilyMembership(learner, school);
    await prisma.student.update({
      where: { id: book.child.id },
      data: { userId: learner.id },
    });
    const learnerResults = api + '/student/official-results';
    const viewed = (path: string) =>
      schoolApi()
        .get(learnerResults + path)
        .set('Authorization', access.token);
    const readPublication = async (id: string) =>
      familyOutputs.result
        .parse((await viewed('/publications/' + id).expect(200)).body.data)
        .groups[0].releases[0].fields.find(({ code }) => code === 'total')
        ?.value;
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
    expect(await readPublication(current.publicationId)).toMatchObject({
      score: '92.00',
    });
    expect(await readPublication(original.publicationId)).toMatchObject({
      score: '91.00',
    });
    const history = await viewed(
      '/periods/' + book.reportingPeriodId + '/history',
    ).expect(200);
    expect(history.body.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          publicationId: original.publicationId,
          revision: 1,
        }),
        expect.objectContaining({
          publicationId: current.publicationId,
          revision: 2,
        }),
      ]),
    );
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

  it('T042 publishes only the selected formative unit and exposes its partial status', async () => {
    const previous = resultContracts.policy.parse(
      (await withSchool('get', '/policy').expect(200)).body.data,
    );
    const { result } = await activatePolicy(
      { allowPartialProgressPublication: true },
      previous.policyVersionId,
      randomUUID(),
    );
    try {
      const book = await readyRelease(
        'PARTIAL-RELEASE',
        (definition) => {
          const scores = definition.fields.filter(
            ({ kind }) => kind === 'SCORE',
          );
          definition.fields = scores;
          const progress = definition.releaseUnits[0];
          progress.classification = 'PROGRESS';
          progress.outputFieldIds = scores.slice(0, 2).map(({ id }) => id);
          const examUnitId = randomUUID();
          scores[2].releaseUnitId = examUnitId;
          definition.releaseUnits.push({
            ...progress,
            id: examUnitId,
            code: 'EXAM',
            order: 1,
            classification: 'FINAL',
            outputFieldIds: [scores[2].id],
          });
        },
        1,
      );
      const learner = await familyUser('STUDENT');
      const access = await attachFamilyMembership(learner, school);
      await prisma.student.update({
        where: { id: book.child.id },
        data: { userId: learner.id },
      });
      const candidate = (await book.capture())!;
      await decideCandidate(candidate).expect(200);
      await publishCandidate(candidate, 0, null).expect(202);
      const read = await schoolApi()
        .get(
          api +
            '/student/official-results/periods/' +
            book.reportingPeriodId +
            '/result',
        )
        .set('Authorization', access.token)
        .expect(200);
      const released = familyOutputs.result.parse(read.body.data).groups[0]
        .releases;
      expect(released).toHaveLength(1);
      expect(released[0]).toMatchObject({
        releaseUnitId: book.releaseUnitId,
        completeness: 'PARTIAL',
      });
      expect(
        released[0].fields.map(({ fieldId, value }) => [fieldId, value.status]),
      ).toEqual([
        [book.scores[0].id, 'RECORDED'],
        [book.scores[1].id, 'MISSING'],
      ]);
      expect(read.text).not.toContain(book.scores[2].id);
    } finally {
      await activatePolicy(
        {
          allowPartialProgressPublication:
            previous.policy.allowPartialProgressPublication,
        },
        result.policyVersionId,
        randomUUID(),
      );
    }
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
    const book = await readyRelease('FAMILY-SAFE', (definition) => {
      const unit = definition.releaseUnits[0];
      const optionField = {
        id: randomUUID(),
        code: 'family_progress',
        label: { ar: 'التقدم', en: 'Progress' },
        kind: 'SELECT' as const,
        order: 7,
        requiredForFinal: false,
        constraints: {},
        options: [
          {
            code: 'excellent',
            label: { ar: 'ممتاز', en: 'Excellent' },
            order: 0,
            active: true,
          },
        ],
        allowedStates: ['RECORDED', 'MISSING'] as ('RECORDED' | 'MISSING')[],
        stateReasonRequired: [],
        audiences: ['STUDENT', 'PARENT', 'STAFF'] as (
          | 'STUDENT'
          | 'PARENT'
          | 'STAFF'
        )[],
        readRule: 'INHERIT_SHEET' as const,
        editRule: 'INHERIT_SHEET' as const,
        releaseUnitId: unit.id,
      };
      definition.fields.push(optionField);
      unit.outputFieldIds.push(optionField.id);
    });
    const familyNote = book.definition.fields.find(
      ({ code }) => code === 'family_note',
    )!;
    const familyChoice = book.definition.fields.find(
      ({ code }) => code === 'family_progress',
    )!;
    await book
      .patch([
        {
          slotId: book.slot.id,
          fieldId: familyNote.id,
          expectedCellVersion: 0,
          operation: 'SET',
          value: { status: 'RECORDED', text: 'Great work' },
        },
        {
          slotId: book.slot.id,
          fieldId: familyChoice.id,
          expectedCellVersion: 0,
          operation: 'SET',
          value: { status: 'RECORDED', optionCode: 'excellent' },
        },
      ])
      .expect(200);
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
    expect(published.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldId: familyNote.id,
          kind: 'TEXT',
          value: expect.objectContaining({ text: 'Great work' }),
        }),
        expect.objectContaining({
          fieldId: familyChoice.id,
          kind: 'SELECT',
          value: expect.objectContaining({ optionCode: 'excellent' }),
        }),
      ]),
    );
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
    const parentPeer =
      api + '/parent/children/' + peer.id + '/official-results';
    for (const path of [
      '/periods',
      '/periods/' + book.reportingPeriodId + '/history',
      '/publications/' + published.publicationId,
    ]) {
      const response = await schoolApi()
        .get(parentPeer + path)
        .set('Authorization', parentAccess.token)
        .expect(404);
      expect(response.text).not.toContain(book.child.id);
    }
    const history = await schoolApi()
      .get(api + '/student' + periodPath + '/history')
      .set('Authorization', access.token)
      .expect(200);
    expect(history.text).not.toContain('Restricted unpublished note');
    expect(history.text).not.toContain('Restricted correction reason');
    expect(history.text).not.toContain(book.internal.id);
    await schoolApi()
      .get(api + '/student' + periodPath + '/export')
      .set('Authorization', access.token)
      .expect(404);
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
    const proof = await prisma.resultReadEntitlement.findFirstOrThrow({
      where: {
        schoolId: school.school.id,
        studentId: book.child.id,
        actorId: learner.id,
      },
    });
    await withSchool('post', '/read-entitlements/' + proof.id + '/revoke')
      .set('Idempotency-Key', randomUUID())
      .send({ reason: 'Test a verified revocation' })
      .expect(200);
    await studentResult(other.token).expect(404);
    const stranger = await familyUser('STUDENT');
    const strangerScope = await attachFamilyMembership(stranger, otherSchool);
    await studentResult(strangerScope.token).expect(404);
  });

  it('T055 projects an explicitly approved total without the private numeric operand', async () => {
    const book = await liveGradebook(
      'FAMILY-PRIVATE-OPERAND',
      false,
      (definition) => {
        const privateInput = definition.fields[0];
        const total = definition.fields.find(({ code }) => code === 'total')!;
        privateInput.audiences = ['STAFF'];
        privateInput.readRule = 'SCHOOL_ONLY';
        definition.releaseUnits[0].derivedDisclosure = [
          {
            outputFieldId: total.id,
            privateOperandFieldIds: [privateInput.id],
            audiences: ['PARENT', 'STUDENT'],
            reason: 'Release the total without the protected operand',
          },
        ];
      },
    );
    await withSchool('patch', book.url + '/cells')
      .send({
        expectedDefinitionVersionId: book.source.draftDefinitionVersionId,
        expectedSheetRevision: book.source.sheetRevision,
        operations: book.scores.map((field, index) =>
          scoreOperation(book.slot.id, field.id, ['18', '27', '46'][index]),
        ),
      })
      .expect(200);
    const learner = await familyUser('STUDENT');
    const access = await attachFamilyMembership(learner, school);
    await prisma.student.update({
      where: { id: book.child.id },
      data: { userId: learner.id },
    });
    const candidate = (await captureRelease(
      book.slot.id,
      book.definition.releaseUnits[0].id,
      'REVIEW',
      202,
      'school-fixture',
    ))!;
    await decideCandidate(candidate).expect(200);
    await publishCandidate(candidate, 0, null).expect(202);
    const result = await schoolApi()
      .get(
        api +
          '/student/official-results/periods/' +
          book.reportingPeriodId +
          '/result',
      )
      .set('Authorization', access.token)
      .expect(200);
    expect(result.text).not.toContain(book.scores[0].id);
    expect(result.text).not.toContain('privateOperandFieldIds');
    expect(
      familyOutputs.result.parse(result.body.data).groups[0].releases[0].fields,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'total',
          value: { status: 'RECORDED', score: '91.00' },
        }),
      ]),
    );
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
    const [replacement, concurrentAggregate] = await Promise.all([
      publishCandidate(corrected, 1, active.publicationId),
      publish(pending, aggregate.publicationId),
    ]);
    expect(replacement.status).toBe(202);
    expect([201, 409]).toContain(concurrentAggregate.status);
    const summaryId =
      concurrentAggregate.status === 201
        ? aggregateOutputs.publication.parse(concurrentAggregate.body.data)
            .publicationId
        : aggregate.publicationId;
    expect(
      (
        await prisma.resultCurrentAggregate.findFirstOrThrow({
          where: { publicationId: summaryId },
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

  const exportTeacher = (
    method: 'post' | 'get',
    path: string,
    actor = 'teacher-fixture',
  ) =>
    schoolApi()
      [method](instructor + path)
      .set('Authorization', 'Bearer ' + actor);

  async function waitForExport(
    path: string,
    fetch: (path: string) => ReturnType<typeof withTeacher>,
  ) {
    for (let attempts = 0; attempts < 100; attempts++) {
      const response = await fetch(path).expect(200);
      const job = exportOutputs.export.parse(response.body.data);
      if (job.status === 'READY') return job;
      if (job.status === 'FAILED')
        throw new Error(job.failureCode ?? job.status);
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Export did not become ready');
  }

  it('dispatches Official Results reconciliation from the existing files-imports maintenance job', async () => {
    const processor = app.get(ResultBulkProcessor);
    const reconcile = jest.spyOn(processor, 'reconcile');
    const queue = app.get(BullmqService).getQueue(resultsBulkQueue);
    try {
      const job = await queue.add(
        FILES_IMPORT_RECONCILE_JOB_NAME,
        {},
        {
          jobId: 'reconcile-fixture-' + randomUUID(),
        },
      );
      const deadline = Date.now() + 5000;
      let state = await job.getState();
      while (
        state !== 'completed' &&
        state !== 'failed' &&
        Date.now() < deadline
      ) {
        await new Promise<void>((resolve) => setTimeout(resolve, 100));
        state = await job.getState();
      }
      expect(state).toBe('completed');
      expect(reconcile).toHaveBeenCalledTimes(1);
    } finally {
      reconcile.mockRestore();
    }
  });

  it('T057, T059, T060 and T061 export a populated exact teacher roster/field subset through Redis and private MinIO', async () => {
    const book = await liveGradebook('TEACHER-EXPORT');
    await book
      .patch([scoreOperation(book.slot.id, book.scores[0].id, '0')])
      .expect(200);
    const input = {
      reportingPeriodId: book.reportingPeriodId,
      academicScope: { level: 'CLASSROOM', ids: [school.classroom.id] },
      groupIds: [math.id],
      format: 'CSV',
      mode: 'EDIT_DRAFT',
      selectedFieldIds: [book.scores[0].id],
      selectedSlotIds: [book.slot.id],
    };
    await exportTeacher('post', '/exports/preview')
      .send({
        ...input,
        academicScope: { level: 'CLASSROOM', ids: [school.otherClassroom.id] },
        selectedSlotIds: undefined,
      })
      .expect(404);
    await exportTeacher('post', '/exports/preview')
      .send({ ...input, selectedFieldIds: [book.internal.id] })
      .expect(404);
    const preview = exportOutputs.preview.parse(
      (await exportTeacher('post', '/exports/preview').send(input).expect(200))
        .body.data,
    );
    expect(preview.blockers).toEqual([]);
    expect(preview.summary).toMatchObject({
      sheetCount: 1,
      rowCount: 1,
      sheets: [{ fields: [{ fieldId: book.scores[0].id }] }],
    });
    const key = randomUUID();
    const create = (requestKey: string) =>
      exportTeacher('post', '/exports')
        .set('Idempotency-Key', requestKey)
        .send({
          previewId: preview.previewId,
          previewDigest: preview.previewDigest,
        })
        .expect(202)
        .then((response) => exportOutputs.export.parse(response.body.data));
    const [first, retry, second] = await Promise.all([
      create(key),
      create(key),
      create(randomUUID()),
    ]);
    expect(retry.exportId).toBe(first.exportId);
    expect(second.exportId).not.toBe(first.exportId);
    const jobs = await Promise.all(
      [first, second].map(({ exportId }) =>
        waitForExport('/exports/' + exportId, withTeacher),
      ),
    );
    expect(jobs[0].files[0].filename).not.toBe(jobs[1].files[0].filename);
    for (const job of jobs) {
      const file = job.files[0];
      const downloadPath = file.downloadPath.slice(instructor.length);
      const download = await exportTeacher('get', downloadPath)
        .expect(200)
        .expect('Cache-Control', 'private, no-store')
        .expect('X-Content-Type-Options', 'nosniff');
      expect(download.headers['content-disposition']).toBe(
        'attachment; filename="' + file.filename + '"',
      );
      expect(download.text.startsWith('\ufeff')).toBe(true);
      const rows = parseCsv(download.text, { bom: true });
      expect(rows).toHaveLength(2);
      expect(rows[0]).toHaveLength(20);
      expect(rows[0][18]).toContain('[f:' + book.scores[0].id + ':value]');
      expect(rows[1][0]).toBe(file.fileId);
      expect(rows[1][4]).toBe(book.enrollment.id);
      expect(rows[1][6]).toBe('TEACHER-EXPORT Fixture');
      expect(rows[1][7]).toBe(
        (
          await prisma.school.findUniqueOrThrow({
            where: { id: school.school.id },
          })
        ).name,
      );
      expect(rows[1][14]).toBe('فصل 1');
      expect(rows[1][18]).toBe('0.00');
      const fileRow = await prisma.resultExportFile.findUniqueOrThrow({
        where: { id: file.fileId },
      });
      const manifest = fileRow.manifest as unknown as ExportManifest;
      expect(manifest.rows[0]).toMatchObject({
        rowRef: rows[1][1],
        base: [
          {
            fieldId: book.scores[0].id,
            version: 1,
            value: { status: 'RECORDED', score: '0.00' },
          },
        ],
      });
      expect(await prisma.file.count({ where: { id: file.fileId } })).toBe(0);
      await exportTeacher('get', downloadPath, 'co-teacher-fixture').expect(
        404,
      );
    }
  });

  it('T058 and T060 package heterogeneous real classroom rosters and revoke the whole download after allocation loss', async () => {
    const book = await liveGradebook('GRADE-EXPORT');
    const other = await school.addStudent('Other class export');
    await prisma.enrollment.create({
      data: {
        schoolId: school.school.id,
        academicYearId: school.year.id,
        termId: school.term.id,
        studentId: other.id,
        classroomId: school.otherClassroom.id,
        enrolledAt: new Date('2026-09-01T08:00:00Z'),
      },
    });
    // A second group pins its own schema in the other classroom.
    const extraDefinition = cloneResultDefinition(moazezStarterDefinition(), {
      ar: 'ملف ثان',
      en: 'Second schema',
    }).definition;
    const group = await school.run(() =>
      foundation.createGroup({
        kind: 'CUSTOM',
        code: 'EXPTWO',
        label: { ar: 'مجموعة ثانية', en: 'Second export group' },
      }),
    );
    const otherSheet = (
      await school.run(() =>
        foundation.materialize({
          reportingPeriodId: book.reportingPeriodId,
          groupId: group.id,
          classroomId: school.otherClassroom.id,
          rosterAsOf: new Date('2026-11-21T10:00:00Z'),
          definition: sheetDefinitionSeed({
            ...extraDefinition,
            groupKind: 'CUSTOM',
          }),
          acceptsDefinition: true,
        }),
      )
    ).sheet;
    const otherSlot = await prisma.resultSlot.findFirstOrThrow({
      where: { sheetId: otherSheet.id, studentId: other.id },
    });
    const grant = await prisma.officialResultScopeGrant.create({
      data: {
        schoolId: school.school.id,
        granteeUserId: coTeacher.actor.id,
        issuerId: school.actor.id,
        reportingPeriodIds: [book.reportingPeriodId],
        groupIds: [group.id],
        classroomIds: [school.otherClassroom.id],
        fieldIds: [],
        actions: ['VIEW', 'EDIT', 'EXPORT', 'IMPORT'],
        reason: 'Two-class export fixture',
        startsAt: new Date(Date.now() - 1_000),
      },
    });
    const preview = exportOutputs.preview.parse(
      (
        await exportTeacher('post', '/exports/preview', 'co-teacher-fixture')
          .send({
            reportingPeriodId: book.reportingPeriodId,
            academicScope: { level: 'GRADE', ids: [school.grade.id] },
            groupIds: [math.id, group.id],
            format: 'CSV',
            mode: 'EDIT_DRAFT',
            selectedSlotIds: [book.slot.id, otherSlot.id],
          })
          .expect(200)
      ).body.data,
    );
    expect(preview.summary.sheetCount).toBe(2);
    const receipt = exportOutputs.export.parse(
      (
        await exportTeacher('post', '/exports', 'co-teacher-fixture')
          .set('Idempotency-Key', randomUUID())
          .send({
            previewId: preview.previewId,
            previewDigest: preview.previewDigest,
          })
          .expect(202)
      ).body.data,
    );
    const job = await waitForExport('/exports/' + receipt.exportId, (path) =>
      exportTeacher('get', path, 'co-teacher-fixture'),
    );
    expect(job.files.map((file) => file.mediaType)).toEqual([
      'text/csv; charset=utf-8',
      'text/csv; charset=utf-8',
      'application/zip',
    ]);
    const zip = job.files[2];
    const url = zip.downloadPath.slice(instructor.length);
    const downloaded = await exportTeacher('get', url, 'co-teacher-fixture')
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    const bytes = downloaded.body as Buffer;
    expect(bytes.subarray(0, 4).toString('hex')).toBe('504b0304');
    expect(bytes.includes('index.csv')).toBe(true);
    expect(bytes.includes('instructions.txt')).toBe(true);
    expect(
      job.files.slice(0, 2).every((file) => bytes.includes(file.filename)),
    ).toBe(true);
    await prisma.officialResultScopeGrant.update({
      where: { id: grant.id },
      data: {
        revokedAt: new Date(),
        revokedById: school.actor.id,
        revocationReason: 'Reassigned',
      },
    });
    await exportTeacher('get', url, 'co-teacher-fixture').expect(404);
    await exportTeacher(
      'get',
      '/exports/' + receipt.exportId,
      'co-teacher-fixture',
    ).expect(404);
  });

  it('rejects stale editable export selections and emits only published values in read-only exports', async () => {
    const book = await readyRelease('PUBLISHED-EXPORT');
    const candidate = (await book.capture())!;
    await decideCandidate(candidate).expect(200);
    await publishCandidate(candidate, 0, null).expect(202);
    const input = {
      reportingPeriodId: book.reportingPeriodId,
      academicScope: { level: 'CLASSROOM', ids: [school.classroom.id] },
      groupIds: [math.id],
      format: 'CSV',
      mode: 'EDIT_DRAFT',
      selectedFieldIds: [book.scores[0].id],
      selectedSlotIds: [book.slot.id],
    };
    const preview = (mode: string) =>
      exportTeacher('post', '/exports/preview')
        .send({ ...input, mode })
        .expect(200)
        .then((response) => exportOutputs.preview.parse(response.body.data));
    const start = (plan: Awaited<ReturnType<typeof preview>>, status: number) =>
      exportTeacher('post', '/exports')
        .set('Idempotency-Key', randomUUID())
        .send({
          previewId: plan.previewId,
          previewDigest: plan.previewDigest,
        })
        .expect(status);
    const editable = await preview('EDIT_DRAFT');
    await book
      .patch([scoreOperation(book.slot.id, book.scores[0].id, '19.00', 1)])
      .expect(200);
    await start(editable, 409);
    const released = await preview('READ_PUBLISHED');
    const receipt = exportOutputs.export.parse(
      (await start(released, 202)).body.data,
    );
    const job = await waitForExport(
      '/exports/' + receipt.exportId,
      withTeacher,
    );
    const downloaded = await exportTeacher(
      'get',
      job.files[0].downloadPath.slice(instructor.length),
    ).expect(200);
    const rows = parseCsv(downloaded.text, { bom: true });
    expect(rows[0][18]).toContain('[r:' + book.scores[0].id + ':value]');
    expect(rows[1][18]).toBe('18.00');
    const artifact = await prisma.resultExportFile.findUniqueOrThrow({
      where: { id: job.files[0].fileId },
    });
    const manifest = artifact.manifest as unknown as ExportManifest;
    expect(manifest.request.mode).toBe('READ_PUBLISHED');
    expect(manifest.rows[0].publicationIds).toHaveLength(1);
  });

  const importTeacher = (method: 'get' | 'post', path: string) =>
    exportTeacher(method, '/imports' + path);
  const sourceBytes = (records: string[][]) =>
    Buffer.from('\ufeff' + records.map(csvRecord).join(''));

  type EditableResult = {
    reportingPeriodId: string;
    slot: { id: string };
    scores: { id: string }[];
  };

  async function editableExport(
    book: EditableResult,
    selectedFieldIds = [book.scores[0].id],
  ) {
    const plan = exportOutputs.preview.parse(
      (
        await exportTeacher('post', '/exports/preview')
          .send({
            reportingPeriodId: book.reportingPeriodId,
            academicScope: { level: 'CLASSROOM', ids: [school.classroom.id] },
            groupIds: [math.id],
            format: 'CSV',
            mode: 'EDIT_DRAFT',
            selectedFieldIds,
            selectedSlotIds: [book.slot.id],
          })
          .expect(200)
      ).body.data,
    );
    const queued = exportOutputs.export.parse(
      (
        await exportTeacher('post', '/exports')
          .set('Idempotency-Key', randomUUID())
          .send({
            previewId: plan.previewId,
            previewDigest: plan.previewDigest,
          })
          .expect(202)
      ).body.data,
    );
    const job = await waitForExport('/exports/' + queued.exportId, withTeacher);
    const download = await exportTeacher(
      'get',
      job.files[0].downloadPath.slice(instructor.length),
    ).expect(200);
    return { job, rows: parseCsv(download.text, { bom: true }) };
  }

  async function waitForImport(path: string) {
    for (let attempts = 0; attempts < 120; attempts++) {
      const result = importOutputs.batch.parse(
        (await importTeacher('get', path).expect(200)).body.data,
      );
      if (!['UPLOADED', 'VALIDATING'].includes(result.status)) return result;
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Import validation did not complete');
  }

  const stageImport = (
    exportId: string,
    records: Buffer,
    validateOptions?: object,
    key = randomUUID(),
  ) => {
    const upload = importTeacher('post', '')
      .set('Idempotency-Key', key)
      .field('exportId', exportId);
    if (validateOptions)
      upload.field('validateOptions', JSON.stringify(validateOptions));
    return upload.attach('file', records, 'renamed-user-file.csv');
  };

  it('T068, T069 and T070 stage immutable sources and corrected previews, preserving concurrent draft values', async () => {
    const book = await liveGradebook('STAGED-IMPORT');
    await book
      .patch([scoreOperation(book.slot.id, book.scores[0].id, '18.00')])
      .expect(200);
    const { job, rows } = await editableExport(book);
    await prisma.student.update({
      where: { id: book.child.id },
      data: { firstName: 'Corrected display name' },
    });
    await book
      .patch([scoreOperation(book.slot.id, book.scores[0].id, '19.00', 1)])
      .expect(200);
    const same = importOutputs.batch.parse(
      (await stageImport(job.exportId, sourceBytes(rows)).expect(202)).body
        .data,
    );
    const noChanges = await waitForImport('/' + same.batchId);
    expect(noChanges).toMatchObject({
      status: 'NO_CHANGES',
      canConfirm: false,
      summary: { changedCells: 0, unchangedCells: 1, validRows: 1 },
    });

    const conflictFile = rows.map((row) => row.slice());
    conflictFile[1][18] = '20.00';
    const key = randomUUID();
    const [created, replay] = await Promise.all([
      stageImport(
        job.exportId,
        sourceBytes(conflictFile),
        undefined,
        key,
      ).expect(202),
      stageImport(
        job.exportId,
        sourceBytes(conflictFile),
        undefined,
        key,
      ).expect(202),
    ]);
    const batchId = importOutputs.batch.parse(created.body.data).batchId;
    expect(importOutputs.batch.parse(replay.body.data).batchId).toBe(batchId);
    const initial = await waitForImport('/' + batchId);
    expect(initial).toMatchObject({
      status: 'CORRECTIONS_REQUIRED',
      canConfirm: false,
      summary: { conflictingCells: 1 },
    });
    const conflicts = importOutputs.issues.parse(
      (await importTeacher('get', '/' + batchId + '/issues').expect(200)).body
        .data,
    );
    const conflict = conflicts.items.find(
      (entry) => entry.code === 'official_results.import.cell_conflict',
    )!;
    expect(conflict.comparison).toEqual({
      baseline: { status: 'RECORDED', score: '18.00' },
      current: { status: 'RECORDED', score: '19.00' },
      incoming: { status: 'RECORDED', score: '20.00' },
      currentVersion: 2,
    });
    await importTeacher('post', '/' + batchId + '/corrections')
      .set('Idempotency-Key', randomUUID())
      .send({
        expectedBatchRevision: initial.batchRevision,
        changes: [
          {
            rowRef: conflict.rowRef,
            fieldId: conflict.fieldId,
            expectedCellVersion: 2,
            operation: 'SET',
            value: { status: 'RECORDED', score: '20.00' },
          },
        ],
      })
      .expect(202);
    const corrected = await waitForImport('/' + batchId);
    expect(corrected).toMatchObject({
      status: 'READY_TO_CONFIRM',
      canConfirm: true,
      batchRevision: 2,
      sourceVersion: 1,
    });
    expect(corrected.preview?.digest).not.toBe(initial.preview?.digest);
    expect(resultContentDigest(corrected.preview?.binding)).toBe(
      corrected.preview?.digest,
    );
    const changes = importOutputs.changes.parse(
      (
        await importTeacher('get', '/' + batchId + '/changes')
          .query({ limit: 1 })
          .expect(200)
      ).body.data,
    );
    expect(changes.items).toEqual([
      expect.objectContaining({
        expectedCellVersion: 2,
        before: { status: 'RECORDED', score: '19.00' },
        after: { status: 'RECORDED', score: '20.00' },
      }),
    ]);
    await importTeacher('post', '/' + batchId + '/source-versions')
      .set('Idempotency-Key', randomUUID())
      .field('exportId', job.exportId)
      .field('expectedBatchRevision', String(corrected.batchRevision))
      .attach('file', sourceBytes(rows), 'replace.csv')
      .expect(202);
    const replaced = await waitForImport('/' + batchId);
    expect(replaced).toMatchObject({
      status: 'NO_CHANGES',
      batchRevision: 3,
      sourceVersion: 2,
    });
    expect(replaced.preview?.digest).not.toBe(corrected.preview?.digest);
    const sources = await prisma.resultImportSource.findMany({
      where: { batchId },
      orderBy: { version: 'asc' },
    });
    expect(sources.map((row) => row.version)).toEqual([1, 2]);
    expect(sources.every((row) => row.storedAt && !row.deletedAt)).toBe(true);
    expect(sources[0].checksum).not.toBe(sources[1].checksum);
    expect(await prisma.resultImportReview.count({ where: { batchId } })).toBe(
      3,
    );
    expect(
      await prisma.resultCell.findFirstOrThrow({
        where: { slotId: book.slot.id, fieldId: book.scores[0].id },
      }),
    ).toMatchObject({ version: 2 });
    expect(
      await prisma.resultCellRevision.count({
        where: { cell: { slotId: book.slot.id } },
      }),
    ).toBe(2);
  });

  it('T063, T064 and T071 block foreign scope, invented rows and duplicates while matching reordered row values', async () => {
    const book = await liveGradebook('IDENTITY-IMPORT');
    const { job, rows } = await editableExport(book);
    await schoolApi()
      .post(management + '/imports')
      .set('Authorization', 'Bearer other-school-fixture')
      .set('Idempotency-Key', randomUUID())
      .field('exportId', job.exportId)
      .attach('file', sourceBytes(rows), 'foreign.csv')
      .expect(404);
    const altered = rows.map((row) => row.slice());
    altered.push(altered[1].slice(), altered[1].slice());
    const foreignRow = randomUUID();
    altered[3][1] = foreignRow;
    const queued = importOutputs.batch.parse(
      (await stageImport(job.exportId, sourceBytes(altered)).expect(202)).body
        .data,
    );
    const report = await waitForImport('/' + queued.batchId);
    const issues = importOutputs.issues.parse(
      (await importTeacher('get', '/' + queued.batchId + '/issues').expect(200))
        .body.data,
    );
    expect(report).toMatchObject({
      status: 'CORRECTIONS_REQUIRED',
      summary: { parsedDataRows: 3, validRows: 1, invalidRows: 2 },
    });
    expect(issues.items.map((item) => item.code)).toEqual([
      'official_results.import.duplicate_row',
      'official_results.import.unknown_row',
    ]);
    expect(JSON.stringify(issues)).not.toContain(foreignRow);
    const reshuffled = rows.map((row) => row.slice().reverse());
    const valid = importOutputs.batch.parse(
      (await stageImport(job.exportId, sourceBytes(reshuffled)).expect(202))
        .body.data,
    );
    expect((await waitForImport('/' + valid.batchId)).status).toBe(
      'NO_CHANGES',
    );
    const blank = importOutputs.batch.parse(
      (await stageImport(job.exportId, sourceBytes([rows[0]])).expect(202)).body
        .data,
    );
    expect(await waitForImport('/' + blank.batchId)).toMatchObject({
      status: 'NO_CHANGES',
      summary: { omittedRows: 1 },
    });
  });

  it('T067 suspends validation after live placement movement or an actual pinned draft change', async () => {
    const book = await liveGradebook('MOVED-IMPORT');
    const { job, rows } = await editableExport(book);
    const at = new Date('2026-11-20T09:00:00Z');
    await prisma.enrollment.update({
      where: { id: book.enrollment.id },
      data: { endedAt: at },
    });
    await prisma.enrollment.create({
      data: {
        schoolId: school.school.id,
        academicYearId: school.year.id,
        termId: school.term.id,
        studentId: book.child.id,
        classroomId: school.otherClassroom.id,
        enrolledAt: at,
      },
    });
    const moved = importOutputs.batch.parse(
      (await stageImport(job.exportId, sourceBytes(rows)).expect(202)).body
        .data,
    );
    const movedReport = await waitForImport('/' + moved.batchId);
    expect(movedReport.status).toBe('CORRECTIONS_REQUIRED');
    const issues = importOutputs.issues.parse(
      (await importTeacher('get', '/' + moved.batchId + '/issues').expect(200))
        .body.data,
    );
    expect(issues.items.map((item) => item.code)).toContain(
      'official_results.import.roster_changed',
    );

    const another = await liveGradebook('PINNED-IMPORT');
    const pinned = await editableExport(another);
    await prisma.$transaction(async (client) => {
      const old = await client.resultSheetDefinitionVersion.findUniqueOrThrow({
        where: { id: another.source.draftDefinitionVersionId! },
      });
      const version = await client.resultSheetDefinitionVersion.create({
        data: {
          schoolId: old.schoolId,
          sheetId: old.sheetId,
          version: old.version + 1,
          contentDigest: old.contentDigest,
          labelAr: old.labelAr,
          labelEn: old.labelEn,
          configuration: old.configuration!,
          createdById: old.createdById,
        },
      });
      await client.resultSheet.update({
        where: { id: another.source.id },
        data: {
          draftDefinitionVersionId: version.id,
          sheetRevision: { increment: 1 },
        },
      });
    });
    const stale = importOutputs.batch.parse(
      (
        await stageImport(pinned.job.exportId, sourceBytes(pinned.rows)).expect(
          202,
        )
      ).body.data,
    );
    expect((await waitForImport('/' + stale.batchId)).status).toBe(
      'CORRECTIONS_REQUIRED',
    );
    const staleIssues = importOutputs.issues.parse(
      (await importTeacher('get', '/' + stale.batchId + '/issues').expect(200))
        .body.data,
    );
    expect(staleIssues.items.map((item) => item.code)).toContain(
      'official_results.schema.stale',
    );
  });

  it('stages an explicit clear with its reason and acknowledgment while omission preserves the saved value', async () => {
    const book = await liveGradebook('CLEAR-IMPORT');
    await book
      .patch([scoreOperation(book.slot.id, book.scores[0].id, '18.00')])
      .expect(200);
    const { job, rows } = await editableExport(book);
    rows[1][18] = '';
    const blank = importOutputs.batch.parse(
      (await stageImport(job.exportId, sourceBytes(rows)).expect(202)).body
        .data,
    );
    expect((await waitForImport('/' + blank.batchId)).status).toBe(
      'NO_CHANGES',
    );
    rows[1][19] = 'CLEAR';
    const withoutReason = importOutputs.batch.parse(
      (await stageImport(job.exportId, sourceBytes(rows)).expect(202)).body
        .data,
    );
    expect((await waitForImport('/' + withoutReason.batchId)).status).toBe(
      'CORRECTIONS_REQUIRED',
    );
    const noReason = importOutputs.issues.parse(
      (
        await importTeacher(
          'get',
          '/' + withoutReason.batchId + '/issues',
        ).expect(200)
      ).body.data,
    );
    expect(noReason.items.map((item) => item.code)).toContain(
      'official_results.import.clear_reason_required',
    );
    const reason = 'Verified source grade needs correction';
    const withReason = importOutputs.batch.parse(
      (
        await stageImport(job.exportId, sourceBytes(rows), {
          clearReason: reason,
        }).expect(202)
      ).body.data,
    );
    const ready = await waitForImport('/' + withReason.batchId);
    expect(ready.status).toBe('READY_TO_CONFIRM');
    const review = importOutputs.issues.parse(
      (
        await importTeacher('get', '/' + withReason.batchId + '/issues').expect(
          200,
        )
      ).body.data,
    );
    const ack = review.items.find(
      (item) => item.code === 'official_results.import.clear_acknowledgment',
    );
    expect(ready.preview?.binding.requiredWarningIds).toContain(ack?.id);
    const proposals = importOutputs.changes.parse(
      (
        await importTeacher(
          'get',
          '/' + withReason.batchId + '/changes',
        ).expect(200)
      ).body.data,
    );
    expect(proposals.items[0]).toMatchObject({
      operation: 'CLEAR',
      reason,
      after: { status: 'MISSING' },
      expectedCellVersion: 1,
    });
    expect(
      await prisma.resultCell.findFirstOrThrow({
        where: { slotId: book.slot.id, fieldId: book.scores[0].id },
      }),
    ).toMatchObject({ version: 1, status: 'RECORDED' });
  });

  const confirmation = (
    batch: ReturnType<typeof importOutputs.batch.parse>,
  ) => ({
    previewId: batch.preview!.id,
    previewDigest: batch.preview!.digest,
    expectedBatchRevision: batch.batchRevision,
    selectedSheetIds: batch.preview!.binding.selectedSheetIds,
    acknowledgedWarningIds: batch.preview!.binding.requiredWarningIds,
  });

  async function stagedGrade(book: EditableResult, value: string) {
    const { job, rows } = await editableExport(book);
    const changed = rows.map((row) => row.slice());
    changed[1][18] = value;
    const receipt = importOutputs.batch.parse(
      (await stageImport(job.exportId, sourceBytes(changed)).expect(202)).body
        .data,
    );
    const batch = await waitForImport('/' + receipt.batchId);
    expect(batch.status).toBe('READY_TO_CONFIRM');
    return { batch, job, rows };
  }

  const confirmImport = (batchId: string, input: object, key = randomUUID()) =>
    importTeacher('post', '/' + batchId + '/confirm')
      .set('Idempotency-Key', key)
      .send(input);

  async function waitForOperation(id: string, actor = 'teacher-fixture') {
    for (let index = 0; index < 100; index++) {
      const response = await exportTeacher(
        'get',
        '/operations/' + id,
        actor,
      ).expect(200);
      const result = importOutputs.execution.parse(response.body.data);
      if (result.status !== 'QUEUED' && result.status !== 'APPLYING')
        return result;
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Import execution did not reach a terminal state');
  }

  it('T075, T076 and T080 confirm an exact preview once and preserve the applied grade on replay or unchanged reupload', async () => {
    const book = await liveGradebook('CONFIRM-IMPORT');
    const { batch, job, rows } = await stagedGrade(book, '10.00');
    const key = randomUUID();
    const input = confirmation(batch);
    const results = await Promise.all([
      confirmImport(batch.batchId, input, key).expect(202),
      confirmImport(batch.batchId, input, key).expect(202),
    ]);
    const [first, replay] = results.map((result) =>
      importOutputs.execution.parse(result.body.data),
    );
    expect(first.operationId).toBe(replay.operationId);
    await confirmImport(
      batch.batchId,
      { ...input, selectedSheetIds: [randomUUID()] },
      key,
    ).expect(409);
    const complete = await waitForOperation(first.operationId);
    expect(complete).toMatchObject({
      status: 'APPLIED',
      counts: { total: 1, completed: 1 },
    });
    const items = await exportTeacher(
      'get',
      '/operations/' + first.operationId + '/items',
    ).expect(200);
    expect(items.body.data.items[0]).toMatchObject({
      status: 'APPLIED',
      changedCells: 1,
    });
    const worker = app.get(ResultImportApplyService);
    await worker.run(first.operationId, 1);
    expect(
      await prisma.resultCellRevision.count({
        where: { cell: { slotId: book.slot.id }, source: 'IMPORT' },
      }),
    ).toBe(1);
    expect(
      await prisma.resultPublication.count({ where: { slotId: book.slot.id } }),
    ).toBe(0);
    const receipt = importOutputs.batch.parse(
      (await stageImport(job.exportId, sourceBytes(rows)).expect(202)).body
        .data,
    );
    const unchanged = await waitForImport('/' + receipt.batchId);
    expect(unchanged).toMatchObject({
      status: 'NO_CHANGES',
      summary: { changedCells: 0 },
    });
    expect(
      await prisma.resultCell.findFirstOrThrow({
        where: { slotId: book.slot.id, fieldId: book.scores[0].id },
      }),
    ).toMatchObject({ version: 1, status: 'RECORDED' });
    await importTeacher('post', '/' + batch.batchId + '/cancel')
      .set('Idempotency-Key', randomUUID())
      .send({
        expectedBatchRevision: batch.batchRevision,
        reason: 'Too late to cancel',
      })
      .expect(409);
  });

  it('T074 checks calculated input dependencies at HTTP confirmation and again in the actual worker', async () => {
    const book = await liveGradebook('STALE-COMMIT');
    const { batch } = await stagedGrade(book, '10.00');
    await book
      .patch([scoreOperation(book.slot.id, book.scores[1].id, '8.00')])
      .expect(200);
    await confirmImport(batch.batchId, confirmation(batch)).expect(409);
    await importTeacher('post', '/' + batch.batchId + '/revalidate')
      .set('Idempotency-Key', randomUUID())
      .send({ expectedBatchRevision: batch.batchRevision })
      .expect(202);
    const refreshed = await waitForImport('/' + batch.batchId);
    const queue = app.get(BullmqService).getQueue(resultsBulkQueue);
    await queue.pause();
    try {
      const response = await confirmImport(
        batch.batchId,
        confirmation(refreshed),
      ).expect(202);
      const operation = importOutputs.execution.parse(response.body.data);
      await book
        .patch([scoreOperation(book.slot.id, book.scores[1].id, '9.00', 1)])
        .expect(200);
      await app.get(ResultImportApplyService).run(operation.operationId, 1);
      expect(await waitForOperation(operation.operationId)).toMatchObject({
        status: 'FAILED',
        counts: { completed: 0, failed: 1 },
      });
      expect(
        await prisma.resultCell.count({
          where: { slotId: book.slot.id, fieldId: book.scores[0].id },
        }),
      ).toBe(0);
    } finally {
      await queue.resume();
    }
  });

  it('T012 invalidates a staged preview after the school changes policy', async () => {
    const book = await liveGradebook('CHANGED-IMPORT-POLICY');
    const { batch } = await stagedGrade(book, '10');
    const reviewedBook = await readyRelease('CHANGED-RELEASE-POLICY');
    const approved = (await reviewedBook.capture())!;
    await decideCandidate(approved).expect(200);
    const previous = resultContracts.policy.parse(
      (await withSchool('get', '/policy').expect(200)).body.data,
    );
    const { result } = await activatePolicy(
      {
        familyHistoryEnabled: !previous.policy.familyHistoryEnabled,
      },
      previous.policyVersionId,
      randomUUID(),
    );
    try {
      const stale = await confirmImport(
        batch.batchId,
        confirmation(batch),
      ).expect(409);
      expect(stale.body.error.code).toBe('official_results.policy.stale');
      await publishCandidate(approved, 0, null).expect(409);
      expect(
        await prisma.resultCurrentRelease.count({
          where: { slotId: reviewedBook.slot.id },
        }),
      ).toBe(0);
      expect(
        await prisma.resultCell.count({ where: { slotId: book.slot.id } }),
      ).toBe(0);
    } finally {
      await activatePolicy(
        {
          familyHistoryEnabled: previous.policy.familyHistoryEnabled,
        },
        result.policyVersionId,
        randomUUID(),
      );
    }
  });

  it('T079 restores lost dispatch and reclaims an expired worker lease without reapplying a committed unit', async () => {
    const book = await liveGradebook('IMPORT-LEASE');
    const { batch } = await stagedGrade(book, '12.00');
    const worker = app.get(ResultImportApplyService);
    const queue = app.get(BullmqService).getQueue(resultsBulkQueue);
    await queue.pause();
    let executionId = '';
    try {
      const receipt = await confirmImport(
        batch.batchId,
        confirmation(batch),
      ).expect(202);
      executionId = importOutputs.execution.parse(
        receipt.body.data,
      ).operationId;
      const scheduledId = resultApplyImportJob + '-' + executionId + '-1';
      const job = await queue.getJob(scheduledId);
      expect(job).toBeDefined();
      await job!.remove();
      const staleToken = randomUUID();
      const reclaimed = await prisma.resultImportExecutionUnit.updateMany({
        where: { executionId, status: 'QUEUED' },
        data: {
          status: 'RUNNING',
          attempts: 1,
          leaseToken: staleToken,
          leaseUntil: new Date(Date.now() - 1_000),
        },
      });
      expect(reclaimed.count).toBe(1);
      await worker.reconcile();
      expect(await queue.getJob(scheduledId)).toBeDefined();
    } finally {
      await queue.resume();
    }
    expect(await waitForOperation(executionId)).toMatchObject({
      status: 'APPLIED',
    });
    expect(
      await prisma.resultImportExecutionUnit.findFirstOrThrow({
        where: { executionId },
      }),
    ).toMatchObject({
      status: 'APPLIED',
      attempts: 2,
      leaseToken: null,
      leaseUntil: null,
      changedCells: 1,
    });
    expect(
      await prisma.resultCellRevision.count({
        where: { cell: { slotId: book.slot.id }, source: 'IMPORT' },
      }),
    ).toBe(1);
  });

  async function stagedTwoSheetImport(code: string) {
    const book = await liveGradebook(code, true);
    const second = book.parallelSlot!;
    const auth = 'co-teacher-fixture';
    const api = (method: 'get' | 'post', path: string) =>
      exportTeacher(method, path, auth);
    const preview = exportOutputs.preview.parse(
      (
        await api('post', '/exports/preview')
          .send({
            reportingPeriodId: book.reportingPeriodId,
            academicScope: {
              level: 'CLASSROOM',
              ids: [school.classroom.id, school.otherClassroom.id],
            },
            groupIds: [math.id],
            format: 'CSV',
            mode: 'EDIT_DRAFT',
            selectedSlotIds: [book.slot.id, second.id],
            selectedFieldIds: [book.scores[0].id],
          })
          .expect(200)
      ).body.data,
    );
    const created = exportOutputs.export.parse(
      (
        await api('post', '/exports')
          .set('Idempotency-Key', randomUUID())
          .send({
            previewId: preview.previewId,
            previewDigest: preview.previewDigest,
          })
          .expect(202)
      ).body.data,
    );
    const ready = await waitForExport('/exports/' + created.exportId, (path) =>
      api('get', path),
    );
    expect(ready.files).toHaveLength(1);
    const csv = await api(
      'get',
      ready.files[0].downloadPath.slice(instructor.length),
    ).expect(200);
    const rows = parseCsv(csv.text, { bom: true });
    expect(rows).toHaveLength(3);
    for (const row of rows.slice(1)) row[18] = '12.00';
    const staged = importOutputs.batch.parse(
      (
        await api('post', '/imports')
          .set('Idempotency-Key', randomUUID())
          .field('exportId', ready.exportId)
          .attach('file', sourceBytes(rows), 'two-class.csv')
          .expect(202)
      ).body.data,
    );
    let plan = staged;
    for (
      let attempt = 0;
      attempt < 100 && ['UPLOADED', 'VALIDATING'].includes(plan.status);
      attempt++
    ) {
      plan = importOutputs.batch.parse(
        (await api('get', '/imports/' + staged.batchId).expect(200)).body.data,
      );
      if (['UPLOADED', 'VALIDATING'].includes(plan.status))
        await new Promise<void>((resolve) => setTimeout(resolve, 100));
    }
    expect(plan).toMatchObject({
      status: 'READY_TO_CONFIRM',
      summary: { selectedSheets: 2, changedCells: 2 },
    });
    return { book, plan, api, auth };
  }

  it('T078 preserves a committed sheet when a different sheet fails its final draft check', async () => {
    const { book, plan, api, auth } =
      await stagedTwoSheetImport('PARTIAL-COMMIT');
    const second = book.parallelSlot!;
    const staged = plan;
    const queue = app.get(BullmqService).getQueue(resultsBulkQueue);
    await queue.pause();
    try {
      const execution = importOutputs.execution.parse(
        (
          await api('post', '/imports/' + staged.batchId + '/confirm')
            .set('Idempotency-Key', randomUUID())
            .send(confirmation(plan))
            .expect(202)
        ).body.data,
      );
      await schoolApi()
        .patch(instructor + '/sheets/' + book.destination.id + '/cells')
        .set('Authorization', 'Bearer ' + auth)
        .send({
          expectedDefinitionVersionId:
            book.destination.draftDefinitionVersionId,
          expectedSheetRevision: book.destination.sheetRevision,
          operations: [scoreOperation(second.id, book.scores[0].id, '9.00')],
        })
        .expect(200);
      const worker = app.get(ResultImportApplyService);
      await worker.run(execution.operationId, 1);
      const summary = await waitForOperation(execution.operationId, auth);
      expect(summary).toMatchObject({
        status: 'PARTIALLY_APPLIED',
        counts: { total: 2, completed: 1, failed: 1 },
      });
      const outcomes = (
        await api(
          'get',
          '/operations/' + execution.operationId + '/items',
        ).expect(200)
      ).body.data.items;
      expect(outcomes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            sheetId: book.source.id,
            status: 'APPLIED',
            changedCells: 1,
          }),
          expect.objectContaining({
            sheetId: book.destination.id,
            status: 'FAILED',
            failureCode: 'official_results.cell.conflict',
          }),
        ]),
      );
      await worker.run(execution.operationId, 1);
      expect(
        await prisma.resultCellRevision.count({
          where: {
            cell: { slotId: { in: [book.slot.id, second.id] } },
            source: 'IMPORT',
          },
        }),
      ).toBe(1);
    } finally {
      await queue.resume();
    }
  });

  it('T101 cancels only pending sheets while a claimed sheet transaction finishes', async () => {
    const { book, plan, api, auth } =
      await stagedTwoSheetImport('CANCEL-IMPORT');
    const queue = app.get(BullmqService).getQueue(resultsBulkQueue);
    const worker = app.get(ResultImportApplyService);
    await queue.pause();
    try {
      const execution = importOutputs.execution.parse(
        (
          await api('post', '/imports/' + plan.batchId + '/confirm')
            .set('Idempotency-Key', randomUUID())
            .send(confirmation(plan))
            .expect(202)
        ).body.data,
      );
      const first = [book.source.id, book.destination.id].sort()[0];
      let acquired!: () => void;
      let release!: () => void;
      const ready = new Promise<void>((resolve) => {
        acquired = resolve;
      });
      const unlocked = new Promise<void>((resolve) => {
        release = resolve;
      });
      const blocker = prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM result_sheets WHERE id = ${first}::uuid FOR UPDATE`;
          acquired();
          await unlocked;
        },
        { timeout: 20_000 },
      );
      let applied: Promise<unknown> | undefined;
      try {
        await ready;
        applied = worker.run(execution.operationId, 1);
        let running = false;
        for (let attempt = 0; attempt < 40; attempt++) {
          const unit = await prisma.resultImportExecutionUnit.findFirstOrThrow({
            where: { executionId: execution.operationId, sheetId: first },
          });
          if (unit.status === 'RUNNING') {
            running = true;
            break;
          }
          await new Promise<void>((resolve) => setTimeout(resolve, 50));
        }
        expect(running).toBe(true);
        const cancelled = importOutputs.batch.parse(
          (
            await api('post', '/imports/' + plan.batchId + '/cancel')
              .set('Idempotency-Key', randomUUID())
              .send({
                expectedBatchRevision: plan.batchRevision,
                reason: 'Stop pending units',
              })
              .expect(200)
          ).body.data,
        );
        expect(cancelled).toMatchObject({
          status: 'APPLYING',
          terminationReason: 'CANCELLED',
        });
      } finally {
        release();
        await blocker;
        await applied;
      }
      expect(await waitForOperation(execution.operationId, auth)).toMatchObject(
        {
          status: 'PARTIALLY_APPLIED',
          terminationReason: 'CANCELLED',
          counts: { completed: 1, skipped: 1 },
        },
      );
      const rows = await prisma.resultImportExecutionUnit.findMany({
        where: { executionId: execution.operationId },
      });
      expect(rows.map((unit) => unit.status).sort()).toEqual([
        'APPLIED',
        'CANCELLED',
      ]);
      expect(
        await prisma.resultCellRevision.count({
          where: {
            source: 'IMPORT',
            cell: { slotId: { in: [book.slot.id, book.parallelSlot!.id] } },
          },
        }),
      ).toBe(1);
    } finally {
      await queue.resume();
    }
  });

  it('T077 rolls back the real sheet transaction when the database worker session ends mid-write', async () => {
    const book = await liveGradebook('ATOMIC-DISCONNECT');
    await book
      .patch([
        scoreOperation(book.slot.id, book.scores[0].id, '7.00'),
        scoreOperation(book.slot.id, book.scores[1].id, '8.00'),
      ])
      .expect(200);
    const { job, rows } = await editableExport(book, [
      book.scores[0].id,
      book.scores[1].id,
    ]);
    rows[1][18] = '10.00';
    rows[1][20] = '11.00';
    const staged = importOutputs.batch.parse(
      (await stageImport(job.exportId, sourceBytes(rows)).expect(202)).body
        .data,
    );
    const plan = await waitForImport('/' + staged.batchId);
    expect(plan.summary.changedCells).toBe(2);
    const queue = app.get(BullmqService).getQueue(resultsBulkQueue);
    const worker = app.get(ResultImportApplyService);
    await queue.pause();
    try {
      const receipt = importOutputs.execution.parse(
        (await confirmImport(plan.batchId, confirmation(plan)).expect(202)).body
          .data,
      );
      let lockReady!: (pid: number) => void;
      let release!: () => void;
      const held = new Promise<number>((resolve) => {
        lockReady = resolve;
      });
      const unlocked = new Promise<void>((resolve) => {
        release = resolve;
      });
      const blocker = prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM result_cells
          WHERE slot_id = ${book.slot.id}::uuid AND field_id = ${book.scores[1].id}::uuid FOR UPDATE`;
          const [session] = await tx.$queryRaw<
            { pid: number }[]
          >`SELECT pg_backend_pid() AS pid`;
          lockReady(session.pid);
          await unlocked;
        },
        { timeout: 20_000 },
      );
      let running: Promise<unknown> | undefined;
      try {
        const lockPid = await held;
        running = worker
          .run(receipt.operationId, 1)
          .catch((error: unknown) => error);
        let blockedPid: number | undefined;
        for (let attempt = 0; attempt < 60 && !blockedPid; attempt++) {
          const sessions = await prisma.$queryRaw<{ pid: number }[]>`
            SELECT pid FROM pg_stat_activity WHERE datname = current_database()
              AND ${lockPid}::int = ANY(pg_blocking_pids(pid))
              AND query LIKE '%WITH rows AS%' AND query LIKE '%UPDATE result_cells%'
          `;
          if (sessions.length === 1) blockedPid = sessions[0].pid;
          else await new Promise<void>((resolve) => setTimeout(resolve, 50));
        }
        expect(blockedPid).toBeDefined();
        const [terminated] = await prisma.$queryRaw<{ ok: boolean }[]>`
          SELECT pg_terminate_backend(${blockedPid!}::int) AS ok
          WHERE EXISTS (
            SELECT 1 FROM pg_stat_activity WHERE datname = current_database()
              AND pid = ${blockedPid!}::int AND ${lockPid}::int = ANY(pg_blocking_pids(pid))
          )
        `;
        expect(terminated?.ok).toBe(true);
      } finally {
        release();
        await blocker;
        await running;
      }
      expect(
        await prisma.resultCellRevision.count({
          where: { cell: { slotId: book.slot.id }, source: 'IMPORT' },
        }),
      ).toBe(0);
      expect(
        (
          await prisma.resultCell.findMany({ where: { slotId: book.slot.id } })
        ).map((cell) => cell.version),
      ).toEqual([1, 1]);
      await worker.run(receipt.operationId, 1);
      const finished = await waitForOperation(receipt.operationId);
      expect(finished.status).toBe('APPLIED');
      expect(
        await prisma.resultCellRevision.count({
          where: { cell: { slotId: book.slot.id }, source: 'IMPORT' },
        }),
      ).toBe(2);
      await worker.run(receipt.operationId, 1);
      expect(
        await prisma.resultCellRevision.count({
          where: { cell: { slotId: book.slot.id }, source: 'IMPORT' },
        }),
      ).toBe(2);
    } finally {
      await queue.resume();
    }
  });

  it('T081 executes a native workbook through the same staged authorization and atomic draft pipeline', async () => {
    const book = await liveGradebook('NATIVE-XLSX');
    const preview = exportOutputs.preview.parse(
      (
        await exportTeacher('post', '/exports/preview')
          .send({
            reportingPeriodId: book.reportingPeriodId,
            academicScope: { level: 'CLASSROOM', ids: [school.classroom.id] },
            groupIds: [math.id],
            format: 'XLSX',
            mode: 'EDIT_DRAFT',
            selectedSlotIds: [book.slot.id],
            selectedFieldIds: [book.scores[0].id],
          })
          .expect(200)
      ).body.data,
    );
    const created = exportOutputs.export.parse(
      (
        await exportTeacher('post', '/exports')
          .set('Idempotency-Key', randomUUID())
          .send({
            previewId: preview.previewId,
            previewDigest: preview.previewDigest,
          })
          .expect(202)
      ).body.data,
    );
    const job = await waitForExport(
      '/exports/' + created.exportId,
      withTeacher,
    );
    const file = job.files[0];
    expect(file.mediaType).toBe(resultsXlsxMediaType);
    const download = await exportTeacher(
      'get',
      file.downloadPath.slice(instructor.length),
    )
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    const workbook = await parseResultsXlsx(download.body as Buffer);
    expect(workbook.records[0].cells.slice(0, 5)).toEqual([
      file.fileId,
      expect.any(String),
      book.source.id,
      book.slot.id,
      book.enrollment.id,
    ]);
    const persisted = await prisma.resultExportFile.findUniqueOrThrow({
      where: { id: file.fileId },
    });
    const manifest = persisted.manifest as unknown as ExportManifest;
    const values = workbook.records.map((item) => item.cells.slice());
    values[0][18] = '0.00';
    const updated = await renderResultsXlsx(manifest, values);
    const initial = importOutputs.batch.parse(
      (await stageImport(job.exportId, updated).expect(202)).body.data,
    );
    const batch = await waitForImport('/' + initial.batchId);
    expect(batch).toMatchObject({
      status: 'READY_TO_CONFIRM',
      summary: { changedCells: 1, selectedSlots: 1 },
    });
    const operation = importOutputs.execution.parse(
      (await confirmImport(batch.batchId, confirmation(batch)).expect(202)).body
        .data,
    );
    expect(await waitForOperation(operation.operationId)).toMatchObject({
      status: 'APPLIED',
    });
    expect(
      await prisma.resultCell.findFirstOrThrow({
        where: { slotId: book.slot.id, fieldId: book.scores[0].id },
      }),
    ).toMatchObject({ version: 1, status: 'RECORDED' });
  });

  it('T085 returns authorized missing grades and before/after history without school-only fields', async () => {
    const book = await liveGradebook('REPORT-HISTORY');
    const filter = {
      sheetId: book.source.id,
      studentId: book.child.id,
      fieldId: book.scores[0].id,
    };
    const missing = reportOutputs.missing.parse(
      (await withTeacher('/missing').query(filter).expect(200)).body.data,
    );
    expect(missing.counts).toEqual({
      missingFields: 1,
      reconciliationFields: 0,
      affectedSlots: 1,
    });
    expect(missing.items[0]).toMatchObject({
      slotId: book.slot.id,
      fieldId: book.scores[0].id,
      canEnter: true,
    });
    await book
      .patch([scoreOperation(book.slot.id, book.scores[0].id, '0')])
      .expect(200);
    await book
      .patch([scoreOperation(book.slot.id, book.scores[0].id, '10', 1)])
      .expect(200);
    const noLongerMissing = reportOutputs.missing.parse(
      (await withTeacher('/missing').query(filter).expect(200)).body.data,
    );
    expect(noLongerMissing.counts.missingFields).toBe(0);
    const first = reportOutputs.history.parse(
      (
        await withTeacher('/history')
          .query({ ...filter, limit: 1 })
          .expect(200)
      ).body.data,
    );
    expect(first.items).toHaveLength(1);
    expect(first.hasMore).toBe(true);
    const second = reportOutputs.history.parse(
      (
        await withTeacher('/history')
          .query({ ...filter, limit: 1, cursor: first.nextCursor })
          .expect(200)
      ).body.data,
    );
    expect([...first.items, ...second.items]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'CELL',
          before: { status: 'MISSING' },
          after: { status: 'RECORDED', score: '0.00' },
        }),
        expect.objectContaining({
          type: 'CELL',
          before: { status: 'RECORDED', score: '0.00' },
          after: { status: 'RECORDED', score: '10.00' },
        }),
      ]),
    );
    await withTeacher('/history')
      .query({ ...filter, fieldId: book.internal.id })
      .expect(404);
    await withTeacher('/missing')
      .query({ sheetId: book.destination.id })
      .expect(404);
  });

  it('T086 and T087 freeze ordinary entry, finish an approved candidate in ENTRY_CLOSED and enforce archived correction windows', async () => {
    const book = await readyRelease('PERIOD-ARCHIVE');
    const candidate = (await book.capture())!;
    await decideCandidate(candidate).expect(200);
    const period = await prisma.resultReportingPeriod.findUniqueOrThrow({
      where: { id: book.reportingPeriodId },
    });
    const route = '/periods/' + period.id;
    const closeInput = {
      expectedRevision: period.revision,
      reason: 'School accepted the closure summary',
    };
    const closeKey = randomUUID();
    const closed = await withSchool('post', route + '/close')
      .set('Idempotency-Key', closeKey)
      .send(closeInput)
      .expect(200);
    expect(closed.body.data).toMatchObject({
      status: 'ENTRY_CLOSED',
      revision: period.revision + 1,
      closureSummary: { sheets: 2, pendingReviews: 1 },
    });
    const repeat = await withSchool('post', route + '/close')
      .set('Idempotency-Key', closeKey)
      .send(closeInput)
      .expect(200);
    expect(repeat.body.data).toEqual(closed.body.data);
    await book
      .patch([scoreOperation(book.slot.id, book.scores[0].id, '19', 1)])
      .expect(409);
    await book.capture('REVIEW', 409);
    await publishCandidate(candidate, 0, null).expect(202);
    const published = await prisma.resultPublication.findFirstOrThrow({
      where: { candidateId: candidate.candidateId },
    });
    const archived = await withSchool('post', route + '/archive')
      .set('Idempotency-Key', randomUUID())
      .send({
        expectedRevision: period.revision + 1,
        reason: 'Maintain this period as academic history',
      })
      .expect(200);
    expect(archived.body.data).toMatchObject({
      status: 'ARCHIVED',
      revision: period.revision + 2,
    });
    const filtered = await withSchool('get', '/periods')
      .query({ status: 'ARCHIVED' })
      .expect(200);
    expect(filtered.body.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reportingPeriodId: period.id }),
      ]),
    );
    const opened = await withSchool('post', route + '/correction-windows')
      .set('Idempotency-Key', randomUUID())
      .send({
        expectedPeriodRevision: period.revision + 2,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        reason: 'Correct one verified grade',
        targets: [
          {
            slotId: book.slot.id,
            releaseUnitId: book.releaseUnitId,
            authorizedActorIds: [teacher.actor.id],
          },
        ],
      })
      .expect(200);
    const windowId = opened.body.data.correctionWindows[0].windowId as string;
    const edit = {
      reportingPeriodId: period.id,
      academicScope: { level: 'CLASSROOM', ids: [school.classroom.id] },
      groupIds: [math.id],
      format: 'CSV',
      mode: 'EDIT_DRAFT',
      selectedFieldIds: [book.scores[0].id],
    };
    await exportTeacher('post', '/exports/preview').send(edit).expect(409);
    await exportTeacher('post', '/exports/preview')
      .send({ ...edit, selectedSlotIds: [book.slot.id] })
      .expect(200);
    const revoke = await withSchool(
      'post',
      route + '/correction-windows/' + windowId + '/revoke',
    )
      .set('Idempotency-Key', randomUUID())
      .send({ reason: 'End the limited correction' })
      .expect(200);
    expect(revoke.body.data.id).toBe(windowId);
    await exportTeacher('post', '/exports/preview')
      .send({ ...edit, selectedSlotIds: [book.slot.id] })
      .expect(409);
    const target = {
      expectedRevision: period.revision + 2,
      targetStatus: 'OPEN',
      reason: 'School reviewed re-entry scope',
    };
    await withSchool('post', route + '/reopen')
      .set('Idempotency-Key', randomUUID())
      .send(target)
      .expect(409);
    await withSchool('patch', route)
      .send({
        expectedRevision: period.revision + 2,
        patch: { status: 'OPEN' },
      })
      .expect(400);
    const archiveRole = school.run(
      () => getRequestContext()!.activeMembership!.roleId,
    );
    const archivePermission = await prisma.permission.findUniqueOrThrow({
      where: { code: 'official_results.archives.manage' },
    });
    await prisma.rolePermission.deleteMany({
      where: { roleId: archiveRole, permissionId: archivePermission.id },
    });
    try {
      await withSchool('post', route + '/reopen-preview')
        .send(target)
        .expect(404);
    } finally {
      await attachPermissions(archiveRole, [
        'official_results.archives.manage',
      ]);
    }
    const plan = reportOutputs.reopen.parse(
      (
        await withSchool('post', route + '/reopen-preview')
          .send(target)
          .expect(200)
      ).body.data,
    );
    const reopened = await withSchool('post', route + '/reopen')
      .set('Idempotency-Key', randomUUID())
      .send({
        ...target,
        previewId: plan.previewId,
        previewDigest: plan.previewDigest,
      })
      .expect(200);
    expect(reopened.body.data).toMatchObject({
      status: 'OPEN',
      revision: period.revision + 3,
    });
    expect(
      (
        await prisma.resultPublication.findUniqueOrThrow({
          where: { id: published.id },
        })
      ).revision,
    ).toBe(published.revision);
  });

  it('T072 serves an authorized CSV issue report with safe cells and denies unowned file URLs', async () => {
    const book = await liveGradebook('ISSUE-REPORT');
    const { job, rows } = await editableExport(book);
    rows[1][6] = '=1+1';
    const staged = importOutputs.batch.parse(
      (await stageImport(job.exportId, sourceBytes(rows)).expect(202)).body
        .data,
    );
    const batch = await waitForImport('/' + staged.batchId);
    expect(batch.status).toBe('CORRECTIONS_REQUIRED');
    const created = authoringOutputs.operation.parse(
      (
        await importTeacher('post', '/' + batch.batchId + '/issue-report')
          .set('Idempotency-Key', randomUUID())
          .expect(202)
      ).body.data,
    );
    let state = created;
    for (let attempt = 0; attempt < 100 && !state.file; attempt++) {
      state = authoringOutputs.operation.parse(
        (
          await exportTeacher('get', '/operations/' + state.operationId).expect(
            200,
          )
        ).body.data,
      );
      if (!state.file)
        await new Promise<void>((resolve) => setTimeout(resolve, 100));
    }
    expect(state.status).toBe('COMPLETED');
    const path = state.file!.downloadPath.slice(instructor.length);
    const downloaded = await exportTeacher('get', path)
      .expect(200)
      .expect('X-Content-Type-Options', 'nosniff');
    const csv = parseCsv(downloaded.text, { bom: true });
    expect(csv[1][0]).toBe('official_results.import.identity_changed');
    expect(downloaded.text).not.toContain('=1+1');
    await exportTeacher('get', path, 'co-teacher-fixture').expect(404);
    expect(await prisma.file.count({ where: { id: state.file!.fileId } })).toBe(
      0,
    );
  });

  it('T091 preserves publication during a notification failure and deduplicates retry for the current audience', async () => {
    const book = await readyRelease('NOTICE-DELIVERY');
    const [student, parent] = await Promise.all([
      familyUser('STUDENT'),
      familyUser('PARENT'),
    ]);
    await Promise.all([
      attachFamilyMembership(student, school),
      attachFamilyMembership(parent, school),
    ]);
    await prisma.student.update({
      where: { id: book.child.id },
      data: { userId: student.id },
    });
    const guardian = await prisma.guardian.create({
      data: {
        schoolId: school.school.id,
        organizationId: school.school.organizationId,
        userId: parent.id,
        firstName: 'Temporary',
        lastName: 'Recipient',
        phone: '+20100000000',
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
    const candidate = (await book.capture())!;
    await decideCandidate(candidate).expect(200);
    await publishCandidate(candidate, 0, null).expect(202);
    const publication = await prisma.resultPublication.findFirstOrThrow({
      where: { candidateId: candidate.candidateId },
    });
    const before = await prisma.resultPublicationNotice.findFirstOrThrow({
      where: { publicationId: publication.id },
    });
    expect(before.status).toBe('PENDING');
    await prisma.studentGuardian.delete({ where: { id: link.id } });
    const notices = app.get(ResultNoticeService);

    await prisma.$executeRaw`CREATE FUNCTION test_results_notices_unavailable() RETURNS trigger
      LANGUAGE plpgsql AS $test$
      BEGIN
        IF NEW.source_type = 'OFFICIAL_RESULTS_PUBLICATION' AND EXISTS (
          SELECT 1 FROM result_reporting_periods
          WHERE school_id = NEW.school_id AND code = 'NOTICE-DELIVERY'
            AND id::text = NEW.metadata->>'reportingPeriodId'
        ) THEN RAISE EXCEPTION 'simulated isolated in-app failure'; END IF;
        RETURN NEW;
      END; $test$`;
    await prisma.$executeRaw`CREATE TRIGGER test_results_notices_unavailable
      BEFORE INSERT ON communication_notifications
      FOR EACH ROW EXECUTE FUNCTION test_results_notices_unavailable()`;
    try {
      await notices.reconcile();
      expect(
        await prisma.resultPublicationNotice.findUniqueOrThrow({
          where: { id: before.id },
        }),
      ).toMatchObject({ status: 'PENDING', attempts: 1 });
      expect(
        await prisma.resultPublication.count({ where: { id: publication.id } }),
      ).toBe(1);
      expect(
        await prisma.communicationNotification.count({
          where: { sourceId: publication.id },
        }),
      ).toBe(0);
    } finally {
      await prisma.$executeRaw`DROP TRIGGER test_results_notices_unavailable ON communication_notifications`;
      await prisma.$executeRaw`DROP FUNCTION test_results_notices_unavailable()`;
    }
    await notices.reconcile();
    await notices.reconcile();
    const result = await prisma.communicationNotification.findMany({
      where: { schoolId: school.school.id, sourceId: publication.id },
      include: { deliveries: true },
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      recipientUserId: student.id,
      sourceType: 'OFFICIAL_RESULTS_PUBLICATION',
      deliveries: [{ status: 'DELIVERED', channel: 'IN_APP' }],
    });
    expect(result[0].metadata).toEqual({
      destination: 'OFFICIAL_RESULTS',
      reportingPeriodId: book.reportingPeriodId,
    });
    expect(
      (
        await prisma.resultPublicationNotice.findUniqueOrThrow({
          where: { id: before.id },
        })
      ).status,
    ).toBe('DELIVERED');
  });

  it('T096 freezes API and queued grade writes for a disabled school and resumes without losing evidence', async () => {
    const book = await liveGradebook('PILOT-FREEZE');
    const { batch } = await stagedGrade(book, '15.00');
    const queue = app.get(BullmqService).getQueue(resultsBulkQueue);
    const worker = app.get(ResultImportApplyService);
    const previous = process.env.OFFICIAL_RESULTS_SCHOOL_ALLOWLIST;
    await queue.pause();
    let executionId = '';
    try {
      executionId = importOutputs.execution.parse(
        (await confirmImport(batch.batchId, confirmation(batch)).expect(202))
          .body.data,
      ).operationId;
      process.env.OFFICIAL_RESULTS_SCHOOL_ALLOWLIST = otherSchool.school.id;
      await withTeacher(book.url + '/grid').expect(404);
      await worker.run(executionId, 1);
      expect(
        await prisma.resultImportExecutionUnit.findFirstOrThrow({
          where: { executionId },
        }),
      ).toMatchObject({ status: 'QUEUED', attempts: 0 });
      expect(
        await prisma.resultCell.count({ where: { slotId: book.slot.id } }),
      ).toBe(0);
    } finally {
      if (previous === undefined)
        delete process.env.OFFICIAL_RESULTS_SCHOOL_ALLOWLIST;
      else process.env.OFFICIAL_RESULTS_SCHOOL_ALLOWLIST = previous;
      await queue.resume();
    }
    expect(await waitForOperation(executionId)).toMatchObject({
      status: 'APPLIED',
    });
    expect(
      await prisma.resultCellRevision.count({
        where: { cell: { slotId: book.slot.id }, source: 'IMPORT' },
      }),
    ).toBe(1);
  });

  it('T100 denies an accepted execution that reaches the worker after manifest reuse expires', async () => {
    const book = await liveGradebook('EXPIRED-MANIFEST');
    const { batch, job } = await stagedGrade(book, '16.00');
    const queue = app.get(BullmqService).getQueue(resultsBulkQueue);
    await queue.pause();
    try {
      const receipt = importOutputs.execution.parse(
        (await confirmImport(batch.batchId, confirmation(batch)).expect(202))
          .body.data,
      );
      await prisma.resultExport.update({
        where: { id: job.exportId },
        data: {
          createdAt: new Date(Date.now() - 2 * 86_400_000),
          reuseUntil: new Date(Date.now() - 86_400_000),
        },
      });
      await app.get(ResultImportApplyService).run(receipt.operationId, 1);
      const item = await prisma.resultImportExecutionUnit.findFirstOrThrow({
        where: { executionId: receipt.operationId },
      });
      expect(item).toMatchObject({
        status: 'FAILED',
        failureCode: 'official_results.import.export_expired',
        changedCells: 0,
      });
      expect(
        await prisma.resultCell.count({ where: { slotId: book.slot.id } }),
      ).toBe(0);
    } finally {
      await queue.resume();
    }
  });

  it('T090 and T094 expire private bytes while keeping committed results, reviews and idempotency receipts', async () => {
    const book = await readyRelease('PURGE-ARTIFACT');
    const { batch, job } = await stagedGrade(book, '17.00');
    const key = randomUUID();
    const input = confirmation(batch);
    const operation = importOutputs.execution.parse(
      (await confirmImport(batch.batchId, input, key).expect(202)).body.data,
    );
    expect(await waitForOperation(operation.operationId)).toMatchObject({
      status: 'APPLIED',
    });
    const candidate = (await book.capture())!;
    await decideCandidate(candidate).expect(200);
    await publishCandidate(candidate, 0, null).expect(202);
    const publication = await prisma.resultPublication.findFirstOrThrow({
      where: { candidateId: candidate.candidateId },
      include: { candidate: true, reviewDecision: true },
    });
    const files = await prisma.resultImportSource.findFirstOrThrow({
      where: { batchId: batch.batchId },
    });
    const original = await exportTeacher(
      'get',
      '/files/' + files.id + '/download',
    ).expect(200);
    expect(original.headers['content-type']).toBe('application/octet-stream');
    await exportTeacher(
      'get',
      '/files/' + files.id + '/download',
      'co-teacher-fixture',
    ).expect(404);
    await exportTeacher(
      'get',
      '/files/' + job.files[0].fileId + '/download',
    ).expect(200);
    const past = new Date(Date.now() - 500);
    await prisma.resultExport.update({
      where: { id: job.exportId },
      data: {
        createdAt: new Date(Date.now() - 2 * 86_400_000),
        reuseUntil: past,
        expiresAt: past,
      },
    });
    const logs = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const deleted = jest
      .spyOn(app.get(StorageService), 'deleteObjectAndConfirmAbsent')
      .mockRejectedValueOnce(
        new Error('Synthetic transient storage deletion failure'),
      );
    try {
      await app.get(ResultExportService).reconcile();
      expect(deleted).toHaveBeenCalledWith(
        expect.objectContaining({ id: job.files[0].fileId }),
      );
      expect(logs).toHaveBeenCalledWith({
        event: 'official_results.export.cleanup_deferred',
        fileId: job.files[0].fileId,
      });
      expect(
        (
          await prisma.resultExportFile.findUniqueOrThrow({
            where: { id: job.files[0].fileId },
          })
        ).deletedAt,
      ).toBeNull();
    } finally {
      deleted.mockRestore();
      logs.mockRestore();
    }
    await app.get(ResultExportService).reconcile();
    expect(
      (
        await prisma.resultExportFile.findUniqueOrThrow({
          where: { id: job.files[0].fileId },
        })
      ).deletedAt,
    ).not.toBeNull();
    await exportTeacher(
      'get',
      '/files/' + job.files[0].fileId + '/download',
    ).expect(410);
    await app
      .get(ResultImportWorkService)
      .reconcile(new Date(files.expiresAt.getTime() + 1_000));
    await exportTeacher('get', '/files/' + files.id + '/download').expect(410);
    expect(
      (
        await prisma.resultImportSource.findUniqueOrThrow({
          where: { id: files.id },
        })
      ).deletedAt,
    ).not.toBeNull();
    expect(
      await prisma.resultCellRevision.count({
        where: { cell: { slotId: book.slot.id }, source: 'IMPORT' },
      }),
    ).toBe(1);
    expect(
      await prisma.resultImportReview.count({
        where: { batchId: batch.batchId },
      }),
    ).toBe(1);
    const replay = importOutputs.execution.parse(
      (await confirmImport(batch.batchId, input, key).expect(202)).body.data,
    );
    expect(replay).toMatchObject({
      operationId: operation.operationId,
      status: 'APPLIED',
    });
    expect(
      await prisma.resultPublication.findUniqueOrThrow({
        where: { id: publication.id },
        include: { candidate: true, reviewDecision: true },
      }),
    ).toEqual(publication);
    expect(
      await prisma.resultCurrentRelease.count({
        where: { publicationId: publication.id },
      }),
    ).toBe(1);
  });

  it('T006 isolates all Official Results route families for an authenticated administrator in another school', async () => {
    const book = await readyRelease('CROSS-TENANT-ROUTES');
    const { batch, job } = await stagedGrade(book, '19');
    const candidate = (await book.capture())!;
    await decideCandidate(candidate).expect(200);
    await publishCandidate(candidate, 0, null).expect(202);
    const publication = await prisma.resultPublication.findFirstOrThrow({
      where: { candidateId: candidate.candidateId },
    });
    const file = job.files[0];
    const foreign = (method: 'get' | 'post' | 'patch', path: string) =>
      schoolApi()
        [method](management + path)
        .set('Authorization', 'Bearer other-school-fixture')
        .set('Idempotency-Key', randomUUID());
    const routes = [
      '/capabilities?sheetId=' + book.source.id,
      '/sheets/' + book.source.id,
      '/sheets/' + book.source.id + '/grid',
      '/candidates/' + candidate.candidateId,
      '/publications/' + publication.id,
      '/exports/' + job.exportId,
      '/exports/' + job.exportId + '/files/' + file.fileId + '/download',
      '/files/' + file.fileId + '/download',
      '/imports/' + batch.batchId,
      '/imports/' + batch.batchId + '/issues',
      '/imports/' + batch.batchId + '/changes',
      '/imports/' + batch.batchId + '/rows',
    ];
    for (const path of routes) {
      const response = await foreign('get', path).expect(404);
      expect(response.text).not.toContain(book.child.id);
      expect(response.text).not.toContain(book.source.id);
    }
    const writes = await Promise.all([
      foreign('patch', '/periods/' + book.reportingPeriodId).send({
        expectedRevision: 1,
        patch: { name: { ar: 'فترة', en: 'Foreign' } },
      }),
      foreign('patch', '/sheets/' + book.source.id + '/cells').send({
        expectedDefinitionVersionId: book.source.draftDefinitionVersionId,
        expectedSheetRevision: book.source.sheetRevision,
        operations: [scoreOperation(book.slot.id, book.scores[0].id, '19', 1)],
      }),
      foreign('post', '/reviews/decisions').send({
        candidateKind: 'RESULT_RELEASE',
        ...candidateRef(candidate),
        decision: 'APPROVE',
      }),
      foreign('post', '/publications/' + publication.id + '/revoke').send({
        expectedPublicationId: publication.id,
        expectedRevision: publication.revision,
        expectedPublicationGeneration: 1,
        reason: 'Cross-tenant attempt',
      }),
      foreign('post', '/imports/' + batch.batchId + '/confirm').send(
        confirmation(batch),
      ),
    ]);
    for (const { status, text: body } of writes) {
      expect(status).toBe(404);
      expect(body).not.toContain(book.child.id);
    }
    expect(
      await prisma.resultCurrentRelease.count({
        where: { publicationId: publication.id },
      }),
    ).toBe(1);
    expect(
      await prisma.resultImportExecution.count({
        where: { batchId: batch.batchId },
      }),
    ).toBe(0);
  });

  it('T095 exercises every cataloged route with absent authentication and a valid actor sending empty or unknown state', async () => {
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
        method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
        operationId: string;
      }[];
    };
    const student = await attachFamilyMembership(
      await familyUser('STUDENT'),
      school,
    );
    const parent = await attachFamilyMembership(
      await familyUser('PARENT'),
      school,
    );
    let authorizedReads = 0;
    for (const operation of catalog.operations) {
      const path = operation.path.replace(
        /:[A-Za-z0-9]+/gu,
        '44ed43fb-542e-4ad3-b734-ff77b6301dc6',
      );
      const method = operation.method.toLowerCase() as
        | 'get'
        | 'post'
        | 'patch'
        | 'delete'
        | 'put';
      const response = await schoolApi()[method](path);
      expect({
        operation: operation.operationId,
        code: response.status,
      }).toEqual({ operation: operation.operationId, code: 401 });
      const token = path.startsWith(instructor + '/')
        ? 'Bearer teacher-fixture'
        : path.startsWith(api + '/student/')
          ? student.token
          : path.startsWith(api + '/parent/')
            ? parent.token
            : 'Bearer school-fixture';
      const authenticated = schoolApi()
        [method](path)
        .set('Authorization', token)
        .set('Idempotency-Key', randomUUID());
      if (operation.method !== 'GET') authenticated.send({});
      const actual = await authenticated;
      expect({ operation: operation.operationId, expected: true }).toEqual({
        operation: operation.operationId,
        expected: [200, 400, 403, 404, 409].includes(actual.status),
      });
      if (actual.status === 200) authorizedReads += 1;
    }
    expect(authorizedReads).toBeGreaterThan(10);
  });

  it('T093 keeps invalid source content, foreign identities and object details out of errors and logs', async () => {
    const book = await liveGradebook('SAFE-IMPORT-ERROR');
    const { job } = await editableExport(book);
    const rawInput = 'private-fixture-grade-body-' + randomUUID();
    const badBytes = Buffer.from('export_ref,input\n1,"' + rawInput);
    const logs = ['log', 'warn', 'error', 'debug'].map((level) =>
      jest
        .spyOn(Logger.prototype, level as 'log' | 'warn' | 'error' | 'debug')
        .mockImplementation(() => undefined),
    );
    try {
      const source = importOutputs.batch.parse(
        (await stageImport(job.exportId, badBytes).expect(202)).body.data,
      );
      await waitForImport('/' + source.batchId);
      const response = await importTeacher(
        'get',
        '/' + source.batchId + '/issues',
      ).expect(200);
      expect(
        importOutputs.issues.parse(response.body.data).items[0],
      ).toMatchObject({ code: 'official_results.import.malformed_csv' });
      expect(response.text).not.toContain(rawInput);
      expect(
        JSON.stringify(logs.flatMap((entry) => entry.mock.calls)),
      ).not.toContain(rawInput);
      expect(response.text).not.toContain(
        'official-results/' + school.school.id,
      );
    } finally {
      for (const log of logs) log.mockRestore();
    }
  });

  it('T092 measures a populated 9,999-edit sheet at the atomic import budget with a second school active', async () => {
    // Observe worker completion without counting repeated authenticated polling requests as processing queries.
    const waitForBulk = async (
      readStatus: () => Promise<string | undefined>,
      pending: string[],
    ) => {
      const deadline = Date.now() + 35_000;
      while (Date.now() < deadline) {
        const status = await readStatus();
        if (status && !pending.includes(status)) return;
        await new Promise<void>((resolve) => setTimeout(resolve, 500));
      }
      throw new Error('Load operation did not reach a terminal state');
    };
    const seedSize = 3333;
    const now = performance.now();
    const students = await prisma.student.createManyAndReturn({
      data: Array.from({ length: seedSize }, (_, index) => ({
        schoolId: school.school.id,
        organizationId: school.school.organizationId,
        firstName: 'Synthetic ' + index,
        lastName: 'Load',
        firstNameAr: 'اختبار تحميل',
      })),
      select: { id: true },
    });
    await prisma.enrollment.createMany({
      data: students.map(({ id }) => ({
        schoolId: school.school.id,
        academicYearId: school.year.id,
        termId: school.term.id,
        studentId: id,
        classroomId: school.classroom.id,
        enrolledAt: new Date('2026-09-01T08:00:00Z'),
      })),
    });
    // Materialize a new period from the actual shared academic roster.
    const book = await liveGradebook('LOAD-RESULTS-REAL');
    const roster = await prisma.resultSlot.findMany({
      where: {
        schoolId: school.school.id,
        sheetId: book.source.id,
        studentId: { in: students.map(({ id }) => id) },
      },
      select: { id: true },
    });
    expect(roster).toHaveLength(seedSize);
    const scope = authoringOutputs.resolution.parse(
      (
        await withSchool('post', '/scope-resolutions')
          .send({
            reportingPeriodId: book.reportingPeriodId,
            academicScope: { level: 'CLASSROOM', ids: [school.classroom.id] },
            groupIds: [math.id],
            rosterAsOf: '2026-11-21T10:00:00.000Z',
          })
          .expect(200)
      ).body.data,
    );
    expect(scope.tuples[0].rosterCount).toBeGreaterThanOrEqual(seedSize);
    const grid = gradebookOutputs.grid.parse(
      (await withTeacher(book.url + '/grid?limit=200').expect(200)).body.data,
    );
    expect(grid.rows.items).toHaveLength(200);
    expect(grid.rows.nextCursor).toBeTruthy();
    const exportStarted = performance.now();
    const exportQueryBaseline = observedQueries;
    let otherReadMs = 0;
    const [plan, other] = await Promise.all([
      exportTeacher('post', '/exports/preview')
        .send({
          reportingPeriodId: book.reportingPeriodId,
          academicScope: { level: 'CLASSROOM', ids: [school.classroom.id] },
          groupIds: [math.id],
          format: 'CSV',
          mode: 'EDIT_DRAFT',
          selectedSlotIds: roster.map(({ id }) => id),
          selectedFieldIds: book.scores.map(({ id }) => id),
        })
        .expect(200),
      schoolApi()
        .get(management + '/periods')
        .set('Authorization', 'Bearer other-school-fixture')
        .expect(200)
        .then((response) => {
          otherReadMs = Math.ceil(performance.now() - exportStarted);
          return response;
        }),
    ]);
    expect(other.body.data.items).toEqual([]);
    const selection = exportOutputs.preview.parse(plan.body.data);
    expect(selection.summary.rowCount).toBe(seedSize);
    const receipt = exportOutputs.export.parse(
      (
        await exportTeacher('post', '/exports')
          .set('Idempotency-Key', randomUUID())
          .send({
            previewId: selection.previewId,
            previewDigest: selection.previewDigest,
          })
          .expect(202)
      ).body.data,
    );
    await waitForBulk(
      async () =>
        (
          await prisma.resultExport.findUnique({
            where: { id: receipt.exportId },
            select: { status: true },
          })
        )?.status,
      ['QUEUED', 'GENERATING'],
    );
    const job = exportOutputs.export.parse(
      (await withTeacher('/exports/' + receipt.exportId).expect(200)).body.data,
    );
    expect(job.status).toBe('READY');
    const previewMs = Math.ceil(performance.now() - now);
    const downloaded = await exportTeacher(
      'get',
      job.files[0].downloadPath.slice(instructor.length),
    ).expect(200);
    const rows = parseCsv(downloaded.text, { bom: true });
    for (const row of rows.slice(1))
      for (const column of [18, 20, 22]) row[column] = '1.00';
    const exportQueries = observedQueries - exportQueryBaseline;
    const validationQueryBaseline = observedQueries;
    const validateStarted = performance.now();
    const staged = importOutputs.batch.parse(
      (
        await stageImport(
          job.exportId,
          sourceBytes([rows[0], ...rows.slice(1).reverse()]),
        ).expect(202)
      ).body.data,
    );
    await waitForBulk(
      async () =>
        (
          await prisma.resultImportBatch.findUnique({
            where: { id: staged.batchId },
            select: { status: true },
          })
        )?.status,
      ['UPLOADED', 'VALIDATING'],
    );
    const ready = importOutputs.batch.parse(
      (await importTeacher('get', '/' + staged.batchId).expect(200)).body.data,
    );
    expect(ready.status).toBe('READY_TO_CONFIRM');
    expect(ready.summary.changedCells).toBe(9999);
    const validateMs = Math.ceil(performance.now() - validateStarted);
    const validationQueries = observedQueries - validationQueryBaseline;
    const applyQueryBaseline = observedQueries;
    const applyStarted = performance.now();
    const applied = importOutputs.execution.parse(
      (await confirmImport(ready.batchId, confirmation(ready)).expect(202)).body
        .data,
    );
    await waitForBulk(
      async () =>
        (
          await prisma.resultImportExecution.findUnique({
            where: { id: applied.operationId },
            select: { status: true },
          })
        )?.status,
      ['QUEUED', 'APPLYING'],
    );
    const outcome = importOutputs.execution.parse(
      (
        await exportTeacher('get', '/operations/' + applied.operationId).expect(
          200,
        )
      ).body.data,
    );
    expect(outcome.status).toBe('APPLIED');
    const applyMs = Math.ceil(performance.now() - applyStarted);
    const applyQueries = observedQueries - applyQueryBaseline;
    expect(exportQueries).toBeGreaterThan(0);
    expect(validationQueries).toBeGreaterThan(0);
    expect(applyQueries).toBeGreaterThan(0);

    expect(
      await prisma.resultCell.count({
        where: {
          schoolId: school.school.id,
          slot: { sheetId: book.source.id },
        },
      }),
    ).toBe(9999);
    expect(
      await prisma.resultCell.count({
        where: {
          schoolId: otherSchool.school.id,
          slot: { sheetId: book.source.id },
        },
      }),
    ).toBe(0);
    if (process.env.OFFICIAL_RESULTS_LOAD_EVIDENCE) {
      writeFileSync(
        process.env.OFFICIAL_RESULTS_LOAD_EVIDENCE,
        JSON.stringify(
          {
            rows: seedSize,
            changes: 9999,
            csvBytes: job.files[0].sizeBytes,
            exportAndFixtureMs: previewMs,
            validationMs: validateMs,
            confirmationAndCommitMs: applyMs,
            concurrentSchoolReadMs: otherReadMs,
            exportQueries,
            validationQueries,
            applyQueries,
            processHeapUsedBytes: process.memoryUsage().heapUsed,
            processResidentBytes: process.memoryUsage().rss,
          },
          null,
          2,
        ) + '\n',
      );
    }
    // Each phase stays well below one query per student, including progress observation.
    const queryBudgetPerPhase = 600;
    expect(exportQueries).toBeLessThan(queryBudgetPerPhase);
    expect(validationQueries).toBeLessThan(queryBudgetPerPhase);
    expect(applyQueries).toBeLessThan(queryBudgetPerPhase);
  }, 120_000);

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
