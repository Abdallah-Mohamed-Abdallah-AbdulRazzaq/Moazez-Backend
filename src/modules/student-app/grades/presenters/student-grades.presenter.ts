import { presentGradeRichContent } from '../../../grades/assessments/infrastructure/grade-rich-content.projection';
import type { GradeAssetDto } from '../../../grades/assessments/dto/grade-asset.dto';
type AssetProjection = {
  assessment: GradeAssetDto[];
  questions: ReadonlyMap<string, GradeAssetDto[]>;
};
import {
  presentGradeQuestionContract,
  presentGradeOptionValue,
  presentSafeGradeAnswer,
} from '../../../grades/shared/presenters/grade-question-contract';
import { sanitizeGradeQuestionContent } from '../../../grades/assessments/domain/grade-question-content-policy';
import {
  GradeAssessmentApprovalStatus,
  GradeAssessmentDeliveryMode,
  GradeItemStatus,
} from '@prisma/client';
import {
  StudentAssessmentGradeDetailResponseDto,
  StudentAssessmentGradeItemDto,
  StudentAssessmentGradeQuestionDto,
  StudentAssessmentGradeSubmissionDto,
  StudentGradeAcademicYearDto,
  StudentGradeAssessmentItemDto,
  StudentGradeBreakdownItemDto,
  StudentGradeSubjectDto,
  StudentGradeTermDto,
  StudentGradesEmptyStateDto,
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
  static presentList(
    result: StudentGradesReadResult,
  ): StudentGradesListResponseDto {
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
      emptyState,
      empty_state: emptyState,
    };
  }

  static presentSummary(
    result: StudentGradesReadResult,
  ): StudentGradesSummaryResponseDto {
    const list = this.presentList(result);

    return {
      academicYear: list.academicYears[0] ?? null,
      term: list.terms[0] ?? null,
      selectedAcademicYear: list.selectedAcademicYear,
      selectedTerm: list.selectedTerm,
      selected_academic_year: list.selected_academic_year,
      selected_term: list.selected_term,
      summary: list.summary,
      subjects: list.subjects,
      emptyState: list.emptyState,
      empty_state: list.empty_state,
    };
  }

  static presentAssessmentGradeDetail(
    result: StudentAssessmentGradeDetailReadResult,
    assets: AssetProjection = { assessment: [], questions: new Map() },
  ): StudentAssessmentGradeDetailResponseDto {
    const assessment = result.assessment;
    const item = result.gradeItem;
    const score = decimalToNumber(item?.score);
    const maxScore = decimalToNumber(assessment.maxScore) ?? 0;
    const grade: StudentAssessmentGradeItemDto = {
      gradeItemId: item?.id ?? null,
      status: item ? lowerEnum(item.status) : 'missing',
      score,
      maxScore,
      percent: calculatePercent(score, maxScore),
      comment: item?.comment ?? null,
      enteredAt: nullableDate(item?.enteredAt ?? null),
      isVirtualMissing: !item,
    };

    return {
      assessment: {
        assets: assets.assessment,
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
        supportsQuestionSubmission:
          assessment.deliveryMode ===
          GradeAssessmentDeliveryMode.QUESTION_BASED,
        date: assessment.date.toISOString().slice(0, 10),
        maxScore,
        weight: decimalToNumber(assessment.weight) ?? 0,
        expectedTimeMinutes: assessment.expectedTimeMinutes,
      },
      grade,
      gradeItem: grade,
      submission: result.submission
        ? presentSubmission(
            result.submission,
            assessment.deliveryMode ===
              GradeAssessmentDeliveryMode.QUESTION_BASED,
            assessment.questions,
          )
        : null,
      questions: presentQuestions(assessment).map((question) => ({
        ...question,
        assets: assets.questions.get(question.questionId) ?? [],
      })),
    };
  }
}

function presentQuestions(
  assessment: StudentAssessmentGradeDetailReadResult['assessment'],
): StudentAssessmentGradeQuestionDto[] {
  if (assessment.deliveryMode !== GradeAssessmentDeliveryMode.QUESTION_BASED) {
    return [];
  }

  return assessment.questions.map((question) => ({
    assets: [],
    ...presentGradeRichContent(question),
    id: question.id,
    questionId: question.id,
    ...presentGradeQuestionContract(question.type, question),
    title:
      (sanitizeGradeQuestionContent(question.prompt) as string | null) ?? '',
    body:
      (sanitizeGradeQuestionContent(question.promptAr ?? question.prompt) as
        | string
        | null) ?? '',
    points: decimalToNumber(question.points) ?? 0,
    required: question.required,
    sortOrder: question.sortOrder,
    options: (presentGradeQuestionContract(question.type).interaction.kind ===
    'choice'
      ? question.options
      : []
    ).map((option) => ({
      ...presentGradeRichContent(option),
      id: option.id,
      optionId: option.id,
      text: (sanitizeGradeQuestionContent(option.label) as string | null) ?? '',
      textAr: sanitizeGradeQuestionContent(option.labelAr) as string | null,
      label:
        (sanitizeGradeQuestionContent(option.label) as string | null) ?? '',
      labelAr: sanitizeGradeQuestionContent(option.labelAr) as string | null,
      value: presentGradeOptionValue(question.type, option.value),
      sortOrder: option.sortOrder,
    })),
  }));
}

