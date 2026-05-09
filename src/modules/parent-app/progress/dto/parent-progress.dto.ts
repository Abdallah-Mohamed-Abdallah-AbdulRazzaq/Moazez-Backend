export class ParentProgressChildDto {
  studentId!: string;
  enrollmentId!: string;
  student_id!: string;
  enrollment_id!: string;
}

export class ParentProgressGradesSummaryDto {
  totalEarned!: number;
  totalMax!: number;
  percentage!: number | null;
  total_earned!: number;
  total_max!: number;
}

export class ParentProgressAcademicSubjectDto {
  subjectId!: string;
  subjectName!: string;
  earnedMarks!: number;
  totalMarks!: number;
  percentage!: number | null;
  subject_id!: string;
  subject_name!: string;
  earned_marks!: number;
  total_marks!: number;
}

export class ParentProgressUnsupportedMetricsDto {
  rank!: true;
  tier!: true;
  level!: true;
}

export class ParentAcademicProgressResponseDto {
  child!: ParentProgressChildDto;
  summary!: ParentProgressGradesSummaryDto;
  subjects!: ParentProgressAcademicSubjectDto[];
  unsupported!: ParentProgressUnsupportedMetricsDto;
}

export class ParentProgressBehaviorSummaryDto {
  attendanceCount!: number;
  absenceCount!: number;
  latenessCount!: number;
  positiveCount!: number;
  negativeCount!: number;
  positivePoints!: number;
  negativePoints!: number;
  totalBehaviorPoints!: number;
  attendance_count!: number;
  absence_count!: number;
  lateness_count!: number;
  positive_count!: number;
  negative_count!: number;
  positive_points!: number;
  negative_points!: number;
  total_behavior_points!: number;
}

export class ParentBehaviorProgressResponseDto {
  child!: ParentProgressChildDto;
  summary!: ParentProgressBehaviorSummaryDto;
  unsupported!: ParentProgressUnsupportedMetricsDto;
}

export class ParentXpSourceSummaryDto {
  sourceType!: string;
  source_type!: string;
  totalXp!: number;
  total_xp!: number;
  entriesCount!: number;
  entries_count!: number;
}

export class ParentXpProgressResponseDto {
  child!: ParentProgressChildDto;
  totalXp!: number;
  total_xp!: number;
  entriesCount!: number;
  entries_count!: number;
  currentLevel!: number | null;
  current_level!: number | null;
  nextLevelXp!: number | null;
  next_level_xp!: number | null;
  rank!: string | null;
  tier!: string | null;
  bySource!: ParentXpSourceSummaryDto[];
  by_source!: ParentXpSourceSummaryDto[];
  unsupported!: ParentProgressUnsupportedMetricsDto;
}

export class ParentProgressOverviewResponseDto {
  child!: ParentProgressChildDto;
  overallProgress!: number | null;
  overall_progress!: number | null;
  progressDelta!: string | null;
  progress_delta!: string | null;
  currentLevel!: number | null;
  current_level!: number | null;
  nextLevel!: number | null;
  next_level!: number | null;
  levelProgress!: number | null;
  level_progress!: number | null;
  progressFormula!: string;
  progress_formula!: string;
  behavior_summary!: ParentProgressBehaviorSummaryDto;
  grades_summary!: ParentProgressGradesSummaryDto;
  academic!: ParentAcademicProgressResponseDto;
  behavior!: ParentBehaviorProgressResponseDto;
  xp!: ParentXpProgressResponseDto;
  unsupported!: ParentProgressUnsupportedMetricsDto;
}
