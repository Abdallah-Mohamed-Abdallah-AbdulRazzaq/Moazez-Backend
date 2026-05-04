import {
  GradeAssessmentApprovalStatus,
  GradeAssessmentDeliveryMode,
  GradeItemStatus,
  GradeSubmissionStatus,
} from '@prisma/client';
import {
  TeacherClassroomAssessmentDetailResponseDto,
  TeacherClassroomAssessmentCardDto,
  TeacherClassroomAssignmentsListResponseDto,
  TeacherClassroomAssessmentsListResponseDto,
  TeacherClassroomGradebookResponseDto,
  TeacherClassroomGradesPaginationDto,
  TeacherClassroomAssessmentStatus,
} from '../dto/teacher-classroom-grades.dto';
import type {
  TeacherClassroomAssessmentCardRecord,
  TeacherClassroomAssessmentDetailResult,
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
        submissionsCount: assessment._count.submissions,
        gradedCount: params.result.gradedCounts.get(assessment.id) ?? 0,
      })),
      pagination: presentPagination(params.result),
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
