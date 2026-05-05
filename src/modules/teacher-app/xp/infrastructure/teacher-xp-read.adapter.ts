import { Injectable } from '@nestjs/common';
import {
  Prisma,
  StudentEnrollmentStatus,
  StudentStatus,
  XpSourceType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { TeacherAppAllocationRecord } from '../../shared/teacher-app.types';

const DEFAULT_XP_HISTORY_LIMIT = 20;
const MAX_XP_HISTORY_LIMIT = 100;

const OWNED_XP_ENROLLMENT_ARGS =
  Prisma.validator<Prisma.EnrollmentDefaultArgs>()({
    select: {
      id: true,
      studentId: true,
      academicYearId: true,
      termId: true,
      classroomId: true,
      status: true,
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          status: true,
        },
      },
      classroom: {
        select: {
          id: true,
          nameAr: true,
          nameEn: true,
          section: {
            select: {
              id: true,
              nameAr: true,
              nameEn: true,
              grade: {
                select: {
                  id: true,
                  nameAr: true,
                  nameEn: true,
                  stage: {
                    select: {
                      id: true,
                      nameAr: true,
                      nameEn: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

const TEACHER_XP_LEDGER_ARGS = Prisma.validator<Prisma.XpLedgerDefaultArgs>()({
  select: {
    id: true,
    academicYearId: true,
    termId: true,
    studentId: true,
    enrollmentId: true,
    assignmentId: true,
    sourceType: true,
    sourceId: true,
    amount: true,
    reason: true,
    reasonAr: true,
    occurredAt: true,
    createdAt: true,
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
      },
    },
  },
});

export type TeacherXpOwnedEnrollmentRecord = Prisma.EnrollmentGetPayload<
  typeof OWNED_XP_ENROLLMENT_ARGS
>;

export type TeacherXpLedgerRecord = Prisma.XpLedgerGetPayload<
  typeof TEACHER_XP_LEDGER_ARGS
>;

export interface TeacherXpLedgerFilters {
  studentId?: string;
  sourceType?: XpSourceType;
  search?: string;
  page?: number;
  limit?: number;
}

export interface TeacherXpLedgerResult {
  items: TeacherXpLedgerRecord[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class TeacherXpReadAdapter {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  listOwnedEnrollments(params: {
    allocations: TeacherAppAllocationRecord[];
    studentId?: string;
  }): Promise<TeacherXpOwnedEnrollmentRecord[]> {
    const where = this.buildOwnedEnrollmentWhere(params);
    if (isEmptyIdSetWhere(where)) return Promise.resolve([]);

    return this.scopedPrisma.enrollment.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      ...OWNED_XP_ENROLLMENT_ARGS,
    });
  }

  async studentBelongsToAllocations(params: {
    allocations: TeacherAppAllocationRecord[];
    studentId: string;
  }): Promise<boolean> {
    const where = this.buildOwnedEnrollmentWhere(params);
    if (isEmptyIdSetWhere(where)) return false;

    const count = await this.scopedPrisma.enrollment.count({ where });
    return count > 0;
  }

  async listLedger(params: {
    ownedEnrollments: TeacherXpOwnedEnrollmentRecord[];
    filters?: TeacherXpLedgerFilters;
  }): Promise<TeacherXpLedgerResult> {
    const limit = resolveLimit(params.filters?.limit);
    const page = resolvePage(params.filters?.page);
    const where = this.buildOwnedLedgerWhere({
      ownedEnrollments: params.ownedEnrollments,
      filters: params.filters,
    });

    const [items, total] = await Promise.all([
      this.scopedPrisma.xpLedger.findMany({
        where,
        orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
        take: limit,
        skip: (page - 1) * limit,
        ...TEACHER_XP_LEDGER_ARGS,
      }),
      this.scopedPrisma.xpLedger.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  listAllLedger(params: {
    ownedEnrollments: TeacherXpOwnedEnrollmentRecord[];
    filters?: Pick<TeacherXpLedgerFilters, 'studentId' | 'sourceType'>;
  }): Promise<TeacherXpLedgerRecord[]> {
    const where = this.buildOwnedLedgerWhere(params);

    return this.scopedPrisma.xpLedger.findMany({
      where,
      orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
      ...TEACHER_XP_LEDGER_ARGS,
    });
  }

  private buildOwnedEnrollmentWhere(params: {
    allocations: TeacherAppAllocationRecord[];
    studentId?: string;
  }): Prisma.EnrollmentWhereInput {
    const scopes = params.allocations.map((allocation) => ({
      academicYearId: allocation.term?.academicYearId,
      termId: allocation.termId,
      classroomId: allocation.classroomId,
      status: StudentEnrollmentStatus.ACTIVE,
      deletedAt: null,
      student: {
        is: {
          status: StudentStatus.ACTIVE,
          deletedAt: null,
        },
      },
    }));

    if (scopes.length === 0) {
      return { id: { in: [] } };
    }

    return {
      ...(params.studentId ? { studentId: params.studentId } : {}),
      OR: scopes,
    };
  }

  private buildOwnedLedgerWhere(params: {
    ownedEnrollments: TeacherXpOwnedEnrollmentRecord[];
    filters?: Pick<
      TeacherXpLedgerFilters,
      'studentId' | 'sourceType' | 'search'
    >;
  }): Prisma.XpLedgerWhereInput {
    const studentIds = unique(
      params.ownedEnrollments.map((enrollment) => enrollment.studentId),
    );
    const enrollmentIds = unique(
      params.ownedEnrollments.map((enrollment) => enrollment.id),
    );

    if (studentIds.length === 0) {
      return { id: { in: [] } };
    }

    const ownership: Prisma.XpLedgerWhereInput[] = [];
    if (enrollmentIds.length > 0) {
      ownership.push({ enrollmentId: { in: enrollmentIds } });
    }
    ownership.push(
      ...params.ownedEnrollments.filter(hasLedgerTerm).map((enrollment) => ({
        enrollmentId: null,
        studentId: enrollment.studentId,
        academicYearId: enrollment.academicYearId,
        termId: enrollment.termId,
      })),
    );

    const and: Prisma.XpLedgerWhereInput[] = [
      { OR: ownership },
      this.buildLedgerSearchWhere(params.filters?.search),
    ].filter((condition) => Object.keys(condition).length > 0);

    return {
      studentId: {
        in: params.filters?.studentId ? [params.filters.studentId] : studentIds,
      },
      ...(params.filters?.sourceType
        ? { sourceType: params.filters.sourceType }
        : {}),
      ...(and.length > 0 ? { AND: and } : {}),
    };
  }

  private buildLedgerSearchWhere(search?: string): Prisma.XpLedgerWhereInput {
    const normalized = search?.trim();
    if (!normalized) return {};

    const stringFilter = {
      contains: normalized,
      mode: Prisma.QueryMode.insensitive,
    };

    return {
      OR: [
        { sourceId: stringFilter },
        { reason: stringFilter },
        { reasonAr: stringFilter },
        { student: { firstName: stringFilter } },
        { student: { lastName: stringFilter } },
      ],
    };
  }
}

function isEmptyIdSetWhere(where: Prisma.EnrollmentWhereInput): boolean {
  return (
    typeof where.id === 'object' &&
    where.id !== null &&
    'in' in where.id &&
    Array.isArray(where.id.in) &&
    where.id.in.length === 0
  );
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function hasLedgerTerm(
  enrollment: TeacherXpOwnedEnrollmentRecord,
): enrollment is TeacherXpOwnedEnrollmentRecord & { termId: string } {
  return typeof enrollment.termId === 'string' && enrollment.termId.length > 0;
}

function resolveLimit(limit?: number): number {
  if (!limit || Number.isNaN(limit)) return DEFAULT_XP_HISTORY_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_XP_HISTORY_LIMIT);
}

function resolvePage(page?: number): number {
  if (!page || Number.isNaN(page)) return 1;
  return Math.max(Math.trunc(page), 1);
}
