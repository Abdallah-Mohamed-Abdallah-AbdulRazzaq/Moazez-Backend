import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  BehaviorRecordStatus,
  BehaviorRecordType,
  BehaviorSeverity,
  Prisma,
  StudentEnrollmentStatus,
  UserType,
} from '@prisma/client';
import { withSoftDeleted } from '../../../common/context/request-context';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

const USER_SUMMARY_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  userType: true,
} satisfies Prisma.UserSelect;

const BEHAVIOR_RECORD_ARGS =
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
      cancelledBy: { select: USER_SUMMARY_SELECT },
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

export type BehaviorRecordRecord = Prisma.BehaviorRecordGetPayload<
  typeof BEHAVIOR_RECORD_ARGS
>;
export type BehaviorAcademicYearRecord = Prisma.AcademicYearGetPayload<
  typeof ACADEMIC_YEAR_ARGS
>;
export type BehaviorTermRecord = Prisma.TermGetPayload<typeof TERM_ARGS>;
export type BehaviorStudentRecord = Prisma.StudentGetPayload<
  typeof STUDENT_ARGS
>;
export type BehaviorEnrollmentRecord = Prisma.EnrollmentGetPayload<
  typeof ENROLLMENT_ARGS
>;
export type BehaviorRecordCategoryRecord = Prisma.BehaviorCategoryGetPayload<
  typeof BEHAVIOR_CATEGORY_ARGS
>;

