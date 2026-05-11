import { Injectable } from '@nestjs/common';
import { AuditOutcome, Role, UserStatus, UserType } from '@prisma/client';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { PasswordService } from '../../../iam/auth/domain/password.service';
import { generateTemporaryPassword } from '../../../settings/users/credentials/domain/credential-password.policy';
import { CredentialMembershipRecord } from '../../../settings/users/credentials/infrastructure/user-credentials.repository';
import { presentCredentialUser } from '../../../settings/users/credentials/presenters/credentials.presenter';
import { UserLoginIdentityResolver } from '../../../settings/users/application/user-login-identity.resolver';
import {
  UsersRepository,
  ScopedMembershipRecord,
} from '../../../settings/users/infrastructure/users.repository';
import { splitFullName } from '../../../settings/users/domain/split-full-name';
import {
  AccountLinkingDto,
  StudentAccountLinkResponseDto,
} from '../../account/dto/account-linking.dto';
import {
  AccountUserAlreadyLinkedException,
  AccountUserTypeMismatchException,
  StudentAccountAlreadyLinkedException,
  StudentRoleMissingException,
} from '../../account/domain/account-linking.exceptions';
import { requireStudentsScope } from '../domain/students-scope';
import {
  StudentsRepository,
  StudentRecord,
} from '../infrastructure/students.repository';

@Injectable()
export class CreateOrLinkStudentAccountUseCase {
  constructor(
    private readonly studentsRepository: StudentsRepository,
    private readonly usersRepository: UsersRepository,
    private readonly loginIdentityResolver: UserLoginIdentityResolver,
    private readonly authRepository: AuthRepository,
    private readonly passwordService: PasswordService,
  ) {}

  async execute(
    studentId: string,
    command: AccountLinkingDto,
  ): Promise<StudentAccountLinkResponseDto> {
    const scope = requireStudentsScope();
    const student = await this.studentsRepository.findStudentById(studentId);
    if (!student) {
      throw new NotFoundDomainException('Student not found', { studentId });
    }

    if (student.userId) {
      throw new StudentAccountAlreadyLinkedException(studentId);
    }

    if (command.mode === 'link') {
      return this.linkExistingUser(student, command);
    }

    const role = await this.resolveStudentRole(scope.schoolId, command.roleId);
    const fullName =
      command.fullName ?? `${student.firstName} ${student.lastName}`.trim();
    const names = splitFullName(fullName);

    if (!command.username) {
      throw new ValidationDomainException(
        'Username is required when creating a student account',
        { field: 'username' },
      );
    }

    const shouldGenerate = shouldGeneratePassword(command);
    const credential = shouldGenerate
      ? await this.buildGeneratedCredential()
      : null;
    const identity = await this.loginIdentityResolver.resolve({
      username: command.username,
      contactEmail: command.contactEmail,
    });

    const membership = await this.usersRepository.createUserWithMembership({
      email: identity.email,
      username: identity.username,
      contactEmail: identity.contactEmail,
      firstName: names.firstName,
      lastName: names.lastName,
      status: UserStatus.ACTIVE,
      userType: UserType.STUDENT,
      schoolId: scope.schoolId,
      organizationId: scope.organizationId,
      roleId: role.id,
      passwordHash: credential?.passwordHash ?? null,
      mustChangePassword: shouldGenerate,
      passwordProvisionedAt: credential?.generatedAt ?? null,
      passwordChangedAt: null,
      credentialVersion: shouldGenerate ? 1 : 0,
    });

    const linked = await this.studentsRepository.linkStudentAccount(
      student.id,
      membership.user.id,
    );
    if (!linked) {
      throw new StudentAccountAlreadyLinkedException(student.id);
    }

    await this.recordAccountAudit({
      action: 'students.account.create',
      resourceId: student.id,
      userId: membership.user.id,
      generatedCredential: shouldGenerate,
    });

    if (shouldGenerate) {
      await this.recordCredentialAudit(membership, 'iam.credentials.generate');
    }

    return {
      studentId: student.id,
      user: presentCredentialUser(
        membership as unknown as CredentialMembershipRecord,
      ),
      linked: true,
      ...(credential
        ? { temporaryPassword: credential.temporaryPassword }
        : {}),
    };
  }

