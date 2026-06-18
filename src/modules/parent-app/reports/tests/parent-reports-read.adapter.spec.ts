import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { DisciplineDerivedReadService } from '../../../discipline/application/discipline-derived-read.service';
import type { ParentAppAccessibleChild } from '../../shared/parent-app.types';
import { ParentProgressReadAdapter } from '../../progress/infrastructure/parent-progress-read.adapter';
import { ParentReportsReadAdapter } from '../infrastructure/parent-reports-read.adapter';

describe('ParentReportsReadAdapter', () => {
  it('reads child report profile through scoped Prisma and progress read models', async () => {
    const {
      adapter,
      scopedEnrollmentMocks,
      progressReadAdapter,
      disciplineReadService,
    } = createAdapter();
    scopedEnrollmentMocks.findFirstOrThrow.mockResolvedValue(profileFixture());
    progressReadAdapter.getAcademicProgress.mockResolvedValue({
      child: childFixture(),
      subjects: [],
      totalEarned: 0,
      totalMax: 0,
      percentage: null,
    });
    progressReadAdapter.getBehaviorProgress.mockResolvedValue({
      child: childFixture(),
      attendanceCount: 0,
      absenceCount: 0,
      latenessCount: 0,
      positiveCount: 0,
      negativeCount: 0,
      positivePoints: 0,
      negativePoints: 0,
      totalBehaviorPoints: 0,
    });
    progressReadAdapter.getXpProgress.mockResolvedValue({
      child: childFixture(),
      totalXp: 0,
      entriesCount: 0,
      bySource: [],
    });
    disciplineReadService.getSummary.mockResolvedValue(disciplineFixture());

    await adapter.getReportsSummary(childFixture());

    expect(
      scopedEnrollmentMocks.findFirstOrThrow.mock.calls[0][0].where,
    ).toEqual({
      id: 'enrollment-1',
      studentId: 'student-1',
      academicYearId: 'year-1',
    });
    expect(
      scopedEnrollmentMocks.findFirstOrThrow.mock.calls[0][0].where,
    ).not.toHaveProperty('schoolId');
    expect(progressReadAdapter.getAcademicProgress).toHaveBeenCalledWith(
      childFixture(),
    );
    expect(disciplineReadService.getSummary).toHaveBeenCalledWith({
      scope: {
        studentId: 'student-1',
        enrollmentId: 'enrollment-1',
        academicYearId: 'year-1',
        termId: 'term-1',
      },
    });
  });

  it('performs no mutations or platform bypass calls', async () => {
    const {
      adapter,
      scopedEnrollmentMocks,
      progressReadAdapter,
      mutationMocks,
      platformBypass,
      disciplineReadService,
    } = createAdapter();
    scopedEnrollmentMocks.findFirstOrThrow.mockResolvedValue(profileFixture());
    progressReadAdapter.getAcademicProgress.mockResolvedValue({
      child: childFixture(),
      subjects: [],
      totalEarned: 0,
      totalMax: 0,
      percentage: null,
    });
    progressReadAdapter.getBehaviorProgress.mockResolvedValue({
      child: childFixture(),
      attendanceCount: 0,
      absenceCount: 0,
      latenessCount: 0,
      positiveCount: 0,
      negativeCount: 0,
      positivePoints: 0,
      negativePoints: 0,
      totalBehaviorPoints: 0,
    });
    progressReadAdapter.getXpProgress.mockResolvedValue({
      child: childFixture(),
      totalXp: 0,
      entriesCount: 0,
      bySource: [],
    });
    disciplineReadService.getSummary.mockResolvedValue(disciplineFixture());

    await adapter.listReports(childFixture());

    for (const mutation of Object.values(mutationMocks)) {
      expect(mutation).not.toHaveBeenCalled();
    }
    expect(platformBypass).not.toHaveBeenCalled();
  });
});

function childFixture(): ParentAppAccessibleChild {
  return {
    studentId: 'student-1',
    enrollmentId: 'enrollment-1',
    classroomId: 'classroom-1',
    academicYearId: 'year-1',
    termId: 'term-1',
  };
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

function disciplineFixture() {
  return {
    totalIncidents: 0,
    attendanceIncidentCount: 0,
    absenceCount: 0,
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

function modelMocks(): {
  findFirstOrThrow: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  updateMany: jest.Mock;
  delete: jest.Mock;
  deleteMany: jest.Mock;
} {
  return {
    findFirstOrThrow: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  };
}

function createAdapter(): {
  adapter: ParentReportsReadAdapter;
  scopedEnrollmentMocks: ReturnType<typeof modelMocks>;
  progressReadAdapter: jest.Mocked<ParentProgressReadAdapter>;
  disciplineReadService: jest.Mocked<DisciplineDerivedReadService>;
  mutationMocks: Record<string, jest.Mock>;
  platformBypass: jest.Mock;
} {
  const scopedEnrollmentMocks = modelMocks();
  const platformBypass = jest.fn();
  const prisma = {
    platformBypass,
    scoped: {
      enrollment: scopedEnrollmentMocks,
    },
  } as unknown as PrismaService;
  const progressReadAdapter = {
    getAcademicProgress: jest.fn(),
    getBehaviorProgress: jest.fn(),
    getXpProgress: jest.fn(),
  } as unknown as jest.Mocked<ParentProgressReadAdapter>;
  const disciplineReadService = {
    getSummary: jest.fn(),
  } as unknown as jest.Mocked<DisciplineDerivedReadService>;

  return {
    adapter: new ParentReportsReadAdapter(
      prisma,
      progressReadAdapter,
      disciplineReadService,
    ),
    scopedEnrollmentMocks,
    progressReadAdapter,
    disciplineReadService,
    mutationMocks: {
      enrollmentCreate: scopedEnrollmentMocks.create,
      enrollmentUpdate: scopedEnrollmentMocks.update,
      enrollmentDelete: scopedEnrollmentMocks.delete,
    },
    platformBypass,
  };
}
