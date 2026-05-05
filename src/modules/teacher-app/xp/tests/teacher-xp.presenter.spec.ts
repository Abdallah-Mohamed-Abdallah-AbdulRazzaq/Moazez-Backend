import {
  StudentEnrollmentStatus,
  StudentStatus,
  XpSourceType,
} from '@prisma/client';
import type { TeacherAppAllocationRecord } from '../../shared/teacher-app.types';
import type {
  TeacherXpLedgerRecord,
  TeacherXpOwnedEnrollmentRecord,
} from '../infrastructure/teacher-xp-read.adapter';
import { TeacherXpPresenter } from '../presenters/teacher-xp.presenter';

describe('TeacherXpPresenter', () => {
  it('presents dashboard, class, student, and history XP responses safely', () => {
    const allocations = [allocationFixture()];
    const enrollments = [
      ownedEnrollmentFixture({
        id: 'enrollment-1',
        studentId: 'student-1',
        firstName: 'Mona',
        lastName: 'Ahmed',
      }),
      ownedEnrollmentFixture({
        id: 'enrollment-2',
        studentId: 'student-2',
        firstName: 'Omar',
        lastName: 'Ali',
      }),
    ];
    const ledger = [
      ledgerFixture({
        id: 'xp-1',
        studentId: 'student-1',
        enrollmentId: 'enrollment-1',
        amount: 25,
      }),
      ledgerFixture({
        id: 'xp-2',
        studentId: 'student-2',
        enrollmentId: 'enrollment-2',
        amount: 15,
        firstName: 'Omar',
        lastName: 'Ali',
      }),
    ];

    const dashboard = TeacherXpPresenter.presentDashboard({
      allocations,
      ownedEnrollments: enrollments,
      ledger,
    });
    const classXp = TeacherXpPresenter.presentClass({
      allocation: allocations[0],
      ownedEnrollments: enrollments,
      ledger,
    });
    const studentXp = TeacherXpPresenter.presentStudent({
      studentId: 'student-1',
      ownedEnrollments: enrollments,
      ledger,
    });
    const history = TeacherXpPresenter.presentHistory({
      studentId: 'student-1',
      ledger: [ledger[0]],
      pagination: { page: 1, limit: 20, total: 1 },
    });
    const json = JSON.stringify({ dashboard, classXp, studentXp, history });

    expect(dashboard.summary).toEqual({
      studentsCount: 2,
      totalXp: 40,
      averageXp: 20,
      topStudent: {
        studentId: 'student-1',
        displayName: 'Mona Ahmed',
        totalXp: 25,
      },
      recentActivityCount: 2,
    });
    expect(classXp).toMatchObject({
      classId: 'allocation-1',
      className: 'Classroom',
      subjectName: 'Math',
      students: [
        expect.objectContaining({
          studentId: 'student-1',
          totalXp: 25,
          rank: null,
          tier: null,
          level: null,
        }),
        expect.objectContaining({
          studentId: 'student-2',
          totalXp: 15,
          rank: null,
          tier: null,
          level: null,
        }),
      ],
    });
    expect(studentXp).toMatchObject({
      studentId: 'student-1',
      displayName: 'Mona Ahmed',
      totalXp: 25,
      rank: null,
      tier: null,
      level: null,
      recentActivity: [
        expect.objectContaining({
          xpId: 'xp-1',
          sourceType: 'reinforcement_task',
        }),
      ],
    });
    expect(history).toMatchObject({
      studentId: 'student-1',
      pagination: { page: 1, limit: 20, total: 1 },
      items: [expect.objectContaining({ xpId: 'xp-1', amount: 25 })],
    });
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('scheduleId');
    expect(json).not.toContain('actorUserId');
    expect(json).not.toContain('metadata');
    expect(json).not.toContain('BehaviorPointLedger');
    expect(json).not.toContain('behaviorPoint');
  });
});

function allocationFixture(): TeacherAppAllocationRecord {
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
  };
}

function ownedEnrollmentFixture(params: {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
}): TeacherXpOwnedEnrollmentRecord {
  return {
    id: params.id,
    studentId: params.studentId,
    academicYearId: 'year-1',
    termId: 'term-1',
    classroomId: 'classroom-1',
    status: StudentEnrollmentStatus.ACTIVE,
    student: {
      id: params.studentId,
      firstName: params.firstName,
      lastName: params.lastName,
      status: StudentStatus.ACTIVE,
    },
    classroom: {
      id: 'classroom-1',
      nameAr: 'Classroom AR',
      nameEn: 'Classroom',
      section: {
        id: 'section-1',
        nameAr: 'Section AR',
        nameEn: 'Section',
        grade: {
          id: 'grade-1',
          nameAr: 'Grade AR',
          nameEn: 'Grade',
          stage: {
            id: 'stage-1',
            nameAr: 'Stage AR',
            nameEn: 'Stage',
          },
        },
      },
    },
  } as TeacherXpOwnedEnrollmentRecord;
}

function ledgerFixture(params: {
  id: string;
  studentId: string;
  enrollmentId: string;
  amount: number;
  firstName?: string;
  lastName?: string;
}): TeacherXpLedgerRecord {
  const now = new Date('2026-09-17T10:00:00.000Z');
  return {
    id: params.id,
    academicYearId: 'year-1',
    termId: 'term-1',
    studentId: params.studentId,
    enrollmentId: params.enrollmentId,
    assignmentId: 'assignment-1',
    sourceType: XpSourceType.REINFORCEMENT_TASK,
    sourceId: 'submission-1',
    amount: params.amount,
    reason: 'approved_task',
    reasonAr: null,
    occurredAt: now,
    createdAt: now,
    student: {
      id: params.studentId,
      firstName: params.firstName ?? 'Mona',
      lastName: params.lastName ?? 'Ahmed',
      status: StudentStatus.ACTIVE,
    },
    enrollment: {
      id: params.enrollmentId,
      studentId: params.studentId,
      academicYearId: 'year-1',
      termId: 'term-1',
      classroomId: 'classroom-1',
    },
  } as TeacherXpLedgerRecord;
}
