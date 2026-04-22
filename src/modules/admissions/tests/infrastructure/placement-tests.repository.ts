import { Injectable } from '@nestjs/common';
import { PlacementTestStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const PLACEMENT_TEST_RECORD_ARGS =
  Prisma.validator<Prisma.PlacementTestDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      applicationId: true,
      subjectId: true,
      type: true,
      scheduledAt: true,
      score: true,
      result: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      application: {
        select: {
          id: true,
          studentName: true,
          status: true,
        },
      },
      subject: {
        select: {
          id: true,
          nameAr: true,
          nameEn: true,
        },
      },
    },
  });

export type PlacementTestRecord = Prisma.PlacementTestGetPayload<
  typeof PLACEMENT_TEST_RECORD_ARGS
>;

@Injectable()
export class PlacementTestsRepository {
  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  constructor(private readonly prisma: PrismaService) {}

  async listPlacementTests(params: {
    search?: string;
    status?: PlacementTestStatus;
    type?: string;
    dateFrom?: Date;
    dateTo?: Date;
    page: number;
    limit: number;
  }): Promise<{ items: PlacementTestRecord[]; total: number }> {
    const where = this.buildWhere(params);
    const skip = (params.page - 1) * params.limit;

    const [items, total] = await Promise.all([
      this.scopedPrisma.placementTest.findMany({
        where,
        orderBy: [
          { scheduledAt: 'desc' },
          { createdAt: 'desc' },
        ],
        skip,
        take: params.limit,
        ...PLACEMENT_TEST_RECORD_ARGS,
      }),
      this.scopedPrisma.placementTest.count({ where }),
    ]);

    return { items, total };
  }

  findPlacementTestById(
    placementTestId: string,
  ): Promise<PlacementTestRecord | null> {
    return this.scopedPrisma.placementTest.findFirst({
      where: { id: placementTestId },
      ...PLACEMENT_TEST_RECORD_ARGS,
    });
  }

  findSubjectById(
    subjectId: string,
  ): Promise<{ id: string; nameAr: string; nameEn: string } | null> {
    return this.scopedPrisma.subject.findFirst({
      where: { id: subjectId },
      select: {
        id: true,
        nameAr: true,
        nameEn: true,
      },
    });
  }

  findConflictingScheduledTest(params: {
    applicationId: string;
    type: string;
    subjectId?: string | null;
  }): Promise<{ id: string } | null> {
    return this.scopedPrisma.placementTest.findFirst({
      where: {
        applicationId: params.applicationId,
        type: params.type,
        subjectId: params.subjectId ?? null,
        status: {
          in: [PlacementTestStatus.SCHEDULED, PlacementTestStatus.RESCHEDULED],
        },
      },
      select: { id: true },
    });
  }

  createPlacementTest(
    data: Prisma.PlacementTestUncheckedCreateInput,
  ): Promise<PlacementTestRecord> {
    return this.prisma.placementTest.create({
      data,
      ...PLACEMENT_TEST_RECORD_ARGS,
    });
  }

  async updatePlacementTest(
    placementTestId: string,
    data: Prisma.PlacementTestUncheckedUpdateInput,
  ): Promise<PlacementTestRecord | null> {
    const result = await this.scopedPrisma.placementTest.updateMany({
      where: { id: placementTestId },
      data,
    });

    if (result.count === 0) {
      return null;
    }

    return this.findPlacementTestById(placementTestId);
  }

  private buildWhere(params: {
    search?: string;
    status?: PlacementTestStatus;
    type?: string;
    dateFrom?: Date;
    dateTo?: Date;
  }): Prisma.PlacementTestWhereInput {
    const search = params.search?.trim();
    const type = params.type?.trim();

    return {
      ...(params.status ? { status: params.status } : {}),
      ...(type
        ? {
            type: {
              equals: type,
              mode: Prisma.QueryMode.insensitive,
            },
          }
        : {}),
      ...(params.dateFrom || params.dateTo
        ? {
            scheduledAt: {
              ...(params.dateFrom ? { gte: params.dateFrom } : {}),
              ...(params.dateTo ? { lte: params.dateTo } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            application: {
              studentName: {
                contains: search,
                mode: Prisma.QueryMode.insensitive,
              },
            },
          }
        : {}),
    };
  }
}
