export class SecurityResponseDto {
  enforceTwoFactor!: boolean;
  ipAllowlistEnabled!: boolean;
  ipAllowlist!: string;
  sessionTimeoutMinutes!: number;
  suspiciousLoginAlerts!: boolean;
  passwordMinLength!: number;
  passwordRotationDays!: number;
}
