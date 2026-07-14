import { Injectable } from '@nestjs/common';
import {
  AttendanceMode,
  AttendanceSessionStatus,
  GradeAssessmentApprovalStatus,
  GradeAssessmentType,
  HomeworkAssignmentStatus,
  InterviewStatus,
  PlacementTestStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DashboardScope } from '../dashboard-context';

const dashboardPlannerAttendanceSessionSelect = {
  id: true,
  date: true,
  mode: true,
  periodLabelAr: true,
  periodLabelEn: true,
  status: true,
} satisfies Prisma.AttendanceSessionSelect;

const dashboardPlannerPlacementTestSelect = {
  id: true,
  type: true,
  scheduledAt: true,
  status: true,
} satisfies Prisma.PlacementTestSelect;

const dashboardPlannerInterviewSelect = {
  id: true,
  scheduledAt: true,
  status: true,
} satisfies Prisma.InterviewSelect;

const dashboardPlannerHomeworkDueSelect = {
  id: true,
  title: true,
  dueAt: true,
  status: true,
} satisfies Prisma.HomeworkAssignmentSelect;

const dashboardPlannerGradeAssessmentSelect = {
  id: true,
  titleEn: true,
  titleAr: true,
  type: true,
  date: true,
  approvalStatus: true,
} satisfies Prisma.GradeAssessmentSelect;

export interface DashboardPlannerItemsWindow {
  from: Date;
  toExclusive: Date;
  allDayFrom: Date;
  allDayToExclusive: Date;
  limit: number;
}

export type DashboardPlannerItemSource =
  | 'attendance_session'
  | 'placement_test'
  | 'interview'
  | 'homework_due'
  | 'grade_assessment';

interface DashboardPlannerItemSnapshotBase {
  source: DashboardPlannerItemSource;
  id: string;
  sortInstant: Date;
}

export interface DashboardPlannerAttendanceSessionSnapshot extends DashboardPlannerItemSnapshotBase {
  source: 'attendance_session';
  date: Date;
  mode: AttendanceMode;
  periodLabelAr: string | null;
  periodLabelEn: string | null;
  status: AttendanceSessionStatus;
}

export interface DashboardPlannerPlacementTestSnapshot extends DashboardPlannerItemSnapshotBase {
  source: 'placement_test';
  type: string;
  scheduledAt: Date;
  status: PlacementTestStatus;
}

export interface DashboardPlannerInterviewSnapshot extends DashboardPlannerItemSnapshotBase {
  source: 'interview';
  scheduledAt: Date;
  status: InterviewStatus;
}

export interface DashboardPlannerHomeworkDueSnapshot extends DashboardPlannerItemSnapshotBase {
  source: 'homework_due';
  title: string;
  dueAt: Date;
  status: HomeworkAssignmentStatus;
}

export interface DashboardPlannerGradeAssessmentSnapshot extends DashboardPlannerItemSnapshotBase {
  source: 'grade_assessment';
  titleEn: string | null;
  titleAr: string | null;
  type: GradeAssessmentType;
  date: Date;
  approvalStatus: GradeAssessmentApprovalStatus;
}

export type DashboardPlannerItemSnapshot =
  | DashboardPlannerAttendanceSessionSnapshot
  | DashboardPlannerPlacementTestSnapshot
  | DashboardPlannerInterviewSnapshot
  | DashboardPlannerHomeworkDueSnapshot
  | DashboardPlannerGradeAssessmentSnapshot;

const SOURCE_RANK: Record<DashboardPlannerItemSource, number> = {
  attendance_session: 1,
  grade_assessment: 2,
  placement_test: 3,
  interview: 4,
  homework_due: 5,
};

