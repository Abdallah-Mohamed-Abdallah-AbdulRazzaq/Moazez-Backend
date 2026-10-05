import { AcademicContentWorkflowPublicationCapabilities } from '../../src/modules/academics/academic-content/application/academic-content-workflow-publication-capabilities';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { UserType } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../src/common/context/request-context';
import { GlobalExceptionFilter } from '../../src/common/exceptions/global-exception.filter';
import { PermissionsGuard } from '../../src/common/guards/permissions.guard';
import { REQUIRED_PERMISSIONS_METADATA } from '../../src/common/decorators/required-permissions.decorator';
import { SCHOOL_MANAGEMENT_ONLY_METADATA } from '../../src/common/decorators/school-management-only.decorator';
import { TeacherAppAccessService } from '../../src/modules/teacher-app/access/teacher-app-access.service';
import { TeacherAppAllocationReadAdapter } from '../../src/modules/teacher-app/access/teacher-app-allocation-read.adapter';
import { TeacherAcademicContentController } from '../../src/modules/teacher-app/academic-content/controller/teacher-academic-content.controller';
import {
  GetTeacherAcademicContentCapabilitiesUseCase,
  GetTeacherAcademicContentUseCase,
  ListTeacherAcademicContentUseCase,
} from '../../src/modules/teacher-app/academic-content/application/teacher-academic-content-read.use-cases';
import { TeacherAcademicContentReadAdapter } from '../../src/modules/teacher-app/academic-content/infrastructure/teacher-academic-content-read.adapter';
import { effectiveAcademicContentFilePolicy } from '../../src/modules/academics/academic-content/files/domain/academic-content-file-policy';
import { academicContentManagementScope } from '../../src/modules/academics/academic-content/application/academic-content-management.scope';
import { AcademicContentController } from '../../src/modules/academics/academic-content/controller/academic-content.controller';
import { TeacherLessonPreparationController } from '../../src/modules/teacher-app/lesson-preparation/controller/teacher-lesson-preparation.controller';
import { ScopeMissingException } from '../../src/modules/iam/auth/domain/auth.exceptions';
import { DomainException } from '../../src/common/exceptions/domain-exception';

const grants = [
  'academics.academic_content.view',
  'academics.academic_content.manage',
  'academics.academic_content.publish',
];
const teacherId = '00000000-0000-4000-8000-000000000001';
const schoolId = '00000000-0000-4000-8000-000000000002';
const read = {
  list: jest.fn(() =>
    Promise.resolve({ items: [], page: 1, limit: 50, total: 0 }),
  ),
  detail: jest.fn(() => Promise.resolve(null)),
  settings: jest.fn(() =>
    Promise.resolve({
      workflow: { preparationApprovalRequired: false },
      files: effectiveAcademicContentFilePolicy(),
    }),
  ),
};

