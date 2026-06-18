import {
  ParentReportCardDto,
  ParentReportsAcademicSummaryDto,
  ParentReportsAttendanceSummaryDto,
  ParentReportsBehaviorSummaryDto,
  ParentReportsChildDto,
  ParentReportsListResponseDto,
  ParentReportsPeriodDto,
  ParentReportsSummaryResponseDto,
  ParentReportsUnavailableDto,
  ParentReportsXpSummaryDto,
} from '../dto/parent-reports.dto';
import { DisciplineSummaryDto } from '../../../discipline/dto/discipline-derived.dto';
import type {
  ParentReportChildRecord,
  ParentReportsListReadModel,
  ParentReportsSummaryReadModel,
} from '../infrastructure/parent-reports-read.adapter';
import type { DisciplineSummaryReadModel } from '../../../discipline/infrastructure/discipline-derived.repository';
import type {
  ParentAcademicProgressReadModel,
  ParentBehaviorProgressReadModel,
  ParentXpProgressReadModel,
} from '../../progress/infrastructure/parent-progress-read.adapter';

const UNAVAILABLE: ParentReportsUnavailableDto = {
  reportEngine: {
    available: false,
    reason: 'report_engine_not_available',
  },
  pdfExport: {
    available: false,
    reason: 'pdf_export_not_available',
  },
  templates: {
    available: false,
    reason: 'report_templates_not_available',
  },
  schedule: {
    available: false,
    reason: 'timetable_not_available',
  },
  homework: {
    available: false,
    reason: 'homework_core_not_available',
  },
  pickup: {
    available: false,
    reason: 'pickup_not_available',
  },
};

export class ParentReportsPresenter {
  static presentList(
    result: ParentReportsListReadModel,
  ): ParentReportsListResponseDto {
    return {
      child: presentChild(result.summary),
      reports: [presentReportCard(result.summary)],
      unavailable: UNAVAILABLE,
    };
  }

  static presentSummary(
    result: ParentReportsSummaryReadModel,
  ): ParentReportsSummaryResponseDto {
    return {
      child: presentChild(result),
      period: presentPeriod(result.profile),
      academic: presentAcademic(result.academic),
      behavior: presentBehavior(result.behavior),
      attendance: presentAttendance(result.behavior),
      discipline: presentDiscipline(result.discipline),
      xp: presentXp(result.xp),
      unavailable: UNAVAILABLE,
    };
  }
}

function presentReportCard(
  result: ParentReportsSummaryReadModel,
): ParentReportCardDto {
  return {
    reportId: 'current-term-performance',
    title: 'Current term performance',
    type: 'performance',
    source: 'derived_current_school_data',
    period: presentPeriod(result.profile),
    summary: {
      academicPercentage: result.academic.percentage,
      behaviorPoints: result.behavior.totalBehaviorPoints,
      totalXp: result.xp.totalXp,
      disciplinePercentage: calculateDisciplinePercentage(result.behavior),
      discipline: presentDiscipline(result.discipline),
    },
  };
}

function presentChild(
  result: ParentReportsSummaryReadModel,
): ParentReportsChildDto {
  const profile = result.profile;
  const classroom = profile.classroom;
  const grade = classroom.section.grade;
  const displayName = fullName(profile.student);

  return {
    studentId: result.child.studentId,
    enrollmentId: result.child.enrollmentId,
    displayName,
    grade: displayNameForNode(grade),
    classroom: displayNameForNode(classroom),
    student_id: result.child.studentId,
    enrollment_id: result.child.enrollmentId,
    display_name: displayName,
  };
}

function presentPeriod(
  profile: ParentReportChildRecord,
): ParentReportsPeriodDto {
  return {
    academicYearId: profile.academicYear.id,
    academicYearName: displayNameForNode(profile.academicYear),
    termId: profile.term?.id ?? null,
    termName: profile.term ? displayNameForNode(profile.term) : null,
    academic_year_id: profile.academicYear.id,
    academic_year_name: displayNameForNode(profile.academicYear),
    term_id: profile.term?.id ?? null,
    term_name: profile.term ? displayNameForNode(profile.term) : null,
  };
}

