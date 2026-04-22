import { MembershipStatus, UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { CreateTeacherAllocationUseCase } from '../application/create-teacher-allocation.use-case';
import { DeleteTeacherAllocationUseCase } from '../application/delete-teacher-allocation.use-case';
import { ListTeacherAllocationsUseCase } from '../application/list-teacher-allocations.use-case';
import { TeacherAllocationConflictException } from '../domain/teacher-allocation.exceptions';
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
  isActive: boolean;
};

type ClassroomStoreItem = {
  id: string;
  schoolId: string;
  sectionId: string;
  roomId: string | null;
  nameAr: string;
  nameEn: string;
};

type TermStoreItem = {
  id: string;
  schoolId: string;
  academicYearId: string;
  nameAr: string;
  nameEn: string;
  isActive: boolean;
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
    classrooms?: ClassroomStoreItem[];
    terms?: TermStoreItem[];
    allocations?: AllocationStoreItem[];
  }): TeacherAllocationRepository {
    const memberships = [...(seed?.memberships ?? [])];
    const subjects = [...(seed?.subjects ?? [])];
    const classrooms = [...(seed?.classrooms ?? [])];
    const terms = [...(seed?.terms ?? [])];
    const allocations = [...(seed?.allocations ?? [])];

    function buildRecord(allocation: AllocationStoreItem) {
      const teacherMembership = memberships.find(
        (item) =>
          item.user.id === allocation.teacherUserId && item.schoolId === allocation.schoolId,
      );
      const subject = subjects.find((item) => item.id === allocation.subjectId);
      const classroom = classrooms.find((item) => item.id === allocation.classroomId);
      const term = terms.find((item) => item.id === allocation.termId);

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
        classroom,
        term,
      };
    }

    return {
      listAllocations: jest.fn().mockImplementation(async (filters) =>
        allocations
          .filter((allocation) => allocation.schoolId === 'school-1')
          .filter((allocation) =>
            filters.termId ? allocation.termId === filters.termId : true,
          )
          .filter((allocation) =>
            filters.classroomId ? allocation.classroomId === filters.classroomId : true,
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
      findSubjectById: jest.fn().mockImplementation(async (subjectId: string) =>
        subjects.find(
          (item) => item.id === subjectId && item.schoolId === 'school-1',
        ) ?? null,
      ),
      findClassroomById: jest.fn().mockImplementation(async (classroomId: string) =>
        classrooms.find(
          (item) => item.id === classroomId && item.schoolId === 'school-1',
        ) ?? null,
      ),
      findTermById: jest.fn().mockImplementation(async (termId: string) =>
        terms.find((item) => item.id === termId && item.schoolId === 'school-1') ?? null,
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
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        allocations.push(allocation);
        return buildRecord(allocation);
      }),
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
    } as unknown as TeacherAllocationRepository;
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
    nameAr: 'رياضيات',
    nameEn: 'Mathematics',
    code: 'MATH-101',
    isActive: true,
  };

  const classroomFixture: ClassroomStoreItem = {
    id: 'classroom-1',
    schoolId: 'school-1',
    sectionId: 'section-1',
    roomId: null,
    nameAr: 'فصل 101',
    nameEn: 'Classroom 101',
  };

  const termFixture: TermStoreItem = {
    id: 'term-1',
    schoolId: 'school-1',
    academicYearId: 'year-1',
    nameAr: 'الفصل الأول',
    nameEn: 'Term 1',
    isActive: true,
  };

  it('creates an allocation with valid teacher, subject, classroom, and term', async () => {
    const repository = createRepository({
      memberships: [teacherMembershipFixture],
      subjects: [subjectFixture],
      classrooms: [classroomFixture],
      terms: [termFixture],
    });
    const createTeacherAllocationUseCase = new CreateTeacherAllocationUseCase(repository);
    const listTeacherAllocationsUseCase = new ListTeacherAllocationsUseCase(repository);

    await withScope(async () => {
      const created = await createTeacherAllocationUseCase.execute({
        teacherUserId: teacherMembershipFixture.user.id,
        subjectId: subjectFixture.id,
        classroomId: classroomFixture.id,
        termId: termFixture.id,
      });

      expect(created.teacher.fullName).toBe('Mariam Ali');
      expect(created.subject.code).toBe('MATH-101');
      expect(created.classroom.sectionId).toBe('section-1');
      expect(created.term.status).toBe('open');

      const listed = await listTeacherAllocationsUseCase.execute({
        termId: termFixture.id,
      });
      expect(listed.items).toHaveLength(1);
      expect(listed.items[0].id).toBe(created.id);
    });
  });

  it('rejects duplicate allocations with a safe conflict error', async () => {
    const repository = createRepository({
      memberships: [teacherMembershipFixture],
      subjects: [subjectFixture],
      classrooms: [classroomFixture],
      terms: [termFixture],
      allocations: [
        {
          id: 'allocation-1',
          schoolId: 'school-1',
          teacherUserId: teacherMembershipFixture.user.id,
          subjectId: subjectFixture.id,
          classroomId: classroomFixture.id,
          termId: termFixture.id,
          createdAt: new Date('2026-04-20T09:00:00.000Z'),
          updatedAt: new Date('2026-04-20T09:00:00.000Z'),
        },
      ],
    });
    const createTeacherAllocationUseCase = new CreateTeacherAllocationUseCase(repository);

    await withScope(async () => {
      await expect(
        createTeacherAllocationUseCase.execute({
          teacherUserId: teacherMembershipFixture.user.id,
          subjectId: subjectFixture.id,
          classroomId: classroomFixture.id,
          termId: termFixture.id,
        }),
      ).rejects.toBeInstanceOf(TeacherAllocationConflictException);
    });
  });

  it('rejects non-teacher users when creating allocations', async () => {
    const repository = createRepository({
      memberships: [
        {
          ...teacherMembershipFixture,
          id: 'membership-user-1',
          userType: UserType.SCHOOL_USER,
          user: {
            ...teacherMembershipFixture.user,
            id: 'user-2',
            email: 'school.user@example.test',
            userType: UserType.SCHOOL_USER,
          },
        },
      ],
      subjects: [subjectFixture],
      classrooms: [classroomFixture],
      terms: [termFixture],
    });
    const createTeacherAllocationUseCase = new CreateTeacherAllocationUseCase(repository);

    await withScope(async () => {
      await expect(
        createTeacherAllocationUseCase.execute({
          teacherUserId: 'user-2',
          subjectId: subjectFixture.id,
          classroomId: classroomFixture.id,
          termId: termFixture.id,
        }),
      ).rejects.toBeInstanceOf(ValidationDomainException);
    });
  });

  it('deletes allocations successfully', async () => {
    const repository = createRepository({
      memberships: [teacherMembershipFixture],
      subjects: [subjectFixture],
      classrooms: [classroomFixture],
      terms: [termFixture],
      allocations: [
        {
          id: 'allocation-1',
          schoolId: 'school-1',
          teacherUserId: teacherMembershipFixture.user.id,
          subjectId: subjectFixture.id,
          classroomId: classroomFixture.id,
          termId: termFixture.id,
          createdAt: new Date('2026-04-20T09:00:00.000Z'),
          updatedAt: new Date('2026-04-20T09:00:00.000Z'),
        },
      ],
    });
    const deleteTeacherAllocationUseCase = new DeleteTeacherAllocationUseCase(repository);
    const listTeacherAllocationsUseCase = new ListTeacherAllocationsUseCase(repository);

    await withScope(async () => {
      await expect(
        deleteTeacherAllocationUseCase.execute('allocation-1'),
      ).resolves.toEqual({ ok: true });

      const listed = await listTeacherAllocationsUseCase.execute({
        termId: termFixture.id,
      });
      expect(listed.items).toHaveLength(0);
    });
  });
});
