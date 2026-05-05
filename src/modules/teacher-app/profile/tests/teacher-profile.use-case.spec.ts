import { UserStatus, UserType } from '@prisma/client';
import { TeacherAppAllocationReadAdapter } from '../../access/teacher-app-allocation-read.adapter';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import { TeacherAppRequiredTeacherException } from '../../shared/teacher-app.errors';
import type { TeacherAppAllocationRecord } from '../../shared/teacher-app.types';
import { GetTeacherEmploymentProfileUseCase } from '../application/get-teacher-employment-profile.use-case';
import { GetTeacherProfileUseCase } from '../application/get-teacher-profile.use-case';
import { TeacherProfileReadAdapter } from '../infrastructure/teacher-profile-read.adapter';

const TEACHER_ID = 'teacher-1';

describe('Teacher Profile use cases', () => {
  it('profile rejects non-teacher actors through the access service', async () => {
    const { profileUseCase, accessService } = createUseCases();
    accessService.assertCurrentTeacher.mockImplementation(() => {
      throw new TeacherAppRequiredTeacherException({
        reason: 'actor_not_teacher',
      });
    });

    await expect(profileUseCase.execute()).rejects.toBeInstanceOf(
      TeacherAppRequiredTeacherException,
    );
  });

  it('profile returns current teacher identity, school display, role, and summaries', async () => {
    const { profileUseCase, allocationReadAdapter, profileReadAdapter } =
      createUseCases();
    allocationReadAdapter.listAllOwnedAllocations.mockResolvedValue([
      allocationFixture({ id: 'allocation-1', subjectId: 'subject-1' }),
      allocationFixture({
        id: 'allocation-2',
        classroomId: 'classroom-2',
        subjectId: 'subject-1',
      }),
      allocationFixture({
        id: 'allocation-3',
        classroomId: 'classroom-3',
        subjectId: 'subject-2',
      }),
    ]);
    profileReadAdapter.countDistinctStudentsForAllocations.mockResolvedValue(54);

    const result = await profileUseCase.execute();

    expect(result.teacher).toEqual({
      userId: TEACHER_ID,
      displayName: 'Test Teacher',
      email: 'teacher@moazez.local',
      phone: '+201000000000',
      avatarUrl: null,
      userType: 'teacher',
    });
    expect(result.school).toEqual({
      name: 'Moazez Academy',
      logoUrl: null,
    });
    expect(result.role).toEqual({
      roleId: 'role-1',
      name: 'Teacher',
    });
    expect(result.classesSummary).toEqual({
      classesCount: 3,
      subjectsCount: 2,
      studentsCount: 54,
    });
    expect(result.permissions).toEqual(['reinforcement.xp.view']);
    expect(allocationReadAdapter.listAllOwnedAllocations).toHaveBeenCalledWith(
      TEACHER_ID,
    );
  });

  it('profile does not expose schoolId, scheduleId, or private security fields', async () => {
    const { profileUseCase } = createUseCases();

    const result = await profileUseCase.execute();
    const json = JSON.stringify(result);

    for (const forbidden of [
      'schoolId',
      'scheduleId',
      'password',
      'passwordHash',
      'session',
      'refreshToken',
      'objectKey',
      'bucket',
      'raw-storage-logo',
    ]) {
      expect(json).not.toContain(forbidden);
    }
  });

  it('employment returns stable unsupported/null fields without persistence', () => {
    const { employmentUseCase } = createUseCases();

    expect(employmentUseCase.execute()).toEqual({
      employment: {
        employeeId: null,
        department: null,
        specialization: null,
        employmentType: null,
        joiningDate: null,
        officeHours: null,
        manager: null,
        status: 'unsupported',
      },
      reason: 'teacher_employment_profile_not_available',
    });
  });
});

function createUseCases(): {
  profileUseCase: GetTeacherProfileUseCase;
  employmentUseCase: GetTeacherEmploymentProfileUseCase;
  accessService: jest.Mocked<TeacherAppAccessService>;
  allocationReadAdapter: jest.Mocked<TeacherAppAllocationReadAdapter>;
  profileReadAdapter: jest.Mocked<TeacherProfileReadAdapter>;
} {
  const accessService = {
    assertCurrentTeacher: jest.fn(() => ({
      teacherUserId: TEACHER_ID,
      schoolId: 'school-1',
      organizationId: 'org-1',
      membershipId: 'membership-1',
      roleId: 'role-1',
      permissions: ['reinforcement.xp.view'],
    })),
  } as unknown as jest.Mocked<TeacherAppAccessService>;
  const allocationReadAdapter = {
    listAllOwnedAllocations: jest.fn(() =>
      Promise.resolve([allocationFixture()]),
    ),
  } as unknown as jest.Mocked<TeacherAppAllocationReadAdapter>;
  const profileReadAdapter = {
    findTeacherIdentity: jest.fn(() =>
      Promise.resolve({
        id: TEACHER_ID,
        email: 'teacher@moazez.local',
        phone: '+201000000000',
        firstName: 'Test',
        lastName: 'Teacher',
        userType: UserType.TEACHER,
        status: UserStatus.ACTIVE,
      }),
    ),
    findSchoolDisplay: jest.fn(() =>
      Promise.resolve({ name: 'Moazez Academy', logoUrl: null }),
    ),
    findTeacherRole: jest.fn(() =>
      Promise.resolve({
        roleId: 'role-1',
        role: {
          id: 'role-1',
          name: 'Teacher',
        },
      } as unknown as Awaited<
        ReturnType<TeacherProfileReadAdapter['findTeacherRole']>
      >),
    ),
    countDistinctStudentsForAllocations: jest.fn(() => Promise.resolve(12)),
  } as unknown as jest.Mocked<TeacherProfileReadAdapter>;

  return {
    profileUseCase: new GetTeacherProfileUseCase(
      accessService,
      allocationReadAdapter,
      profileReadAdapter,
    ),
    employmentUseCase: new GetTeacherEmploymentProfileUseCase(accessService),
    accessService,
    allocationReadAdapter,
    profileReadAdapter,
  };
}

function allocationFixture(
  overrides?: Partial<TeacherAppAllocationRecord>,
): TeacherAppAllocationRecord {
  const schoolId = 'school-1';

  return {
    id: 'allocation-1',
    schoolId,
    teacherUserId: TEACHER_ID,
    subjectId: 'subject-1',
    classroomId: 'classroom-1',
    termId: 'term-1',
    subject: {
      id: 'subject-1',
      schoolId,
      nameAr: 'Math AR',
      nameEn: 'Math',
      code: 'MATH',
    },
    classroom: {
      id: 'classroom-1',
      schoolId,
      sectionId: 'section-1',
      roomId: null,
      nameAr: 'Classroom AR',
      nameEn: 'Classroom',
      room: null,
      section: {
        id: 'section-1',
        schoolId,
        gradeId: 'grade-1',
        nameAr: 'Section AR',
        nameEn: 'Section',
        grade: {
          id: 'grade-1',
          schoolId,
          stageId: 'stage-1',
          nameAr: 'Grade AR',
          nameEn: 'Grade',
          stage: {
            id: 'stage-1',
            schoolId,
            nameAr: 'Stage AR',
            nameEn: 'Stage',
          },
        },
      },
    },
    term: {
      id: 'term-1',
      schoolId,
      academicYearId: 'year-1',
      nameAr: 'Term AR',
      nameEn: 'Term',
      isActive: true,
    },
    ...overrides,
  };
}
