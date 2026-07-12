import {
  AttendanceExcuseStatus,
  AttendanceSessionStatus,
  AttendanceStatus,
} from '@prisma/client';
import { AttendanceDashboardAnalyticsRepository } from '../infrastructure/attendance-dashboard-analytics.repository';

describe('AttendanceDashboardAnalyticsRepository', () => {
  it('aggregates submitted entry observations with explicit trusted school and bounded civil dates', async () => {
    const prisma = prismaMock();
    prisma.$queryRaw.mockResolvedValue([
      { date: '2026-07-01', status: AttendanceStatus.PRESENT, count: 3n },
    ]);
    const repository = new AttendanceDashboardAnalyticsRepository(
      prisma as any,
    );

    await expect(
      repository.aggregateDailyEntryStatuses(baseInput()),
    ).resolves.toEqual([
      { date: '2026-07-01', status: AttendanceStatus.PRESENT, count: 3 },
    ]);

    const query = rawQuery(prisma);
    expect(query.sql).toContain('FROM attendance_entries e');
    expect(query.sql).toContain('INNER JOIN attendance_sessions s');
    expect(query.sql).toContain('WHERE e.school_id = ?::uuid');
    expect(query.sql).toContain('AND s.school_id = ?::uuid');
    expect(query.sql).toContain('AND s.status = ?::attendance_session_status');
    expect(query.sql).toContain('AND s.deleted_at IS NULL');
    expect(query.sql).toContain('AND s.date >= ?::date');
    expect(query.sql).toContain('AND s.date <= ?::date');
    expect(query.values).toEqual([
      'school-1',
      'school-1',
      AttendanceSessionStatus.SUBMITTED,
      '2026-07-01',
      '2026-07-31',
    ]);
    expect(prisma.attendanceEntry.findMany).not.toHaveBeenCalled();
  });

  it('adds only already-resolved academic and hierarchy predicates to the aggregate query', async () => {
    const prisma = prismaMock();
    const repository = new AttendanceDashboardAnalyticsRepository(
      prisma as any,
    );

    await repository.aggregateDailyEntryStatuses({
      ...baseInput(),
      hierarchy: {
        academicYearId: 'year-1',
        termId: 'term-1',
        gradeId: 'grade-1',
        sectionId: 'section-1',
        classroomId: 'classroom-1',
      },
    });

    const query = rawQuery(prisma);
    for (const column of [
      'academic_year_id',
      'term_id',
      'grade_id',
      'section_id',
      'classroom_id',
    ]) {
      expect(query.sql).toContain(`AND s.${column} = ?::uuid`);
    }
    expect(query.values).toEqual(
      expect.arrayContaining([
        'year-1',
        'term-1',
        'grade-1',
        'section-1',
        'classroom-1',
      ]),
    );
  });

  it('groups non-deleted overlapping excuses through scoped Prisma with academic filters', async () => {
    const prisma = prismaMock();
    prisma.scoped.attendanceExcuseRequest.groupBy.mockResolvedValue([
      {
        status: AttendanceExcuseStatus.APPROVED,
        _count: { _all: 2 },
      },
    ]);
    const repository = new AttendanceDashboardAnalyticsRepository(
      prisma as any,
    );

    await expect(
      repository.aggregateExcuseStatuses({
        ...baseInput(),
        hierarchy: { academicYearId: 'year-1', termId: 'term-1' },
      }),
    ).resolves.toEqual([{ status: AttendanceExcuseStatus.APPROVED, count: 2 }]);

    expect(prisma.scoped.attendanceExcuseRequest.groupBy).toHaveBeenCalledWith({
      by: ['status'],
      where: {
        deletedAt: null,
        dateFrom: { lte: new Date('2026-07-31T00:00:00.000Z') },
        dateTo: { gte: new Date('2026-07-01T00:00:00.000Z') },
        academicYearId: 'year-1',
        termId: 'term-1',
      },
      _count: { _all: true },
      orderBy: { status: 'asc' },
    });
  });
});

function prismaMock() {
  return {
    $queryRaw: jest.fn().mockResolvedValue([]),
    attendanceEntry: { findMany: jest.fn() },
    scoped: {
      attendanceExcuseRequest: {
        groupBy: jest.fn().mockResolvedValue([]),
      },
    },
  };
}

function baseInput() {
  return {
    scope: { schoolId: 'school-1' },
    window: {
      startCivilDate: '2026-07-01',
      endCivilDate: '2026-07-31',
    },
    hierarchy: {
      academicYearId: null,
      termId: null,
      gradeId: null,
      sectionId: null,
      classroomId: null,
    },
  };
}

function rawQuery(prisma: ReturnType<typeof prismaMock>): {
  sql: string;
  values: unknown[];
} {
  return prisma.$queryRaw.mock.calls[0][0] as {
    sql: string;
    values: unknown[];
  };
}
