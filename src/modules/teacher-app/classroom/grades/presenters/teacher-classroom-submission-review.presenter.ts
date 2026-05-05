import { GradeSubmissionGradeItemSyncResponseDto } from '../../../../grades/assessments/dto/grade-submission-grade-item-sync.dto';
import { BulkReviewGradeSubmissionAnswersResponseDto } from '../../../../grades/assessments/dto/grade-submission-review.dto';
import {
  GradeSubmissionAnswerResponseDto,
  GradeSubmissionQuestionResponseDto,
  GradeSubmissionResponseDto,
} from '../../../../grades/assessments/dto/grade-submission.dto';
import {
  TeacherClassroomAssignmentSubmissionDetailResponseDto,
  TeacherClassroomAssignmentSubmissionStatus,
} from '../dto/teacher-classroom-grades.dto';
import {
  TeacherClassroomBulkSubmissionAnswerReviewResponseDto,
  TeacherClassroomReviewedAnswerDto,
  TeacherClassroomSubmissionAnswerReviewResponseDto,
  TeacherClassroomSubmissionGradeItemSyncResponseDto,
} from '../dto/teacher-classroom-submission-review.dto';

export class TeacherClassroomSubmissionReviewPresenter {
  static presentReviewedAnswer(params: {
    classId: string;
    assignmentId: string;
    submissionId: string;
    answer: GradeSubmissionAnswerResponseDto;
  }): TeacherClassroomSubmissionAnswerReviewResponseDto {
    return {
      classId: params.classId,
      assignmentId: params.assignmentId,
      submissionId: params.submissionId,
      source: 'grades_assessment',
      answer: presentReviewedAnswer(params.answer),
    };
  }

  static presentBulkReviewedAnswers(params: {
    classId: string;
    assignmentId: string;
    submissionId: string;
    result: BulkReviewGradeSubmissionAnswersResponseDto;
  }): TeacherClassroomBulkSubmissionAnswerReviewResponseDto {
    return {
      classId: params.classId,
      assignmentId: params.assignmentId,
      submissionId: params.submissionId,
      source: 'grades_assessment',
      reviewedCount: params.result.reviewedCount,
      answers: params.result.answers.map((answer) =>
        presentReviewedAnswer(answer),
      ),
    };
  }

  static presentFinalizedSubmission(params: {
    classId: string;
    assignmentId: string;
    submission: GradeSubmissionResponseDto;
  }): TeacherClassroomAssignmentSubmissionDetailResponseDto {
    const submission = params.submission;
    const answersByQuestionId = new Map(
      submission.answers.map((answer) => [answer.questionId, answer]),
    );

    return {
      classId: params.classId,
      assignmentId: params.assignmentId,
      source: 'grades_assessment',
      submission: {
        submissionId: submission.id,
        status: submission.status as TeacherClassroomAssignmentSubmissionStatus,
        student: {
          studentId: submission.studentId,
          displayName: fullName({
            firstName: submission.student?.firstName ?? '',
            lastName: submission.student?.lastName ?? '',
            fallback: submission.student?.nameEn ?? submission.studentId,
          }),
        },
        score: submission.totalScore,
        maxScore: submission.maxScore ?? submission.assessment?.maxScore ?? 0,
        submittedAt: submission.submittedAt,
        reviewedAt: submission.correctedAt,
        finalizedAt: submission.correctedAt,
        answersCount: submission.answers.length,
        reviewedAnswersCount: submission.answers.filter(
          (answer) => answer.correctionStatus === 'corrected',
        ).length,
        startedAt: submission.startedAt,
        answers: submission.questions.map((question) =>
          presentSubmissionQuestion({
            question,
            answer: answersByQuestionId.get(question.id) ?? question.answer,
          }),
        ),
      },
    };
  }

  static presentGradeItemSync(params: {
    classId: string;
    assignmentId: string;
    submissionId: string;
    result: GradeSubmissionGradeItemSyncResponseDto;
  }): TeacherClassroomSubmissionGradeItemSyncResponseDto {
    return {
      classId: params.classId,
      assignmentId: params.assignmentId,
      submissionId: params.submissionId,
      source: 'grades_assessment',
      synced: params.result.synced,
      idempotent: params.result.idempotent,
      submission: {
        submissionId: params.result.submission.id,
        assignmentId: params.result.submission.assessmentId,
        studentId: params.result.submission.studentId,
        enrollmentId: params.result.submission.enrollmentId,
        status: params.result.submission.status,
        totalScore: params.result.submission.totalScore,
        maxScore: params.result.submission.maxScore,
        correctedAt: params.result.submission.correctedAt,
      },
      gradeItem: {
        gradeItemId: params.result.gradeItem.id,
        assignmentId: params.result.gradeItem.assessmentId,
        studentId: params.result.gradeItem.studentId,
        enrollmentId: params.result.gradeItem.enrollmentId,
        status: params.result.gradeItem.status,
        score: params.result.gradeItem.score,
        enteredAt: params.result.gradeItem.enteredAt,
      },
    };
  }
}

function presentReviewedAnswer(
  answer: GradeSubmissionAnswerResponseDto,
): TeacherClassroomReviewedAnswerDto {
  return {
    answerId: answer.id,
    questionId: answer.questionId,
    type: answer.type,
    studentAnswer: {
      text: answer.answerText,
      json: answer.answerJson ?? null,
      selectedOptions: answer.selectedOptions.map((selected) => ({
        optionId: selected.optionId,
        label: selected.label,
        labelAr: selected.labelAr,
        value: selected.value,
      })),
    },
    correctionStatus: answer.correctionStatus,
    score: answer.awardedPoints,
    maxScore: answer.maxPoints,
    reviewedAt: answer.reviewedAt,
    feedback: answer.reviewerComment ?? answer.reviewerCommentAr ?? null,
  };
}

function presentSubmissionQuestion(params: {
  question: GradeSubmissionQuestionResponseDto;
  answer: GradeSubmissionAnswerResponseDto | null;
}) {
  const answer = params.answer;

  return {
    answerId: answer?.id ?? null,
    questionId: params.question.id,
    type: params.question.type,
    prompt: params.question.prompt,
    promptAr: params.question.promptAr,
    required: params.question.required,
    sortOrder: params.question.sortOrder,
    studentAnswer: answer
      ? {
          text: answer.answerText,
          json: answer.answerJson ?? null,
          selectedOptions: answer.selectedOptions.map((selected) => ({
            optionId: selected.optionId,
            label: selected.label,
            labelAr: selected.labelAr,
            value: selected.value,
          })),
        }
      : null,
    correctionStatus: answer?.correctionStatus ?? null,
    score: answer?.awardedPoints ?? null,
    maxScore: answer?.maxPoints ?? params.question.points,
    reviewedAt: answer?.reviewedAt ?? null,
    feedback: answer
      ? answer.reviewerComment ?? answer.reviewerCommentAr ?? null
      : null,
  };
}

function fullName(params: {
  firstName: string;
  lastName: string;
  fallback: string;
}): string {
  const name = [params.firstName, params.lastName]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');

  return name || params.fallback;
}
