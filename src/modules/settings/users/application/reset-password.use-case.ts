import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AuditOutcome, UserType } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { PasswordService } from '../../../iam/auth/domain/password.service';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireSettingsScope } from '../../settings-context';
import { ResetPasswordResponseDto } from '../dto/user-response.dto';
import { UsersRepository } from '../infrastructure/users.repository';
import { presentResetPasswordResponse } from '../presenters/users.presenter';
import { TeacherSettingsBypassService } from './teacher-settings-bypass.service';

@Injectable()
export class ResetPasswordUseCase {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly authRepository: AuthRepository,
    private readonly passwordService: PasswordService,
    private readonly teacherBypass: TeacherSettingsBypassService,
  ) {}

  async execute(userId: string): Promise<ResetPasswordResponseDto> {
    const scope = requireSettingsScope();
    const membership =
      await this.usersRepository.findScopedMembershipByUserId(userId);
    if (!membership) {
      throw new NotFoundDomainException('User not found', { userId });
    }
    if (
      membership.userType === UserType.TEACHER ||
      membership.user.userType === UserType.TEACHER ||
      membership.role.key === 'teacher'
    ) {
      return this.teacherBypass.reject({
        scope,
        reasonCode: 'legacy_reset_forbidden',
        resourceType: 'user',
        resourceId: membership.user.id,
      });
    }

    // Placeholder until a dedicated reset-token delivery flow exists.
    await this.passwordService.hash(
      `reset:${membership.user.id}:${randomUUID()}`,
    );

    await this.authRepository.createAuditLog({
      actorId: scope.actorId,
      userType: scope.userType,
      organizationId: scope.organizationId,
      schoolId: scope.schoolId,
      module: 'auth',
      action: 'password.reset',
      resourceType: 'user',
      resourceId: membership.user.id,
      outcome: AuditOutcome.SUCCESS,
    });

    return presentResetPasswordResponse(membership.user.id);
  }
}
