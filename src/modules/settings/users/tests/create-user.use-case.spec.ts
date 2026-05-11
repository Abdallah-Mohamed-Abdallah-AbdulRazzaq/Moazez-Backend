import { AuditOutcome, UserStatus, UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { CreateUserUseCase } from '../application/create-user.use-case';
import { UserLoginIdentityResolver } from '../application/user-login-identity.resolver';
import { UsersRepository } from '../infrastructure/users.repository';

describe('CreateUserUseCase', () => {
  it('writes an audit record for persisted user creation', async () => {
    const createUserWithMembership = jest.fn().mockResolvedValue({
      id: 'membership-2',
      roleId: 'role-admin',
      role: { id: 'role-admin', name: 'School Admin' },
      user: {
        id: 'user-2',
        email: 'nour@example.com',
        firstName: 'Nour',
        lastName: 'Hassan',
        status: UserStatus.ACTIVE,
        lastLoginAt: null,
        createdAt: new Date('2026-04-12T10:00:00.000Z'),
        updatedAt: new Date('2026-04-12T10:00:00.000Z'),
      },
    });
    const usersRepository = {
      findUserByEmail: jest.fn().mockResolvedValue(null),
      findAssignableRoleById: jest.fn().mockResolvedValue({
        id: 'role-admin',
        key: 'school_admin',
        name: 'School Admin',
      }),
      createUserWithMembership,
    } as unknown as UsersRepository;
    const createAuditLog = jest.fn().mockResolvedValue(undefined);
    const authRepository = {
      createAuditLog,
    } as unknown as AuthRepository;
    const loginIdentityResolver = {
      resolve: jest.fn().mockResolvedValue({
        email: 'nour@example.com',
        username: null,
        contactEmail: null,
        generatedLoginEmail: false,
      }),
    } as unknown as UserLoginIdentityResolver;

    const useCase = new CreateUserUseCase(
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
        fullName: 'Nour Hassan',
        email: 'Nour@example.com',
        roleId: 'role-admin',
      });

      expect(createUserWithMembership).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'nour@example.com',
          username: null,
          contactEmail: null,
          schoolId: 'school-1',
          organizationId: 'org-1',
          roleId: 'role-admin',
          status: UserStatus.ACTIVE,
          userType: UserType.SCHOOL_USER,
        }),
      );

      const auditEntry = createAuditLog.mock.calls[0][0];
      expect(auditEntry).toEqual(
        expect.objectContaining({
          actorId: 'user-1',
          schoolId: 'school-1',
          module: 'iam',
          action: 'iam.user.create',
          resourceType: 'user',
          resourceId: 'user-2',
          outcome: AuditOutcome.SUCCESS,
        }),
      );
      expect(auditEntry.after).toEqual({
        status: UserStatus.ACTIVE,
        roleId: 'role-admin',
        roleName: 'School Admin',
        invited: false,
        generatedLoginEmail: false,
      });
      expect(result.status).toBe('active');
    });
  });

  it('stores generated login identity fields without provisioning a password', async () => {
    const createUserWithMembership = jest.fn().mockResolvedValue({
      id: 'membership-2',
      roleId: 'role-teacher',
      role: { id: 'role-teacher', name: 'Teacher' },
      user: {
        id: 'user-2',
        email: 'ahmed.ali@school.sa',
        username: 'ahmed.ali',
        contactEmail: 'ahmed.personal@example.com',
        firstName: 'Ahmed',
        lastName: 'Ali',
        status: UserStatus.ACTIVE,
        lastLoginAt: null,
        createdAt: new Date('2026-04-12T10:00:00.000Z'),
        updatedAt: new Date('2026-04-12T10:00:00.000Z'),
      },
    });
    const usersRepository = {
      findAssignableRoleById: jest.fn().mockResolvedValue({
        id: 'role-teacher',
        key: 'teacher',
        name: 'Teacher',
      }),
      createUserWithMembership,
    } as unknown as UsersRepository;
    const createAuditLog = jest.fn().mockResolvedValue(undefined);
    const authRepository = {
      createAuditLog,
    } as unknown as AuthRepository;
    const loginIdentityResolver = {
      resolve: jest.fn().mockResolvedValue({
        email: 'ahmed.ali@school.sa',
        username: 'ahmed.ali',
        contactEmail: 'ahmed.personal@example.com',
        generatedLoginEmail: true,
      }),
    } as unknown as UserLoginIdentityResolver;

    const useCase = new CreateUserUseCase(
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
        fullName: 'Ahmed Ali',
        username: 'Ahmed.Ali',
        contactEmail: 'Ahmed.Personal@example.com',
        roleId: 'role-teacher',
      });

      expect(createUserWithMembership).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'ahmed.ali@school.sa',
          username: 'ahmed.ali',
          contactEmail: 'ahmed.personal@example.com',
          passwordHash: null,
          userType: UserType.TEACHER,
        }),
      );
      expect(result.email).toBe('ahmed.ali@school.sa');
      expect(result.loginEmail).toBe('ahmed.ali@school.sa');
      expect(result.username).toBe('ahmed.ali');
      expect(result.contactEmail).toBe('ahmed.personal@example.com');
      expect(createAuditLog.mock.calls[0][0].after.generatedLoginEmail).toBe(
        true,
      );
    });
  });
});