@Injectable()
export class DashboardPlannerItemsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async listSchoolItems(
    scope: DashboardScope,
    window: DashboardPlannerItemsWindow,
  ): Promise<DashboardPlannerItemSnapshot[]> {
    void scope;
    const [attendanceSessions, placementTests, interviews, homework, grades] =
      await Promise.all([
        this.scopedPrisma.attendanceSession.findMany({
          where: {
            date: {
              gte: window.allDayFrom,
              lt: window.allDayToExclusive,
            },
          },
          select: dashboardPlannerAttendanceSessionSelect,
          orderBy: [
            { date: 'asc' },
            { periodKey: 'asc' },
            { createdAt: 'asc' },
            { id: 'asc' },
          ],
          take: window.limit,
        }),
        this.scopedPrisma.placementTest.findMany({
          where: {
            status: {
              in: [
                PlacementTestStatus.SCHEDULED,
                PlacementTestStatus.RESCHEDULED,
              ],
            },
            scheduledAt: { gte: window.from, lt: window.toExclusive },
            application: { is: { deletedAt: null } },
          },
          select: dashboardPlannerPlacementTestSelect,
          orderBy: [
            { scheduledAt: 'asc' },
            { createdAt: 'asc' },
            { id: 'asc' },
          ],
          take: window.limit,
        }),
        this.scopedPrisma.interview.findMany({
          where: {
            status: {
              in: [InterviewStatus.SCHEDULED, InterviewStatus.RESCHEDULED],
            },
            scheduledAt: { gte: window.from, lt: window.toExclusive },
            application: { is: { deletedAt: null } },
          },
          select: dashboardPlannerInterviewSelect,
          orderBy: [
            { scheduledAt: 'asc' },
            { createdAt: 'asc' },
            { id: 'asc' },
          ],
          take: window.limit,
        }),
        this.scopedPrisma.homeworkAssignment.findMany({
          where: {
            status: {
              in: [
                HomeworkAssignmentStatus.PUBLISHED,
                HomeworkAssignmentStatus.CLOSED,
              ],
            },
            dueAt: { gte: window.from, lt: window.toExclusive },
          },
          select: dashboardPlannerHomeworkDueSelect,
          orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
          take: window.limit,
        }),
        this.scopedPrisma.gradeAssessment.findMany({
          where: {
            approvalStatus: {
              in: [
                GradeAssessmentApprovalStatus.PUBLISHED,
                GradeAssessmentApprovalStatus.APPROVED,
              ],
            },
            type: { not: GradeAssessmentType.ASSIGNMENT },
            date: {
              gte: window.allDayFrom,
              lt: window.allDayToExclusive,
            },
          },
          select: dashboardPlannerGradeAssessmentSelect,
          orderBy: [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
          take: window.limit,
        }),
      ]);

    const items: DashboardPlannerItemSnapshot[] = [
      ...attendanceSessions.map((session) => ({
        source: 'attendance_session' as const,
        ...session,
        sortInstant: session.date,
      })),
      ...placementTests.map((test) => ({
        source: 'placement_test' as const,
        ...test,
        scheduledAt: requirePlannerInstant(test.scheduledAt, 'Placement test'),
        sortInstant: requirePlannerInstant(test.scheduledAt, 'Placement test'),
      })),
      ...interviews.map((interview) => ({
        source: 'interview' as const,
        ...interview,
        scheduledAt: requirePlannerInstant(interview.scheduledAt, 'Interview'),
        sortInstant: requirePlannerInstant(interview.scheduledAt, 'Interview'),
      })),
      ...homework.map((assignment) => ({
        source: 'homework_due' as const,
        ...assignment,
        sortInstant: assignment.dueAt,
      })),
      ...grades.map((assessment) => ({
        source: 'grade_assessment' as const,
        ...assessment,
        sortInstant: assessment.date,
      })),
    ];

    return items.sort(comparePlannerItems).slice(0, window.limit);
  }
}

function comparePlannerItems(
  left: DashboardPlannerItemSnapshot,
  right: DashboardPlannerItemSnapshot,
): number {
  const instantComparison =
    left.sortInstant.getTime() - right.sortInstant.getTime();
  if (instantComparison !== 0) return instantComparison;

  const sourceComparison = SOURCE_RANK[left.source] - SOURCE_RANK[right.source];
  if (sourceComparison !== 0) return sourceComparison;

  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function requirePlannerInstant(value: Date | null, source: string): Date {
  if (!value) {
    throw new Error(`${source} planner item is missing its scheduled instant`);
  }
  return value;
}
