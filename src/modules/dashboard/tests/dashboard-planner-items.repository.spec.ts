import {
  AttendanceMode,
  AttendanceSessionStatus,
  GradeAssessmentApprovalStatus,
  GradeAssessmentType,
  HomeworkAssignmentStatus,
  InterviewStatus,
  PlacementTestStatus,
  UserType,
} from '@prisma/client';
import { DashboardScope } from '../dashboard-context';
import { DashboardPlannerItemsRepository } from '../infrastructure/dashboard-planner-items.repository';

const SCOPE: DashboardScope = {
  actorId: 'actor-1',
  userType: UserType.SCHOOL_USER,
  organizationId: 'org-1',
  schoolId: 'school-1',
  roleId: 'role-1',
};

const WINDOW = {
  from: new Date('2026-07-09T07:00:00.000Z'),
  toExclusive: new Date('2026-07-10T07:00:00.000Z'),
  allDayFrom: new Date('2026-07-09T00:00:00.000Z'),
  allDayToExclusive: new Date('2026-07-10T00:00:00.000Z'),
  limit: 5,
};

describe('DashboardPlannerItemsRepository', () => {
  it('uses five scoped safe reads with negative-offset timed and logical-date predicates', async () => {
    const prisma = prismaMock();
    const repository = repositoryWith(prisma);

    await repository.listSchoolItems(SCOPE, WINDOW);

    expect(prisma.scoped.attendanceSession.findMany).toHaveBeenCalledWith({
      where: {
        date: {
          gte: WINDOW.allDayFrom,
          lt: WINDOW.allDayToExclusive,
        },
      },
      select: {
        id: true,
        date: true,
        mode: true,
        periodLabelAr: true,
        periodLabelEn: true,
        status: true,
      },
      orderBy: [
        { date: 'asc' },
        { periodKey: 'asc' },
        { createdAt: 'asc' },
        { id: 'asc' },
      ],
      take: 5,
    });
    expect(prisma.scoped.placementTest.findMany).toHaveBeenCalledWith({
      where: {
        status: {
          in: [PlacementTestStatus.SCHEDULED, PlacementTestStatus.RESCHEDULED],
        },
        scheduledAt: { gte: WINDOW.from, lt: WINDOW.toExclusive },
        application: { is: { deletedAt: null } },
      },
      select: { id: true, type: true, scheduledAt: true, status: true },
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      take: 5,
    });
    expect(prisma.scoped.interview.findMany).toHaveBeenCalledWith({
      where: {
        status: {
          in: [InterviewStatus.SCHEDULED, InterviewStatus.RESCHEDULED],
        },
        scheduledAt: { gte: WINDOW.from, lt: WINDOW.toExclusive },
        application: { is: { deletedAt: null } },
      },
      select: { id: true, scheduledAt: true, status: true },
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      take: 5,
    });
    expect(prisma.scoped.homeworkAssignment.findMany).toHaveBeenCalledWith({
      where: {
        status: {
          in: [
            HomeworkAssignmentStatus.PUBLISHED,
            HomeworkAssignmentStatus.CLOSED,
          ],
        },
        dueAt: { gte: WINDOW.from, lt: WINDOW.toExclusive },
      },
      select: { id: true, title: true, dueAt: true, status: true },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      take: 5,
    });
    expect(prisma.scoped.gradeAssessment.findMany).toHaveBeenCalledWith({
      where: {
        approvalStatus: {
          in: [
            GradeAssessmentApprovalStatus.PUBLISHED,
            GradeAssessmentApprovalStatus.APPROVED,
          ],
        },
        type: { not: GradeAssessmentType.ASSIGNMENT },
        date: {
          gte: WINDOW.allDayFrom,
          lt: WINDOW.allDayToExclusive,
        },
      },
      select: {
        id: true,
        titleEn: true,
        titleAr: true,
        type: true,
        date: true,
        approvalStatus: true,
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      take: 5,
    });

    for (const model of plannerModels(prisma)) {
      expect(model.unscoped).not.toHaveBeenCalled();
      expect(model.scoped).toHaveBeenCalledTimes(1);
    }
  });

  it('loads all sources in parallel, merges before slicing, and applies instant, source-rank, then ID order', async () => {
    const prisma = prismaMock();
    const instant = new Date('2026-07-09T10:00:00.000Z');
    prisma.scoped.attendanceSession.findMany.mockResolvedValue([
      attendance('attendance-b', new Date('2026-07-09T00:00:00.000Z')),
      attendance('attendance-late', new Date('2026-07-09T11:00:00.000Z')),
    ]);
    prisma.scoped.gradeAssessment.findMany.mockResolvedValue([
      assessment('assessment-a', new Date('2026-07-09T00:00:00.000Z')),
    ]);
    prisma.scoped.placementTest.findMany.mockResolvedValue([
      placement('placement-b', instant),
      placement('placement-a', instant),
    ]);
    prisma.scoped.interview.findMany.mockResolvedValue([
      interview('interview-a', instant),
    ]);
    prisma.scoped.homeworkAssignment.findMany.mockResolvedValue([
      homework('homework-a', instant),
      homework('homework-late', new Date('2026-07-09T12:00:00.000Z')),
    ]);

    const result = await repositoryWith(prisma).listSchoolItems(SCOPE, WINDOW);

    expect(result.map((item) => `${item.source}:${item.id}`)).toEqual([
      'attendance_session:attendance-b',
      'grade_assessment:assessment-a',
      'placement_test:placement-a',
      'placement_test:placement-b',
      'interview:interview-a',
    ]);
    expect(result).toHaveLength(5);
    expect(result).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'homework_due',
          id: 'homework-a',
        }),
        expect.objectContaining({
          source: 'attendance_session',
          id: 'attendance-late',
        }),
        expect.objectContaining({
          source: 'homework_due',
          id: 'homework-late',
        }),
      ]),
    );
    for (const model of plannerModels(prisma)) {
      expect(model.scoped).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5 }),
      );
    }
  });

  it('starts every source read before waiting for any one source', async () => {
    const prisma = prismaMock();
    const releases: Array<() => void> = [];
    for (const model of plannerModels(prisma)) {
      model.scoped.mockImplementation(
        () =>
          new Promise((resolve) => {
            releases.push(() => resolve([]));
          }),
      );
    }

    const result = repositoryWith(prisma).listSchoolItems(SCOPE, WINDOW);
    await Promise.resolve();

    expect(releases).toHaveLength(5);
    for (const model of plannerModels(prisma)) {
      expect(model.scoped).toHaveBeenCalledTimes(1);
    }
    releases.forEach((release) => release());
    await expect(result).resolves.toEqual([]);
  });

  it('has no tenant override or mutation operation', () => {
    expect(
      Object.getOwnPropertyNames(DashboardPlannerItemsRepository.prototype),
    ).toEqual(['constructor', 'scopedPrisma', 'listSchoolItems']);
  });
});

