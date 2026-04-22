import { Injectable } from '@nestjs/common';
import { AuditOutcome } from '@prisma/client';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireSettingsScope } from '../../settings-context';
import { SecurityResponseDto } from '../dto/security-response.dto';
import { UpdateSecurityDto } from '../dto/update-security.dto';
import { SecurityRepository } from '../infrastructure/security.repository';
import { presentSecurity } from '../presenters/security.presenter';

function countAllowlistEntries(ipAllowlist: string | null): number {
  return ipAllowlist
    ?.split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0).length ?? 0;
}

function summarizeSecuritySettings(settings: {
  enforceTwoFactor: boolean;
  ipAllowlistEnabled: boolean;
  ipAllowlist: string | null;
  sessionTimeoutMinutes: number;
  suspiciousLoginAlerts: boolean;
  passwordMinLength: number;
  passwordRotationDays: number;
}) {
  return {
    enforceTwoFactor: settings.enforceTwoFactor,
    ipAllowlistEnabled: settings.ipAllowlistEnabled,
    ipAllowlistRuleCount: countAllowlistEntries(settings.ipAllowlist),
    sessionTimeoutMinutes: settings.sessionTimeoutMinutes,
    suspiciousLoginAlerts: settings.suspiciousLoginAlerts,
    passwordMinLength: settings.passwordMinLength,
    passwordRotationDays: settings.passwordRotationDays,
  };
}

@Injectable()
export class UpdateSecurityUseCase {
  constructor(
    private readonly securityRepository: SecurityRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(command: UpdateSecurityDto): Promise<SecurityResponseDto> {
    const scope = requireSettingsScope();
    const existing = await this.securityRepository.findBySchoolId(scope.schoolId);
    const updated = await this.securityRepository.upsert(scope.schoolId, scope.actorId, {
      schoolId: scope.schoolId,
      enforceTwoFactor: command.enforceTwoFactor,
      ipAllowlistEnabled: command.ipAllowlistEnabled,
      ipAllowlist: command.ipAllowlist,
      sessionTimeoutMinutes: command.sessionTimeoutMinutes,
      suspiciousLoginAlerts: command.suspiciousLoginAlerts,
      passwordMinLength: command.passwordMinLength,
      passwordRotationDays: command.passwordRotationDays,
      updatedById: scope.actorId,
      id: undefined,
      createdAt: undefined,
      updatedAt: undefined,
    });

    await this.authRepository.createAuditLog({
      actorId: scope.actorId,
      userType: scope.userType,
      organizationId: scope.organizationId,
      schoolId: scope.schoolId,
      module: 'settings',
      action: 'settings.security.change',
      resourceType: 'security_setting',
      resourceId: updated.id,
      outcome: AuditOutcome.SUCCESS,
      before: existing ? summarizeSecuritySettings(existing) : undefined,
      after: summarizeSecuritySettings(updated),
    });

    return presentSecurity(updated);
  }
}
