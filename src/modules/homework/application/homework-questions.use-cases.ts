import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  HomeworkAssignmentStatus,
  HomeworkQuestionType,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuthRepository } from '../../iam/auth/infrastructure/auth.repository';
import { requireHomeworkScope, HomeworkScope } from '../homework-context';
import {
  CreateHomeworkQuestionDto,
  CreateHomeworkQuestionOptionDto,
  ReorderHomeworkQuestionDto,
  ReorderHomeworkQuestionOptionDto,
  UpdateHomeworkQuestionDto,
  UpdateHomeworkQuestionOptionDto,
} from '../dto/homework-question.dto';
import {
  HomeworkQuestionDetailResponseDto,
  HomeworkQuestionsListResponseDto,
} from '../dto/homework-question-response.dto';
import {
  HomeworkAssignmentInvalidQuestionStructureException,
  HomeworkQuestionInvalidOptionsException,
  HomeworkQuestionInvalidReorderException,
  HomeworkQuestionInvalidTypePayloadException,
  HomeworkQuestionNotFoundException,
  HomeworkQuestionOptionNotFoundException,
  HomeworkQuestionReadOnlyException,
} from '../domain/homework-question.exceptions';
import { HomeworkAssignmentNotFoundException } from '../domain/homework.exceptions';
import {
  CreateHomeworkQuestionOptionData,
  HomeworkAssignmentWithCounters,
  HomeworkQuestionRecord,
  HomeworkRepository,
  UpdateHomeworkQuestionData,
  UpdateHomeworkQuestionOptionData,
} from '../infrastructure/homework.repository';
import {
  presentHomeworkQuestionAdmin,
  presentHomeworkQuestionDetailAdmin,
  presentHomeworkQuestionsAdmin,
} from '../presenters/homework-question.presenter';

const CHOICE_QUESTION_TYPES = new Set<HomeworkQuestionType>([
  HomeworkQuestionType.SINGLE_CHOICE,
  HomeworkQuestionType.MULTIPLE_CHOICE,
  HomeworkQuestionType.TRUE_FALSE,
]);

@Injectable()
export class ListHomeworkQuestionsUseCase {
  constructor(private readonly homeworkRepository: HomeworkRepository) {}

  async execute(homeworkId: string): Promise<HomeworkQuestionsListResponseDto> {
    requireHomeworkScope();
    await findAssignmentOrThrow(this.homeworkRepository, homeworkId);
    const questions = await this.homeworkRepository.listQuestions(homeworkId);
    return presentHomeworkQuestionsAdmin(questions);
  }
}

@Injectable()
export class GetHomeworkQuestionUseCase {
  constructor(private readonly homeworkRepository: HomeworkRepository) {}

  async execute(input: {
    homeworkId: string;
    questionId: string;
  }): Promise<HomeworkQuestionDetailResponseDto> {
    requireHomeworkScope();
    await findAssignmentOrThrow(this.homeworkRepository, input.homeworkId);
    const question = await findQuestionOrThrow(this.homeworkRepository, input);
    return presentHomeworkQuestionDetailAdmin(question);
  }
}

@Injectable()
export class CreateHomeworkQuestionUseCase {
  constructor(
    private readonly homeworkRepository: HomeworkRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    homeworkId: string,
    command: CreateHomeworkQuestionDto,
  ): Promise<HomeworkQuestionDetailResponseDto> {
    const scope = requireHomeworkScope();
    const assignment = await findAssignmentOrThrow(
      this.homeworkRepository,
      homeworkId,
    );
    assertQuestionsMutable(assignment);

    const normalized = await normalizeCreateQuestionCommand({
      repository: this.homeworkRepository,
      scope,
      homeworkId,
      command,
    });
    const question = await this.homeworkRepository.createQuestionWithOptions(
      normalized,
    );

    await this.auditQuestionMutation({
      scope,
      action: 'homework.question.create',
      question,
    });

    return { question: presentHomeworkQuestionAdmin(question) };
  }

  private auditQuestionMutation(input: {
    scope: HomeworkScope;
    action: string;
    question: HomeworkQuestionRecord;
  }): Promise<unknown> {
    return this.authRepository.createAuditLog(
      buildQuestionAuditEntry(input),
    );
  }
}

