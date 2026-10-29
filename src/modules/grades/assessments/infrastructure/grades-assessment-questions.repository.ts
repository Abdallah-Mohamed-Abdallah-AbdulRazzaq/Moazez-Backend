import { randomUUID } from 'node:crypto';
import { GradeAssetsRepository } from './grade-assets.repository';
import {
  gradeRichChange,
  gradeLegacyContent,
} from '../domain/grade-rich-content';
import { requireGradesScope } from '../../grades-context';
import {
  authorizeGradeRichReview,
  gradeRichReferences,
  hasGradeRichSelection,
  projectGradeRichContent,
} from './grade-rich-content.projection';
import {
  assertGradeQuestionStructureWrite,
  assertGradeQuestionAccess,
  gradeAssessmentAccessWhere,
  gradeQuestionAccessWhere,
} from './grades-resource-access';
import { Injectable } from '@nestjs/common';
import { GradeQuestionType, Prisma } from '@prisma/client';
import { withSoftDeleted } from '../../../../common/context/request-context';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import {
  NormalizedQuestionOptionPayload,
  NormalizedQuestionPayload,
  validateQuestionOptionsForType,
} from '../domain/grade-question-domain';
import { validateGradeQuestionDefinition } from '../domain/grade-question-interaction';
import {
  isGradeEvaluationType,
  normalizeGradeEvaluationQuestion,
} from '../domain/grade-question-evaluation';
import { validateGradeQuestionContent } from '../domain/grade-question-content-policy';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';

const QUESTION_OPTION_SELECT = {
  id: true,
  schoolId: true,
  assessmentId: true,
  questionId: true,
  label: true,
  labelAr: true,
  value: true,
  isCorrect: true,
  sortOrder: true,
  metadata: true,
  richContent: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.GradeAssessmentQuestionOptionSelect;

const QUESTION_WITH_OPTIONS_ARGS =
  Prisma.validator<Prisma.GradeAssessmentQuestionDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      assessmentId: true,
      type: true,
      prompt: true,
      promptAr: true,
      explanation: true,
      explanationAr: true,
      points: true,
      sortOrder: true,
      required: true,
      answerKey: true,
      metadata: true,
      richContent: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
      options: {
        where: { deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        select: QUESTION_OPTION_SELECT,
      },
    },
  });

const QUESTION_WITH_ASSESSMENT_ARGS =
  Prisma.validator<Prisma.GradeAssessmentQuestionDefaultArgs>()({
    select: {
      ...QUESTION_WITH_OPTIONS_ARGS.select,
      assessment: {
        select: {
          id: true,
          schoolId: true,
          academicYearId: true,
          termId: true,
          deliveryMode: true,
          approvalStatus: true,
          lockedAt: true,
          maxScore: true,
          deletedAt: true,
          term: {
            select: {
              id: true,
              academicYearId: true,
              startDate: true,
              endDate: true,
              isActive: true,
            },
          },
        },
      },
    },
  });

const ASSESSMENT_FOR_QUESTION_MANAGEMENT_ARGS =
  Prisma.validator<Prisma.GradeAssessmentDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      academicYearId: true,
      termId: true,
      deliveryMode: true,
      approvalStatus: true,
      lockedAt: true,
      maxScore: true,
      deletedAt: true,
      term: {
        select: {
          id: true,
          academicYearId: true,
          startDate: true,
          endDate: true,
          isActive: true,
        },
      },
    },
  });

const QUESTION_ID_OWNERSHIP_ARGS =
  Prisma.validator<Prisma.GradeAssessmentQuestionDefaultArgs>()({
    select: {
      id: true,
      assessmentId: true,
    },
  });

export type GradeAssessmentQuestionRecord =
  Prisma.GradeAssessmentQuestionGetPayload<typeof QUESTION_WITH_OPTIONS_ARGS>;
export type GradeAssessmentQuestionWithAssessmentRecord =
  Prisma.GradeAssessmentQuestionGetPayload<
    typeof QUESTION_WITH_ASSESSMENT_ARGS
  >;
