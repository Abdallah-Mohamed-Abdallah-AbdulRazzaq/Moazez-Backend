import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentAppRequiredParentException } from '../../shared/parent-app-errors';
import type { ParentAppAccessibleChild } from '../../shared/parent-app.types';
import { GetParentChildReportsSummaryUseCase } from '../application/get-parent-child-reports-summary.use-case';
import { ListParentChildReportsUseCase } from '../application/list-parent-child-reports.use-case';
import {
  ParentReportsReadAdapter,
  type ParentReportsListReadModel,
  type ParentReportsSummaryReadModel,
} from '../infrastructure/parent-reports-read.adapter';

describe('Parent Reports use-cases', () => {
  it('rejects non-parent actors through ParentAppAccessService', async () => {
    const { listUseCase, accessService, readAdapter } = createUseCases();
    accessService.assertParentOwnsStudent.mockRejectedValue(
      new ParentAppRequiredParentException({ reason: 'actor_not_parent' }),
    );

    await expect(listUseCase.execute('student-1')).rejects.toMatchObject({
      code: 'parent_app.actor.required_parent',
    });
    expect(readAdapter.listReports).not.toHaveBeenCalled();
  });

  it('validates parent ownership before listing derived reports', async () => {
    const { listUseCase, accessService, readAdapter } =
      createUseCasesWithValidAccess();
    readAdapter.listReports.mockResolvedValue(listFixture());

    const result = await listUseCase.execute('student-1');

    expect(accessService.assertParentOwnsStudent).toHaveBeenCalledWith(
      'student-1',
    );
    expect(readAdapter.listReports).toHaveBeenCalledWith(childFixture());
    expect(result.reports).toEqual([
      expect.objectContaining({
        reportId: 'current-term-performance',
        type: 'performance',
        source: 'derived_current_school_data',
      }),
    ]);
  });

  it('returns basic derived read model only with unavailable deferred sections', async () => {
    const { summaryUseCase, readAdapter } = createUseCasesWithValidAccess();
    readAdapter.getReportsSummary.mockResolvedValue(summaryFixture());

    const result = await summaryUseCase.execute('student-1');
    const serialized = JSON.stringify(result);

    expect(result.academic.percentage).toBe(80);
    expect(result.behavior.totalBehaviorPoints).toBe(3);
    expect(result.discipline).toMatchObject({
      totalIncidents: 5,
      attendanceIncidentCount: 3,
      behaviorPoints: 3,
    });
    expect(result.xp.totalXp).toBe(25);
    expect(result.unavailable).toMatchObject({
      reportEngine: { available: false },
      schedule: { available: false },
      homework: { available: false },
      pickup: { available: false },
    });
    expect(serialized).not.toContain('schoolId');
    expect(serialized).not.toContain('organizationId');
    expect(serialized).not.toContain('scheduleId');
  });
});

function createUseCases(): {
  listUseCase: ListParentChildReportsUseCase;
  summaryUseCase: GetParentChildReportsSummaryUseCase;
  accessService: jest.Mocked<ParentAppAccessService>;
  readAdapter: jest.Mocked<ParentReportsReadAdapter>;
} {
  const accessService = {
    assertParentOwnsStudent: jest.fn(),
  } as unknown as jest.Mocked<ParentAppAccessService>;
  const readAdapter = {
    listReports: jest.fn(),
    getReportsSummary: jest.fn(),
  } as unknown as jest.Mocked<ParentReportsReadAdapter>;

  return {
    listUseCase: new ListParentChildReportsUseCase(accessService, readAdapter),
    summaryUseCase: new GetParentChildReportsSummaryUseCase(
      accessService,
      readAdapter,
    ),
    accessService,
    readAdapter,
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

function listFixture(): ParentReportsListReadModel {
  return {
    summary: summaryFixture(),
  };
}

function summaryFixture(): ParentReportsSummaryReadModel {
  const child = childFixture();
  return {
    child,
    profile: profileFixture(),
    academic: {
      child,
      subjects: [
        {
          subjectId: 'subject-1',
          subjectName: 'Math',
          earnedMarks: 8,
          totalMarks: 10,
          percentage: 80,
        },
      ],
      totalEarned: 8,
      totalMax: 10,
      percentage: 80,
    },
    behavior: {
      child,
      attendanceCount: 10,
      absenceCount: 1,
      latenessCount: 2,
      positiveCount: 1,
      negativeCount: 1,
      positivePoints: 5,
      negativePoints: -2,
      totalBehaviorPoints: 3,
    },
    discipline: {
      totalIncidents: 5,
      attendanceIncidentCount: 3,
      absenceCount: 1,
      lateCount: 1,
      earlyLeaveCount: 1,
      excusedCount: 0,
      positiveCount: 1,
      negativeCount: 1,
      behaviorPoints: 3,
      period: 'current_term',
      dateText: 'current_term',
    },
    xp: {
      child,
      totalXp: 25,
      entriesCount: 1,
      bySource: [{ sourceType: 'system', totalXp: 25, entriesCount: 1 }],
    },
  } as unknown as ParentReportsSummaryReadModel;
}

function profileFixture() {
  return {
    id: 'enrollment-1',
    studentId: 'student-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    student: { firstName: 'Sara', lastName: 'Child' },
    academicYear: { id: 'year-1', nameAr: 'Year AR', nameEn: 'Year' },
    term: { id: 'term-1', nameAr: 'Term AR', nameEn: 'Term' },
    classroom: {
      id: 'classroom-1',
      nameAr: 'Class AR',
      nameEn: 'Class',
      section: {
        id: 'section-1',
        nameAr: 'Section AR',
        nameEn: 'Section',
        grade: { id: 'grade-1', nameAr: 'Grade AR', nameEn: 'Grade' },
      },
    },
  };
}