function presentAcademic(
  academic: ParentAcademicProgressReadModel,
): ParentReportsAcademicSummaryDto {
  return {
    totalEarned: academic.totalEarned,
    totalMax: academic.totalMax,
    percentage: academic.percentage,
    total_earned: academic.totalEarned,
    total_max: academic.totalMax,
    subjects: academic.subjects.map((subject) => ({
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
  };
}

function presentBehavior(
  behavior: ParentBehaviorProgressReadModel,
): ParentReportsBehaviorSummaryDto {
  return {
    positiveCount: behavior.positiveCount,
    negativeCount: behavior.negativeCount,
    positivePoints: behavior.positivePoints,
    negativePoints: behavior.negativePoints,
    totalBehaviorPoints: behavior.totalBehaviorPoints,
    positive_count: behavior.positiveCount,
    negative_count: behavior.negativeCount,
    positive_points: behavior.positivePoints,
    negative_points: behavior.negativePoints,
    total_behavior_points: behavior.totalBehaviorPoints,
    highlights: buildBehaviorHighlights(behavior),
  };
}

function presentAttendance(
  behavior: ParentBehaviorProgressReadModel,
): ParentReportsAttendanceSummaryDto {
  const disciplinePercentage = calculateDisciplinePercentage(behavior);

  return {
    presentCount: behavior.attendanceCount,
    absenceCount: behavior.absenceCount,
    lateCount: behavior.latenessCount,
    disciplinePercentage,
    monthLabel: 'current_term',
    present_count: behavior.attendanceCount,
    absence_count: behavior.absenceCount,
    late_count: behavior.latenessCount,
    discipline_percentage: disciplinePercentage,
    month_label: 'current_term',
  };
}

function presentXp(xp: ParentXpProgressReadModel): ParentReportsXpSummaryDto {
  return {
    totalXp: xp.totalXp,
    entriesCount: xp.entriesCount,
    total_xp: xp.totalXp,
    entries_count: xp.entriesCount,
  };
}

function presentDiscipline(
  discipline: DisciplineSummaryReadModel,
): DisciplineSummaryDto {
  return {
    totalIncidents: discipline.totalIncidents,
    attendanceIncidentCount: discipline.attendanceIncidentCount,
    absenceCount: discipline.absenceCount,
    lateCount: discipline.lateCount,
    earlyLeaveCount: discipline.earlyLeaveCount,
    excusedCount: discipline.excusedCount,
    positiveCount: discipline.positiveCount,
    negativeCount: discipline.negativeCount,
    behaviorPoints: discipline.behaviorPoints,
    period: discipline.period,
    dateText: discipline.dateText,
    total_incidents: discipline.totalIncidents,
    attendance_incident_count: discipline.attendanceIncidentCount,
    absence_count: discipline.absenceCount,
    late_count: discipline.lateCount,
    early_leave_count: discipline.earlyLeaveCount,
    excused_count: discipline.excusedCount,
    positive_count: discipline.positiveCount,
    negative_count: discipline.negativeCount,
    behavior_points: discipline.behaviorPoints,
    date_text: discipline.dateText,
  };
}

function buildBehaviorHighlights(
  behavior: ParentBehaviorProgressReadModel,
): ParentReportsBehaviorSummaryDto['highlights'] {
  const highlights: ParentReportsBehaviorSummaryDto['highlights'] = [];

  if (behavior.positiveCount > 0) {
    highlights.push({
      text: `${behavior.positiveCount} positive behavior records`,
      type: 'positive',
    });
  }

  if (behavior.negativeCount > 0) {
    highlights.push({
      text: `${behavior.negativeCount} negative behavior records`,
      type: behavior.negativePoints < 0 ? 'negative' : 'warning',
    });
  }

  if (highlights.length === 0) {
    highlights.push({
      text: 'No approved behavior records in current scope',
      type: 'warning',
    });
  }

  return highlights;
}

function calculateDisciplinePercentage(
  behavior: Pick<
    ParentBehaviorProgressReadModel,
    'attendanceCount' | 'absenceCount' | 'latenessCount'
  >,
): number | null {
  // Backward-compatible legacy field: attendance present rate, not combined Discipline.
  const total =
    behavior.attendanceCount + behavior.absenceCount + behavior.latenessCount;
  if (total <= 0) return null;

  return Math.round((behavior.attendanceCount / total) * 10000) / 100;
}

function fullName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`.trim();
}

function displayNameForNode(node: { nameEn: string; nameAr: string }): string {
  return node.nameEn || node.nameAr;
}
