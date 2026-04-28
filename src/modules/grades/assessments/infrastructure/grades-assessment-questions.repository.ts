import { Injectable } from '@nestjs/common';
import { GradeQuestionType, Prisma } from '@prisma/client';
import { withSoftDeleted } from '../../../../common/context/request-context';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import {
  NormalizedQuestionOptionPayload,
  NormalizedQuestionPayload,
} from '../domain/grade-question-domain';

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
}

@Injectable()
export class GradesAssessmentQuestionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  findAssessmentForQuestionManagement(
    assessmentId: string,
  ): Promise<GradeAssessmentForQuestionManagementRecord | null> {
    return this.scopedPrisma.gradeAssessment.findFirst({
      where: { id: assessmentId },
      ...ASSESSMENT_FOR_QUESTION_MANAGEMENT_ARGS,
    });
  }

  listQuestions(
    assessmentId: string,
  ): Promise<GradeAssessmentQuestionRecord[]> {
    return this.scopedPrisma.gradeAssessmentQuestion.findMany({
      where: { assessmentId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      ...QUESTION_WITH_OPTIONS_ARGS,
    });
  }

  findQuestionByIdWithAssessment(
    questionId: string,
  ): Promise<GradeAssessmentQuestionWithAssessmentRecord | null> {
    return this.scopedPrisma.gradeAssessmentQuestion.findFirst({
      where: {
        id: questionId,
        assessment: { deletedAt: null },
      },
      ...QUESTION_WITH_ASSESSMENT_ARGS,
    });
  }

  listQuestionsByIds(
    questionIds: string[],
  ): Promise<GradeAssessmentQuestionOwnershipRecord[]> {
    if (questionIds.length === 0) return Promise.resolve([]);

    return this.scopedPrisma.gradeAssessmentQuestion.findMany({
      where: { id: { in: questionIds } },
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
          answerKey: this.toOptionalJson(input.answerKey),
          metadata: this.toOptionalJson(input.metadata),
        },
        select: { id: true },
      });

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
    await this.scopedPrisma.$transaction(async (tx) => {
      if (Object.keys(input.data).length > 0) {
        await tx.gradeAssessmentQuestion.updateMany({
          where: { id: questionId },
          data: this.buildQuestionUpdateInput(input.data),
        });
      }

      if (input.options !== undefined) {
        const question = await tx.gradeAssessmentQuestion.findFirst({
          where: { id: questionId },
          select: { schoolId: true, assessmentId: true },
        });

        if (!question) return;

        await this.retireOptionsForQuestion(tx, {
          questionId,
          desiredSortOrders: input.options.map((option) => option.sortOrder),
        });
        await this.createOptions(tx, {
          schoolId: question.schoolId,
          assessmentId: question.assessmentId,
          questionId,
          options: input.options,
        });
      }
    });

    return this.findQuestionResult(questionId);
  }

  async softDeleteQuestionAndOptions(params: {
    questionId: string;
    assessmentId: string;
  }): Promise<GradeAssessmentQuestionRecord[]> {
    await this.scopedPrisma.$transaction(async (tx) => {
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
    await this.scopedPrisma.$transaction(
      params.items.map((item) =>
        this.scopedPrisma.gradeAssessmentQuestion.updateMany({
          where: {
            id: item.questionId,
            assessmentId: params.assessmentId,
          },
          data: { points: new Prisma.Decimal(item.points) },
        }),
      ),
    );

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

    return question;
  }

  private buildQuestionUpdateInput(
    payload: NormalizedQuestionPayload,
  ): Prisma.GradeAssessmentQuestionUncheckedUpdateManyInput {
    const data: Prisma.GradeAssessmentQuestionUncheckedUpdateManyInput = {};

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

    await tx.gradeAssessmentQuestionOption.createMany({
      data: params.options.map((option) => ({
        schoolId: params.schoolId,
        assessmentId: params.assessmentId,
        questionId: params.questionId,
        label: option.label,
        labelAr: option.labelAr,
        value: option.value,
        isCorrect: option.isCorrect,
        sortOrder: option.sortOrder,
        metadata: this.toOptionalJson(option.metadata),
      })),
    });
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

  private toOptionalJson(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === undefined) return undefined;
    if (value === null)
      return Prisma.JsonNull as unknown as Prisma.InputJsonValue;
    return value as Prisma.InputJsonValue;
  }
}
