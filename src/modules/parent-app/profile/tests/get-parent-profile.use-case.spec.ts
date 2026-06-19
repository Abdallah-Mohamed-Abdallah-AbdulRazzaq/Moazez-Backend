import { StudentStatus, UserStatus, UserType } from '@prisma/client';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentAppRequiredParentException } from '../../shared/parent-app-errors';
import type { ParentAppContext } from '../../shared/parent-app.types';
import { GetParentProfileUseCase } from '../application/get-parent-profile.use-case';
import {
  ParentProfileReadAdapter,
  type ParentProfileChildRecord,
  type ParentProfileGuardianRecord,
  type ParentProfileIdentityRecord,
} from '../infrastructure/parent-profile-read.adapter';

describe('GetParentProfileUseCase', () => {
  it('rejects non-parent actors through ParentAppAccessService', async () => {
    const { useCase, accessService, readAdapter } = createUseCase();
    accessService.getParentAppContext.mockRejectedValue(
      new ParentAppRequiredParentException({ reason: 'actor_not_parent' }),
    );

    await expect(useCase.execute()).rejects.toMatchObject({
      code: 'parent_app.actor.required_parent',
    });
    expect(readAdapter.findParentIdentity).not.toHaveBeenCalled();
  });

  it('returns current parent, guardian summaries, and current-school children safely', async () => {
    const { useCase, readAdapter } = createUseCaseWithValidAccess();
    readAdapter.findParentIdentity.mockResolvedValue(parentIdentityFixture());
    readAdapter.listGuardians.mockResolvedValue([guardianFixture()]);
    readAdapter.listChildren.mockResolvedValue([childFixture()]);
    readAdapter.findSchoolDisplay.mockResolvedValue({
      name: 'Moazez Demo School',
      logoUrl: null,
    });

    const result = await useCase.execute();

    expect(result.parent).toEqual({
      userId: 'parent-user-1',
      displayName: 'Mona Parent',
      firstName: 'Mona',
      lastName: 'Parent',
      email: 'parent@example.test',
      phone: '01000000000',
      avatarUrl: null,
    });
    expect(result.guardians).toEqual([
      {
        relationship: 'mother',
        isPrimary: true,
      },
    ]);
    expect(result.children).toEqual([
      {
        studentId: 'student-1',
        displayName: 'Sara Child',
        enrollmentId: 'enrollment-1',
      },
    ]);
    expect(result.unsupported).toEqual({
      avatarUpload: true,
      preferences: true,
      supportTickets: true,
      addChild: true,
    });
  });

  it('does not expose school, organization, schedule, unrelated guardian, private, or security fields', async () => {
    const { useCase, readAdapter } = createUseCaseWithValidAccess();
    readAdapter.findParentIdentity.mockResolvedValue(parentIdentityFixture());
    readAdapter.listGuardians.mockResolvedValue([guardianFixture()]);
    readAdapter.listChildren.mockResolvedValue([childFixture()]);
    readAdapter.findSchoolDisplay.mockResolvedValue({
      name: 'Moazez Demo School',
      logoUrl: null,
    });

    const serialized = JSON.stringify(await useCase.execute());

    for (const forbidden of [
      'schoolId',
      'organizationId',
      'guardianId',
      'scheduleId',
      'unrelated',
      'private-phone',
      'private-guardian',
      'medical',
      'document',
      'internalNote',
      'password',
      'session',
      'token',
      'objectKey',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

function createUseCase(extraAdapterMethods?: Record<string, jest.Mock>): {
  useCase: GetParentProfileUseCase;
  accessService: jest.Mocked<ParentAppAccessService>;
  readAdapter: jest.Mocked<ParentProfileReadAdapter>;
} {
  const accessService = {
    getParentAppContext: jest.fn(),
  } as unknown as jest.Mocked<ParentAppAccessService>;
  const readAdapter = {
    findParentIdentity: jest.fn(),
    listGuardians: jest.fn(),
    listChildren: jest.fn(),
    findSchoolDisplay: jest.fn(),
    ...extraAdapterMethods,
  } as unknown as jest.Mocked<ParentProfileReadAdapter>;

  return {
    useCase: new GetParentProfileUseCase(accessService, readAdapter),
    accessService,
    readAdapter,
  };
}

function createUseCaseWithValidAccess(
  extraAdapterMethods?: Record<string, jest.Mock>,
): {
  useCase: GetParentProfileUseCase;
  accessService: jest.Mocked<ParentAppAccessService>;
  readAdapter: jest.Mocked<ParentProfileReadAdapter>;
} {
  const created = createUseCase(extraAdapterMethods);
  created.accessService.getParentAppContext.mockResolvedValue(contextFixture());

  return created;
}

function contextFixture(): ParentAppContext {
  return {
    parentUserId: 'parent-user-1',
    schoolId: 'school-1',
    organizationId: 'org-1',
    membershipId: 'membership-1',
    roleId: 'role-1',
    permissions: ['students.records.view'],
    guardianIds: ['guardian-1'],
    children: [
      {
        studentId: 'student-1',
        enrollmentId: 'enrollment-1',
        classroomId: 'classroom-1',
        academicYearId: 'year-1',
        termId: 'term-1',
      },
    ],
  };
}

function parentIdentityFixture(): ParentProfileIdentityRecord {
  return {
    id: 'parent-user-1',
    email: 'parent@example.test',
    phone: '01000000000',
    firstName: 'Mona',
    lastName: 'Parent',
    userType: UserType.PARENT,
    status: UserStatus.ACTIVE,
    deletedAt: null,
  };
}

function guardianFixture(): ParentProfileGuardianRecord {
  return {
    relation: 'mother',
    isPrimary: true,
  };
}

function childFixture(): ParentProfileChildRecord {
  return {
    id: 'enrollment-1',
    studentId: 'student-1',
    student: {
      id: 'student-1',
      firstName: 'Sara',
      lastName: 'Child',
      status: StudentStatus.ACTIVE,
    },
  };
}
