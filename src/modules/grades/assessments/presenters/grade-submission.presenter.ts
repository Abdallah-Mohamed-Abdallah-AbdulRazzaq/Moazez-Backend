import {
  GradeAnswerCorrectionStatus,
  GradeQuestionType,
  GradeSubmissionStatus,
} from '@prisma/client';
import {
  presentAssessmentApprovalStatus,
  presentDecimal,
  presentDeliveryMode,
} from '../../shared/presenters/grades.presenter';
import {
  calculateSubmissionAnswerProgress,
  SubmissionAnswerProgress,
} from '../domain/grade-submission-domain';
import {
  BulkReviewGradeSubmissionAnswersResponseDto,
} from '../dto/grade-submission-review.dto';
import {
  BulkSaveGradeSubmissionAnswersResponseDto,
  GradeSubmissionAnswerResponseDto,
  GradeSubmissionAssessmentSummaryResponseDto,
  GradeSubmissionEnrollmentSummaryResponseDto,
  GradeSubmissionListRowResponseDto,
  GradeSubmissionQuestionResponseDto,
  GradeSubmissionResponseDto,
  GradeSubmissionsListResponseDto,
  GradeSubmissionSelectedOptionResponseDto,
  GradeSubmissionStudentSummaryResponseDto,
} from '../dto/grade-submission.dto';
import {
  GradeSubmissionAnswerRecord,
  GradeSubmissionDetailRecord,
  GradeSubmissionListRecord,
  GradeSubmissionQuestionRecord,
} from '../infrastructure/grades-submissions.repository';

export function presentGradeSubmissionsList(params: {
  submissions: GradeSubmissionListRecord[];
  questions: GradeSubmissionQuestionRecord[];
}): GradeSubmissionsListResponseDto {
  return {
    items: params.submissions.map((submission) =>
      presentGradeSubmissionListRow({
        submission,
        questions: params.questions,
      }),
    ),
  };
}

export function presentGradeSubmissionDetail(params: {
  submission: GradeSubmissionDetailRecord;
  questions: GradeSubmissionQuestionRecord[];
}): GradeSubmissionResponseDto {
  const answers = params.submission.answers.map((answer) =>
    presentGradeSubmissionAnswer(answer),
  );
  const answerByQuestionId = new Map(
    params.submission.answers.map((answer) => [answer.questionId, answer]),
  );

  return {
    id: params.submission.id,
    assessmentId: params.submission.assessmentId,
    termId: params.submission.termId,
    studentId: params.submission.studentId,
    enrollmentId: params.submission.enrollmentId,
    status: presentSubmissionStatus(params.submission.status),
    startedAt: params.submission.startedAt.toISOString(),
    submittedAt: presentNullableDate(params.submission.submittedAt),
    correctedAt: presentNullableDate(params.submission.correctedAt),
    reviewedById: params.submission.reviewedById,
    totalScore: presentDecimal(params.submission.totalScore),
    maxScore: presentDecimal(params.submission.maxScore),
    student: presentStudentSummary(params.submission.student),
    enrollment: presentEnrollmentSummary(params.submission.enrollment),
    assessment: presentAssessmentSummary(params.submission.assessment),
    progress: calculateProgress({
      questions: params.questions,
      answers: params.submission.answers,
    }),
    answers,
    questions: params.questions.map((question) =>
      presentSubmissionQuestion({
        question,
        answer: answerByQuestionId.get(question.id) ?? null,
      }),
    ),
  };
}

export function presentGradeSubmissionAnswer(
  answer: GradeSubmissionAnswerRecord,
): GradeSubmissionAnswerResponseDto {
  return {
    id: answer.id,
    questionId: answer.questionId,
    type: presentQuestionType(answer.question.type),
    answerText: answer.answerText,
    answerJson: answer.answerJson ?? null,
    correctionStatus: presentAnswerCorrectionStatus(answer.correctionStatus),
    awardedPoints: presentDecimal(answer.awardedPoints),
    maxPoints: presentDecimal(answer.maxPoints),
    reviewerComment: answer.reviewerComment,
    reviewerCommentAr: answer.reviewerCommentAr,
    selectedOptions: answer.selectedOptions.map((selected) =>
      presentSelectedOption(selected),
    ),
    reviewedAt: presentNullableDate(answer.reviewedAt),
    reviewedById: answer.reviewedById,
    createdAt: answer.createdAt.toISOString(),
    updatedAt: answer.updatedAt.toISOString(),
  };
}

export function presentBulkSaveGradeSubmissionAnswers(params: {
  submissionId: string;
  answers: GradeSubmissionAnswerRecord[];
}): BulkSaveGradeSubmissionAnswersResponseDto {
  return {
    submissionId: params.submissionId,
    savedCount: params.answers.length,
    answers: params.answers.map((answer) =>
      presentGradeSubmissionAnswer(answer),
    ),
  };
}

