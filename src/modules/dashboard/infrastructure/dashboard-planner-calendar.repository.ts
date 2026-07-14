import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DashboardScope } from '../dashboard-context';

const dashboardPlannerCalendarEventSelect = {
  id: true,
  title: true,
  type: true,
  allDay: true,
  startDate: true,
  endDate: true,
} satisfies Prisma.AcademicCalendarEventSelect;

export type DashboardPlannerCalendarEventSnapshot =
  Prisma.AcademicCalendarEventGetPayload<{
    select: typeof dashboardPlannerCalendarEventSelect;
  }>;

export interface DashboardPlannerCalendarWindow {
  from: Date;
  toExclusive: Date;
  allDayFrom: Date;
  allDayToExclusive: Date;
  limit: number;
}

@Injectable()
export class DashboardPlannerCalendarRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  listSchoolEvents(
    scope: DashboardScope,
    window: DashboardPlannerCalendarWindow,
  ): Promise<DashboardPlannerCalendarEventSnapshot[]> {
    void scope;
    return this.scopedPrisma.academicCalendarEvent.findMany({
      where: {
        OR: [
          {
            allDay: true,
            startDate: { lt: window.allDayToExclusive },
            endDate: { gte: window.allDayFrom },
          },
          {
            allDay: false,
            startDate: { lt: window.toExclusive },
            endDate: { gte: window.from },
          },
        ],
      },
      select: dashboardPlannerCalendarEventSelect,
      orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      take: window.limit,
    });
  }
}
