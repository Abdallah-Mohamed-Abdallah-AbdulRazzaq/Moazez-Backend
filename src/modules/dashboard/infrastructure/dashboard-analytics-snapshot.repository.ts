import { Injectable } from '@nestjs/common';
import {
  AttendanceSessionStatus,
  CommunicationReportStatus,
  GradeAnswerCorrectionStatus,
  GradeSubmissionStatus,
  Prisma,
  SchoolEmailConnectionStatus,
  SchoolLoginSettingsStatus,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DashboardScope } from '../dashboard-context';
import { DashboardAnalyticsComputedSnapshotChartKey } from '../domain/dashboard-analytics-catalog';
import { DashboardAnalyticsQueryContext } from '../domain/dashboard-analytics-query';
import { dashboardCivilDateToPrismaDate } from '../domain/dashboard-time-context';

@Injectable()
export class DashboardAnalyticsSnapshotRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async loadChartValue(
    _scope: DashboardScope,
    chartKey: DashboardAnalyticsComputedSnapshotChartKey,
    context: DashboardAnalyticsQueryContext,
  ): Promise<number> {
    switch (chartKey) {
      case 'attendance.pending_sessions':
        return this.scopedPrisma.attendanceSession.count({
          where: {
            status: AttendanceSessionStatus.DRAFT,
            date: dashboardCivilDateToPrismaDate(context.endCivilDate),
            ...hierarchyWhere(context),
          },
        });

      case 'grades.pending_submission_reviews':
        return this.scopedPrisma.gradeSubmission.count({
          where: {
            status: GradeSubmissionStatus.SUBMITTED,
            assessment: {
              is: gradeAssessmentHierarchyWhere(context),
            },
          },
        });

      case 'grades.pending_answer_reviews':
        return this.scopedPrisma.gradeSubmissionAnswer.count({
          where: {
            correctionStatus: GradeAnswerCorrectionStatus.PENDING,
            assessment: {
              is: gradeAssessmentHierarchyWhere(context),
            },
          },
        });

      case 'communication.moderation_queue':
        return this.scopedPrisma.communicationMessageReport.count({
          where: {
            status: {
              in: [
                CommunicationReportStatus.OPEN,
                CommunicationReportStatus.IN_REVIEW,
              ],
            },
          },
        });

      case 'settings.email_connection_readiness': {
        const connection =
          await this.scopedPrisma.schoolEmailConnection.findFirst({
            where: {
              status: {
                in: [
                  SchoolEmailConnectionStatus.ACTIVE,
                  SchoolEmailConnectionStatus.VERIFIED,
                ],
              },
            },
            select: { id: true },
          });
        return connection ? 100 : 0;
      }

      case 'settings.login_identity_readiness': {
        const settings = await this.scopedPrisma.schoolLoginSettings.findFirst({
          where: { status: SchoolLoginSettingsStatus.ACTIVE },
          select: { id: true },
        });
        return settings ? 100 : 0;
      }
    }
  }
}

interface DashboardAnalyticsHierarchyWhere {
  academicYearId?: string;
  termId?: string;
  gradeId?: string;
  sectionId?: string;
  classroomId?: string;
}

function hierarchyWhere(
  context: DashboardAnalyticsQueryContext,
): DashboardAnalyticsHierarchyWhere {
  const hierarchy = context.hierarchy;
  return {
    ...(hierarchy.academicYearId
      ? { academicYearId: hierarchy.academicYearId }
      : {}),
    ...(hierarchy.termId ? { termId: hierarchy.termId } : {}),
    ...(hierarchy.gradeId ? { gradeId: hierarchy.gradeId } : {}),
    ...(hierarchy.sectionId ? { sectionId: hierarchy.sectionId } : {}),
    ...(hierarchy.classroomId ? { classroomId: hierarchy.classroomId } : {}),
  };
}

function gradeAssessmentHierarchyWhere(
  context: DashboardAnalyticsQueryContext,
): Prisma.GradeAssessmentWhereInput {
  return hierarchyWhere(context);
}
