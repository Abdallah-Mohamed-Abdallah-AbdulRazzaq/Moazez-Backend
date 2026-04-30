import { Injectable } from '@nestjs/common';
import {
  Prisma,
  RewardCatalogItemStatus,
  RewardCatalogItemType,
  RewardRedemptionStatus,
} from '@prisma/client';
import { withSoftDeleted } from '../../../../common/context/request-context';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const ACADEMIC_YEAR_SUMMARY_SELECT = {
  id: true,
  nameAr: true,
  nameEn: true,
  isActive: true,
} satisfies Prisma.AcademicYearSelect;

const TERM_SUMMARY_SELECT = {
  id: true,
  academicYearId: true,
  nameAr: true,
  nameEn: true,
  isActive: true,
} satisfies Prisma.TermSelect;

const FILE_SUMMARY_SELECT = {
  id: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  visibility: true,
  createdAt: true,
} satisfies Prisma.FileSelect;

const REWARD_CATALOG_ITEM_ARGS =
  Prisma.validator<Prisma.RewardCatalogItemDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      academicYearId: true,
      termId: true,
      titleEn: true,
      titleAr: true,
      descriptionEn: true,
      descriptionAr: true,
      type: true,
      status: true,
      minTotalXp: true,
      stockQuantity: true,
      stockRemaining: true,
      isUnlimited: true,
      imageFileId: true,
      sortOrder: true,
      publishedAt: true,
      publishedById: true,
      archivedAt: true,
      archivedById: true,
      createdById: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
      academicYear: {
        select: ACADEMIC_YEAR_SUMMARY_SELECT,
      },
      term: {
        select: TERM_SUMMARY_SELECT,
      },
      imageFile: {
        select: FILE_SUMMARY_SELECT,
      },
    },
  });

export type RewardCatalogItemRecord = Prisma.RewardCatalogItemGetPayload<
  typeof REWARD_CATALOG_ITEM_ARGS
>;
export type RewardAcademicYearRecord = Prisma.AcademicYearGetPayload<{
  select: typeof ACADEMIC_YEAR_SUMMARY_SELECT;
}>;
export type RewardTermRecord = Prisma.TermGetPayload<{
  select: typeof TERM_SUMMARY_SELECT;
}>;
export type RewardFileRecord = Prisma.FileGetPayload<{
  select: typeof FILE_SUMMARY_SELECT;
}>;

export interface ListRewardCatalogFilters {
  academicYearId?: string;
  termId?: string;
  status?: RewardCatalogItemStatus;
  type?: RewardCatalogItemType;
  search?: string;
  includeArchived?: boolean;
  includeDeleted?: boolean;
  onlyAvailable?: boolean;
  limit?: number;
  offset?: number;
}

export interface CreateRewardCatalogItemInput {
  schoolId: string;
  item: Omit<Prisma.RewardCatalogItemUncheckedCreateInput, 'schoolId'>;
}

export interface UpdateRewardCatalogItemInput {
  schoolId: string;
  rewardId: string;
  data: Prisma.RewardCatalogItemUncheckedUpdateManyInput;
}

