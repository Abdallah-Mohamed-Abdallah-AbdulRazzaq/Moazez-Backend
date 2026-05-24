import { Injectable } from '@nestjs/common';
import {
  HomeworkAssignmentMode,
  HomeworkAssignmentStatus,
  HomeworkTargetMode,
  HomeworkTargetStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const DASHBOARD_ASSIGNMENT_SELECT = {
  id: true,
  teacherSubjectAllocationId: true,
  title: true,
  description: true,
  mode: true,
  status: true,
  targetMode: true,
  dueAt: true,
  targets: {
    select: {
      status: true,
    },
  },
} satisfies Prisma.HomeworkAssignmentSelect;

const ACADEMIC_YEAR_REFERENCE_SELECT = {
  id: true,
  nameAr: true,
  nameEn: true,
} satisfies Prisma.AcademicYearSelect;

export type TeacherHomeworkDashboardAssignmentRecord =
  Prisma.HomeworkAssignmentGetPayload<{
    select: typeof DASHBOARD_ASSIGNMENT_SELECT;
  }>;

export type TeacherHomeworkAcademicYearReferenceRecord =
  Prisma.AcademicYearGetPayload<{
    select: typeof ACADEMIC_YEAR_REFERENCE_SELECT;
  }>;

@Injectable()
export class TeacherHomeworksReadAdapter {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async findOwnedAssignmentBoundary(params: {
    teacherUserId: string;
    classId: string;
    homeworkId: string;
  }): Promise<{ id: string } | null> {
    return this.scopedPrisma.homeworkAssignment.findFirst({
      where: {
        id: params.homeworkId,
        teacherUserId: params.teacherUserId,
        teacherSubjectAllocationId: params.classId,
        deletedAt: null,
      },
      select: { id: true },
    });
  }

  listDashboardAssignments(params: {
    teacherUserId: string;
    allocationIds: string[];
  }): Promise<TeacherHomeworkDashboardAssignmentRecord[]> {
    if (params.allocationIds.length === 0) {
      return Promise.resolve([]);
    }

    return this.scopedPrisma.homeworkAssignment.findMany({
      where: {
        teacherUserId: params.teacherUserId,
        teacherSubjectAllocationId: { in: params.allocationIds },
        deletedAt: null,
      },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }],
      select: DASHBOARD_ASSIGNMENT_SELECT,
    });
  }

  listAcademicYearReferences(
    academicYearIds: string[],
  ): Promise<TeacherHomeworkAcademicYearReferenceRecord[]> {
    const ids = [...new Set(academicYearIds.filter(Boolean))];
    if (ids.length === 0) return Promise.resolve([]);

    return this.scopedPrisma.academicYear.findMany({
      where: { id: { in: ids }, deletedAt: null },
      orderBy: [{ startDate: 'desc' }, { id: 'asc' }],
      select: ACADEMIC_YEAR_REFERENCE_SELECT,
    });
  }
}

export function createEmptyTeacherHomeworkTargetCounters(): Record<
  HomeworkTargetStatus,
  number
> {
  return {
    [HomeworkTargetStatus.ASSIGNED]: 0,
    [HomeworkTargetStatus.VIEWED]: 0,
    [HomeworkTargetStatus.SUBMITTED]: 0,
    [HomeworkTargetStatus.LATE]: 0,
    [HomeworkTargetStatus.MISSING]: 0,
    [HomeworkTargetStatus.REVIEWED]: 0,
    [HomeworkTargetStatus.EXCUSED]: 0,
  };
}

export function createEmptyTeacherHomeworkAssignmentCounters(): Record<
  HomeworkAssignmentStatus,
  number
> {
  return {
    [HomeworkAssignmentStatus.DRAFT]: 0,
    [HomeworkAssignmentStatus.PUBLISHED]: 0,
    [HomeworkAssignmentStatus.CLOSED]: 0,
    [HomeworkAssignmentStatus.CANCELLED]: 0,
    [HomeworkAssignmentStatus.ARCHIVED]: 0,
  };
}

export type TeacherHomeworkDashboardMode = HomeworkAssignmentMode;
export type TeacherHomeworkDashboardTargetMode = HomeworkTargetMode;
