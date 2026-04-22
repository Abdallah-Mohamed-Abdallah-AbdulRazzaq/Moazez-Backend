import { Injectable } from '@nestjs/common';
import { AuditOutcome } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireSettingsScope } from '../../settings-context';
import { splitFullName } from '../domain/split-full-name';
import { userTypeFromRoleKey } from '../domain/user-type-from-role';
import { UpdateUserDto } from '../dto/update-user.dto';
import { UserResponseDto } from '../dto/user-response.dto';
import { UsersRepository } from '../infrastructure/users.repository';
import { presentUser } from '../presenters/users.presenter';

@Injectable()
export class UpdateUserUseCase {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(userId: string, command: UpdateUserDto): Promise<UserResponseDto> {
    const scope = requireSettingsScope();
    const membership = await this.usersRepository.findScopedMembershipByUserId(userId);
    if (!membership) {
      throw new NotFoundDomainException('User not found', { userId });
    }

    let nextRoleId: string | undefined;
    let nextUserType;

    if (command.roleId) {
      const role = await this.usersRepository.findAssignableRoleById(
        scope.schoolId,
        command.roleId,
      );
      if (!role) {
        throw new NotFoundDomainException('Role not found', { roleId: command.roleId });
      }
      nextRoleId = role.id;
      nextUserType = userTypeFromRoleKey(role.key);
    }

    const names = command.fullName ? splitFullName(command.fullName) : null;

    const updated = await this.usersRepository.updateUserAndMembership({
      userId: membership.user.id,
      membershipId: membership.id,
      firstName: names?.firstName,
      lastName: names?.lastName,
      roleId: nextRoleId,
      userType: nextUserType,
    });

    await this.authRepository.createAuditLog({
      actorId: scope.actorId,
      userType: scope.userType,
      organizationId: scope.organizationId,
      schoolId: scope.schoolId,
      module: 'iam',
      action: 'user.update',
      resourceType: 'user',
      resourceId: updated.user.id,
      outcome: AuditOutcome.SUCCESS,
      after: {
        fullName: `${updated.user.firstName} ${updated.user.lastName}`.trim(),
        roleId: updated.roleId,
      },
    });

    return presentUser(updated);
  }
}
