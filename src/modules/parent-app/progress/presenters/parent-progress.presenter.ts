import {
  ParentAcademicProgressResponseDto,
  ParentBehaviorProgressResponseDto,
  ParentProgressBehaviorSummaryDto,
  ParentProgressChildDto,
  ParentProgressGradesSummaryDto,
  ParentProgressOverviewResponseDto,
  ParentProgressUnsupportedMetricsDto,
  ParentXpProgressResponseDto,
} from '../dto/parent-progress.dto';
import type {
  ParentAcademicProgressReadModel,
  ParentBehaviorProgressReadModel,
  ParentProgressOverviewReadModel,
  ParentXpProgressReadModel,
} from '../infrastructure/parent-progress-read.adapter';

const UNSUPPORTED: ParentProgressUnsupportedMetricsDto = {
  rank: true,
  tier: true,
  level: true,
};

export class ParentProgressPresenter {
  static presentOverview(
    result: ParentProgressOverviewReadModel,
  ): ParentProgressOverviewResponseDto {
    const academic = this.presentAcademic(result.academic);
    const behavior = this.presentBehavior(result.behavior);
    const xp = this.presentXp(result.xp);
    const overallProgress = academic.summary.percentage;

    return {
      child: presentChild(result),
      overallProgress,
      overall_progress: overallProgress,
      progressDelta: null,
      progress_delta: null,
      currentLevel: null,
      current_level: null,
      nextLevel: null,
      next_level: null,
      levelProgress: null,
      level_progress: null,
      progressFormula: 'academic_percentage_only_when_available',
      progress_formula: 'academic_percentage_only_when_available',
      behavior_summary: behavior.summary,
      grades_summary: academic.summary,
      academic,
      behavior,
      xp,
      unsupported: UNSUPPORTED,
    };
  }

  static presentAcademic(
    result: ParentAcademicProgressReadModel,
  ): ParentAcademicProgressResponseDto {
    return {
      child: presentChild(result),
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
    result: ParentBehaviorProgressReadModel,
  ): ParentBehaviorProgressResponseDto {
    return {
      child: presentChild(result),
      summary: presentBehaviorSummary(result),
      unsupported: UNSUPPORTED,
    };
  }

  static presentXp(
    result: ParentXpProgressReadModel,
  ): ParentXpProgressResponseDto {
    const bySource = result.bySource.map((source) => ({
      sourceType: source.sourceType,
      source_type: source.sourceType,
      totalXp: source.totalXp,
      total_xp: source.totalXp,
      entriesCount: source.entriesCount,
      entries_count: source.entriesCount,
    }));

    return {
      child: presentChild(result),
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

function presentChild(input: {
  child: { studentId: string; enrollmentId: string };
}): ParentProgressChildDto {
  return {
    studentId: input.child.studentId,
    enrollmentId: input.child.enrollmentId,
    student_id: input.child.studentId,
    enrollment_id: input.child.enrollmentId,
  };
}

function presentGradesSummary(
  result: ParentAcademicProgressReadModel,
): ParentProgressGradesSummaryDto {
  return {
    totalEarned: result.totalEarned,
    totalMax: result.totalMax,
    percentage: result.percentage,
    total_earned: result.totalEarned,
    total_max: result.totalMax,
  };
}

function presentBehaviorSummary(
  result: ParentBehaviorProgressReadModel,
): ParentProgressBehaviorSummaryDto {
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
