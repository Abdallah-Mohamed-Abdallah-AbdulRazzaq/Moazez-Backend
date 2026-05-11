import { AuditOutcome, UserStatus, UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { InviteUserUseCase } from '../application/invite-user.use-case';
import { UserLoginIdentityResolver } from '../application/user-login-identity.resolver';
import { UsersRepository } from '../infrastructure/users.repository';

describe('InviteUserUseCase', () => {
  it('stores generated login identity fields without sending credentials', async () => {
    const createUserWithMembership = jest.fn().mockResolvedValue({
      id: 'membership-2',
      roleId: 'role-student',
      role: { id: 'role-student', name: 'Student' },
      user: {
        id: 'user-2',
        email: 'student.01@school.sa',
        username: 'student.01',
        contactEmail: 'guardian@example.com',
        firstName: 'Student',
        lastName: 'One',
        status: UserStatus.INVITED,
        lastLoginAt: null,
        createdAt: new Date('2026-04-12T10:00:00.000Z'),
        updatedAt: new Date('2026-04-12T10:00:00.000Z'),
      },
    });
    const usersRepository = {
      findAssignableRoleById: jest.fn().mockResolvedValue({
        id: 'role-student',
        key: 'student',
        name: 'Student',
      }),
      createUserWithMembership,
    } as unknown as UsersRepository;
    const createAuditLog = jest.fn().mockResolvedValue(undefined);
    const authRepository = {
      createAuditLog,
    } as unknown as AuthRepository;
    const loginIdentityResolver = {
      resolve: jest.fn().mockResolvedValue({
        email: 'student.01@school.sa',
        username: 'student.01',
        contactEmail: 'guardian@example.com',
        generatedLoginEmail: true,
      }),
    } as unknown as UserLoginIdentityResolver;

    const useCase = new InviteUserUseCase(
      usersRepository,
      authRepository,
      loginIdentityResolver,
    );

    await runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
        roleId: 'role-1',
        permissions: ['settings.users.manage'],
      });

      const result = await useCase.execute({
        fullName: 'Student One',
        username: 'student.01',
        contactEmail: 'guardian@example.com',
        roleId: 'role-student',
      });

      expect(createUserWithMembership).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'student.01@school.sa',
          username: 'student.01',
          contactEmail: 'guardian@example.com',
          status: UserStatus.INVITED,
          userType: UserType.STUDENT,
          passwordHash: null,
        }),
      );
      expect(createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'iam.user.create',
          outcome: AuditOutcome.SUCCESS,
          after: expect.objectContaining({
            invited: true,
            generatedLoginEmail: true,
          }),
        }),
      );
      expect(result.email).toBe('student.01@school.sa');
      expect(result.username).toBe('student.01');
      expect(result.contactEmail).toBe('guardian@example.com');
    });
  });
});
