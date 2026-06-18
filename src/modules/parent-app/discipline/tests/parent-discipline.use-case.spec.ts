import { DisciplineDerivedReadService } from '../../../discipline/application/discipline-derived-read.service';
import type {
  DisciplineSummaryReadModel,
  DisciplineTimelineListReadModel,
} from '../../../discipline/infrastructure/discipline-derived.repository';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentAppRequiredParentException } from '../../shared/parent-app-errors';
import type { ParentAppAccessibleChild } from '../../shared/parent-app.types';
import { GetParentChildDisciplineSummaryUseCase } from '../application/get-parent-child-discipline-summary.use-case';
import { ListParentChildDisciplineUseCase } from '../application/list-parent-child-discipline.use-case';

describe('Parent Discipline use-cases', () => {
  it('rejects non-parent actors through ParentAppAccessService', async () => {
    const { listUseCase, accessService, readService } = createUseCases();
    accessService.assertParentOwnsStudent.mockRejectedValue(
      new ParentAppRequiredParentException({ reason: 'actor_not_parent' }),
    );

    await expect(listUseCase.execute('student-1')).rejects.toMatchObject({
      code: 'parent_app.actor.required_parent',
    });
    expect(readService.listTimeline).not.toHaveBeenCalled();
  });

  it('validates linked-child ownership before listing the timeline', async () => {
    const { listUseCase, accessService, readService } =
      createUseCasesWithValidAccess();
    readService.listTimeline.mockResolvedValue(listFixture());

    const result = await listUseCase.execute('student-1', {
      sourceType: 'behavior',
    });

    expect(accessService.assertParentOwnsStudent).toHaveBeenCalledWith(
      'student-1',
    );
    expect(readService.listTimeline).toHaveBeenCalledWith({
      scope: {
        studentId: 'student-1',
        enrollmentId: 'enrollment-1',
        academicYearId: 'year-1',
        termId: 'term-1',
      },
      query: { sourceType: 'behavior' },
    });
    expect(result.child).toEqual({
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      student_id: 'student-1',
      enrollment_id: 'enrollment-1',
    });
    expect(result.items).toEqual([
      expect.objectContaining({
        id: 'behavior:record-1',
        sourceType: 'behavior',
        itemType: 'positive',
        status: 'approved',
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain('reviewedById');
  });

  it('summarizes linked-child derived discipline data', async () => {
    const { summaryUseCase, readService } = createUseCasesWithValidAccess();
    readService.getSummary.mockResolvedValue(summaryFixture());

    const result = await summaryUseCase.execute('student-1');

    expect(result.child.studentId).toBe('student-1');
    expect(result.summary).toMatchObject({
      totalIncidents: 1,
      positiveCount: 1,
      behaviorPoints: 5,
    });
    expect(JSON.stringify(result)).not.toContain('schoolId');
  });
});

function createUseCases(): {
  listUseCase: ListParentChildDisciplineUseCase;
  summaryUseCase: GetParentChildDisciplineSummaryUseCase;
  accessService: jest.Mocked<ParentAppAccessService>;
  readService: jest.Mocked<DisciplineDerivedReadService>;
} {
  const accessService = {
    assertParentOwnsStudent: jest.fn(),
  } as unknown as jest.Mocked<ParentAppAccessService>;
  const readService = {
    listTimeline: jest.fn(),
    getSummary: jest.fn(),
  } as unknown as jest.Mocked<DisciplineDerivedReadService>;

  return {
    listUseCase: new ListParentChildDisciplineUseCase(
      accessService,
      readService,
    ),
    summaryUseCase: new GetParentChildDisciplineSummaryUseCase(
      accessService,
      readService,
    ),
    accessService,
    readService,
  };
}

function createUseCasesWithValidAccess(): ReturnType<typeof createUseCases> {
  const created = createUseCases();
  created.accessService.assertParentOwnsStudent.mockResolvedValue(
    childFixture(),
  );
  return created;
}

function childFixture(): ParentAppAccessibleChild {
  return {
    studentId: 'student-1',
    enrollmentId: 'enrollment-1',
    classroomId: 'classroom-1',
    academicYearId: 'year-1',
    termId: 'term-1',
  };
}

function listFixture(): DisciplineTimelineListReadModel {
  return {
    items: [
      {
        id: 'behavior:record-1',
        sourceType: 'behavior',
        sourceId: 'record-1',
        itemType: 'positive',
        occurredAt: new Date('2026-04-01T08:00:00.000Z'),
        title: 'Helpful',
        description: 'Visible note',
        severity: 'low',
        pointsDelta: 5,
        status: 'approved',
        category: {
          id: 'category-1',
          code: 'HELPFUL',
          nameAr: null,
          nameEn: 'Helpful',
          type: 'positive',
        },
        attendance: null,
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
    attendanceIncidentCount: 0,
    absenceCount: 0,
    lateCount: 0,
    earlyLeaveCount: 0,
    excusedCount: 0,
    positiveCount: 1,
    negativeCount: 0,
    behaviorPoints: 5,
    period: 'current_term',
    dateText: 'current_term',
  };
}
