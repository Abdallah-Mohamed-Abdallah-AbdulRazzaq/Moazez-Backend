import { HomeworkAssignmentMode, HomeworkTargetMode } from '@prisma/client';
import {
  HomeworkAssignmentNotMutableException,
  HomeworkAssignmentScheduleMismatchException,
} from '../../../homework/domain/homework.exceptions';
import { HomeworkAssignmentResponseDto } from '../../../homework/dto/homework-assignment-response.dto';
import { TeacherAppAllocationRecord } from '../../shared/teacher-app.types';
import {
  CreateTeacherHomeworkAssignmentUseCase,
  ListTeacherHomeworkAssignmentsUseCase,
  PublishTeacherHomeworkAssignmentUseCase,
  ResolveTeacherHomeworkTargetsUseCase,
  UpdateTeacherHomeworkAssignmentUseCase,
} from '../application/teacher-homeworks.use-cases';

describe('Teacher Homeworks use cases', () => {
  it('lists only the owned class through Core Homework filters', async () => {
    const ownership = ownershipMock();
    const coreList = {
      execute: jest.fn().mockResolvedValue({ items: [], meta: pagination() }),
    };
    const useCase = new ListTeacherHomeworkAssignmentsUseCase(
      ownership as never,
      coreList as never,
    );

    await useCase.execute('allocation-1', {
      status: undefined,
      search: 'reading',
      page: 2,
      limit: 10,
    });

    expect(ownership.resolveOwnedClass).toHaveBeenCalledWith('allocation-1');
    expect(coreList.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        teacherUserId: 'teacher-1',
        teacherSubjectAllocationId: 'allocation-1',
        search: 'reading',
        page: 2,
        limit: 10,
      }),
    );
  });

  it('creates draft homework by deriving class, term, academic year, and teacher allocation context', async () => {
    const ownership = ownershipMock();
    const coreCreate = {
      execute: jest.fn().mockResolvedValue(coreAssignment()),
    };
    const useCase = new CreateTeacherHomeworkAssignmentUseCase(
      ownership as never,
      coreCreate as never,
    );

    const result = await useCase.execute('allocation-1', {
      title: 'Selected reading',
      targetMode: HomeworkTargetMode.SELECTED_STUDENTS,
      studentIds: ['student-1'],
      dueAt: '2026-09-20T10:00:00.000Z',
      timetableEntryId: 'entry-1',
      scheduleDate: '2026-09-14',
      mode: HomeworkAssignmentMode.WORKSHEET,
      isGraded: true,
      totalMarks: 10,
    });

    expect(coreCreate.execute).toHaveBeenCalledWith({
      academicYearId: 'year-1',
      termId: 'term-1',
      teacherSubjectAllocationId: 'allocation-1',
      timetableEntryId: 'entry-1',
      scheduleDate: '2026-09-14',
      title: 'Selected reading',
      description: undefined,
      mode: HomeworkAssignmentMode.WORKSHEET,
      targetMode: HomeworkTargetMode.SELECTED_STUDENTS,
      studentIds: ['student-1'],
      publishAt: undefined,
      dueAt: '2026-09-20T10:00:00.000Z',
      estimatedMinutes: undefined,
      totalMarks: 10,
      isGraded: true,
    });
    expect(result.classId).toBe('allocation-1');
    expect(JSON.stringify(result)).not.toContain('schoolId');
    expect(JSON.stringify(result)).not.toContain('organizationId');
  });

  it('updates only owned draft homework and never accepts allocation-moving fields from the teacher body', async () => {
    const ownership = ownershipMock();
    const coreUpdate = {
      execute: jest
        .fn()
        .mockResolvedValue(coreAssignment({ title: 'Updated homework' })),
    };
    const useCase = new UpdateTeacherHomeworkAssignmentUseCase(
      ownership as never,
      coreUpdate as never,
    );

    await useCase.execute('allocation-1', 'homework-1', {
      title: 'Updated homework',
      targetMode: HomeworkTargetMode.CLASSROOM,
      dueAt: '2026-09-21T10:00:00.000Z',
    });

    expect(ownership.resolveOwnedHomework).toHaveBeenCalledWith({
      classId: 'allocation-1',
      homeworkId: 'homework-1',
    });
    expect(coreUpdate.execute).toHaveBeenCalledWith(
      'homework-1',
      expect.objectContaining({
        academicYearId: 'year-1',
        termId: 'term-1',
        teacherSubjectAllocationId: 'allocation-1',
        title: 'Updated homework',
      }),
    );
    expect(coreUpdate.execute.mock.calls[0][1]).not.toHaveProperty(
      'teacherUserId',
    );
    expect(coreUpdate.execute.mock.calls[0][1]).not.toHaveProperty(
      'classroomId',
    );
    expect(coreUpdate.execute.mock.calls[0][1]).not.toHaveProperty('subjectId');
  });

  it('lets Core lifecycle block published homework updates', async () => {
    const ownership = ownershipMock();
    const coreUpdate = {
      execute: jest
        .fn()
        .mockRejectedValue(
          new HomeworkAssignmentNotMutableException({ status: 'PUBLISHED' }),
        ),
    };
    const useCase = new UpdateTeacherHomeworkAssignmentUseCase(
      ownership as never,
      coreUpdate as never,
    );

    await expect(
      useCase.execute('allocation-1', 'homework-1', {
        title: 'Blocked update',
      }),
    ).rejects.toThrow(HomeworkAssignmentNotMutableException);
  });

  it('uses Core lifecycle for publish and target resolution after ownership checks', async () => {
    const ownership = ownershipMock();
    const corePublish = {
      execute: jest
        .fn()
        .mockResolvedValue(coreAssignment({ status: 'published' })),
    };
    const coreResolve = {
      execute: jest.fn().mockResolvedValue(coreAssignment()),
    };

    const publishUseCase = new PublishTeacherHomeworkAssignmentUseCase(
      ownership as never,
      corePublish as never,
    );
    const resolveUseCase = new ResolveTeacherHomeworkTargetsUseCase(
      ownership as never,
      coreResolve as never,
    );

    await publishUseCase.execute('allocation-1', 'homework-1');
    await resolveUseCase.execute('allocation-1', 'homework-1');

    expect(ownership.resolveOwnedHomework).toHaveBeenCalledTimes(2);
    expect(corePublish.execute).toHaveBeenCalledWith('homework-1');
    expect(coreResolve.execute).toHaveBeenCalledWith('homework-1');
  });

  it('propagates Core timetable linkage validation failures', async () => {
    const ownership = ownershipMock();
    const coreCreate = {
      execute: jest.fn().mockRejectedValue(
        new HomeworkAssignmentScheduleMismatchException({
          timetableEntryId: 'entry-other',
        }),
      ),
    };
    const useCase = new CreateTeacherHomeworkAssignmentUseCase(
      ownership as never,
      coreCreate as never,
    );

    await expect(
      useCase.execute('allocation-1', {
        title: 'Bad schedule',
        targetMode: HomeworkTargetMode.CLASSROOM,
        dueAt: '2026-09-20T10:00:00.000Z',
        timetableEntryId: 'entry-other',
        scheduleDate: '2026-09-14',
      }),
    ).rejects.toThrow(HomeworkAssignmentScheduleMismatchException);
  });
});

