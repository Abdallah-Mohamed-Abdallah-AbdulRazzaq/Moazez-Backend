import { Injectable } from '@nestjs/common';
import { Prisma, ReinforcementSource } from '@prisma/client';
import { withSoftDeleted } from '../../../../common/context/request-context';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { NormalizedReinforcementStage } from '../../tasks/domain/reinforcement-task-domain';

const TEMPLATE_STAGE_SELECT = {
  id: true,
  sortOrder: true,
  titleEn: true,
  titleAr: true,
  descriptionEn: true,
  descriptionAr: true,
  proofType: true,
  requiresApproval: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.ReinforcementTaskTemplateStageSelect;

const TEMPLATE_DETAIL_ARGS =
  Prisma.validator<Prisma.ReinforcementTaskTemplateDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      academicYearId: true,
      termId: true,
      nameEn: true,
      nameAr: true,
      descriptionEn: true,
      descriptionAr: true,
      source: true,
      rewardType: true,
      rewardValue: true,
      rewardLabelEn: true,
      rewardLabelAr: true,
      metadata: true,
      createdById: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
      stages: {
        where: { deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        select: TEMPLATE_STAGE_SELECT,
      },
    },
  });

export type ReinforcementTaskTemplateRecord =
  Prisma.ReinforcementTaskTemplateGetPayload<typeof TEMPLATE_DETAIL_ARGS>;

export interface ListTemplatesFilters {
  search?: string;
  source?: ReinforcementSource;
  includeDeleted?: boolean;
}

export interface CreateTemplateWithStagesInput {
  schoolId: string;
  template: Omit<
    Prisma.ReinforcementTaskTemplateUncheckedCreateInput,
    'schoolId' | 'stages'
  >;
  stages: NormalizedReinforcementStage[];
}

@Injectable()
export class ReinforcementTemplatesRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async listTemplates(
    filters: ListTemplatesFilters,
  ): Promise<ReinforcementTaskTemplateRecord[]> {
    const findTemplates = () =>
      this.scopedPrisma.reinforcementTaskTemplate.findMany({
        where: this.buildListWhere(filters),
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        ...TEMPLATE_DETAIL_ARGS,
      });

    return filters.includeDeleted
      ? withSoftDeleted(findTemplates)
      : findTemplates();
  }

  async createTemplateWithStages(
    input: CreateTemplateWithStagesInput,
  ): Promise<ReinforcementTaskTemplateRecord> {
    return this.prisma.$transaction(async (tx) => {
      const template = await tx.reinforcementTaskTemplate.create({
        data: {
          ...input.template,
          schoolId: input.schoolId,
        },
        select: { id: true },
      });

      if (input.stages.length > 0) {
        await tx.reinforcementTaskTemplateStage.createMany({
          data: input.stages.map((stage) => ({
            schoolId: input.schoolId,
            templateId: template.id,
            sortOrder: stage.sortOrder,
            titleEn: stage.titleEn,
            titleAr: stage.titleAr,
            descriptionEn: stage.descriptionEn,
            descriptionAr: stage.descriptionAr,
            proofType: stage.proofType,
            requiresApproval: stage.requiresApproval,
            metadata: this.toJsonInput(stage.metadata),
          })),
        });
      }

      const record = await tx.reinforcementTaskTemplate.findFirst({
        where: { id: template.id, schoolId: input.schoolId, deletedAt: null },
        ...TEMPLATE_DETAIL_ARGS,
      });

      if (!record) {
        throw new Error('Reinforcement template mutation result was not found');
      }

      return record;
    });
  }

  private buildListWhere(
    filters: ListTemplatesFilters,
  ): Prisma.ReinforcementTaskTemplateWhereInput {
    const and: Prisma.ReinforcementTaskTemplateWhereInput[] = [];
    const search = filters.search?.trim();

    if (search) {
      and.push({
        OR: [
          { nameEn: { contains: search, mode: 'insensitive' } },
          { nameAr: { contains: search, mode: 'insensitive' } },
          { descriptionEn: { contains: search, mode: 'insensitive' } },
          { descriptionAr: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    return {
      ...(filters.source ? { source: filters.source } : {}),
      ...(and.length > 0 ? { AND: and } : {}),
    };
  }

  private toJsonInput(value: unknown): Prisma.InputJsonValue | undefined {
    return value === undefined ? undefined : (value as Prisma.InputJsonValue);
  }
}
