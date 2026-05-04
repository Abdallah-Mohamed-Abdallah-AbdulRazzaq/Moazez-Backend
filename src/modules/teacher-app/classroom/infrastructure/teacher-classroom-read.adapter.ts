import { Injectable } from '@nestjs/common';
import {
  Prisma,
  StudentEnrollmentStatus,
  StudentStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const DEFAULT_ROSTER_LIMIT = 20;
const MAX_ROSTER_LIMIT = 100;

export interface TeacherClassroomRosterFilters {
  search?: string;
  page?: number;
  limit?: number;
}

export interface TeacherClassroomRosterStudentRecord {
  id: string;
  firstName: string;
  lastName: string;
  status: StudentStatus;
}

export interface TeacherClassroomRosterResult {
  items: TeacherClassroomRosterStudentRecord[];
  page: number;
  limit: number;
  total: number;
}

@Injectable()
export class TeacherClassroomReadAdapter {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  countActiveStudentsInClassroom(classroomId: string): Promise<number> {
    return this.scopedPrisma.enrollment.count({
      where: activeEnrollmentWhere({ classroomId }),
    });
  }

  async listActiveRoster(params: {
    classroomId: string;
    filters?: TeacherClassroomRosterFilters;
  }): Promise<TeacherClassroomRosterResult> {
    const limit = resolveLimit(params.filters?.limit);
    const page = resolvePage(params.filters?.page);
    const where = activeEnrollmentWhere({
      classroomId: params.classroomId,
      search: params.filters?.search,
    });

    const [rows, total] = await Promise.all([
      this.scopedPrisma.enrollment.findMany({
        where,
        select: {
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              status: true,
            },
          },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: limit,
        skip: (page - 1) * limit,
      }),
      this.scopedPrisma.enrollment.count({ where }),
    ]);

    return {
      items: rows.map((row) => row.student),
      page,
      limit,
      total,
    };
  }
}

function activeEnrollmentWhere(params: {
  classroomId: string;
  search?: string;
}): Prisma.EnrollmentWhereInput {
  const studentWhere: Prisma.StudentWhereInput = {
    status: StudentStatus.ACTIVE,
    deletedAt: null,
    ...studentSearchWhere(params.search),
  };

  return {
    classroomId: params.classroomId,
    status: StudentEnrollmentStatus.ACTIVE,
    deletedAt: null,
    student: {
      is: studentWhere,
    },
  };
}

function studentSearchWhere(search?: string): Prisma.StudentWhereInput {
  const normalized = search?.trim();
  if (!normalized) return {};

  const stringFilter = {
    contains: normalized,
    mode: Prisma.QueryMode.insensitive,
  };

  return {
    OR: [{ firstName: stringFilter }, { lastName: stringFilter }],
  };
}

function resolveLimit(limit?: number): number {
  if (!limit || Number.isNaN(limit)) return DEFAULT_ROSTER_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_ROSTER_LIMIT);
}

function resolvePage(page?: number): number {
  if (!page || Number.isNaN(page)) return 1;
  return Math.max(Math.trunc(page), 1);
}
