import {
  GradeAnswerCorrectionStatus,
  GradeAssessmentApprovalStatus,
  GradeAssessmentDeliveryMode,
  GradeItemStatus,
  GradeSubmissionStatus,
} from '@prisma/client';
import {
  TeacherClassroomAssessmentDetailResponseDto,
  TeacherClassroomAssessmentCardDto,
  TeacherClassroomAssignmentDetailResponseDto,
  TeacherClassroomAssignmentSubmissionDetailResponseDto,
  TeacherClassroomAssignmentSubmissionListItemDto,
  TeacherClassroomAssignmentSubmissionStatus,
  TeacherClassroomAssignmentSubmissionsListResponseDto,
  TeacherClassroomAssignmentsListResponseDto,
  TeacherClassroomAssessmentsListResponseDto,
  TeacherClassroomGradebookResponseDto,
  TeacherClassroomGradesPaginationDto,
  TeacherClassroomAssessmentStatus,
} from '../dto/teacher-classroom-grades.dto';
import type {
  TeacherClassroomAssessmentCardRecord,
  TeacherClassroomAssessmentDetailResult,
  TeacherClassroomAssignmentDetailResult,
  TeacherClassroomAssignmentSubmissionDetailRecord,
  TeacherClassroomAssignmentSubmissionDetailResult,
  TeacherClassroomAssignmentSubmissionListRecord,
  TeacherClassroomAssignmentSubmissionsResult,
  TeacherClassroomAssignmentsResult,
  TeacherClassroomAssessmentListResult,
  TeacherClassroomGradebookResult,
} from '../infrastructure/teacher-classroom-grades-read.adapter';

type PresentableDecimal =
  | number
  | string
  | { toNumber: () => number }
  | null
  | undefined;

export class TeacherClassroomGradesPresenter {
  static presentAssessmentList(params: {
    classId: string;
    result: TeacherClassroomAssessmentListResult;
  }): TeacherClassroomAssessmentsListResponseDto {
    return {
      classId: params.classId,
      assessments: params.result.items.map((assessment) =>
        presentAssessmentCard(assessment),
      ),
      pagination: presentPagination(params.result),
    };
  }

  static presentAssessmentDetail(params: {
    classId: string;
    result: TeacherClassroomAssessmentDetailResult;
  }): TeacherClassroomAssessmentDetailResponseDto {
    const assessment = params.result.assessment;

    return {
      classId: params.classId,
      assessment: {
        ...presentAssessmentCard(assessment),
        titleEn: assessment.titleEn,
        titleAr: assessment.titleAr,
        expectedTimeMinutes: assessment.expectedTimeMinutes,
        isLocked: Boolean(assessment.lockedAt),
        createdAt: assessment.createdAt.toISOString(),
        updatedAt: assessment.updatedAt.toISOString(),
      },
      itemsSummary: {
        itemsCount: assessment._count.items,
        enteredCount:
          params.result.itemStatusCounts.get(GradeItemStatus.ENTERED) ?? 0,
        missingCount:
          params.result.itemStatusCounts.get(GradeItemStatus.MISSING) ?? 0,
        absentCount:
          params.result.itemStatusCounts.get(GradeItemStatus.ABSENT) ?? 0,
      },
      submissionsSummary: {
        submissionsCount: assessment._count.submissions,
        inProgressCount:
          params.result.submissionStatusCounts.get(
            GradeSubmissionStatus.IN_PROGRESS,
          ) ?? 0,
        submittedCount:
          params.result.submissionStatusCounts.get(
            GradeSubmissionStatus.SUBMITTED,
          ) ?? 0,
        correctedCount:
          params.result.submissionStatusCounts.get(
            GradeSubmissionStatus.CORRECTED,
          ) ?? 0,
      },
      questions: assessment.questions.map((question) => ({
        questionId: question.id,
        type: toLowerEnum(question.type),
        prompt: question.prompt,
        points: decimalToNumber(question.points) ?? 0,
        sortOrder: question.sortOrder,
        required: question.required,
        optionsCount: question._count.options,
      })),
    };
  }

  static presentGradebook(params: {
    classId: string;
    result: TeacherClassroomGradebookResult;
  }): TeacherClassroomGradebookResponseDto {
    const itemsByKey = new Map(
      params.result.gradeItems.map((item) => [
        gradeItemKey(item.assessmentId, item.studentId),
        item,
      ]),
    );

    return {
      classId: params.classId,
      students: params.result.enrollments.map((enrollment) => ({
        studentId: enrollment.studentId,
        displayName: fullName(enrollment.student),
        grades: params.result.assessments.map((assessment) => {
          const item =
            itemsByKey.get(gradeItemKey(assessment.id, enrollment.studentId)) ??
            null;

          return {
            assessmentId: assessment.id,
            assessmentTitle: assessmentTitle(assessment),
            score: decimalToNumber(item?.score),
            maxScore: decimalToNumber(assessment.maxScore) ?? 0,
            status: item ? toLowerEnum(item.status) : 'missing',
            workflowState: presentAssessmentStatus(assessment),
          };
        }),
      })),
      summary: {
        studentsCount: params.result.total,
        assessmentsCount: params.result.assessments.length,
      },
      pagination: presentPagination(params.result),
    };
  }

