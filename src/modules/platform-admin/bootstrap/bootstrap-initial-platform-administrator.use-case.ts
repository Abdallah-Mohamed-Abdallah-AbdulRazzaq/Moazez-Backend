import { Injectable } from '@nestjs/common';
import { isEmail } from 'class-validator';
import { PasswordService } from '../../iam/auth/domain/password.service';
import { normalizeContactEmail } from '../../settings/login-identity/domain/login-identity.policy';
import { validateAdminProvidedPassword } from '../../settings/users/credentials/domain/credential-password.policy';
import { normalizePlatformName } from '../domain/platform-admin-inputs';
import {
  PLATFORM_ADMIN_ROLE_CODE,
  isPlatformAdminBootstrapEnvironment,
  type PlatformAdminBootstrapEnvironment,
} from './platform-admin-bootstrap.constants';
import { PlatformAdminBootstrapError } from './platform-admin-bootstrap.errors';
import { PlatformAdminBootstrapRepository } from './platform-admin-bootstrap.repository';

const MAX_EMAIL_LENGTH = 254;
const MAX_NAME_LENGTH = 100;
const MAX_PASSWORD_LENGTH = 256;

export interface BootstrapInitialPlatformAdministratorCommand {
  environment: PlatformAdminBootstrapEnvironment;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface BootstrapInitialPlatformAdministratorResult {
  status: 'PASS';
  platformAdminCreated: true;
  platformAdminUserId: string;
  roleCode: typeof PLATFORM_ADMIN_ROLE_CODE;
}

@Injectable()
export class BootstrapInitialPlatformAdministratorUseCase {
  constructor(
    private readonly repository: PlatformAdminBootstrapRepository,
    private readonly passwordService: PasswordService,
  ) {}

  async execute(
    command: BootstrapInitialPlatformAdministratorCommand,
  ): Promise<BootstrapInitialPlatformAdministratorResult> {
    const input = normalizeAndValidateInput(command);
    const passwordPolicy = validateAdminProvidedPassword(input.password);
    if (!passwordPolicy.valid) {
      throw new PlatformAdminBootstrapError('PASSWORD_POLICY_VIOLATION');
    }

    const passwordHash = await this.passwordService.hash(input.password);
    const created = await this.repository.createInitialPlatformAdministrator({
      environment: input.environment,
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      passwordHash,
    });

    return {
      status: 'PASS',
      platformAdminCreated: true,
      platformAdminUserId: created.userId,
      roleCode: created.roleCode,
    };
  }
}

function normalizeAndValidateInput(
  command: BootstrapInitialPlatformAdministratorCommand,
): BootstrapInitialPlatformAdministratorCommand {
  if (
    !command ||
    !isPlatformAdminBootstrapEnvironment(command.environment) ||
    typeof command.email !== 'string' ||
    typeof command.firstName !== 'string' ||
    typeof command.lastName !== 'string' ||
    typeof command.password !== 'string'
  ) {
    throw new PlatformAdminBootstrapError('INVALID_INPUT');
  }

  const email = normalizeContactEmail(command.email);
  if (email.length > MAX_EMAIL_LENGTH || !isEmail(email)) {
    throw new PlatformAdminBootstrapError('INVALID_INPUT');
  }

  let firstName: string;
  let lastName: string;
  try {
    firstName = normalizePlatformName(command.firstName, 'firstName');
    lastName = normalizePlatformName(command.lastName, 'lastName');
  } catch {
    throw new PlatformAdminBootstrapError('INVALID_INPUT');
  }

  if (
    firstName.length > MAX_NAME_LENGTH ||
    lastName.length > MAX_NAME_LENGTH ||
    command.password.length > MAX_PASSWORD_LENGTH
  ) {
    throw new PlatformAdminBootstrapError('INVALID_INPUT');
  }

  return {
    environment: command.environment,
    email,
    firstName,
    lastName,
    password: command.password,
  };
}
