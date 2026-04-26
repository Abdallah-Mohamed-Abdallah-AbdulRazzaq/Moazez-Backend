import {
  AttendanceMode,
  AttendanceScopeType,
  AttendanceSessionStatus,
  AttendanceStatus,
  StudentStatus,
} from '@prisma/client';
import { presentRollCallSession } from '../presenters/attendance-roll-call.presenter';

describe('Attendance roll-call presenter', () => {
  it('shapes session detail with ISO dates and student placement', () => {
    const date = new Date('2026-09-15T00:00:00.000Z');
    const timestamp = new Date('2026-09-15T07:00:00.000Z');

    const result = presentRollCallSession({
      id: 'session-1',
      schoolId: 'school-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      date,
      scopeType: AttendanceScopeType.CLASSROOM,
      scopeKey: 'classroom:classroom-1',
      stageId: 'stage-1',
      gradeId: 'grade-1',
      sectionId: 'section-1',
      classroomId: 'classroom-1',
      mode: AttendanceMode.DAILY,
      periodId: null,
      periodKey: 'daily',
      periodLabelAr: null,
      periodLabelEn: null,
      policyId: 'policy-1',
      status: AttendanceSessionStatus.DRAFT,
      submittedAt: null,
      submittedById: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
      entries: [
        {
          id: 'entry-1',
          schoolId: 'school-1',
          sessionId: 'session-1',
          studentId: 'student-1',
          enrollmentId: 'enrollment-1',
          status: AttendanceStatus.LATE,
          lateMinutes: 7,
          earlyLeaveMinutes: null,
          excuseReason: null,
          note: 'Traffic',
          markedById: 'user-1',
          markedAt: timestamp,
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
        },
      ],
    });

    expect(result.session).toMatchObject({
      id: 'session-1',
      yearId: 'year-1',
      date: '2026-09-15',
      policyId: 'policy-1',
      scopeIds: {
        stageId: 'stage-1',
        gradeId: 'grade-1',
        sectionId: 'section-1',
        classroomId: 'classroom-1',
      },
    });
    expect(result.entries[0]).toMatchObject({
      id: 'entry-1',
      status: AttendanceStatus.LATE,
      lateMinutes: 7,
      minutesLate: 7,
      student: {
        id: 'student-1',
        name: 'Layla Hassan',
        classroom: {
          id: 'classroom-1',
          name: 'Classroom 1A',
        },
      },
    });
  });
});