function repositoryWith(prisma: ReturnType<typeof prismaMock>) {
  return new DashboardPlannerItemsRepository(
    prisma as unknown as ConstructorParameters<
      typeof DashboardPlannerItemsRepository
    >[0],
  );
}

function prismaMock() {
  const models = () => ({ findMany: jest.fn().mockResolvedValue([]) });
  return {
    attendanceSession: models(),
    placementTest: models(),
    interview: models(),
    homeworkAssignment: models(),
    gradeAssessment: models(),
    scoped: {
      attendanceSession: models(),
      placementTest: models(),
      interview: models(),
      homeworkAssignment: models(),
      gradeAssessment: models(),
    },
  };
}

function plannerModels(prisma: ReturnType<typeof prismaMock>) {
  return [
    {
      scoped: prisma.scoped.attendanceSession.findMany,
      unscoped: prisma.attendanceSession.findMany,
    },
    {
      scoped: prisma.scoped.placementTest.findMany,
      unscoped: prisma.placementTest.findMany,
    },
    {
      scoped: prisma.scoped.interview.findMany,
      unscoped: prisma.interview.findMany,
    },
    {
      scoped: prisma.scoped.homeworkAssignment.findMany,
      unscoped: prisma.homeworkAssignment.findMany,
    },
    {
      scoped: prisma.scoped.gradeAssessment.findMany,
      unscoped: prisma.gradeAssessment.findMany,
    },
  ];
}

function attendance(id: string, date: Date) {
  return {
    id,
    date,
    mode: AttendanceMode.DAILY,
    periodLabelAr: null,
    periodLabelEn: null,
    status: AttendanceSessionStatus.DRAFT,
  };
}

function assessment(id: string, date: Date) {
  return {
    id,
    date,
    titleEn: 'Exam',
    titleAr: 'اختبار',
    type: GradeAssessmentType.QUIZ,
    approvalStatus: GradeAssessmentApprovalStatus.PUBLISHED,
  };
}

function placement(id: string, scheduledAt: Date) {
  return {
    id,
    type: 'GENERAL',
    scheduledAt,
    status: PlacementTestStatus.SCHEDULED,
  };
}

function interview(id: string, scheduledAt: Date) {
  return { id, scheduledAt, status: InterviewStatus.SCHEDULED };
}

function homework(id: string, dueAt: Date) {
  return {
    id,
    title: 'Homework',
    dueAt,
    status: HomeworkAssignmentStatus.PUBLISHED,
  };
}
