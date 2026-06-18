import {
  StudentEnrollmentStatus,
  StudentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { DisciplineDerivedReadService } from '../../../discipline/application/discipline-derived-read.service';
import type {
  DisciplineSummaryReadModel,
  DisciplineTimelineListReadModel,
} from '../../../discipline/infrastructure/discipline-derived.repository';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentAppRequiredStudentException } from '../../shared/student-app-errors';
import type {
  StudentAppContext,
  StudentAppCurrentStudentWithEnrollment,
} from '../../shared/student-app.types';
import { GetStudentDisciplineSummaryUseCase } from '../application/get-student-discipline-summary.use-case';
import { ListStudentDisciplineUseCase } from '../application/list-student-discipline.use-case';

describe('Student Discipline use-cases', () => {
  it('rejects non-student actors through StudentAppAccessService', async () => {
    const { listUseCase, accessService, readService } = createUseCases();
    accessService.getCurrentStudentWithEnrollment.mockRejectedValue(
      new StudentAppRequiredStudentException({ reason: 'actor_not_student' }),
    );

    await expect(listUseCase.execute()).rejects.toMatchObject({
      code: 'student_app.actor.required_student',
    });
    expect(readService.listTimeline).not.toHaveBeenCalled();
  });

  it('lists the current student derived discipline timeline', async () => {
    const { listUseCase, readService } = createUseCasesWithValidAccess();
    readService.listTimeline.mockResolvedValue(listFixture());

    const result = await listUseCase.execute({ itemType: 'absence' });

    expect(readService.listTimeline).toHaveBeenCalledWith({
      scope: {
        studentId: 'student-1',
        enrollmentId: 'enrollment-1',
        academicYearId: 'year-1',
        termId: 'term-1',
      },
      query: { itemType: 'absence' },
    });
    expect(result.items).toEqual([
      expect.objectContaining({
        id: 'attendance:entry-1',
        sourceType: 'attendance',
        itemType: 'absence',
        status: 'submitted',
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain('schoolId');
    expect(JSON.stringify(result)).not.toContain('markedById');
  });

  it('summarizes the current student derived discipline data without writes', async () => {
    const { summaryUseCase, readService } = createUseCasesWithValidAccess();
    readService.getSummary.mockResolvedValue(summaryFixture());

    const result = await summaryUseCase.execute();

    expect(readService.getSummary).toHaveBeenCalledWith({
      scope: {
        studentId: 'student-1',
        enrollmentId: 'enrollment-1',
        academicYearId: 'year-1',
        termId: 'term-1',
      },
      query: undefined,
    });
    expect(result.summary).toMatchObject({
      totalIncidents: 1,
      attendanceIncidentCount: 1,
      behaviorPoints: 0,
    });
    expect(JSON.stringify(result)).not.toContain('reviewedById');
  });
});

function createUseCases(): {
  listUseCase: ListStudentDisciplineUseCase;
  summaryUseCase: GetStudentDisciplineSummaryUseCase;
  accessService: jest.Mocked<StudentAppAccessService>;
  readService: jest.Mocked<DisciplineDerivedReadService>;
} {
  const accessService = {
    getCurrentStudentWithEnrollment: jest.fn(),
  } as unknown as jest.Mocked<StudentAppAccessService>;
  const readService = {
    listTimeline: jest.fn(),
    getSummary: jest.fn(),
  } as unknown as jest.Mocked<DisciplineDerivedReadService>;

  return {
    listUseCase: new ListStudentDisciplineUseCase(accessService, readService),
    summaryUseCase: new GetStudentDisciplineSummaryUseCase(
      accessService,
      readService,
    ),
    accessService,
    readService,
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

function listFixture(): DisciplineTimelineListReadModel {
  return {
    items: [
      {
        id: 'attendance:entry-1',
        sourceType: 'attendance',
        sourceId: 'entry-1',
        itemType: 'absence',
        occurredAt: new Date('2026-04-01T08:00:00.000Z'),
        title: 'Absence',
        description: 'Marked absent',
        severity: 'medium',
        pointsDelta: 0,
        status: 'submitted',
        category: null,
        attendance: {
          status: 'absent',
          lateMinutes: null,
          earlyLeaveMinutes: null,
          excuseReason: null,
        },
      },
    ],
    summary: summaryFixture(),
    page: 1,
    limit: 50,
    total: 1,
  };
}

function summaryFixture(): DisciplineSummaryReadModel {
  return {
    totalIncidents: 1,
    attendanceIncidentCount: 1,
    absenceCount: 1,
    lateCount: 0,
    earlyLeaveCount: 0,
    excusedCount: 0,
    positiveCount: 0,
    negativeCount: 0,
    behaviorPoints: 0,
    period: 'current_term',
    dateText: 'current_term',
  };
}
