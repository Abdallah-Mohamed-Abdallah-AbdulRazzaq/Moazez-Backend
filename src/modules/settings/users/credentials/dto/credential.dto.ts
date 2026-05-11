import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const CREDENTIAL_STATUS_VALUES = [
  'missing',
  'set',
  'temporary_or_must_change',
  'must_change',
] as const;

export const CREDENTIAL_BULK_SCOPE_VALUES = [
  'selected',
  'role',
  'user_type',
  'missing_password',
  'all_school_users',
] as const;

export const USER_TYPE_API_VALUES = [
  'platform_user',
  'organization_user',
  'school_user',
  'teacher',
  'parent',
  'student',
  'applicant',
  'pickup_delegate',
  'service_account',
] as const;

export type CredentialStatusValue = (typeof CREDENTIAL_STATUS_VALUES)[number];
export type CredentialBulkScopeValue =
  (typeof CREDENTIAL_BULK_SCOPE_VALUES)[number];
export type UserTypeApiValue = (typeof USER_TYPE_API_VALUES)[number];

export class CredentialStatusQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  roleKey?: string;

  @IsOptional()
  @IsIn(USER_TYPE_API_VALUES)
  userType?: UserTypeApiValue;

  @IsOptional()
  @IsIn(CREDENTIAL_STATUS_VALUES)
  credentialStatus?: CredentialStatusValue;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class SetCredentialPasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  password!: string;

  @IsOptional()
  @IsBoolean()
  forceResetOnLogin?: boolean;
}

export class BulkCredentialSelectionDto {
  @IsIn(CREDENTIAL_BULK_SCOPE_VALUES)
  scope!: CredentialBulkScopeValue;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(250)
  @IsUUID('4', { each: true })
  userIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  roleKeys?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsIn(USER_TYPE_API_VALUES, { each: true })
  userTypes?: UserTypeApiValue[];

  @IsOptional()
  @IsBoolean()
  includeUsersWithPassword?: boolean;

  @IsOptional()
  @IsBoolean()
  includeDisabledUsers?: boolean;
}

export class CredentialUserSummaryDto {
  userId!: string;
  fullName!: string;
  username!: string | null;
  loginEmail!: string;
  contactEmail!: string | null;
  userType!: UserTypeApiValue;
  roleId!: string;
  roleKey!: string;
  roleName!: string;
  status!: CredentialStatusValue;
  hasPassword!: boolean;
  mustChangePassword!: boolean;
  passwordChangedAt!: string | null;
  passwordProvisionedAt!: string | null;
  credentialVersion!: number;
  lastLoginAt!: string | null;
  createdAt!: string;
}

export class CredentialStatusListResponseDto {
  items!: CredentialUserSummaryDto[];
  pagination!: {
    page: number;
    limit: number;
    total: number;
  };
}

export class GeneratedCredentialResponseDto {
  user!: CredentialUserSummaryDto;
  temporaryPassword!: string;
  mustChangePassword!: true;
  generatedAt!: string;
  credentialVersion!: number;
}

export class SetCredentialResponseDto {
  user!: CredentialUserSummaryDto;
  mustChangePassword!: boolean;
  updatedAt!: string;
  credentialVersion!: number;
}

export class BulkCredentialPreviewResponseDto {
  totalMatched!: number;
  eligible!: number;
  skipped!: number;
  skippedReasons!: Record<string, number>;
  sample!: {
    eligible: CredentialUserSummaryDto[];
    skipped: Array<{
      user: CredentialUserSummaryDto;
      reason: string;
    }>;
  };
}

export class BulkGeneratedCredentialItemDto {
  user!: CredentialUserSummaryDto;
  temporaryPassword!: string;
}

export class BulkGenerateCredentialsResponseDto {
  generatedAt!: string;
  totalMatched!: number;
  generated!: number;
  skipped!: number;
  skippedReasons!: Record<string, number>;
  items!: BulkGeneratedCredentialItemDto[];
}
