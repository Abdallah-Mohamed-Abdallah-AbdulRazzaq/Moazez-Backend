import { canDiscloseGradeReview } from '../../../grades/assessments/domain/grade-review-disclosure';
import { presentQuestionGroupContext } from '../../../../common/question-groups/question-group.projection';
import { presentGradeRichContent } from '../../../grades/assessments/infrastructure/grade-rich-content.projection';
import { gradeAnswerNullFact } from '../../../grades/assessments/infrastructure/grade-typed-answer.projection';
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
import { GradeSubmissionStatus } from '@prisma/client';
import {
  StudentExamCardDto,
  StudentExamDetailResponseDto,
  StudentExamStatus,
  StudentExamSubmissionStateResponseDto,
  StudentExamsListResponseDto,
} from '../dto/student-exams.dto';
import type {
  StudentExamCardRecord,
  StudentExamDetailReadResult,
  StudentExamDetailRecord,
  StudentExamSubmissionDetailRecord,
  StudentExamSubmissionListRecord,
  StudentExamSubmissionReadResult,
  StudentExamsReadResult,
} from '../infrastructure/student-exams-read.adapter';

type PresentableDecimal =
  | number
  | string
  | { toNumber: () => number }
  | null
  | undefined;

const EXAM_MAPPING = {
  source: 'GradeAssessment.type' as const,
  examTypes: ['QUIZ', 'MONTH_EXAM', 'MIDTERM', 'TERM_EXAM', 'FINAL'],
};

export class StudentExamsPresenter {
  static presentList(
    result: StudentExamsReadResult,
  ): StudentExamsListResponseDto {
    const groups = new Map<string, StudentExamCardRecord[]>();

    for (const exam of result.exams) {
      const list = groups.get(exam.subjectId) ?? [];
      list.push(exam);
      groups.set(exam.subjectId, list);
    }

    return {
      subjects: [...groups.entries()].map(([, exams]) => {
        const subject = exams[0].subject;
        return {
          subject_id: subject.id,
          subject_name: displayName(subject),
          subjectId: subject.id,
          subjectName: displayName(subject),
          exams_count: exams.length,
          exams: exams.map((exam) =>
            presentExamCard({
              exam,
              submission: result.submissionsByAssessmentId.get(exam.id) ?? null,
            }),
          ),
        };
      }),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
      },
      mapping: EXAM_MAPPING,
    };
  }

  static presentDetail(
    result: StudentExamDetailReadResult,
    assets: AssetProjection = { assessment: [], questions: new Map() },
  ): StudentExamDetailResponseDto {
    const card = presentExamCard({
      exam: result.exam,
      submission: result.submission,
    });
    const questions = result.exam.questions.map((question) => ({
      assets: assets.questions.get(question.id) ?? [],
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
      options: (presentGradeQuestionContract(question.type).interaction.kind ===
      'choice'
        ? question.options
        : []
      ).map((option) => ({
        ...presentGradeRichContent(option),
        optionId: option.id,
        label:
          (sanitizeGradeQuestionContent(option.label) as string | null) ?? '',
        labelAr: sanitizeGradeQuestionContent(option.labelAr) as string | null,
        value: presentGradeOptionValue(question.type, option.value),
      })),
      answer: null,
      points: decimalToNumber(question.points) ?? 0,
      sortOrder: question.sortOrder,
      required: question.required,
    }));

    return {
      ...presentQuestionGroupContext(result.exam.questions),
      assets: assets.assessment,
      id: result.exam.id,
      assessmentId: result.exam.id,
      subject_name: displayName(result.exam.subject),
      subjectName: displayName(result.exam.subject),
      exam_name: card.exam_name,
      examName: card.examName,
      description: null,
      skill_tag: null,
      status: card.status,
      total_xp: 0,
      duration_minutes: result.exam.expectedTimeMinutes,
      question_count: questions.length,
      type: lowerEnum(result.exam.type),
      date: result.exam.date.toISOString().slice(0, 10),
      maxScore: decimalToNumber(result.exam.maxScore) ?? 0,
      deliveryMode: lowerEnum(result.exam.deliveryMode),
      supportsQuestionSubmission: result.exam.deliveryMode === 'QUESTION_BASED',
      stages: [
        {
          id: result.exam.id,
          title: card.examName ?? 'Assessment',
          subtitle: null,
          type: summarizeStageType(questions.map((question) => question.type)),
          question_count: questions.length,
          questions,
        },
      ],
    };
  }

  static presentSubmissionState(
    result: StudentExamSubmissionReadResult,
  ): StudentExamSubmissionStateResponseDto {
    const status = presentSubmissionStatus(result.submission?.status ?? null);

    return {
      assessmentId: result.exam.id,
      status,
      submission: result.submission
        ? presentSubmission(result.exam, result.submission)
        : null,
    };
  }
}

