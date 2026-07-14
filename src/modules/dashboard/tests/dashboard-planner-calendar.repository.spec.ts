import { AcademicCalendarEventType, Prisma, UserType } from '@prisma/client';
import { DashboardScope } from '../dashboard-context';
import { DashboardPlannerCalendarRepository } from '../infrastructure/dashboard-planner-calendar.repository';

const SCOPE: DashboardScope = {
  actorId: 'actor-1',
  userType: UserType.SCHOOL_USER,
  organizationId: 'org-1',
  schoolId: 'school-1',
  roleId: 'role-1',
};

describe('DashboardPlannerCalendarRepository', () => {
  it('uses scoped Prisma with the safe select, overlap bounds, deterministic order, and requested limit', async () => {
    const prisma = prismaMock();
    const snapshot = {
      id: 'event-1',
      title: 'School holiday',
      type: AcademicCalendarEventType.HOLIDAY,
      allDay: true,
      startDate: new Date('2026-07-12T00:00:00.000Z'),
      endDate: new Date('2026-07-12T00:00:00.000Z'),
    };
    prisma.scoped.academicCalendarEvent.findMany.mockResolvedValue([snapshot]);
    const repository = new DashboardPlannerCalendarRepository(
      prisma as unknown as ConstructorParameters<
        typeof DashboardPlannerCalendarRepository
      >[0],
    );
    const window = {
      from: new Date('2026-07-11T21:00:00.000Z'),
      toExclusive: new Date('2026-07-12T21:00:00.000Z'),
      allDayFrom: new Date('2026-07-12T00:00:00.000Z'),
      allDayToExclusive: new Date('2026-07-13T00:00:00.000Z'),
      limit: 5,
    };

    await expect(repository.listSchoolEvents(SCOPE, window)).resolves.toEqual([
      snapshot,
    ]);
    expect(prisma.scoped.academicCalendarEvent.findMany).toHaveBeenCalledWith({
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
      select: {
        id: true,
        title: true,
        type: true,
        allDay: true,
        startDate: true,
        endDate: true,
      },
      orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      take: 5,
    });
    expect(prisma.academicCalendarEvent.findMany).not.toHaveBeenCalled();
  });

  it('keeps logical all-day dates separate from timed instant boundaries in negative offsets', async () => {
    const prisma = prismaMock();
    const repository = new DashboardPlannerCalendarRepository(
      prisma as unknown as ConstructorParameters<
        typeof DashboardPlannerCalendarRepository
      >[0],
    );
    const window = {
      from: new Date('2026-07-09T07:00:00.000Z'),
      toExclusive: new Date('2026-07-10T07:00:00.000Z'),
      allDayFrom: new Date('2026-07-09T00:00:00.000Z'),
      allDayToExclusive: new Date('2026-07-10T00:00:00.000Z'),
      limit: 100,
    };

    await repository.listSchoolEvents(SCOPE, window);

    const query = prisma.scoped.academicCalendarEvent.findMany.mock.calls[0][0];
    expect(query.where).toEqual({
      OR: [
        {
          allDay: true,
          startDate: { lt: new Date('2026-07-10T00:00:00.000Z') },
          endDate: { gte: new Date('2026-07-09T00:00:00.000Z') },
        },
        {
          allDay: false,
          startDate: { lt: new Date('2026-07-10T07:00:00.000Z') },
          endDate: { gte: new Date('2026-07-09T07:00:00.000Z') },
        },
      ],
    });
    expect(query.take).toBe(100);
  });

  it('does not accept a tenant override or expose mutation operations', () => {
    const methodNames = Object.getOwnPropertyNames(
      DashboardPlannerCalendarRepository.prototype,
    );

    expect(methodNames).toEqual([
      'constructor',
      'scopedPrisma',
      'listSchoolEvents',
    ]);
    expect(methodNames).not.toEqual(
      expect.arrayContaining(['create', 'update', 'delete', 'upsert']),
    );
  });
});

function prismaMock() {
  const findMany = () =>
    jest.fn((args: Prisma.AcademicCalendarEventFindManyArgs) => {
      void args;
      return Promise.resolve(
        [] as Array<{
          id: string;
          title: string;
          type: AcademicCalendarEventType;
          allDay: boolean;
          startDate: Date;
          endDate: Date;
        }>,
      );
    });

  return {
    academicCalendarEvent: { findMany: findMany() },
    scoped: {
      academicCalendarEvent: { findMany: findMany() },
    },
  };
}
