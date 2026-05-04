import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import {
  TeacherAppRequiredTeacherException,
  TeacherAppAllocationNotFoundException,
} from '../../shared/teacher-app.errors';
import type { TeacherAppAllocationRecord } from '../../shared/teacher-app.types';
import { GetTeacherClassroomUseCase } from '../application/get-teacher-classroom.use-case';
import { TeacherClassroomReadAdapter } from '../infrastructure/teacher-classroom-read.adapter';

describe('GetTeacherClassroomUseCase', () => {
  it('rejects non-teacher actors through the Teacher App access service', async () => {
    const { useCase, accessService, classroomReadAdapter } = createUseCase();
    accessService.assertTeacherOwnsAllocation.mockRejectedValue(
      new TeacherAppRequiredTeacherException({ reason: 'actor_not_teacher' }),
    );

    await expect(useCase.execute('allocation-1')).rejects.toMatchObject({
      code: 'teacher_app.actor.required_teacher',
    });
    expect(classroomReadAdapter.countActiveStudentsInClassroom).not.toHaveBeenCalled();
  });

  it('uses allocation ownership before reading classroom detail', async () => {
    const { useCase, accessService, classroomReadAdapter } = createUseCase();

    await useCase.execute('allocation-1');

    expect(accessService.assertTeacherOwnsAllocation).toHaveBeenCalledWith(
      'allocation-1',
    );
    expect(
      classroomReadAdapter.countActiveStudentsInClassroom,
    ).toHaveBeenCalledWith('classroom-1');
  });

  it('returns TeacherSubjectAllocation.id as classId and omits schoolId', async () => {
    const { useCase } = createUseCase();

    const result = await useCase.execute('allocation-1');
    const json = JSON.stringify(result);

    expect(result.classId).toBe('allocation-1');
    expect(result.classroom).toEqual({
      id: 'classroom-1',
      name: 'Classroom',
      code: null,
    });
    expect(result.subject).toEqual({
      id: 'subject-1',
      name: 'Math',
    });
    expect(result.term).toEqual({
      id: 'term-1',
      name: 'Term',
    });
    expect(result.summary.studentsCount).toBe(24);
    expect(json).not.toContain('schoolId');
  });

  it('does not expose scheduleId and marks schedule as unavailable', async () => {
    const { useCase } = createUseCase();

    const result = await useCase.execute('allocation-1');
    const json = JSON.stringify(result);

    expect(result.schedule).toEqual({
      available: false,
      reason: 'timetable_not_available',
    });
    expect(json).not.toContain('scheduleId');
  });

  it('returns safe not-found for unowned or cross-school allocations', async () => {
    const { useCase, accessService } = createUseCase();
    accessService.assertTeacherOwnsAllocation.mockRejectedValue(
      new TeacherAppAllocationNotFoundException({
        classId: 'other-allocation',
      }),
    );

    await expect(useCase.execute('other-allocation')).rejects.toMatchObject({
      code: 'teacher_app.allocation.not_found',
    });
  });
});

function createUseCase(): {
  useCase: GetTeacherClassroomUseCase;
  accessService: jest.Mocked<TeacherAppAccessService>;
  classroomReadAdapter: jest.Mocked<TeacherClassroomReadAdapter>;
} {
  const accessService = {
    assertTeacherOwnsAllocation: jest.fn(() =>
      Promise.resolve(allocationFixture()),
    ),
  } as unknown as jest.Mocked<TeacherAppAccessService>;
  const classroomReadAdapter = {
    countActiveStudentsInClassroom: jest.fn(() => Promise.resolve(24)),
  } as unknown as jest.Mocked<TeacherClassroomReadAdapter>;

  return {
    useCase: new GetTeacherClassroomUseCase(
      accessService,
      classroomReadAdapter,
    ),
    accessService,
    classroomReadAdapter,
  };
}

function allocationFixture(
  overrides?: Partial<TeacherAppAllocationRecord>,
): TeacherAppAllocationRecord {
  const schoolId = 'school-1';

  return {
    id: 'allocation-1',
    schoolId,
    teacherUserId: 'teacher-1',
    subjectId: 'subject-1',
    classroomId: 'classroom-1',
    termId: 'term-1',
    subject: {
      id: 'subject-1',
      schoolId,
      nameAr: 'Math AR',
      nameEn: 'Math',
      code: 'MATH',
    },
    classroom: {
      id: 'classroom-1',
      schoolId,
      sectionId: 'section-1',
      roomId: null,
      nameAr: 'Classroom AR',
      nameEn: 'Classroom',
      room: null,
      section: {
        id: 'section-1',
        schoolId,
        gradeId: 'grade-1',
        nameAr: 'Section AR',
        nameEn: 'Section',
        grade: {
          id: 'grade-1',
          schoolId,
          stageId: 'stage-1',
          nameAr: 'Grade AR',
          nameEn: 'Grade',
          stage: {
            id: 'stage-1',
            schoolId,
            nameAr: 'Stage AR',
            nameEn: 'Stage',
          },
        },
      },
    },
    term: {
      id: 'term-1',
      schoolId,
      academicYearId: 'year-1',
      nameAr: 'Term AR',
      nameEn: 'Term',
      isActive: true,
    },
    ...overrides,
  };
}
