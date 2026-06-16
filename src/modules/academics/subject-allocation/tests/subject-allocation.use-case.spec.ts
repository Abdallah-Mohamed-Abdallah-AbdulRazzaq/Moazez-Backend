import { UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { BulkSaveSubjectAllocationsUseCase } from '../application/bulk-save-subject-allocations.use-case';
import { ListSubjectAllocationsUseCase } from '../application/list-subject-allocations.use-case';
import {
  SubjectAllocationClosedTermException,
  SubjectAllocationDuplicatePairException,
  SubjectAllocationInvalidScopeException,
  SubjectAllocationInvalidWeeklyHoursException,
} from '../domain/subject-allocation.exceptions';
import { SubjectAllocationRepository } from '../infrastructure/subject-allocation.repository';

type TermStoreItem = {
  id: string;
  schoolId: string;
  academicYearId: string;
  nameAr: string;
  nameEn: string;
  isActive: boolean;
};

type GradeStoreItem = {
  id: string;
  schoolId: string;
  nameAr: string;
  nameEn: string;
};

type SubjectStoreItem = {
  id: string;
  schoolId: string;
  nameAr: string;
  nameEn: string;
  code: string | null;
  color: string | null;
  isActive: boolean;
};

type AllocationStoreItem = {
  id: string;
  schoolId: string;
  academicYearId: string;
  termId: string;
  gradeId: string;
  subjectId: string;
  weeklyHours: number;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

describe('Subject allocation use cases', () => {
  async function withScope(testFn: () => Promise<void>): Promise<void> {
    await runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
        roleId: 'role-1',
        permissions: ['academics.subjects.view', 'academics.subjects.manage'],
      });

      await testFn();
    });
  }

  function createRepository(seed?: {
    terms?: TermStoreItem[];
    grades?: GradeStoreItem[];
    subjects?: SubjectStoreItem[];
    allocations?: AllocationStoreItem[];
  }): SubjectAllocationRepository {
    const terms = [...(seed?.terms ?? [termFixture])];
    const grades = [...(seed?.grades ?? [gradeFixture])];
    const subjects = [...(seed?.subjects ?? [subjectFixture])];
    const allocations = [...(seed?.allocations ?? [])];

    function buildRecord(allocation: AllocationStoreItem) {
      const grade = grades.find(
        (item) => item.id === allocation.gradeId && item.schoolId === allocation.schoolId,
      );
      const subject = subjects.find(
        (item) => item.id === allocation.subjectId && item.schoolId === allocation.schoolId,
      );
      if (!grade || !subject) {
        throw new Error('Allocation record is missing related fixture data');
      }

      return {
        id: allocation.id,
        schoolId: allocation.schoolId,
        academicYearId: allocation.academicYearId,
        termId: allocation.termId,
        gradeId: allocation.gradeId,
        subjectId: allocation.subjectId,
        weeklyHours: allocation.weeklyHours,
        deletedAt: allocation.deletedAt,
        createdAt: allocation.createdAt,
        updatedAt: allocation.updatedAt,
        grade,
        subject: {
          id: subject.id,
          nameAr: subject.nameAr,
          nameEn: subject.nameEn,
          code: subject.code,
          color: subject.color,
        },
      };
    }

    const repository = {
      listAllocations: jest.fn().mockImplementation(async (filters) =>
        allocations
          .filter((allocation) => allocation.schoolId === 'school-1')
          .filter((allocation) => allocation.deletedAt === null)
          .filter((allocation) => allocation.termId === filters.termId)
          .filter((allocation) =>
            filters.gradeId ? allocation.gradeId === filters.gradeId : true,
          )
          .filter((allocation) =>
            filters.subjectId ? allocation.subjectId === filters.subjectId : true,
          )
          .map((allocation) => buildRecord(allocation)),
      ),
      findTermById: jest.fn().mockImplementation(async (termId: string) =>
        terms.find((item) => item.id === termId && item.schoolId === 'school-1') ??
        null,
      ),
      findGradesByIds: jest.fn().mockImplementation(async (gradeIds: string[]) =>
        grades.filter(
          (item) => item.schoolId === 'school-1' && gradeIds.includes(item.id),
        ),
      ),
      findSubjectsByIds: jest.fn().mockImplementation(async (subjectIds: string[]) =>
        subjects.filter(
          (item) => item.schoolId === 'school-1' && subjectIds.includes(item.id),
        ),
      ),
      bulkSaveAllocations: jest.fn().mockImplementation(async (input) => {
        const affectedIds: string[] = [];
        for (const item of input.items) {
          const existing = allocations.find(
            (allocation) =>
              allocation.schoolId === input.schoolId &&
              allocation.termId === input.termId &&
              allocation.gradeId === item.gradeId &&
              allocation.subjectId === item.subjectId,
          );
          if (existing) {
            existing.academicYearId = input.academicYearId;
            existing.weeklyHours = item.weeklyHours;
            existing.deletedAt = null;
            existing.updatedAt = new Date('2026-06-16T10:00:00.000Z');
            affectedIds.push(existing.id);
            continue;
          }

          const allocation: AllocationStoreItem = {
            id: `allocation-${allocations.length + 1}`,
            schoolId: input.schoolId,
            academicYearId: input.academicYearId,
            termId: input.termId,
            gradeId: item.gradeId,
            subjectId: item.subjectId,
            weeklyHours: item.weeklyHours,
            deletedAt: null,
            createdAt: new Date('2026-06-16T09:00:00.000Z'),
            updatedAt: new Date('2026-06-16T09:00:00.000Z'),
          };
          allocations.push(allocation);
          affectedIds.push(allocation.id);
        }

        return affectedIds.map((id) =>
          buildRecord(allocations.find((allocation) => allocation.id === id)!),
        );
      }),
    };

    return repository as unknown as SubjectAllocationRepository;
  }

  const termFixture: TermStoreItem = {
    id: 'term-1',
    schoolId: 'school-1',
    academicYearId: 'year-1',
    nameAr: 'term-ar',
    nameEn: 'Term 1',
    isActive: true,
  };

  const closedTermFixture: TermStoreItem = {
    ...termFixture,
    id: 'term-closed',
    isActive: false,
  };

  const gradeFixture: GradeStoreItem = {
    id: 'grade-1',
    schoolId: 'school-1',
    nameAr: 'grade-ar',
    nameEn: 'Grade 1',
  };

  const secondGradeFixture: GradeStoreItem = {
    ...gradeFixture,
    id: 'grade-2',
    nameEn: 'Grade 2',
  };

  const subjectFixture: SubjectStoreItem = {
    id: 'subject-1',
    schoolId: 'school-1',
    nameAr: 'math-ar',
    nameEn: 'Mathematics',
    code: 'MATH',
    color: '#2563eb',
    isActive: true,
  };

  const secondSubjectFixture: SubjectStoreItem = {
    ...subjectFixture,
    id: 'subject-2',
    nameEn: 'Science',
    code: 'SCI',
  };

  it('lists allocations by term', async () => {
    const repository = createRepository({
      grades: [gradeFixture, secondGradeFixture],
      subjects: [subjectFixture, secondSubjectFixture],
      allocations: [
        allocationFixture({ id: 'allocation-1' }),
        allocationFixture({
          id: 'allocation-2',
          gradeId: secondGradeFixture.id,
          subjectId: secondSubjectFixture.id,
        }),
        allocationFixture({ id: 'allocation-other-term', termId: 'term-2' }),
      ],
    });
    const listUseCase = new ListSubjectAllocationsUseCase(repository);

    await withScope(async () => {
      const result = await listUseCase.execute({ termId: termFixture.id });

      expect(result.items.map((item) => item.id)).toEqual([
        'allocation-1',
        'allocation-2',
      ]);
      expect(result.items[0].subject.code).toBe('MATH');
    });
  });

  it('lists allocations by term and grade', async () => {
    const repository = createRepository({
      grades: [gradeFixture, secondGradeFixture],
      subjects: [subjectFixture, secondSubjectFixture],
      allocations: [
        allocationFixture({ id: 'allocation-1' }),
        allocationFixture({
          id: 'allocation-2',
          gradeId: secondGradeFixture.id,
          subjectId: secondSubjectFixture.id,
        }),
      ],
    });
    const listUseCase = new ListSubjectAllocationsUseCase(repository);

    await withScope(async () => {
      const result = await listUseCase.execute({
        termId: termFixture.id,
        gradeId: gradeFixture.id,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].gradeId).toBe(gradeFixture.id);
    });
  });

  it('bulk saves new allocations', async () => {
    const repository = createRepository();
    const bulkUseCase = new BulkSaveSubjectAllocationsUseCase(repository);

    await withScope(async () => {
      const result = await bulkUseCase.execute({
        termId: termFixture.id,
        items: [
          {
            gradeId: gradeFixture.id,
            subjectId: subjectFixture.id,
            weeklyHours: 5,
          },
        ],
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        academicYearId: termFixture.academicYearId,
        termId: termFixture.id,
        gradeId: gradeFixture.id,
        subjectId: subjectFixture.id,
        weeklyHours: 5,
      });
    });
  });

  it('bulk save updates existing allocations without creating duplicates', async () => {
    const repository = createRepository({
      allocations: [allocationFixture({ weeklyHours: 3 })],
    });
    const bulkUseCase = new BulkSaveSubjectAllocationsUseCase(repository);
    const listUseCase = new ListSubjectAllocationsUseCase(repository);

    await withScope(async () => {
      const result = await bulkUseCase.execute({
        termId: termFixture.id,
        items: [
          {
            gradeId: gradeFixture.id,
            subjectId: subjectFixture.id,
            weeklyHours: 7,
          },
        ],
      });
      const listed = await listUseCase.execute({ termId: termFixture.id });

      expect(result.items[0].weeklyHours).toBe(7);
      expect(listed.items).toHaveLength(1);
      expect(listed.items[0].weeklyHours).toBe(7);
    });
  });

  it('rejects duplicate grade and subject pairs before writing', async () => {
    const repository = createRepository();
    const bulkUseCase = new BulkSaveSubjectAllocationsUseCase(repository);

    await withScope(async () => {
      await expect(
        bulkUseCase.execute({
          termId: termFixture.id,
          items: [
            {
              gradeId: gradeFixture.id,
              subjectId: subjectFixture.id,
              weeklyHours: 5,
            },
            {
              gradeId: gradeFixture.id,
              subjectId: subjectFixture.id,
              weeklyHours: 6,
            },
          ],
        }),
      ).rejects.toBeInstanceOf(SubjectAllocationDuplicatePairException);
      expect(repository.bulkSaveAllocations).not.toHaveBeenCalled();
    });
  });

  it('rejects invalid weekly hours before writing', async () => {
    const repository = createRepository();
    const bulkUseCase = new BulkSaveSubjectAllocationsUseCase(repository);

    await withScope(async () => {
      await expect(
        bulkUseCase.execute({
          termId: termFixture.id,
          items: [
            {
              gradeId: gradeFixture.id,
              subjectId: subjectFixture.id,
              weeklyHours: 81,
            },
          ],
        }),
      ).rejects.toBeInstanceOf(SubjectAllocationInvalidWeeklyHoursException);
      expect(repository.bulkSaveAllocations).not.toHaveBeenCalled();
    });
  });

  it('rejects unknown or cross-school term, grade, and subject references', async () => {
    const repository = createRepository();
    const listUseCase = new ListSubjectAllocationsUseCase(repository);
    const bulkUseCase = new BulkSaveSubjectAllocationsUseCase(repository);

    await withScope(async () => {
      await expect(
        listUseCase.execute({ termId: 'term-outside-school' }),
      ).rejects.toBeInstanceOf(SubjectAllocationInvalidScopeException);

      await expect(
        bulkUseCase.execute({
          termId: termFixture.id,
          items: [
            {
              gradeId: 'grade-outside-school',
              subjectId: subjectFixture.id,
              weeklyHours: 5,
            },
          ],
        }),
      ).rejects.toBeInstanceOf(SubjectAllocationInvalidScopeException);

      await expect(
        bulkUseCase.execute({
          termId: termFixture.id,
          items: [
            {
              gradeId: gradeFixture.id,
              subjectId: 'subject-outside-school',
              weeklyHours: 5,
            },
          ],
        }),
      ).rejects.toBeInstanceOf(SubjectAllocationInvalidScopeException);
      expect(repository.bulkSaveAllocations).not.toHaveBeenCalled();
    });
  });

  it('rejects writes for closed terms', async () => {
    const repository = createRepository({ terms: [termFixture, closedTermFixture] });
    const bulkUseCase = new BulkSaveSubjectAllocationsUseCase(repository);

    await withScope(async () => {
      await expect(
        bulkUseCase.execute({
          termId: closedTermFixture.id,
          items: [
            {
              gradeId: gradeFixture.id,
              subjectId: subjectFixture.id,
              weeklyHours: 5,
            },
          ],
        }),
      ).rejects.toBeInstanceOf(SubjectAllocationClosedTermException);
      expect(repository.bulkSaveAllocations).not.toHaveBeenCalled();
    });
  });

  it('does not write any allocation when a later item has an invalid reference', async () => {
    const repository = createRepository({ subjects: [subjectFixture] });
    const bulkUseCase = new BulkSaveSubjectAllocationsUseCase(repository);
    const listUseCase = new ListSubjectAllocationsUseCase(repository);

    await withScope(async () => {
      await expect(
        bulkUseCase.execute({
          termId: termFixture.id,
          items: [
            {
              gradeId: gradeFixture.id,
              subjectId: subjectFixture.id,
              weeklyHours: 5,
            },
            {
              gradeId: gradeFixture.id,
              subjectId: 'subject-missing',
              weeklyHours: 4,
            },
          ],
        }),
      ).rejects.toBeInstanceOf(SubjectAllocationInvalidScopeException);

      expect(repository.bulkSaveAllocations).not.toHaveBeenCalled();
      await expect(
        listUseCase.execute({ termId: termFixture.id }),
      ).resolves.toEqual({ items: [] });
    });
  });
});

function allocationFixture(
  overrides?: Partial<AllocationStoreItem>,
): AllocationStoreItem {
  return {
    id: 'allocation-1',
    schoolId: 'school-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    gradeId: 'grade-1',
    subjectId: 'subject-1',
    weeklyHours: 5,
    deletedAt: null,
    createdAt: new Date('2026-06-16T09:00:00.000Z'),
    updatedAt: new Date('2026-06-16T09:00:00.000Z'),
    ...overrides,
  };
}