@Injectable()
export class UpdateHomeworkQuestionUseCase {
  constructor(
    private readonly homeworkRepository: HomeworkRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    homeworkId: string,
    questionId: string,
    command: UpdateHomeworkQuestionDto,
  ): Promise<HomeworkQuestionDetailResponseDto> {
    const scope = requireHomeworkScope();
    const assignment = await findAssignmentOrThrow(
      this.homeworkRepository,
      homeworkId,
    );
    assertQuestionsMutable(assignment);
    const existing = await findQuestionOrThrow(this.homeworkRepository, {
      homeworkId,
      questionId,
    });
    const data = normalizeUpdateQuestionCommand(existing, command);
    const question = await this.homeworkRepository.updateQuestion({
      homeworkId,
      questionId,
      data,
    });

    await this.authRepository.createAuditLog(
      buildQuestionAuditEntry({
        scope,
        action: 'homework.question.update',
        question,
        before: summarizeQuestionForAudit(existing),
      }),
    );

    return { question: presentHomeworkQuestionAdmin(question) };
  }
}

@Injectable()
export class ReorderHomeworkQuestionUseCase {
  constructor(
    private readonly homeworkRepository: HomeworkRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    homeworkId: string,
    questionId: string,
    command: ReorderHomeworkQuestionDto,
  ): Promise<HomeworkQuestionDetailResponseDto> {
    const scope = requireHomeworkScope();
    const assignment = await findAssignmentOrThrow(
      this.homeworkRepository,
      homeworkId,
    );
    assertQuestionsMutable(assignment);
    const existing = await findQuestionOrThrow(this.homeworkRepository, {
      homeworkId,
      questionId,
    });

    if (!Number.isInteger(command.sortOrder) || command.sortOrder < 0) {
      throw new HomeworkQuestionInvalidReorderException({
        homeworkId,
        questionId,
        sortOrder: command.sortOrder,
      });
    }

    const question = await this.homeworkRepository.updateQuestion({
      homeworkId,
      questionId,
      data: { sortOrder: command.sortOrder, updatedByUserId: scope.actorId },
    });

    await this.authRepository.createAuditLog(
      buildQuestionAuditEntry({
        scope,
        action: 'homework.question.reorder',
        question,
        before: summarizeQuestionForAudit(existing),
      }),
    );

    return { question: presentHomeworkQuestionAdmin(question) };
  }
}