@Injectable()
export class RewardCatalogRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async listCatalogItems(filters: ListRewardCatalogFilters): Promise<{
    items: RewardCatalogItemRecord[];
    total: number;
  }> {
    const where = this.buildListWhere(filters);
    const query = async () => {
      const [items, total] = await Promise.all([
        this.scopedPrisma.rewardCatalogItem.findMany({
          where,
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
          ...(filters.limit !== undefined ? { take: filters.limit } : {}),
          ...(filters.offset !== undefined ? { skip: filters.offset } : {}),
          ...REWARD_CATALOG_ITEM_ARGS,
        }),
        this.scopedPrisma.rewardCatalogItem.count({ where }),
      ]);

      return { items, total };
    };

    return filters.includeDeleted ? withSoftDeleted(query) : query();
  }

  findCatalogItemById(
    rewardId: string,
    options?: { includeDeleted?: boolean },
  ): Promise<RewardCatalogItemRecord | null> {
    const query = () =>
      this.scopedPrisma.rewardCatalogItem.findFirst({
        where: { id: rewardId },
        ...REWARD_CATALOG_ITEM_ARGS,
      });

    return options?.includeDeleted ? withSoftDeleted(query) : query();
  }

  async createCatalogItem(
    input: CreateRewardCatalogItemInput,
  ): Promise<RewardCatalogItemRecord> {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.rewardCatalogItem.create({
        data: {
          ...input.item,
          schoolId: input.schoolId,
        },
        select: { id: true },
      });

      return this.findCatalogItemInTransaction(tx, input.schoolId, item.id);
    });
  }

  async updateCatalogItem(
    input: UpdateRewardCatalogItemInput,
  ): Promise<RewardCatalogItemRecord> {
    return this.prisma.$transaction(async (tx) => {
      if (Object.keys(input.data).length > 0) {
        await tx.rewardCatalogItem.updateMany({
          where: {
            id: input.rewardId,
            schoolId: input.schoolId,
            deletedAt: null,
          },
          data: input.data,
        });
      }

      return this.findCatalogItemInTransaction(
        tx,
        input.schoolId,
        input.rewardId,
      );
    });
  }

  async publishCatalogItem(params: {
    schoolId: string;
    rewardId: string;
    actorId: string;
  }): Promise<RewardCatalogItemRecord> {
    return this.prisma.$transaction(async (tx) => {
      await tx.rewardCatalogItem.updateMany({
        where: {
          id: params.rewardId,
          schoolId: params.schoolId,
          deletedAt: null,
        },
        data: {
          status: RewardCatalogItemStatus.PUBLISHED,
          publishedAt: new Date(),
          publishedById: params.actorId,
        },
      });

      return this.findCatalogItemInTransaction(
        tx,
        params.schoolId,
        params.rewardId,
      );
    });
  }

  async archiveCatalogItem(params: {
    schoolId: string;
    rewardId: string;
    actorId: string;
  }): Promise<RewardCatalogItemRecord> {
    return this.prisma.$transaction(async (tx) => {
      await tx.rewardCatalogItem.updateMany({
        where: {
          id: params.rewardId,
          schoolId: params.schoolId,
          deletedAt: null,
        },
        data: {
          status: RewardCatalogItemStatus.ARCHIVED,
          archivedAt: new Date(),
          archivedById: params.actorId,
        },
      });

      return this.findCatalogItemInTransaction(
        tx,
        params.schoolId,
        params.rewardId,
      );
    });
  }

  findAcademicYear(
    academicYearId: string,
  ): Promise<RewardAcademicYearRecord | null> {
    return this.scopedPrisma.academicYear.findFirst({
      where: { id: academicYearId },
      select: ACADEMIC_YEAR_SUMMARY_SELECT,
    });
  }

  findTerm(termId: string): Promise<RewardTermRecord | null> {
    return this.scopedPrisma.term.findFirst({
      where: { id: termId },
      select: TERM_SUMMARY_SELECT,
    });
  }

  findFile(fileId: string): Promise<RewardFileRecord | null> {
    return this.scopedPrisma.file.findFirst({
      where: { id: fileId },
      select: FILE_SUMMARY_SELECT,
    });
  }

  countOpenRedemptionsForCatalogItem(catalogItemId: string): Promise<number> {
    return this.scopedPrisma.rewardRedemption.count({
      where: {
        catalogItemId,
        status: {
          in: [
            RewardRedemptionStatus.REQUESTED,
            RewardRedemptionStatus.APPROVED,
          ],
        },
      },
    });
  }

  private buildListWhere(
    filters: ListRewardCatalogFilters,
  ): Prisma.RewardCatalogItemWhereInput {
    const and: Prisma.RewardCatalogItemWhereInput[] = [];
    const search = filters.search?.trim();

    if (!filters.status && !filters.includeArchived) {
      and.push({ status: { not: RewardCatalogItemStatus.ARCHIVED } });
    }

    if (filters.onlyAvailable) {
      and.push({
        OR: [{ isUnlimited: true }, { stockRemaining: { gt: 0 } }],
      });
    }

    if (search) {
      const searchOr: Prisma.RewardCatalogItemWhereInput[] = [
        { titleEn: { contains: search, mode: 'insensitive' } },
        { titleAr: { contains: search, mode: 'insensitive' } },
        { descriptionEn: { contains: search, mode: 'insensitive' } },
        { descriptionAr: { contains: search, mode: 'insensitive' } },
      ];

      if (isUuid(search)) searchOr.unshift({ id: search });
      and.push({ OR: searchOr });
    }

    return {
      ...(filters.academicYearId
        ? { academicYearId: filters.academicYearId }
        : {}),
      ...(filters.termId ? { termId: filters.termId } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      status: filters.onlyAvailable
        ? RewardCatalogItemStatus.PUBLISHED
        : filters.status,
      ...(and.length > 0 ? { AND: and } : {}),
    };
  }

  private async findCatalogItemInTransaction(
    tx: Prisma.TransactionClient,
    schoolId: string,
    rewardId: string,
  ): Promise<RewardCatalogItemRecord> {
    const item = await tx.rewardCatalogItem.findFirst({
      where: {
        id: rewardId,
        schoolId,
        deletedAt: null,
      },
      ...REWARD_CATALOG_ITEM_ARGS,
    });

    if (!item) {
      throw new Error('Reward catalog item mutation result was not found');
    }

    return item;
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(
    value,
  );
}
