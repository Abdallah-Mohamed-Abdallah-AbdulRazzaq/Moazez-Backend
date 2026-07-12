import {
  CurriculumStatus,
  LessonPlanStatus,
  TimetableConfigStatus,
} from '@prisma/client';
import { DashboardAcademicsAnalyticsRepository } from '../infrastructure/dashboard-academics-analytics.repository';

describe('DashboardAcademicsAnalyticsRepository', () => {
  it('counts the school-safe SubjectAllocation x Classroom matrix without membership reinterpretation', async () => {
    const prisma = prismaMock();
    prisma.$queryRaw.mockResolvedValue([{ allocated: 2n, missing: 1n }]);
    const repository = new DashboardAcademicsAnalyticsRepository(prisma as any);

    await expect(
      repository.countTeacherAllocationCoverage({
        scope: { schoolId: 'school-1', organizationId: 'org-1' },
        hierarchy: {
          academicYearId: 'year-1',
          termId: 'term-1',
          gradeId: 'grade-1',
          sectionId: 'section-1',
          classroomId: 'classroom-1',
        },
      }),
    ).resolves.toEqual({ allocated: 2, missing: 1 });

    const query = rawQuery(prisma);
    expect(query.sql).toContain('FROM subject_allocations sa');
    expect(query.sql).toContain('INNER JOIN classrooms c');
    expect(query.sql).toContain('FROM teacher_subject_allocations tsa');
    expect(query.sql).toContain('INNER JOIN users u');
    expect(query.sql).toContain('COUNT(*) FILTER');
    expect(query.sql).toContain('sa.school_id = ?::uuid');
    expect(query.sql).toContain('sa.deleted_at IS NULL');
    expect(query.sql).toContain('c.deleted_at IS NULL');
    expect(query.sql).toContain('u.deleted_at IS NULL');
    expect(query.sql).toContain('sa.academic_year_id = ?::uuid');
    expect(query.sql).toContain('sa.term_id = ?::uuid');
    expect(query.sql).toContain('sa.grade_id = ?::uuid');
    expect(query.sql).toContain('sec.id = ?::uuid');
    expect(query.sql).toContain('c.id = ?::uuid');
    expect(query.sql).not.toContain('weekly_hours');
    expect(query.sql).not.toContain('memberships');
    expect(query.values).toEqual(
      expect.arrayContaining([
        'school-1',
        'year-1',
        'term-1',
        'grade-1',
        'section-1',
        'classroom-1',
      ]),
    );
  });

  it('groups current ACTIVE and DRAFT timetable configs only', async () => {
    const prisma = prismaMock();
    prisma.scoped.timetableConfig.groupBy.mockResolvedValue([
      { status: TimetableConfigStatus.ACTIVE, _count: { _all: 2 } },
    ]);
    const repository = new DashboardAcademicsAnalyticsRepository(prisma as any);

    await expect(
      repository.countCurrentTimetablePublicationStatus({
        scope: { schoolId: 'school-1', organizationId: 'org-1' },
        hierarchy: { academicYearId: 'year-1', termId: 'term-1' },
      }),
    ).resolves.toEqual({ published: 2, draft: 0 });
    expect(prisma.scoped.timetableConfig.groupBy).toHaveBeenCalledWith({
      by: ['status'],
      where: {
        status: {
          in: [TimetableConfigStatus.ACTIVE, TimetableConfigStatus.DRAFT],
        },
        academicYearId: 'year-1',
        termId: 'term-1',
      },
      _count: { _all: true },
      orderBy: { status: 'asc' },
    });
  });

  it('groups nondeleted ACTIVE and DRAFT curricula with exact hierarchy filters', async () => {
    const prisma = prismaMock();
    const repository = new DashboardAcademicsAnalyticsRepository(prisma as any);
    await repository.countCurrentCurriculumActivationStatus({
      scope: { schoolId: 'school-1', organizationId: 'org-1' },
      hierarchy: {
        academicYearId: 'year-1',
        termId: 'term-1',
        gradeId: 'grade-1',
      },
    });
    expect(prisma.scoped.curriculum.groupBy).toHaveBeenCalledWith({
      by: ['status'],
      where: {
        deletedAt: null,
        status: { in: [CurriculumStatus.ACTIVE, CurriculumStatus.DRAFT] },
        academicYearId: 'year-1',
        termId: 'term-1',
        gradeId: 'grade-1',
      },
      _count: { _all: true },
      orderBy: { status: 'asc' },
    });
  });

  it('groups nondeleted lesson plans through the same-school classroom hierarchy', async () => {
    const prisma = prismaMock();
    const repository = new DashboardAcademicsAnalyticsRepository(prisma as any);
    await repository.countCurrentLessonPlanActivationStatus({
      scope: { schoolId: 'school-1', organizationId: 'org-1' },
      hierarchy: {
        academicYearId: 'year-1',
        termId: 'term-1',
        gradeId: 'grade-1',
        sectionId: 'section-1',
        classroomId: 'classroom-1',
      },
    });
    expect(prisma.scoped.lessonPlan.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['status'],
        where: expect.objectContaining({
          deletedAt: null,
          status: { in: [LessonPlanStatus.ACTIVE, LessonPlanStatus.DRAFT] },
          academicYearId: 'year-1',
          termId: 'term-1',
          classroomId: 'classroom-1',
          classroom: {
            is: {
              schoolId: 'school-1',
              deletedAt: null,
              section: {
                is: {
                  schoolId: 'school-1',
                  deletedAt: null,
                  id: 'section-1',
                  gradeId: 'grade-1',
                  grade: { is: { schoolId: 'school-1', deletedAt: null } },
                },
              },
            },
          },
        }),
      }),
    );
  });
});

function prismaMock() {
  return {
    $queryRaw: jest.fn().mockResolvedValue([]),
    scoped: {
      timetableConfig: { groupBy: jest.fn().mockResolvedValue([]) },
      curriculum: { groupBy: jest.fn().mockResolvedValue([]) },
      lessonPlan: { groupBy: jest.fn().mockResolvedValue([]) },
    },
  };
}

function rawQuery(prisma: ReturnType<typeof prismaMock>): {
  sql: string;
  values: unknown[];
} {
  return prisma.$queryRaw.mock.calls[0][0] as {
    sql: string;
    values: unknown[];
  };
}
