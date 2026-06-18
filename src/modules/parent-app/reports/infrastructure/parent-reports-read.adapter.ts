import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { DisciplineDerivedReadService } from '../../../discipline/application/discipline-derived-read.service';
import type { DisciplineSummaryReadModel } from '../../../discipline/infrastructure/discipline-derived.repository';
import type { ParentAppAccessibleChild } from '../../shared/parent-app.types';
import {
  ParentProgressReadAdapter,
  type ParentAcademicProgressReadModel,
  type ParentBehaviorProgressReadModel,
  type ParentXpProgressReadModel,
} from '../../progress/infrastructure/parent-progress-read.adapter';

const PARENT_REPORT_CHILD_ARGS =
  Prisma.validator<Prisma.EnrollmentDefaultArgs>()({
    select: {
      id: true,
      studentId: true,
      academicYearId: true,
      termId: true,
      student: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
      academicYear: {
        select: {
          id: true,
          nameAr: true,
          nameEn: true,
        },
      },
      term: {
        select: {
          id: true,
          nameAr: true,
          nameEn: true,
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
                },
              },
            },
          },
        },
      },
    },
  });

export type ParentReportChildRecord = Prisma.EnrollmentGetPayload<
  typeof PARENT_REPORT_CHILD_ARGS
>;

export interface ParentReportsSummaryReadModel {
  child: ParentAppAccessibleChild;
  profile: ParentReportChildRecord;
  academic: ParentAcademicProgressReadModel;
  behavior: ParentBehaviorProgressReadModel;
  discipline: DisciplineSummaryReadModel;
  xp: ParentXpProgressReadModel;
}

export interface ParentReportsListReadModel {
  summary: ParentReportsSummaryReadModel;
}

@Injectable()
export class ParentReportsReadAdapter {
  constructor(
    private readonly prisma: PrismaService,
    private readonly progressReadAdapter: ParentProgressReadAdapter,
    private readonly disciplineReadService: DisciplineDerivedReadService,
  ) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async listReports(
    child: ParentAppAccessibleChild,
  ): Promise<ParentReportsListReadModel> {
    return {
      summary: await this.getReportsSummary(child),
    };
  }

  async getReportsSummary(
    child: ParentAppAccessibleChild,
  ): Promise<ParentReportsSummaryReadModel> {
    const [profile, academic, behavior, discipline, xp] = await Promise.all([
      this.findChildReportProfile(child),
      this.progressReadAdapter.getAcademicProgress(child),
      this.progressReadAdapter.getBehaviorProgress(child),
      this.disciplineReadService.getSummary({
        scope: {
          studentId: child.studentId,
          enrollmentId: child.enrollmentId,
          academicYearId: child.academicYearId,
          termId: child.termId,
        },
      }),
      this.progressReadAdapter.getXpProgress(child),
    ]);

    return {
      child,
      profile,
      academic,
      behavior,
      discipline,
      xp,
    };
  }

  private findChildReportProfile(
    child: ParentAppAccessibleChild,
  ): Promise<ParentReportChildRecord> {
    return this.scopedPrisma.enrollment.findFirstOrThrow({
      where: {
        id: child.enrollmentId,
        studentId: child.studentId,
        academicYearId: child.academicYearId,
      },
      ...PARENT_REPORT_CHILD_ARGS,
    });
  }
}