  static presentAssignments(params: {
    classId: string;
    result: TeacherClassroomAssignmentsResult;
  }): TeacherClassroomAssignmentsListResponseDto {
    return {
      classId: params.classId,
      assignments: params.result.items.map((assessment) => ({
        assignmentId: assessment.id,
        source: 'grades_assessment',
        title: assessmentTitle(assessment),
        type: toLowerEnum(assessment.type),
        status: presentAssessmentStatus(assessment),
        maxScore: decimalToNumber(assessment.maxScore) ?? 0,
        dueAt: null,
        submissionsCount:
          params.result.submissionCounts.get(assessment.id) ?? 0,
        gradedCount: params.result.gradedCounts.get(assessment.id) ?? 0,
      })),
      pagination: presentPagination(params.result),
    };
  }

  static presentAssignmentDetail(params: {
    classId: string;
    result: TeacherClassroomAssignmentDetailResult;
  }): TeacherClassroomAssignmentDetailResponseDto {
    const assignment = params.result.assignment;

    return {
      classId: params.classId,
      assignment: {
        assignmentId: assignment.id,
        source: 'grades_assessment',
        title: assessmentTitle(assignment),
        description: null,
        type: toLowerEnum(assignment.type),
        status: presentAssessmentStatus(assignment),
        maxScore: decimalToNumber(assignment.maxScore) ?? 0,
        weight: decimalToNumber(assignment.weight) ?? 0,
        dueAt: null,
        publishedAt: nullableDate(assignment.publishedAt),
        approvedAt: nullableDate(assignment.approvedAt),
        lockedAt: nullableDate(assignment.lockedAt),
        itemsCount: countMapTotal(params.result.itemStatusCounts),
        submissionsCount: countMapTotal(params.result.submissionStatusCounts),
        gradedCount:
          params.result.itemStatusCounts.get(GradeItemStatus.ENTERED) ?? 0,
        pendingReviewCount:
          params.result.submissionStatusCounts.get(
            GradeSubmissionStatus.SUBMITTED,
          ) ?? 0,
        questionSummary:
          assignment.deliveryMode === GradeAssessmentDeliveryMode.QUESTION_BASED
            ? presentAssignmentQuestionSummary(assignment)
            : null,
      },
    };
  }

  static presentAssignmentSubmissions(params: {
    classId: string;
    result: TeacherClassroomAssignmentSubmissionsResult;
  }): TeacherClassroomAssignmentSubmissionsListResponseDto {
    return {
      classId: params.classId,
      assignmentId: params.result.assignment.id,
      source: 'grades_assessment',
      submissions: params.result.submissions.map((submission) =>
        presentAssignmentSubmissionListItem({
          submission,
          assignmentMaxScore:
            decimalToNumber(params.result.assignment.maxScore) ?? 0,
        }),
      ),
      pagination: presentPagination(params.result),
    };
  }

  static presentAssignmentSubmissionDetail(params: {
    classId: string;
    result: TeacherClassroomAssignmentSubmissionDetailResult;
  }): TeacherClassroomAssignmentSubmissionDetailResponseDto {
    const assignmentMaxScore =
      decimalToNumber(params.result.assignment.maxScore) ?? 0;
    const listItem = presentAssignmentSubmissionListItem({
      submission: params.result.submission,
      assignmentMaxScore,
    });
    const answerByQuestionId = new Map(
      params.result.submission.answers.map((answer) => [
        answer.questionId,
        answer,
      ]),
    );

    return {
      classId: params.classId,
      assignmentId: params.result.assignment.id,
      source: 'grades_assessment',
      submission: {
        ...listItem,
        startedAt: params.result.submission.startedAt.toISOString(),
        answers: params.result.assignment.questions.map((question) => {
          const answer = answerByQuestionId.get(question.id) ?? null;

          return {
            answerId: answer?.id ?? null,
            questionId: question.id,
            type: toLowerEnum(question.type),
            prompt: question.prompt,
            promptAr: question.promptAr,
            required: question.required,
            sortOrder: question.sortOrder,
            studentAnswer: answer
              ? {
                  text: answer.answerText,
                  json: answer.answerJson ?? null,
                  selectedOptions: answer.selectedOptions.map((selected) => ({
                    optionId: selected.optionId,
                    label: selected.option.label,
                    labelAr: selected.option.labelAr,
                    value: selected.option.value,
                  })),
                }
              : null,
            correctionStatus: answer
              ? toLowerEnum(answer.correctionStatus)
              : null,
            score: decimalToNumber(answer?.awardedPoints),
            maxScore:
              decimalToNumber(answer?.maxPoints) ??
              decimalToNumber(question.points) ??
              0,
            reviewedAt: nullableDate(answer?.reviewedAt ?? null),
            feedback:
              answer?.reviewerComment ?? answer?.reviewerCommentAr ?? null,
          };
        }),
      },
    };
  }
}

