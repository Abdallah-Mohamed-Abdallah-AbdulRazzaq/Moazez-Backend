import {
  AttendanceMode,
  AttendanceScopeType,
  AttendanceSessionStatus,
  AttendanceStatus,
  StudentStatus,
} from '@prisma/client';
import { presentAttendanceAbsenceIncident } from '../presenters/attendance-absences.presenter';

describe('Attendance absences presenter', () => {
  it('shapes an incident row with session, student, placement, and period fields', () => {
    const timestamp = new Date('2026-09-15T07:00:00.000Z');

    const result = presentAttendanceAbsenceIncident({
      id: 'entry-1',
      schoolId: 'school-1',
      sessionId: 'session-1',
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      status: AttendanceStatus.LATE,
      lateMinutes: 8,
      earlyLeaveMinutes: null,
      excuseReason: null,
      note: 'Traffic',
      createdAt: timestamp,
      updatedAt: timestamp,
      student: {
        id: 'student-1',
        firstName: 'Layla',
        lastName: 'Hassan',
        status: StudentStatus.ACTIVE,
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
      session: {
        id: 'session-1',
        schoolId: 'school-1',
        academicYearId: 'year-1',
        termId: 'term-1',
        date: new Date('2026-09-15T00:00:00.000Z'),
        scopeType: AttendanceScopeType.CLASSROOM,
        scopeKey: 'classroom:classroom-1',
        stageId: 'stage-1',
        gradeId: 'grade-1',
        sectionId: 'section-1',
        classroomId: 'classroom-1',
        mode: AttendanceMode.PERIOD,
        periodId: 'period-1',
        periodKey: 'period-1',
        periodLabelAr: 'Period AR',
        periodLabelEn: 'Period 1',
        policyId: 'policy-1',
        status: AttendanceSessionStatus.SUBMITTED,
        submittedAt: timestamp,
        submittedById: 'user-1',
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
        stage: null,
        grade: null,
        section: null,
        classroom: null,
      },
    });

    expect(result).toMatchObject({
      id: 'entry-1',
      incidentId: 'entry-1',
      sessionId: 'session-1',
      entryId: 'entry-1',
      yearId: 'year-1',
      date: '2026-09-15',
      status: AttendanceStatus.LATE,
      lateMinutes: 8,
      minutesLate: 8,
      periodKey: 'period-1',
      periodNameEn: 'Period 1',
      student: {
        id: 'student-1',
        name: 'Layla Hassan',
      },
      classroom: {
        id: 'classroom-1',
        name: 'Classroom 1A',
      },
      scopeIds: {
        stageId: 'stage-1',
        gradeId: 'grade-1',
        sectionId: 'section-1',
        classroomId: 'classroom-1',
      },
    });
  });
});
