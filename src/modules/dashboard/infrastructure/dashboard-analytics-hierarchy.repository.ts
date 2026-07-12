import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DashboardScope } from '../dashboard-context';

export interface DashboardAnalyticsAcademicYearReference {
  id: string;
  startDate: Date;
  endDate: Date;
}

export interface DashboardAnalyticsTermReference {
  id: string;
  academicYearId: string;
  startDate: Date;
  endDate: Date;
}

export interface DashboardAnalyticsGradeReference {
  id: string;
}

export interface DashboardAnalyticsSectionReference {
  id: string;
  gradeId: string;
}

export interface DashboardAnalyticsClassroomReference {
  id: string;
  sectionId: string;
  gradeId: string;
}

@Injectable()
export class DashboardAnalyticsHierarchyRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  findAcademicYearById(
    _scope: DashboardScope,
    academicYearId: string,
  ): Promise<DashboardAnalyticsAcademicYearReference | null> {
    return this.scopedPrisma.academicYear.findFirst({
      where: { id: academicYearId },
      select: { id: true, startDate: true, endDate: true },
    });
  }

  findActiveAcademicYear(
    _scope: DashboardScope,
  ): Promise<DashboardAnalyticsAcademicYearReference | null> {
    return this.scopedPrisma.academicYear.findFirst({
      where: { isActive: true },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      select: { id: true, startDate: true, endDate: true },
    });
  }

  findTermById(
    _scope: DashboardScope,
    termId: string,
  ): Promise<DashboardAnalyticsTermReference | null> {
    return this.scopedPrisma.term.findFirst({
      where: {
        id: termId,
        academicYear: { is: { deletedAt: null } },
      },
      select: {
        id: true,
        academicYearId: true,
        startDate: true,
        endDate: true,
      },
    });
  }

  findActiveTerm(
    _scope: DashboardScope,
    academicYearId?: string,
  ): Promise<DashboardAnalyticsTermReference | null> {
    return this.scopedPrisma.term.findFirst({
      where: {
        isActive: true,
        ...(academicYearId ? { academicYearId } : {}),
        academicYear: { is: { deletedAt: null } },
      },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        academicYearId: true,
        startDate: true,
        endDate: true,
      },
    });
  }

  findGradeById(
    _scope: DashboardScope,
    gradeId: string,
  ): Promise<DashboardAnalyticsGradeReference | null> {
    return this.scopedPrisma.grade.findFirst({
      where: { id: gradeId },
      select: { id: true },
    });
  }

  findSectionById(
    _scope: DashboardScope,
    sectionId: string,
  ): Promise<DashboardAnalyticsSectionReference | null> {
    return this.scopedPrisma.section.findFirst({
      where: {
        id: sectionId,
        grade: { is: { deletedAt: null } },
      },
      select: { id: true, gradeId: true },
    });
  }

  findClassroomById(
    _scope: DashboardScope,
    classroomId: string,
  ): Promise<DashboardAnalyticsClassroomReference | null> {
    return this.scopedPrisma.classroom
      .findFirst({
        where: {
          id: classroomId,
          section: {
            is: {
              deletedAt: null,
              grade: { is: { deletedAt: null } },
            },
          },
        },
        select: {
          id: true,
          sectionId: true,
          section: { select: { gradeId: true } },
        },
      })
      .then((classroom) =>
        classroom
          ? {
              id: classroom.id,
              sectionId: classroom.sectionId,
              gradeId: classroom.section.gradeId,
            }
          : null,
      );
  }
}
