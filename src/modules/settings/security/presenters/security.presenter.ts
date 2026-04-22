import { SecuritySetting } from '@prisma/client';
import { SecurityResponseDto } from '../dto/security-response.dto';

export function presentSecurity(
  securitySetting: SecuritySetting | null,
): SecurityResponseDto {
  return {
    enforceTwoFactor: securitySetting?.enforceTwoFactor ?? false,
    ipAllowlistEnabled: securitySetting?.ipAllowlistEnabled ?? false,
    ipAllowlist: securitySetting?.ipAllowlist ?? '',
    sessionTimeoutMinutes: securitySetting?.sessionTimeoutMinutes ?? 30,
    suspiciousLoginAlerts: securitySetting?.suspiciousLoginAlerts ?? true,
    passwordMinLength: securitySetting?.passwordMinLength ?? 10,
    passwordRotationDays: securitySetting?.passwordRotationDays ?? 90,
  };
}
