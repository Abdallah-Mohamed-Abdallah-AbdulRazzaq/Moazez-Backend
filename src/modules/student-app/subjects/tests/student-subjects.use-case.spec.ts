import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentAppRequiredStudentException } from '../../shared/student-app-errors';
import type {
  StudentAppContext,
  StudentAppCurrentStudentWithEnrollment,
} from '../../shared/student-app.types';
import { GetStudentSubjectUseCase } from '../application/get-student-subject.use-case';
import { ListStudentSubjectsUseCase } from '../application/list-student-subjects.use-case';
import {
  StudentSubjectsReadAdapter,
  type StudentSubjectAllocationRecord,
  type StudentSubjectStatsRecord,
} from '../infrastructure/student-subjects-read.adapter';

describe('Student Subjects use-cases', () => {
  it('rejects non-student actors through StudentAppAccessService', async () => {
    const { listUseCase, accessService, readAdapter } = createUseCases();
    accessService.getCurrentStudentWithEnrollment.mockRejectedValue(
      new StudentAppRequiredStudentException({ reason: 'actor_not_student' }),
    );

    await expect(listUseCase.execute()).rejects.toMatchObject({
      code: 'student_app.actor.required_student',
    });
    expect(readAdapter.listCurrentSubjects).not.toHaveBeenCalled();
  });

  it('lists only subjects returned for the current enrollment context', async () => {
    const { listUseCase, accessService, readAdapter } =
      createUseCasesWithValidAccess();
    const allocation = subjectAllocationFixture();
    readAdapter.listCurrentSubjects.mockResolvedValue([allocation]);
    readAdapter.summarizeSubjectGrades.mockResolvedValue(
      statsMapFixture('subject-1'),
    );

    const result = await listUseCase.execute();

    expect(readAdapter.listCurrentSubjects).toHaveBeenCalledWith(
      contextFixture(),
    );
    expect(readAdapter.summarizeSubjectGrades).toHaveBeenCalledWith({
      context: contextFixture(),
      subjectIds: ['subject-1'],
      classroom: allocation.classroom,
    });
    expect(result.subjects).toHaveLength(1);
    expect(result.subjects[0]).toMatchObject({
      subjectId: 'subject-1',
      name: 'Mathematics',
      stats: {
        assessmentsCount: 1,
        earnedScore: 8,
        maxScore: 10,
      },
    });
    expect(accessService.getCurrentStudentWithEnrollment).toHaveBeenCalled();
  });

  it('rejects subject details outside the current classroom and term', async () => {
    const { detailUseCase, readAdapter } = createUseCasesWithValidAccess();
    readAdapter.findCurrentSubject.mockResolvedValue(null);

    await expect(detailUseCase.execute('outside-subject')).rejects.toMatchObject({
      httpStatus: 404,
    });
    expect(readAdapter.summarizeSubjectGrades).not.toHaveBeenCalled();
  });

  it('returns safe subject details without schedule ids', async () => {
    const { detailUseCase, readAdapter } = createUseCasesWithValidAccess();
    readAdapter.findCurrentSubject.mockResolvedValue(subjectAllocationFixture());
    readAdapter.summarizeSubjectGrades.mockResolvedValue(
      statsMapFixture('subject-1'),
    );

    const result = await detailUseCase.execute('subject-1');
    const serialized = JSON.stringify(result);

    expect(result.subject.subjectId).toBe('subject-1');
    expect(result.lessons).toEqual([]);
    expect(result.assignments).toEqual([]);
    expect(result.attachments).toEqual([]);
    expect(result.subject.resources).toEqual({
      attachmentsCount: 0,
      unsupportedReason: 'safe_subject_resource_links_not_available',
    });
    expect(serialized).not.toContain('schoolId');
    expect(serialized).not.toContain('organizationId');
    expect(serialized).not.toContain('scheduleId');
  });
});

function createUseCases(): {
  listUseCase: ListStudentSubjectsUseCase;
  detailUseCase: GetStudentSubjectUseCase;
  accessService: jest.Mocked<StudentAppAccessService>;
  readAdapter: jest.Mocked<StudentSubjectsReadAdapter>;
} {
  const accessService = {
    getCurrentStudentWithEnrollment: jest.fn(),
  } as unknown as jest.Mocked<StudentAppAccessService>;
  const readAdapter = {
    listCurrentSubjects: jest.fn(),
    findCurrentSubject: jest.fn(),
    summarizeSubjectGrades: jest.fn(),
  } as unknown as jest.Mocked<StudentSubjectsReadAdapter>;

  return {
    listUseCase: new ListStudentSubjectsUseCase(accessService, readAdapter),
    detailUseCase: new GetStudentSubjectUseCase(accessService, readAdapter),
    accessService,
    readAdapter,
  };
}

function createUseCasesWithValidAccess(): ReturnType<typeof createUseCases> {
  const created = createUseCases();
  created.accessService.getCurrentStudentWithEnrollment.mockResolvedValue(
    currentStudentFixture(),
  );
  return created;
}

function currentStudentFixture(): StudentAppCurrentStudentWithEnrollment {
  return {
    context: contextFixture(),
    student: {} as StudentAppCurrentStudentWithEnrollment['student'],
    enrollment: {} as StudentAppCurrentStudentWithEnrollment['enrollment'],
  };
}

function contextFixture(): StudentAppContext {
  return {
    studentUserId: 'student-user-1',
    studentId: 'student-1',
    schoolId: 'school-1',
    organizationId: 'org-1',
    membershipId: 'membership-1',
    roleId: 'role-1',
    permissions: ['students.records.view'],
    enrollmentId: 'enrollment-1',
    classroomId: 'classroom-1',
    academicYearId: 'year-1',
    requestedAcademicYearId: 'year-1',
    requestedTermId: 'term-1',
    termId: 'term-1',
  };
}

function subjectAllocationFixture(): StudentSubjectAllocationRecord {
  return {
    id: 'allocation-1',
    subjectId: 'subject-1',
    classroomId: 'classroom-1',
    termId: 'term-1',
    teacherUser: {
      id: 'teacher-1',
      firstName: 'Tala',
      lastName: 'Teacher',
    },
    subject: {
      id: 'subject-1',
      nameAr: 'Mathematics AR',
      nameEn: 'Mathematics',
      code: 'MATH',
      color: null,
    },
    classroom: {
      id: 'classroom-1',
      nameAr: 'Grade 4A AR',
      nameEn: 'Grade 4A',
      section: {
        id: 'section-1',
        nameAr: 'Section A AR',
        nameEn: 'Section A',
        grade: {
          id: 'grade-1',
          nameAr: 'Grade 4 AR',
          nameEn: 'Grade 4',
          stage: {
            id: 'stage-1',
            nameAr: 'Primary AR',
            nameEn: 'Primary',
          },
        },
      },
    },
  } as StudentSubjectAllocationRecord;
}

function statsMapFixture(
  subjectId: string,
): Map<string, StudentSubjectStatsRecord> {
  return new Map([
    [
      subjectId,
      {
        assessmentsCount: 1,
        gradedCount: 1,
        missingCount: 0,
        absentCount: 0,
        earnedScore: 8,
        maxScore: 10,
        averagePercent: 80,
      },
    ],
  ]);
}
