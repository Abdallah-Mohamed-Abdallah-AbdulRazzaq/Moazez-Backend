import { MembershipStatus, UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { ApplyTeacherAllocationToGradeUseCase } from '../application/apply-teacher-allocation-to-grade.use-case';
import { BulkSaveTeacherAllocationsUseCase } from '../application/bulk-save-teacher-allocations.use-case';
import { ClearTeacherAllocationsBySubjectUseCase } from '../application/clear-teacher-allocations-by-subject.use-case';
import { CreateTeacherAllocationUseCase } from '../application/create-teacher-allocation.use-case';
import { DeleteTeacherAllocationUseCase } from '../application/delete-teacher-allocation.use-case';
import { GetTeacherLoadsUseCase } from '../application/get-teacher-loads.use-case';
import { ListTeacherAllocationsUseCase } from '../application/list-teacher-allocations.use-case';
import { ValidateTeacherAllocationsUseCase } from '../application/validate-teacher-allocations.use-case';
import {
  TeacherAllocationClearConflictException,
  TeacherAllocationClosedTermException,
  TeacherAllocationDeleteConflictException,
  TeacherAllocationDuplicatePairException,
  TeacherAllocationInvalidScopeException,
  TeacherAllocationMissingSubjectAllocationException,
} from '../domain/teacher-allocation.exceptions';
import { TeacherAllocationRepository } from '../infrastructure/teacher-allocation.repository';

type MembershipStoreItem = {
  id: string;
  schoolId: string | null;
  userType: UserType;
  status: MembershipStatus;
  endedAt: Date | null;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    userType: UserType;
  };
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

type GradeStoreItem = {
  id: string;
  schoolId: string;
  nameAr: string;
  nameEn: string;
};

type ClassroomStoreItem = {
  id: string;
  schoolId: string;
  sectionId: string;
  roomId: string | null;
  nameAr: string;
  nameEn: string;
  gradeId: string;
};

type TermStoreItem = {
  id: string;
  schoolId: string;
  academicYearId: string;
  nameAr: string;
  nameEn: string;
  isActive: boolean;
};

type SubjectAllocationStoreItem = {
  id: string;
  schoolId: string;
  academicYearId: string;
  termId: string;
  gradeId: string;
  subjectId: string;
  weeklyHours: number;
};

type AllocationStoreItem = {
  id: string;
  schoolId: string;
  teacherUserId: string;
  subjectId: string;
  classroomId: string;
  termId: string;
  createdAt: Date;
  updatedAt: Date;
};

type DependencyCounts = {
  timetableEntries: number;
  lessonPlans: number;
  homeworkAssignments: number;
};

describe('Teacher allocation use cases', () => {
  async function withScope(testFn: () => Promise<void>): Promise<void> {
    await runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
        roleId: 'role-1',
        permissions: ['academics.structure.view', 'academics.structure.manage'],
      });

      await testFn();
    });
  }

  function createRepository(seed?: {
    memberships?: MembershipStoreItem[];
    subjects?: SubjectStoreItem[];
    grades?: GradeStoreItem[];
    classrooms?: ClassroomStoreItem[];
    terms?: TermStoreItem[];
    subjectAllocations?: SubjectAllocationStoreItem[];
    allocations?: AllocationStoreItem[];
    dependencies?: Record<string, DependencyCounts>;
  }): TeacherAllocationRepository {
    const memberships = [...(seed?.memberships ?? [teacherMembershipFixture])];
    const subjects = [...(seed?.subjects ?? [subjectFixture])];
    const grades = [...(seed?.grades ?? [gradeFixture])];
    const classrooms = [...(seed?.classrooms ?? [classroomFixture])];
    const terms = [...(seed?.terms ?? [termFixture])];
    const subjectAllocations = [
      ...(seed?.subjectAllocations ?? [subjectAllocationFixture()]),
    ];
    const allocations = [...(seed?.allocations ?? [])];
    const dependencies = seed?.dependencies ?? {};

    function buildClassroom(classroom: ClassroomStoreItem) {
      const grade = grades.find(
        (item) => item.id === classroom.gradeId && item.schoolId === classroom.schoolId,
      );
      if (!grade) throw new Error('Classroom fixture is missing grade');

      return {
        id: classroom.id,
        schoolId: classroom.schoolId,
        sectionId: classroom.sectionId,
        roomId: classroom.roomId,
        nameAr: classroom.nameAr,
        nameEn: classroom.nameEn,
        section: {
          id: classroom.sectionId,
          gradeId: classroom.gradeId,
          grade,
        },
      };
    }

    function buildRecord(allocation: AllocationStoreItem) {
      const teacherMembership = memberships.find(
        (item) =>
          item.user.id === allocation.teacherUserId &&
          item.schoolId === allocation.schoolId,
      );
      const subject = subjects.find(
        (item) => item.id === allocation.subjectId && item.schoolId === allocation.schoolId,
      );
      const classroom = classrooms.find(
        (item) => item.id === allocation.classroomId && item.schoolId === allocation.schoolId,
      );
      const term = terms.find(
        (item) => item.id === allocation.termId && item.schoolId === allocation.schoolId,
      );

      if (!teacherMembership || !subject || !classroom || !term) {
        throw new Error('Allocation record is missing related fixture data');
      }

      return {
        id: allocation.id,
        schoolId: allocation.schoolId,
        teacherUserId: allocation.teacherUserId,
        subjectId: allocation.subjectId,
        classroomId: allocation.classroomId,
        termId: allocation.termId,
        createdAt: allocation.createdAt,
        updatedAt: allocation.updatedAt,
        teacherUser: teacherMembership.user,
        subject,
        classroom: buildClassroom(classroom),
        term,
      };
    }

    function buildSubjectAllocation(row: SubjectAllocationStoreItem) {
      const grade = grades.find(
        (item) => item.id === row.gradeId && item.schoolId === row.schoolId,
      );
      const subject = subjects.find(
        (item) => item.id === row.subjectId && item.schoolId === row.schoolId,
      );
      if (!grade || !subject) {
        throw new Error('Subject allocation fixture is missing relations');
      }

      return {
        ...row,
        grade,
        subject,
      };
    }

    const repository = {
      listAllocations: jest.fn().mockImplementation(async (filters) =>
        allocations
          .filter((allocation) => allocation.schoolId === 'school-1')
          .filter((allocation) =>
            filters.termId ? allocation.termId === filters.termId : true,
          )
          .filter((allocation) =>
            filters.classroomId
              ? allocation.classroomId === filters.classroomId
              : true,
          )
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
          .map((allocation) => buildRecord(allocation)),
      ),
      findAllocationById: jest.fn().mockImplementation(async (allocationId: string) => {
        const allocation = allocations.find(
          (item) => item.id === allocationId && item.schoolId === 'school-1',
        );
        return allocation ? buildRecord(allocation) : null;
      }),
      findActiveMembershipByUserId: jest.fn().mockImplementation(async (userId: string) =>
        memberships.find(
          (item) =>
            item.user.id === userId &&
            item.schoolId === 'school-1' &&
            item.status === MembershipStatus.ACTIVE &&
            item.endedAt === null,
        ) ?? null,
      ),
      findActiveMembershipsByUserIds: jest
        .fn()
        .mockImplementation(async (userIds: string[]) =>
          memberships.filter(
            (item) =>
              item.schoolId === 'school-1' &&
              item.status === MembershipStatus.ACTIVE &&
              item.endedAt === null &&
              userIds.includes(item.user.id),
          ),
        ),
      findSubjectById: jest.fn().mockImplementation(async (subjectId: string) =>
        subjects.find(
          (item) => item.id === subjectId && item.schoolId === 'school-1',
        ) ?? null,
      ),
      findSubjectsByIds: jest.fn().mockImplementation(async (subjectIds: string[]) =>
        subjects.filter(
          (item) => item.schoolId === 'school-1' && subjectIds.includes(item.id),
        ),
      ),
      findClassroomById: jest.fn().mockImplementation(async (classroomId: string) => {
        const classroom = classrooms.find(
          (item) => item.id === classroomId && item.schoolId === 'school-1',
        );
        return classroom ? buildClassroom(classroom) : null;
      }),
      findClassroomsByIds: jest.fn().mockImplementation(async (classroomIds: string[]) =>
        classrooms
          .filter(
            (item) => item.schoolId === 'school-1' && classroomIds.includes(item.id),
          )
          .map((classroom) => buildClassroom(classroom)),
      ),
      findClassroomsByGradeId: jest.fn().mockImplementation(async (gradeId: string) =>
        classrooms
          .filter((item) => item.schoolId === 'school-1' && item.gradeId === gradeId)
          .map((classroom) => buildClassroom(classroom)),
      ),
      findClassroomsByGradeIds: jest.fn().mockImplementation(async (gradeIds: string[]) =>
        classrooms
          .filter(
            (item) => item.schoolId === 'school-1' && gradeIds.includes(item.gradeId),
          )
          .map((classroom) => buildClassroom(classroom)),
      ),
      findGradeById: jest.fn().mockImplementation(async (gradeId: string) =>
        grades.find((item) => item.id === gradeId && item.schoolId === 'school-1') ??
        null,
      ),
      findGradesByIds: jest.fn().mockImplementation(async (gradeIds: string[]) =>
        grades.filter(
          (item) => item.schoolId === 'school-1' && gradeIds.includes(item.id),
        ),
      ),
      findTermById: jest.fn().mockImplementation(async (termId: string) =>
        terms.find((item) => item.id === termId && item.schoolId === 'school-1') ??
        null,
      ),
      findSubjectAllocationByKey: jest.fn().mockImplementation(async (input) => {
        const row = subjectAllocations.find(
          (item) =>
            item.schoolId === 'school-1' &&
            item.termId === input.termId &&
            item.gradeId === input.gradeId &&
            item.subjectId === input.subjectId,
        );
        return row ? buildSubjectAllocation(row) : null;
      }),
      findSubjectAllocationsByKeys: jest.fn().mockImplementation(async (termId, keys) =>
        subjectAllocations
          .filter(
            (row) =>
              row.schoolId === 'school-1' &&
              row.termId === termId &&
              keys.some(
                (key: { gradeId: string; subjectId: string }) =>
                  key.gradeId === row.gradeId && key.subjectId === row.subjectId,
              ),
          )
          .map((row) => buildSubjectAllocation(row)),
      ),
      listSubjectAllocationsForValidation: jest.fn().mockImplementation(async (filters) =>
        subjectAllocations
          .filter((row) => row.schoolId === 'school-1')
          .filter((row) => row.termId === filters.termId)
          .filter((row) => (filters.gradeId ? row.gradeId === filters.gradeId : true))
          .filter((row) =>
            filters.subjectId ? row.subjectId === filters.subjectId : true,
          )
          .map((row) => buildSubjectAllocation(row)),
      ),
      listAllocationsForValidation: jest.fn().mockImplementation(async (filters) =>
        allocations
          .filter((allocation) => allocation.schoolId === 'school-1')
          .filter((allocation) => allocation.termId === filters.termId)
          .filter((allocation) =>
            filters.subjectId ? allocation.subjectId === filters.subjectId : true,
          )
          .filter((allocation) => {
            if (!filters.gradeId) return true;
            const classroom = classrooms.find(
              (item) => item.id === allocation.classroomId,
            );
            return classroom?.gradeId === filters.gradeId;
          })
          .map((allocation) => buildRecord(allocation)),
      ),
      listAllocationsForTeacherLoads: jest.fn().mockImplementation(async (filters) =>
        allocations
          .filter((allocation) => allocation.schoolId === 'school-1')
          .filter((allocation) => allocation.termId === filters.termId)
          .filter((allocation) =>
            filters.teacherUserId
              ? allocation.teacherUserId === filters.teacherUserId
              : true,
          )
          .map((allocation) => buildRecord(allocation)),
      ),
      createAllocation: jest.fn().mockImplementation(async (data) => {
        if (
          allocations.some(
            (item) =>
              item.schoolId === data.schoolId &&
              item.teacherUserId === data.teacherUserId &&
              item.subjectId === data.subjectId &&
              item.classroomId === data.classroomId &&
              item.termId === data.termId,
          )
        ) {
          throw { code: 'P2002' };
        }

        const allocation: AllocationStoreItem = {
          id: `allocation-${allocations.length + 1}`,
          schoolId: String(data.schoolId),
          teacherUserId: String(data.teacherUserId),
          subjectId: String(data.subjectId),
          classroomId: String(data.classroomId),
          termId: String(data.termId),
          createdAt: new Date('2026-06-16T09:00:00.000Z'),
          updatedAt: new Date('2026-06-16T09:00:00.000Z'),
        };
        allocations.push(allocation);
        return buildRecord(allocation);
      }),
      bulkSaveAllocations: jest.fn().mockImplementation(async (input) => {
        const affectedIds: string[] = [];
        let createdCount = 0;
        let existingCount = 0;
        for (const item of input.items) {
          const existing = allocations.find(
            (allocation) =>
              allocation.schoolId === input.schoolId &&
              allocation.termId === input.termId &&
              allocation.teacherUserId === item.teacherUserId &&
              allocation.subjectId === item.subjectId &&
              allocation.classroomId === item.classroomId,
          );
          if (existing) {
            existingCount += 1;
            affectedIds.push(existing.id);
            continue;
          }

          const allocation: AllocationStoreItem = {
            id: `allocation-${allocations.length + 1}`,
            schoolId: input.schoolId,
            teacherUserId: item.teacherUserId,
            subjectId: item.subjectId,
            classroomId: item.classroomId,
            termId: input.termId,
            createdAt: new Date('2026-06-16T09:00:00.000Z'),
            updatedAt: new Date('2026-06-16T09:00:00.000Z'),
          };
          allocations.push(allocation);
          createdCount += 1;
          affectedIds.push(allocation.id);
        }

        return {
          allocations: affectedIds.map((id) =>
            buildRecord(allocations.find((allocation) => allocation.id === id)!),
          ),
          createdCount,
          existingCount,
        };
      }),
      countAllocationDependencies: jest.fn().mockImplementation(async (allocationIds) =>
        allocationIds.reduce(
          (total, allocationId) => {
            const current = dependencies[allocationId] ?? emptyDependencies();
            return {
              timetableEntries: total.timetableEntries + current.timetableEntries,
              lessonPlans: total.lessonPlans + current.lessonPlans,
              homeworkAssignments:
                total.homeworkAssignments + current.homeworkAssignments,
            };
          },
          emptyDependencies(),
        ),
      ),
      deleteAllocation: jest.fn().mockImplementation(async (allocationId: string) => {
        const index = allocations.findIndex(
          (item) => item.id === allocationId && item.schoolId === 'school-1',
        );
        if (index === -1) {
          return { status: 'not_found' as const };
        }

        allocations.splice(index, 1);
        return { status: 'deleted' as const };
      }),
      clearSubjectAllocations: jest.fn().mockImplementation(async (input) => {
        const targetIds = allocations
          .filter((allocation) => allocation.schoolId === 'school-1')
          .filter((allocation) => allocation.termId === input.termId)
          .filter((allocation) => allocation.subjectId === input.subjectId)
          .filter((allocation) =>
            input.classroomIds
              ? input.classroomIds.includes(allocation.classroomId)
              : true,
          )
          .map((allocation) => allocation.id);
        const dependencyCounts = await repository.countAllocationDependencies(
          targetIds,
        );
        if (
          dependencyCounts.timetableEntries > 0 ||
          dependencyCounts.lessonPlans > 0 ||
          dependencyCounts.homeworkAssignments > 0
        ) {
          return {
            status: 'conflict' as const,
            dependencyCounts,
            allocationIds: targetIds,
          };
        }

        let deletedCount = 0;
        for (const allocationId of targetIds) {
          const index = allocations.findIndex((item) => item.id === allocationId);
          if (index !== -1) {
            allocations.splice(index, 1);
            deletedCount += 1;
          }
        }
        return { status: 'deleted' as const, deletedCount };
      }),
    };

    return repository as unknown as TeacherAllocationRepository;
  }

  const teacherMembershipFixture: MembershipStoreItem = {
    id: 'membership-teacher-1',
    schoolId: 'school-1',
    userType: UserType.TEACHER,
    status: MembershipStatus.ACTIVE,
    endedAt: null,
    user: {
      id: 'teacher-1',
      firstName: 'Mariam',
      lastName: 'Ali',
      email: 'mariam.teacher@example.test',
      userType: UserType.TEACHER,
    },
  };

  const subjectFixture: SubjectStoreItem = {
    id: 'subject-1',
    schoolId: 'school-1',
    nameAr: 'Math AR',
    nameEn: 'Mathematics',
    code: 'MATH-101',
    color: '#2563eb',
    isActive: true,
  };

  const scienceSubjectFixture: SubjectStoreItem = {
    ...subjectFixture,
    id: 'subject-2',
    nameEn: 'Science',
    code: 'SCI-101',
    color: '#16a34a',
  };

  const gradeFixture: GradeStoreItem = {
    id: 'grade-1',
    schoolId: 'school-1',
    nameAr: 'Grade AR',
    nameEn: 'Grade 1',
  };

  const classroomFixture: ClassroomStoreItem = {
    id: 'classroom-1',
    schoolId: 'school-1',
    sectionId: 'section-1',
    roomId: null,
    nameAr: 'Classroom AR',
    nameEn: 'Classroom 101',
    gradeId: gradeFixture.id,
  };

  const secondClassroomFixture: ClassroomStoreItem = {
    ...classroomFixture,
    id: 'classroom-2',
    nameEn: 'Classroom 102',
  };

  const termFixture: TermStoreItem = {
    id: 'term-1',
    schoolId: 'school-1',
    academicYearId: 'year-1',
    nameAr: 'Term AR',
    nameEn: 'Term 1',
    isActive: true,
  };

  const closedTermFixture: TermStoreItem = {
    ...termFixture,
    id: 'term-closed',
    isActive: false,
  };

  it('creates an allocation when the subject allocation matrix row exists', async () => {
    const repository = createRepository();
    const createUseCase = new CreateTeacherAllocationUseCase(repository);
    const listUseCase = new ListTeacherAllocationsUseCase(repository);

    await withScope(async () => {
      const created = await createUseCase.execute({
        teacherUserId: teacherMembershipFixture.user.id,
        subjectId: subjectFixture.id,
        classroomId: classroomFixture.id,
        termId: termFixture.id,
      });

      expect(created.teacher.fullName).toBe('Mariam Ali');
      expect(created.subject.code).toBe('MATH-101');
      expect(created.classroom.sectionId).toBe('section-1');
      expect(created.term.status).toBe('open');

      const listed = await listUseCase.execute({ termId: termFixture.id });
      expect(listed.items).toHaveLength(1);
      expect(listed.items[0].id).toBe(created.id);
    });
  });

  it('bulk save creates multiple allocations', async () => {
    const repository = createRepository({
      classrooms: [classroomFixture, secondClassroomFixture],
      subjectAllocations: [subjectAllocationFixture()],
    });
    const bulkUseCase = new BulkSaveTeacherAllocationsUseCase(repository);

    await withScope(async () => {
      const result = await bulkUseCase.execute({
        termId: termFixture.id,
        items: [
          {
            teacherUserId: teacherMembershipFixture.user.id,
            subjectId: subjectFixture.id,
            classroomId: classroomFixture.id,
          },
          {
            teacherUserId: teacherMembershipFixture.user.id,
            subjectId: subjectFixture.id,
            classroomId: secondClassroomFixture.id,
          },
        ],
      });

      expect(result.items).toHaveLength(2);
      expect(result.summary).toEqual({
        requestedCount: 2,
        createdCount: 2,
        existingCount: 0,
      });
    });
  });

  it('bulk save returns existing allocations without duplicate create', async () => {
    const repository = createRepository({
      allocations: [allocationFixture()],
    });
    const bulkUseCase = new BulkSaveTeacherAllocationsUseCase(repository);

    await withScope(async () => {
      const result = await bulkUseCase.execute({
        termId: termFixture.id,
        items: [
          {
            teacherUserId: teacherMembershipFixture.user.id,
            subjectId: subjectFixture.id,
            classroomId: classroomFixture.id,
          },
        ],
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('allocation-1');
      expect(result.summary.createdCount).toBe(0);
      expect(result.summary.existingCount).toBe(1);
    });
  });

  it('bulk save rejects duplicate pairs before writing', async () => {
    const repository = createRepository();
    const bulkUseCase = new BulkSaveTeacherAllocationsUseCase(repository);

    await withScope(async () => {
      await expect(
        bulkUseCase.execute({
          termId: termFixture.id,
          items: [
            {
              teacherUserId: teacherMembershipFixture.user.id,
              subjectId: subjectFixture.id,
              classroomId: classroomFixture.id,
            },
            {
              teacherUserId: teacherMembershipFixture.user.id,
              subjectId: subjectFixture.id,
              classroomId: classroomFixture.id,
            },
          ],
        }),
      ).rejects.toBeInstanceOf(TeacherAllocationDuplicatePairException);
      expect(repository.bulkSaveAllocations).not.toHaveBeenCalled();
    });
  });

  it('bulk save rejects missing subject allocation matrix rows', async () => {
    const repository = createRepository({ subjectAllocations: [] });
    const bulkUseCase = new BulkSaveTeacherAllocationsUseCase(repository);

    await withScope(async () => {
      await expect(
        bulkUseCase.execute({
          termId: termFixture.id,
          items: [
            {
              teacherUserId: teacherMembershipFixture.user.id,
              subjectId: subjectFixture.id,
              classroomId: classroomFixture.id,
            },
          ],
        }),
      ).rejects.toBeInstanceOf(
        TeacherAllocationMissingSubjectAllocationException,
      );
      expect(repository.bulkSaveAllocations).not.toHaveBeenCalled();
    });
  });

  it('bulk save rejects inactive terms, non-teachers, and invalid references', async () => {
    const nonTeacherMembership: MembershipStoreItem = {
      ...teacherMembershipFixture,
      id: 'membership-user-1',
      userType: UserType.SCHOOL_USER,
      user: {
        ...teacherMembershipFixture.user,
        id: 'user-2',
        userType: UserType.SCHOOL_USER,
      },
    };
    const repository = createRepository({
      memberships: [nonTeacherMembership],
      terms: [termFixture, closedTermFixture],
    });
    const bulkUseCase = new BulkSaveTeacherAllocationsUseCase(repository);

    await withScope(async () => {
      await expect(
        bulkUseCase.execute({
          termId: closedTermFixture.id,
          items: [
            {
              teacherUserId: teacherMembershipFixture.user.id,
              subjectId: subjectFixture.id,
              classroomId: classroomFixture.id,
            },
          ],
        }),
      ).rejects.toBeInstanceOf(TeacherAllocationClosedTermException);

      await expect(
        bulkUseCase.execute({
          termId: termFixture.id,
          items: [
            {
              teacherUserId: nonTeacherMembership.user.id,
              subjectId: subjectFixture.id,
              classroomId: classroomFixture.id,
            },
          ],
        }),
      ).rejects.toBeInstanceOf(TeacherAllocationInvalidScopeException);

      await expect(
        bulkUseCase.execute({
          termId: termFixture.id,
          items: [
            {
              teacherUserId: nonTeacherMembership.user.id,
              subjectId: 'subject-outside-school',
              classroomId: classroomFixture.id,
            },
          ],
        }),
      ).rejects.toBeInstanceOf(TeacherAllocationInvalidScopeException);
    });
  });

  it('apply-to-grade creates allocations for all grade classrooms', async () => {
    const repository = createRepository({
      classrooms: [classroomFixture, secondClassroomFixture],
    });
    const applyUseCase = new ApplyTeacherAllocationToGradeUseCase(repository);

    await withScope(async () => {
      const result = await applyUseCase.execute({
        termId: termFixture.id,
        gradeId: gradeFixture.id,
        subjectId: subjectFixture.id,
        teacherUserId: teacherMembershipFixture.user.id,
      });

      expect(result.items.map((item) => item.classroom.id)).toEqual([
        classroomFixture.id,
        secondClassroomFixture.id,
      ]);
      expect(result.summary).toEqual({
        requestedClassrooms: 2,
        createdCount: 2,
        existingCount: 0,
      });
    });
  });

  it('apply-to-grade respects requested classrooms and validates grade membership', async () => {
    const otherGrade: GradeStoreItem = {
      id: 'grade-2',
      schoolId: 'school-1',
      nameAr: 'Other AR',
      nameEn: 'Other Grade',
    };
    const otherGradeClassroom: ClassroomStoreItem = {
      ...secondClassroomFixture,
      id: 'classroom-other-grade',
      gradeId: otherGrade.id,
    };
    const repository = createRepository({
      grades: [gradeFixture, otherGrade],
      classrooms: [classroomFixture, otherGradeClassroom],
    });
    const applyUseCase = new ApplyTeacherAllocationToGradeUseCase(repository);

    await withScope(async () => {
      const result = await applyUseCase.execute({
        termId: termFixture.id,
        gradeId: gradeFixture.id,
        subjectId: subjectFixture.id,
        teacherUserId: teacherMembershipFixture.user.id,
        classroomIds: [classroomFixture.id],
      });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].classroom.id).toBe(classroomFixture.id);

      await expect(
        applyUseCase.execute({
          termId: termFixture.id,
          gradeId: gradeFixture.id,
          subjectId: subjectFixture.id,
          teacherUserId: teacherMembershipFixture.user.id,
          classroomIds: [otherGradeClassroom.id],
        }),
      ).rejects.toBeInstanceOf(TeacherAllocationInvalidScopeException);
    });
  });

  it('clear-subject clears only selected classroom scope', async () => {
    const repository = createRepository({
      classrooms: [classroomFixture, secondClassroomFixture],
      allocations: [
        allocationFixture({ id: 'allocation-1', classroomId: classroomFixture.id }),
        allocationFixture({
          id: 'allocation-2',
          classroomId: secondClassroomFixture.id,
        }),
      ],
    });
    const clearUseCase = new ClearTeacherAllocationsBySubjectUseCase(repository);
    const listUseCase = new ListTeacherAllocationsUseCase(repository);

    await withScope(async () => {
      await expect(
        clearUseCase.execute({
          termId: termFixture.id,
          subjectId: subjectFixture.id,
          classroomIds: [classroomFixture.id],
        }),
      ).resolves.toEqual({ ok: true, deletedCount: 1 });

      const listed = await listUseCase.execute({ termId: termFixture.id });
      expect(listed.items).toHaveLength(1);
      expect(listed.items[0].classroom.id).toBe(secondClassroomFixture.id);
    });
  });

  it('delete and clear reject dependent timetable, lesson, or homework rows', async () => {
    const repository = createRepository({
      allocations: [allocationFixture()],
      dependencies: {
        'allocation-1': {
          timetableEntries: 1,
          lessonPlans: 0,
          homeworkAssignments: 0,
        },
      },
    });
    const deleteUseCase = new DeleteTeacherAllocationUseCase(repository);
    const clearUseCase = new ClearTeacherAllocationsBySubjectUseCase(repository);

    await withScope(async () => {
      await expect(deleteUseCase.execute('allocation-1')).rejects.toBeInstanceOf(
        TeacherAllocationDeleteConflictException,
      );
      await expect(
        clearUseCase.execute({
          termId: termFixture.id,
          subjectId: subjectFixture.id,
        }),
      ).rejects.toBeInstanceOf(TeacherAllocationClearConflictException);
    });
  });

  it('delete rejects allocations in closed terms', async () => {
    const repository = createRepository({
      terms: [termFixture, closedTermFixture],
      allocations: [allocationFixture({ termId: closedTermFixture.id })],
    });
    const deleteUseCase = new DeleteTeacherAllocationUseCase(repository);

    await withScope(async () => {
      await expect(deleteUseCase.execute('allocation-1')).rejects.toBeInstanceOf(
        TeacherAllocationClosedTermException,
      );
      expect(repository.deleteAllocation).not.toHaveBeenCalled();
    });
  });

  it('validation reports missing classroom teacher allocations', async () => {
    const repository = createRepository({
      classrooms: [classroomFixture, secondClassroomFixture],
      allocations: [
        allocationFixture({ id: 'allocation-1', classroomId: classroomFixture.id }),
      ],
    });
    const validateUseCase = new ValidateTeacherAllocationsUseCase(repository);

    await withScope(async () => {
      const result = await validateUseCase.execute({ termId: termFixture.id });

      expect(result.summary.missingTeacherAssignments).toBe(1);
      expect(result.items[0]).toMatchObject({
        status: 'incomplete',
        classroomCount: 2,
        allocatedClassroomCount: 1,
        missingClassroomCount: 1,
      });
      expect(result.items[0].issues[0].classroomIds).toEqual([
        secondClassroomFixture.id,
      ]);
    });
  });

  it('teacher loads sum weekly hours from subject allocation rows', async () => {
    const repository = createRepository({
      subjects: [subjectFixture, scienceSubjectFixture],
      subjectAllocations: [
        subjectAllocationFixture({ subjectId: subjectFixture.id, weeklyHours: 5 }),
        subjectAllocationFixture({
          id: 'subject-allocation-2',
          subjectId: scienceSubjectFixture.id,
          weeklyHours: 3,
        }),
      ],
      allocations: [
        allocationFixture({ id: 'allocation-1', subjectId: subjectFixture.id }),
        allocationFixture({
          id: 'allocation-2',
          subjectId: scienceSubjectFixture.id,
        }),
      ],
    });
    const loadsUseCase = new GetTeacherLoadsUseCase(repository);

    await withScope(async () => {
      const result = await loadsUseCase.execute({ termId: termFixture.id });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].allocationCount).toBe(2);
      expect(result.items[0].totalWeeklyHours).toBe(8);
      expect(result.items[0].subjectsCount).toBe(2);
      expect(result.items[0].warnings).toEqual([]);
    });
  });

  it('teacher loads warn when weekly hours matrix rows are missing', async () => {
    const repository = createRepository({
      subjectAllocations: [],
      allocations: [allocationFixture()],
    });
    const loadsUseCase = new GetTeacherLoadsUseCase(repository);

    await withScope(async () => {
      const result = await loadsUseCase.execute({ termId: termFixture.id });

      expect(result.items[0].loads[0].weeklyHours).toBeNull();
      expect(result.items[0].totalWeeklyHours).toBe(0);
      expect(result.items[0].warnings[0]).toMatchObject({
        code: 'missing_subject_allocation_weekly_hours',
        allocationId: 'allocation-1',
      });
    });
  });
});

function allocationFixture(
  overrides?: Partial<AllocationStoreItem>,
): AllocationStoreItem {
  return {
    id: 'allocation-1',
    schoolId: 'school-1',
    teacherUserId: 'teacher-1',
    subjectId: 'subject-1',
    classroomId: 'classroom-1',
    termId: 'term-1',
    createdAt: new Date('2026-06-16T09:00:00.000Z'),
    updatedAt: new Date('2026-06-16T09:00:00.000Z'),
    ...overrides,
  };
}

function subjectAllocationFixture(
  overrides?: Partial<SubjectAllocationStoreItem>,
): SubjectAllocationStoreItem {
  return {
    id: 'subject-allocation-1',
    schoolId: 'school-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    gradeId: 'grade-1',
    subjectId: 'subject-1',
    weeklyHours: 5,
    ...overrides,
  };
}

function emptyDependencies(): DependencyCounts {
  return {
    timetableEntries: 0,
    lessonPlans: 0,
    homeworkAssignments: 0,
  };
}
