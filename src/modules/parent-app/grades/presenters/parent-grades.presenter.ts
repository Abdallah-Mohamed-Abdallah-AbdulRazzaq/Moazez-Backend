import { GradeAssessmentApprovalStatus, GradeItemStatus } from '@prisma/client';
import {
  ParentAssessmentGradeDetailResponseDto,
  ParentGradeAcademicYearDto,
  ParentGradeAssessmentItemDto,
  ParentGradeBreakdownItemDto,
  ParentGradeSubjectDto,
  ParentGradeTermDto,
  ParentGradesChildDto,
  ParentGradesEmptyStateDto,
  ParentGradesListResponseDto,
  ParentGradesSummaryDto,
  ParentGradesSummaryResponseDto,
  ParentGradesVisibilityDto,
} from '../dto/parent-grades.dto';
import type {
  ParentAssessmentGradeDetailReadResult,
  ParentGradeAssessmentRecord,
  ParentGradeItemRecord,
  ParentGradesReadResult,
} from '../infrastructure/parent-grades-read.adapter';

type PresentableDecimal =
  | number
  | string
  | { toNumber: () => number }
  | null
  | undefined;

const VISIBILITY: ParentGradesVisibilityDto = {
  statuses: ['published', 'approved', 'locked'],
  reason: 'published_or_approved_assessments_only',
};

export class ParentGradesPresenter {
  static presentList(
    result: ParentGradesReadResult,
  ): ParentGradesListResponseDto {
    const assessmentItems = presentAssessmentItems(result);
    const subjects = presentSubjects(result);
    const summary = summarizeAssessmentItems(assessmentItems);
    const academicYear = result.enrollment.academicYear;
    const term = result.enrollment.term;
    const selectedAcademicYear = presentAcademicYear(academicYear);
    const selectedTerm = term
      ? presentTerm(term, result.enrollment.academicYearId)
      : null;
    const emptyState = buildEmptyState(result, assessmentItems);

    return {
      child: presentChild(result),
      academicYears: [selectedAcademicYear],
      academic_years: [selectedAcademicYear],
      terms: selectedTerm ? [selectedTerm] : [],
      selectedAcademicYear,
      selectedTerm,
      selected_academic_year: selectedAcademicYear,
      selected_term: selectedTerm,
      summary,
      subjects,
      assessments: assessmentItems,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
      },
      visibility: VISIBILITY,
      emptyState,
      empty_state: emptyState,
    };
  }

  static presentSummary(
    result: ParentGradesReadResult,
  ): ParentGradesSummaryResponseDto {
    const list = this.presentList(result);

    return {
      child: list.child,
      academicYear: list.academicYears[0] ?? null,
      term: list.terms[0] ?? null,
      selectedAcademicYear: list.selectedAcademicYear,
      selectedTerm: list.selectedTerm,
      selected_academic_year: list.selected_academic_year,
      selected_term: list.selected_term,
      summary: list.summary,
      subjects: list.subjects,
      visibility: VISIBILITY,
      emptyState: list.emptyState,
      empty_state: list.empty_state,
    };
  }

  static presentAssessmentGradeDetail(
    result: ParentAssessmentGradeDetailReadResult,
  ): ParentAssessmentGradeDetailResponseDto {
    const assessment = result.assessment;
    const item = result.gradeItem;
    const score = decimalToNumber(item?.score);
    const maxScore = decimalToNumber(assessment.maxScore) ?? 0;

    return {
      child: presentChild(result),
      assessment: {
        assessmentId: assessment.id,
        title: assessmentTitle(assessment),
        subject: {
          subjectId: assessment.subject.id,
          name: displayName(assessment.subject),
          code: assessment.subject.code,
        },
        type: lowerEnum(assessment.type),
        status: presentAssessmentStatus(assessment),
        deliveryMode: lowerEnum(assessment.deliveryMode),
        date: assessment.date.toISOString().slice(0, 10),
        maxScore,
        weight: decimalToNumber(assessment.weight) ?? 0,
        expectedTimeMinutes: assessment.expectedTimeMinutes,
      },
      grade: {
        gradeItemId: item?.id ?? null,
        status: item ? lowerEnum(item.status) : 'missing',
        score,
        maxScore,
        percent: calculatePercent(score, maxScore),
        comment: item?.comment ?? null,
        enteredAt: nullableDate(item?.enteredAt ?? null),
        isVirtualMissing: !item,
      },
      submission: result.submission
        ? {
            submissionId: result.submission.id,
            status: lowerEnum(result.submission.status),
            totalScore: decimalToNumber(result.submission.totalScore),
            maxScore: decimalToNumber(result.submission.maxScore),
            submittedAt: nullableDate(result.submission.submittedAt),
            correctedAt: nullableDate(result.submission.correctedAt),
          }
        : null,
      visibility: VISIBILITY,
    };
  }
}