describe('Teacher Academic Content HTTP actor and permission boundary', () => {
  let app: INestApplication<App>;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [TeacherAcademicContentController],
      providers: [
        TeacherAppAccessService,
        GetTeacherAcademicContentCapabilitiesUseCase,
        GetTeacherAcademicContentUseCase,
        ListTeacherAcademicContentUseCase,
        {
          provide: TeacherAppAllocationReadAdapter,
          useValue: {
            findOwnedAllocationById: jest.fn(() => Promise.resolve(null)),
          },
        },
        { provide: TeacherAcademicContentReadAdapter, useValue: read },
        {
          provide: AcademicContentWorkflowPublicationCapabilities,
          useValue: { evaluateAuthorizedContent: jest.fn() },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(
      (
        req: { headers: Record<string, string> },
        _res: unknown,
        next: () => void,
      ) => {
        const context = createRequestContext();
        context.actor = {
          id: teacherId,
          userType:
            (req.headers['x-actor'] as UserType | undefined) ??
            UserType.TEACHER,
        };
        context.activeMembership = {
          membershipId: teacherId,
          schoolId,
          organizationId: teacherId,
          roleId: teacherId,
          permissions: req.headers['x-missing'] ? [] : grants,
        };
        runWithRequestContext(context, next);
      },
    );
    app.useGlobalGuards(new PermissionsGuard(new Reflector()));
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => jest.clearAllMocks());

  it('allows Teacher view and resolves the static settings route before contentId', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/teacher/academic-content')
      .expect(200);
    const response = await request(app.getHttpServer())
      .get('/api/v1/teacher/academic-content/capabilities')
      .expect(200);
    expect(response.body).toEqual({
      workflow: { preparationApprovalRequired: false },
      files: {
        attachmentsEnabled: true,
        maximumFileSizeBytes: expect.any(String) as unknown,
        documentsEnabled: true,
        imagesEnabled: true,
        videosEnabled: true,
        audioEnabled: true,
        archivesEnabled: false,
        otherFilesEnabled: false,
        allowInlinePreview: true,
      },
    });
    expect(read.detail).not.toHaveBeenCalled();
  });

  it.each([
    UserType.SCHOOL_USER,
    UserType.ORGANIZATION_USER,
    UserType.PARENT,
    UserType.STUDENT,
  ])('denies %s despite Academic Content permissions', async (userType) => {
    for (const suffix of ['', '/capabilities', '/' + teacherId])
      await request(app.getHttpServer())
        .get('/api/v1/teacher/academic-content' + suffix)
        .set('x-actor', userType)
        .expect(403);
    expect(read.list).not.toHaveBeenCalled();
    expect(read.detail).not.toHaveBeenCalled();
    expect(read.settings).not.toHaveBeenCalled();
  });

  it('denies missing view on all routes, and safely hides unowned detail/classId', async () => {
    for (const suffix of ['', '/capabilities', '/' + teacherId])
      await request(app.getHttpServer())
        .get('/api/v1/teacher/academic-content' + suffix)
        .set('x-missing', 'yes')
        .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/teacher/academic-content/' + teacherId)
      .expect(404);
    await request(app.getHttpServer())
      .get('/api/v1/teacher/academic-content')
      .query({ classId: teacherId })
      .expect(404);
  });

  it.each([
    'teacherUserId',
    'schoolId',
    'organizationId',
    'academicYearId',
    'termId',
    'subjectId',
    'classroomId',
    'teacherSubjectAllocationId',
  ])('rejects arbitrary %s', async (field) => {
    await request(app.getHttpServer())
      .get('/api/v1/teacher/academic-content')
      .query({ [field]: teacherId })
      .expect(400);
    expect(read.list).not.toHaveBeenCalled();
  });

  it.each([{ page: 0 }, { page: 1.5 }, { limit: 0 }, { limit: 101 }])(
    'bounds pagination %j',
    async (query) => {
      await request(app.getHttpServer())
        .get('/api/v1/teacher/academic-content')
        .query(query)
        .expect(400);
    },
  );

  it('registers exactly three GET routes with view, preserving old lesson-preparation metadata', () => {
    const prototype = TeacherAcademicContentController.prototype;
    const routes = Object.getOwnPropertyNames(prototype).filter((name) =>
      Reflect.hasMetadata(
        METHOD_METADATA,
        prototype[name as keyof typeof prototype],
      ),
    );
    expect(routes).toEqual(['capabilities', 'list', 'detail']);
    for (const route of routes) {
      const handler = prototype[route as keyof typeof prototype];
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(0);
      expect(
        Reflect.getMetadata(REQUIRED_PERMISSIONS_METADATA, handler),
      ).toEqual([grants[0]]);
    }
    expect(
      Reflect.getMetadata(PATH_METADATA, TeacherLessonPreparationController),
    ).toBe('teacher/lesson-preparation');
  });

  it('keeps both production management layers closed to a Teacher with precisely the three grants', () => {
    const context = createRequestContext();
    context.actor = { id: teacherId, userType: UserType.TEACHER };
    context.activeMembership = {
      membershipId: teacherId,
      schoolId,
      organizationId: teacherId,
      roleId: teacherId,
      permissions: grants,
    };
    runWithRequestContext(context, () => {
      expect(
        Reflect.getMetadata(
          SCHOOL_MANAGEMENT_ONLY_METADATA,
          AcademicContentController,
        ),
      ).toBe(true);
      for (const permission of grants)
        expect(() =>
          academicContentManagementScope(
            permission as Parameters<typeof academicContentManagementScope>[0],
          ),
        ).toThrow(DomainException);
      const handler = Object.getOwnPropertyDescriptor(
        AcademicContentController.prototype,
        'list',
      )?.value as () => unknown;
      const execution = {
        getClass: () => AcademicContentController,
        getHandler: () => handler,
      } as Parameters<PermissionsGuard['canActivate']>[0];
      expect(() =>
        new PermissionsGuard(new Reflector()).canActivate(execution),
      ).toThrow(ScopeMissingException);
    });
  });
});
