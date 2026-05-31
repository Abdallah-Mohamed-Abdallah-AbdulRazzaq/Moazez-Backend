import { Injectable } from '@nestjs/common';
import {
  HomeworkAssignmentStatus,
  HomeworkQuestionType,
  HomeworkSubmissionStatus,
  HomeworkTargetStatus,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { requireHomeworkScope } from '../homework-context';
import {
  BulkSaveHomeworkAnswersDto,
  SaveHomeworkAnswerDto,
} from '../dto/homework-answer.dto';
import {
  HomeworkAnswerDetailResponseDto,
  HomeworkAnswersListResponseDto,
} from '../dto/homework-answer-response.dto';
import {
  HomeworkAnswerInput,
  NormalizedHomeworkAnswerInput,
} from '../domain/homework-answer-inputs';
import {
  HomeworkAnswerInvalidOptionException,
  HomeworkAnswerInvalidPayloadException,
  HomeworkAnswerInvalidSubmissionScopeException,
  HomeworkAnswerMissingRequiredException,
  HomeworkAnswerNotFoundException,
  HomeworkAnswerReadOnlyException,
} from '../domain/homework-answer.exceptions';
import {
  HomeworkRepository,
  HomeworkSubmissionAnswerRecord,
  HomeworkSubmissionRecord,
  HomeworkTargetForSubmissionRecord,
} from '../infrastructure/homework.repository';
import {
  presentHomeworkAnswerDetailTeacher,
  presentHomeworkAnswersStudent,
  presentHomeworkAnswersTeacher,
} from '../presenters/homework-answer.presenter';

const TEXT_QUESTION_TYPES = new Set<HomeworkQuestionType>([
  HomeworkQuestionType.SHORT_TEXT,
  HomeworkQuestionType.LONG_TEXT,
]);

const SINGLE_SELECTION_QUESTION_TYPES = new Set<HomeworkQuestionType>([
  HomeworkQuestionType.SINGLE_CHOICE,
  HomeworkQuestionType.TRUE_FALSE,
]);

export interface StudentHomeworkAnswersCommand {
  homeworkId: string;
  studentId: string;
  enrollmentId: string;
}

export interface SaveStudentHomeworkAnswerCommand extends StudentHomeworkAnswersCommand {
  questionId: string;
  answer: HomeworkAnswerInput;
  isDraft?: boolean;
}

export interface SaveStudentHomeworkAnswersCommand extends StudentHomeworkAnswersCommand {
  answers: HomeworkAnswerInput[];
}

@Injectable()
export class ListHomeworkSubmissionAnswersUseCase {
  constructor(private readonly homeworkRepository: HomeworkRepository) {}

  async execute(input: {
    homeworkId: string;
    submissionId: string;
  }): Promise<HomeworkAnswersListResponseDto> {
    requireHomeworkScope();
    await requireSubmissionInAssignment(this.homeworkRepository, input);
    const answers = await this.homeworkRepository.listSubmissionAnswers({
      homeworkAssignmentId: input.homeworkId,
      submissionId: input.submissionId,
    });

    return presentHomeworkAnswersTeacher(answers);
  }
}

@Injectable()
export class GetHomeworkSubmissionAnswerUseCase {
  constructor(private readonly homeworkRepository: HomeworkRepository) {}

  async execute(input: {
    homeworkId: string;
    submissionId: string;
    answerId: string;
  }): Promise<HomeworkAnswerDetailResponseDto> {
    requireHomeworkScope();
    await requireSubmissionInAssignment(this.homeworkRepository, input);
    const answer = await this.homeworkRepository.findSubmissionAnswerById({
      homeworkAssignmentId: input.homeworkId,
      submissionId: input.submissionId,
      answerId: input.answerId,
    });

    if (!answer) {
      throw new HomeworkAnswerNotFoundException(input);
    }

    return presentHomeworkAnswerDetailTeacher(answer);
  }
}

@Injectable()
export class ListStudentHomeworkAnswersUseCase {
  constructor(private readonly homeworkRepository: HomeworkRepository) {}

  async execute(
    command: StudentHomeworkAnswersCommand,
  ): Promise<HomeworkAnswersListResponseDto> {
    requireHomeworkScope();
    const target = await findStudentTargetOrThrow(
      this.homeworkRepository,
      command,
    );
    const submission = target.submissions[0];
    if (!submission) {
      return { items: [] };
    }

    return presentHomeworkAnswersStudent(submission.answers, {
      includeReviewFields:
        submission.status === HomeworkSubmissionStatus.REVIEWED,
    });
  }
}

@Injectable()
export class SaveStudentHomeworkAnswersDraftUseCase {
  constructor(private readonly homeworkRepository: HomeworkRepository) {}

  async execute(
    command: SaveStudentHomeworkAnswersCommand,
  ): Promise<HomeworkAnswersListResponseDto> {
    requireHomeworkScope();
    const target = await findStudentTargetOrThrow(
      this.homeworkRepository,
      command,
    );
    assertAnswersEditable(target);
    const submission = await resolveDraftSubmissionOrThrow(
      this.homeworkRepository,
      target,
    );

    const saved: HomeworkSubmissionAnswerRecord[] = [];
    for (const answerInput of command.answers) {
      saved.push(
        await saveAnswer({
          repository: this.homeworkRepository,
          target,
          submission,
          answerInput,
          isDraft: true,
        }),
      );
    }

    return presentHomeworkAnswersStudent(saved);
  }
}

@Injectable()
export class SaveStudentHomeworkAnswerUseCase {
  constructor(private readonly homeworkRepository: HomeworkRepository) {}

  async execute(
    command: SaveStudentHomeworkAnswerCommand,
  ): Promise<HomeworkAnswerDetailResponseDto> {
    requireHomeworkScope();
    const target = await findStudentTargetOrThrow(
      this.homeworkRepository,
      command,
    );
    assertAnswersEditable(target);
    const submission = await resolveDraftSubmissionOrThrow(
      this.homeworkRepository,
      target,
    );

    const answer = await saveAnswer({
      repository: this.homeworkRepository,
      target,
      submission,
      answerInput: {
        ...command.answer,
        questionId: command.questionId,
      },
      isDraft: command.isDraft ?? true,
    });

    return { answer: presentHomeworkAnswersStudent([answer]).items[0] };
  }
}

export async function saveStudentAnswersForSubmit(input: {
  repository: HomeworkRepository;
  target: HomeworkTargetForSubmissionRecord;
  answers: HomeworkAnswerInput[] | undefined;
}): Promise<HomeworkSubmissionRecord | null> {
  if (!input.answers || input.answers.length === 0) {
    return input.target.submissions[0] ?? null;
  }

  const submission = await resolveDraftSubmissionOrThrow(
    input.repository,
    input.target,
  );

  for (const answerInput of input.answers) {
    await saveAnswer({
      repository: input.repository,
      target: input.target,
      submission,
      answerInput,
      isDraft: false,
    });
  }

  const refreshed = await input.repository.findStudentTargetForSubmission({
    homeworkId: input.target.homeworkAssignmentId,
    studentId: input.target.studentId,
    enrollmentId: input.target.enrollmentId,
  });

  return refreshed?.submissions[0] ?? submission;
}

export async function saveStudentAnswersAsDraft(input: {
  repository: HomeworkRepository;
  target: HomeworkTargetForSubmissionRecord;
  answers: HomeworkAnswerInput[] | undefined;
}): Promise<HomeworkSubmissionRecord | null> {
  if (!input.answers || input.answers.length === 0) {
    return input.target.submissions[0] ?? null;
  }

  const submission = await resolveDraftSubmissionOrThrow(
    input.repository,
    input.target,
  );

  for (const answerInput of input.answers) {
    await saveAnswer({
      repository: input.repository,
      target: input.target,
      submission,
      answerInput,
      isDraft: true,
    });
  }

  const refreshed = await input.repository.findStudentTargetForSubmission({
    homeworkId: input.target.homeworkAssignmentId,
    studentId: input.target.studentId,
    enrollmentId: input.target.enrollmentId,
  });

  return refreshed?.submissions[0] ?? submission;
}

export function validateRequiredHomeworkAnswers(input: {
  questions: HomeworkTargetForSubmissionRecord['homeworkAssignment']['questions'];
  answers: HomeworkSubmissionAnswerRecord[];
}): void {
  const answerByQuestionId = new Map(
    input.answers
      .filter((answer) => !answer.deletedAt)
      .map((answer) => [answer.homeworkQuestionId, answer]),
  );

  for (const question of input.questions) {
    const answer = answerByQuestionId.get(question.id);
    if (!question.isRequired) {
      if (answer) {
        normalizeAnswerForQuestion({
          question,
          input: {
            questionId: question.id,
            textAnswer: answer.textAnswer,
            selectedOptionIds: selectedOptionIdsFromJson(
              answer.selectedOptionIds,
            ),
          },
          final: true,
        });
      }
      continue;
    }

    if (!answer) {
      throw new HomeworkAnswerMissingRequiredException({
        questionId: question.id,
      });
    }

    normalizeAnswerForQuestion({
      question,
      input: {
        questionId: question.id,
        textAnswer: answer.textAnswer,
        selectedOptionIds: selectedOptionIdsFromJson(answer.selectedOptionIds),
      },
      final: true,
    });
  }
}

async function requireSubmissionInAssignment(
  repository: HomeworkRepository,
  input: { homeworkId: string; submissionId: string },
): Promise<HomeworkSubmissionRecord> {
  const submission = await repository.findSubmissionById({
    homeworkAssignmentId: input.homeworkId,
    submissionId: input.submissionId,
  });

  if (!submission) {
    throw new HomeworkAnswerInvalidSubmissionScopeException(input);
  }

  return submission;
}

async function findStudentTargetOrThrow(
  repository: HomeworkRepository,
  command: StudentHomeworkAnswersCommand,
): Promise<HomeworkTargetForSubmissionRecord> {
  const target = await repository.findStudentTargetForSubmission(command);
  if (!target) {
    throw new HomeworkAnswerInvalidSubmissionScopeException({
      homeworkId: command.homeworkId,
    });
  }

  return target;
}

function assertAnswersEditable(
  target: HomeworkTargetForSubmissionRecord,
): void {
  if (target.homeworkAssignment.status !== HomeworkAssignmentStatus.PUBLISHED) {
    throw new HomeworkAnswerReadOnlyException({
      homeworkId: target.homeworkAssignmentId,
      assignmentStatus: target.homeworkAssignment.status,
    });
  }

  if (
    target.status === HomeworkTargetStatus.SUBMITTED ||
    target.status === HomeworkTargetStatus.LATE ||
    target.status === HomeworkTargetStatus.REVIEWED ||
    target.status === HomeworkTargetStatus.MISSING ||
    target.status === HomeworkTargetStatus.EXCUSED
  ) {
    throw new HomeworkAnswerReadOnlyException({
      homeworkId: target.homeworkAssignmentId,
      targetStatus: target.status,
    });
  }

  const submission = target.submissions[0];
  if (submission && submission.status !== HomeworkSubmissionStatus.DRAFT) {
    throw new HomeworkAnswerReadOnlyException({
      homeworkId: target.homeworkAssignmentId,
      submissionId: submission.id,
      submissionStatus: submission.status,
    });
  }
}

async function resolveDraftSubmissionOrThrow(
  repository: HomeworkRepository,
  target: HomeworkTargetForSubmissionRecord,
): Promise<HomeworkSubmissionRecord> {
  const result = await repository.resolveDraftSubmission({
    schoolId: target.schoolId,
    homeworkAssignmentId: target.homeworkAssignmentId,
    homeworkTargetId: target.id,
    studentId: target.studentId,
    enrollmentId: target.enrollmentId,
  });

  if (result.outcome === 'already_submitted') {
    throw new HomeworkAnswerReadOnlyException({
      homeworkId: target.homeworkAssignmentId,
      submissionId: result.submission.id,
      submissionStatus: result.submission.status,
    });
  }

  return result.submission;
}

async function saveAnswer(input: {
  repository: HomeworkRepository;
  target: HomeworkTargetForSubmissionRecord;
  submission: HomeworkSubmissionRecord;
  answerInput: HomeworkAnswerInput;
  isDraft: boolean;
}): Promise<HomeworkSubmissionAnswerRecord> {
  const question = input.target.homeworkAssignment.questions.find(
    (item) => item.id === input.answerInput.questionId,
  );
  if (!question) {
    throw new HomeworkAnswerInvalidSubmissionScopeException({
      homeworkId: input.target.homeworkAssignmentId,
      questionId: input.answerInput.questionId,
    });
  }

  const normalized = normalizeAnswerForQuestion({
    question,
    input: input.answerInput,
    final: !input.isDraft,
  });
  const selectedOptionIdsJson = normalized.selectedOptionIds ?? Prisma.JsonNull;

  return input.repository.upsertSubmissionAnswer({
    data: {
      id: randomUUID(),
      schoolId: input.target.schoolId,
      homeworkSubmissionId: input.submission.id,
      homeworkAssignmentId: input.target.homeworkAssignmentId,
      homeworkTargetId: input.target.id,
      homeworkQuestionId: question.id,
      textAnswer: normalized.textAnswer,
      selectedOptionIds: selectedOptionIdsJson,
      isDraft: input.isDraft,
    },
    update: {
      textAnswer: normalized.textAnswer,
      selectedOptionIds: selectedOptionIdsJson,
      isDraft: input.isDraft,
    },
  });
}

function normalizeAnswerForQuestion(input: {
  question: HomeworkTargetForSubmissionRecord['homeworkAssignment']['questions'][number];
  input: HomeworkAnswerInput;
  final: boolean;
}): NormalizedHomeworkAnswerInput {
  const textAnswer = normalizeNullableText(input.input.textAnswer);
  const selectedOptionIds = normalizeSelectedOptionIds(
    input.input.selectedOptionIds,
  );

  if (textAnswer && selectedOptionIds) {
    throw new HomeworkAnswerInvalidPayloadException({
      questionId: input.question.id,
      reason: 'mixed_text_and_options',
    });
  }

  if (TEXT_QUESTION_TYPES.has(input.question.type)) {
    if (selectedOptionIds) {
      throw new HomeworkAnswerInvalidPayloadException({
        questionId: input.question.id,
        type: input.question.type,
        reason: 'text_question_selected_options_forbidden',
      });
    }

    if (input.final && input.question.isRequired && !textAnswer) {
      throw new HomeworkAnswerMissingRequiredException({
        questionId: input.question.id,
      });
    }

    return {
      questionId: input.question.id,
      textAnswer,
      selectedOptionIds: null,
    };
  }

  if (textAnswer) {
    throw new HomeworkAnswerInvalidPayloadException({
      questionId: input.question.id,
      type: input.question.type,
      reason: 'choice_question_text_forbidden',
    });
  }

  if (!selectedOptionIds) {
    if (input.final && input.question.isRequired) {
      throw new HomeworkAnswerMissingRequiredException({
        questionId: input.question.id,
      });
    }

    return {
      questionId: input.question.id,
      textAnswer: null,
      selectedOptionIds: null,
    };
  }

  assertOptionsBelongToQuestion(input.question, selectedOptionIds);

  if (
    SINGLE_SELECTION_QUESTION_TYPES.has(input.question.type) &&
    selectedOptionIds.length !== 1
  ) {
    throw new HomeworkAnswerInvalidPayloadException({
      questionId: input.question.id,
      type: input.question.type,
      reason: 'exactly_one_option_required',
    });
  }

  if (
    input.question.type === HomeworkQuestionType.MULTIPLE_CHOICE &&
    input.final &&
    input.question.isRequired &&
    selectedOptionIds.length < 1
  ) {
    throw new HomeworkAnswerMissingRequiredException({
      questionId: input.question.id,
    });
  }

  return {
    questionId: input.question.id,
    textAnswer: null,
    selectedOptionIds,
  };
}

function normalizeNullableText(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null) return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeSelectedOptionIds(
  value: string[] | null | undefined,
): string[] | null {
  if (!value || value.length === 0) return null;
  const normalized = value
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (normalized.length === 0) return null;

  if (new Set(normalized).size !== normalized.length) {
    throw new HomeworkAnswerInvalidPayloadException({
      reason: 'duplicate_selected_options',
    });
  }

  return normalized;
}

function selectedOptionIdsFromJson(
  value: Prisma.JsonValue | null,
): string[] | null {
  if (!Array.isArray(value)) return null;
  return normalizeSelectedOptionIds(
    value.filter((item): item is string => typeof item === 'string'),
  );
}

function assertOptionsBelongToQuestion(
  question: HomeworkTargetForSubmissionRecord['homeworkAssignment']['questions'][number],
  selectedOptionIds: string[],
): void {
  const validOptionIds = new Set(question.options.map((option) => option.id));
  const invalidOptionId = selectedOptionIds.find(
    (optionId) => !validOptionIds.has(optionId),
  );

  if (invalidOptionId) {
    throw new HomeworkAnswerInvalidOptionException({
      questionId: question.id,
      optionId: invalidOptionId,
    });
  }
}

export function mapBulkAnswersDto(
  dto: BulkSaveHomeworkAnswersDto,
): HomeworkAnswerInput[] {
  return dto.answers;
}

export function mapSingleAnswerDto(input: {
  questionId: string;
  dto: SaveHomeworkAnswerDto;
}): HomeworkAnswerInput {
  if (
    !Object.prototype.hasOwnProperty.call(input.dto, 'textAnswer') &&
    !Object.prototype.hasOwnProperty.call(input.dto, 'selectedOptionIds')
  ) {
    throw new HomeworkAnswerInvalidPayloadException({
      questionId: input.questionId,
      reason: 'empty_answer_payload',
    });
  }

  return {
    questionId: input.questionId,
    textAnswer: input.dto.textAnswer,
    selectedOptionIds: input.dto.selectedOptionIds,
  };
}
