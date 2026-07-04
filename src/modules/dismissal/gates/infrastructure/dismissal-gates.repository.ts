import { Injectable } from '@nestjs/common';
import {
  DismissalGateOperationalStatus,
  Prisma,
} from '@prisma/client';
import { getRequestContext } from '../../../../common/context/request-context';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const DISMISSAL_GATE_ARGS = Prisma.validator<Prisma.DismissalGateDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    code: true,
    name: true,
    campus: true,
    status: true,
    isActive: true,
    sortOrder: true,
    latitude: true,
    longitude: true,
    waitingZones: true,
    notes: true,
    createdAt: true,
    updatedAt: true,
    deletedAt: true,
  },
});

export type DismissalGateRecord = Prisma.DismissalGateGetPayload<
  typeof DISMISSAL_GATE_ARGS
>;

export interface DismissalGateListFilters {
  status?: DismissalGateOperationalStatus;
  isActive?: boolean;
  q?: string;
}

export interface DismissalGatePagination {
  page?: number;
  limit?: number;
}

export interface DismissalGateSummaryCounts {
  totalCount: number;
  openCount: number;
  busyCount: number;
  closedCount: number;
  maintenanceCount: number;
  activeCount: number;
}

export function isPrismaUniqueConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

@Injectable()
export class DismissalGatesRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  private getCurrentSchoolId(): string {
    const schoolId = getRequestContext()?.activeMembership?.schoolId;
    if (!schoolId) {
      throw new Error('DismissalGatesRepository requires a school scope.');
    }

    return schoolId;
  }

  async listGates(
    filters: DismissalGateListFilters,
    pagination: DismissalGatePagination,
  ): Promise<{ gates: DismissalGateRecord[]; summary: DismissalGateSummaryCounts }> {
    const where = this.buildWhere(filters);
    const shouldCountActive = filters.isActive !== false;
    const activeWhere = { ...where, isActive: true };
    const take = pagination.limit;
    const skip =
      pagination.page && pagination.limit
        ? (pagination.page - 1) * pagination.limit
        : undefined;

    const [gates, totalCount, statusCounts, activeCount] = await Promise.all([
      this.scopedPrisma.dismissalGate.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { code: 'asc' }],
        skip,
        take,
        ...DISMISSAL_GATE_ARGS,
      }),
      this.scopedPrisma.dismissalGate.count({ where }),
      this.scopedPrisma.dismissalGate.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
      shouldCountActive
        ? this.scopedPrisma.dismissalGate.count({ where: activeWhere })
        : Promise.resolve(0),
    ]);

    return {
      gates,
      summary: {
        totalCount,
        openCount: this.countStatus(
          statusCounts,
          DismissalGateOperationalStatus.OPEN,
        ),
        busyCount: this.countStatus(
          statusCounts,
          DismissalGateOperationalStatus.BUSY,
        ),
        closedCount: this.countStatus(
          statusCounts,
          DismissalGateOperationalStatus.CLOSED,
        ),
        maintenanceCount: this.countStatus(
          statusCounts,
          DismissalGateOperationalStatus.MAINTENANCE,
        ),
        activeCount,
      },
    };
  }

  findGateById(gateId: string): Promise<DismissalGateRecord | null> {
    return this.scopedPrisma.dismissalGate.findFirst({
      where: { id: gateId },
      ...DISMISSAL_GATE_ARGS,
    });
  }

  findGateByCode(code: string): Promise<DismissalGateRecord | null> {
    return this.scopedPrisma.dismissalGate.findFirst({
      where: { code },
      ...DISMISSAL_GATE_ARGS,
    });
  }

  createGate(data: Prisma.DismissalGateUncheckedCreateInput): Promise<DismissalGateRecord> {
    return this.prisma.dismissalGate.create({
      data,
      ...DISMISSAL_GATE_ARGS,
    });
  }

  updateGate(
    gateId: string,
    data: Prisma.DismissalGateUncheckedUpdateInput,
  ): Promise<DismissalGateRecord> {
    return this.prisma.dismissalGate.update({
      where: {
        id_schoolId: {
          id: gateId,
          schoolId: this.getCurrentSchoolId(),
        },
      },
      data,
      ...DISMISSAL_GATE_ARGS,
    });
  }

  private buildWhere(
    filters: DismissalGateListFilters,
  ): Prisma.DismissalGateWhereInput {
    return {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.isActive === undefined ? {} : { isActive: filters.isActive }),
      ...(filters.q
        ? {
            OR: [
              { code: { contains: filters.q, mode: 'insensitive' } },
              { name: { contains: filters.q, mode: 'insensitive' } },
              { campus: { contains: filters.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  private countStatus(
    counts: Array<{
      status: DismissalGateOperationalStatus;
      _count: { _all: number };
    }>,
    status: DismissalGateOperationalStatus,
  ): number {
    return counts.find((entry) => entry.status === status)?._count._all ?? 0;
  }
}
