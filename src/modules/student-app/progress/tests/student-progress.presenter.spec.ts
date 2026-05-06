import { StudentProgressPresenter } from '../presenters/student-progress.presenter';
import type {
  StudentAcademicProgressReadModel,
  StudentBehaviorProgressReadModel,
  StudentProgressOverviewReadModel,
  StudentXpProgressReadModel,
} from '../infrastructure/student-progress-read.adapter';

describe('StudentProgressPresenter', () => {
  it('presents safe progress views with stable unsupported metrics', () => {
    const result = StudentProgressPresenter.presentOverview(overviewFixture());
    const serialized = JSON.stringify(result);

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
      nextLevelXp: null,
      rank: null,
      tier: null,
      unsupported: {
        rank: true,
        tier: true,
        level: true,
      },
    });
    expect(serialized).not.toContain('schoolId');
    expect(serialized).not.toContain('organizationId');
    expect(serialized).not.toContain('scheduleId');
  });
});

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
