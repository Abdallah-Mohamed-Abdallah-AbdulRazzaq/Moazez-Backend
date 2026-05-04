import { StudentStatus } from '@prisma/client';
import type { TeacherAppAllocationRecord } from '../../shared/teacher-app.types';
import { TeacherClassroomPresenter } from '../presenters/teacher-classroom.presenter';

describe('TeacherClassroomPresenter', () => {
  it('presents classroom detail using TeacherSubjectAllocation.id as classId', () => {
    const result = TeacherClassroomPresenter.presentDetail({
      allocation: allocationFixture(),
      studentsCount: 24,
    });

    expect(result).toMatchObject({
      classId: 'allocation-1',
      classroom: {
        id: 'classroom-1',
        name: 'Classroom',
        code: null,
      },
      subject: {
        id: 'subject-1',
        name: 'Math',
      },
      term: {
        id: 'term-1',
        name: 'Term',
      },
      academicHierarchy: {
        stageName: 'Stage',
        gradeName: 'Grade',
        sectionName: 'Section',
      },
      summary: {
        studentsCount: 24,
        presentTodayCount: null,
        absentTodayCount: null,
        pendingAssignmentsCount: null,
        averageGrade: null,
        behaviorAlertsCount: null,
      },
    });
  });

  it('returns stable nulls and timetable unavailable schedule data', () => {
    const result = TeacherClassroomPresenter.presentDetail({
      allocation: allocationFixture(),
      studentsCount: 0,
    });

    expect(result.summary).toEqual({
      studentsCount: 0,
      presentTodayCount: null,
      absentTodayCount: null,
      pendingAssignmentsCount: null,
      averageGrade: null,
      behaviorAlertsCount: null,
    });
    expect(result.schedule).toEqual({
      available: false,
      reason: 'timetable_not_available',
    });
  });

  it('does not expose schoolId or scheduleId', () => {
    const detail = TeacherClassroomPresenter.presentDetail({
      allocation: allocationFixture(),
      studentsCount: 1,
    });
    const roster = TeacherClassroomPresenter.presentRoster({
      classId: 'allocation-1',
      students: [
        {
          id: 'student-1',
          firstName: 'Mona',
          lastName: 'Ahmed',
          status: StudentStatus.ACTIVE,
        },
      ],
      pagination: { page: 1, limit: 20, total: 1 },
    });
    const json = JSON.stringify({ detail, roster });

    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('scheduleId');
  });

  it('presents roster students with safe nullable classroom metrics', () => {
    const result = TeacherClassroomPresenter.presentRoster({
      classId: 'allocation-1',
      students: [
        {
          id: 'student-1',
          firstName: 'Mona',
          lastName: 'Ahmed',
          status: StudentStatus.ACTIVE,
        },
      ],
      pagination: { page: 1, limit: 20, total: 1 },
    });

    expect(result).toEqual({
      classId: 'allocation-1',
      students: [
        {
          id: 'student-1',
          displayName: 'Mona Ahmed',
          studentNumber: null,
          avatarUrl: null,
          status: 'active',
          attendanceToday: null,
          latestGrade: null,
          behaviorSummary: null,
        },
      ],
      pagination: { page: 1, limit: 20, total: 1 },
    });
  });
});

function allocationFixture(
  overrides?: Partial<TeacherAppAllocationRecord>,
): TeacherAppAllocationRecord {
  const schoolId = 'school-1';

  return {
    id: 'allocation-1',
    schoolId,
    teacherUserId: 'teacher-1',
    subjectId: 'subject-1',
    classroomId: 'classroom-1',
    termId: 'term-1',
    subject: {
      id: 'subject-1',
      schoolId,
      nameAr: 'Math AR',
      nameEn: 'Math',
      code: 'MATH',
    },
    classroom: {
      id: 'classroom-1',
      schoolId,
      sectionId: 'section-1',
      roomId: null,
      nameAr: 'Classroom AR',
      nameEn: 'Classroom',
      room: null,
      section: {
        id: 'section-1',
        schoolId,
        gradeId: 'grade-1',
        nameAr: 'Section AR',
        nameEn: 'Section',
        grade: {
          id: 'grade-1',
          schoolId,
          stageId: 'stage-1',
          nameAr: 'Grade AR',
          nameEn: 'Grade',
          stage: {
            id: 'stage-1',
            schoolId,
            nameAr: 'Stage AR',
            nameEn: 'Stage',
          },
        },
      },
    },
    term: {
      id: 'term-1',
      schoolId,
      academicYearId: 'year-1',
      nameAr: 'Term AR',
      nameEn: 'Term',
      isActive: true,
    },
    ...overrides,
  };
}
