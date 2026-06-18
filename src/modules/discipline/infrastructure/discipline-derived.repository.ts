import {
  AttendanceSessionStatus,
  AttendanceStatus,
  BehaviorPointLedgerEntryType,
  BehaviorRecordType,
  BehaviorRecordStatus,
  BehaviorSeverity,
  Prisma,
} from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import {
  DisciplineDerivedQueryDto,
  DisciplineItemType,
  DisciplineSeverity,
  DisciplineSourceType,
  DisciplineStatus,
} from '../dto/discipline-derived.dto';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const ATTENDANCE_INCIDENT_STATUSES = [
  AttendanceStatus.ABSENT,
  AttendanceStatus.LATE,
  AttendanceStatus.EARLY_LEAVE,
  AttendanceStatus.EXCUSED,
] as const;

const DISCIPLINE_ATTENDANCE_ARGS =
  Prisma.validator<Prisma.AttendanceEntryDefaultArgs>()({
    select: {
      id: true,
      status: true,
      lateMinutes: true,
      earlyLeaveMinutes: true,
      excuseReason: true,
      session: {
        select: {
          date: true,
          status: true,
          deletedAt: true,
          periodLabelAr: true,
          periodLabelEn: true,
        },
      },
    },
  });

const DISCIPLINE_BEHAVIOR_ARGS =
  Prisma.validator<Prisma.BehaviorRecordDefaultArgs>()({
    select: {
      id: true,
      type: true,
      severity: true,
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

export type DisciplineAttendanceIncidentRecord =
  Prisma.AttendanceEntryGetPayload<typeof DISCIPLINE_ATTENDANCE_ARGS>;
export type DisciplineBehaviorRecord = Prisma.BehaviorRecordGetPayload<
  typeof DISCIPLINE_BEHAVIOR_ARGS
>;

export interface DisciplineSubjectScope {
  studentId: string;
  enrollmentId: string;
  academicYearId: string;
  termId: string | null;
}

export interface DisciplineTimelineReadCategory {
  id: string;
  code: string;
  nameAr: string | null;
  nameEn: string | null;
  type: 'positive' | 'negative' | null;
}

export interface DisciplineTimelineReadAttendance {
  status: 'absent' | 'late' | 'early_leave' | 'excused';
  lateMinutes: number | null;
  earlyLeaveMinutes: number | null;
  excuseReason: string | null;
}

export interface DisciplineTimelineReadItem {
  id: string;
  sourceType: DisciplineSourceType;
  sourceId: string;
  itemType: DisciplineItemType;
  occurredAt: Date;
  title: string;
  description: string | null;
  severity: DisciplineSeverity | null;
  pointsDelta: number;
  status: DisciplineStatus;
  category: DisciplineTimelineReadCategory | null;
  attendance: DisciplineTimelineReadAttendance | null;
}

export interface DisciplineSummaryReadModel {
  totalIncidents: number;
  attendanceIncidentCount: number;
  absenceCount: number;
  lateCount: number;
  earlyLeaveCount: number;
  excusedCount: number;
  positiveCount: number;
  negativeCount: number;
  behaviorPoints: number;
  period: string;
  dateText: string;
}

export interface DisciplineTimelineListReadModel {
  items: DisciplineTimelineReadItem[];
  summary: DisciplineSummaryReadModel;
  page: number;
  limit: number;
  total: number;
}

@Injectable()
export class DisciplineDerivedRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async listTimeline(params: {
    scope: DisciplineSubjectScope;
    query?: DisciplineDerivedQueryDto;
  }): Promise<DisciplineTimelineListReadModel> {
    const page = resolvePage(params.query?.page);
    const limit = resolveLimit(params.query?.limit);
    const items = await this.loadTimelineItems(params);
    const total = items.length;
    const start = (page - 1) * limit;

    return {
      items: items.slice(start, start + limit),
      summary: summarizeDisciplineItems(items, params.query),
      page,
      limit,
      total,
    };
  }

  async getSummary(params: {
    scope: DisciplineSubjectScope;
    query?: DisciplineDerivedQueryDto;
  }): Promise<DisciplineSummaryReadModel> {
    return summarizeDisciplineItems(await this.loadTimelineItems(params), params.query);
  }

  private async loadTimelineItems(params: {
    scope: DisciplineSubjectScope;
    query?: DisciplineDerivedQueryDto;
  }): Promise<DisciplineTimelineReadItem[]> {
    const [attendanceRecords, behaviorRecords] = await Promise.all([
      shouldLoadSource(params.query, 'attendance')
        ? this.listAttendanceIncidents(params)
        : Promise.resolve([]),
      shouldLoadSource(params.query, 'behavior')
        ? this.listApprovedBehaviorRecords(params)
        : Promise.resolve([]),
    ]);
    const pointDeltas = await this.loadBehaviorPointDeltas({
      scope: params.scope,
      records: behaviorRecords,
    });
    const items = [
      ...attendanceRecords.map(presentAttendanceIncident),
      ...behaviorRecords.map((record) =>
        presentBehaviorRecord(record, pointDeltas.get(record.id)),
      ),
    ];

    return items.sort(compareTimelineItems);
  }

  private listAttendanceIncidents(params: {
    scope: DisciplineSubjectScope;
    query?: DisciplineDerivedQueryDto;
  }): Promise<DisciplineAttendanceIncidentRecord[]> {
    const statuses = resolveAttendanceStatuses(params.query);
    if (statuses.length === 0) return Promise.resolve([]);
    const date = buildDateRange(params.query);

    return this.scopedPrisma.attendanceEntry.findMany({
      ...DISCIPLINE_ATTENDANCE_ARGS,
      where: {
        studentId: params.scope.studentId,
        enrollmentId: params.scope.enrollmentId,
        status: { in: statuses },
        session: {
          academicYearId: params.scope.academicYearId,
          ...(params.scope.termId ? { termId: params.scope.termId } : {}),
          status: AttendanceSessionStatus.SUBMITTED,
          deletedAt: null,
          ...(date ? { date } : {}),
        },
      },
      orderBy: [
        { session: { date: 'desc' } },
        { id: 'asc' },
      ],
    });
  }

  private listApprovedBehaviorRecords(params: {
    scope: DisciplineSubjectScope;
    query?: DisciplineDerivedQueryDto;
  }): Promise<DisciplineBehaviorRecord[]> {
    const types = resolveBehaviorTypes(params.query);
    if (types.length === 0) return Promise.resolve([]);
    const occurredAt = buildDateRange(params.query);

    return this.scopedPrisma.behaviorRecord.findMany({
      ...DISCIPLINE_BEHAVIOR_ARGS,
      where: {
        studentId: params.scope.studentId,
        enrollmentId: params.scope.enrollmentId,
        academicYearId: params.scope.academicYearId,
        status: BehaviorRecordStatus.APPROVED,
        deletedAt: null,
        type: { in: types },
        ...(params.scope.termId
          ? { OR: [{ termId: params.scope.termId }, { termId: null }] }
          : {}),
        ...(occurredAt ? { occurredAt } : {}),
      },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
    });
  }

  private async loadBehaviorPointDeltas(params: {
    scope: DisciplineSubjectScope;
    records: DisciplineBehaviorRecord[];
  }): Promise<Map<string, number>> {
    if (params.records.length === 0) return new Map();

    const groups = await this.scopedPrisma.behaviorPointLedger.groupBy({
      by: ['recordId'],
      where: {
        studentId: params.scope.studentId,
        enrollmentId: params.scope.enrollmentId,
        academicYearId: params.scope.academicYearId,
        recordId: { in: params.records.map((record) => record.id) },
        entryType: {
          in: [
            BehaviorPointLedgerEntryType.AWARD,
            BehaviorPointLedgerEntryType.PENALTY,
            BehaviorPointLedgerEntryType.REVERSAL,
          ],
        },
        record: {
          status: BehaviorRecordStatus.APPROVED,
          deletedAt: null,
        },
      },
      _sum: { amount: true },
    });

    return new Map(
      groups.map((group) => [group.recordId, group._sum.amount ?? 0]),
    );
  }
}

function shouldLoadSource(
  query: DisciplineDerivedQueryDto | undefined,
  sourceType: DisciplineSourceType,
): boolean {
  return !query?.sourceType || query.sourceType === sourceType;
}

function resolveRequestedItemType(
  query: DisciplineDerivedQueryDto | undefined,
): DisciplineItemType | undefined {
  return query?.itemType ?? query?.type;
}

function resolveAttendanceStatuses(
  query: DisciplineDerivedQueryDto | undefined,
): AttendanceStatus[] {
  const itemType = resolveRequestedItemType(query);
  if (!itemType) return [...ATTENDANCE_INCIDENT_STATUSES];

  switch (itemType) {
    case 'absence':
      return [AttendanceStatus.ABSENT];
    case 'lateness':
      return [AttendanceStatus.LATE];
    case 'early_leave':
      return [AttendanceStatus.EARLY_LEAVE];
    case 'excused':
      return [AttendanceStatus.EXCUSED];
    case 'positive':
    case 'negative':
      return [];
  }
}

function resolveBehaviorTypes(
  query: DisciplineDerivedQueryDto | undefined,
): BehaviorRecordType[] {
  const itemType = resolveRequestedItemType(query);
  if (!itemType) return [BehaviorRecordType.POSITIVE, BehaviorRecordType.NEGATIVE];

  switch (itemType) {
    case 'positive':
      return [BehaviorRecordType.POSITIVE];
    case 'negative':
      return [BehaviorRecordType.NEGATIVE];
    case 'absence':
    case 'lateness':
    case 'early_leave':
    case 'excused':
      return [];
  }
}

function buildDateRange(
  query: Pick<DisciplineDerivedQueryDto, 'fromDate' | 'toDate'> | undefined,
): { gte?: Date; lte?: Date } | undefined {
  if (!query?.fromDate && !query?.toDate) return undefined;

  return {
    ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
    ...(query.toDate ? { lte: new Date(query.toDate) } : {}),
  };
}

function presentAttendanceIncident(
  record: DisciplineAttendanceIncidentRecord,
): DisciplineTimelineReadItem {
  const status = presentAttendanceStatus(record.status);
  const itemType = presentAttendanceItemType(record.status);

  return {
    id: `attendance:${record.id}`,
    sourceType: 'attendance',
    sourceId: record.id,
    itemType,
    occurredAt: record.session.date,
    title: titleForAttendanceItem(itemType),
    description: descriptionForAttendanceItem(record),
    severity: severityForAttendanceStatus(record.status),
    pointsDelta: 0,
    status: record.status === AttendanceStatus.EXCUSED ? 'excused' : 'submitted',
    category: null,
    attendance: {
      status,
      lateMinutes: record.lateMinutes,
      earlyLeaveMinutes: record.earlyLeaveMinutes,
      excuseReason: record.excuseReason,
    },
  };
}

function presentBehaviorRecord(
  record: DisciplineBehaviorRecord,
  ledgerDelta: number | undefined,
): DisciplineTimelineReadItem {
  const itemType = presentBehaviorItemType(record.type);
  const pointsDelta = ledgerDelta ?? record.points;

  return {
    id: `behavior:${record.id}`,
    sourceType: 'behavior',
    sourceId: record.id,
    itemType,
    occurredAt: record.occurredAt,
    title:
      record.titleEn ??
      record.titleAr ??
      (itemType === 'positive' ? 'Positive behavior' : 'Negative behavior'),
    description: record.noteEn ?? record.noteAr ?? null,
    severity: presentBehaviorSeverity(record.severity),
    pointsDelta,
    status: 'approved',
    category: record.category
      ? {
          id: record.category.id,
          code: record.category.code,
          nameAr: record.category.nameAr,
          nameEn: record.category.nameEn,
          type: presentBehaviorItemType(record.category.type),
        }
      : null,
    attendance: null,
  };
}

function presentAttendanceStatus(
  status: AttendanceStatus,
): DisciplineTimelineReadAttendance['status'] {
  switch (status) {
    case AttendanceStatus.ABSENT:
      return 'absent';
    case AttendanceStatus.LATE:
      return 'late';
    case AttendanceStatus.EARLY_LEAVE:
      return 'early_leave';
    case AttendanceStatus.EXCUSED:
      return 'excused';
    case AttendanceStatus.PRESENT:
    case AttendanceStatus.UNMARKED:
      return 'absent';
  }
}

function presentAttendanceItemType(status: AttendanceStatus): DisciplineItemType {
  switch (status) {
    case AttendanceStatus.ABSENT:
      return 'absence';
    case AttendanceStatus.LATE:
      return 'lateness';
    case AttendanceStatus.EARLY_LEAVE:
      return 'early_leave';
    case AttendanceStatus.EXCUSED:
      return 'excused';
    case AttendanceStatus.PRESENT:
    case AttendanceStatus.UNMARKED:
      return 'absence';
  }
}

function presentBehaviorItemType(
  type: BehaviorRecordType,
): 'positive' | 'negative' {
  return type === BehaviorRecordType.POSITIVE ? 'positive' : 'negative';
}

function presentBehaviorSeverity(
  severity: BehaviorSeverity,
): DisciplineSeverity {
  return String(severity).toLowerCase() as DisciplineSeverity;
}

function severityForAttendanceStatus(
  status: AttendanceStatus,
): DisciplineSeverity {
  switch (status) {
    case AttendanceStatus.ABSENT:
      return 'medium';
    case AttendanceStatus.LATE:
    case AttendanceStatus.EARLY_LEAVE:
      return 'low';
    case AttendanceStatus.EXCUSED:
      return 'info';
    case AttendanceStatus.PRESENT:
    case AttendanceStatus.UNMARKED:
      return 'info';
  }
}

function titleForAttendanceItem(itemType: DisciplineItemType): string {
  switch (itemType) {
    case 'absence':
      return 'Absence';
    case 'lateness':
      return 'Late arrival';
    case 'early_leave':
      return 'Early leave';
    case 'excused':
      return 'Excused attendance incident';
    case 'positive':
      return 'Positive behavior';
    case 'negative':
      return 'Negative behavior';
  }
}

function descriptionForAttendanceItem(
  record: DisciplineAttendanceIncidentRecord,
): string | null {
  switch (record.status) {
    case AttendanceStatus.LATE:
      return record.lateMinutes
        ? `Late by ${record.lateMinutes} minutes`
        : 'Marked late';
    case AttendanceStatus.EARLY_LEAVE:
      return record.earlyLeaveMinutes
        ? `Left early by ${record.earlyLeaveMinutes} minutes`
        : 'Marked early leave';
    case AttendanceStatus.EXCUSED:
      return record.excuseReason ?? 'Excused attendance incident';
    case AttendanceStatus.ABSENT:
      return 'Marked absent';
    case AttendanceStatus.PRESENT:
    case AttendanceStatus.UNMARKED:
      return null;
  }
}

function summarizeDisciplineItems(
  items: DisciplineTimelineReadItem[],
  query: DisciplineDerivedQueryDto | undefined,
): DisciplineSummaryReadModel {
  let absenceCount = 0;
  let lateCount = 0;
  let earlyLeaveCount = 0;
  let excusedCount = 0;
  let positiveCount = 0;
  let negativeCount = 0;
  let behaviorPoints = 0;

  for (const item of items) {
    if (item.itemType === 'absence') absenceCount += 1;
    if (item.itemType === 'lateness') lateCount += 1;
    if (item.itemType === 'early_leave') earlyLeaveCount += 1;
    if (item.itemType === 'excused') excusedCount += 1;
    if (item.itemType === 'positive') positiveCount += 1;
    if (item.itemType === 'negative') negativeCount += 1;
    if (item.sourceType === 'behavior') behaviorPoints += item.pointsDelta;
  }

  const attendanceIncidentCount =
    absenceCount + lateCount + earlyLeaveCount + excusedCount;

  return {
    totalIncidents: attendanceIncidentCount + positiveCount + negativeCount,
    attendanceIncidentCount,
    absenceCount,
    lateCount,
    earlyLeaveCount,
    excusedCount,
    positiveCount,
    negativeCount,
    behaviorPoints,
    period: 'current_term',
    dateText: buildDateText(query),
  };
}

function buildDateText(
  query: Pick<DisciplineDerivedQueryDto, 'fromDate' | 'toDate'> | undefined,
): string {
  if (query?.fromDate && query.toDate) return `${query.fromDate}..${query.toDate}`;
  if (query?.fromDate) return `from ${query.fromDate}`;
  if (query?.toDate) return `until ${query.toDate}`;
  return 'current_term';
}

function compareTimelineItems(
  left: DisciplineTimelineReadItem,
  right: DisciplineTimelineReadItem,
): number {
  const byTime = right.occurredAt.getTime() - left.occurredAt.getTime();
  if (byTime !== 0) return byTime;

  const bySource = left.sourceType.localeCompare(right.sourceType);
  if (bySource !== 0) return bySource;

  return left.sourceId.localeCompare(right.sourceId);
}

function resolveLimit(limit: number | undefined): number {
  if (!limit || Number.isNaN(limit)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}

function resolvePage(page: number | undefined): number {
  if (!page || Number.isNaN(page)) return 1;
  return Math.max(Math.trunc(page), 1);
}
