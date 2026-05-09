import { ParentProgressPresenter } from '../presenters/parent-progress.presenter';
import type { ParentProgressOverviewReadModel } from '../infrastructure/parent-progress-read.adapter';

describe('ParentProgressPresenter', () => {
  it('presents separate academic, behavior, and XP progress sections', () => {
    const result = ParentProgressPresenter.presentOverview(overviewFixture());

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
    expect(result.unsupported).toEqual({
      rank: true,
      tier: true,
      level: true,
    });
  });

  it('does not expose tenant fields or schedule ids', () => {
    const serialized = JSON.stringify(
      ParentProgressPresenter.presentOverview(overviewFixture()),
    );

    for (const forbidden of ['schoolId', 'organizationId', 'scheduleId']) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

function overviewFixture(): ParentProgressOverviewReadModel {
  const child = {
    studentId: 'student-1',
    enrollmentId: 'enrollment-1',
    classroomId: 'classroom-1',
    academicYearId: 'year-1',
    termId: 'term-1',
  };

  return {
    child,
    academic: {
      child,
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
    },
    behavior: {
      child,
      attendanceCount: 10,
      absenceCount: 1,
      latenessCount: 2,
      positiveCount: 1,
      negativeCount: 1,
      positivePoints: 5,
      negativePoints: -2,
      totalBehaviorPoints: 3,
    },
    xp: {
      child,
      totalXp: 25,
      entriesCount: 1,
      bySource: [{ sourceType: 'system', totalXp: 25, entriesCount: 1 }],
    },
  };
}
