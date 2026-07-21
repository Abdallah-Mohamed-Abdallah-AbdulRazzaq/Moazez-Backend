import { MembershipStatus, UserStatus, UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../../../common/context/request-context';
import type { PasswordService } from '../../../iam/auth/domain/password.service';
import type { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { TeacherRoleTransitionConflictException } from '../../../teachers/directory/domain/teacher-directory.errors';
import { ResendInviteUseCase } from '../application/resend-invite.use-case';
import { ResetPasswordUseCase } from '../application/reset-password.use-case';
import type { TeacherSettingsBypassService } from '../application/teacher-settings-bypass.service';
import type {
  ScopedMembershipRecord,
  UsersRepository,
} from '../infrastructure/users.repository';

const IDS = {
  actor: '57000000-0000-4000-8000-000000000001',
  organization: '57000000-0000-4000-8000-000000000002',
  school: '57000000-0000-4000-8000-000000000003',
  role: '57000000-0000-4000-8000-000000000004',
  membership: '57000000-0000-4000-8000-000000000005',
  user: '57000000-0000-4000-8000-000000000006',
};

function inSchoolScope<T>(callback: () => T): T {
  const context = createRequestContext('teacher-legacy-bypass-test');
  context.actor = { id: IDS.actor, userType: UserType.SCHOOL_USER };
  context.activeMembership = {
    membershipId: IDS.membership,
    organizationId: IDS.organization,
    schoolId: IDS.school,
    roleId: IDS.role,
    permissions: ['settings.users.manage'],
  };
  return runWithRequestContext(context, callback);
}

function teacherMembership(): ScopedMembershipRecord {
  const now = new Date('2026-07-20T00:00:00.000Z');
  return {
    id: IDS.membership,
    userId: IDS.user,
    organizationId: IDS.organization,
    schoolId: IDS.school,
    roleId: IDS.role,
    userType: UserType.TEACHER,
    status: MembershipStatus.ACTIVE,
    startedAt: now,
    endedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    role: {
      id: IDS.role,
      schoolId: null,
      key: 'teacher',
      name: 'Teacher',
      description: null,
      isSystem: true,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    },
    user: {
      id: IDS.user,
      email: 'synthetic@example.test',
      username: null,
      contactEmail: null,
      phone: null,
      passwordHash: null,
      firstName: 'Synthetic',
      lastName: 'Teacher',
      userType: UserType.TEACHER,
      status: UserStatus.INVITED,
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

describe('Teacher legacy Settings bypass closeout', () => {
  it('rejects resend-invite before touching User, Membership, or success audit', async () => {
    const updateUserAndMembership = jest.fn();
    const createAuditLog = jest.fn();
    const bypass = rejectingBypass();
    const useCase = new ResendInviteUseCase(
      {
        findScopedMembershipByUserId: jest
          .fn()
          .mockResolvedValue(teacherMembership()),
        updateUserAndMembership,
      } as unknown as UsersRepository,
      { createAuditLog } as unknown as AuthRepository,
      bypass,
    );

    await expect(
      inSchoolScope(() => useCase.execute(IDS.user)),
    ).rejects.toMatchObject({
      code: 'teachers.account.role_transition_conflict',
      details: { reasonCode: 'teacher_invite_managed_by_directory' },
    });
    expect(bypass.reject).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceId: IDS.user,
        reasonCode: 'teacher_invite_managed_by_directory',
      }),
    );
    expect(updateUserAndMembership).not.toHaveBeenCalled();
    expect(createAuditLog).not.toHaveBeenCalled();
  });

  it('rejects the legacy reset placeholder before hashing or success audit', async () => {
    const hash = jest.fn();
    const createAuditLog = jest.fn();
    const bypass = rejectingBypass();
    const useCase = new ResetPasswordUseCase(
      {
        findScopedMembershipByUserId: jest
          .fn()
          .mockResolvedValue(teacherMembership()),
      } as unknown as UsersRepository,
      { createAuditLog } as unknown as AuthRepository,
      { hash } as unknown as PasswordService,
      bypass,
    );

    await expect(
      inSchoolScope(() => useCase.execute(IDS.user)),
    ).rejects.toMatchObject({
      code: 'teachers.account.role_transition_conflict',
      details: { reasonCode: 'legacy_reset_forbidden' },
    });
    expect(bypass.reject).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceId: IDS.user,
        reasonCode: 'legacy_reset_forbidden',
      }),
    );
    expect(hash).not.toHaveBeenCalled();
    expect(createAuditLog).not.toHaveBeenCalled();
  });
});
