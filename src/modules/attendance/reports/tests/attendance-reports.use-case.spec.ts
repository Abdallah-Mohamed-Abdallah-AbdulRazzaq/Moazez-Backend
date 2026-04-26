import {
  AttendanceMode,
  AttendanceScopeType,
  AttendanceSessionStatus,
  AttendanceStatus,
} from '@prisma/client';
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
});
