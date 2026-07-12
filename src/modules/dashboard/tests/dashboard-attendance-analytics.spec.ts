import { AttendanceExcuseStatus, AttendanceStatus } from '@prisma/client';
import { computeDashboardAttendanceAnalyticsData } from '../domain/dashboard-attendance-analytics';
import { DashboardAnalyticsQueryContext } from '../domain/dashboard-analytics-query';

describe('Dashboard Attendance analytics computations', () => {
  it('builds zero-filled daily present, absent, and late observation series', () => {
    const data = computeDashboardAttendanceAnalyticsData({
      chartKey: 'attendance.daily_trend',
      queryContext: context('day', '2026-07-01', '2026-07-03'),
      dailyAggregates: [
        row('2026-07-01', AttendanceStatus.PRESENT, 2),
        row('2026-07-03', AttendanceStatus.ABSENT, 1),
        row('2026-07-03', AttendanceStatus.EXCUSED, 9),
      ],
    });

    expect(data.totals).toEqual({ present: 2, absent: 1, late: 0 });
    expect(data.summary).toEqual({
      value: 3,
      label: 'Attendance observations',
    });
    expect(
      data.series.map((series) => series.points.map(pointIdentity)),
    ).toEqual([
      [
        ['2026-07-01', 2],
        ['2026-07-02', 0],
        ['2026-07-03', 0],
      ],
      [
        ['2026-07-01', 0],
        ['2026-07-02', 0],
        ['2026-07-03', 1],
      ],
      [
        ['2026-07-01', 0],
        ['2026-07-02', 0],
        ['2026-07-03', 0],
      ],
    ]);
    expect(data.empty).toBe(false);
  });

  it('builds identical ordered weekly coordinates for status distribution', () => {
    const data = computeDashboardAttendanceAnalyticsData({
      chartKey: 'attendance.status_distribution',
      queryContext: context('week', '2026-07-01', '2026-07-17'),
      dailyAggregates: [
        row('2026-07-01', AttendanceStatus.PRESENT, 1),
        row('2026-07-06', AttendanceStatus.LATE, 2),
        row('2026-07-17', AttendanceStatus.EXCUSED, 3),
      ],
    });

    expect(data.totals).toEqual({
      present: 1,
      absent: 0,
      late: 2,
      excused: 3,
    });
    const coordinates = data.series.map((series) =>
      series.points.map((point) => point.x),
    );
    expect(new Set(coordinates.map(JSON.stringify)).size).toBe(1);
    expect(coordinates[0]).toEqual([
      '2026-07-01/2026-07-05',
      '2026-07-06/2026-07-12',
      '2026-07-13/2026-07-17',
    ]);
  });

  it('uses exact absence numerator and final-observation denominator with overall totals', () => {
    const data = computeDashboardAttendanceAnalyticsData({
      chartKey: 'attendance.absence_rate',
      queryContext: context('day', '2026-07-01', '2026-07-02'),
      dailyAggregates: [
        row('2026-07-01', AttendanceStatus.ABSENT, 1),
        row('2026-07-01', AttendanceStatus.UNMARKED, 20),
        row('2026-07-02', AttendanceStatus.PRESENT, 1),
        row('2026-07-02', AttendanceStatus.LATE, 1),
        row('2026-07-02', AttendanceStatus.EXCUSED, 1),
        row('2026-07-02', AttendanceStatus.EARLY_LEAVE, 1),
      ],
    });

    expect(data.series[0].points.map((point) => point.y)).toEqual([100, 0]);
    expect(data.totals).toEqual({ absent: 1, considered: 5, rate: 20 });
    expect(data.summary).toEqual({ value: 20, label: 'Overall absence rate' });
  });

  it('rounds late rates to two decimals and includes early leave in the denominator', () => {
    const data = computeDashboardAttendanceAnalyticsData({
      chartKey: 'attendance.late_rate',
      queryContext: context('month', '2026-07-01', '2026-07-31'),
      dailyAggregates: [
        row('2026-07-01', AttendanceStatus.LATE, 1),
        row('2026-07-02', AttendanceStatus.PRESENT, 1),
        row('2026-07-03', AttendanceStatus.EARLY_LEAVE, 1),
        row('2026-07-04', AttendanceStatus.UNMARKED, 100),
      ],
    });

    expect(data.series[0].points).toEqual([
      expect.objectContaining({ x: '2026-07', y: 33.33 }),
    ]);
    expect(data.totals).toEqual({ late: 1, considered: 3, rate: 33.33 });
  });

  it('emits zero instead of a non-finite rate for an unmarked-only window', () => {
    const data = computeDashboardAttendanceAnalyticsData({
      chartKey: 'attendance.absence_rate',
      queryContext: context('day', '2026-07-01', '2026-07-01'),
      dailyAggregates: [row('2026-07-01', AttendanceStatus.UNMARKED, 4)],
    });

    expect(data.series[0].points[0].y).toBe(0);
    expect(data.totals).toEqual({ absent: 0, considered: 0, rate: 0 });
    expect(data.empty).toBe(true);
  });

  it('returns one validated category point per excuse status with zero filling', () => {
    const data = computeDashboardAttendanceAnalyticsData({
      chartKey: 'attendance.excuse_status',
      queryContext: context('day', '2026-07-01', '2026-07-31'),
      excuseAggregates: [
        { status: AttendanceExcuseStatus.PENDING, count: 2 },
        { status: AttendanceExcuseStatus.REJECTED, count: 1 },
      ],
    });

    expect(data.totals).toEqual({ pending: 2, approved: 0, rejected: 1 });
    expect(data.summary).toEqual({
      value: 3,
      label: 'Attendance excuse requests',
    });
    expect(data.series.map((series) => series.points[0])).toEqual([
      {
        x: 'pending',
        y: 2,
        coordinate: { kind: 'category', key: 'pending', label: 'Pending' },
      },
      {
        x: 'approved',
        y: 0,
        coordinate: { kind: 'category', key: 'approved', label: 'Approved' },
      },
      {
        x: 'rejected',
        y: 1,
        coordinate: { kind: 'category', key: 'rejected', label: 'Rejected' },
      },
    ]);
  });
});

function row(date: string, status: AttendanceStatus, count: number) {
  return { date, status, count };
}

function pointIdentity(point: { x: string; y: number }): [string, number] {
  return [point.x, point.y];
}

function context(
  granularity: DashboardAnalyticsQueryContext['granularity'],
  startCivilDate: string,
  endCivilDate: string,
): DashboardAnalyticsQueryContext {
  return {
    generatedAt: new Date('2026-07-31T12:00:00.000Z'),
    timezone: 'UTC',
    range: 'custom',
    granularity,
    startInclusive: new Date(`${startCivilDate}T00:00:00.000Z`),
    endExclusive: new Date('2026-08-01T00:00:00.000Z'),
    startCivilDate,
    endCivilDate,
    hierarchy: {
      academicYearId: null,
      termId: null,
      gradeId: null,
      sectionId: null,
      classroomId: null,
    },
    explicitlySuppliedKeys: ['range', 'granularity', 'dateFrom', 'dateTo'],
    filtersApplied: ['range', 'granularity', 'dateFrom', 'dateTo'],
    filtersNotApplicable: [],
  };
}
