import { XpSourceType } from '@prisma/client';
import { TeacherAppAllocationReadAdapter } from '../../access/teacher-app-allocation-read.adapter';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import {
  TeacherAppAllocationNotFoundException,
  TeacherAppRequiredTeacherException,
} from '../../shared/teacher-app.errors';
import type { TeacherAppAllocationRecord } from '../../shared/teacher-app.types';
import { GetTeacherClassXpUseCase } from '../application/get-teacher-class-xp.use-case';
import { GetTeacherStudentXpUseCase } from '../application/get-teacher-student-xp.use-case';
import { GetTeacherXpDashboardUseCase } from '../application/get-teacher-xp-dashboard.use-case';
import { ListTeacherStudentXpHistoryUseCase } from '../application/list-teacher-student-xp-history.use-case';
import {
  TeacherXpLedgerRecord,
  TeacherXpOwnedEnrollmentRecord,
  TeacherXpReadAdapter,
} from '../infrastructure/teacher-xp-read.adapter';

const TEACHER_ID = 'teacher-1';

describe('Teacher XP use cases', () => {
  it('dashboard rejects non-teacher actors through the access service', async () => {
    const { dashboardUseCase, accessService } = createUseCases();
    accessService.assertCurrentTeacher.mockImplementation(() => {
      throw new TeacherAppRequiredTeacherException({
        reason: 'actor_not_teacher',
      });
    });

    await expect(dashboardUseCase.execute()).rejects.toBeInstanceOf(
      TeacherAppRequiredTeacherException,
    );
  });

  it('dashboard includes only owned students and XP ledger totals', async () => {
    const { dashboardUseCase, xpReadAdapter } = createUseCases();

    const result = await dashboardUseCase.execute();

    expect(result.summary).toMatchObject({
      studentsCount: 1,
      totalXp: 25,
      averageXp: 25,
    });
    expect(result.byClass).toEqual([
      expect.objectContaining({
        classId: 'allocation-1',
        studentsCount: 1,
        totalXp: 25,
      }),
    ]);
    expect(xpReadAdapter.listAllLedger).toHaveBeenCalledWith({
      ownedEnrollments: [ownedEnrollmentFixture()],
    });
  });

  it('class XP validates owned classId and rejects other-teacher classes', async () => {
    const { classUseCase, accessService, xpReadAdapter } = createUseCases();

    const result = await classUseCase.execute('allocation-1');

    expect(accessService.assertTeacherOwnsAllocation).toHaveBeenCalledWith(
      'allocation-1',
    );
    expect(result.classId).toBe('allocation-1');
    expect(xpReadAdapter.listOwnedEnrollments).toHaveBeenCalledWith({
      allocations: [allocationFixture()],
    });

    accessService.assertTeacherOwnsAllocation.mockRejectedValueOnce(
      new TeacherAppAllocationNotFoundException({ classId: 'other-class' }),
    );
    await expect(classUseCase.execute('other-class')).rejects.toMatchObject({
      code: 'teacher_app.allocation.not_found',
    });
  });

  it('student XP validates owned student access', async () => {
    const { studentUseCase, xpReadAdapter } = createUseCases();

    const result = await studentUseCase.execute('student-1');

    expect(result).toMatchObject({
      studentId: 'student-1',
      totalXp: 25,
      rank: null,
      tier: null,
      level: null,
    });
    expect(xpReadAdapter.listOwnedEnrollments).toHaveBeenCalledWith({
      allocations: [allocationFixture()],
      studentId: 'student-1',
    });

    xpReadAdapter.listOwnedEnrollments.mockResolvedValueOnce([]);
    await expect(
      studentUseCase.execute('outside-student'),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('history validates owned student access and maps source filters', async () => {
    const { historyUseCase, xpReadAdapter } = createUseCases();

    const result = await historyUseCase.execute('student-1', {
      source: 'reinforcement_task',
      page: 2,
      limit: 10,
    });

    expect(result.pagination).toEqual({ page: 1, limit: 20, total: 1 });
    expect(xpReadAdapter.listLedger).toHaveBeenCalledWith({
      ownedEnrollments: [ownedEnrollmentFixture()],
      filters: {
        studentId: 'student-1',
        sourceType: XpSourceType.REINFORCEMENT_TASK,
        search: undefined,
        page: 2,
        limit: 10,
      },
    });

    xpReadAdapter.listOwnedEnrollments.mockResolvedValueOnce([]);
    await expect(
      historyUseCase.execute('outside-student', {}),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});

function createUseCases(): {
  dashboardUseCase: GetTeacherXpDashboardUseCase;
  classUseCase: GetTeacherClassXpUseCase;
  studentUseCase: GetTeacherStudentXpUseCase;
  historyUseCase: ListTeacherStudentXpHistoryUseCase;
  accessService: jest.Mocked<TeacherAppAccessService>;
  allocationReadAdapter: jest.Mocked<TeacherAppAllocationReadAdapter>;
  xpReadAdapter: jest.Mocked<TeacherXpReadAdapter>;
} {
  const allocation = allocationFixture();
  const enrollment = ownedEnrollmentFixture();
  const ledger = ledgerFixture();
  const accessService = {
    assertCurrentTeacher: jest.fn(() => ({
      teacherUserId: TEACHER_ID,
      schoolId: 'school-1',
      organizationId: 'org-1',
      membershipId: 'membership-1',
      roleId: 'role-1',
      permissions: [],
    })),
    assertTeacherOwnsAllocation: jest.fn(() => Promise.resolve(allocation)),
  } as unknown as jest.Mocked<TeacherAppAccessService>;
  const allocationReadAdapter = {
    listAllOwnedAllocations: jest.fn(() => Promise.resolve([allocation])),
  } as unknown as jest.Mocked<TeacherAppAllocationReadAdapter>;
  const xpReadAdapter = {
    listOwnedEnrollments: jest.fn(() => Promise.resolve([enrollment])),
    listAllLedger: jest.fn(() => Promise.resolve([ledger])),
    listLedger: jest.fn(() =>
      Promise.resolve({ items: [ledger], total: 1, page: 1, limit: 20 }),
    ),
  } as unknown as jest.Mocked<TeacherXpReadAdapter>;

  return {
    dashboardUseCase: new GetTeacherXpDashboardUseCase(
      accessService,
      allocationReadAdapter,
      xpReadAdapter,
    ),
    classUseCase: new GetTeacherClassXpUseCase(accessService, xpReadAdapter),
    studentUseCase: new GetTeacherStudentXpUseCase(
      accessService,
      allocationReadAdapter,
      xpReadAdapter,
    ),
    historyUseCase: new ListTeacherStudentXpHistoryUseCase(
      accessService,
      allocationReadAdapter,
      xpReadAdapter,
    ),
    accessService,
    allocationReadAdapter,
    xpReadAdapter,
  };
}

function allocationFixture(): TeacherAppAllocationRecord {
  const schoolId = 'school-1';
  return {
    id: 'allocation-1',
    schoolId,
    teacherUserId: TEACHER_ID,
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

function ownedEnrollmentFixture(): TeacherXpOwnedEnrollmentRecord {
  return {
    id: 'enrollment-1',
    studentId: 'student-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    classroomId: 'classroom-1',
    status: 'ACTIVE',
    student: {
      id: 'student-1',
      firstName: 'Mona',
      lastName: 'Ahmed',
      status: 'ACTIVE',
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

function ledgerFixture(): TeacherXpLedgerRecord {
  const now = new Date('2026-09-17T10:00:00.000Z');
  return {
    id: 'xp-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    studentId: 'student-1',
    enrollmentId: 'enrollment-1',
    assignmentId: 'assignment-1',
    sourceType: XpSourceType.REINFORCEMENT_TASK,
    sourceId: 'submission-1',
    amount: 25,
    reason: 'approved_task',
    reasonAr: null,
    occurredAt: now,
    createdAt: now,
    student: {
      id: 'student-1',
      firstName: 'Mona',
      lastName: 'Ahmed',
      status: 'ACTIVE',
    },
    enrollment: {
      id: 'enrollment-1',
      studentId: 'student-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      classroomId: 'classroom-1',
    },
  } as TeacherXpLedgerRecord;
}