  private async linkExistingUser(
    student: StudentRecord,
    command: AccountLinkingDto,
  ): Promise<StudentAccountLinkResponseDto> {
    if (!command.userId) {
      throw new ValidationDomainException('User id is required for link mode', {
        field: 'userId',
      });
    }

    const membership = await this.usersRepository.findScopedMembershipByUserId(
      command.userId,
    );
    if (!membership) {
      throw new NotFoundDomainException('User not found', {
        userId: command.userId,
      });
    }

    if (membership.user.userType !== UserType.STUDENT) {
      throw new AccountUserTypeMismatchException({
        expectedUserType: UserType.STUDENT,
        actualUserType: membership.user.userType,
      });
    }

    const existingLinkedStudent =
      await this.studentsRepository.findStudentByUserId(command.userId);
    if (existingLinkedStudent) {
      throw new AccountUserAlreadyLinkedException(command.userId);
    }

    const linked = await this.studentsRepository.linkStudentAccount(
      student.id,
      command.userId,
    );
    if (!linked) {
      throw new StudentAccountAlreadyLinkedException(student.id);
    }

    await this.recordAccountAudit({
      action: 'students.account.link',
      resourceId: student.id,
      userId: command.userId,
      generatedCredential: false,
    });

    return {
      studentId: student.id,
      user: presentCredentialUser(
        membership as unknown as CredentialMembershipRecord,
      ),
      linked: true,
    };
  }

  private async resolveStudentRole(
    schoolId: string,
    roleId?: string,
  ): Promise<Role> {
    const role = roleId
      ? await this.usersRepository.findAssignableRoleById(schoolId, roleId)
      : await this.usersRepository.findAssignableRoleByKey(schoolId, 'student');

    if (!role || role.key !== 'student') {
      throw new StudentRoleMissingException({ roleId });
    }

    return role;
  }

  private async buildGeneratedCredential(): Promise<{
    temporaryPassword: string;
    passwordHash: string;
    generatedAt: Date;
  }> {
    const temporaryPassword = generateTemporaryPassword();
    return {
      temporaryPassword,
      passwordHash: await this.passwordService.hash(temporaryPassword),
      generatedAt: new Date(),
    };
  }

  private async recordAccountAudit(params: {
    action: string;
    resourceId: string;
    userId: string;
    generatedCredential: boolean;
  }): Promise<void> {
    const scope = requireStudentsScope();
    await this.authRepository.createAuditLog({
      actorId: scope.actorId,
      userType: scope.userType,
      organizationId: scope.organizationId,
      schoolId: scope.schoolId,
      module: 'students',
      action: params.action,
      resourceType: 'student',
      resourceId: params.resourceId,
      outcome: AuditOutcome.SUCCESS,
      after: {
        userId: params.userId,
        generatedCredential: params.generatedCredential,
      },
    });
  }

  private async recordCredentialAudit(
    membership: ScopedMembershipRecord,
    action: string,
  ): Promise<void> {
    const scope = requireStudentsScope();
    await this.authRepository.createAuditLog({
      actorId: scope.actorId,
      userType: scope.userType,
      organizationId: scope.organizationId,
      schoolId: scope.schoolId,
      module: 'iam',
      action,
      resourceType: 'user',
      resourceId: membership.user.id,
      outcome: AuditOutcome.SUCCESS,
      after: {
        mustChangePassword: membership.user.mustChangePassword,
        credentialVersion: membership.user.credentialVersion,
      },
    });
  }
}

function shouldGeneratePassword(command: AccountLinkingDto): boolean {
  if (command.temporaryPasswordMode) {
    return command.temporaryPasswordMode === 'generate';
  }

  return command.generatePassword === true;
}
