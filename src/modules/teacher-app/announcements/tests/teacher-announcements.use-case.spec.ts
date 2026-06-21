import {
  CommunicationAnnouncementPriority,
  CommunicationAnnouncementStatus,
} from '@prisma/client';
import {
  ArchiveCommunicationAnnouncementUseCase,
  CreateCommunicationAnnouncementUseCase,
  PublishCommunicationAnnouncementUseCase,
  UpdateCommunicationAnnouncementUseCase,
} from '../../../communication/application/communication-announcement.use-cases';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import type { TeacherAppContext } from '../../shared/teacher-app-context';
import type { TeacherAppAllocationRecord } from '../../shared/teacher-app.types';
import {
  ArchiveTeacherAnnouncementUseCase,
  CreateTeacherAnnouncementUseCase,
  GetTeacherAnnouncementUseCase,
  ListTeacherAnnouncementsUseCase,
  PublishTeacherAnnouncementUseCase,
  UpdateTeacherAnnouncementUseCase,
} from '../application/teacher-announcements.use-cases';
import {
  TeacherAnnouncementRecord,
  TeacherAnnouncementsReadAdapter,
} from '../infrastructure/teacher-announcements-read.adapter';

describe('Teacher announcements use cases', () => {
  it('lists only teacher-app announcements through owned allocations', async () => {
    const { listUseCase, accessService, readAdapter } = createUseCases();

    const result = await listUseCase.execute({ status: 'draft', limit: 10 });

    expect(accessService.assertCurrentTeacher).toHaveBeenCalled();
    expect(accessService.listOwnedTeacherAllocations).toHaveBeenCalled();
    expect(readAdapter.listTeacherAnnouncements).toHaveBeenCalledWith({
      context: expect.objectContaining({ teacherUserId: 'teacher-user-1' }),
      allocations: [allocationFixture()],
      filters: { status: 'draft', limit: 10 },
    });
    expect(result.announcements[0]).toMatchObject({
      announcementId: 'announcement-1',
      audience: 'students_and_parents',
      target: {
        classId: 'allocation-1',
        classroomId: 'classroom-1',
      },
    });
    expect(JSON.stringify(result)).not.toContain('createdById');
    expect(JSON.stringify(result)).not.toContain('schoolId');
    expect(JSON.stringify(result)).not.toContain('teacherAllocationId');
  });

  it('creates a draft classroom announcement with custom student and parent audience rows', async () => {
    const { createUseCase, readAdapter, createCore, publishCore } =
      createUseCases();

    const result = await createUseCase.execute({
      title: 'Quiz tomorrow',
      body: 'Please revise chapter 3.',
      target: { type: 'classroom', classId: 'allocation-1' },
      audience: 'students_and_parents',
      priority: 'important',
      publishNow: false,
    });

    expect(readAdapter.resolveAudienceRowsForClassroom).toHaveBeenCalledWith({
      classroomId: 'classroom-1',
      audience: 'students_and_parents',
    });
    expect(createCore.execute).toHaveBeenCalledWith({
      title: 'Quiz tomorrow',
      body: 'Please revise chapter 3.',
      status: 'draft',
      priority: 'high',
      audienceType: 'custom',
      audiences: [
        { audienceType: 'custom', userId: 'student-user-1' },
        { audienceType: 'custom', guardianId: 'guardian-1' },
      ],
      metadata: {
        teacherApp: expect.objectContaining({
          source: 'teacher_app',
          classId: 'allocation-1',
          classroomId: 'classroom-1',
          audience: 'students_and_parents',
        }),
      },
    });
    expect(publishCore.execute).not.toHaveBeenCalled();
    expect(result.announcement).toMatchObject({
      announcementId: 'announcement-1',
      priority: 'important',
      canPublish: true,
    });
  });

  it('publishes immediately only after draft creation when publishNow is requested', async () => {
    const { createUseCase, publishCore } = createUseCases({
      announcement: announcementFixture({
        status: CommunicationAnnouncementStatus.PUBLISHED,
        publishedAt: new Date('2026-09-20T08:00:00.000Z'),
      }),
    });

    const result = await createUseCase.execute({
      title: 'Published now',
      body: 'This is live.',
      target: { type: 'classroom', classroomId: 'classroom-1' },
      audience: 'students',
      publishNow: true,
    });

    expect(publishCore.execute).toHaveBeenCalledWith('announcement-1');
    expect(result.announcement).toMatchObject({
      status: 'published',
      canEdit: false,
      canPublish: false,
    });
  });

  it('blocks create for classrooms outside the teacher allocations before calling core', async () => {
    const { createUseCase, createCore } = createUseCases();

    await expect(
      createUseCase.execute({
        title: 'Bad target',
        body: 'Should fail.',
        target: { type: 'classroom', classroomId: 'foreign-classroom' },
        audience: 'students',
      }),
    ).rejects.toMatchObject({ code: 'validation.failed' });
    expect(createCore.execute).not.toHaveBeenCalled();
  });

  it('updates only an existing owned teacher-app draft announcement', async () => {
    const { updateUseCase, updateCore, readAdapter } = createUseCases();

    await updateUseCase.execute('announcement-1', {
      title: 'Updated title',
      target: { type: 'classroom', classId: 'allocation-1' },
      audience: 'parents',
      priority: 'normal',
    });

    expect(readAdapter.findTeacherAnnouncement).toHaveBeenCalledWith({
      context: expect.objectContaining({ teacherUserId: 'teacher-user-1' }),
      allocations: [allocationFixture()],
      announcementId: 'announcement-1',
    });
    expect(updateCore.execute).toHaveBeenCalledWith('announcement-1', {
      title: 'Updated title',
      priority: 'normal',
      audienceType: 'custom',
      audiences: [{ audienceType: 'custom', guardianId: 'guardian-1' }],
      metadata: {
        teacherApp: expect.objectContaining({
          classId: 'allocation-1',
          classroomId: 'classroom-1',
          audience: 'parents',
        }),
      },
    });
  });

  it('returns not found for announcement ids outside the teacher scope', async () => {
    const { detailUseCase, updateUseCase, readAdapter } = createUseCases();
    readAdapter.findTeacherAnnouncement.mockResolvedValue(null);

    await expect(detailUseCase.execute('foreign-announcement')).rejects.toMatchObject(
      { code: 'not_found' },
    );
    await expect(
      updateUseCase.execute('foreign-announcement', { title: 'Nope' }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('publishes and archives only after teacher ownership and allocation checks', async () => {
    const { publishUseCase, archiveUseCase, publishCore, archiveCore } =
      createUseCases();

    await publishUseCase.execute('announcement-1');
    await archiveUseCase.execute('announcement-1');

    expect(publishCore.execute).toHaveBeenCalledWith('announcement-1');
    expect(archiveCore.execute).toHaveBeenCalledWith('announcement-1');
  });
});

function createUseCases(options?: {
  announcement?: TeacherAnnouncementRecord;
}): {
  listUseCase: ListTeacherAnnouncementsUseCase;
  detailUseCase: GetTeacherAnnouncementUseCase;
  createUseCase: CreateTeacherAnnouncementUseCase;
  updateUseCase: UpdateTeacherAnnouncementUseCase;
  publishUseCase: PublishTeacherAnnouncementUseCase;
  archiveUseCase: ArchiveTeacherAnnouncementUseCase;
  accessService: jest.Mocked<TeacherAppAccessService>;
  readAdapter: jest.Mocked<TeacherAnnouncementsReadAdapter>;
  createCore: jest.Mocked<CreateCommunicationAnnouncementUseCase>;
  updateCore: jest.Mocked<UpdateCommunicationAnnouncementUseCase>;
  publishCore: jest.Mocked<PublishCommunicationAnnouncementUseCase>;
  archiveCore: jest.Mocked<ArchiveCommunicationAnnouncementUseCase>;
} {
  const announcement = options?.announcement ?? announcementFixture();
  const accessService = {
    assertCurrentTeacher: jest.fn(() => contextFixture()),
    listOwnedTeacherAllocations: jest.fn(() =>
      Promise.resolve([allocationFixture()]),
    ),
  } as unknown as jest.Mocked<TeacherAppAccessService>;
  const readAdapter = {
    listTeacherAnnouncements: jest.fn(() =>
      Promise.resolve({
        items: [announcement],
        total: 1,
        page: 1,
        limit: 50,
      }),
    ),
    findTeacherAnnouncement: jest.fn(() => Promise.resolve(announcement)),
    resolveAudienceRowsForClassroom: jest.fn(({ audience }) =>
      Promise.resolve(
        audience === 'parents'
          ? [{ audienceType: 'custom', guardianId: 'guardian-1' }]
          : [
              { audienceType: 'custom', userId: 'student-user-1' },
              { audienceType: 'custom', guardianId: 'guardian-1' },
            ],
      ),
    ),
  } as unknown as jest.Mocked<TeacherAnnouncementsReadAdapter>;
  const createCore = {
    execute: jest.fn(() => Promise.resolve({ id: 'announcement-1' })),
  } as unknown as jest.Mocked<CreateCommunicationAnnouncementUseCase>;
  const updateCore = {
    execute: jest.fn(() => Promise.resolve({ id: 'announcement-1' })),
  } as unknown as jest.Mocked<UpdateCommunicationAnnouncementUseCase>;
  const publishCore = {
    execute: jest.fn(() => Promise.resolve({ id: 'announcement-1' })),
  } as unknown as jest.Mocked<PublishCommunicationAnnouncementUseCase>;
  const archiveCore = {
    execute: jest.fn(() => Promise.resolve({ id: 'announcement-1' })),
  } as unknown as jest.Mocked<ArchiveCommunicationAnnouncementUseCase>;

  return {
    listUseCase: new ListTeacherAnnouncementsUseCase(
      accessService,
      readAdapter,
    ),
    detailUseCase: new GetTeacherAnnouncementUseCase(
      accessService,
      readAdapter,
    ),
    createUseCase: new CreateTeacherAnnouncementUseCase(
      accessService,
      readAdapter,
      createCore,
      publishCore,
    ),
    updateUseCase: new UpdateTeacherAnnouncementUseCase(
      accessService,
      readAdapter,
      updateCore,
    ),
    publishUseCase: new PublishTeacherAnnouncementUseCase(
      accessService,
      readAdapter,
      publishCore,
    ),
    archiveUseCase: new ArchiveTeacherAnnouncementUseCase(
      accessService,
      readAdapter,
      archiveCore,
    ),
    accessService,
    readAdapter,
    createCore,
    updateCore,
    publishCore,
    archiveCore,
  };
}

function contextFixture(): TeacherAppContext {
  return {
    teacherUserId: 'teacher-user-1',
    schoolId: 'school-1',
    organizationId: 'org-1',
    membershipId: 'membership-1',
    roleId: 'role-1',
    permissions: [],
  };
}

function allocationFixture(): TeacherAppAllocationRecord {
  return {
    id: 'allocation-1',
    schoolId: 'school-1',
    teacherUserId: 'teacher-user-1',
    subjectId: 'subject-1',
    classroomId: 'classroom-1',
    termId: 'term-1',
    subject: {
      id: 'subject-1',
      schoolId: 'school-1',
      nameAr: 'Math AR',
      nameEn: 'Math',
      code: 'MATH',
    },
    classroom: {
      id: 'classroom-1',
      schoolId: 'school-1',
      sectionId: 'section-1',
      roomId: null,
      nameAr: 'Classroom AR',
      nameEn: 'Classroom',
      room: null,
      section: {
        id: 'section-1',
        schoolId: 'school-1',
        gradeId: 'grade-1',
        nameAr: 'Section AR',
        nameEn: 'Section',
        grade: {
          id: 'grade-1',
          schoolId: 'school-1',
          stageId: 'stage-1',
          nameAr: 'Grade AR',
          nameEn: 'Grade',
          stage: {
            id: 'stage-1',
            schoolId: 'school-1',
            nameAr: 'Stage AR',
            nameEn: 'Stage',
          },
        },
      },
    },
    term: {
      id: 'term-1',
      schoolId: 'school-1',
      academicYearId: 'academic-year-1',
      nameAr: 'Term AR',
      nameEn: 'Term',
      isActive: true,
    },
  };
}

function announcementFixture(
  overrides?: Partial<TeacherAnnouncementRecord>,
): TeacherAnnouncementRecord {
  return {
    id: 'announcement-1',
    title: 'Quiz tomorrow',
    body: 'Please revise chapter 3.',
    status: CommunicationAnnouncementStatus.DRAFT,
    priority: CommunicationAnnouncementPriority.HIGH,
    publishedAt: null,
    archivedAt: null,
    createdAt: new Date('2026-09-19T08:00:00.000Z'),
    updatedAt: new Date('2026-09-19T08:00:00.000Z'),
    metadata: {
      teacherApp: {
        source: 'teacher_app',
        targetType: 'classroom',
        classId: 'allocation-1',
        classroomId: 'classroom-1',
        label: 'Grade / Section / Classroom',
        audience: 'students_and_parents',
      },
    },
    _count: {
      attachments: 0,
      reads: 0,
    },
    ...overrides,
  };
}
