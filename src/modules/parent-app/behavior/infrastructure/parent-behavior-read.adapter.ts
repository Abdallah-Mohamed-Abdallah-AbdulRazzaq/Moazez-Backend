import { Injectable } from '@nestjs/common';
import {
  AttendanceSessionStatus,
  AttendanceStatus,
  BehaviorPointLedgerEntryType,
  BehaviorRecordStatus,
  BehaviorRecordType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { ParentAppAccessibleChild } from '../../shared/parent-app.types';
import type {
  ParentBehaviorQueryDto,
  ParentBehaviorRecordType,
} from '../dto/parent-behavior.dto';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const PARENT_BEHAVIOR_RECORD_ARGS =
  Prisma.validator<Prisma.BehaviorRecordDefaultArgs>()({
    select: {
      id: true,
      type: true,
      status: true,
      titleEn: true,
      titleAr: true,
      noteEn: true,
      noteAr: true,
      points: true,
      occurredAt: true,
      category: {
        select: {
          id: true,
          code: true,
          nameEn: true,
          nameAr: true,
          type: true,
        },
      },
    },
  });

export type ParentBehaviorRecordReadModel = Prisma.BehaviorRecordGetPayload<
  typeof PARENT_BEHAVIOR_RECORD_ARGS
>;

export interface ParentBehaviorAttendanceSummaryReadModel {
  attendanceCount: number;
  absenceCount: number;
  latenessCount: number;
  dateText: string;
}

export interface ParentBehaviorPointSummaryReadModel {
  positiveCount: number;
  negativeCount: number;
  positivePoints: number;
  negativePoints: number;
  totalBehaviorPoints: number;
}

export interface ParentBehaviorSummaryReadModel
  extends
    ParentBehaviorAttendanceSummaryReadModel,
    ParentBehaviorPointSummaryReadModel {}

export interface ParentBehaviorListReadModel {
  child: ParentAppAccessibleChild;
  records: ParentBehaviorRecordReadModel[];
  summary: ParentBehaviorSummaryReadModel;
  page: number;
  limit: number;
  total: number;
}

export interface ParentBehaviorRecordDetailReadModel {
  child: ParentAppAccessibleChild;
  record: ParentBehaviorRecordReadModel;
}

@Injectable()
export class ParentBehaviorReadAdapter {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async listVisibleBehaviorRecords(params: {
    child: ParentAppAccessibleChild;
    query?: ParentBehaviorQueryDto;
  }): Promise<ParentBehaviorListReadModel> {
    const page = resolvePage(params.query?.page);
    const limit = resolveLimit(params.query?.limit, DEFAULT_LIMIT);
    const where = buildBehaviorRecordWhere(params);

    const [records, total, summary] = await Promise.all([
      this.scopedPrisma.behaviorRecord.findMany({
        where,
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
        take: limit,
        skip: (page - 1) * limit,
        ...PARENT_BEHAVIOR_RECORD_ARGS,
      }),
      this.scopedPrisma.behaviorRecord.count({ where }),
      this.getBehaviorSummary(params),
    ]);

    return {
      child: params.child,
      records,
      summary,
      page,
      limit,
      total,
    };
  }

  async getBehaviorSummary(params: {
    child: ParentAppAccessibleChild;
    query?: Pick<
      ParentBehaviorQueryDto,
      'type' | 'status' | 'occurredFrom' | 'occurredTo'
    >;
  }): Promise<ParentBehaviorSummaryReadModel> {
    const where = buildBehaviorRecordWhere(params);
    const [recordGroups, ledgerTotal, attendanceSummary] = await Promise.all([
      this.scopedPrisma.behaviorRecord.groupBy({
        by: ['type'],
        where,
        _count: { _all: true },
        _sum: { points: true },
      }),
      this.scopedPrisma.behaviorPointLedger.aggregate({
        where: buildBehaviorPointLedgerWhere(params),
        _sum: { amount: true },
      }),
      this.getAttendanceSummary(params),
    ]);

    const positive = recordGroups.find(
      (group) => group.type === BehaviorRecordType.POSITIVE,
    );
    const negative = recordGroups.find(
      (group) => group.type === BehaviorRecordType.NEGATIVE,
    );
    const positivePoints = positive?._sum.points ?? 0;
    const negativePoints = negative?._sum.points ?? 0;

    return {
      ...attendanceSummary,
      positiveCount: positive?._count._all ?? 0,
      negativeCount: negative?._count._all ?? 0,
      positivePoints,
      negativePoints,
      totalBehaviorPoints:
        ledgerTotal._sum.amount ?? positivePoints + negativePoints,
    };
  }

  async findVisibleBehaviorRecord(params: {
    child: ParentAppAccessibleChild;
    recordId: string;
  }): Promise<ParentBehaviorRecordDetailReadModel | null> {
    const record = await this.scopedPrisma.behaviorRecord.findFirst({
      where: {
        ...buildBehaviorRecordWhere({ child: params.child }),
        id: params.recordId,
      },
      ...PARENT_BEHAVIOR_RECORD_ARGS,
    });

    return record ? { child: params.child, record } : null;
  }

  private async getAttendanceSummary(params: {
    child: ParentAppAccessibleChild;
    query?: Pick<ParentBehaviorQueryDto, 'occurredFrom' | 'occurredTo'>;
  }): Promise<ParentBehaviorAttendanceSummaryReadModel> {
    const groups = await this.scopedPrisma.attendanceEntry.groupBy({
      by: ['status'],
      where: buildAttendanceEntryWhere(params),
      _count: { _all: true },
    });
    const counts = new Map(
      groups.map((group) => [group.status, group._count._all]),
    );

    return {
      attendanceCount: counts.get(AttendanceStatus.PRESENT) ?? 0,
      absenceCount: counts.get(AttendanceStatus.ABSENT) ?? 0,
      latenessCount: counts.get(AttendanceStatus.LATE) ?? 0,
      dateText: buildDateText(params.query),
    };
  }
}

function buildBehaviorRecordWhere(params: {
  child: ParentAppAccessibleChild;
  query?: Pick<
    ParentBehaviorQueryDto,
    'type' | 'status' | 'occurredFrom' | 'occurredTo'
  >;
}): Prisma.BehaviorRecordWhereInput {
  const and: Prisma.BehaviorRecordWhereInput[] = [];
  const occurredAt = buildDateRange(params.query);

  if (occurredAt) {
    and.push({ occurredAt });
  }

  return {
    studentId: params.child.studentId,
    enrollmentId: params.child.enrollmentId,
    academicYearId: params.child.academicYearId,
    status: BehaviorRecordStatus.APPROVED,
    ...(params.query?.type
      ? { type: toCoreBehaviorType(params.query.type) }
      : {}),
    ...(params.child.termId
      ? { OR: [{ termId: params.child.termId }, { termId: null }] }
      : {}),
    ...(and.length > 0 ? { AND: and } : {}),
  };
}

function buildBehaviorPointLedgerWhere(params: {
  child: ParentAppAccessibleChild;
  query?: Pick<
    ParentBehaviorQueryDto,
    'type' | 'status' | 'occurredFrom' | 'occurredTo'
  >;
}): Prisma.BehaviorPointLedgerWhereInput {
  const occurredAt = buildDateRange(params.query);

  return {
    studentId: params.child.studentId,
    enrollmentId: params.child.enrollmentId,
    academicYearId: params.child.academicYearId,
    entryType: {
      in: [
        BehaviorPointLedgerEntryType.AWARD,
        BehaviorPointLedgerEntryType.PENALTY,
        BehaviorPointLedgerEntryType.REVERSAL,
      ],
    },
    ...(params.child.termId
      ? { OR: [{ termId: params.child.termId }, { termId: null }] }
      : {}),
    ...(occurredAt ? { occurredAt } : {}),
    record: {
      status: BehaviorRecordStatus.APPROVED,
      deletedAt: null,
      ...(params.query?.type
        ? { type: toCoreBehaviorType(params.query.type) }
        : {}),
    },
  };
}

function buildAttendanceEntryWhere(params: {
  child: ParentAppAccessibleChild;
  query?: Pick<ParentBehaviorQueryDto, 'occurredFrom' | 'occurredTo'>;
}): Prisma.AttendanceEntryWhereInput {
  const date = buildDateRange(params.query);

  return {
    studentId: params.child.studentId,
    enrollmentId: params.child.enrollmentId,
    session: {
      academicYearId: params.child.academicYearId,
      ...(params.child.termId ? { termId: params.child.termId } : {}),
      status: AttendanceSessionStatus.SUBMITTED,
      deletedAt: null,
      ...(date ? { date } : {}),
    },
  };
}

function buildDateRange(
  query?: Pick<ParentBehaviorQueryDto, 'occurredFrom' | 'occurredTo'>,
): Prisma.DateTimeFilter | null {
  if (!query?.occurredFrom && !query?.occurredTo) return null;

  return {
    ...(query.occurredFrom ? { gte: new Date(query.occurredFrom) } : {}),
    ...(query.occurredTo ? { lte: new Date(query.occurredTo) } : {}),
  };
}

function buildDateText(
  query?: Pick<ParentBehaviorQueryDto, 'occurredFrom' | 'occurredTo'>,
): string {
  if (query?.occurredFrom && query.occurredTo) {
    return `${query.occurredFrom}..${query.occurredTo}`;
  }
  if (query?.occurredFrom) return `from ${query.occurredFrom}`;
  if (query?.occurredTo) return `until ${query.occurredTo}`;
  return 'current_term';
}

function toCoreBehaviorType(
  type: ParentBehaviorRecordType,
): BehaviorRecordType {
  switch (type) {
    case 'positive':
      return BehaviorRecordType.POSITIVE;
    case 'negative':
      return BehaviorRecordType.NEGATIVE;
  }
}

function resolveLimit(limit: number | undefined, defaultLimit: number): number {
  if (!limit || Number.isNaN(limit)) return defaultLimit;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}

function resolvePage(page?: number): number {
  if (!page || Number.isNaN(page)) return 1;
  return Math.max(Math.trunc(page), 1);
}
