import { DashboardAnalyticsHierarchyRepository } from '../infrastructure/dashboard-analytics-hierarchy.repository';

describe('DashboardAnalyticsHierarchyRepository', () => {
  it('resolves hierarchy references only through scoped Prisma delegates', async () => {
    const scoped = scopedPrismaMock();
    const repository = new DashboardAnalyticsHierarchyRepository({
      scoped,
    } as any);

    await repository.findAcademicYearById(scope() as any, 'year-1');
    await repository.findTermById(scope() as any, 'term-1');
    await repository.findGradeById(scope() as any, 'grade-1');
    await repository.findSectionById(scope() as any, 'section-1');
    await repository.findClassroomById(scope() as any, 'classroom-1');

    expect(scoped.academicYear.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'year-1' } }),
    );
    expect(scoped.term.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'term-1' }),
      }),
    );
    expect(scoped.grade.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'grade-1' } }),
    );
    expect(scoped.section.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'section-1' }),
      }),
    );
    expect(scoped.classroom.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'classroom-1' }),
      }),
    );
  });

  it('returns null without unscoped fallback when scoped Prisma cannot see a record', async () => {
    const scoped = scopedPrismaMock();
    scoped.grade.findFirst.mockResolvedValue(null);
    const unscopedFind = jest.fn();
    const repository = new DashboardAnalyticsHierarchyRepository({
      scoped,
      grade: { findFirst: unscopedFind },
    } as any);

    await expect(
      repository.findGradeById(scope() as any, 'cross-school-grade'),
    ).resolves.toBeNull();
    expect(unscopedFind).not.toHaveBeenCalled();
  });

  it('uses the shared deterministic ordering for active academic context', async () => {
    const scoped = scopedPrismaMock();
    const repository = new DashboardAnalyticsHierarchyRepository({
      scoped,
    } as any);

    await repository.findActiveAcademicYear(scope() as any);
    await repository.findActiveTerm(scope() as any, 'year-1');

    const expectedOrder = [
      { startDate: 'desc' },
      { createdAt: 'desc' },
      { id: 'asc' },
    ];
    expect(scoped.academicYear.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: expectedOrder }),
    );
    expect(scoped.term.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: expectedOrder }),
    );
  });
});

function scopedPrismaMock() {
  return {
    academicYear: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'year-1',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
      }),
    },
    term: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'term-1',
        academicYearId: 'year-1',
        startDate: new Date('2026-07-01T00:00:00.000Z'),
        endDate: new Date('2026-07-31T00:00:00.000Z'),
      }),
    },
    grade: { findFirst: jest.fn().mockResolvedValue({ id: 'grade-1' }) },
    section: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'section-1', gradeId: 'grade-1' }),
    },
    classroom: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'classroom-1',
        sectionId: 'section-1',
        section: { gradeId: 'grade-1' },
      }),
    },
  };
}

function scope() {
  return {
    actorId: 'actor-1',
    organizationId: 'organization-1',
    schoolId: 'school-1',
    roleId: 'role-1',
  };
}