export type GradeAssessmentForQuestionManagementRecord =
  Prisma.GradeAssessmentGetPayload<
    typeof ASSESSMENT_FOR_QUESTION_MANAGEMENT_ARGS
  >;
export type GradeAssessmentQuestionOwnershipRecord =
  Prisma.GradeAssessmentQuestionGetPayload<typeof QUESTION_ID_OWNERSHIP_ARGS>;

export interface CreateQuestionWithOptionsInput extends Required<
  Pick<
    NormalizedQuestionPayload,
    'type' | 'prompt' | 'points' | 'sortOrder' | 'required'
  >
> {
  schoolId: string;
  assessmentId: string;
  richContent?: NormalizedQuestionPayload['richContent'];
  promptAr?: string | null;
  explanation?: string | null;
  explanationAr?: string | null;
  answerKey?: unknown;
  metadata?: unknown;
  options: NormalizedQuestionOptionPayload[];
}

export interface UpdateQuestionAndReplaceOptionsInput {
  data: NormalizedQuestionPayload;
  options?: NormalizedQuestionOptionPayload[];
  metadataPatch?: Record<string, unknown>;
}

/** Restart before taking ST07 locks; never escalate while holding the assessment. */
class RichWriteAuthorizationRequired extends Error {}

@Injectable()
export class GradesAssessmentQuestionsRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly richAssets?: GradeAssetsRepository,
  ) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async findAssessmentForQuestionManagement(
    assessmentId: string,
  ): Promise<GradeAssessmentForQuestionManagementRecord | null> {
    return this.scopedPrisma.gradeAssessment.findFirst({
      where: {
        AND: [
          { id: assessmentId },
          await gradeAssessmentAccessWhere(this.scopedPrisma),
        ],
      },
      ...ASSESSMENT_FOR_QUESTION_MANAGEMENT_ARGS,
    });
  }

  async listQuestions(
    assessmentId: string,
  ): Promise<GradeAssessmentQuestionRecord[]> {
    const questions = await this.scopedPrisma.gradeAssessmentQuestion.findMany({
      where: {
        AND: [
          { assessmentId },
          await gradeQuestionAccessWhere(this.scopedPrisma),
        ],
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      ...QUESTION_WITH_OPTIONS_ARGS,
    });
    await this.projectRich(assessmentId, questions);
    return questions;
  }

  async findQuestionByIdWithAssessment(
    questionId: string,
  ): Promise<GradeAssessmentQuestionWithAssessmentRecord | null> {
    const question = await this.scopedPrisma.gradeAssessmentQuestion.findFirst({
      where: {
        id: questionId,
        AND: [await gradeQuestionAccessWhere(this.scopedPrisma)],
      },
      ...QUESTION_WITH_ASSESSMENT_ARGS,
    });
    if (question) await this.projectRich(question.assessmentId, [question]);
    return question;
  }

  async listQuestionsByIds(
    questionIds: string[],
  ): Promise<GradeAssessmentQuestionOwnershipRecord[]> {
    if (questionIds.length === 0) return Promise.resolve([]);

    return this.scopedPrisma.gradeAssessmentQuestion.findMany({
      where: {
        AND: [
          { id: { in: questionIds } },
          await gradeQuestionAccessWhere(this.scopedPrisma),
        ],
      },
      ...QUESTION_ID_OWNERSHIP_ARGS,
    });
  }

  countSubmissionsForAssessment(assessmentId: string): Promise<number> {
    return this.scopedPrisma.gradeSubmission.count({
      where: { assessmentId },
    });
  }

  async getNextQuestionSortOrder(assessmentId: string): Promise<number> {
    const latest = await withSoftDeleted(() =>
      this.scopedPrisma.gradeAssessmentQuestion.findFirst({
        where: { assessmentId },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      }),
    );

    return (latest?.sortOrder ?? 0) + 1;
  }

  async isQuestionSortOrderTaken(params: {
    assessmentId: string;
    sortOrder: number;
    excludeQuestionId?: string;
  }): Promise<boolean> {
    const count = await withSoftDeleted(() =>
      this.scopedPrisma.gradeAssessmentQuestion.count({
        where: {
          assessmentId: params.assessmentId,
          sortOrder: params.sortOrder,
          ...(params.excludeQuestionId
            ? { id: { not: params.excludeQuestionId } }
            : {}),
        },
      }),
    );

    return count > 0;
  }

  async createQuestionWithOptions(
    input: CreateQuestionWithOptionsInput,
  ): Promise<GradeAssessmentQuestionRecord> {
    const created = await this.scopedPrisma.$transaction(async (tx) => {
      if (input.schoolId !== requireGradesScope().schoolId)
        throw new NotFoundDomainException();
      if (
        input.richContent !== undefined ||
        input.options.some((option) => option.richContent !== undefined)
      ) {
        if (!this.richAssets) throw new NotFoundDomainException();
        await this.richAssets.assertRichWrite(tx, input.assessmentId);
      }
      await assertGradeQuestionStructureWrite(tx, input.assessmentId);
      if (input.options.some((option) => option.id))
        throw new NotFoundDomainException(
          'Grade assessment question option not found',
        );
      const rich = gradeRichChange('gradeQuestion', input);
      if (rich.action === 'write') input = { ...input, ...rich.legacy };
      if (isGradeEvaluationType(input.type))
        input = {
          ...input,
          ...normalizeGradeEvaluationQuestion(
            { ...input, type: input.type, metadata: input.metadata },
            'draft',
          ),
        };
      validateGradeQuestionContent(gradeLegacyContent(input));
      validateQuestionOptionsForType(input);
      validateGradeQuestionDefinition(input);
      const question = await tx.gradeAssessmentQuestion.create({
        data: {
          schoolId: input.schoolId,
          assessmentId: input.assessmentId,
          type: input.type,
          prompt: input.prompt,
          promptAr: input.promptAr ?? null,
          explanation: input.explanation ?? null,
          explanationAr: input.explanationAr ?? null,
          points: new Prisma.Decimal(input.points),
          sortOrder: input.sortOrder,
          required: input.required,
          answerKey:
            isGradeEvaluationType(input.type) && input.answerKey === null
              ? Prisma.DbNull
              : this.toOptionalJson(input.answerKey),
          metadata: this.toOptionalJson(input.metadata),
          ...(rich.action === 'write'
            ? {
                richContent:
                  rich.richContent === null
                    ? Prisma.DbNull
                    : (rich.richContent as unknown as Prisma.InputJsonValue),
              }
            : {}),
        },
        select: { id: true },
      });

      if (rich.action === 'write' && rich.richContent)
        await this.assertRichReferences(
          tx,
          input.assessmentId,
          question.id,
          rich.richContent,
        );
      await this.createOptions(tx, {
        schoolId: input.schoolId,
        assessmentId: input.assessmentId,
        questionId: question.id,
        options: input.options,
      });

      return question;
    });

    return this.findQuestionResult(created.id);
  }

  async updateQuestionAndReplaceOptions(
    questionId: string,
    input: UpdateQuestionAndReplaceOptionsInput,
  ): Promise<GradeAssessmentQuestionRecord> {
    let richAuthorizationRequired =
      input.data.richContent !== undefined ||
      input.options?.some((option) => option.richContent !== undefined);
    const mutate = () =>
      this.scopedPrisma.$transaction(async (tx) => {
        // Each attempt plans from the original command and its final locked row.
        let mutation = input;
        let richAssessmentId: string | undefined;
        if (richAuthorizationRequired) {
          const parent = await tx.gradeAssessmentQuestion.findFirst({
            where: { id: questionId },
            select: { assessmentId: true },
          });
          if (!parent || !this.richAssets) throw new NotFoundDomainException();
          richAssessmentId = parent.assessmentId;
          await this.richAssets.assertRichWrite(tx, parent.assessmentId);
        }
        await assertGradeQuestionAccess(tx, questionId);
        const current = await tx.gradeAssessmentQuestion.findFirst({
          where: { id: questionId },
          ...QUESTION_WITH_OPTIONS_ARGS,
        });
        if (
          !current ||
          (richAssessmentId && current.assessmentId !== richAssessmentId)
        )
          throw new NotFoundDomainException();
        const rich = gradeRichChange('gradeQuestion', mutation.data, current);
        if (rich.action === 'write') {
          mutation = {
            ...mutation,
            data: {
              ...mutation.data,
              ...rich.legacy,
              richContent: rich.richContent,
            },
          };
          if (rich.richContent)
            await this.assertRichReferences(
              tx,
              current.assessmentId,
              questionId,
              rich.richContent,
            );
        }
        const nextType = mutation.data.type ?? current.type;
        if (
          isGradeEvaluationType(nextType) ||
          isGradeEvaluationType(current.type)
        ) {
          if (
            isGradeEvaluationType(nextType) &&
            mutation.data.answerKey === undefined &&
            current.answerKey === null
          ) {
            const [fact] = await tx.$queryRaw<Array<{ sqlNull: boolean }>>`
              SELECT answer_key IS NULL AS "sqlNull" FROM grade_assessment_questions
              WHERE id=${current.id}::uuid AND assessment_id=${current.assessmentId}::uuid
                AND school_id=${requireGradesScope().schoolId}::uuid AND deleted_at IS NULL`;
            if (!fact?.sqlNull)
              throw new ValidationDomainException(
                'Question interaction or answer is invalid',
                { field: 'answerKey' },
              );
          }
          if (mutation.metadataPatch)
            throw new ValidationDomainException(
              'Structured definitions require complete replacement',
              { field: 'metadata' },
            );
          if (
            nextType !== current.type &&
            ((mutation.options === undefined && current.options.length > 0) ||
              (mutation.data.answerKey === undefined &&
                current.answerKey !== null) ||
              (mutation.data.metadata === undefined &&
                current.metadata !== null))
          )
            throw new ValidationDomainException(
              'Type changes must explicitly replace incompatible question content',
              { field: 'type' },
            );
        }
        if (mutation.metadataPatch)
          mutation = {
            ...mutation,
            data: {
              ...mutation.data,
              metadata: {
                ...(current.metadata &&
                typeof current.metadata === 'object' &&
                !Array.isArray(current.metadata)
                  ? current.metadata
                  : {}),
                ...mutation.metadataPatch,
              },
            },
          };
        const effective = {
          ...current,
          ...mutation.data,
          options: mutation.options ?? current.options,
        };
        validateGradeQuestionContent(gradeLegacyContent(effective));
        validateQuestionOptionsForType(effective);
        validateGradeQuestionDefinition(effective);
        if (isGradeEvaluationType(effective.type)) {
          // Normalize exactly the state just validated under the existing mutation lock.
          mutation = {
            ...mutation,
            data: {
              ...mutation.data,
              ...normalizeGradeEvaluationQuestion(
                { ...effective, type: effective.type },
                'draft',
              ),
            },
          };
        }
        const optionPlan =
          mutation.options === undefined
            ? undefined
            : this.planOptionReplacement(current, mutation.options);
        if (
          !richAuthorizationRequired &&
          (await this.hasImplicitRichClear(tx, current, rich, optionPlan))
        )
          throw new RichWriteAuthorizationRequired();
        if (Object.keys(mutation.data).length > 0) {
          const data = this.buildQuestionUpdateInput(mutation.data);
          if (
            isGradeEvaluationType(effective.type) &&
            mutation.data.answerKey === null
          )
            data.answerKey = Prisma.DbNull;
          await tx.gradeAssessmentQuestion.updateMany({
            where: { id: questionId },
            data,
          });
        }

        if (optionPlan) {
          const question = await tx.gradeAssessmentQuestion.findFirst({
            where: { id: questionId },
            select: { schoolId: true, assessmentId: true },
          });

          if (!question) return;

          await this.replaceOptionsPreservingIdentity(tx, current, optionPlan);
        }
      });
    try {
      await mutate();
    } catch (error) {
      if (!(error instanceof RichWriteAuthorizationRequired)) throw error;
      // The discovery attempt made no writes and has released its locks. Only
      // this second attempt takes the full ST07 allocation/assessment hierarchy.
      richAuthorizationRequired = true;
      await mutate();
    }

    return this.findQuestionResult(questionId);
  }

  async softDeleteQuestionAndOptions(params: {
    questionId: string;
    assessmentId: string;
  }): Promise<GradeAssessmentQuestionRecord[]> {
    await this.scopedPrisma.$transaction(async (tx) => {
      await assertGradeQuestionAccess(tx, params.questionId);
      const now = new Date();
      const nextRetiredSortOrder =
        (await this.getMaxQuestionSortOrder(tx, params.assessmentId)) + 1;

      await tx.gradeAssessmentQuestion.updateMany({
        where: { id: params.questionId },
        data: { deletedAt: now, sortOrder: nextRetiredSortOrder },
      });

      await this.retireOptionsForQuestion(tx, {
        questionId: params.questionId,
        desiredSortOrders: [],
      });

      const remaining = await tx.gradeAssessmentQuestion.findMany({
        where: { assessmentId: params.assessmentId, deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true },
      });

      await this.rewriteQuestionSortOrders(tx, {
        assessmentId: params.assessmentId,
        orderedQuestionIds: remaining.map((question) => question.id),
      });
    });

    return this.listQuestions(params.assessmentId);
  }

  async reorderQuestions(params: {
    assessmentId: string;
    questionIds: string[];
  }): Promise<GradeAssessmentQuestionRecord[]> {
    await this.scopedPrisma.$transaction(async (tx) => {
      await assertGradeQuestionStructureWrite(tx, params.assessmentId);
      await this.rewriteQuestionSortOrders(tx, {
        assessmentId: params.assessmentId,
        orderedQuestionIds: params.questionIds,
      });
    });

    return this.listQuestions(params.assessmentId);
  }

  async bulkUpdateQuestionPoints(params: {
    assessmentId: string;
    items: Array<{ questionId: string; points: number }>;
  }): Promise<GradeAssessmentQuestionRecord[]> {
    await this.scopedPrisma.$transaction(async (tx) => {
      await assertGradeQuestionStructureWrite(tx, params.assessmentId);
      for (const item of params.items) {
        await tx.gradeAssessmentQuestion.updateMany({
          where: {
            id: item.questionId,
            assessmentId: params.assessmentId,
          },
          data: { points: new Prisma.Decimal(item.points) },
        });
      }
    });

    return this.listQuestions(params.assessmentId);
  }

  private async findQuestionResult(
    questionId: string,
  ): Promise<GradeAssessmentQuestionRecord> {
    const question = await this.scopedPrisma.gradeAssessmentQuestion.findFirst({
      where: { id: questionId },
      ...QUESTION_WITH_OPTIONS_ARGS,
    });

    if (!question) {
      throw new Error(
        'Grade assessment question mutation result was not found',
      );
    }

    await this.projectRich(question.assessmentId, [question]);
    return question;
  }

  private buildQuestionUpdateInput(
    payload: NormalizedQuestionPayload,
  ): Prisma.GradeAssessmentQuestionUncheckedUpdateManyInput {
    const data: Prisma.GradeAssessmentQuestionUncheckedUpdateManyInput = {};

    if (payload.richContent !== undefined)
      data.richContent =
        payload.richContent === null
          ? Prisma.DbNull
          : (payload.richContent as unknown as Prisma.InputJsonValue);
    if (payload.type !== undefined) data.type = payload.type;
    if (payload.prompt !== undefined) data.prompt = payload.prompt;
    if (payload.promptAr !== undefined) data.promptAr = payload.promptAr;
    if (payload.explanation !== undefined)
      data.explanation = payload.explanation;
    if (payload.explanationAr !== undefined) {
      data.explanationAr = payload.explanationAr;
    }
    if (payload.points !== undefined) {
      data.points = new Prisma.Decimal(payload.points);
    }
    if (payload.sortOrder !== undefined) data.sortOrder = payload.sortOrder;
    if (payload.required !== undefined) data.required = payload.required;
    if (payload.answerKey !== undefined) {
      data.answerKey = this.toOptionalJson(payload.answerKey);
    }
    if (payload.metadata !== undefined) {
      data.metadata = this.toOptionalJson(payload.metadata);
    }

    return data;
  }

  private async createOptions(
    tx: Prisma.TransactionClient,
    params: {
      schoolId: string;
      assessmentId: string;
      questionId: string;
      options: NormalizedQuestionOptionPayload[];
    },
  ): Promise<void> {
    if (params.options.length === 0) return;

    const prepared = params.options.map((option) => {
      const rich = gradeRichChange('gradeOption', option);
      return {
        option:
          rich.action === 'write' ? { ...option, ...rich.legacy } : option,
        rich,
        id: randomUUID(),
      };
    });
    await tx.gradeAssessmentQuestionOption.createMany({
      data: prepared.map(({ option, rich, id }) => ({
        id,
        schoolId: params.schoolId,
        assessmentId: params.assessmentId,
        questionId: params.questionId,
        label: option.label,
        labelAr: option.labelAr,
        value: option.value,
        isCorrect: option.isCorrect,
        sortOrder: option.sortOrder,
        metadata: this.toOptionalJson(option.metadata),
        ...(rich.action === 'write'
          ? {
              richContent:
                rich.richContent === null
                  ? Prisma.DbNull
                  : (rich.richContent as unknown as Prisma.InputJsonValue),
            }
          : {}),
      })),
    });
    for (const row of prepared)
      if (row.rich.action === 'write' && row.rich.richContent)
        await this.assertRichReferences(
          tx,
          params.assessmentId,
          params.questionId,
          row.rich.richContent,
          row.id,
        );
  }

  private planOptionReplacement(
    question: GradeAssessmentQuestionRecord,
    desired: NormalizedQuestionOptionPayload[],
  ) {
    const used = new Set<string>();
    const resolved = desired.map((option) => {
      const current = option.id
        ? question.options.find((row) => row.id === option.id)
        : question.options.find(
            (row) => row.sortOrder === option.sortOrder && !used.has(row.id),
          );
      if (
        !option.id &&
        current &&
        (option.richContent != null || current.richContent != null)
      )
        throw new ValidationDomainException(
          'Rich option updates require the exact active option id',
          { field: 'options.id' },
        );
      if (option.id && !current)
        throw new NotFoundDomainException(
          'Grade assessment question option not found',
        );
      if (current && used.has(current.id))
        throw new ValidationDomainException(
          'Duplicate option ids are not allowed',
          { field: 'options.id' },
        );
      if (current) used.add(current.id);
      const display = {
        label: option.label,
        ...(option.displayPatch &&
        !Object.hasOwn(option.displayPatch, 'labelAr')
          ? {}
          : { labelAr: option.labelAr }),
      };
      const rich = gradeRichChange(
        'gradeOption',
        { ...display, richContent: option.richContent },
        current,
      );
      const effective =
        current?.richContent != null &&
        option.displayPatch &&
        !Object.hasOwn(display, 'labelAr') &&
        option.richContent == null
          ? { ...option, labelAr: current.labelAr }
          : option;
      return {
        option:
          rich.action === 'write'
            ? { ...effective, ...rich.legacy }
            : effective,
        current,
        rich,
      };
    });
    return { desired, resolved, used };
  }

  private async hasImplicitRichClear(
    tx: Prisma.TransactionClient,
    question: GradeAssessmentQuestionRecord,
    rich: ReturnType<typeof gradeRichChange>,
    options:
      | ReturnType<GradesAssessmentQuestionsRepository['planOptionReplacement']>
      | undefined,
  ): Promise<boolean> {
    // DbNull filtering is database evidence: JSON null is stored content too.
    if (
      rich.action === 'write' &&
      rich.richContent === null &&
      (await tx.gradeAssessmentQuestion.count({
        where: {
          id: question.id,
          assessmentId: question.assessmentId,
          schoolId: question.schoolId,
          richContent: { not: Prisma.DbNull },
        },
      })) > 0
    )
      return true;
    const ids =
      options?.resolved
        .filter(
          (row) =>
            row.current &&
            row.rich.action === 'write' &&
            row.rich.richContent === null,
        )
        .map((row) => row.current!.id) ?? [];
    return (
      ids.length > 0 &&
      (await tx.gradeAssessmentQuestionOption.count({
        where: {
          id: { in: ids },
          questionId: question.id,
          assessmentId: question.assessmentId,
          schoolId: question.schoolId,
          richContent: { not: Prisma.DbNull },
        },
      })) > 0
    );
  }

  private async replaceOptionsPreservingIdentity(
    tx: Prisma.TransactionClient,
    question: GradeAssessmentQuestionRecord,
    plan: ReturnType<
      GradesAssessmentQuestionsRepository['planOptionReplacement']
    >,
  ): Promise<void> {
    const { desired, resolved, used } = plan;
    // Resolve every identity before changing order or retiring rows.
    for (const row of resolved)
      if (row.current && row.rich.action === 'write' && row.rich.richContent)
        await this.assertRichReferences(
          tx,
          question.assessmentId,
          question.id,
          row.rich.richContent,
          row.current.id,
        );
    let next =
      Math.max(
        await this.getMaxQuestionOptionSortOrder(tx, question.id),
        ...desired.map((option) => option.sortOrder),
        0,
      ) + 1;
    const moving = await withSoftDeleted(() =>
      tx.gradeAssessmentQuestionOption.findMany({
        where: {
          questionId: question.id,
          OR: [
            { deletedAt: null },
            { sortOrder: { in: desired.map((option) => option.sortOrder) } },
          ],
        },
        select: { id: true, deletedAt: true },
      }),
    );
    for (const row of moving) {
      await withSoftDeleted(() =>
        tx.gradeAssessmentQuestionOption.updateMany({
          where: { id: row.id },
          data: {
            sortOrder: next++,
            ...(!used.has(row.id) && row.deletedAt === null
              ? { deletedAt: new Date() }
              : {}),
          },
        }),
      );
    }
    for (const { option, current, rich } of resolved) {
      if (current) {
        await tx.gradeAssessmentQuestionOption.updateMany({
          where: { id: current.id, questionId: question.id },
          data: {
            label: option.label,
            labelAr: option.labelAr,
            value: option.value,
            isCorrect: option.isCorrect,
            sortOrder: option.sortOrder,
            metadata: this.toOptionalJson(option.metadata),
            ...(rich.action === 'write'
              ? {
                  richContent:
                    rich.richContent === null
                      ? Prisma.DbNull
                      : (rich.richContent as unknown as Prisma.InputJsonValue),
                }
              : {}),
          },
        });
      } else {
        await this.createOptions(tx, {
          schoolId: question.schoolId,
          assessmentId: question.assessmentId,
          questionId: question.id,
          options: [option],
        });
      }
    }
  }

  private async retireOptionsForQuestion(
    tx: Prisma.TransactionClient,
    params: {
      questionId: string;
      desiredSortOrders: number[];
    },
  ): Promise<void> {
    const now = new Date();
    let nextSortOrder =
      (await this.getMaxQuestionOptionSortOrder(tx, params.questionId)) + 1;

    const activeOptions = await tx.gradeAssessmentQuestionOption.findMany({
      where: { questionId: params.questionId, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });

    for (const option of activeOptions) {
      await tx.gradeAssessmentQuestionOption.updateMany({
        where: { id: option.id },
        data: { deletedAt: now, sortOrder: nextSortOrder++ },
      });
    }

    if (params.desiredSortOrders.length === 0) return;

    const desiredSortOrders = [...new Set(params.desiredSortOrders)];
    const retiredConflicts = await withSoftDeleted(() =>
      tx.gradeAssessmentQuestionOption.findMany({
        where: {
          questionId: params.questionId,
          deletedAt: { not: null },
          sortOrder: { in: desiredSortOrders },
        },
        select: { id: true },
      }),
    );

    for (const option of retiredConflicts) {
      await tx.gradeAssessmentQuestionOption.updateMany({
        where: { id: option.id },
        data: { sortOrder: nextSortOrder++ },
      });
    }
  }

  private async rewriteQuestionSortOrders(
    tx: Prisma.TransactionClient,
    params: {
      assessmentId: string;
      orderedQuestionIds: string[];
    },
  ): Promise<void> {
    if (params.orderedQuestionIds.length === 0) return;

    let nextSortOrder =
      (await this.getMaxQuestionSortOrder(tx, params.assessmentId)) + 1;

    for (const questionId of params.orderedQuestionIds) {
      await tx.gradeAssessmentQuestion.updateMany({
        where: { id: questionId, assessmentId: params.assessmentId },
        data: { sortOrder: nextSortOrder++ },
      });
    }

    const finalSortOrders = params.orderedQuestionIds.map(
      (_, index) => index + 1,
    );
    const retiredConflicts = await withSoftDeleted(() =>
      tx.gradeAssessmentQuestion.findMany({
        where: {
          assessmentId: params.assessmentId,
          deletedAt: { not: null },
          sortOrder: { in: finalSortOrders },
        },
        select: { id: true },
      }),
    );

    for (const question of retiredConflicts) {
      await tx.gradeAssessmentQuestion.updateMany({
        where: { id: question.id },
        data: { sortOrder: nextSortOrder++ },
      });
    }

    for (const [index, questionId] of params.orderedQuestionIds.entries()) {
      await tx.gradeAssessmentQuestion.updateMany({
        where: { id: questionId, assessmentId: params.assessmentId },
        data: { sortOrder: index + 1 },
      });
    }
  }

  private async getMaxQuestionSortOrder(
    tx: Prisma.TransactionClient,
    assessmentId: string,
  ): Promise<number> {
    const latest = await withSoftDeleted(() =>
      tx.gradeAssessmentQuestion.findFirst({
        where: { assessmentId },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      }),
    );

    return latest?.sortOrder ?? 0;
  }

  private async getMaxQuestionOptionSortOrder(
    tx: Prisma.TransactionClient,
    questionId: string,
  ): Promise<number> {
    const latest = await withSoftDeleted(() =>
      tx.gradeAssessmentQuestionOption.findFirst({
        where: { questionId },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      }),
    );

    return latest?.sortOrder ?? 0;
  }

  private async projectRich(
    assessmentId: string,
    questions: GradeAssessmentQuestionRecord[],
  ): Promise<void> {
    if (!hasGradeRichSelection(questions)) return;
    await this.scopedPrisma.$transaction(async (tx) => {
      await authorizeGradeRichReview(tx, assessmentId);
      await projectGradeRichContent(
        tx,
        assessmentId,
        questions,
        this.richAssets,
        'review',
      );
    });
  }

  private async assertRichReferences(
    tx: Prisma.TransactionClient,
    assessmentId: string,
    questionId: string,
    content: NonNullable<NormalizedQuestionPayload['richContent']>,
    optionId?: string,
  ): Promise<void> {
    const actor = requireGradesScope();
    const refs = gradeRichReferences(content);
    if (refs.length && !this.richAssets) throw new NotFoundDomainException();
    for (const reference of refs)
      await this.richAssets!.assertReference({
        transaction: tx,
        actor,
        schoolId: actor.schoolId,
        owner: {
          domain: 'grades',
          assessmentId,
          questionId,
          ...(optionId ? { optionId } : {}),
        },
        reference,
        audience: 'author',
      });
  }

  private toOptionalJson(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === undefined) return undefined;
    if (value === null)
      return Prisma.JsonNull as unknown as Prisma.InputJsonValue;
    return value as Prisma.InputJsonValue;
  }
}
