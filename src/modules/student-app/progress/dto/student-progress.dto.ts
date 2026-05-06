export class StudentProgressGradesSummaryDto {
  totalEarned!: number;
  totalMax!: number;
  percentage!: number | null;
  total_earned!: number;
  total_max!: number;
}

export class StudentProgressAcademicSubjectDto {
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

export class StudentAcademicProgressResponseDto {
  summary!: StudentProgressGradesSummaryDto;
  subjects!: StudentProgressAcademicSubjectDto[];
  unsupported!: StudentProgressUnsupportedMetricsDto;
}

export class StudentProgressBehaviorSummaryDto {
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

export class StudentBehaviorProgressResponseDto {
  summary!: StudentProgressBehaviorSummaryDto;
  unsupported!: StudentProgressUnsupportedMetricsDto;
}

export class StudentXpSourceSummaryDto {
  sourceType!: string;
  source_type!: string;
  totalXp!: number;
  total_xp!: number;
  entriesCount!: number;
  entries_count!: number;
}

export class StudentXpProgressResponseDto {
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
  bySource!: StudentXpSourceSummaryDto[];
  by_source!: StudentXpSourceSummaryDto[];
  unsupported!: StudentProgressUnsupportedMetricsDto;
}

export class StudentProgressUnsupportedMetricsDto {
  rank!: true;
  tier!: true;
  level!: true;
}

export class StudentProgressOverviewResponseDto {
  behavior_summary!: StudentProgressBehaviorSummaryDto;
  grades_summary!: StudentProgressGradesSummaryDto;
  academic!: StudentAcademicProgressResponseDto;
  behavior!: StudentBehaviorProgressResponseDto;
  xp!: StudentXpProgressResponseDto;
  unsupported!: StudentProgressUnsupportedMetricsDto;
}
