import { Injectable } from '@nestjs/common';
import { BehaviorRecordType, BehaviorSeverity, Prisma } from '@prisma/client';
import { withSoftDeleted } from '../../../common/context/request-context';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { BehaviorCategoryUsage } from '../domain/behavior-category-domain';

const BEHAVIOR_CATEGORY_ARGS =
  Prisma.validator<Prisma.BehaviorCategoryDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      code: true,
      nameEn: true,
      nameAr: true,
      descriptionEn: true,
      descriptionAr: true,
      type: true,
      defaultSeverity: true,
      defaultPoints: true,
      isActive: true,
      sortOrder: true,
      createdById: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
    },
  });

export type BehaviorCategoryRecord = Prisma.BehaviorCategoryGetPayload<
  typeof BEHAVIOR_CATEGORY_ARGS
>;

export interface ListBehaviorCategoriesFilters {
  type?: BehaviorRecordType;
  severity?: BehaviorSeverity;
  isActive?: boolean;
  search?: string;
  includeDeleted?: boolean;
  limit?: number;
  offset?: number;
}

export interface CreateBehaviorCategoryInput {
  schoolId: string;
  category: Omit<Prisma.BehaviorCategoryUncheckedCreateInput, 'schoolId'>;
}

export interface UpdateBehaviorCategoryInput {
  schoolId: string;
  categoryId: string;
  data: Prisma.BehaviorCategoryUncheckedUpdateManyInput;
}

@Injectable()
export class BehaviorCategoriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async listCategories(filters: ListBehaviorCategoriesFilters): Promise<{
    items: BehaviorCategoryRecord[];
    total: number;
  }> {
    const where = this.buildListWhere(filters);
    const query = async () => {
      const [items, total] = await Promise.all([
        this.scopedPrisma.behaviorCategory.findMany({
          where,
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
          ...(filters.limit !== undefined ? { take: filters.limit } : {}),
          ...(filters.offset !== undefined ? { skip: filters.offset } : {}),
          ...BEHAVIOR_CATEGORY_ARGS,
        }),
        this.scopedPrisma.behaviorCategory.count({ where }),
      ]);

      return { items, total };
    };

    return filters.includeDeleted ? withSoftDeleted(query) : query();
  }

  findCategoryById(
    categoryId: string,
    options?: { includeDeleted?: boolean },
  ): Promise<BehaviorCategoryRecord | null> {
    const query = () =>
      this.scopedPrisma.behaviorCategory.findFirst({
        where: { id: categoryId },
        ...BEHAVIOR_CATEGORY_ARGS,
      });

    return options?.includeDeleted ? withSoftDeleted(query) : query();
  }

  findCategoryByCode(
    code: string,
    options?: { includeDeleted?: boolean },
  ): Promise<BehaviorCategoryRecord | null> {
    const query = () =>
      this.scopedPrisma.behaviorCategory.findFirst({
        where: { code },
        ...BEHAVIOR_CATEGORY_ARGS,
      });

    return options?.includeDeleted ? withSoftDeleted(query) : query();
  }

  async createCategory(
    input: CreateBehaviorCategoryInput,
  ): Promise<BehaviorCategoryRecord> {
    return this.prisma.$transaction(async (tx) => {
      const category = await tx.behaviorCategory.create({
        data: {
          ...input.category,
          schoolId: input.schoolId,
        },
        select: { id: true },
      });

      return this.findCategoryInTransaction(tx, input.schoolId, category.id);
    });
  }

  async updateCategory(
    input: UpdateBehaviorCategoryInput,
  ): Promise<BehaviorCategoryRecord> {
    return this.prisma.$transaction(async (tx) => {
      if (Object.keys(input.data).length > 0) {
        await tx.behaviorCategory.updateMany({
          where: {
            id: input.categoryId,
            schoolId: input.schoolId,
            deletedAt: null,
          },
          data: input.data,
        });
      }

      return this.findCategoryInTransaction(
        tx,
        input.schoolId,
        input.categoryId,
      );
    });
  }

  async softDeleteCategory(params: {
    schoolId: string;
    categoryId: string;
  }): Promise<BehaviorCategoryRecord> {
    return this.prisma.$transaction(async (tx) => {
      await tx.behaviorCategory.updateMany({
        where: {
          id: params.categoryId,
          schoolId: params.schoolId,
          deletedAt: null,
        },
        data: { deletedAt: new Date() },
      });

      return this.findCategoryInTransaction(
        tx,
        params.schoolId,
        params.categoryId,
        { includeDeleted: true },
      );
    });
  }

  countCategoryUsage(categoryId: string): Promise<BehaviorCategoryUsage> {
    return withSoftDeleted(async () => {
      const [recordsCount, pointLedgerEntriesCount] = await Promise.all([
        this.scopedPrisma.behaviorRecord.count({
          where: { categoryId },
        }),
        this.scopedPrisma.behaviorPointLedger.count({
          where: { categoryId },
        }),
      ]);

      return { recordsCount, pointLedgerEntriesCount };
    });
  }

  private buildListWhere(
    filters: ListBehaviorCategoriesFilters,
  ): Prisma.BehaviorCategoryWhereInput {
    const and: Prisma.BehaviorCategoryWhereInput[] = [];
    const search = filters.search?.trim();

    if (search) {
      and.push({
        OR: [
          { code: { contains: search, mode: 'insensitive' } },
          { nameEn: { contains: search, mode: 'insensitive' } },
          { nameAr: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    return {
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.severity ? { defaultSeverity: filters.severity } : {}),
      ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
      ...(and.length > 0 ? { AND: and } : {}),
    };
  }

  private async findCategoryInTransaction(
    tx: Prisma.TransactionClient,
    schoolId: string,
    categoryId: string,
    options?: { includeDeleted?: boolean },
  ): Promise<BehaviorCategoryRecord> {
    const category = await tx.behaviorCategory.findFirst({
      where: {
        id: categoryId,
        schoolId,
        ...(options?.includeDeleted ? {} : { deletedAt: null }),
      },
      ...BEHAVIOR_CATEGORY_ARGS,
    });

    if (!category) {
      throw new Error('Behavior category mutation result was not found');
    }

    return category;
  }
}
