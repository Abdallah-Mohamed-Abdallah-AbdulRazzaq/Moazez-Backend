import {
  HomeworkAssignmentMode,
  HomeworkAssignmentStatus,
  HomeworkTargetStatus,
} from '@prisma/client';
import {
  deriveStudentHomeworkStatus,
  StudentHomeworksPresenter,
} from '../presenters/student-homeworks.presenter';

describe('StudentHomeworksPresenter', () => {
  it('presents safe list and detail shapes without tenant or ownership internals', () => {
    const target = homeworkTargetFixture();
    const list = StudentHomeworksPresenter.presentList({
      items: [target as any],
      total: 1,
      page: 1,
      limit: 25,
    });
    const detail = StudentHomeworksPresenter.presentDetail(target as any);
    const serialized = JSON.stringify({ list, detail });

    expect(list.homeworks[0]).toMatchObject({
      homeworkId: 'homework-1',
      title: 'Read chapter 3',
      mode: 'homework',
      status: 'waiting',
      assignmentStatus: 'published',
      targetStatus: 'assigned',
      questionCount: 0,
      attachmentsCount: 0,
      submittedAt: null,
      reviewedAt: null,
    });
    expect(detail.homework).toMatchObject({
      homeworkId: 'homework-1',
      questions: [],
      attachments: [],
      submission: null,
    });
    expect(serialized).not.toContain('schoolId');
    expect(serialized).not.toContain('organizationId');
    expect(serialized).not.toContain('teacherSubjectAllocationId');
    expect(serialized).not.toContain('enrollmentId');
    expect(serialized).not.toContain('targetId');
    expect(serialized).not.toContain('guardian');
    expect(serialized).not.toContain('phone');
    expect(serialized).not.toContain('email');
  });

  it('maps target and assignment state to stable Student App statuses', () => {
    const now = new Date('2026-09-10T10:00:00.000Z');

    expect(
      deriveStudentHomeworkStatus(
        homeworkTargetFixture({
          targetStatus: HomeworkTargetStatus.ASSIGNED,
          dueAt: new Date('2026-09-11T10:00:00.000Z'),
        }) as any,
        now,
      ),
    ).toBe('waiting');
    expect(
      deriveStudentHomeworkStatus(
        homeworkTargetFixture({
          targetStatus: HomeworkTargetStatus.VIEWED,
          dueAt: new Date('2026-09-09T10:00:00.000Z'),
        }) as any,
        now,
      ),
    ).toBe('not_completed');
    expect(
      deriveStudentHomeworkStatus(
        homeworkTargetFixture({
          targetStatus: HomeworkTargetStatus.SUBMITTED,
          dueAt: new Date('2026-09-09T10:00:00.000Z'),
        }) as any,
        now,
      ),
    ).toBe('completed');
    expect(
      deriveStudentHomeworkStatus(
        homeworkTargetFixture({
          targetStatus: HomeworkTargetStatus.REVIEWED,
          assignmentStatus: HomeworkAssignmentStatus.CLOSED,
        }) as any,
        now,
      ),
    ).toBe('completed');
    expect(
      deriveStudentHomeworkStatus(
        homeworkTargetFixture({
          targetStatus: HomeworkTargetStatus.ASSIGNED,
          assignmentStatus: HomeworkAssignmentStatus.CLOSED,
        }) as any,
        now,
      ),
    ).toBe('not_completed');
  });
});

function homeworkTargetFixture(overrides?: {
  targetStatus?: HomeworkTargetStatus;
  assignmentStatus?: HomeworkAssignmentStatus;
  dueAt?: Date;
}) {
  return {
    id: 'target-1',
    studentId: 'student-1',
    enrollmentId: 'enrollment-1',
    status: overrides?.targetStatus ?? HomeworkTargetStatus.ASSIGNED,
    assignedAt: new Date('2026-09-10T08:00:00.000Z'),
    viewedAt: null,
    submittedAt: null,
    reviewedAt: null,
    excusedAt: null,
    createdAt: new Date('2026-09-10T08:00:00.000Z'),
    updatedAt: new Date('2026-09-10T08:00:00.000Z'),
    homeworkAssignment: {
      id: 'homework-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      classroomId: 'classroom-1',
      subjectId: 'subject-1',
      teacherUserId: 'teacher-1',
      timetableEntryId: null,
      scheduleDate: null,
      title: 'Read chapter 3',
      description: 'Practice silently',
      mode: HomeworkAssignmentMode.HOMEWORK,
      status: overrides?.assignmentStatus ?? HomeworkAssignmentStatus.PUBLISHED,
      publishAt: null,
      publishedAt: new Date('2026-09-10T08:00:00.000Z'),
      dueAt: overrides?.dueAt ?? new Date('2026-09-11T10:00:00.000Z'),
      closedAt: null,
      estimatedMinutes: 20,
      totalMarks: { toNumber: () => 10 },
      isGraded: true,
      deletedAt: null,
      createdAt: new Date('2026-09-10T08:00:00.000Z'),
      updatedAt: new Date('2026-09-10T08:00:00.000Z'),
      academicYear: {
        id: 'year-1',
        nameAr: '2026',
        nameEn: '2026/2027',
      },
      term: {
        id: 'term-1',
        nameAr: 'Term AR',
        nameEn: 'Term 1',
      },
      classroom: {
        id: 'classroom-1',
        nameAr: 'Class AR',
        nameEn: 'Class 1',
        section: {
          id: 'section-1',
          nameAr: 'Section AR',
          nameEn: 'Section A',
          grade: {
            id: 'grade-1',
            nameAr: 'Grade AR',
            nameEn: 'Grade 1',
          },
        },
      },
      subject: {
        id: 'subject-1',
        nameAr: 'Math AR',
        nameEn: 'Math',
        code: 'MATH',
        color: '#336699',
      },
      teacherUser: {
        id: 'teacher-1',
        firstName: 'Teacher',
        lastName: 'One',
      },
    },
  };
}