function presentAssessmentCard(
  assessment: TeacherClassroomAssessmentCardRecord,
): TeacherClassroomAssessmentCardDto {
  return {
    assessmentId: assessment.id,
    title: assessmentTitle(assessment),
    type: toLowerEnum(assessment.type),
    status: presentAssessmentStatus(assessment),
    deliveryMode: presentDeliveryMode(assessment.deliveryMode),
    date: assessment.date.toISOString().slice(0, 10),
    maxScore: decimalToNumber(assessment.maxScore) ?? 0,
    weight: decimalToNumber(assessment.weight) ?? 0,
    publishedAt: nullableDate(assessment.publishedAt),
    approvedAt: nullableDate(assessment.approvedAt),
    lockedAt: nullableDate(assessment.lockedAt),
    itemsCount: assessment._count.items,
    submissionsCount: assessment._count.submissions,
  };
}

function presentAssignmentSubmissionListItem(params: {
  submission:
    | TeacherClassroomAssignmentSubmissionListRecord
    | TeacherClassroomAssignmentSubmissionDetailRecord;
  assignmentMaxScore: number;
}): TeacherClassroomAssignmentSubmissionListItemDto {
  const correctedAt = nullableDate(params.submission.correctedAt);

  return {
    submissionId: params.submission.id,
    status: toLowerEnum(
      params.submission.status,
    ) as TeacherClassroomAssignmentSubmissionStatus,
    student: {
      studentId: params.submission.studentId,
      displayName: fullName(params.submission.student),
    },
    score: decimalToNumber(params.submission.totalScore),
    maxScore:
      decimalToNumber(params.submission.maxScore) ?? params.assignmentMaxScore,
    submittedAt: nullableDate(params.submission.submittedAt),
    reviewedAt: correctedAt,
    finalizedAt: correctedAt,
    answersCount: params.submission.answers.length,
    reviewedAnswersCount: params.submission.answers.filter(
      (answer) =>
        answer.correctionStatus === GradeAnswerCorrectionStatus.CORRECTED,
    ).length,
  };
}

function presentAssignmentQuestionSummary(
  assignment: TeacherClassroomAssessmentDetailResult['assessment'],
) {
  const types = new Set<string>();
  let totalPoints = 0;
  let requiredQuestionsCount = 0;

  for (const question of assignment.questions) {
    types.add(toLowerEnum(question.type));
    totalPoints += decimalToNumber(question.points) ?? 0;
    if (question.required) requiredQuestionsCount += 1;
  }

  return {
    available: true,
    questionsCount: assignment.questions.length,
    requiredQuestionsCount,
    totalPoints,
    types: [...types].sort(),
  };
}

function presentAssessmentStatus(assessment: {
  approvalStatus: GradeAssessmentApprovalStatus | string;
  lockedAt: Date | null;
}): TeacherClassroomAssessmentStatus {
  if (assessment.lockedAt) return 'locked';
  return toLowerEnum(
    assessment.approvalStatus,
  ) as TeacherClassroomAssessmentStatus;
}

function presentDeliveryMode(
  mode: GradeAssessmentDeliveryMode | string,
): string {
  return toLowerEnum(mode);
}

function assessmentTitle(assessment: {
  titleEn: string | null;
  titleAr: string | null;
}): string | null {
  return assessment.titleEn ?? assessment.titleAr ?? null;
}

function presentPagination(input: {
  page: number;
  limit: number;
  total: number;
}): TeacherClassroomGradesPaginationDto {
  return {
    page: input.page,
    limit: input.limit,
    total: input.total,
  };
}

function countMapTotal(map: Map<unknown, number>): number {
  return [...map.values()].reduce((total, count) => total + count, 0);
}

function decimalToNumber(value: PresentableDecimal): number | null {
  if (value === undefined || value === null || value === '') return null;
  const numberValue =
    typeof value === 'object' && 'toNumber' in value
      ? value.toNumber()
      : Number(value);

  return Number.isFinite(numberValue) ? numberValue : null;
}

function nullableDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function toLowerEnum(value: string): string {
  return value.trim().toLowerCase();
}

function fullName(student: { firstName: string; lastName: string }): string {
  return [student.firstName, student.lastName]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');
}

function gradeItemKey(assessmentId: string, studentId: string): string {
  return `${assessmentId}:${studentId}`;
}
