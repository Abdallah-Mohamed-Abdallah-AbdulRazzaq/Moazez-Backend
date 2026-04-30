import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  BehaviorPointLedgerEntryType,
  BehaviorRecordStatus,
  BehaviorRecordType,
  BehaviorSeverity,
  Prisma,
  StudentEnrollmentStatus,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { BehaviorRecordInvalidStatusTransitionException } from '../domain/behavior-records-domain';

const USER_SUMMARY_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  userType: true,
} satisfies Prisma.UserSelect;

const BEHAVIOR_POINT_LEDGER_SELECT = {
  id: true,
  schoolId: true,
  academicYearId: true,
  termId: true,
  studentId: true,
  enrollmentId: true,
  recordId: true,
  categoryId: true,
  entryType: true,
  amount: true,
  reasonEn: true,
  reasonAr: true,
  actorId: true,
  occurredAt: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.BehaviorPointLedgerSelect;

const BEHAVIOR_REVIEW_RECORD_ARGS =
  Prisma.validator<Prisma.BehaviorRecordDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      academicYearId: true,
      termId: true,
      studentId: true,
      enrollmentId: true,
      categoryId: true,
      type: true,
      severity: true,
      status: true,
      titleEn: true,
      titleAr: true,
      noteEn: true,
      noteAr: true,
      points: true,
      occurredAt: true,
      createdById: true,
      submittedById: true,
      submittedAt: true,
      reviewedById: true,
      reviewedAt: true,
      cancelledById: true,
      cancelledAt: true,
      reviewNoteEn: true,
      reviewNoteAr: true,
      cancellationReasonEn: true,
      cancellationReasonAr: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
      academicYear: {
        select: {
          id: true,
          nameEn: true,
          nameAr: true,
          startDate: true,
          endDate: true,
          isActive: true,
        },
      },
      term: {
        select: {
          id: true,
          academicYearId: true,
          nameEn: true,
          nameAr: true,
          startDate: true,
          endDate: true,
          isActive: true,
        },
      },
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          status: true,
        },
      },
      enrollment: {
        select: {
          id: true,
          studentId: true,
          academicYearId: true,
          termId: true,
          classroomId: true,
          status: true,
          classroom: {
            select: {
              id: true,
              nameEn: true,
              nameAr: true,
              section: {
                select: {
                  id: true,
                  nameEn: true,
                  nameAr: true,
                  grade: {
                    select: {
                      id: true,
                      nameEn: true,
                      nameAr: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
      category: {
        select: {
          id: true,
          code: true,
          nameEn: true,
          nameAr: true,
          type: true,
          defaultSeverity: true,
          defaultPoints: true,
          isActive: true,
          deletedAt: true,
        },
      },
      createdBy: { select: USER_SUMMARY_SELECT },
      submittedBy: { select: USER_SUMMARY_SELECT },
      reviewedBy: { select: USER_SUMMARY_SELECT },
      pointLedgerEntries: {
        orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
        select: BEHAVIOR_POINT_LEDGER_SELECT,
      },
    },
  });

const ACADEMIC_YEAR_ARGS =
  Prisma.validator<Prisma.AcademicYearDefaultArgs>()({
    select: {
      id: true,
      nameEn: true,
      nameAr: true,
      startDate: true,
      endDate: true,
      isActive: true,
    },
  });

const TERM_ARGS = Prisma.validator<Prisma.TermDefaultArgs>()({
  select: {
    id: true,
    academicYearId: true,
    nameEn: true,
    nameAr: true,
    startDate: true,
    endDate: true,
    isActive: true,
  },
});

const STUDENT_ARGS = Prisma.validator<Prisma.StudentDefaultArgs>()({
  select: {
    id: true,
    firstName: true,
    lastName: true,
    status: true,
  },
});

const ENROLLMENT_ARGS = Prisma.validator<Prisma.EnrollmentDefaultArgs>()({
  select: {
    id: true,
    studentId: true,
    academicYearId: true,
    termId: true,
    classroomId: true,
    status: true,
    enrolledAt: true,
    endedAt: true,
    classroom: {
      select: {
        id: true,
        nameEn: true,
        nameAr: true,
      },
    },
  },
});

const BEHAVIOR_CATEGORY_ARGS =
  Prisma.validator<Prisma.BehaviorCategoryDefaultArgs>()({
    select: {
      id: true,
      code: true,
      nameEn: true,
      nameAr: true,
      type: true,
      defaultSeverity: true,
      defaultPoints: true,
      isActive: true,
      deletedAt: true,
    },
  });

export type BehaviorReviewRecord = Prisma.BehaviorRecordGetPayload<
  typeof BEHAVIOR_REVIEW_RECORD_ARGS
>;
export type BehaviorReviewPointLedgerRecord =
  Prisma.BehaviorPointLedgerGetPayload<{
    select: typeof BEHAVIOR_POINT_LEDGER_SELECT;
  }>;
export type BehaviorReviewAcademicYearRecord = Prisma.AcademicYearGetPayload<
  typeof ACADEMIC_YEAR_ARGS
>;
export type BehaviorReviewTermRecord = Prisma.TermGetPayload<typeof TERM_ARGS>;
export type BehaviorReviewStudentRecord = Prisma.StudentGetPayload<
  typeof STUDENT_ARGS
>;
export type BehaviorReviewEnrollmentRecord = Prisma.EnrollmentGetPayload<
  typeof ENROLLMENT_ARGS
>;
export type BehaviorReviewCategoryRecord = Prisma.BehaviorCategoryGetPayload<
  typeof BEHAVIOR_CATEGORY_ARGS
>;

export interface BehaviorReviewAuditInput {
  actorId?: string | null;
  userType?: UserType | null;
  organizationId?: string | null;
  schoolId?: string | null;
  module: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  outcome: AuditOutcome;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export interface ListBehaviorReviewQueueFilters {
  academicYearId?: string;
  termId?: string;
  studentId?: string;
  enrollmentId?: string;
  categoryId?: string;
  type?: BehaviorRecordType;
  severity?: BehaviorSeverity;
  status?: BehaviorRecordStatus;
  occurredFrom?: Date;
  occurredTo?: Date;
  submittedFrom?: Date;
  submittedTo?: Date;
  createdById?: string;
  includeReviewed?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface BehaviorReviewQueueSummary {
  total: number;
  submitted: number;
  approved: number;
  rejected: number;
  cancelled: number;
  positive: number;
  negative: number;
}

export interface ApproveBehaviorRecordInput {
  schoolId: string;
  recordId: string;
  recordData: Prisma.BehaviorRecordUncheckedUpdateManyInput;
  ledgerData: Omit<Prisma.BehaviorPointLedgerUncheckedCreateInput, 'schoolId'>;
  buildAuditEntry: (
    record: BehaviorReviewRecord,
    ledger: BehaviorReviewPointLedgerRecord,
  ) => BehaviorReviewAuditInput;
}

export interface RejectBehaviorRecordInput {
  schoolId: string;
  recordId: string;
  recordData: Prisma.BehaviorRecordUncheckedUpdateManyInput;
  buildAuditEntry: (record: BehaviorReviewRecord) => BehaviorReviewAuditInput;
}

@Injectable()
export class BehaviorReviewRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async listReviewQueue(filters: ListBehaviorReviewQueueFilters): Promise<{
    items: BehaviorReviewRecord[];
    total: number;
    summary: BehaviorReviewQueueSummary;
  }> {
    const where = this.buildReviewQueueWhere(filters);
    const [items, total, statusCounts, typeCounts] = await Promise.all([
      this.scopedPrisma.behaviorRecord.findMany({
        where,
        orderBy: [
          { submittedAt: { sort: 'asc', nulls: 'last' } },
          { occurredAt: 'desc' },
          { createdAt: 'desc' },
          { id: 'asc' },
        ],
        ...(filters.limit !== undefined ? { take: filters.limit } : {}),
        ...(filters.offset !== undefined ? { skip: filters.offset } : {}),
        ...BEHAVIOR_REVIEW_RECORD_ARGS,
      }),
      this.scopedPrisma.behaviorRecord.count({ where }),
      this.scopedPrisma.behaviorRecord.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
      this.scopedPrisma.behaviorRecord.groupBy({
        by: ['type'],
        where,
        _count: { _all: true },
      }),
    ]);

    return {
      items,
      total,
      summary: this.buildQueueSummary({ total, statusCounts, typeCounts }),
    };
  }

  findReviewRecordById(recordId: string): Promise<BehaviorReviewRecord | null> {
    return this.scopedPrisma.behaviorRecord.findFirst({
      where: { id: recordId },
      ...BEHAVIOR_REVIEW_RECORD_ARGS,
    });
  }

  findAcademicYear(
    academicYearId: string,
  ): Promise<BehaviorReviewAcademicYearRecord | null> {
    return this.scopedPrisma.academicYear.findFirst({
      where: { id: academicYearId },
      ...ACADEMIC_YEAR_ARGS,
    });
  }

  findTerm(termId: string): Promise<BehaviorReviewTermRecord | null> {
    return this.scopedPrisma.term.findFirst({
      where: { id: termId },
      ...TERM_ARGS,
    });
  }

  findStudent(studentId: string): Promise<BehaviorReviewStudentRecord | null> {
    return this.scopedPrisma.student.findFirst({
      where: { id: studentId },
      ...STUDENT_ARGS,
    });
  }

  findEnrollmentById(
    enrollmentId: string,
  ): Promise<BehaviorReviewEnrollmentRecord | null> {
    return this.scopedPrisma.enrollment.findFirst({
      where: { id: enrollmentId },
      ...ENROLLMENT_ARGS,
    });
  }

  findEnrollmentForStudent(params: {
    studentId: string;
    academicYearId: string;
    termId?: string | null;
  }): Promise<BehaviorReviewEnrollmentRecord | null> {
    return this.scopedPrisma.enrollment.findFirst({
      where: {
        studentId: params.studentId,
        academicYearId: params.academicYearId,
        status: StudentEnrollmentStatus.ACTIVE,
        ...(params.termId
          ? { OR: [{ termId: params.termId }, { termId: null }] }
          : {}),
      },
      orderBy: [
        { termId: 'desc' },
        { enrolledAt: 'desc' },
        { createdAt: 'desc' },
        { id: 'asc' },
      ],
      ...ENROLLMENT_ARGS,
    });
  }

  findCategoryById(
    categoryId: string,
  ): Promise<BehaviorReviewCategoryRecord | null> {
    return this.scopedPrisma.behaviorCategory.findFirst({
      where: { id: categoryId },
      ...BEHAVIOR_CATEGORY_ARGS,
    });
  }

  async approveRecordWithPointLedger(
    input: ApproveBehaviorRecordInput,
  ): Promise<{
    record: BehaviorReviewRecord;
    ledger: BehaviorReviewPointLedgerRecord;
  }> {
    return this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.behaviorRecord.updateMany({
        where: {
          id: input.recordId,
          schoolId: input.schoolId,
          status: BehaviorRecordStatus.SUBMITTED,
          deletedAt: null,
        },
        data: input.recordData,
      });

      if (updateResult.count === 0) {
        throw new BehaviorRecordInvalidStatusTransitionException({
          recordId: input.recordId,
          expectedStatus: BehaviorRecordStatus.SUBMITTED,
        });
      }

      const ledger = await tx.behaviorPointLedger.create({
        data: {
          ...input.ledgerData,
          schoolId: input.schoolId,
        },
        select: { id: true },
      });
      const ledgerRecord = await this.findPointLedgerInTransaction(
        tx,
        input.schoolId,
        ledger.id,
      );
      const record = await this.findRecordInTransaction(
        tx,
        input.schoolId,
        input.recordId,
      );

      await this.createAuditLogInTransaction(
        tx,
        input.buildAuditEntry(record, ledgerRecord),
      );

      return { record, ledger: ledgerRecord };
    });
  }

  async rejectRecord(
    input: RejectBehaviorRecordInput,
  ): Promise<BehaviorReviewRecord> {
    return this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.behaviorRecord.updateMany({
        where: {
          id: input.recordId,
          schoolId: input.schoolId,
          status: BehaviorRecordStatus.SUBMITTED,
          deletedAt: null,
        },
        data: input.recordData,
      });

      if (updateResult.count === 0) {
        throw new BehaviorRecordInvalidStatusTransitionException({
          recordId: input.recordId,
          expectedStatus: BehaviorRecordStatus.SUBMITTED,
        });
      }

      const record = await this.findRecordInTransaction(
        tx,
        input.schoolId,
        input.recordId,
      );
      await this.createAuditLogInTransaction(tx, input.buildAuditEntry(record));

      return record;
    });
  }

  private buildReviewQueueWhere(
    filters: ListBehaviorReviewQueueFilters,
  ): Prisma.BehaviorRecordWhereInput {
    const and: Prisma.BehaviorRecordWhereInput[] = [];
    const search = filters.search?.trim();

    if (filters.occurredFrom || filters.occurredTo) {
      and.push({
        occurredAt: {
          ...(filters.occurredFrom ? { gte: filters.occurredFrom } : {}),
          ...(filters.occurredTo ? { lte: filters.occurredTo } : {}),
        },
      });
    }

    if (filters.submittedFrom || filters.submittedTo) {
      and.push({
        submittedAt: {
          ...(filters.submittedFrom ? { gte: filters.submittedFrom } : {}),
          ...(filters.submittedTo ? { lte: filters.submittedTo } : {}),
        },
      });
    }

    if (search) {
      const searchOr: Prisma.BehaviorRecordWhereInput[] = [
        { titleEn: { contains: search, mode: 'insensitive' } },
        { titleAr: { contains: search, mode: 'insensitive' } },
        { noteEn: { contains: search, mode: 'insensitive' } },
        { noteAr: { contains: search, mode: 'insensitive' } },
        { student: { firstName: { contains: search, mode: 'insensitive' } } },
        { student: { lastName: { contains: search, mode: 'insensitive' } } },
      ];

      if (isUuid(search)) {
        searchOr.unshift({ id: search });
      }

      and.push({ OR: searchOr });
    }

    return {
      ...this.buildReviewStatusWhere(filters),
      ...(filters.academicYearId
        ? { academicYearId: filters.academicYearId }
        : {}),
      ...(filters.termId ? { termId: filters.termId } : {}),
      ...(filters.studentId ? { studentId: filters.studentId } : {}),
      ...(filters.enrollmentId ? { enrollmentId: filters.enrollmentId } : {}),
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.severity ? { severity: filters.severity } : {}),
      ...(filters.createdById ? { createdById: filters.createdById } : {}),
      ...(and.length > 0 ? { AND: and } : {}),
    };
  }

  private buildReviewStatusWhere(
    filters: ListBehaviorReviewQueueFilters,
  ): Pick<Prisma.BehaviorRecordWhereInput, 'status'> {
    if (filters.status) {
      return { status: filters.status };
    }

    if (filters.includeReviewed) {
      return {
        status: {
          in: [
            BehaviorRecordStatus.SUBMITTED,
            BehaviorRecordStatus.APPROVED,
            BehaviorRecordStatus.REJECTED,
          ],
        },
      };
    }

    return { status: BehaviorRecordStatus.SUBMITTED };
  }

  private buildQueueSummary(params: {
    total: number;
    statusCounts: Array<{
      status: BehaviorRecordStatus;
      _count: { _all: number };
    }>;
    typeCounts: Array<{
      type: BehaviorRecordType;
      _count: { _all: number };
    }>;
  }): BehaviorReviewQueueSummary {
    const statusCount = new Map(
      params.statusCounts.map((item) => [item.status, item._count._all]),
    );
    const typeCount = new Map(
      params.typeCounts.map((item) => [item.type, item._count._all]),
    );

    return {
      total: params.total,
      submitted: statusCount.get(BehaviorRecordStatus.SUBMITTED) ?? 0,
      approved: statusCount.get(BehaviorRecordStatus.APPROVED) ?? 0,
      rejected: statusCount.get(BehaviorRecordStatus.REJECTED) ?? 0,
      cancelled: statusCount.get(BehaviorRecordStatus.CANCELLED) ?? 0,
      positive: typeCount.get(BehaviorRecordType.POSITIVE) ?? 0,
      negative: typeCount.get(BehaviorRecordType.NEGATIVE) ?? 0,
    };
  }

  private async findRecordInTransaction(
    tx: Prisma.TransactionClient,
    schoolId: string,
    recordId: string,
  ): Promise<BehaviorReviewRecord> {
    const record = await tx.behaviorRecord.findFirst({
      where: { id: recordId, schoolId, deletedAt: null },
      ...BEHAVIOR_REVIEW_RECORD_ARGS,
    });

    if (!record) {
      throw new Error('Behavior review mutation result was not found');
    }

    return record;
  }

  private async findPointLedgerInTransaction(
    tx: Prisma.TransactionClient,
    schoolId: string,
    ledgerId: string,
  ): Promise<BehaviorReviewPointLedgerRecord> {
    const ledger = await tx.behaviorPointLedger.findFirst({
      where: { id: ledgerId, schoolId },
      select: BEHAVIOR_POINT_LEDGER_SELECT,
    });

    if (!ledger) {
      throw new Error('Behavior point ledger mutation result was not found');
    }

    return ledger;
  }

  private createAuditLogInTransaction(
    tx: Prisma.TransactionClient,
    entry: BehaviorReviewAuditInput,
  ): Promise<unknown> {
    return tx.auditLog.create({
      data: {
        actorId: entry.actorId ?? null,
        userType: entry.userType ?? null,
        organizationId: entry.organizationId ?? null,
        schoolId: entry.schoolId ?? null,
        module: entry.module,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId ?? null,
        outcome: entry.outcome,
        before: entry.before
          ? (entry.before as Prisma.InputJsonValue)
          : undefined,
        after: entry.after ? (entry.after as Prisma.InputJsonValue) : undefined,
      },
    });
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(
    value,
  );
}