@Injectable()
export class DeleteHomeworkQuestionUseCase {
  constructor(
    private readonly homeworkRepository: HomeworkRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(homeworkId: string, questionId: string): Promise<void> {
    const scope = requireHomeworkScope();
    const assignment = await findAssignmentOrThrow(
      this.homeworkRepository,
      homeworkId,
    );
    assertQuestionsMutable(assignment);
    const existing = await findQuestionOrThrow(this.homeworkRepository, {
      homeworkId,
      questionId,
    });

    await this.homeworkRepository.softDeleteQuestion({ homeworkId, questionId });
    await this.authRepository.createAuditLog(
      buildQuestionAuditEntry({
        scope,
        action: 'homework.question.delete',
        question: existing,
      }),
    );
  }
}

@Injectable()
export class CreateHomeworkQuestionOptionUseCase {
  constructor(
    private readonly homeworkRepository: HomeworkRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    homeworkId: string,
    questionId: string,
    command: CreateHomeworkQuestionOptionDto,
  ): Promise<HomeworkQuestionDetailResponseDto> {
    const scope = requireHomeworkScope();
    const assignment = await findAssignmentOrThrow(
      this.homeworkRepository,
      homeworkId,
    );
    assertQuestionsMutable(assignment);
    const question = await findQuestionOrThrow(this.homeworkRepository, {
      homeworkId,
      questionId,
    });
    assertChoiceQuestion(question);
    const sortOrder =
      command.sortOrder ??
      (await this.homeworkRepository.getNextOptionSortOrder(questionId));
    const data = normalizeCreateOption({
      scope,
      questionId,
      command,
      sortOrder,
    });
    const updatedQuestion = await this.homeworkRepository.createQuestionOption({
      homeworkId,
      data,
    });

    await this.authRepository.createAuditLog(
      buildQuestionAuditEntry({
        scope,
        action: 'homework.question.option.create',
        question: updatedQuestion,
        before: summarizeQuestionForAudit(question),
      }),
    );

    return { question: presentHomeworkQuestionAdmin(updatedQuestion) };
  }
}

@Injectable()
export class UpdateHomeworkQuestionOptionUseCase {
  constructor(
    private readonly homeworkRepository: HomeworkRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    homeworkId: string,
    questionId: string,
    optionId: string,
    command: UpdateHomeworkQuestionOptionDto,
  ): Promise<HomeworkQuestionDetailResponseDto> {
    const scope = requireHomeworkScope();
    const assignment = await findAssignmentOrThrow(
      this.homeworkRepository,
      homeworkId,
    );
    assertQuestionsMutable(assignment);
    const question = await findQuestionOrThrow(this.homeworkRepository, {
      homeworkId,
      questionId,
    });
    assertChoiceQuestion(question);
    const option = await this.homeworkRepository.findQuestionOptionById({
      homeworkId,
      questionId,
      optionId,
    });
    if (!option) {
      throw new HomeworkQuestionOptionNotFoundException({
        homeworkId,
        questionId,
        optionId,
      });
    }

    const data = normalizeUpdateOption(command);
    const updatedQuestion = await this.homeworkRepository.updateQuestionOption({
      homeworkId,
      questionId,
      optionId,
      data,
    });

    await this.authRepository.createAuditLog(
      buildQuestionAuditEntry({
        scope,
        action: 'homework.question.option.update',
        question: updatedQuestion,
        before: summarizeQuestionForAudit(question),
      }),
    );

    return { question: presentHomeworkQuestionAdmin(updatedQuestion) };
  }
}

@Injectable()
export class ReorderHomeworkQuestionOptionUseCase {
  constructor(
    private readonly homeworkRepository: HomeworkRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    homeworkId: string,
    questionId: string,
    optionId: string,
    command: ReorderHomeworkQuestionOptionDto,
  ): Promise<HomeworkQuestionDetailResponseDto> {
    const scope = requireHomeworkScope();
    const assignment = await findAssignmentOrThrow(
      this.homeworkRepository,
      homeworkId,
    );
    assertQuestionsMutable(assignment);
    const question = await findQuestionOrThrow(this.homeworkRepository, {
      homeworkId,
      questionId,
    });
    assertChoiceQuestion(question);
    const option = await this.homeworkRepository.findQuestionOptionById({
      homeworkId,
      questionId,
      optionId,
    });
    if (!option) {
      throw new HomeworkQuestionOptionNotFoundException({
        homeworkId,
        questionId,
        optionId,
      });
    }
    if (!Number.isInteger(command.sortOrder) || command.sortOrder < 0) {
      throw new HomeworkQuestionInvalidReorderException({
        homeworkId,
        questionId,
        optionId,
        sortOrder: command.sortOrder,
      });
    }

    const updatedQuestion = await this.homeworkRepository.updateQuestionOption({
      homeworkId,
      questionId,
      optionId,
      data: { sortOrder: command.sortOrder },
    });

    await this.authRepository.createAuditLog(
      buildQuestionAuditEntry({
        scope,
        action: 'homework.question.option.reorder',
        question: updatedQuestion,
        before: summarizeQuestionForAudit(question),
      }),
    );

    return { question: presentHomeworkQuestionAdmin(updatedQuestion) };
  }
}

@Injectable()
export class DeleteHomeworkQuestionOptionUseCase {
  constructor(
    private readonly homeworkRepository: HomeworkRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    homeworkId: string,
    questionId: string,
    optionId: string,
  ): Promise<HomeworkQuestionDetailResponseDto> {
    const scope = requireHomeworkScope();
    const assignment = await findAssignmentOrThrow(
      this.homeworkRepository,
      homeworkId,
    );
    assertQuestionsMutable(assignment);
    const question = await findQuestionOrThrow(this.homeworkRepository, {
      homeworkId,
      questionId,
    });
    const option = await this.homeworkRepository.findQuestionOptionById({
      homeworkId,
      questionId,
      optionId,
    });
    if (!option) {
      throw new HomeworkQuestionOptionNotFoundException({
        homeworkId,
        questionId,
        optionId,
      });
    }

    const updatedQuestion = await this.homeworkRepository.softDeleteQuestionOption(
      {
        homeworkId,
        questionId,
        optionId,
      },
    );

    await this.authRepository.createAuditLog(
      buildQuestionAuditEntry({
        scope,
        action: 'homework.question.option.delete',
        question: updatedQuestion,
        before: summarizeQuestionForAudit(question),
      }),
    );

    return { question: presentHomeworkQuestionAdmin(updatedQuestion) };
  }
}

export async function validateHomeworkQuestionsForPublish(
  repository: HomeworkRepository,
  homeworkId: string,
): Promise<void> {
  const questions = await repository.listQuestions(homeworkId);
  validateActiveQuestionStructures(questions);
}

function validateActiveQuestionStructures(
  questions: HomeworkQuestionRecord[],
): void {
  for (const question of questions) {
    if (!question.prompt.trim()) {
      throw new HomeworkAssignmentInvalidQuestionStructureException({
        questionId: question.id,
        reason: 'prompt_required',
      });
    }

    const options = question.options;
    if (!isChoiceQuestionType(question.type)) {
      if (options.length > 0) {
        throw new HomeworkAssignmentInvalidQuestionStructureException({
          questionId: question.id,
          type: question.type,
          reason: 'text_question_has_options',
        });
      }
      continue;
    }

    const correctCount = options.filter((option) => option.isCorrect).length;
    if (
      question.type === HomeworkQuestionType.SINGLE_CHOICE &&
      (options.length < 2 || correctCount !== 1)
    ) {
      throw new HomeworkAssignmentInvalidQuestionStructureException({
        questionId: question.id,
        type: question.type,
        optionCount: options.length,
        correctCount,
      });
    }

    if (
      question.type === HomeworkQuestionType.MULTIPLE_CHOICE &&
      (options.length < 2 || correctCount < 1)
    ) {
      throw new HomeworkAssignmentInvalidQuestionStructureException({
        questionId: question.id,
        type: question.type,
        optionCount: options.length,
        correctCount,
      });
    }

    if (
      question.type === HomeworkQuestionType.TRUE_FALSE &&
      (options.length !== 2 || correctCount !== 1)
    ) {
      throw new HomeworkAssignmentInvalidQuestionStructureException({
        questionId: question.id,
        type: question.type,
        optionCount: options.length,
        correctCount,
      });
    }
  }
}

async function normalizeCreateQuestionCommand(input: {
  repository: HomeworkRepository;
  scope: HomeworkScope;
  homeworkId: string;
  command: CreateHomeworkQuestionDto;
}): Promise<{
  question: Prisma.HomeworkQuestionUncheckedCreateInput;
  options: CreateHomeworkQuestionOptionData[];
}> {
  const prompt = normalizeRequiredText(input.command.prompt, 'prompt');
  const options = input.command.options ?? [];
  assertQuestionTypePayload(input.command.type, options);
  const questionId = randomUUID();
  const sortOrder =
    input.command.sortOrder ??
    (await input.repository.getNextQuestionSortOrder(input.homeworkId));

  return {
    question: {
      id: questionId,
      schoolId: input.scope.schoolId,
      homeworkAssignmentId: input.homeworkId,
      type: input.command.type,
      prompt,
      instructions: normalizeNullableText(input.command.instructions),
      points: toDecimal(input.command.points ?? 0),
      sortOrder,
      isRequired: input.command.isRequired ?? true,
      expectedAnswer: normalizeNullableText(input.command.expectedAnswer),
      metadata: toNullableJson(input.command.metadata),
      createdByUserId: input.scope.actorId,
    },
    options: options.map((option, index) =>
      normalizeCreateOption({
        scope: input.scope,
        questionId,
        command: option,
        sortOrder: option.sortOrder ?? index,
      }),
    ),
  };
}

function normalizeUpdateQuestionCommand(
  existing: HomeworkQuestionRecord,
  command: UpdateHomeworkQuestionDto,
): UpdateHomeworkQuestionData {
  const nextType = command.type ?? existing.type;
  if (
    command.type &&
    !isChoiceQuestionType(command.type) &&
    existing.options.length > 0
  ) {
    throw new HomeworkQuestionInvalidTypePayloadException({
      questionId: existing.id,
      type: command.type,
      reason: 'text_question_cannot_keep_options',
    });
  }

  const data: UpdateHomeworkQuestionData = { type: nextType };
  if (hasOwn(command, 'prompt')) {
    data.prompt = normalizeRequiredText(command.prompt ?? '', 'prompt');
  }
  if (hasOwn(command, 'instructions')) {
    data.instructions = normalizeNullableText(command.instructions);
  }
  if (hasOwn(command, 'points')) {
    data.points = toDecimal(command.points ?? 0);
  }
  if (hasOwn(command, 'isRequired')) {
    data.isRequired = command.isRequired ?? true;
  }
  if (hasOwn(command, 'expectedAnswer')) {
    data.expectedAnswer = normalizeNullableText(command.expectedAnswer);
  }
  if (hasOwn(command, 'metadata')) {
    data.metadata = toNullableJson(command.metadata);
  }

  return data;
}

function assertQuestionTypePayload(
  type: HomeworkQuestionType,
  options: CreateHomeworkQuestionOptionDto[],
): void {
  if (!isChoiceQuestionType(type) && options.length > 0) {
    throw new HomeworkQuestionInvalidTypePayloadException({
      type,
      reason: 'text_question_options_forbidden',
    });
  }
}

function assertChoiceQuestion(question: HomeworkQuestionRecord): void {
  if (isChoiceQuestionType(question.type)) return;
  throw new HomeworkQuestionInvalidTypePayloadException({
    questionId: question.id,
    type: question.type,
    reason: 'options_forbidden_for_text_question',
  });
}

function normalizeCreateOption(input: {
  scope: HomeworkScope;
  questionId: string;
  command: CreateHomeworkQuestionOptionDto;
  sortOrder: number;
}): CreateHomeworkQuestionOptionData {
  return {
    id: randomUUID(),
    schoolId: input.scope.schoolId,
    homeworkQuestionId: input.questionId,
    text: normalizeRequiredText(input.command.text, 'text'),
    isCorrect: input.command.isCorrect ?? false,
    sortOrder: input.sortOrder,
    metadata: toNullableJson(input.command.metadata),
  };
}

function normalizeUpdateOption(
  command: UpdateHomeworkQuestionOptionDto,
): UpdateHomeworkQuestionOptionData {
  const data: UpdateHomeworkQuestionOptionData = {};
  if (hasOwn(command, 'text')) {
    data.text = normalizeRequiredText(command.text ?? '', 'text');
  }
  if (hasOwn(command, 'isCorrect')) {
    data.isCorrect = command.isCorrect ?? false;
  }
  if (hasOwn(command, 'metadata')) {
    data.metadata = toNullableJson(command.metadata);
  }

  return data;
}

function isChoiceQuestionType(type: HomeworkQuestionType): boolean {
  return CHOICE_QUESTION_TYPES.has(type);
}

async function findAssignmentOrThrow(
  repository: HomeworkRepository,
  homeworkId: string,
): Promise<HomeworkAssignmentWithCounters> {
  const assignment = await repository.findAssignmentById(homeworkId);
  if (!assignment) {
    throw new HomeworkAssignmentNotFoundException({ homeworkId });
  }

  return assignment;
}

async function findQuestionOrThrow(
  repository: HomeworkRepository,
  input: { homeworkId: string; questionId: string },
): Promise<HomeworkQuestionRecord> {
  const question = await repository.findQuestionById(input);
  if (!question) {
    throw new HomeworkQuestionNotFoundException(input);
  }

  return question;
}

function assertQuestionsMutable(assignment: HomeworkAssignmentWithCounters): void {
  if (assignment.status === HomeworkAssignmentStatus.DRAFT) return;
  throw new HomeworkQuestionReadOnlyException({
    homeworkId: assignment.id,
    status: assignment.status,
  });
}

function normalizeRequiredText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    if (field === 'text') {
      throw new HomeworkQuestionInvalidOptionsException({
        field,
        reason: 'required',
      });
    }
    throw new HomeworkQuestionInvalidTypePayloadException({
      field,
      reason: 'required',
    });
  }

  return normalized;
}

