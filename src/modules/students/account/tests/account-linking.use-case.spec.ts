import {
  AuditOutcome,
  MembershipStatus,
  StudentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { PasswordService } from '../../../iam/auth/domain/password.service';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { UserLoginIdentityResolver } from '../../../settings/users/application/user-login-identity.resolver';
import {
  ScopedMembershipRecord,
  UsersRepository,
} from '../../../settings/users/infrastructure/users.repository';
import { CreateOrLinkGuardianAccountUseCase } from '../../guardians/application/create-or-link-guardian-account.use-case';
import { GuardiansRepository } from '../../guardians/infrastructure/guardians.repository';
import { CreateOrLinkStudentAccountUseCase } from '../../students/application/create-or-link-student-account.use-case';
import { StudentsRepository } from '../../students/infrastructure/students.repository';
import {
  AccountUserTypeMismatchException,
  GuardianAccountAlreadyLinkedException,
  StudentAccountAlreadyLinkedException,
} from '../domain/account-linking.exceptions';

describe('student and guardian account linking use cases', () => {
  async function withStudentsScope<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'actor-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-actor',
        organizationId: 'org-1',
        schoolId: 'school-1',
        roleId: 'role-admin',
        permissions: ['students.records.manage', 'students.guardians.manage'],
      });

      return fn();
    });
  }

  const now = new Date('2026-05-11T10:00:00.000Z');

  function student(overrides?: { userId?: string | null }) {
    return {
      id: 'student-1',
      schoolId: 'school-1',
      organizationId: 'org-1',
      applicationId: null,
      userId: overrides?.userId ?? null,
      firstName: 'Student',
      lastName: 'One',
      birthDate: null,
      status: StudentStatus.ACTIVE,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
  }

  function guardian(overrides?: {
    userId?: string | null;
    email?: string | null;
  }) {
    return {
      id: 'guardian-1',
      schoolId: 'school-1',
      organizationId: 'org-1',
      userId: overrides?.userId ?? null,
      firstName: 'Parent',
      lastName: 'One',
      phone: '+201001112233',
      email: overrides?.email ?? 'parent.personal@example.com',
      relation: 'father',
      isPrimary: false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
  }

  function membership(overrides?: {
    userId?: string;
    userType?: UserType;
    roleKey?: string;
    passwordHash?: string | null;
    mustChangePassword?: boolean;
    credentialVersion?: number;
  }): ScopedMembershipRecord {
    const userType = overrides?.userType ?? UserType.STUDENT;

    return {
      id: 'membership-1',
      userId: overrides?.userId ?? 'user-1',
      organizationId: 'org-1',
      schoolId: 'school-1',
      roleId: 'role-1',
      userType,
      status: MembershipStatus.ACTIVE,
      startedAt: now,
      endedAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      role: {
        id: 'role-1',
        key: overrides?.roleKey ?? 'student',
        name: overrides?.roleKey === 'parent' ? 'Parent' : 'Student',
        description: null,
        schoolId: null,
        isSystem: true,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      user: {
        id: overrides?.userId ?? 'user-1',
        email: `${overrides?.userId ?? 'user-1'}@school.test`,
        username: overrides?.userId ?? 'user-1',
        contactEmail: 'contact@example.com',
        phone: null,
        passwordHash: overrides?.passwordHash ?? null,
        firstName: 'Linked',
        lastName: 'User',
        userType,
        status: UserStatus.ACTIVE,
        lastLoginAt: null,
        mustChangePassword: overrides?.mustChangePassword ?? false,
        passwordChangedAt: null,
        passwordProvisionedAt: null,
        credentialVersion: overrides?.credentialVersion ?? 0,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
    } as ScopedMembershipRecord;
  }

  function sharedDependencies(createdMembership: ScopedMembershipRecord) {
    const usersRepository = {
      findAssignableRoleByKey: jest.fn().mockResolvedValue({
        id: 'role-1',
        key: createdMembership.role.key,
        name: createdMembership.role.name,
      }),
      findAssignableRoleById: jest.fn().mockResolvedValue({
        id: 'role-1',
        key: createdMembership.role.key,
        name: createdMembership.role.name,
      }),
      createUserWithMembership: jest.fn().mockResolvedValue(createdMembership),
      findScopedMembershipByUserId: jest
        .fn()
        .mockResolvedValue(createdMembership),
    } as unknown as UsersRepository;

    const loginIdentityResolver = {
      resolve: jest.fn().mockResolvedValue({
        email: createdMembership.user.email,
        username: createdMembership.user.username,
        contactEmail: createdMembership.user.contactEmail,
        generatedLoginEmail: true,
      }),
    } as unknown as UserLoginIdentityResolver;

    const authRepository = {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthRepository;

    const passwordService = {
      hash: jest.fn((plain: string) => Promise.resolve(`hashed:${plain}`)),
    } as unknown as PasswordService;

    return {
      usersRepository,
      loginIdentityResolver,
      authRepository,
      passwordService,
    };
  }

  it('creates and links a student user with an optional generated password', async () => {
    const createdMembership = membership({
      userType: UserType.STUDENT,
      roleKey: 'student',
      passwordHash: 'hash',
      mustChangePassword: true,
      credentialVersion: 1,
    });
    const shared = sharedDependencies(createdMembership);
    const studentsRepository = {
      findStudentById: jest.fn().mockResolvedValue(student()),
      linkStudentAccount: jest.fn().mockResolvedValue(true),
    } as unknown as StudentsRepository;
    const useCase = new CreateOrLinkStudentAccountUseCase(
      studentsRepository,
      shared.usersRepository,
      shared.loginIdentityResolver,
      shared.authRepository,
      shared.passwordService,
    );

    const result = await withStudentsScope(() =>
      useCase.execute('student-1', {
        mode: 'create',
        username: 'student.one',
        contactEmail: 'guardian@example.com',
        generatePassword: true,
      }),
    );

    expect(result.linked).toBe(true);
    expect(result.studentId).toBe('student-1');
    expect(result.temporaryPassword).toMatch(/^MZ-/);
    expect(
      shared.usersRepository.createUserWithMembership,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        userType: UserType.STUDENT,
        schoolId: 'school-1',
        organizationId: 'org-1',
        roleId: 'role-1',
        passwordHash: `hashed:${result.temporaryPassword}`,
        mustChangePassword: true,
        credentialVersion: 1,
      }),
    );
    expect(studentsRepository.linkStudentAccount).toHaveBeenCalledWith(
      'student-1',
      createdMembership.user.id,
    );
    expect(shared.authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'students.account.create',
        outcome: AuditOutcome.SUCCESS,
      }),
    );
    expect(
      JSON.stringify(
        (shared.authRepository.createAuditLog as jest.Mock).mock.calls,
      ),
    ).not.toContain(result.temporaryPassword);
  });

  it('links an existing student user and rejects wrong user types', async () => {
    const createdMembership = membership({ userType: UserType.STUDENT });
    const shared = sharedDependencies(createdMembership);
    const studentsRepository = {
      findStudentById: jest.fn().mockResolvedValue(student()),
      findStudentByUserId: jest.fn().mockResolvedValue(null),
      linkStudentAccount: jest.fn().mockResolvedValue(true),
    } as unknown as StudentsRepository;
    const useCase = new CreateOrLinkStudentAccountUseCase(
      studentsRepository,
      shared.usersRepository,
      shared.loginIdentityResolver,
      shared.authRepository,
      shared.passwordService,
    );

    const result = await withStudentsScope(() =>
      useCase.execute('student-1', {
        mode: 'link',
        userId: createdMembership.user.id,
      }),
    );

    expect(result.linked).toBe(true);
    expect(studentsRepository.linkStudentAccount).toHaveBeenCalledWith(
      'student-1',
      createdMembership.user.id,
    );

    (
      shared.usersRepository.findScopedMembershipByUserId as jest.Mock
    ).mockResolvedValueOnce(membership({ userType: UserType.PARENT }));

    await expect(
      withStudentsScope(() =>
        useCase.execute('student-1', {
          mode: 'link',
          userId: 'parent-user',
        }),
      ),
    ).rejects.toBeInstanceOf(AccountUserTypeMismatchException);
  });

  it('rejects creating a student account for an already linked student', async () => {
    const createdMembership = membership({ userType: UserType.STUDENT });
    const shared = sharedDependencies(createdMembership);
    const studentsRepository = {
      findStudentById: jest
        .fn()
        .mockResolvedValue(student({ userId: 'existing-user' })),
    } as unknown as StudentsRepository;
    const useCase = new CreateOrLinkStudentAccountUseCase(
      studentsRepository,
      shared.usersRepository,
      shared.loginIdentityResolver,
      shared.authRepository,
      shared.passwordService,
    );

    await expect(
      withStudentsScope(() =>
        useCase.execute('student-1', {
          mode: 'create',
          username: 'student.one',
        }),
      ),
    ).rejects.toBeInstanceOf(StudentAccountAlreadyLinkedException);
  });

  it('creates and links a guardian parent user using guardian email as contact default', async () => {
    const createdMembership = membership({
      userType: UserType.PARENT,
      roleKey: 'parent',
      passwordHash: 'hash',
      mustChangePassword: true,
      credentialVersion: 1,
    });
    const shared = sharedDependencies(createdMembership);
    const guardiansRepository = {
      findGuardianById: jest.fn().mockResolvedValue(guardian()),
      linkGuardianAccount: jest.fn().mockResolvedValue(true),
    } as unknown as GuardiansRepository;
    const useCase = new CreateOrLinkGuardianAccountUseCase(
      guardiansRepository,
      shared.usersRepository,
      shared.loginIdentityResolver,
      shared.authRepository,
      shared.passwordService,
    );

    const result = await withStudentsScope(() =>
      useCase.execute('guardian-1', {
        mode: 'create',
        username: 'parent.one',
        temporaryPasswordMode: 'generate',
      }),
    );

    expect(result.linked).toBe(true);
    expect(result.guardianId).toBe('guardian-1');
    expect(result.temporaryPassword).toMatch(/^MZ-/);
    expect(shared.loginIdentityResolver.resolve).toHaveBeenCalledWith({
      username: 'parent.one',
      contactEmail: 'parent.personal@example.com',
    });
    expect(
      shared.usersRepository.createUserWithMembership,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        userType: UserType.PARENT,
        roleId: 'role-1',
        mustChangePassword: true,
        credentialVersion: 1,
      }),
    );
    expect(guardiansRepository.linkGuardianAccount).toHaveBeenCalledWith(
      'guardian-1',
      createdMembership.user.id,
    );
  });

  it('links an existing parent user and rejects already linked guardians', async () => {
    const createdMembership = membership({
      userType: UserType.PARENT,
      roleKey: 'parent',
    });
    const shared = sharedDependencies(createdMembership);
    const guardiansRepository = {
      findGuardianById: jest.fn().mockResolvedValue(guardian()),
      findGuardianByUserId: jest.fn().mockResolvedValue(null),
      linkGuardianAccount: jest.fn().mockResolvedValue(true),
    } as unknown as GuardiansRepository;
    const useCase = new CreateOrLinkGuardianAccountUseCase(
      guardiansRepository,
      shared.usersRepository,
      shared.loginIdentityResolver,
      shared.authRepository,
      shared.passwordService,
    );

    const result = await withStudentsScope(() =>
      useCase.execute('guardian-1', {
        mode: 'link',
        userId: createdMembership.user.id,
      }),
    );

    expect(result.linked).toBe(true);
    expect(guardiansRepository.linkGuardianAccount).toHaveBeenCalledWith(
      'guardian-1',
      createdMembership.user.id,
    );

    (guardiansRepository.findGuardianById as jest.Mock).mockResolvedValueOnce(
      guardian({ userId: 'existing-user' }),
    );

    await expect(
      withStudentsScope(() =>
        useCase.execute('guardian-1', {
          mode: 'link',
          userId: createdMembership.user.id,
        }),
      ),
    ).rejects.toBeInstanceOf(GuardianAccountAlreadyLinkedException);
  });

  it('rejects linking a guardian account to a non-parent user', async () => {
    const createdMembership = membership({
      userType: UserType.STUDENT,
      roleKey: 'student',
    });
    const shared = sharedDependencies(createdMembership);
    const guardiansRepository = {
      findGuardianById: jest.fn().mockResolvedValue(guardian()),
      findGuardianByUserId: jest.fn().mockResolvedValue(null),
    } as unknown as GuardiansRepository;
    const useCase = new CreateOrLinkGuardianAccountUseCase(
      guardiansRepository,
      shared.usersRepository,
      shared.loginIdentityResolver,
      shared.authRepository,
      shared.passwordService,
    );

    await expect(
      withStudentsScope(() =>
        useCase.execute('guardian-1', {
          mode: 'link',
          userId: createdMembership.user.id,
        }),
      ),
    ).rejects.toBeInstanceOf(AccountUserTypeMismatchException);
  });
});