function presentSubmission(
  submission: NonNullable<StudentAssessmentGradeDetailReadResult['submission']>,
  includeAnswers: boolean,
  questions: StudentAssessmentGradeDetailReadResult['assessment']['questions'],
): StudentAssessmentGradeSubmissionDto {
  return {
    submissionId: submission.id,
    status: lowerEnum(submission.status),
    totalScore: decimalToNumber(submission.totalScore),
    maxScore: decimalToNumber(submission.maxScore),
    submittedAt: nullableDate(submission.submittedAt),
    correctedAt: nullableDate(submission.correctedAt),
    answers: includeAnswers
      ? submission.answers.map((answer) => ({
          answerId: answer.id,
          questionId: answer.questionId,
          ...presentSafeGradeAnswer(
            questions.find((question) => question.id === answer.questionId) ?? {
              type: 'UNKNOWN',
            },
            {
              answerText: answer.answerText,
              answerJson: answer.answerJson,
              selectedOptionIds: answer.selectedOptions.map(
                (option) => option.optionId,
              ),
            },
          ),
          selectedOptions: (presentGradeQuestionContract(
            questions.find((question) => question.id === answer.questionId)
              ?.type ?? 'UNKNOWN',
          ).interaction.kind === 'choice'
            ? answer.selectedOptions
            : []
          ).map((selected) => ({
            ...presentGradeRichContent(
              questions
                .find((q) => q.id === answer.questionId)
                ?.options.find((o) => o.id === selected.optionId) ??
                selected.option,
            ),
            optionId: selected.optionId,
            label:
              (sanitizeGradeQuestionContent(selected.option.label) as
                | string
                | null) ?? '',
            labelAr: sanitizeGradeQuestionContent(selected.option.labelAr) as
              | string
              | null,
            value: sanitizeGradeQuestionContent(selected.option.value) as
              | string
              | null,
          })),
          correctionStatus: lowerEnum(answer.correctionStatus),
          awardedPoints: decimalToNumber(answer.awardedPoints),
          maxPoints: decimalToNumber(answer.maxPoints),
          reviewerComment: answer.reviewerComment,
          reviewerCommentAr: answer.reviewerCommentAr,
          reviewedAt: nullableDate(answer.reviewedAt),
        }))
      : [],
  };
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
      deliveryMode: lowerEnum(assessment.deliveryMode),
      supportsQuestionSubmission:
        assessment.deliveryMode === GradeAssessmentDeliveryMode.QUESTION_BASED,
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
  result: StudentGradesReadResult,
): StudentGradeSubjectDto[] {
  const itemsByAssessmentId = new Map(
    result.gradeItems.map((item) => [item.assessmentId, item]),
  );
  const assessmentsBySubjectId = new Map<
    string,
    StudentGradeAssessmentRecord[]
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
      percentage,
      completedWeight: counts.completedWeight,
      assessmentCount: counts.assessmentCount,
      enteredCount: counts.enteredCount,
      missingCount: counts.missingCount,
      absentCount: counts.absentCount,
      rating: ratingForPercentage(percentage),
      totalMarks,
      total_marks: totalMarks,
      earnedMarks,
      earned_marks: earnedMarks,
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
  items: StudentGradeAssessmentItemDto[],
): StudentGradesSummaryDto {
  const totalEarned = items.reduce((sum, item) => sum + (item.score ?? 0), 0);
  const totalMax = items.reduce((sum, item) => sum + item.maxScore, 0);
  const percentage = calculatePercent(totalEarned, totalMax);
  const counts = summarizeAssessmentCounts(items);

  return {
    totalEarned,
    totalMax,
    percentage,
    completedWeight: counts.completedWeight,
    assessmentCount: counts.assessmentCount,
    enteredCount: counts.enteredCount,
    missingCount: counts.missingCount,
    absentCount: counts.absentCount,
    rating: ratingForPercentage(percentage),
    total_earned: totalEarned,
    total_max: totalMax,
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
}): StudentGradeAcademicYearDto {
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
): StudentGradeTermDto {
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

function summarizeAssessmentCounts(items: StudentGradeAssessmentItemDto[]): {
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

function summarizeBreakdownItems(items: StudentGradeBreakdownItemDto[]): {
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
  result: StudentGradesReadResult,
  items: StudentGradeAssessmentItemDto[],
): StudentGradesEmptyStateDto | null {
  if (!result.enrollment.term) {
    return {
      reason: 'no_active_term',
      message: 'No active term is available for the current student.',
    };
  }

  if (items.length === 0) {
    return {
      reason: 'no_visible_grades',
      message: 'No published or approved grades are available yet.',
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
  if (percentage === null) return 'not_available';
  if (percentage >= 85) return 'excellent';
  if (percentage >= 75) return 'very_good';
  if (percentage >= 65) return 'good';
  return 'needs_support';
}

function roundTwo(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
