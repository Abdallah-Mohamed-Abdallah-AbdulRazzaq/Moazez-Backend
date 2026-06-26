import {
  AttendanceScopeType,
  AttendanceStatus,
  DailyComputationStrategy,
} from '@prisma/client';
import { AttendanceReportScopeGroupBy } from '../domain/attendance-report';
import {
  presentDerivedDailyAbsencesReport,
  presentAttendanceDailyTrendReport,
  presentAttendanceScopeBreakdownReport,
  presentAttendanceSummaryReport,
} from '../presenters/attendance-reports.presenter';

describe('Attendance reports presenter', () => {
  it('shapes summary, trend, and scope breakdown responses', () => {
    expect(
      presentAttendanceSummaryReport({
        totalSessions: 2,
        totalEntries: 4,
        presentCount: 2,
        absentCount: 1,
        lateCount: 1,
        earlyLeaveCount: 0,
        excusedCount: 0,
        unmarkedCount: 0,
        incidentCount: 2,
        attendanceRate: 0.5,
        absenceRate: 0.25,
        lateRate: 0.25,
        affectedStudentsCount: 2,
      }),
    ).toMatchObject({
      totalSessions: 2,
      totalEntries: 4,
      attendanceRate: 0.5,
      affectedStudentsCount: 2,
    });

    expect(
      presentAttendanceDailyTrendReport([
        {
          date: '2026-09-15',
          totalEntries: 2,
          presentCount: 1,
          absentCount: 1,
          lateCount: 0,
          earlyLeaveCount: 0,
          excusedCount: 0,
          unmarkedCount: 0,
          incidentCount: 1,
          attendanceRate: 0.5,
        },
      ]),
    ).toEqual({
      items: [
        {
          date: '2026-09-15',
          totalEntries: 2,
          presentCount: 1,
          absentCount: 1,
          lateCount: 0,
          earlyLeaveCount: 0,
          excusedCount: 0,
          attendanceRate: 0.5,
          incidentCount: 1,
        },
      ],
    });

    expect(
      presentAttendanceScopeBreakdownReport([
        {
          scopeType: AttendanceReportScopeGroupBy.CLASSROOM,
          scopeId: 'classroom-1',
          scopeNameAr: 'Classroom AR',
          scopeNameEn: 'Classroom 1A',
          totalEntries: 2,
          presentCount: 1,
          absentCount: 1,
          lateCount: 0,
          earlyLeaveCount: 0,
          excusedCount: 0,
          unmarkedCount: 0,
          incidentCount: 1,
          attendanceRate: 0.5,
        },
      ]),
    ).toEqual({
      items: [
        {
          scopeType: AttendanceReportScopeGroupBy.CLASSROOM,
          scopeId: 'classroom-1',
          scopeNameAr: 'Classroom AR',
          scopeNameEn: 'Classroom 1A',
          totalEntries: 2,
          presentCount: 1,
          absentCount: 1,
          lateCount: 0,
          earlyLeaveCount: 0,
          excusedCount: 0,
          attendanceRate: 0.5,
          incidentCount: 1,
        },
      ],
    });
  });

  it('shapes derived daily absence report rows without persisted session fields', () => {
    const response = presentDerivedDailyAbsencesReport([
      {
        date: '2026-09-15',
        studentId: 'student-1',
        scopeType: AttendanceScopeType.CLASSROOM,
        scopeKey: 'classroom:classroom-1',
        scopeIds: {
          stageId: 'stage-1',
          gradeId: 'grade-1',
          sectionId: 'section-1',
          classroomId: 'classroom-1',
        },
        policyId: 'policy-1',
        missedPeriodCount: 2,
        requiredMissedPeriodsCount: 2,
        missedPeriodIds: ['period-1', 'period-2'],
        evidencePeriodCount: 2,
        sourcePeriodIds: ['period-1', 'period-2'],
        derivedStatus: AttendanceStatus.ABSENT,
        source: DailyComputationStrategy.DERIVED_FROM_PERIODS,
        reportOnly: true,
      },
    ]);

    expect(response).toEqual({
      items: [
        {
          date: '2026-09-15',
          studentId: 'student-1',
          scopeType: AttendanceScopeType.CLASSROOM,
          scopeKey: 'classroom:classroom-1',
          scopeIds: {
            stageId: 'stage-1',
            gradeId: 'grade-1',
            sectionId: 'section-1',
            classroomId: 'classroom-1',
          },
          policyId: 'policy-1',
          missedPeriodCount: 2,
          requiredMissedPeriodsCount: 2,
          missedPeriodIds: ['period-1', 'period-2'],
          evidencePeriodCount: 2,
          sourcePeriodIds: ['period-1', 'period-2'],
          derivedStatus: AttendanceStatus.ABSENT,
          source: DailyComputationStrategy.DERIVED_FROM_PERIODS,
          reportOnly: true,
        },
      ],
    });
    expect(JSON.stringify(response)).not.toContain('sessionId');
    expect(JSON.stringify(response)).not.toContain('schoolId');
    expect(JSON.stringify(response)).not.toContain('deletedAt');
  });
});
