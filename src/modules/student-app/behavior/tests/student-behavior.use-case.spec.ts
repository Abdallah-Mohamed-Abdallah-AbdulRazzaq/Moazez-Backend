import {
  BehaviorRecordStatus,
  BehaviorRecordType,
  StudentEnrollmentStatus,
  StudentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentAppRequiredStudentException } from '../../shared/student-app-errors';
import type {
  StudentAppContext,
  StudentAppCurrentStudentWithEnrollment,
} from '../../shared/student-app.types';
import { GetStudentBehaviorRecordUseCase } from '../application/get-student-behavior-record.use-case';
import { GetStudentBehaviorSummaryUseCase } from '../application/get-student-behavior-summary.use-case';
import { ListStudentBehaviorRecordsUseCase } from '../application/list-student-behavior-records.use-case';
import {
  StudentBehaviorReadAdapter,
  type StudentBehaviorListReadModel,
  type StudentBehaviorRecordReadModel,
  type StudentBehaviorSummaryReadModel,
} from '../infrastructure/student-behavior-read.adapter';

describe('Student Behavior use-cases', () => {
  it('rejects non-student actors through StudentAppAccessService', async () => {
    const { listUseCase, accessService, readAdapter } = createUseCases();
    accessService.getCurrentStudentWithEnrollment.mockRejectedValue(
      new StudentAppRequiredStudentException({ reason: 'actor_not_student' }),
    );

    await expect(listUseCase.execute()).rejects.toMatchObject({
      code: 'student_app.actor.required_student',
    });
    expect(readAdapter.listVisibleBehaviorRecords).not.toHaveBeenCalled();
  });

  it('lists only the current student visible behavior records', async () => {
    const { listUseCase, readAdapter } = createUseCasesWithValidAccess();
    readAdapter.listVisibleBehaviorRecords.mockResolvedValue(
      listReadModelFixture(),
    );

    const result = await listUseCase.execute({ type: 'positive' });

    expect(readAdapter.listVisibleBehaviorRecords).toHaveBeenCalledWith({
      context: contextFixture(),
      query: { type: 'positive' },
    });
    expect(result.records).toEqual([
      expect.objectContaining({
        id: 'behavior-record-1',
        type: 'positive',
        points: 5,
        status: 'approved',
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain('reviewedById');
  });

  it('summarizes positive and negative behavior without treating points as XP', async () => {
    const { summaryUseCase, readAdapter } = createUseCasesWithValidAccess();
    readAdapter.getBehaviorSummary.mockResolvedValue(summaryFixture());

    const result = await summaryUseCase.execute();

    expect(result.summary).toMatchObject({
      positivePoints: 5,
      negativePoints: -2,
      totalBehaviorPoints: 3,
      positive_points: 5,
      negative_points: -2,
      total_behavior_points: 3,
    });
    expect(JSON.stringify(result)).not.toContain('xp');
  });

  it('rejects behavior detail outside current ownership', async () => {
    const { detailUseCase, readAdapter } = createUseCasesWithValidAccess();
    readAdapter.findVisibleBehaviorRecord.mockResolvedValue(null);

    await expect(detailUseCase.execute('outside-record')).rejects.toMatchObject(
      {
        httpStatus: 404,
      },
    );
  });
});

function createUseCases(): {
  listUseCase: ListStudentBehaviorRecordsUseCase;
  summaryUseCase: GetStudentBehaviorSummaryUseCase;
  detailUseCase: GetStudentBehaviorRecordUseCase;
  accessService: jest.Mocked<StudentAppAccessService>;
  readAdapter: jest.Mocked<StudentBehaviorReadAdapter>;
} {
  const accessService = {
    getCurrentStudentWithEnrollment: jest.fn(),
  } as unknown as jest.Mocked<StudentAppAccessService>;
  const readAdapter = {
    listVisibleBehaviorRecords: jest.fn(),
    getBehaviorSummary: jest.fn(),
    findVisibleBehaviorRecord: jest.fn(),
  } as unknown as jest.Mocked<StudentBehaviorReadAdapter>;

  return {
    listUseCase: new ListStudentBehaviorRecordsUseCase(
      accessService,
      readAdapter,
    ),
    summaryUseCase: new GetStudentBehaviorSummaryUseCase(
      accessService,
      readAdapter,
    ),
    detailUseCase: new GetStudentBehaviorRecordUseCase(
      accessService,
      readAdapter,
    ),
    accessService,
    readAdapter,
  };
}

function createUseCasesWithValidAccess(): ReturnType<typeof createUseCases> {
  const created = createUseCases();
  created.accessService.getCurrentStudentWithEnrollment.mockResolvedValue(
    currentStudentFixture(),
  );
  return created;
}

function currentStudentFixture(): StudentAppCurrentStudentWithEnrollment {
  return {
    context: contextFixture(),
    student: {
      id: 'student-1',
      schoolId: 'school-1',
      organizationId: 'org-1',
      userId: 'student-user-1',
      status: StudentStatus.ACTIVE,
      deletedAt: null,
      user: {
        id: 'student-user-1',
        userType: UserType.STUDENT,
        status: UserStatus.ACTIVE,
        deletedAt: null,
      },
    },
    enrollment: {
      id: 'enrollment-1',
      schoolId: 'school-1',
      studentId: 'student-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      classroomId: 'classroom-1',
      status: StudentEnrollmentStatus.ACTIVE,
      deletedAt: null,
    },
  };
}

function contextFixture(): StudentAppContext {
  return {
    studentUserId: 'student-user-1',
    studentId: 'student-1',
    schoolId: 'school-1',
    organizationId: 'org-1',
    membershipId: 'membership-1',
    roleId: 'role-1',
    permissions: ['students.records.view'],
    enrollmentId: 'enrollment-1',
    classroomId: 'classroom-1',
    academicYearId: 'year-1',
    requestedAcademicYearId: 'year-1',
    requestedTermId: 'term-1',
    termId: 'term-1',
  };
}

function listReadModelFixture(): StudentBehaviorListReadModel {
  return {
    records: [recordFixture()],
    summary: summaryFixture(),
    page: 1,
    limit: 50,
    total: 1,
  };
}

function recordFixture(): StudentBehaviorRecordReadModel {
  return {
    id: 'behavior-record-1',
    type: BehaviorRecordType.POSITIVE,
    status: BehaviorRecordStatus.APPROVED,
    titleEn: 'Helping a classmate',
    titleAr: null,
    noteEn: 'Visible note',
    noteAr: null,
    points: 5,
    occurredAt: new Date('2026-10-01T08:00:00.000Z'),
    category: {
      id: 'category-1',
      code: 'HELPFUL',
      nameEn: 'Helpful',
      nameAr: null,
      type: BehaviorRecordType.POSITIVE,
    },
  } as unknown as StudentBehaviorRecordReadModel;
}

function summaryFixture(): StudentBehaviorSummaryReadModel {
  return {
    attendanceCount: 3,
    absenceCount: 1,
    latenessCount: 2,
    dateText: 'current_term',
    positiveCount: 1,
    negativeCount: 1,
    positivePoints: 5,
    negativePoints: -2,
    totalBehaviorPoints: 3,
  };
}
