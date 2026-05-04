import type { TeacherAppClassMetricRecord } from '../../shared/infrastructure/teacher-app-composition-read.adapter';
import type { TeacherAppAllocationRecord } from '../../shared/teacher-app.types';
import { TeacherClassPresenter } from '../presenters/teacher-class.presenter';

describe('TeacherClassPresenter', () => {
  it('maps allocation-backed class rows to app-facing fields', () => {
    const result = TeacherClassPresenter.presentClass(allocationFixture(), {
      studentsCount: 24,
      activeAssignmentsCount: 2,
      pendingReviewCount: 3,
      followUpCount: null,
      pendingAttendanceCount: null,
      todayAttendanceStatus: null,
      lastAttendanceStatus: null,
      averageGrade: null,
      completionRate: null,
    });

    expect(result).toMatchObject({
      id: 'allocation-1',
      classId: 'allocation-1',
      classroomId: 'classroom-1',
      classroomName: 'Classroom',
      className: 'Classroom',
      subjectId: 'subject-1',
      subjectName: 'Math',
      termId: 'term-1',
      termName: 'Term',
      gradeId: 'grade-1',
      gradeName: 'Grade',
      sectionId: 'section-1',
      sectionName: 'Section',
      stageId: 'stage-1',
      stageName: 'Stage',
      cycleId: 'stage-1',
      cycleName: 'Stage',
      studentsCount: 24,
      activeAssignmentsCount: 2,
      pendingReviewCount: 3,
      averageGrade: null,
      completionRate: null,
    });
  });

  it('omits schoolId and never emits scheduleId or raw timetable fields', () => {
    const result = TeacherClassPresenter.presentDetail({
      allocation: allocationFixture(),
      metric: metricFixture(),
    });
    const json = JSON.stringify(result);

    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('scheduleId');
    expect(json).not.toContain('weeklyPeriods');
    expect(json).not.toContain('todayPeriods');
    expect(json).not.toContain('focusItem');
  });

  it('returns stable nulls for unavailable metrics', () => {
    const result = TeacherClassPresenter.presentClass(allocationFixture());

    expect(result).toMatchObject({
      studentsCount: 0,
      activeAssignmentsCount: null,
      pendingReviewCount: null,
      followUpCount: null,
      pendingAttendanceCount: null,
      todayAttendanceStatus: null,
      lastAttendanceStatus: null,
      averageGrade: null,
      completionRate: null,
      needsPreparation: null,
      note: null,
    });
  });
});

function metricFixture(): TeacherAppClassMetricRecord {
  return {
    studentsCount: 24,
    activeAssignmentsCount: 2,
    pendingReviewCount: 3,
    followUpCount: null,
    pendingAttendanceCount: null,
    todayAttendanceStatus: null,
    lastAttendanceStatus: null,
    averageGrade: null,
    completionRate: null,
  };
}

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
      roomId: 'room-1',
      nameAr: 'Classroom AR',
      nameEn: 'Classroom',
      room: {
        id: 'room-1',
        schoolId,
        nameAr: 'Room AR',
        nameEn: 'Room',
      },
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