function normalizeNullableText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function toDecimal(value: number): Prisma.Decimal {
  if (!Number.isFinite(value) || value < 0) {
    throw new HomeworkQuestionInvalidTypePayloadException({
      field: 'points',
      reason: 'non_negative_required',
    });
  }

  return new Prisma.Decimal(value);
}

function toNullableJson(
  value: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

function buildQuestionAuditEntry(input: {
  scope: HomeworkScope;
  action: string;
  question: HomeworkQuestionRecord;
  before?: Record<string, unknown>;
}) {
  return {
    actorId: input.scope.actorId,
    userType: input.scope.userType,
    organizationId: input.scope.organizationId,
    schoolId: input.scope.schoolId,
    module: 'homework',
    action: input.action,
    resourceType: 'homework_question',
    resourceId: input.question.id,
    outcome: AuditOutcome.SUCCESS,
    before: input.before,
    after: summarizeQuestionForAudit(input.question),
  };
}

function summarizeQuestionForAudit(
  question: HomeworkQuestionRecord,
): Record<string, unknown> {
  return {
    id: question.id,
    homeworkAssignmentId: question.homeworkAssignmentId,
    type: question.type,
    sortOrder: question.sortOrder,
    optionCount: question.options.length,
  };
}

function hasOwn<T extends object>(object: T, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}
