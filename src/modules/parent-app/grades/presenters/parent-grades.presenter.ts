import { GradeAssessmentApprovalStatus, GradeItemStatus } from '@prisma/client';
import {
  ParentAssessmentGradeDetailResponseDto,
  ParentGradeAssessmentItemDto,
  ParentGradeSubjectDto,
  ParentGradesChildDto,
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

    return {
      child: presentChild(result),
      academicYears: [
        {
          id: academicYear.id,
          name: displayName(academicYear),
        },
      ],
      academic_years: [
        {
          id: academicYear.id,
          name: displayName(academicYear),
        },
      ],
      terms: term
        ? [
            {
              id: term.id,
              name: displayName(term),
            },
          ]
        : [],
      summary,
      subjects,
      assessments: assessmentItems,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
      },
      visibility: VISIBILITY,
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
      summary: list.summary,
      subjects: list.subjects,
      visibility: VISIBILITY,
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
    student_id: result.child.studentId,
    enrollment_id: result.child.enrollmentId,
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
      return {
        assessmentId: assessment.id,
        title: assessmentTitle(assessment),
        type: lowerEnum(assessment.type),
        earned:
          item?.status === GradeItemStatus.ENTERED
            ? decimalToNumber(item.score)
            : null,
        total: decimalToNumber(assessment.maxScore) ?? 0,
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

    return {
      id: subject.id,
      subjectId: subject.id,
      subjectName: displayName(subject),
      subject_name: displayName(subject),
      totalMarks,
      total_marks: totalMarks,
      earnedMarks,
      earned_marks: earnedMarks,
      percentage,
      rating: ratingForPercentage(percentage),
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

  return {
    totalEarned,
    totalMax,
    percentage,
    rating,
    motivationalMessage,
    total_earned: totalEarned,
    total_max: totalMax,
    motivational_message: motivationalMessage,
  };
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

function displayName(node: { nameEn: string; nameAr: string }): string {
  return node.nameEn || node.nameAr;
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
