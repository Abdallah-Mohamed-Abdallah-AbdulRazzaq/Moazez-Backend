import { validateGradeQuestionContent } from '../domain/grade-question-content-policy';
import { validateGradeQuestionDefinition } from '../domain/grade-question-interaction';
import { Injectable } from '@nestjs/common';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireGradesScope } from '../../grades-context';
import { UpdateGradeAssessmentQuestionDto } from '../dto/grade-assessment-question.dto';
import {
  NormalizedQuestionOptionPayload,
  normalizeQuestionPayload,
  validateQuestionOptionsForType,
} from '../domain/grade-question-domain';
import { GradesAssessmentQuestionsRepository } from '../infrastructure/grades-assessment-questions.repository';
import { presentGradeAssessmentQuestion } from '../presenters/grade-assessment-question.presenter';
import {
  assertQuestionMutationAllowed,
  assertQuestionSortOrderAvailable,
  buildQuestionAuditEntry,
  loadQuestionOrThrow,
  summarizeQuestionForAudit,
} from './grade-assessment-question-use-case.helpers';

@Injectable()
export class UpdateGradeAssessmentQuestionUseCase {
  constructor(
    private readonly questionsRepository: GradesAssessmentQuestionsRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(questionId: string, command: UpdateGradeAssessmentQuestionDto) {
    const scope = requireGradesScope();
    const existing = await loadQuestionOrThrow(
      this.questionsRepository,
      questionId,
    );
    await assertQuestionMutationAllowed({
      repository: this.questionsRepository,
      assessment: existing.assessment,
    });

    const payload = normalizeQuestionPayload(command);
    const metadataPatch =
      command.metadata === undefined &&
      payload.metadata &&
      typeof payload.metadata === 'object' &&
      !Array.isArray(payload.metadata)
        ? (payload.metadata as Record<string, unknown>)
        : undefined;
    if (metadataPatch)
      payload.metadata = {
        ...(existing.metadata &&
        typeof existing.metadata === 'object' &&
        !Array.isArray(existing.metadata)
          ? existing.metadata
          : {}),
        ...metadataPatch,
      };
    const nextType = payload.type ?? existing.type;
    const nextAnswerKey =
      payload.answerKey === undefined ? existing.answerKey : payload.answerKey;
    const nextMetadata =
      payload.metadata === undefined ? existing.metadata : payload.metadata;
    const options = this.resolveOptionsForValidation(existing, payload);
    if (
      payload.type !== undefined &&
      payload.type !== existing.type &&
      ((payload.options === undefined && existing.options.length > 0) ||
        (payload.answerKey === undefined && existing.answerKey !== null) ||
        (payload.metadata === undefined && existing.metadata !== null))
    ) {
      throw new ValidationDomainException(
        'Type changes must explicitly replace incompatible question content',
        { field: 'type' },
      );
    }
    validateGradeQuestionDefinition({
      type: nextType,
      metadata: nextMetadata,
      answerKey: nextAnswerKey,
      options,
    });
    validateGradeQuestionContent({
      ...existing,
      ...payload,
      metadata: nextMetadata,
      answerKey: nextAnswerKey,
      options,
    });
    const normalizedOptions =
      payload.options !== undefined
        ? validateQuestionOptionsForType({
            type: nextType,
            options,
            answerKey: nextAnswerKey,
            metadata: nextMetadata,
          })
        : undefined;

    if (payload.options === undefined && payload.type !== undefined) {
      validateQuestionOptionsForType({
        type: nextType,
        options,
        answerKey: nextAnswerKey,
        metadata: nextMetadata,
      });
    }

    if (
      payload.sortOrder !== undefined &&
      payload.sortOrder !== existing.sortOrder
    ) {
      await assertQuestionSortOrderAvailable({
        repository: this.questionsRepository,
        assessmentId: existing.assessmentId,
        sortOrder: payload.sortOrder,
        excludeQuestionId: existing.id,
      });
    }

    const updated =
      await this.questionsRepository.updateQuestionAndReplaceOptions(
        existing.id,
        {
          data: payload,
          options: normalizedOptions,
          ...(metadataPatch ? { metadataPatch } : {}),
        },
      );

    await this.authRepository.createAuditLog(
      buildQuestionAuditEntry({
        scope,
        action: 'grades.question.update',
        resourceType: 'grade_assessment_question',
        resourceId: updated.id,
        before: summarizeQuestionForAudit(existing),
        after: summarizeQuestionForAudit(updated),
      }),
    );

    return presentGradeAssessmentQuestion(updated, true);
  }

  private resolveOptionsForValidation(
    existing: Awaited<ReturnType<typeof loadQuestionOrThrow>>,
    payload: ReturnType<typeof normalizeQuestionPayload>,
  ): NormalizedQuestionOptionPayload[] {
    if (payload.options !== undefined) return payload.options;

    return existing.options.map((option) => ({
      id: option.id,
      label: option.label,
      labelAr: option.labelAr,
      value: option.value,
      isCorrect: option.isCorrect,
      sortOrder: option.sortOrder,
      metadata: option.metadata ?? null,
    }));
  }
}
