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
import type { StudentAppContext } from '../../shared/student-app.types';
import type {
  StudentBehaviorQueryDto,
  StudentBehaviorRecordType,
} from '../dto/student-behavior.dto';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const STUDENT_BEHAVIOR_RECORD_ARGS =
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

export type StudentBehaviorRecordReadModel = Prisma.BehaviorRecordGetPayload<
  typeof STUDENT_BEHAVIOR_RECORD_ARGS
>;

export interface StudentBehaviorAttendanceSummaryReadModel {
  attendanceCount: number;
  absenceCount: number;
  latenessCount: number;
  dateText: string;
}

export interface StudentBehaviorPointSummaryReadModel {
  positiveCount: number;
  negativeCount: number;
  positivePoints: number;
  negativePoints: number;
  totalBehaviorPoints: number;
}

export interface StudentBehaviorSummaryReadModel
  extends
    StudentBehaviorAttendanceSummaryReadModel,
    StudentBehaviorPointSummaryReadModel {}

export interface StudentBehaviorListReadModel {
  records: StudentBehaviorRecordReadModel[];
  summary: StudentBehaviorSummaryReadModel;
  page: number;
  limit: number;
  total: number;
}

@Injectable()
export class StudentBehaviorReadAdapter {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async listVisibleBehaviorRecords(params: {
    context: StudentAppContext;
    query?: StudentBehaviorQueryDto;
  }): Promise<StudentBehaviorListReadModel> {
    const page = resolvePage(params.query?.page);
    const limit = resolveLimit(params.query?.limit, DEFAULT_LIMIT);
    const where = buildBehaviorRecordWhere(params);

    const [records, total, summary] = await Promise.all([
      this.scopedPrisma.behaviorRecord.findMany({
        where,
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
        take: limit,
        skip: (page - 1) * limit,
        ...STUDENT_BEHAVIOR_RECORD_ARGS,
      }),
      this.scopedPrisma.behaviorRecord.count({ where }),
      this.getBehaviorSummary(params),
    ]);

    return {
      records,
      summary,
      page,
      limit,
      total,
    };
  }

  async getBehaviorSummary(params: {
    context: StudentAppContext;
    query?: Pick<
      StudentBehaviorQueryDto,
      'type' | 'status' | 'occurredFrom' | 'occurredTo'
    >;
  }): Promise<StudentBehaviorSummaryReadModel> {
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

  findVisibleBehaviorRecord(params: {
    context: StudentAppContext;
    recordId: string;
  }): Promise<StudentBehaviorRecordReadModel | null> {
    return this.scopedPrisma.behaviorRecord.findFirst({
      where: {
        ...buildBehaviorRecordWhere({ context: params.context }),
        id: params.recordId,
      },
      ...STUDENT_BEHAVIOR_RECORD_ARGS,
    });
  }

  private async getAttendanceSummary(params: {
    context: StudentAppContext;
    query?: Pick<StudentBehaviorQueryDto, 'occurredFrom' | 'occurredTo'>;
  }): Promise<StudentBehaviorAttendanceSummaryReadModel> {
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
  context: StudentAppContext;
  query?: Pick<
    StudentBehaviorQueryDto,
    'type' | 'status' | 'occurredFrom' | 'occurredTo'
  >;
}): Prisma.BehaviorRecordWhereInput {
  const and: Prisma.BehaviorRecordWhereInput[] = [];
  const occurredAt = buildDateRange(params.query);

  if (occurredAt) {
    and.push({ occurredAt });
  }

  return {
    studentId: params.context.studentId,
    academicYearId: params.context.academicYearId,
    status: BehaviorRecordStatus.APPROVED,
    ...(params.query?.type
      ? { type: toCoreBehaviorType(params.query.type) }
      : {}),
    ...(params.context.termId
      ? { OR: [{ termId: params.context.termId }, { termId: null }] }
      : {}),
    ...(and.length > 0 ? { AND: and } : {}),
  };
}

function buildBehaviorPointLedgerWhere(params: {
  context: StudentAppContext;
  query?: Pick<
    StudentBehaviorQueryDto,
    'type' | 'status' | 'occurredFrom' | 'occurredTo'
  >;
}): Prisma.BehaviorPointLedgerWhereInput {
  const occurredAt = buildDateRange(params.query);

  return {
    studentId: params.context.studentId,
    academicYearId: params.context.academicYearId,
    entryType: {
      in: [
        BehaviorPointLedgerEntryType.AWARD,
        BehaviorPointLedgerEntryType.PENALTY,
        BehaviorPointLedgerEntryType.REVERSAL,
      ],
    },
    ...(params.context.termId
      ? { OR: [{ termId: params.context.termId }, { termId: null }] }
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
  context: StudentAppContext;
  query?: Pick<StudentBehaviorQueryDto, 'occurredFrom' | 'occurredTo'>;
}): Prisma.AttendanceEntryWhereInput {
  const date = buildDateRange(params.query);

  return {
    studentId: params.context.studentId,
    enrollmentId: params.context.enrollmentId,
    session: {
      academicYearId: params.context.academicYearId,
      ...(params.context.termId ? { termId: params.context.termId } : {}),
      status: AttendanceSessionStatus.SUBMITTED,
      deletedAt: null,
      ...(date ? { date } : {}),
    },
  };
}

function buildDateRange(
  query?: Pick<StudentBehaviorQueryDto, 'occurredFrom' | 'occurredTo'>,
): Prisma.DateTimeFilter | null {
  if (!query?.occurredFrom && !query?.occurredTo) return null;

  return {
    ...(query.occurredFrom ? { gte: new Date(query.occurredFrom) } : {}),
    ...(query.occurredTo ? { lte: new Date(query.occurredTo) } : {}),
  };
}

function buildDateText(
  query?: Pick<StudentBehaviorQueryDto, 'occurredFrom' | 'occurredTo'>,
): string {
  if (query?.occurredFrom && query.occurredTo) {
    return `${query.occurredFrom}..${query.occurredTo}`;
  }
  if (query?.occurredFrom) return `from ${query.occurredFrom}`;
  if (query?.occurredTo) return `until ${query.occurredTo}`;
  return 'current_term';
}

function toCoreBehaviorType(
  type: StudentBehaviorRecordType,
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
