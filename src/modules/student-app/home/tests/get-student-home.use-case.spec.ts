import { UserStatus, UserType } from '@prisma/client';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentAppRequiredStudentException } from '../../shared/student-app-errors';
import type { StudentAppCurrentStudentWithEnrollment } from '../../shared/student-app.types';
import { GetStudentHomeUseCase } from '../application/get-student-home.use-case';
import {
  StudentHomeReadAdapter,
  type StudentHomeEnrollmentRecord,
  type StudentHomeIdentityRecord,
} from '../infrastructure/student-home-read.adapter';

describe('GetStudentHomeUseCase', () => {
  it('rejects non-student actors through StudentAppAccessService', async () => {
    const { useCase, accessService, readAdapter } = createUseCase();
    accessService.getCurrentStudentWithEnrollment.mockRejectedValue(
      new StudentAppRequiredStudentException({ reason: 'actor_not_student' }),
    );

    await expect(useCase.execute()).rejects.toMatchObject({
      code: 'student_app.actor.required_student',
    });
    expect(readAdapter.findStudentIdentity).not.toHaveBeenCalled();
  });

  it('returns current student identity and active enrollment hierarchy', async () => {
    const { useCase, readAdapter } = createUseCaseWithValidAccess();
    readAdapter.findStudentIdentity.mockResolvedValue(studentIdentityFixture());
    readAdapter.findSchoolDisplay.mockResolvedValue({
      name: 'Moazez Demo School',
      logoUrl: null,
    });
    readAdapter.findCurrentEnrollment.mockResolvedValue(enrollmentFixture());
    readAdapter.countSubjectsForCurrentClassroom.mockResolvedValue(3);
    readAdapter.countPendingTasksForCurrentStudent.mockResolvedValue(2);
    readAdapter.sumTotalXpForCurrentStudent.mockResolvedValue(125);

    const result = await useCase.execute();

    expect(result.student).toEqual({
      studentId: 'student-1',
      displayName: 'Sara Student',
      avatarUrl: null,
    });
    expect(result.school).toEqual({
      name: 'Moazez Demo School',
      logoUrl: null,
    });
    expect(result.enrollment).toMatchObject({
      enrollmentId: 'enrollment-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      classroom: { id: 'classroom-1', name: 'Grade 4A' },
      stage: { id: 'stage-1', name: 'Primary' },
      grade: { id: 'grade-1', name: 'Grade 4' },
      section: { id: 'section-1', name: 'Section A' },
    });
    expect(result.summaries).toMatchObject({
      subjectsCount: 3,
      pendingTasksCount: 2,
      unreadMessagesCount: null,
      announcementsCount: null,
      totalXp: 125,
      behaviorPoints: null,
    });
  });

  it('returns schedule unavailable with timetable_not_available', async () => {
    const { useCase, readAdapter } = createUseCaseWithValidAccess();
    readAdapter.findStudentIdentity.mockResolvedValue(studentIdentityFixture());
    readAdapter.findSchoolDisplay.mockResolvedValue({
      name: 'Moazez Demo School',
      logoUrl: null,
    });
    readAdapter.findCurrentEnrollment.mockResolvedValue(enrollmentFixture());
    readAdapter.countSubjectsForCurrentClassroom.mockResolvedValue(0);
    readAdapter.countPendingTasksForCurrentStudent.mockResolvedValue(0);
    readAdapter.sumTotalXpForCurrentStudent.mockResolvedValue(0);

    const result = await useCase.execute();

    expect(result.today.schedule).toEqual({
      available: false,
      reason: 'timetable_not_available',
    });
    expect(result.today.attendanceStatus).toBeNull();
    expect(result.required_today).toEqual([]);
    expect(result.today_tasks).toEqual([]);
  });

  it('does not expose tenant, schedule, guardian, medical, document, note, or security internals', async () => {
    const { useCase, readAdapter } = createUseCaseWithValidAccess();
    readAdapter.findStudentIdentity.mockResolvedValue(studentIdentityFixture());
    readAdapter.findSchoolDisplay.mockResolvedValue({
      name: 'Moazez Demo School',
      logoUrl: null,
    });
    readAdapter.findCurrentEnrollment.mockResolvedValue(enrollmentFixture());
    readAdapter.countSubjectsForCurrentClassroom.mockResolvedValue(0);
    readAdapter.countPendingTasksForCurrentStudent.mockResolvedValue(0);
    readAdapter.sumTotalXpForCurrentStudent.mockResolvedValue(0);

    const serialized = JSON.stringify(await useCase.execute());

    for (const forbidden of [
      'schoolId',
      'organizationId',
      'scheduleId',
      'guardian',
      'medical',
      'document',
      'note',
      'password',
      'session',
      'token',
      'applicationId',
      'bucket',
      'objectKey',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('does not mutate data', async () => {
    const mutationMocks = {
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    };
    const { useCase, readAdapter } = createUseCaseWithValidAccess(
      mutationMocks,
    );
    readAdapter.findStudentIdentity.mockResolvedValue(studentIdentityFixture());
    readAdapter.findSchoolDisplay.mockResolvedValue({
      name: 'Moazez Demo School',
      logoUrl: null,
    });
    readAdapter.findCurrentEnrollment.mockResolvedValue(enrollmentFixture());
    readAdapter.countSubjectsForCurrentClassroom.mockResolvedValue(0);
    readAdapter.countPendingTasksForCurrentStudent.mockResolvedValue(0);
    readAdapter.sumTotalXpForCurrentStudent.mockResolvedValue(0);

    await useCase.execute();

    for (const mutation of Object.values(mutationMocks)) {
      expect(mutation).not.toHaveBeenCalled();
    }
  });
});

function createUseCase(extraAdapterMethods?: Record<string, jest.Mock>): {
  useCase: GetStudentHomeUseCase;
  accessService: jest.Mocked<StudentAppAccessService>;
  readAdapter: jest.Mocked<StudentHomeReadAdapter>;
} {
  const accessService = {
    getCurrentStudentWithEnrollment: jest.fn(),
  } as unknown as jest.Mocked<StudentAppAccessService>;
  const readAdapter = {
    findStudentIdentity: jest.fn(),
    findSchoolDisplay: jest.fn(),
    findCurrentEnrollment: jest.fn(),
    countSubjectsForCurrentClassroom: jest.fn(),
    countPendingTasksForCurrentStudent: jest.fn(),
    sumTotalXpForCurrentStudent: jest.fn(),
    ...extraAdapterMethods,
  } as unknown as jest.Mocked<StudentHomeReadAdapter>;

  return {
    useCase: new GetStudentHomeUseCase(accessService, readAdapter),
    accessService,
    readAdapter,
  };
}

function createUseCaseWithValidAccess(
  extraAdapterMethods?: Record<string, jest.Mock>,
): {
  useCase: GetStudentHomeUseCase;
  accessService: jest.Mocked<StudentAppAccessService>;
  readAdapter: jest.Mocked<StudentHomeReadAdapter>;
} {
  const created = createUseCase(extraAdapterMethods);
  created.accessService.getCurrentStudentWithEnrollment.mockResolvedValue(
    currentStudentWithEnrollmentFixture(),
  );

  return created;
}

function currentStudentWithEnrollmentFixture(): StudentAppCurrentStudentWithEnrollment {
  return {
    context: {
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
    },
    student: {} as StudentAppCurrentStudentWithEnrollment['student'],
    enrollment: {} as StudentAppCurrentStudentWithEnrollment['enrollment'],
  };
}

function studentIdentityFixture(): StudentHomeIdentityRecord {
  return {
    id: 'student-1',
    firstName: 'Sara',
    lastName: 'Student',
    userId: 'student-user-1',
    user: {
      id: 'student-user-1',
      firstName: 'Sara',
      lastName: 'Student',
      userType: UserType.STUDENT,
      status: UserStatus.ACTIVE,
      deletedAt: null,
    },
  } as StudentHomeIdentityRecord;
}

function enrollmentFixture(): StudentHomeEnrollmentRecord {
  return {
    id: 'enrollment-1',
    academicYearId: 'year-1',
    termId: 'term-1',
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
  };
}
