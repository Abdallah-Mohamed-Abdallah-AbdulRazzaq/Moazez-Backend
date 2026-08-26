import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { REQUIRED_PERMISSIONS_METADATA } from '../../../../common/decorators/required-permissions.decorator';
import { CreateStudentBulkRegistrationUseCase } from '../application/create-student-bulk-registration.use-case';
import { GetStudentBulkRegistrationTemplateUseCase } from '../application/get-student-bulk-registration-template.use-case';
import { StudentBulkRegistrationPreflightUseCase } from '../application/student-bulk-registration-preflight.use-case';
import { GetStudentBulkRegistrationBatchUseCase } from '../application/get-student-bulk-registration-batch.use-case';
import { ListStudentBulkRegistrationRowsUseCase } from '../application/list-student-bulk-registration-rows.use-case';
import { StudentBulkRegistrationController } from '../controller/student-bulk-registration.controller';
import { STUDENT_BULK_REGISTRATION_TEMPLATE_CSV } from '../domain/student-bulk-registration.constants';
import type { UploadedMultipartFile } from '../../../files/uploads/domain/uploaded-file';
import type { CreateStudentBulkRegistrationDto } from '../dto/student-bulk-registration.dto';

describe('StudentBulkRegistrationController API contract', () => {
  const placement = {
    academicYearId: '11111111-1111-4111-8111-111111111111',
    classroomId: '33333333-3333-4333-8333-333333333333',
    enrollmentDate: '2026-09-01',
  };
  const preflightResponse = {
    valid: true,
    errors: [],
    templateVersion: 1,
    placement: null,
    studentSeat: null,
  };
  const createResponse = {
    id: 'batch-1',
    sourceImportJobId: 'job-1',
    status: 'UPLOADED',
    templateVersion: 1,
    placement: { ...placement, termId: null },
    counters: {
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      createdRows: 0,
      failedRows: 0,
    },
    createdAt: '2026-08-26T08:00:00.000Z',
    updatedAt: '2026-08-26T08:00:00.000Z',
  };

  let app: INestApplication<App>;
  let preflightUseCase: { execute: jest.Mock };
  let templateUseCase: { execute: jest.Mock };
  let createUseCase: { execute: jest.Mock };
  let getBatchUseCase: { execute: jest.Mock };
  let listRowsUseCase: { execute: jest.Mock };

  beforeAll(async () => {
    preflightUseCase = {
      execute: jest.fn().mockResolvedValue(preflightResponse),
    };
    templateUseCase = {
      execute: jest
        .fn()
        .mockReturnValue(STUDENT_BULK_REGISTRATION_TEMPLATE_CSV),
    };
    createUseCase = { execute: jest.fn().mockResolvedValue(createResponse) };
    getBatchUseCase = {
      execute: jest.fn().mockResolvedValue({
        ...createResponse,
        validatedAt: null,
        validationErrors: [],
      }),
    };
    listRowsUseCase = {
      execute: jest.fn().mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 50,
      }),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [StudentBulkRegistrationController],
      providers: [
        {
          provide: StudentBulkRegistrationPreflightUseCase,
          useValue: preflightUseCase,
        },
        {
          provide: GetStudentBulkRegistrationTemplateUseCase,
          useValue: templateUseCase,
        },
        {
          provide: CreateStudentBulkRegistrationUseCase,
          useValue: createUseCase,
        },
        {
          provide: GetStudentBulkRegistrationBatchUseCase,
          useValue: getBatchUseCase,
        },
        {
          provide: ListStudentBulkRegistrationRowsUseCase,
          useValue: listRowsUseCase,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('pins both Students permissions on all endpoints', () => {
    for (const methodName of [
      'preflight',
      'getTemplate',
      'create',
      'getBatch',
      'listRows',
    ] as const) {
      expect(
        Reflect.getMetadata(
          REQUIRED_PERMISSIONS_METADATA,
          getControllerHandler(methodName),
        ),
      ).toEqual(['students.records.manage', 'students.enrollments.manage']);
    }
  });

  it('exposes a 200 preflight route with the placement-only DTO', async () => {
    await request(app.getHttpServer())
      .post('/students-guardians/bulk-registrations/preflight')
      .send(placement)
      .expect(200, preflightResponse);

    expect(preflightUseCase.execute).toHaveBeenCalledWith(placement);
  });

  it('returns the deterministic CSV attachment directly', async () => {
    const response = await request(app.getHttpServer())
      .get('/students-guardians/bulk-registrations/template')
      .expect(200);

    expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="student-bulk-registration-v1.csv"',
    );
    expect(response.text).toBe(STUDENT_BULK_REGISTRATION_TEMPLATE_CSV);
  });

  it('binds the multipart field named file and returns 201', async () => {
    await request(app.getHttpServer())
      .post('/students-guardians/bulk-registrations')
      .field('academicYearId', placement.academicYearId)
      .field('classroomId', placement.classroomId)
      .field('enrollmentDate', placement.enrollmentDate)
      .attach('file', Buffer.from('arbitrary,csv'), {
        filename: 'students.csv',
        contentType: 'text/csv',
      })
      .expect(201, createResponse);

    expect(createUseCase.execute).toHaveBeenCalledTimes(1);
    const [dto, uploadedFile] = (
      createUseCase.execute.mock.calls as Array<
        [CreateStudentBulkRegistrationDto, UploadedMultipartFile]
      >
    )[0];
    expect(dto).toEqual(placement);
    expect(uploadedFile).toMatchObject({
      originalname: 'students.csv',
      mimetype: 'text/csv',
    });
    expect(Buffer.isBuffer(uploadedFile.buffer)).toBe(true);
  });

  it.each(['schoolId', 'organizationId', 'type', 'templateVersion', 'status'])(
    'rejects client-owned %s injection',
    async (field) => {
      await request(app.getHttpServer())
        .post('/students-guardians/bulk-registrations/preflight')
        .send({ ...placement, [field]: 'forbidden' })
        .expect(400);

      expect(preflightUseCase.execute).not.toHaveBeenCalled();
    },
  );

  it('exposes batch detail and paginated row preview routes', async () => {
    const batchId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    await request(app.getHttpServer())
      .get(`/students-guardians/bulk-registrations/${batchId}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(
        `/students-guardians/bulk-registrations/${batchId}/rows?page=2&limit=25&status=INVALID`,
      )
      .expect(200);
    expect(getBatchUseCase.execute).toHaveBeenCalledWith(batchId);
    expect(listRowsUseCase.execute).toHaveBeenCalledWith(batchId, {
      page: 2,
      limit: 25,
      status: 'INVALID',
    });
  });

  it('does not expose the Stage 5 confirm route', async () => {
    await request(app.getHttpServer())
      .post('/students-guardians/bulk-registrations/batch-1/confirm')
      .expect(404);
  });
});

function getControllerHandler(
  methodName: 'preflight' | 'getTemplate' | 'create' | 'getBatch' | 'listRows',
): object {
  const handler = Object.getOwnPropertyDescriptor(
    StudentBulkRegistrationController.prototype,
    methodName,
  )?.value as unknown;
  if (typeof handler !== 'function') {
    throw new Error(`Missing controller handler: ${methodName}`);
  }
  return handler;
}
