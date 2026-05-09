import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentAppRequiredParentException } from '../../shared/parent-app-errors';
import type { ParentAppAccessibleChild } from '../../shared/parent-app.types';
import { GetParentChildAcademicProgressUseCase } from '../application/get-parent-child-academic-progress.use-case';
import { GetParentChildBehaviorProgressUseCase } from '../application/get-parent-child-behavior-progress.use-case';
import { GetParentChildProgressUseCase } from '../application/get-parent-child-progress.use-case';
import { GetParentChildXpProgressUseCase } from '../application/get-parent-child-xp-progress.use-case';
import {
  ParentProgressReadAdapter,
  type ParentAcademicProgressReadModel,
  type ParentBehaviorProgressReadModel,
  type ParentProgressOverviewReadModel,
  type ParentXpProgressReadModel,
} from '../infrastructure/parent-progress-read.adapter';

describe('Parent Progress use-cases', () => {
  it('rejects non-parent actors through ParentAppAccessService', async () => {
    const { overviewUseCase, accessService, readAdapter } = createUseCases();
    accessService.assertParentOwnsStudent.mockRejectedValue(
      new ParentAppRequiredParentException({ reason: 'actor_not_parent' }),
    );

    await expect(overviewUseCase.execute('student-1')).rejects.toMatchObject({
      code: 'parent_app.actor.required_parent',
    });
    expect(readAdapter.getProgressOverview).not.toHaveBeenCalled();
  });

  it('validates parent ownership before reading progress overview', async () => {
    const { overviewUseCase, accessService, readAdapter } =
      createUseCasesWithValidAccess();
    readAdapter.getProgressOverview.mockResolvedValue(overviewFixture());

    const result = await overviewUseCase.execute('student-1');

    expect(accessService.assertParentOwnsStudent).toHaveBeenCalledWith(
      'student-1',
    );
    expect(readAdapter.getProgressOverview).toHaveBeenCalledWith(
      childFixture(),
    );
    expect(result.academic.summary.percentage).toBe(80);
  });

  it('keeps academic, behavior, and XP progress separate', async () => {
    const { academicUseCase, behaviorUseCase, xpUseCase, readAdapter } =
      createUseCasesWithValidAccess();
    readAdapter.getAcademicProgress.mockResolvedValue(academicFixture());
    readAdapter.getBehaviorProgress.mockResolvedValue(behaviorFixture());
    readAdapter.getXpProgress.mockResolvedValue(xpFixture());

    await expect(academicUseCase.execute('student-1')).resolves.toMatchObject({
      summary: { percentage: 80 },
    });
    await expect(behaviorUseCase.execute('student-1')).resolves.toMatchObject({
      summary: { totalBehaviorPoints: 3 },
    });
    await expect(xpUseCase.execute('student-1')).resolves.toMatchObject({
      totalXp: 25,
    });
  });
});

function createUseCases(): {
  overviewUseCase: GetParentChildProgressUseCase;
  academicUseCase: GetParentChildAcademicProgressUseCase;
  behaviorUseCase: GetParentChildBehaviorProgressUseCase;
  xpUseCase: GetParentChildXpProgressUseCase;
  accessService: jest.Mocked<ParentAppAccessService>;
  readAdapter: jest.Mocked<ParentProgressReadAdapter>;
} {
  const accessService = {
    assertParentOwnsStudent: jest.fn(),
  } as unknown as jest.Mocked<ParentAppAccessService>;
  const readAdapter = {
    getProgressOverview: jest.fn(),
    getAcademicProgress: jest.fn(),
    getBehaviorProgress: jest.fn(),
    getXpProgress: jest.fn(),
  } as unknown as jest.Mocked<ParentProgressReadAdapter>;

  return {
    overviewUseCase: new GetParentChildProgressUseCase(
      accessService,
      readAdapter,
    ),
    academicUseCase: new GetParentChildAcademicProgressUseCase(
      accessService,
      readAdapter,
    ),
    behaviorUseCase: new GetParentChildBehaviorProgressUseCase(
      accessService,
      readAdapter,
    ),
    xpUseCase: new GetParentChildXpProgressUseCase(accessService, readAdapter),
    accessService,
    readAdapter,
  };
}

function createUseCasesWithValidAccess(): ReturnType<typeof createUseCases> {
  const created = createUseCases();
  created.accessService.assertParentOwnsStudent.mockResolvedValue(
    childFixture(),
  );
  return created;
}

function childFixture(): ParentAppAccessibleChild {
  return {
    studentId: 'student-1',
    enrollmentId: 'enrollment-1',
    classroomId: 'classroom-1',
    academicYearId: 'year-1',
    termId: 'term-1',
  };
}

function academicFixture(): ParentAcademicProgressReadModel {
  return {
    child: childFixture(),
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

function behaviorFixture(): ParentBehaviorProgressReadModel {
  return {
    child: childFixture(),
    attendanceCount: 10,
    absenceCount: 1,
    latenessCount: 2,
    positiveCount: 1,
    negativeCount: 1,
    positivePoints: 5,
    negativePoints: -2,
    totalBehaviorPoints: 3,
  };
}

function xpFixture(): ParentXpProgressReadModel {
  return {
    child: childFixture(),
    totalXp: 25,
    entriesCount: 1,
    bySource: [{ sourceType: 'system', totalXp: 25, entriesCount: 1 }],
  };
}

function overviewFixture(): ParentProgressOverviewReadModel {
  return {
    child: childFixture(),
    academic: academicFixture(),
    behavior: behaviorFixture(),
    xp: xpFixture(),
  };
}
