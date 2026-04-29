import {
  ReinforcementSource,
  ReinforcementSubmissionStatus,
  ReinforcementTaskStatus,
  XpSourceType,
} from '@prisma/client';
import {
  assertValidDateRange,
  buildTopStudents,
  calculateCompletionRate,
  summarizeAssignmentStatuses,
  summarizeReviewStatuses,
  summarizeTaskStatuses,
  summarizeXpBySource,
} from '../domain/reinforcement-overview-domain';

describe('reinforcement overview domain', () => {
  it('returns zero completion rate for zero assignments', () => {
    expect(calculateCompletionRate(0, 0)).toBe(0);
  });

  it('rounds completion rate to four decimals', () => {
    expect(calculateCompletionRate(1, 3)).toBe(0.3333);
  });

  it('summarizes assignment statuses', () => {
    expect(
      summarizeAssignmentStatuses([
        { status: ReinforcementTaskStatus.NOT_COMPLETED },
        { status: ReinforcementTaskStatus.IN_PROGRESS },
        { status: ReinforcementTaskStatus.UNDER_REVIEW },
        { status: ReinforcementTaskStatus.COMPLETED },
        { status: ReinforcementTaskStatus.CANCELLED },
        { status: 'completed' },
      ]),
    ).toEqual({
      total: 6,
      notCompleted: 1,
      inProgress: 1,
      underReview: 1,
      completed: 2,
      cancelled: 1,
      completionRate: 0.3333,
    });
  });

  it('summarizes task statuses and sources', () => {
    const summary = summarizeTaskStatuses([
      {
        source: ReinforcementSource.TEACHER,
        status: ReinforcementTaskStatus.NOT_COMPLETED,
      },
      {
        source: ReinforcementSource.PARENT,
        status: ReinforcementTaskStatus.CANCELLED,
      },
      {
        source: ReinforcementSource.TEACHER,
        status: ReinforcementTaskStatus.COMPLETED,
      },
    ]);

    expect(summary.total).toBe(3);
    expect(summary.active).toBe(2);
    expect(summary.cancelled).toBe(1);
    expect(summary.bySource).toEqual([
      { source: ReinforcementSource.TEACHER, count: 2 },
      { source: ReinforcementSource.PARENT, count: 1 },
      { source: ReinforcementSource.SYSTEM, count: 0 },
    ]);
    expect(summary.byStatus).toContainEqual({
      status: ReinforcementTaskStatus.COMPLETED,
      count: 1,
    });
  });

  it('summarizes review queue statuses from submissions', () => {
    expect(
      summarizeReviewStatuses([
        {
          status: ReinforcementSubmissionStatus.PENDING,
          submittedAt: null,
        },
        {
          status: ReinforcementSubmissionStatus.SUBMITTED,
          submittedAt: new Date('2026-04-01T00:00:00.000Z'),
        },
        {
          status: ReinforcementSubmissionStatus.APPROVED,
          submittedAt: new Date('2026-04-02T00:00:00.000Z'),
        },
        {
          status: ReinforcementSubmissionStatus.REJECTED,
          submittedAt: new Date('2026-04-03T00:00:00.000Z'),
        },
      ]),
    ).toEqual({
      submitted: 3,
      approved: 1,
      rejected: 1,
      pendingReview: 1,
    });
  });

  it('summarizes XP by source with counts and totals', () => {
    const summary = summarizeXpBySource([
      {
        sourceType: XpSourceType.REINFORCEMENT_TASK,
        amount: 10,
        studentId: 'student-a',
      },
      {
        sourceType: XpSourceType.REINFORCEMENT_TASK,
        amount: 20,
        studentId: 'student-b',
      },
      {
        sourceType: XpSourceType.MANUAL_BONUS,
        amount: 5,
        studentId: 'student-a',
      },
    ]);

    expect(summary.totalXp).toBe(35);
    expect(summary.studentsWithXp).toBe(2);
    expect(summary.averageXp).toBe(17.5);
    expect(summary.bySourceType).toContainEqual({
      sourceType: XpSourceType.REINFORCEMENT_TASK,
      count: 2,
      totalXp: 30,
    });
    expect(summary.bySourceType).toContainEqual({
      sourceType: XpSourceType.MANUAL_BONUS,
      count: 1,
      totalXp: 5,
    });
  });

  it('sorts top students by XP, completed assignments, then name/id', () => {
    const rows = buildTopStudents({
      assignments: [
        {
          studentId: 'student-a',
          student: { id: 'student-a', firstName: 'Alaa', lastName: 'One' },
          status: ReinforcementTaskStatus.COMPLETED,
        },
        {
          studentId: 'student-b',
          student: { id: 'student-b', firstName: 'Basma', lastName: 'Two' },
          status: ReinforcementTaskStatus.COMPLETED,
        },
        {
          studentId: 'student-b',
          student: { id: 'student-b', firstName: 'Basma', lastName: 'Two' },
          status: ReinforcementTaskStatus.COMPLETED,
        },
      ],
      xpEntries: [
        {
          studentId: 'student-a',
          student: { id: 'student-a', firstName: 'Alaa', lastName: 'One' },
          amount: 20,
        },
        {
          studentId: 'student-b',
          student: { id: 'student-b', firstName: 'Basma', lastName: 'Two' },
          amount: 20,
        },
        {
          studentId: 'student-c',
          student: { id: 'student-c', firstName: 'Camil', lastName: 'Three' },
          amount: 10,
        },
      ],
    });

    expect(rows.map((row) => row.studentId)).toEqual([
      'student-b',
      'student-a',
      'student-c',
    ]);
    expect(rows[0]).toMatchObject({
      totalXp: 20,
      completedAssignments: 2,
      completionRate: 1,
    });
  });

  it('rejects invalid date ranges', () => {
    expect(() =>
      assertValidDateRange({
        dateFrom: new Date('2026-04-02T00:00:00.000Z'),
        dateTo: new Date('2026-04-01T00:00:00.000Z'),
      }),
    ).toThrow('Reinforcement overview date range');
  });
});
