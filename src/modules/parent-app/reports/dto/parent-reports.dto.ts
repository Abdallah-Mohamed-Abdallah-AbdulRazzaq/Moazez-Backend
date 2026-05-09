export class ParentReportsChildDto {
  studentId!: string;
  enrollmentId!: string;
  displayName!: string;
  grade!: string | null;
  classroom!: string | null;
  student_id!: string;
  enrollment_id!: string;
  display_name!: string;
}

export class ParentReportsPeriodDto {
  academicYearId!: string;
  academicYearName!: string;
  termId!: string | null;
  termName!: string | null;
  academic_year_id!: string;
  academic_year_name!: string;
  term_id!: string | null;
  term_name!: string | null;
}

export class ParentReportsAcademicSubjectDto {
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

export class ParentReportsAcademicSummaryDto {
  totalEarned!: number;
  totalMax!: number;
  percentage!: number | null;
  total_earned!: number;
  total_max!: number;
  subjects!: ParentReportsAcademicSubjectDto[];
}

export class ParentReportsBehaviorSummaryDto {
  positiveCount!: number;
  negativeCount!: number;
  positivePoints!: number;
  negativePoints!: number;
  totalBehaviorPoints!: number;
  positive_count!: number;
  negative_count!: number;
  positive_points!: number;
  negative_points!: number;
  total_behavior_points!: number;
  highlights!: ParentReportsBehaviorHighlightDto[];
}

export class ParentReportsBehaviorHighlightDto {
  text!: string;
  type!: 'positive' | 'warning' | 'negative';
}

export class ParentReportsAttendanceSummaryDto {
  presentCount!: number;
  absenceCount!: number;
  lateCount!: number;
  disciplinePercentage!: number | null;
  monthLabel!: string;
  present_count!: number;
  absence_count!: number;
  late_count!: number;
  discipline_percentage!: number | null;
  month_label!: string;
}

export class ParentReportsXpSummaryDto {
  totalXp!: number;
  entriesCount!: number;
  total_xp!: number;
  entries_count!: number;
}

export class ParentReportsUnavailableSectionDto {
  available!: false;
  reason!: string;
}

export class ParentReportsUnavailableDto {
  reportEngine!: ParentReportsUnavailableSectionDto;
  pdfExport!: ParentReportsUnavailableSectionDto;
  templates!: ParentReportsUnavailableSectionDto;
  schedule!: ParentReportsUnavailableSectionDto;
  homework!: ParentReportsUnavailableSectionDto;
  pickup!: ParentReportsUnavailableSectionDto;
}

export class ParentReportCardDto {
  reportId!: 'current-term-performance';
  title!: string;
  type!: 'performance';
  source!: 'derived_current_school_data';
  period!: ParentReportsPeriodDto;
  summary!: {
    academicPercentage: number | null;
    behaviorPoints: number;
    totalXp: number;
    disciplinePercentage: number | null;
  };
}

export class ParentReportsListResponseDto {
  child!: ParentReportsChildDto;
  reports!: ParentReportCardDto[];
  unavailable!: ParentReportsUnavailableDto;
}

export class ParentReportsSummaryResponseDto {
  child!: ParentReportsChildDto;
  period!: ParentReportsPeriodDto;
  academic!: ParentReportsAcademicSummaryDto;
  behavior!: ParentReportsBehaviorSummaryDto;
  attendance!: ParentReportsAttendanceSummaryDto;
  xp!: ParentReportsXpSummaryDto;
  unavailable!: ParentReportsUnavailableDto;
}