function ownershipMock() {
  return {
    resolveOwnedClass: jest.fn().mockResolvedValue({
      teacherUserId: 'teacher-1',
      allocation: allocation(),
    }),
    resolveOwnedHomework: jest.fn().mockResolvedValue({
      teacherUserId: 'teacher-1',
      allocation: allocation(),
    }),
    assertAssignmentResponseBelongsToClass: jest.fn(),
  };
}

function allocation(): TeacherAppAllocationRecord {
  return {
    id: 'allocation-1',
    schoolId: 'school-1',
    teacherUserId: 'teacher-1',
    subjectId: 'subject-1',
    classroomId: 'classroom-1',
    termId: 'term-1',
    subject: {
      id: 'subject-1',
      schoolId: 'school-1',
      nameAr: 'رياضيات',
      nameEn: 'Math',
      code: 'MATH',
    },
    classroom: {
      id: 'classroom-1',
      schoolId: 'school-1',
      sectionId: 'section-1',
      roomId: null,
      nameAr: 'فصل 1',
      nameEn: 'Classroom 1',
      room: null,
      section: null,
    },
    term: {
      id: 'term-1',
      schoolId: 'school-1',
      academicYearId: 'year-1',
      nameAr: 'ترم 1',
      nameEn: 'Term 1',
      isActive: true,
    },
  };
}

function coreAssignment(
  overrides?: Partial<HomeworkAssignmentResponseDto>,
): HomeworkAssignmentResponseDto {
  return {
    id: 'homework-1',
    title: 'Homework',
    description: null,
    mode: 'homework',
    status: 'draft',
    targetMode: 'classroom',
    academicYear: { id: 'year-1', name: '2026/2027' },
    term: {
      id: 'term-1',
      name: 'Term 1',
      startDate: '2026-09-01',
      endDate: '2026-12-31',
    },
    classroom: { id: 'classroom-1', name: 'Classroom 1' },
    subject: { id: 'subject-1', name: 'Math' },
    teacher: { userId: 'teacher-1', fullName: 'Teacher One' },
    teacherSubjectAllocationId: 'allocation-1',
    timetableEntryId: null,
    scheduleDate: null,
    publishAt: null,
    publishedAt: null,
    dueAt: '2026-09-20T10:00:00.000Z',
    closedAt: null,
    estimatedMinutes: null,
    totalMarks: null,
    isGraded: false,
    counters: {
      totalTargets: 0,
      assigned: 0,
      viewed: 0,
      submitted: 0,
      late: 0,
      missing: 0,
      reviewed: 0,
      excused: 0,
    },
    createdAt: '2026-09-10T10:00:00.000Z',
    updatedAt: '2026-09-10T10:00:00.000Z',
    ...overrides,
  };
}

function pagination() {
  return {
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  };
}