export function presentBulkReviewGradeSubmissionAnswers(params: {
  submissionId: string;
  answers: GradeSubmissionAnswerRecord[];
}): BulkReviewGradeSubmissionAnswersResponseDto {
  return {
    submissionId: params.submissionId,
    reviewedCount: params.answers.length,
    answers: params.answers.map((answer) =>
      presentGradeSubmissionAnswer(answer),
    ),
  };
}

function presentGradeSubmissionListRow(params: {
  submission: GradeSubmissionListRecord;
  questions: GradeSubmissionQuestionRecord[];
}): GradeSubmissionListRowResponseDto {
  return {
    id: params.submission.id,
    assessmentId: params.submission.assessmentId,
    studentId: params.submission.studentId,
    enrollmentId: params.submission.enrollmentId,
    status: presentSubmissionStatus(params.submission.status),
    startedAt: params.submission.startedAt.toISOString(),
    submittedAt: presentNullableDate(params.submission.submittedAt),
    student: presentStudentSummary(params.submission.student),
    enrollment: presentEnrollmentSummary(params.submission.enrollment),
    progress: calculateProgress({
      questions: params.questions,
      answers: params.submission.answers,
    }),
  };
}

function presentSubmissionQuestion(params: {
  question: GradeSubmissionQuestionRecord;
  answer: GradeSubmissionAnswerRecord | null;
}): GradeSubmissionQuestionResponseDto {
  return {
    id: params.question.id,
    type: presentQuestionType(params.question.type),
    prompt: params.question.prompt,
    promptAr: params.question.promptAr,
    points: presentDecimal(params.question.points) ?? 0,
    sortOrder: params.question.sortOrder,
    required: params.question.required,
    answer: params.answer ? presentGradeSubmissionAnswer(params.answer) : null,
  };
}

function presentStudentSummary(
  student:
    | GradeSubmissionDetailRecord['student']
    | GradeSubmissionListRecord['student']
    | null,
): GradeSubmissionStudentSummaryResponseDto | null {
  if (!student) return null;

  const nameEn = `${student.firstName} ${student.lastName}`.trim();

  return {
    id: student.id,
    firstName: student.firstName,
    lastName: student.lastName,
    nameAr: null,
    nameEn,
    code: null,
    admissionNo: null,
  };
}

function presentEnrollmentSummary(
  enrollment:
    | GradeSubmissionDetailRecord['enrollment']
    | GradeSubmissionListRecord['enrollment']
    | null,
): GradeSubmissionEnrollmentSummaryResponseDto | null {
  if (!enrollment) return null;

  const classroom = enrollment.classroom;
  const section = classroom?.section ?? null;
  const grade = section?.grade ?? null;

  return {
    id: enrollment.id,
    classroomId: enrollment.classroomId,
    sectionId: classroom?.sectionId ?? null,
    gradeId: section?.gradeId ?? null,
    classroomName: classroom
      ? classroom.nameEn || classroom.nameAr || null
      : null,
    sectionName: section ? section.nameEn || section.nameAr || null : null,
    gradeName: grade ? grade.nameEn || grade.nameAr || null : null,
  };
}

function presentAssessmentSummary(
  assessment: GradeSubmissionDetailRecord['assessment'] | null,
): GradeSubmissionAssessmentSummaryResponseDto | null {
  if (!assessment) return null;

  return {
    id: assessment.id,
    titleEn: assessment.titleEn,
    titleAr: assessment.titleAr,
    deliveryMode: presentDeliveryMode(assessment.deliveryMode),
    approvalStatus: presentAssessmentApprovalStatus(assessment.approvalStatus),
    maxScore: presentDecimal(assessment.maxScore),
  };
}

function presentSelectedOption(
  selected: GradeSubmissionAnswerRecord['selectedOptions'][number],
): GradeSubmissionSelectedOptionResponseDto {
  return {
    optionId: selected.optionId,
    label: selected.option.label,
    labelAr: selected.option.labelAr,
    value: selected.option.value,
  };
}

function calculateProgress(params: {
  questions: GradeSubmissionQuestionRecord[];
  answers: Array<{
    questionId: string;
    answerText?: string | null;
    answerJson?: unknown;
    correctionStatus?: GradeAnswerCorrectionStatus | string;
    selectedOptions?: Array<{ optionId: string }>;
  }>;
}): SubmissionAnswerProgress {
  return calculateSubmissionAnswerProgress({
    questions: params.questions,
    answers: params.answers,
  });
}

function presentNullableDate(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

function presentSubmissionStatus(
  status: GradeSubmissionStatus | string,
): string {
  return String(status).trim().toLowerCase();
}

function presentAnswerCorrectionStatus(
  status: GradeAnswerCorrectionStatus | string,
): string {
  return String(status).trim().toLowerCase();
}

function presentQuestionType(type: GradeQuestionType | string): string {
  return String(type).trim().toLowerCase();
}
