import { HttpStatus } from '@nestjs/common';
import { MembershipStatus, UserStatus, UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../../../common/context/request-context';
import type { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { TeacherRoleTransitionConflictException } from '../../../teachers/directory/domain/teacher-directory.errors';
import {
  TeacherRejectedTransitionAuditService,
  type TeacherLifecycleOperationalLogger,
} from '../../../teachers/lifecycle/application/teacher-rejected-transition-audit.service';
import type { TeacherLifecycleAuditWriter } from '../../../teachers/lifecycle/infrastructure/teacher-lifecycle-audit.writer';
import { CreateUserUseCase } from '../application/create-user.use-case';
import { InviteUserUseCase } from '../application/invite-user.use-case';
import { TeacherSettingsBypassService } from '../application/teacher-settings-bypass.service';
import { UpdateUserUseCase } from '../application/update-user.use-case';
import type { UserLoginIdentityResolver } from '../application/user-login-identity.resolver';
import type {
  ScopedMembershipRecord,
  UsersRepository,
} from '../infrastructure/users.repository';

const IDS = {
  actor: '52000000-0000-4000-8000-000000000001',
  organization: '52000000-0000-4000-8000-000000000002',
  school: '52000000-0000-4000-8000-000000000003',
  membership: '52000000-0000-4000-8000-000000000004',
  user: '52000000-0000-4000-8000-000000000005',
  role: '52000000-0000-4000-8000-000000000006',
};

function inSettingsScope<T>(callback: () => T): T {
  const context = createRequestContext('settings-teacher-bypass-test');
  context.actor = { id: IDS.actor, userType: UserType.SCHOOL_USER };
  context.activeMembership = {
    membershipId: IDS.membership,
    schoolId: IDS.school,
    organizationId: IDS.organization,
    roleId: IDS.role,
    permissions: ['settings.users.manage'],
  };
  return runWithRequestContext(context, callback);
}

function membership(userType = UserType.SCHOOL_USER): ScopedMembershipRecord {
  const now = new Date('2026-07-19T00:00:00.000Z');
  return {
    id: IDS.membership,
    userId: IDS.user,
    organizationId: IDS.organization,
    schoolId: IDS.school,
    roleId: IDS.role,
    userType,
    status: MembershipStatus.ACTIVE,
    startedAt: now,
    endedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    role: {
      id: IDS.role,
      schoolId: IDS.school,
      key: userType === UserType.TEACHER ? 'teacher' : 'school_admin',
      name: 'Managed Role',
      description: null,
      isSystem: false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    },
    user: {
      id: IDS.user,
      email: 'managed@example.test',
      username: 'managed',
      contactEmail: null,
      phone: null,
      passwordHash: null,
      firstName: 'Managed',
      lastName: 'User',
      userType,
      status: UserStatus.ACTIVE,
      lastLoginAt: null,
      mustChangePassword: false,
      passwordChangedAt: null,
      passwordProvisionedAt: null,
      credentialVersion: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    },
  };
}

function rejectingBypass() {
  return {
    reject: jest.fn(async ({ reasonCode }) => {
      throw new TeacherRoleTransitionConflictException(reasonCode);
    }),
  } as unknown as TeacherSettingsBypassService;
}

describe('Teacher Settings bypass closure', () => {
  it('builds a sanitized rejected-transition audit with reason code only', async () => {
    const auditAndThrow = jest.fn(async ({ error }) => {
      throw error;
    });
    const service = new TeacherSettingsBypassService({
      auditAndThrow,
    } as unknown as TeacherRejectedTransitionAuditService);

    await expect(
      inSettingsScope(() =>
        service.reject({
          scope: {
            actorId: IDS.actor,
            userType: UserType.SCHOOL_USER,
            organizationId: IDS.organization,
            schoolId: IDS.school,
            roleId: IDS.role,
          },
          reasonCode: 'teacher_directory_provisioning_required',
          resourceType: 'user',
          resourceId: IDS.actor,
        }),
      ),
    ).rejects.toMatchObject({
      code: 'teachers.account.role_transition_conflict',
      httpStatus: HttpStatus.CONFLICT,
      details: { reasonCode: 'teacher_directory_provisioning_required' },
    });
    expect(auditAndThrow.mock.calls[0][0].audit.metadata).toEqual({
      reasonCode: 'teacher_directory_provisioning_required',
    });
    expect(JSON.stringify(auditAndThrow.mock.calls)).not.toMatch(
      /email|phone|fullName|requestBody|password/iu,
    );
  });

  it('preserves the original public exception when rejected audit delivery fails', async () => {
    const writer = {
      writeRejectedStandalone: jest.fn().mockRejectedValue(new Error('raw')),
    } as unknown as TeacherLifecycleAuditWriter;
    const logger: TeacherLifecycleOperationalLogger = { error: jest.fn() };
    const rejectedAudit = new TeacherRejectedTransitionAuditService(
      writer,
      logger,
    );
    const service = new TeacherSettingsBypassService(rejectedAudit);

    let thrown: unknown;
    try {
      await inSettingsScope(() =>
        service.reject({
          scope: {
            actorId: IDS.actor,
            userType: UserType.SCHOOL_USER,
            organizationId: IDS.organization,
            schoolId: IDS.school,
            roleId: IDS.role,
          },
          reasonCode: 'teacher_promotion_requires_profile',
          resourceType: 'membership',
          resourceId: IDS.membership,
        }),
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({
      code: 'teachers.account.role_transition_conflict',
      httpStatus: HttpStatus.CONFLICT,
      details: { reasonCode: 'teacher_promotion_requires_profile' },
    });
    expect(logger.error).toHaveBeenCalledWith({
      event: 'teachers.role_transition.rejected.audit_delivery_failed',
      traceId: 'settings-teacher-bypass-test',
    });
    expect(
      JSON.stringify((logger.error as jest.Mock).mock.calls),
    ).not.toContain('raw');
  });

  it.each([
    ['active creation', CreateUserUseCase],
    ['invite', InviteUserUseCase],
  ] as const)(
    'rejects Settings %s to Teacher before aggregate writes',
    async (_label, UseCase) => {
      const createUserWithMembership = jest.fn();
      const usersRepository = {
        findAssignableRoleById: jest.fn().mockResolvedValue({
          id: IDS.role,
          key: 'teacher',
          name: 'Teacher',
        }),
        createUserWithMembership,
      } as unknown as UsersRepository;
      const loginIdentityResolver = {
        resolve: jest.fn().mockResolvedValue({
          email: 'attempted@example.test',
          username: null,
          contactEmail: null,
          generatedLoginEmail: false,
        }),
      } as unknown as UserLoginIdentityResolver;
      const bypass = rejectingBypass();
      const useCase = new UseCase(
        usersRepository,
        { createAuditLog: jest.fn() } as unknown as AuthRepository,
        loginIdentityResolver,
        bypass,
      );

      await expect(
        inSettingsScope(() =>
          useCase.execute({
            fullName: 'Attempted Teacher',
            email: 'attempted@example.test',
            roleId: IDS.role,
          }),
        ),
      ).rejects.toMatchObject({
        code: 'teachers.account.role_transition_conflict',
        details: { reasonCode: 'teacher_directory_provisioning_required' },
      });
      expect(loginIdentityResolver.resolve).toHaveBeenCalledTimes(1);
      expect(createUserWithMembership).not.toHaveBeenCalled();
      expect(bypass.reject).toHaveBeenCalledWith(
        expect.objectContaining({
          reasonCode: 'teacher_directory_provisioning_required',
        }),
      );
    },
  );

  it('rejects generic non-Teacher promotion to Teacher before mutation', async () => {
    const updateUserAndMembership = jest.fn();
    const bypass = rejectingBypass();
    const useCase = new UpdateUserUseCase(
      {
        findScopedMembershipByUserId: jest.fn().mockResolvedValue(membership()),
        findAssignableRoleById: jest.fn().mockResolvedValue({
          id: IDS.role,
          key: 'teacher',
        }),
        updateUserAndMembership,
      } as unknown as UsersRepository,
      { createAuditLog: jest.fn() } as unknown as AuthRepository,
      bypass,
    );
    await expect(
      inSettingsScope(() => useCase.execute(IDS.user, { roleId: IDS.role })),
    ).rejects.toMatchObject({
      details: { reasonCode: 'teacher_promotion_requires_profile' },
    });
    expect(updateUserAndMembership).not.toHaveBeenCalled();
  });

  it.each([
    ['current Teacher', membership(UserType.TEACHER), undefined],
    ['requested Teacher role', membership(), { id: IDS.role, key: 'teacher' }],
  ])(
    'rejects generic fullName edits for %s',
    async (_label, current, targetRole) => {
      const updateUserAndMembership = jest.fn();
      const bypass = rejectingBypass();
      const useCase = new UpdateUserUseCase(
        {
          findScopedMembershipByUserId: jest.fn().mockResolvedValue(current),
          findAssignableRoleById: jest.fn().mockResolvedValue(targetRole),
          updateUserAndMembership,
        } as unknown as UsersRepository,
        { createAuditLog: jest.fn() } as unknown as AuthRepository,
        bypass,
      );
      await expect(
        inSettingsScope(() =>
          useCase.execute(IDS.user, {
            fullName: 'Managed Elsewhere',
            ...(targetRole ? { roleId: IDS.role } : {}),
          }),
        ),
      ).rejects.toMatchObject({
        details: { reasonCode: 'teacher_display_projection_managed' },
      });
      expect(updateUserAndMembership).not.toHaveBeenCalled();
    },
  );

  it('leaves non-Teacher generic updates behaviorally unchanged', async () => {
    const updated = membership(UserType.STUDENT);
    updated.user.firstName = 'Updated';
    const updateUserAndMembership = jest.fn().mockResolvedValue(updated);
    const bypass = rejectingBypass();
    const useCase = new UpdateUserUseCase(
      {
        findScopedMembershipByUserId: jest
          .fn()
          .mockResolvedValue(membership(UserType.STUDENT)),
        findAssignableRoleById: jest.fn(),
        updateUserAndMembership,
      } as unknown as UsersRepository,
      { createAuditLog: jest.fn() } as unknown as AuthRepository,
      bypass,
    );

    const result = await inSettingsScope(() =>
      useCase.execute(IDS.user, { fullName: 'Updated Student' }),
    );
    expect(updateUserAndMembership).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: IDS.user,
        firstName: 'Updated',
        lastName: 'Student',
      }),
    );
    expect(bypass.reject).not.toHaveBeenCalled();
    expect(result.id).toBe(IDS.user);
  });
});
