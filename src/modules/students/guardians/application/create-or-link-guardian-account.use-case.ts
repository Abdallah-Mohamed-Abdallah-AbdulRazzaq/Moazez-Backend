import { Injectable } from '@nestjs/common';
import { AuditOutcome, Role, UserStatus, UserType } from '@prisma/client';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { PasswordService } from '../../../iam/auth/domain/password.service';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { generateTemporaryPassword } from '../../../settings/users/credentials/domain/credential-password.policy';
import { CredentialMembershipRecord } from '../../../settings/users/credentials/infrastructure/user-credentials.repository';
import { presentCredentialUser } from '../../../settings/users/credentials/presenters/credentials.presenter';
import { UserLoginIdentityResolver } from '../../../settings/users/application/user-login-identity.resolver';
import { splitFullName } from '../../../settings/users/domain/split-full-name';
import {
  ScopedMembershipRecord,
  UsersRepository,
} from '../../../settings/users/infrastructure/users.repository';
import {
  AccountLinkingDto,
  GuardianAccountLinkResponseDto,
} from '../../account/dto/account-linking.dto';
import {
  AccountUserAlreadyLinkedException,
  AccountUserTypeMismatchException,
  GuardianAccountAlreadyLinkedException,
  ParentRoleMissingException,
} from '../../account/domain/account-linking.exceptions';
import { requireStudentsScope } from '../../students/domain/students-scope';
import {
  GuardianRecord,
  GuardiansRepository,
} from '../infrastructure/guardians.repository';

@Injectable()
export class CreateOrLinkGuardianAccountUseCase {
  constructor(
    private readonly guardiansRepository: GuardiansRepository,
    private readonly usersRepository: UsersRepository,
    private readonly loginIdentityResolver: UserLoginIdentityResolver,
    private readonly authRepository: AuthRepository,
    private readonly passwordService: PasswordService,
  ) {}

  async execute(
    guardianId: string,
    command: AccountLinkingDto,
  ): Promise<GuardianAccountLinkResponseDto> {
    const scope = requireStudentsScope();
    const guardian =
      await this.guardiansRepository.findGuardianById(guardianId);
    if (!guardian) {
      throw new NotFoundDomainException('Guardian not found', { guardianId });
    }

    if (guardian.userId) {
      throw new GuardianAccountAlreadyLinkedException(guardianId);
    }

    if (command.mode === 'link') {
      return this.linkExistingUser(guardian, command);
    }

    const role = await this.resolveParentRole(scope.schoolId, command.roleId);
    const fullName =
      command.fullName ?? `${guardian.firstName} ${guardian.lastName}`.trim();
    const names = splitFullName(fullName);

    if (!command.username) {
      throw new ValidationDomainException(
        'Username is required when creating a parent account',
        { field: 'username' },
      );
    }

    const shouldGenerate = shouldGeneratePassword(command);
    const credential = shouldGenerate
      ? await this.buildGeneratedCredential()
      : null;
    const identity = await this.loginIdentityResolver.resolve({
      username: command.username,
      contactEmail: command.contactEmail ?? guardian.email ?? undefined,
    });

    const membership = await this.usersRepository.createUserWithMembership({
      email: identity.email,
      username: identity.username,
      contactEmail: identity.contactEmail,
      firstName: names.firstName,
      lastName: names.lastName,
      status: UserStatus.ACTIVE,
      userType: UserType.PARENT,
      schoolId: scope.schoolId,
      organizationId: scope.organizationId,
      roleId: role.id,
      passwordHash: credential?.passwordHash ?? null,
      mustChangePassword: shouldGenerate,
      passwordProvisionedAt: credential?.generatedAt ?? null,
      passwordChangedAt: null,
      credentialVersion: shouldGenerate ? 1 : 0,
    });

    const linked = await this.guardiansRepository.linkGuardianAccount(
      guardian.id,
      membership.user.id,
    );
    if (!linked) {
      throw new GuardianAccountAlreadyLinkedException(guardian.id);
    }

    await this.recordAccountAudit({
      action: 'students.guardian.account_create',
      resourceId: guardian.id,
      userId: membership.user.id,
      generatedCredential: shouldGenerate,
    });

    if (shouldGenerate) {
      await this.recordCredentialAudit(membership, 'iam.credentials.generate');
    }

    return {
      guardianId: guardian.id,
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
    guardian: GuardianRecord,
    command: AccountLinkingDto,
  ): Promise<GuardianAccountLinkResponseDto> {
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

    if (membership.user.userType !== UserType.PARENT) {
      throw new AccountUserTypeMismatchException({
        expectedUserType: UserType.PARENT,
        actualUserType: membership.user.userType,
      });
    }

    const existingLinkedGuardian =
      await this.guardiansRepository.findGuardianByUserId(command.userId);
    if (existingLinkedGuardian) {
      throw new AccountUserAlreadyLinkedException(command.userId);
    }

    const linked = await this.guardiansRepository.linkGuardianAccount(
      guardian.id,
      command.userId,
    );
    if (!linked) {
      throw new GuardianAccountAlreadyLinkedException(guardian.id);
    }

    await this.recordAccountAudit({
      action: 'students.guardian.account_link',
      resourceId: guardian.id,
      userId: command.userId,
      generatedCredential: false,
    });

    return {
      guardianId: guardian.id,
      user: presentCredentialUser(
        membership as unknown as CredentialMembershipRecord,
      ),
      linked: true,
    };
  }

  private async resolveParentRole(
    schoolId: string,
    roleId?: string,
  ): Promise<Role> {
    const role = roleId
      ? await this.usersRepository.findAssignableRoleById(schoolId, roleId)
      : await this.usersRepository.findAssignableRoleByKey(schoolId, 'parent');

    if (!role || role.key !== 'parent') {
      throw new ParentRoleMissingException({ roleId });
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
      resourceType: 'guardian',
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
