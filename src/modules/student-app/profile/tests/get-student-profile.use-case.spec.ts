import { UserStatus, UserType } from '@prisma/client';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentAppRequiredStudentException } from '../../shared/student-app-errors';
import type { StudentAppCurrentStudentWithEnrollment } from '../../shared/student-app.types';
import { GetStudentProfileUseCase } from '../application/get-student-profile.use-case';
import {
  StudentProfileReadAdapter,
  type StudentProfileEnrollmentRecord,
  type StudentProfileIdentityRecord,
} from '../infrastructure/student-profile-read.adapter';

describe('GetStudentProfileUseCase', () => {
  it('rejects non-student actors through StudentAppAccessService', async () => {
    const { useCase, accessService, readAdapter } = createUseCase();
    accessService.getCurrentStudentWithEnrollment.mockRejectedValue(
      new StudentAppRequiredStudentException({ reason: 'actor_not_student' }),
    );

    await expect(useCase.execute()).rejects.toMatchObject({
      code: 'student_app.actor.required_student',
    });
    expect(readAdapter.findStudentProfile).not.toHaveBeenCalled();
  });

  it('returns current student, user, school, and enrollment info', async () => {
    const { useCase, readAdapter } = createUseCaseWithValidAccess();
    readAdapter.findStudentProfile.mockResolvedValue(studentProfileFixture());
    readAdapter.findSchoolDisplay.mockResolvedValue({
      name: 'Moazez Demo School',
      logoUrl: null,
    });
    readAdapter.findCurrentEnrollment.mockResolvedValue(enrollmentFixture());
    readAdapter.sumTotalXpForCurrentStudent.mockResolvedValue(75);

    const result = await useCase.execute();

    expect(result.student).toEqual({
      studentId: 'student-1',
      userId: 'student-user-1',
      displayName: 'Sara Student',
      firstName: 'Sara',
      lastName: 'Student',
      email: 'sara.student@example.test',
      phone: null,
      avatarUrl: null,
      studentNumber: null,
      status: 'active',
    });
    expect(result.school).toEqual({
      name: 'Moazez Demo School',
      logoUrl: null,
    });
    expect(result.enrollment.grade).toEqual({
      id: 'grade-1',
      name: 'Grade 4',
    });
    expect(result.student_profile).toMatchObject({
      name: 'Sara Student',
      grade: 'Grade 4',
      school_name: 'Moazez Demo School',
      student_code: null,
      current_xp: 75,
      total_xp: 75,
      rank_title: null,
      rank_image_url: null,
    });
  });

  it('returns unsupported profile mutation fields explicitly', async () => {
    const { useCase, readAdapter } = createUseCaseWithValidAccess();
    readAdapter.findStudentProfile.mockResolvedValue(studentProfileFixture());
    readAdapter.findSchoolDisplay.mockResolvedValue({
      name: 'Moazez Demo School',
      logoUrl: null,
    });
    readAdapter.findCurrentEnrollment.mockResolvedValue(enrollmentFixture());
    readAdapter.sumTotalXpForCurrentStudent.mockResolvedValue(0);

    const result = await useCase.execute();

    expect(result.unsupported).toEqual({
      avatarUpload: true,
      preferences: true,
      seatNumber: true,
    });
    expect(result.recent_badges).toEqual([]);
    expect(result.top_students).toEqual([]);
    expect(result.leaderboard).toEqual([]);
  });

  it('does not expose tenant, schedule, guardian, medical, document, note, or security internals', async () => {
    const { useCase, readAdapter } = createUseCaseWithValidAccess();
    readAdapter.findStudentProfile.mockResolvedValue(studentProfileFixture());
    readAdapter.findSchoolDisplay.mockResolvedValue({
      name: 'Moazez Demo School',
      logoUrl: null,
    });
    readAdapter.findCurrentEnrollment.mockResolvedValue(enrollmentFixture());
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
    readAdapter.findStudentProfile.mockResolvedValue(studentProfileFixture());
    readAdapter.findSchoolDisplay.mockResolvedValue({
      name: 'Moazez Demo School',
      logoUrl: null,
    });
    readAdapter.findCurrentEnrollment.mockResolvedValue(enrollmentFixture());
    readAdapter.sumTotalXpForCurrentStudent.mockResolvedValue(0);

    await useCase.execute();

    for (const mutation of Object.values(mutationMocks)) {
      expect(mutation).not.toHaveBeenCalled();
    }
  });
});

function createUseCase(extraAdapterMethods?: Record<string, jest.Mock>): {
  useCase: GetStudentProfileUseCase;
  accessService: jest.Mocked<StudentAppAccessService>;
  readAdapter: jest.Mocked<StudentProfileReadAdapter>;
} {
  const accessService = {
    getCurrentStudentWithEnrollment: jest.fn(),
  } as unknown as jest.Mocked<StudentAppAccessService>;
  const readAdapter = {
    findStudentProfile: jest.fn(),
    findSchoolDisplay: jest.fn(),
    findCurrentEnrollment: jest.fn(),
    sumTotalXpForCurrentStudent: jest.fn(),
    ...extraAdapterMethods,
  } as unknown as jest.Mocked<StudentProfileReadAdapter>;

  return {
    useCase: new GetStudentProfileUseCase(accessService, readAdapter),
    accessService,
    readAdapter,
  };
}

function createUseCaseWithValidAccess(
  extraAdapterMethods?: Record<string, jest.Mock>,
): {
  useCase: GetStudentProfileUseCase;
  accessService: jest.Mocked<StudentAppAccessService>;
  readAdapter: jest.Mocked<StudentProfileReadAdapter>;
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

function studentProfileFixture(): StudentProfileIdentityRecord {
  return {
    id: 'student-1',
    firstName: 'Sara',
    lastName: 'Student',
    userId: 'student-user-1',
    status: 'ACTIVE',
    user: {
      id: 'student-user-1',
      email: 'sara.student@example.test',
      phone: null,
      firstName: 'Sara',
      lastName: 'Student',
      userType: UserType.STUDENT,
      status: UserStatus.ACTIVE,
      deletedAt: null,
    },
  } as StudentProfileIdentityRecord;
}

function enrollmentFixture(): StudentProfileEnrollmentRecord {
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
