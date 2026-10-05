import { randomUUID } from 'node:crypto';
import { ValidationPipe } from '@nestjs/common';
import {
  AcademicContentAudienceType,
  AcademicContentType,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../../../common/context/request-context';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import { TeacherAppAllocationReadAdapter } from '../../access/teacher-app-allocation-read.adapter';
import { TeacherAcademicContentAuthoringUseCases } from '../application/teacher-academic-content-authoring.use-cases';
import { AcademicContentAuthoringOperations } from '../../../academics/academic-content/application/academic-content-authoring.operations';
import { GetAcademicContentReadinessUseCase } from '../../../academics/academic-content/application/academic-content-readiness.use-case';
import { TeacherAcademicContentReadAdapter } from '../infrastructure/teacher-academic-content-read.adapter';
import {
  CreateTeacherAcademicContentDto,
  ReplaceTeacherAcademicContentTargetsDto,
} from '../dto/teacher-academic-content-authoring.dto';

describe('ACC-9B application permission defense and client context', () => {
  const id = randomUUID();
  const access = new TeacherAppAccessService(
    {} as TeacherAppAllocationReadAdapter,
  );
  const replaceTargetsMock = jest.fn();
  const authoring = Object.fromEntries(
    [
      'create',
      'update',
      'lifecycle',
      'replaceTargets',
      'preparation',
      'weeklyPlan',
      'guardianNote',
      'subjectResource',
      'onlineSession',
      'links',
      'tags',
    ].map((method) => [
      method,
      method === 'replaceTargets' ? replaceTargetsMock : jest.fn(),
    ]),
  ) as unknown as AcademicContentAuthoringOperations;
  const read = { detail: jest.fn() };
  const core = { evaluateAuthorizedContent: jest.fn() };
  const useCases = new TeacherAcademicContentAuthoringUseCases(
    access,
    authoring,
    read as unknown as TeacherAcademicContentReadAdapter,
    core as unknown as GetAcademicContentReadinessUseCase,
  );
  const command = {
    type: AcademicContentType.GENERAL_RESOURCE,
    audience: AcademicContentAudienceType.STUDENTS,
    title: 'Resource',
  };
  const mutations: Array<[string, () => unknown]> = [
    ['create', () => useCases.create(id, command)],
    ['metadata', () => useCases.update(id, { title: 'Changed' })],
    ['archive', () => useCases.archive(id)],
    ['restore', () => useCases.restore(id)],
    ['delete', () => useCases.delete(id)],
    ['targets', () => useCases.targets(id, { classIds: [id] })],
    [
      'preparation',
      () =>
        useCases.preparation(id, {
          objectives: [],
          learningOutcomes: [],
          teachingStrategies: [],
          activities: [],
        }),
    ],
    [
      'weekly plan',
      () =>
        useCases.weeklyPlan(id, {
          weekStartDate: '2030-06-01',
          weekEndDate: '2030-06-07',
          objectives: [],
          topics: [],
          homeworkAssignmentIds: [],
          gradeAssessmentIds: [],
        }),
    ],
    [
      'guardian note',
      () =>
        useCases.guardianNote(id, {
          body: 'Note',
          priority: 'NORMAL',
          requiresAcknowledgement: false,
        }),
    ],
    [
      'subject resource',
      () => useCases.subjectResource(id, { resourceCategory: 'OTHER' }),
    ],
    [
      'online session',
      () =>
        useCases.onlineSession(id, {
          platform: 'ZOOM',
          joinUrl: 'https://example.test',
          startAt: '2030-06-01T10:00:00Z',
          endAt: '2030-06-01T11:00:00Z',
          timezone: 'Africa/Cairo',
        }),
    ],
    ['links', () => useCases.links(id, [])],
    ['tags', () => useCases.tags(id, [])],
  ];
  function scoped<T>(
    action: () => T,
    userType: UserType,
    permissions: string[],
  ): T {
    const context = createRequestContext();
    context.actor = { id, userType };
    context.activeMembership = {
      schoolId: randomUUID(),
      organizationId: randomUUID(),
      membershipId: randomUUID(),
      roleId: randomUUID(),
      permissions,
    };
    return runWithRequestContext(context, action);
  }
  beforeEach(() => jest.clearAllMocks());

  it.each(mutations)(
    'denies missing manage on %s before any Core call',
    async (_name, action) => {
      await expect(
        Promise.resolve().then(() =>
          scoped(action, UserType.TEACHER, ['academics.academic_content.view']),
        ),
      ).rejects.toMatchObject({ httpStatus: 403 });
      for (const method of Object.values(authoring))
        expect(method).not.toHaveBeenCalled();
    },
  );
  it.each(mutations)(
    'denies all non-Teacher actors on %s even with manage',
    async (_name, action) => {
      for (const userType of Object.values(UserType).filter(
        (type) => type !== UserType.TEACHER,
      )) {
        await expect(
          Promise.resolve().then(() =>
            scoped(action, userType, ['academics.academic_content.manage']),
          ),
        ).rejects.toMatchObject({ httpStatus: 403 });
      }
      for (const method of Object.values(authoring))
        expect(method).not.toHaveBeenCalled();
    },
  );
  it('requires view independently for readiness and does not disclose unreadable content', async () => {
    await expect(
      scoped(() => useCases.readiness(id), UserType.TEACHER, [
        'academics.academic_content.manage',
      ]),
    ).rejects.toMatchObject({ httpStatus: 403 });
    expect(read.detail).not.toHaveBeenCalled();
    read.detail.mockResolvedValue(null);
    await expect(
      scoped(() => useCases.readiness(id), UserType.TEACHER, [
        'academics.academic_content.view',
      ]),
    ).rejects.toMatchObject({ httpStatus: 404 });
    expect(core.evaluateAuthorizedContent).not.toHaveBeenCalled();
    read.detail.mockResolvedValue({ id });
    core.evaluateAuthorizedContent.mockResolvedValue({
      canAdvance: false,
      blockingReasons: ['TITLE_REQUIRED'],
    });
    expect(
      await scoped(() => useCases.readiness(id), UserType.TEACHER, [
        'academics.academic_content.view',
      ]),
    ).toEqual({ canAdvance: false, blockingReasons: ['TITLE_REQUIRED'] });
  });
  it('rejects raw target context at direct application invocation', () => {
    const input = { classIds: [id], targets: [] };
    expect(() =>
      scoped(() => useCases.targets(id, input), UserType.TEACHER, [
        'academics.academic_content.manage',
      ]),
    ).toThrow();
    expect(replaceTargetsMock).not.toHaveBeenCalled();
  });
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  it.each([
    'academicYearId',
    'termId',
    'subjectId',
    'classroomId',
    'teacherSubjectAllocationId',
    'teacherUserId',
    'schoolId',
    'organizationId',
  ])('rejects client-supplied %s on create', async (field) => {
    await expect(
      pipe.transform(
        { ...command, [field]: id },
        { type: 'body', metatype: CreateTeacherAcademicContentDto },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
  it.each([
    { classIds: [] },
    { classIds: [id, id] },
    { classIds: Array.from({ length: 51 }, () => randomUUID()) },
    { classIds: ['not-a-uuid'] },
  ])(
    'rejects malformed classIds %j through HTTP validation',
    async ({ classIds }) => {
      await expect(
        pipe.transform(
          { classIds },
          { type: 'body', metatype: ReplaceTeacherAcademicContentTargetsDto },
        ),
      ).rejects.toMatchObject({ status: 400 });
    },
  );
  it('allows only the Teacher classIds contract', async () => {
    expect(
      await pipe.transform(
        { classIds: [id] },
        { type: 'body', metatype: ReplaceTeacherAcademicContentTargetsDto },
      ),
    ).toEqual({ classIds: [id] });
    await expect(
      pipe.transform(
        { targets: [{ classroomId: id }] },
        { type: 'body', metatype: ReplaceTeacherAcademicContentTargetsDto },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});
