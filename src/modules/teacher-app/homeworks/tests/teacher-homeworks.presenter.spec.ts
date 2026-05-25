import {
  HomeworkAssignmentMode,
  HomeworkAssignmentStatus,
  HomeworkSubmissionStatus,
  HomeworkTargetMode,
  HomeworkTargetStatus,
} from '@prisma/client';
import { HomeworkAssignmentResponseDto } from '../../../homework/dto/homework-assignment-response.dto';
import { TeacherAppAllocationRecord } from '../../shared/teacher-app.types';
import { TeacherHomeworksPresenter } from '../presenters/teacher-homeworks.presenter';

describe('TeacherHomeworksPresenter', () => {
  it('maps core assignment responses to app-facing classId and omits tenant/internal ids', () => {
    const response =
      TeacherHomeworksPresenter.presentAssignment(coreAssignment());
    const json = JSON.stringify(response);

    expect(response.classId).toBe('allocation-1');
    expect(response).not.toHaveProperty('teacherSubjectAllocationId');
    expect(response).not.toHaveProperty('teacher');
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('organizationId');
  });

  it('builds dashboard totals and class cards from owned allocations only', () => {
    const now = new Date('2026-09-10T10:00:00.000Z');

    const dashboard = TeacherHomeworksPresenter.presentDashboard({
      allocations: [allocation('allocation-1'), allocation('allocation-2')],
      academicYears: [
        { id: 'year-1', nameAr: 'عام 2026', nameEn: '2026/2027' },
      ],
      now,
      assignments: [
        dashboardAssignment({
          id: 'homework-1',
          classId: 'allocation-1',
          status: HomeworkAssignmentStatus.DRAFT,
          dueAt: new Date('2026-09-20T10:00:00.000Z'),
          targetStatuses: [HomeworkTargetStatus.ASSIGNED],
        }),
        dashboardAssignment({
          id: 'homework-2',
          classId: 'allocation-2',
          status: HomeworkAssignmentStatus.PUBLISHED,
          dueAt: new Date('2026-09-12T10:00:00.000Z'),
          targetStatuses: [
            HomeworkTargetStatus.SUBMITTED,
            HomeworkTargetStatus.REVIEWED,
          ],
        }),
        dashboardAssignment({
          id: 'homework-other',
          classId: 'other-allocation',
          status: HomeworkAssignmentStatus.CLOSED,
          dueAt: new Date('2026-09-11T10:00:00.000Z'),
          targetStatuses: [HomeworkTargetStatus.SUBMITTED],
        }),
      ],
    });

    expect(dashboard.classes.map((classCard) => classCard.classId)).toEqual([
      'allocation-1',
      'allocation-2',
    ]);
    expect(dashboard.totals).toMatchObject({
      totalAssignments: 2,
      draft: 1,
      published: 1,
      closed: 0,
      cancelled: 0,
      waitingReview: 1,
      dueSoon: 1,
    });
    expect(dashboard.classes[1].counters).toMatchObject({
      totalTargets: 2,
      submitted: 1,
      reviewed: 1,
      waitingReview: 1,
    });
    expect(JSON.stringify(dashboard)).not.toContain('schoolId');
    expect(JSON.stringify(dashboard)).not.toContain('organizationId');
  });

  it('presents safe target rows without guardian or contact data', () => {
    const result = TeacherHomeworksPresenter.presentTargetsList({
      items: [
        {
          targetId: 'target-1',
          studentId: 'student-1',
          enrollmentId: 'enrollment-1',
          student: {
            id: 'student-1',
            displayName: 'Learner One',
          },
          status: 'assigned',
          assignedAt: '2026-09-10T10:00:00.000Z',
          viewedAt: null,
          submittedAt: null,
          reviewedAt: null,
          excusedAt: null,
        },
      ],
    });
    const json = JSON.stringify(result);

    expect(result.items[0]).toEqual(
      expect.objectContaining({
        targetId: 'target-1',
        studentId: 'student-1',
        enrollmentId: 'enrollment-1',
      }),
    );
    expect(json).not.toContain('guardian');
    expect(json).not.toContain('phone');
    expect(json).not.toContain('email');
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('organizationId');
  });

  it('presents submitted homework submissions with review metadata and no tenant internals', () => {
    const result = TeacherHomeworksPresenter.presentSubmissionsList({
      items: [
        reviewSubmission({
          status: HomeworkSubmissionStatus.REVIEWED,
          submittedAt: new Date('2026-09-10T09:00:00.000Z'),
          reviewedAt: new Date('2026-09-10T11:00:00.000Z'),
          reviewNote: 'Good work',
          awardedMarks: { toNumber: () => 8.5 },
        }),
      ],
      page: 1,
      limit: 25,
      total: 1,
    } as any);
    const json = JSON.stringify(result);

    expect(result.submissions[0]).toEqual({
      id: 'submission-1',
      homeworkId: 'homework-1',
      targetId: 'target-1',
      student: {
        id: 'student-1',
        displayName: 'Learner One',
        studentNumber: null,
      },
      status: 'reviewed',
      bodyText: 'Submitted answer',
      submittedAt: '2026-09-10T09:00:00.000Z',
      reviewedAt: '2026-09-10T11:00:00.000Z',
      reviewNote: 'Good work',
      awardedMarks: 8.5,
      totalMarks: 10,
      isLate: false,
      createdAt: '2026-09-10T08:00:00.000Z',
      updatedAt: '2026-09-10T11:00:00.000Z',
    });
    expect(result.pagination).toEqual({ page: 1, limit: 25, total: 1 });
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('organizationId');
    expect(json).not.toContain('enrollmentId');
    expect(json).not.toContain('reviewedByUserId');
  });
});

