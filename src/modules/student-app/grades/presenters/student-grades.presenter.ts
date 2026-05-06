import {
  GradeAssessmentApprovalStatus,
  GradeItemStatus,
} from '@prisma/client';
import {
  StudentAssessmentGradeDetailResponseDto,
  StudentGradeAssessmentItemDto,
  StudentGradeSubjectDto,
  StudentGradesListResponseDto,
  StudentGradesSummaryDto,
  StudentGradesSummaryResponseDto,
} from '../dto/student-grades.dto';
import type {
  StudentAssessmentGradeDetailReadResult,
  StudentGradeAssessmentRecord,
  StudentGradeItemRecord,
  StudentGradesReadResult,
} from '../infrastructure/student-grades-read.adapter';

type PresentableDecimal =
  | number
  | string
  | { toNumber: () => number }
  | null
  | undefined;

export class StudentGradesPresenter {
  static presentList(result: StudentGradesReadResult): StudentGradesListResponseDto {
    const assessmentItems = presentAssessmentItems(result);
    const subjects = presentSubjects(result);
    const summary = summarizeAssessmentItems(assessmentItems);
    const academicYear = result.enrollment.academicYear;
    const term = result.enrollment.term;

    return {
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
    };
  }

  static presentSummary(
    result: StudentGradesReadResult,
  ): StudentGradesSummaryResponseDto {
    const list = this.presentList(result);

    return {
      academicYear: list.academicYears[0] ?? null,
      term: list.terms[0] ?? null,
      summary: list.summary,
      subjects: list.subjects,
    };
  }

  static presentAssessmentGradeDetail(
    result: StudentAssessmentGradeDetailReadResult,
  ): StudentAssessmentGradeDetailResponseDto {
    const assessment = result.assessment;
    const item = result.gradeItem;
    const score = decimalToNumber(item?.score);
    const maxScore = decimalToNumber(assessment.maxScore) ?? 0;

    return {
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
    };
  }
}

function presentAssessmentItems(
  result: StudentGradesReadResult,
): StudentGradeAssessmentItemDto[] {
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

function presentSubjects(result: StudentGradesReadResult): StudentGradeSubjectDto[] {
  const itemsByAssessmentId = new Map(
    result.gradeItems.map((item) => [item.assessmentId, item]),
  );
  const assessmentsBySubjectId = new Map<string, StudentGradeAssessmentRecord[]>();

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

    return {
      id: subject.id,
      subjectId: subject.id,
      subjectName: displayName(subject),
      subject_name: displayName(subject),
      totalMarks,
      total_marks: totalMarks,
      earnedMarks,
      earned_marks: earnedMarks,
      breakdown,
    };
  });
}

function summarizeAssessmentItems(
  items: StudentGradeAssessmentItemDto[],
): StudentGradesSummaryDto {
  const totalEarned = items.reduce(
    (sum, item) => sum + (item.score ?? 0),
    0,
  );
  const totalMax = items.reduce((sum, item) => sum + item.maxScore, 0);

  return {
    totalEarned,
    totalMax,
    percentage: calculatePercent(totalEarned, totalMax),
    total_earned: totalEarned,
    total_max: totalMax,
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

function calculatePercent(score: number | null, maxScore: number): number | null {
  if (score === null || maxScore <= 0) return null;
  return Math.round((score / maxScore) * 10000) / 100;
}
