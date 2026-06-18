import { DisciplineDerivedPresenter } from '../presenters/discipline-derived.presenter';
import type {
  DisciplineSummaryReadModel,
  DisciplineTimelineListReadModel,
} from '../infrastructure/discipline-derived.repository';

describe('DisciplineDerivedPresenter', () => {
  it('maps derived attendance and behavior items to app-safe timeline DTOs', () => {
    const result = DisciplineDerivedPresenter.presentList(listFixture());
    const serialized = JSON.stringify(result);

    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'attendance:entry-absent',
          sourceType: 'attendance',
          source_type: 'attendance',
          itemType: 'absence',
          item_type: 'absence',
          severity: 'medium',
          pointsDelta: 0,
          points_delta: 0,
          status: 'submitted',
          attendance: expect.objectContaining({
            status: 'absent',
            lateMinutes: null,
            minutesLate: null,
          }),
        }),
        expect.objectContaining({
          id: 'attendance:entry-late',
          itemType: 'lateness',
          severity: 'low',
          attendance: expect.objectContaining({
            status: 'late',
            lateMinutes: 12,
            minutesLate: 12,
          }),
        }),
        expect.objectContaining({
          id: 'attendance:entry-early',
          itemType: 'early_leave',
          attendance: expect.objectContaining({
            status: 'early_leave',
            earlyLeaveMinutes: 18,
            minutesEarlyLeave: 18,
          }),
        }),
        expect.objectContaining({
          id: 'attendance:entry-excused',
          itemType: 'excused',
          severity: 'info',
          status: 'excused',
          attendance: expect.objectContaining({
            status: 'excused',
            excuseReason: 'Medical note',
          }),
        }),
        expect.objectContaining({
          id: 'behavior:record-positive',
          sourceType: 'behavior',
          itemType: 'positive',
          pointsDelta: 5,
          category: expect.objectContaining({
            id: 'category-positive',
            code: 'HELPFUL',
            nameEn: 'Helpful',
            name_en: 'Helpful',
            type: 'positive',
          }),
        }),
        expect.objectContaining({
          id: 'behavior:record-negative',
          itemType: 'negative',
          severity: 'high',
          pointsDelta: -2,
        }),
      ]),
    );
    expect(result.summary).toMatchObject({
      totalIncidents: 6,
      attendanceIncidentCount: 4,
      behaviorPoints: 3,
      total_incidents: 6,
      attendance_incident_count: 4,
      behavior_points: 3,
    });
    expect(serialized).not.toContain('schoolId');
    expect(serialized).not.toContain('organizationId');
    expect(serialized).not.toContain('membershipId');
    expect(serialized).not.toContain('roleId');
    expect(serialized).not.toContain('markedById');
    expect(serialized).not.toContain('submittedById');
    expect(serialized).not.toContain('reviewedById');
    expect(serialized).not.toContain('deletedAt');
    expect(serialized).not.toContain('metadata');
  });

  it('adds the parent child wrapper without changing item contracts', () => {
    const response = DisciplineDerivedPresenter.presentParentSummary({
      child: {
        studentId: 'student-1',
        enrollmentId: 'enrollment-1',
        student_id: 'student-1',
        enrollment_id: 'enrollment-1',
      },
      summary: summaryFixture(),
    });

    expect(response.child).toEqual({
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      student_id: 'student-1',
      enrollment_id: 'enrollment-1',
    });
    expect(response.summary.totalIncidents).toBe(6);
  });
});

function listFixture(): DisciplineTimelineListReadModel {
  return {
    items: [
      {
        id: 'attendance:entry-absent',
        sourceType: 'attendance',
        sourceId: 'entry-absent',
        itemType: 'absence',
        occurredAt: new Date('2026-02-05T08:00:00.000Z'),
        title: 'Absence',
        description: 'Marked absent',
        severity: 'medium',
        pointsDelta: 0,
        status: 'submitted',
        category: null,
        attendance: {
          status: 'absent',
          lateMinutes: null,
          earlyLeaveMinutes: null,
          excuseReason: null,
        },
      },
      {
        id: 'attendance:entry-late',
        sourceType: 'attendance',
        sourceId: 'entry-late',
        itemType: 'lateness',
        occurredAt: new Date('2026-02-04T08:00:00.000Z'),
        title: 'Late arrival',
        description: 'Late by 12 minutes',
        severity: 'low',
        pointsDelta: 0,
        status: 'submitted',
        category: null,
        attendance: {
          status: 'late',
          lateMinutes: 12,
          earlyLeaveMinutes: null,
          excuseReason: null,
        },
      },
      {
        id: 'attendance:entry-early',
        sourceType: 'attendance',
        sourceId: 'entry-early',
        itemType: 'early_leave',
        occurredAt: new Date('2026-02-03T08:00:00.000Z'),
        title: 'Early leave',
        description: 'Left early by 18 minutes',
        severity: 'low',
        pointsDelta: 0,
        status: 'submitted',
        category: null,
        attendance: {
          status: 'early_leave',
          lateMinutes: null,
          earlyLeaveMinutes: 18,
          excuseReason: null,
        },
      },
      {
        id: 'attendance:entry-excused',
        sourceType: 'attendance',
        sourceId: 'entry-excused',
        itemType: 'excused',
        occurredAt: new Date('2026-02-02T08:00:00.000Z'),
        title: 'Excused attendance incident',
        description: 'Medical note',
        severity: 'info',
        pointsDelta: 0,
        status: 'excused',
        category: null,
        attendance: {
          status: 'excused',
          lateMinutes: null,
          earlyLeaveMinutes: null,
          excuseReason: 'Medical note',
        },
      },
      {
        id: 'behavior:record-positive',
        sourceType: 'behavior',
        sourceId: 'record-positive',
        itemType: 'positive',
        occurredAt: new Date('2026-02-01T08:00:00.000Z'),
        title: 'Helpful',
        description: 'Visible note',
        severity: 'low',
        pointsDelta: 5,
        status: 'approved',
        category: {
          id: 'category-positive',
          code: 'HELPFUL',
          nameAr: null,
          nameEn: 'Helpful',
          type: 'positive',
        },
        attendance: null,
      },
      {
        id: 'behavior:record-negative',
        sourceType: 'behavior',
        sourceId: 'record-negative',
        itemType: 'negative',
        occurredAt: new Date('2026-01-31T08:00:00.000Z'),
        title: 'Disruption',
        description: null,
        severity: 'high',
        pointsDelta: -2,
        status: 'approved',
        category: null,
        attendance: null,
      },
    ],
    summary: summaryFixture(),
    page: 1,
    limit: 50,
    total: 6,
  };
}

function summaryFixture(): DisciplineSummaryReadModel {
  return {
    totalIncidents: 6,
    attendanceIncidentCount: 4,
    absenceCount: 1,
    lateCount: 1,
    earlyLeaveCount: 1,
    excusedCount: 1,
    positiveCount: 1,
    negativeCount: 1,
    behaviorPoints: 3,
    period: 'current_term',
    dateText: 'current_term',
  };
}