function presentChild(
  result: Pick<ParentGradesReadResult, 'child'>,
): ParentGradesChildDto {
  return {
    studentId: result.child.studentId,
    enrollmentId: result.child.enrollmentId,
    displayName: null,
    student_id: result.child.studentId,
    enrollment_id: result.child.enrollmentId,
    display_name: null,
  };
}

function presentAssessmentItems(
  result: ParentGradesReadResult,
): ParentGradeAssessmentItemDto[] {
  const itemsByAssessmentId = new Map(
    result.gradeItems.map((item) => [item.assessmentId, item]),
  );

  return result.assessments.map((assessment) => {
    const item = itemsByAssessmentId.get(assessment.id) ?? null;
    const score = decimalToNumber(item?.score);
    const maxScore = decimalToNumber(assessment.maxScore) ?? 0;

    return {
      assessmentId: assessment.id,
      subjectId: assessment.subjectId,
      subjectName: displayName(assessment.subject),
      title: assessmentTitle(assessment),
      type: lowerEnum(assessment.type),
      status: presentAssessmentStatus(assessment),
      date: assessment.date.toISOString().slice(0, 10),
      score,
      maxScore,
      weight: decimalToNumber(assessment.weight) ?? 0,
      percent: calculatePercent(score, maxScore),
      gradeItemId: item?.id ?? null,
      itemStatus: item ? lowerEnum(item.status) : 'missing',
      isVirtualMissing: !item,
    };
  });
}

function presentSubjects(
  result: ParentGradesReadResult,
): ParentGradeSubjectDto[] {
  const itemsByAssessmentId = new Map(
    result.gradeItems.map((item) => [item.assessmentId, item]),
  );
  const assessmentsBySubjectId = new Map<
    string,
    ParentGradeAssessmentRecord[]
  >();

  for (const assessment of result.assessments) {
    const list = assessmentsBySubjectId.get(assessment.subjectId) ?? [];
    list.push(assessment);
    assessmentsBySubjectId.set(assessment.subjectId, list);
  }

  return [...assessmentsBySubjectId.entries()].map(([, assessments]) => {
    const subject = assessments[0].subject;
    const breakdown = assessments.map((assessment) => {
      const item = itemsByAssessmentId.get(assessment.id) ?? null;
      const earned =
        item?.status === GradeItemStatus.ENTERED
          ? decimalToNumber(item.score)
          : null;
      const total = decimalToNumber(assessment.maxScore) ?? 0;
      return {
        assessmentId: assessment.id,
        title: assessmentTitle(assessment),
        type: lowerEnum(assessment.type),
        earned,
        total,
        score: earned,
        maxScore: total,
        percentage: calculatePercent(earned, total),
        weight: decimalToNumber(assessment.weight) ?? 0,
        comment: item?.comment ?? null,
        status: item ? lowerEnum(item.status) : 'missing',
        date: assessment.date.toISOString().slice(0, 10),
      };
    });
    const totalMarks = breakdown.reduce((sum, item) => sum + item.total, 0);
    const earnedMarks = breakdown.reduce(
      (sum, item) => sum + (item.earned ?? 0),
      0,
    );
    const percentage = calculatePercent(earnedMarks, totalMarks);
    const counts = summarizeBreakdownItems(breakdown);

    return {
      id: subject.id,
      subjectId: subject.id,
      subjectName: displayName(subject),
      subjectNameAr: subject.nameAr,
      subjectNameEn: subject.nameEn,
      subject_name: displayName(subject),
      subject_name_ar: subject.nameAr,
      subject_name_en: subject.nameEn,
      totalEarned: earnedMarks,
      totalMax: totalMarks,
      totalMarks,
      total_marks: totalMarks,
      earnedMarks,
      earned_marks: earnedMarks,
      percentage,
      completedWeight: counts.completedWeight,
      assessmentCount: counts.assessmentCount,
      enteredCount: counts.enteredCount,
      missingCount: counts.missingCount,
      absentCount: counts.absentCount,
      rating: ratingForPercentage(percentage),
      total_earned: earnedMarks,
      total_max: totalMarks,
      completed_weight: counts.completedWeight,
      assessment_count: counts.assessmentCount,
      entered_count: counts.enteredCount,
      missing_count: counts.missingCount,
      absent_count: counts.absentCount,
      breakdown,
    };
  });
}

function summarizeAssessmentItems(
  items: ParentGradeAssessmentItemDto[],
): ParentGradesSummaryDto {
  const totalEarned = items.reduce((sum, item) => sum + (item.score ?? 0), 0);
  const totalMax = items.reduce((sum, item) => sum + item.maxScore, 0);
  const percentage = calculatePercent(totalEarned, totalMax);
  const rating = ratingForPercentage(percentage);
  const motivationalMessage = motivationalMessageForRating(rating);
  const counts = summarizeAssessmentCounts(items);

  return {
    totalEarned,
    totalMax,
    percentage,
    rating,
    motivationalMessage,
    completedWeight: counts.completedWeight,
    assessmentCount: counts.assessmentCount,
    enteredCount: counts.enteredCount,
    missingCount: counts.missingCount,
    absentCount: counts.absentCount,
    total_earned: totalEarned,
    total_max: totalMax,
    motivational_message: motivationalMessage,
    completed_weight: counts.completedWeight,
    assessment_count: counts.assessmentCount,
    entered_count: counts.enteredCount,
    missing_count: counts.missingCount,
    absent_count: counts.absentCount,
  };
}

