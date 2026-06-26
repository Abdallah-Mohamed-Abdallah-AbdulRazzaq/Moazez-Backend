import {
  AttendanceMode,
  AttendanceScopeType,
  AttendanceSessionStatus,
  AttendanceStatus,
  DailyComputationStrategy,
} from '@prisma/client';
import { GetDerivedDailyAbsencesReportUseCase } from '../application/get-derived-daily-absences-report.use-case';
import { GetAttendanceScopeBreakdownUseCase } from '../application/get-attendance-scope-breakdown.use-case';
import { AttendanceReportScopeGroupBy } from '../domain/attendance-report';
import { AttendanceReportsRepository } from '../infrastructure/attendance-reports.repository';

describe('Attendance report use cases', () => {
  function submittedEntry(status: AttendanceStatus) {
    const timestamp = new Date('2026-09-15T07:00:00.000Z');

    return {
      id: 'entry-1',
      schoolId: 'school-1',
      sessionId: 'session-1',
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      status,
      session: {
        id: 'session-1',
        academicYearId: 'year-1',
        termId: 'term-1',
        date: new Date('2026-09-15T00:00:00.000Z'),
        scopeType: AttendanceScopeType.CLASSROOM,
        scopeKey: 'classroom:classroom-1',
        stageId: 'stage-1',
        gradeId: 'grade-1',
        sectionId: 'section-1',
        classroomId: 'classroom-1',
        mode: AttendanceMode.DAILY,
        periodKey: 'daily',
        status: AttendanceSessionStatus.SUBMITTED,
        deletedAt: null,
        stage: null,
        grade: null,
        section: null,
        classroom: null,
      },
      enrollment: {
        id: 'enrollment-1',
        classroomId: 'classroom-1',
        classroom: {
          id: 'classroom-1',
          nameAr: 'Classroom AR',
          nameEn: 'Classroom 1A',
          section: {
            id: 'section-1',
            nameAr: 'Section AR',
            nameEn: 'Section A',
            grade: {
              id: 'grade-1',
              nameAr: 'Grade AR',
              nameEn: 'Grade 1',
              stage: {
                id: 'stage-1',
                nameAr: 'Stage AR',
                nameEn: 'Primary',
              },
            },
          },
        },
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  it('builds a classroom scope breakdown from submitted attendance entries', async () => {
    const repository = {
      getScopeBreakdown: jest
        .fn()
        .mockResolvedValue([
          submittedEntry(AttendanceStatus.PRESENT),
          submittedEntry(AttendanceStatus.ABSENT),
        ]),
    } as unknown as AttendanceReportsRepository;
    const useCase = new GetAttendanceScopeBreakdownUseCase(repository);

    const result = await useCase.execute({
      groupBy: AttendanceReportScopeGroupBy.CLASSROOM,
    });

    expect(result.items).toEqual([
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
    ]);
  });

  it('builds a derived daily absence report from submitted selected period evidence', async () => {
    const repository = {
      findAcademicYearById: jest.fn().mockResolvedValue({ id: 'year-1' }),
      findTermById: jest
        .fn()
        .mockResolvedValue({ id: 'term-1', academicYearId: 'year-1' }),
      listDerivedDailyAbsenceEvidence: jest.fn().mockResolvedValue([
        derivedEvidence({
          id: 'entry-1',
          status: AttendanceStatus.ABSENT,
          periodId: 'period-1',
        }),
        derivedEvidence({
          id: 'entry-2',
          status: AttendanceStatus.ABSENT,
          periodId: 'period-2',
        }),
        derivedEvidence({
          id: 'entry-3',
          studentId: 'student-below-threshold',
          status: AttendanceStatus.LATE,
          periodId: 'period-1',
        }),
      ]),
    } as unknown as AttendanceReportsRepository;
    const useCase = new GetDerivedDailyAbsencesReportUseCase(repository);

    const result = await useCase.execute({
      academicYearId: 'year-1',
      termId: 'term-1',
      dateFrom: '2026-09-15',
      dateTo: '2026-09-15',
    });

    expect(repository.listDerivedDailyAbsenceEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        academicYearId: 'year-1',
        termId: 'term-1',
        dateFrom: new Date('2026-09-15T00:00:00.000Z'),
        dateTo: new Date('2026-09-15T00:00:00.000Z'),
      }),
    );
    expect(result.items).toEqual([
      expect.objectContaining({
        date: '2026-09-15',
        studentId: 'student-1',
        policyId: 'policy-1',
        missedPeriodCount: 2,
        requiredMissedPeriodsCount: 2,
        missedPeriodIds: ['period-1', 'period-2'],
        derivedStatus: AttendanceStatus.ABSENT,
        source: DailyComputationStrategy.DERIVED_FROM_PERIODS,
        reportOnly: true,
      }),
    ]);

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('schoolId');
    expect(serialized).not.toContain('organizationId');
    expect(serialized).not.toContain('membershipId');
    expect(serialized).not.toContain('roleId');
    expect(serialized).not.toContain('deletedAt');
    expect(serialized).not.toContain('markedById');
    expect(serialized).not.toContain('submittedById');
  });
});

function derivedEvidence(overrides: {
  id: string;
  studentId?: string;
  status: AttendanceStatus;
  periodId: string;
}) {
  const timestamp = new Date('2026-09-15T10:00:00.000Z');

  return {
    id: overrides.id,
    studentId: overrides.studentId ?? 'student-1',
    enrollmentId: 'enrollment-1',
    status: overrides.status,
    updatedAt: timestamp,
    session: {
      id: `session-${overrides.periodId}`,
      date: new Date('2026-09-15T00:00:00.000Z'),
      scopeType: AttendanceScopeType.CLASSROOM,
      scopeKey: 'classroom:classroom-1',
      stageId: 'stage-1',
      gradeId: 'grade-1',
      sectionId: 'section-1',
      classroomId: 'classroom-1',
      mode: AttendanceMode.PERIOD,
      periodId: overrides.periodId,
      periodKey: `period-key-${overrides.periodId}`,
      policyId: 'policy-1',
      status: AttendanceSessionStatus.SUBMITTED,
      submittedAt: timestamp,
      updatedAt: timestamp,
      policy: {
        id: 'policy-1',
        dailyComputationStrategy: DailyComputationStrategy.DERIVED_FROM_PERIODS,
        selectedPeriodIds: ['period-1', 'period-2'],
        absentIfMissedPeriodsCount: 2,
        updatedAt: timestamp,
      },
    },
  };
}