export interface BehaviorRecordAuditInput {
  actorId?: string | null;
  userType?: UserType | null;
  organizationId?: string | null;
  schoolId?: string | null;
  module: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  outcome: AuditOutcome;
  ipAddress?: string | null;
  userAgent?: string | null;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export interface ListBehaviorRecordsFilters {
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
  createdById?: string;
  includeDeleted?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface BehaviorRecordListSummary {
  total: number;
  draft: number;
  submitted: number;
  approved: number;
  rejected: number;
  cancelled: number;
  positive: number;
  negative: number;
}

export interface CreateBehaviorRecordInput {
  schoolId: string;
  data: Omit<Prisma.BehaviorRecordUncheckedCreateInput, 'schoolId'>;
  buildAuditEntry: (record: BehaviorRecordRecord) => BehaviorRecordAuditInput;
}

export interface UpdateBehaviorRecordInput {
  schoolId: string;
  recordId: string;
  data: Prisma.BehaviorRecordUncheckedUpdateManyInput;
  buildAuditEntry: (record: BehaviorRecordRecord) => BehaviorRecordAuditInput;
}

@Injectable()
export class BehaviorRecordsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async listRecords(filters: ListBehaviorRecordsFilters): Promise<{
    items: BehaviorRecordRecord[];
    total: number;
    summary: BehaviorRecordListSummary;
  }> {
    const where = this.buildListWhere(filters);
    const query = async () => {
      const [items, total, statusCounts, typeCounts] = await Promise.all([
        this.scopedPrisma.behaviorRecord.findMany({
          where,
          orderBy: [
            { occurredAt: 'desc' },
            { createdAt: 'desc' },
            { id: 'asc' },
          ],
          ...(filters.limit !== undefined ? { take: filters.limit } : {}),
          ...(filters.offset !== undefined ? { skip: filters.offset } : {}),
          ...BEHAVIOR_RECORD_ARGS,
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
        summary: this.buildListSummary({ total, statusCounts, typeCounts }),
      };
    };

    return filters.includeDeleted ? withSoftDeleted(query) : query();
  }

  findRecordById(
    recordId: string,
    options?: { includeDeleted?: boolean },
  ): Promise<BehaviorRecordRecord | null> {
    const query = () =>
      this.scopedPrisma.behaviorRecord.findFirst({
        where: { id: recordId },
        ...BEHAVIOR_RECORD_ARGS,
      });

    return options?.includeDeleted ? withSoftDeleted(query) : query();
  }

  findAcademicYear(
    academicYearId: string,
  ): Promise<BehaviorAcademicYearRecord | null> {
    return this.scopedPrisma.academicYear.findFirst({
      where: { id: academicYearId },
      ...ACADEMIC_YEAR_ARGS,
    });
  }

  findTerm(termId: string): Promise<BehaviorTermRecord | null> {
    return this.scopedPrisma.term.findFirst({
      where: { id: termId },
      ...TERM_ARGS,
    });
  }

  findStudent(studentId: string): Promise<BehaviorStudentRecord | null> {
    return this.scopedPrisma.student.findFirst({
      where: { id: studentId },
      ...STUDENT_ARGS,
    });
  }

  findEnrollmentById(
    enrollmentId: string,
  ): Promise<BehaviorEnrollmentRecord | null> {
    return this.scopedPrisma.enrollment.findFirst({
      where: { id: enrollmentId },
      ...ENROLLMENT_ARGS,
    });
  }

  findEnrollmentForStudent(params: {
    studentId: string;
    academicYearId: string;
    termId?: string | null;
  }): Promise<BehaviorEnrollmentRecord | null> {
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
    options?: { includeDeleted?: boolean },
  ): Promise<BehaviorRecordCategoryRecord | null> {
    const query = () =>
      this.scopedPrisma.behaviorCategory.findFirst({
        where: { id: categoryId },
        ...BEHAVIOR_CATEGORY_ARGS,
      });

    return options?.includeDeleted ? withSoftDeleted(query) : query();
  }

  async createRecord(
    input: CreateBehaviorRecordInput,
  ): Promise<BehaviorRecordRecord> {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.behaviorRecord.create({
        data: {
          ...input.data,
          schoolId: input.schoolId,
        },
        select: { id: true },
      });
      const record = await this.findRecordInTransaction(
        tx,
        input.schoolId,
        created.id,
      );
      await this.createAuditLogInTransaction(tx, input.buildAuditEntry(record));

      return record;
    });
  }

  async updateRecord(
    input: UpdateBehaviorRecordInput,
  ): Promise<BehaviorRecordRecord> {
    return this.prisma.$transaction(async (tx) => {
      if (Object.keys(input.data).length > 0) {
        await tx.behaviorRecord.updateMany({
          where: {
            id: input.recordId,
            schoolId: input.schoolId,
            deletedAt: null,
          },
          data: input.data,
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

  submitRecord(input: UpdateBehaviorRecordInput): Promise<BehaviorRecordRecord> {
    return this.updateRecord(input);
  }

  cancelRecord(input: UpdateBehaviorRecordInput): Promise<BehaviorRecordRecord> {
    return this.updateRecord(input);
  }

  private buildListWhere(
    filters: ListBehaviorRecordsFilters,
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

    if (search) {
      and.push({
        OR: [
          { titleEn: { contains: search, mode: 'insensitive' } },
          { titleAr: { contains: search, mode: 'insensitive' } },
          { noteEn: { contains: search, mode: 'insensitive' } },
          { noteAr: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    return {
      ...(filters.academicYearId
        ? { academicYearId: filters.academicYearId }
        : {}),
      ...(filters.termId ? { termId: filters.termId } : {}),
      ...(filters.studentId ? { studentId: filters.studentId } : {}),
      ...(filters.enrollmentId ? { enrollmentId: filters.enrollmentId } : {}),
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.severity ? { severity: filters.severity } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.createdById ? { createdById: filters.createdById } : {}),
      ...(and.length > 0 ? { AND: and } : {}),
    };
  }

  private buildListSummary(params: {
    total: number;
    statusCounts: Array<{
      status: BehaviorRecordStatus;
      _count: { _all: number };
    }>;
    typeCounts: Array<{
      type: BehaviorRecordType;
      _count: { _all: number };
    }>;
  }): BehaviorRecordListSummary {
    const statusCount = new Map(
      params.statusCounts.map((item) => [item.status, item._count._all]),
    );
    const typeCount = new Map(
      params.typeCounts.map((item) => [item.type, item._count._all]),
    );

    return {
      total: params.total,
      draft: statusCount.get(BehaviorRecordStatus.DRAFT) ?? 0,
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
  ): Promise<BehaviorRecordRecord> {
    const record = await tx.behaviorRecord.findFirst({
      where: { id: recordId, schoolId, deletedAt: null },
      ...BEHAVIOR_RECORD_ARGS,
    });

    if (!record) {
      throw new Error('Behavior record mutation result was not found');
    }

    return record;
  }

  private createAuditLogInTransaction(
    tx: Prisma.TransactionClient,
    entry: BehaviorRecordAuditInput,
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
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
        before: entry.before
          ? (entry.before as Prisma.InputJsonValue)
          : undefined,
        after: entry.after
          ? (entry.after as Prisma.InputJsonValue)
          : undefined,
      },
    });
  }
}