function coreAssignment(
  overrides?: Partial<HomeworkAssignmentResponseDto>,
): HomeworkAssignmentResponseDto {
  return {
    id: 'homework-1',
    title: 'Reading practice',
    description: null,
    mode: 'homework',
    status: 'draft',
    targetMode: 'classroom',
    academicYear: {
      id: 'year-1',
      name: '2026/2027',
      nameAr: 'عام 2026',
      nameEn: '2026/2027',
    },
    term: {
      id: 'term-1',
      name: 'Term 1',
      nameAr: 'ترم 1',
      nameEn: 'Term 1',
      startDate: '2026-09-01',
      endDate: '2026-12-31',
    },
    classroom: {
      id: 'classroom-1',
      name: 'Classroom 1',
      nameAr: 'فصل 1',
      nameEn: 'Classroom 1',
      section: {
        id: 'section-1',
        name: 'A',
        nameAr: 'أ',
        nameEn: 'A',
      },
      grade: {
        id: 'grade-1',
        name: 'Grade 1',
        nameAr: 'صف 1',
        nameEn: 'Grade 1',
      },
    },
    subject: {
      id: 'subject-1',
      name: 'Math',
      nameAr: 'رياضيات',
      nameEn: 'Math',
      code: 'MATH',
      color: '#336699',
    },
    teacher: {
      userId: 'teacher-1',
      fullName: 'Teacher One',
    },
    teacherSubjectAllocationId: 'allocation-1',
    timetableEntryId: null,
    scheduleDate: null,
    publishAt: null,
    publishedAt: null,
    dueAt: '2026-09-20T10:00:00.000Z',
    closedAt: null,
    estimatedMinutes: 30,
    totalMarks: null,
    isGraded: false,
    counters: {
      totalTargets: 1,
      assigned: 1,
      viewed: 0,
      submitted: 0,
      late: 0,
      missing: 0,
      reviewed: 0,
      excused: 0,
    },
    createdAt: '2026-09-10T10:00:00.000Z',
    updatedAt: '2026-09-10T10:00:00.000Z',
    ...overrides,
  };
}

function allocation(id: string): TeacherAppAllocationRecord {
  return {
    id,
    schoolId: 'school-1',
    teacherUserId: 'teacher-1',
    subjectId: `subject-${id}`,
    classroomId: `classroom-${id}`,
    termId: 'term-1',
    subject: {
      id: `subject-${id}`,
      schoolId: 'school-1',
      nameAr: 'رياضيات',
      nameEn: 'Math',
      code: 'MATH',
    },
    classroom: {
      id: `classroom-${id}`,
      schoolId: 'school-1',
      sectionId: 'section-1',
      roomId: null,
      nameAr: 'فصل',
      nameEn: `Classroom ${id}`,
      room: null,
      section: {
        id: 'section-1',
        schoolId: 'school-1',
        gradeId: 'grade-1',
        nameAr: 'أ',
        nameEn: 'A',
        grade: {
          id: 'grade-1',
          schoolId: 'school-1',
          stageId: 'stage-1',
          nameAr: 'صف 1',
          nameEn: 'Grade 1',
          stage: {
            id: 'stage-1',
            schoolId: 'school-1',
            nameAr: 'مرحلة',
            nameEn: 'Stage',
          },
        },
      },
    },
    term: {
      id: 'term-1',
      schoolId: 'school-1',
      academicYearId: 'year-1',
      nameAr: 'ترم 1',
      nameEn: 'Term 1',
      isActive: true,
    },
  };
}

function dashboardAssignment(params: {
  id: string;
  classId: string;
  status: HomeworkAssignmentStatus;
  dueAt: Date;
  targetStatuses: HomeworkTargetStatus[];
}) {
  return {
    id: params.id,
    teacherSubjectAllocationId: params.classId,
    title: params.id,
    description: null,
    mode: HomeworkAssignmentMode.HOMEWORK,
    status: params.status,
    targetMode: HomeworkTargetMode.CLASSROOM,
    dueAt: params.dueAt,
    targets: params.targetStatuses.map((status) => ({ status })),
  };
}

function reviewSubmission(overrides?: Record<string, unknown>): any {
  return {
    id: 'submission-1',
    schoolId: 'school-1',
    homeworkAssignmentId: 'homework-1',
    homeworkTargetId: 'target-1',
    studentId: 'student-1',
    enrollmentId: 'enrollment-1',
    status: HomeworkSubmissionStatus.SUBMITTED,
    bodyText: 'Submitted answer',
    submittedAt: new Date('2026-09-10T09:00:00.000Z'),
    reviewedAt: null,
    reviewedByUserId: null,
    reviewNote: null,
    awardedMarks: null,
    createdAt: new Date('2026-09-10T08:00:00.000Z'),
    updatedAt: new Date('2026-09-10T11:00:00.000Z'),
    student: {
      id: 'student-1',
      firstName: 'Learner',
      lastName: 'One',
    },
    homeworkAssignment: {
      id: 'homework-1',
      status: HomeworkAssignmentStatus.PUBLISHED,
      dueAt: new Date('2026-09-11T10:00:00.000Z'),
      totalMarks: { toNumber: () => 10 },
      isGraded: true,
      deletedAt: null,
    },
    homeworkTarget: {
      id: 'target-1',
      status: HomeworkTargetStatus.SUBMITTED,
      submittedAt: new Date('2026-09-10T09:00:00.000Z'),
      reviewedAt: null,
    },
    ...overrides,
  };
}
