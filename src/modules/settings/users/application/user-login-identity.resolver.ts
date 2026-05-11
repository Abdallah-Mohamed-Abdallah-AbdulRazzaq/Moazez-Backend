import { Injectable } from '@nestjs/common';
import { SchoolLoginSettingsStatus } from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import {
  LoginDomainMissingException,
  UsernameInvalidException,
  UsernameTakenException,
} from '../../login-identity/domain/login-identity.exceptions';
import {
  buildLoginEmail,
  normalizeContactEmail,
  validateUsername,
} from '../../login-identity/domain/login-identity.policy';
import { LoginIdentityRepository } from '../../login-identity/infrastructure/login-identity.repository';
import { UserEmailTakenException } from '../domain/user.exceptions';
import { UsersRepository } from '../infrastructure/users.repository';

export interface UserLoginIdentityInput {
  email?: string;
  username?: string;
  contactEmail?: string;
}

export interface ResolvedUserLoginIdentity {
  email: string;
  username: string | null;
  contactEmail: string | null;
  generatedLoginEmail: boolean;
}

@Injectable()
export class UserLoginIdentityResolver {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly loginIdentityRepository: LoginIdentityRepository,
  ) {}

  async resolve(
    command: UserLoginIdentityInput,
  ): Promise<ResolvedUserLoginIdentity> {
    if (command.username) {
      return this.resolveGeneratedIdentity(command);
    }

    return this.resolveLegacyEmailIdentity(command);
  }

  private async resolveGeneratedIdentity(
    command: UserLoginIdentityInput,
  ): Promise<ResolvedUserLoginIdentity> {
    const settings = await this.loginIdentityRepository.findCurrentSettings();
    if (!settings || settings.status !== SchoolLoginSettingsStatus.ACTIVE) {
      throw new LoginDomainMissingException();
    }

    const usernameResult = validateUsername(command.username ?? '', settings);
    if (!usernameResult.valid) {
      throw new UsernameInvalidException(
        usernameResult.reason ?? 'username_required',
        usernameResult.username,
      );
    }

    const loginEmail = buildLoginEmail(
      usernameResult.username,
      settings.loginDomain,
    );
    const providedEmail = command.email
      ? normalizeContactEmail(command.email)
      : null;

    if (providedEmail && providedEmail !== loginEmail) {
      throw new ValidationDomainException(
        'Use contactEmail for personal email when username is provided',
        { field: 'email' },
      );
    }

    const existingUser = await this.usersRepository.findUserByEmail(loginEmail);
    if (existingUser) {
      throw new UsernameTakenException(usernameResult.username);
    }

    return {
      email: loginEmail,
      username: usernameResult.username,
      contactEmail: command.contactEmail
        ? normalizeContactEmail(command.contactEmail)
        : null,
      generatedLoginEmail: true,
    };
  }

  private async resolveLegacyEmailIdentity(
    command: UserLoginIdentityInput,
  ): Promise<ResolvedUserLoginIdentity> {
    if (!command.email) {
      throw new ValidationDomainException(
        'Email is required when username is not provided',
        { field: 'email' },
      );
    }

    const email = normalizeContactEmail(command.email);
    const existingUser = await this.usersRepository.findUserByEmail(email);
    if (existingUser) {
      throw new UserEmailTakenException(email);
    }

    return {
      email,
      username: null,
      contactEmail: command.contactEmail
        ? normalizeContactEmail(command.contactEmail)
        : null,
      generatedLoginEmail: false,
    };
  }
}
