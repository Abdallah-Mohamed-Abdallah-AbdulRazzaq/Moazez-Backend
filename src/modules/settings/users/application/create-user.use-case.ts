import { Injectable } from '@nestjs/common';
import { AuditOutcome, UserStatus } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireSettingsScope } from '../../settings-context';
import { splitFullName } from '../domain/split-full-name';
import { UserEmailTakenException } from '../domain/user.exceptions';
import { userTypeFromRoleKey } from '../domain/user-type-from-role';
import { CreateUserDto } from '../dto/create-user.dto';
import { UserResponseDto } from '../dto/user-response.dto';
import { UsersRepository } from '../infrastructure/users.repository';
import { presentUser } from '../presenters/users.presenter';

@Injectable()
export class CreateUserUseCase {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(command: CreateUserDto): Promise<UserResponseDto> {
    const scope = requireSettingsScope();
    const email = command.email.trim().toLowerCase();
    const existingUser = await this.usersRepository.findUserByEmail(email);
    if (existingUser) {
      throw new UserEmailTakenException(email);
    }

    const role = await this.usersRepository.findAssignableRoleById(
      scope.schoolId,
      command.roleId,
    );
    if (!role) {
      throw new NotFoundDomainException('Role not found', { roleId: command.roleId });
    }

    const names = splitFullName(command.fullName);
    const membership = await this.usersRepository.createUserWithMembership({
      email,
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
      },
    });

    return presentUser(membership);
  }
}
