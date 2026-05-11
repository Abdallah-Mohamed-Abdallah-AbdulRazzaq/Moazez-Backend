import { Injectable } from '@nestjs/common';
import { AuditOutcome, UserStatus } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireSettingsScope } from '../../settings-context';
import { splitFullName } from '../domain/split-full-name';
import { userTypeFromRoleKey } from '../domain/user-type-from-role';
import { CreateUserDto } from '../dto/create-user.dto';
import { UserResponseDto } from '../dto/user-response.dto';
import { UsersRepository } from '../infrastructure/users.repository';
import { presentUser } from '../presenters/users.presenter';
import { UserLoginIdentityResolver } from './user-login-identity.resolver';

@Injectable()
export class CreateUserUseCase {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly authRepository: AuthRepository,
    private readonly loginIdentityResolver: UserLoginIdentityResolver,
  ) {}

  async execute(command: CreateUserDto): Promise<UserResponseDto> {
    const scope = requireSettingsScope();
    const identity = await this.loginIdentityResolver.resolve(command);

    const role = await this.usersRepository.findAssignableRoleById(
      scope.schoolId,
      command.roleId,
    );
    if (!role) {
      throw new NotFoundDomainException('Role not found', {
        roleId: command.roleId,
      });
    }

    const names = splitFullName(command.fullName);
    const membership = await this.usersRepository.createUserWithMembership({
      email: identity.email,
      username: identity.username,
      contactEmail: identity.contactEmail,
      firstName: names.firstName,
      lastName: names.lastName,
      status: UserStatus.ACTIVE,
      userType: userTypeFromRoleKey(role.key),
      schoolId: scope.schoolId,
      organizationId: scope.organizationId,
      roleId: role.id,
      passwordHash: null,
    });

    await this.authRepository.createAuditLog({
      actorId: scope.actorId,
      userType: scope.userType,
      organizationId: scope.organizationId,
      schoolId: scope.schoolId,
      module: 'iam',
      action: 'iam.user.create',
      resourceType: 'user',
      resourceId: membership.user.id,
      outcome: AuditOutcome.SUCCESS,
      after: {
        status: membership.user.status,
        roleId: membership.roleId,
        roleName: membership.role.name,
        invited: false,
        generatedLoginEmail: identity.generatedLoginEmail,
      },
    });

    return presentUser(membership);
  }
}
