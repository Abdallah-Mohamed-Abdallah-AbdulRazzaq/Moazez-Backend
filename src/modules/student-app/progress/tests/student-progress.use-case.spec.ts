import {
  StudentEnrollmentStatus,
  StudentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentAppRequiredStudentException } from '../../shared/student-app-errors';
import type {
  StudentAppContext,
  StudentAppCurrentStudentWithEnrollment,
} from '../../shared/student-app.types';
import { GetStudentAcademicProgressUseCase } from '../application/get-student-academic-progress.use-case';
import { GetStudentBehaviorProgressUseCase } from '../application/get-student-behavior-progress.use-case';
import { GetStudentProgressUseCase } from '../application/get-student-progress.use-case';
import { GetStudentXpProgressUseCase } from '../application/get-student-xp-progress.use-case';
import {
  StudentProgressReadAdapter,
  type StudentAcademicProgressReadModel,
  type StudentBehaviorProgressReadModel,
  type StudentProgressOverviewReadModel,
  type StudentXpProgressReadModel,
} from '../infrastructure/student-progress-read.adapter';

describe('Student Progress use-cases', () => {
  it('rejects non-student actors through StudentAppAccessService', async () => {
    const { overviewUseCase, accessService, readAdapter } = createUseCases();
    accessService.getCurrentStudentWithEnrollment.mockRejectedValue(
      new StudentAppRequiredStudentException({ reason: 'actor_not_student' }),
    );

    await expect(overviewUseCase.execute()).rejects.toMatchObject({
      code: 'student_app.actor.required_student',
    });
    expect(readAdapter.getProgressOverview).not.toHaveBeenCalled();
  });

  it('composes academic, behavior, and XP progress for the current student', async () => {
    const { overviewUseCase, readAdapter } = createUseCasesWithValidAccess();
    readAdapter.getProgressOverview.mockResolvedValue(overviewFixture());

    const result = await overviewUseCase.execute();

    expect(readAdapter.getProgressOverview).toHaveBeenCalledWith(
      contextFixture(),
    );
    expect(result.grades_summary).toMatchObject({
      totalEarned: 8,
      totalMax: 10,
      percentage: 80,
    });
    expect(result.behavior_summary).toMatchObject({
      totalBehaviorPoints: 3,
      positivePoints: 5,
      negativePoints: -2,
    });
    expect(result.xp).toMatchObject({
      totalXp: 25,
      currentLevel: null,
      rank: null,
      tier: null,
    });
  });

  it('keeps behavior points separate from XP', async () => {
    const { behaviorUseCase, xpUseCase, readAdapter } =
      createUseCasesWithValidAccess();
    readAdapter.getBehaviorProgress.mockResolvedValue(behaviorFixture());
    readAdapter.getXpProgress.mockResolvedValue(xpFixture());

    const behavior = await behaviorUseCase.execute();
    const xp = await xpUseCase.execute();

    expect(behavior.summary.totalBehaviorPoints).toBe(3);
    expect(xp.totalXp).toBe(25);
    expect(JSON.stringify(xp)).not.toContain('BehaviorPoints');
  });

  it('returns unsupported null fields for unavailable rank, tier, and level metrics', async () => {
    const { academicUseCase, readAdapter } = createUseCasesWithValidAccess();
    readAdapter.getAcademicProgress.mockResolvedValue(academicFixture());

    const result = await academicUseCase.execute();

    expect(result.unsupported).toEqual({
      rank: true,
      tier: true,
      level: true,
    });
  });
});

function createUseCases(): {
  overviewUseCase: GetStudentProgressUseCase;
  academicUseCase: GetStudentAcademicProgressUseCase;
  behaviorUseCase: GetStudentBehaviorProgressUseCase;
  xpUseCase: GetStudentXpProgressUseCase;
  accessService: jest.Mocked<StudentAppAccessService>;
  readAdapter: jest.Mocked<StudentProgressReadAdapter>;
} {
  const accessService = {
    getCurrentStudentWithEnrollment: jest.fn(),
  } as unknown as jest.Mocked<StudentAppAccessService>;
  const readAdapter = {
    getProgressOverview: jest.fn(),
    getAcademicProgress: jest.fn(),
    getBehaviorProgress: jest.fn(),
    getXpProgress: jest.fn(),
  } as unknown as jest.Mocked<StudentProgressReadAdapter>;

  return {
    overviewUseCase: new GetStudentProgressUseCase(accessService, readAdapter),
    academicUseCase: new GetStudentAcademicProgressUseCase(
      accessService,
      readAdapter,
    ),
    behaviorUseCase: new GetStudentBehaviorProgressUseCase(
      accessService,
      readAdapter,
    ),
    xpUseCase: new GetStudentXpProgressUseCase(accessService, readAdapter),
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
    student: {
      id: 'student-1',
      schoolId: 'school-1',
      organizationId: 'org-1',
      userId: 'student-user-1',
      status: StudentStatus.ACTIVE,
      deletedAt: null,
      user: {
        id: 'student-user-1',
        userType: UserType.STUDENT,
        status: UserStatus.ACTIVE,
        deletedAt: null,
      },
    },
    enrollment: {
      id: 'enrollment-1',
      schoolId: 'school-1',
      studentId: 'student-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      classroomId: 'classroom-1',
      status: StudentEnrollmentStatus.ACTIVE,
      deletedAt: null,
    },
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

function overviewFixture(): StudentProgressOverviewReadModel {
  return {
    academic: academicFixture(),
    behavior: behaviorFixture(),
    xp: xpFixture(),
  };
}

function academicFixture(): StudentAcademicProgressReadModel {
  return {
    subjects: [
      {
        subjectId: 'subject-1',
        subjectName: 'Math',
        earnedMarks: 8,
        totalMarks: 10,
        percentage: 80,
      },
    ],
    totalEarned: 8,
    totalMax: 10,
    percentage: 80,
  };
}

function behaviorFixture(): StudentBehaviorProgressReadModel {
  return {
    attendanceCount: 3,
    absenceCount: 1,
    latenessCount: 2,
    positiveCount: 1,
    negativeCount: 1,
    positivePoints: 5,
    negativePoints: -2,
    totalBehaviorPoints: 3,
  };
}

function xpFixture(): StudentXpProgressReadModel {
  return {
    totalXp: 25,
    entriesCount: 1,
    bySource: [{ sourceType: 'system', totalXp: 25, entriesCount: 1 }],
  };
}