function presentExamCard(params: {
  exam: StudentExamCardRecord | StudentExamDetailRecord;
  submission: StudentExamSubmissionListRecord | null;
}): StudentExamCardDto {
  return {
    id: params.exam.id,
    assessmentId: params.exam.id,
    examName: assessmentTitle(params.exam),
    exam_name: assessmentTitle(params.exam),
    description: null,
    skill_tag: null,
    status: presentSubmissionStatus(params.submission?.status ?? null),
    total_xp: 0,
    duration_minutes: params.exam.expectedTimeMinutes,
    question_count:
      'questions' in params.exam
        ? params.exam.questions.length
        : params.exam._count.questions,
    type: lowerEnum(params.exam.type),
    date: params.exam.date.toISOString().slice(0, 10),
    maxScore: decimalToNumber(params.exam.maxScore) ?? 0,
    deliveryMode: lowerEnum(params.exam.deliveryMode),
    supportsQuestionSubmission: params.exam.deliveryMode === 'QUESTION_BASED',
  };
}

function presentSubmission(
  exam: StudentExamDetailRecord,
  submission: StudentExamSubmissionDetailRecord,
) {
  const questionTypeById = new Map(
    exam.questions.map((question) => [question.id, question.type]),
  );

  return {
    submissionId: submission.id,
    status: lowerEnum(submission.status),
    startedAt: submission.startedAt.toISOString(),
    submittedAt: nullableDate(submission.submittedAt),
    correctedAt: nullableDate(submission.correctedAt),
    totalScore: decimalToNumber(submission.totalScore),
    maxScore: decimalToNumber(submission.maxScore),
    answers: submission.answers.map((answer) => ({
      answerId: answer.id,
      questionId: answer.questionId,
      ...presentGradeQuestionContract(
        questionTypeById.get(answer.questionId) ?? answer.question.type,
      ),
      ...presentSafeGradeAnswer(answer.question, {
        answerText: answer.answerText,
        answerJson: answer.answerJson,
        answerJsonSqlNull: gradeAnswerNullFact(answer),
        selectedOptionIds: answer.selectedOptions.map(
          (option) => option.optionId,
        ),
      }),
      selectedOptions: (presentGradeQuestionContract(answer.question.type)
        .interaction.kind === 'choice'
        ? answer.selectedOptions
        : []
      ).map((selected) => ({
        ...presentGradeRichContent(
          exam.questions
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
        value: presentGradeOptionValue(
          answer.question.type,
          selected.option.value,
        ),
      })),
      correctionStatus: canDiscloseGradeReview(submission)
        ? lowerEnum(answer.correctionStatus)
        : 'pending',
      score: canDiscloseGradeReview(submission)
        ? decimalToNumber(answer.awardedPoints)
        : null,
      maxScore: decimalToNumber(answer.maxPoints),
      reviewedAt: canDiscloseGradeReview(submission)
        ? nullableDate(answer.reviewedAt)
        : null,
      feedback: canDiscloseGradeReview(submission)
        ? (answer.reviewerComment ?? answer.reviewerCommentAr ?? null)
        : null,
    })),
  };
}

function presentSubmissionStatus(
  status: GradeSubmissionStatus | null,
): StudentExamStatus {
  switch (status) {
    case GradeSubmissionStatus.IN_PROGRESS:
      return 'in_progress';
    case GradeSubmissionStatus.SUBMITTED:
    case GradeSubmissionStatus.CORRECTED:
      return 'completed';
    case null:
      return 'not_started';
  }
}

function summarizeStageType(questionTypes: string[]): string {
  const unique = [...new Set(questionTypes)];
  return unique.length === 1 ? unique[0] : 'mixed';
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
