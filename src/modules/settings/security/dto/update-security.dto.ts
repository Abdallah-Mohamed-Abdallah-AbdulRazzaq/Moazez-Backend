import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateSecurityDto {
  @IsOptional()
  @IsBoolean()
  enforceTwoFactor?: boolean;

  @IsOptional()
  @IsBoolean()
  ipAllowlistEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  ipAllowlist?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  sessionTimeoutMinutes?: number;

  @IsOptional()
  @IsBoolean()
  suspiciousLoginAlerts?: boolean;

  @IsOptional()
  @IsInt()
  @Min(6)
  passwordMinLength?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  passwordRotationDays?: number;
}