function presentAcademicYear(academicYear: {
  id: string;
  nameAr: string | null;
  nameEn: string | null;
}): ParentGradeAcademicYearDto {
  return {
    id: academicYear.id,
    name: displayName(academicYear),
    nameAr: academicYear.nameAr,
    nameEn: academicYear.nameEn,
    name_ar: academicYear.nameAr,
    name_en: academicYear.nameEn,
  };
}

function presentTerm(
  term: {
    id: string;
    nameAr: string | null;
    nameEn: string | null;
  },
  academicYearId: string,
): ParentGradeTermDto {
  return {
    id: term.id,
    academicYearId,
    academic_year_id: academicYearId,
    name: displayName(term),
    nameAr: term.nameAr,
    nameEn: term.nameEn,
    name_ar: term.nameAr,
    name_en: term.nameEn,
  };
}

function summarizeAssessmentCounts(items: ParentGradeAssessmentItemDto[]): {
  assessmentCount: number;
  enteredCount: number;
  missingCount: number;
  absentCount: number;
  completedWeight: number;
} {
  return summarizeStatuses(
    items.map((item) => ({ status: item.itemStatus, weight: item.weight })),
  );
}

function summarizeBreakdownItems(items: ParentGradeBreakdownItemDto[]): {
  assessmentCount: number;
  enteredCount: number;
  missingCount: number;
  absentCount: number;
  completedWeight: number;
} {
  return summarizeStatuses(items.map((item) => item));
}

function summarizeStatuses(items: Array<{ status: string; weight: number }>): {
  assessmentCount: number;
  enteredCount: number;
  missingCount: number;
  absentCount: number;
  completedWeight: number;
} {
  const enteredItems = items.filter((item) => item.status === 'entered');

  return {
    assessmentCount: items.length,
    enteredCount: enteredItems.length,
    missingCount: items.filter((item) => item.status === 'missing').length,
    absentCount: items.filter((item) => item.status === 'absent').length,
    completedWeight: roundTwo(
      enteredItems.reduce((sum, item) => sum + item.weight, 0),
    ),
  };
}

function buildEmptyState(
  result: ParentGradesReadResult,
  items: ParentGradeAssessmentItemDto[],
): ParentGradesEmptyStateDto | null {
  if (!result.enrollment.term) {
    return {
      reason: 'no_active_term',
      message: 'No active term is available for this child.',
    };
  }

  if (items.length === 0) {
    return {
      reason: 'no_visible_grades',
      message: 'No published or approved child grades are available yet.',
    };
  }

  return null;
}

function presentAssessmentStatus(assessment: {
  approvalStatus: GradeAssessmentApprovalStatus | string;
  lockedAt: Date | null;
}): 'published' | 'approved' | 'locked' {
  if (assessment.lockedAt) return 'locked';
  return lowerEnum(assessment.approvalStatus) as 'published' | 'approved';
}

function assessmentTitle(assessment: {
  titleEn: string | null;
  titleAr: string | null;
}): string | null {
  return assessment.titleEn ?? assessment.titleAr ?? null;
}

function displayName(node: {
  nameEn: string | null;
  nameAr: string | null;
}): string {
  return node.nameEn || node.nameAr || '';
}

function lowerEnum(value: string): string {
  return value.trim().toLowerCase();
}

function nullableDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function decimalToNumber(value: PresentableDecimal): number | null {
  if (value === undefined || value === null || value === '') return null;
  const numberValue =
    typeof value === 'object' && 'toNumber' in value
      ? value.toNumber()
      : Number(value);

  return Number.isFinite(numberValue) ? numberValue : null;
}

function calculatePercent(
  score: number | null,
  maxScore: number,
): number | null {
  if (score === null || maxScore <= 0) return null;
  return Math.round((score / maxScore) * 10000) / 100;
}

function ratingForPercentage(percentage: number | null): string | null {
  if (percentage === null) return null;
  if (percentage >= 90) return 'excellent';
  if (percentage >= 80) return 'very_good';
  if (percentage >= 70) return 'good';
  if (percentage >= 60) return 'acceptable';
  return 'needs_improvement';
}

function motivationalMessageForRating(rating: string | null): string | null {
  switch (rating) {
    case 'excellent':
      return 'Excellent progress';
    case 'very_good':
      return 'Very good progress';
    case 'good':
      return 'Good progress';
    case 'acceptable':
      return 'Keep practicing';
    case 'needs_improvement':
      return 'Needs more support';
    case null:
      return null;
    default:
      return null;
  }
}

function roundTwo(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
