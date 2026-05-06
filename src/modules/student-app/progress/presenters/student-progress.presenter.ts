import {
  StudentAcademicProgressResponseDto,
  StudentBehaviorProgressResponseDto,
  StudentProgressBehaviorSummaryDto,
  StudentProgressGradesSummaryDto,
  StudentProgressOverviewResponseDto,
  StudentProgressUnsupportedMetricsDto,
  StudentXpProgressResponseDto,
} from '../dto/student-progress.dto';
import type {
  StudentAcademicProgressReadModel,
  StudentBehaviorProgressReadModel,
  StudentProgressOverviewReadModel,
  StudentXpProgressReadModel,
} from '../infrastructure/student-progress-read.adapter';

const UNSUPPORTED: StudentProgressUnsupportedMetricsDto = {
  rank: true,
  tier: true,
  level: true,
};

export class StudentProgressPresenter {
  static presentOverview(
    result: StudentProgressOverviewReadModel,
  ): StudentProgressOverviewResponseDto {
    const academic = this.presentAcademic(result.academic);
    const behavior = this.presentBehavior(result.behavior);
    const xp = this.presentXp(result.xp);

    return {
      behavior_summary: behavior.summary,
      grades_summary: academic.summary,
      academic,
      behavior,
      xp,
      unsupported: UNSUPPORTED,
    };
  }

  static presentAcademic(
    result: StudentAcademicProgressReadModel,
  ): StudentAcademicProgressResponseDto {
    return {
      summary: presentGradesSummary(result),
      subjects: result.subjects.map((subject) => ({
        subjectId: subject.subjectId,
        subjectName: subject.subjectName,
        earnedMarks: subject.earnedMarks,
        totalMarks: subject.totalMarks,
        percentage: subject.percentage,
        subject_id: subject.subjectId,
        subject_name: subject.subjectName,
        earned_marks: subject.earnedMarks,
        total_marks: subject.totalMarks,
      })),
      unsupported: UNSUPPORTED,
    };
  }

  static presentBehavior(
    result: StudentBehaviorProgressReadModel,
  ): StudentBehaviorProgressResponseDto {
    return {
      summary: presentBehaviorSummary(result),
      unsupported: UNSUPPORTED,
    };
  }

  static presentXp(
    result: StudentXpProgressReadModel,
  ): StudentXpProgressResponseDto {
    const bySource = result.bySource.map((source) => ({
      sourceType: source.sourceType,
      source_type: source.sourceType,
      totalXp: source.totalXp,
      total_xp: source.totalXp,
      entriesCount: source.entriesCount,
      entries_count: source.entriesCount,
    }));

    return {
      totalXp: result.totalXp,
      total_xp: result.totalXp,
      entriesCount: result.entriesCount,
      entries_count: result.entriesCount,
      currentLevel: null,
      current_level: null,
      nextLevelXp: null,
      next_level_xp: null,
      rank: null,
      tier: null,
      bySource,
      by_source: bySource,
      unsupported: UNSUPPORTED,
    };
  }
}

function presentGradesSummary(
  result: StudentAcademicProgressReadModel,
): StudentProgressGradesSummaryDto {
  return {
    totalEarned: result.totalEarned,
    totalMax: result.totalMax,
    percentage: result.percentage,
    total_earned: result.totalEarned,
    total_max: result.totalMax,
  };
}

function presentBehaviorSummary(
  result: StudentBehaviorProgressReadModel,
): StudentProgressBehaviorSummaryDto {
  return {
    attendanceCount: result.attendanceCount,
    absenceCount: result.absenceCount,
    latenessCount: result.latenessCount,
    positiveCount: result.positiveCount,
    negativeCount: result.negativeCount,
    positivePoints: result.positivePoints,
    negativePoints: result.negativePoints,
    totalBehaviorPoints: result.totalBehaviorPoints,
    attendance_count: result.attendanceCount,
    absence_count: result.absenceCount,
    lateness_count: result.latenessCount,
    positive_count: result.positiveCount,
    negative_count: result.negativeCount,
    positive_points: result.positivePoints,
    negative_points: result.negativePoints,
    total_behavior_points: result.totalBehaviorPoints,
  };
}
