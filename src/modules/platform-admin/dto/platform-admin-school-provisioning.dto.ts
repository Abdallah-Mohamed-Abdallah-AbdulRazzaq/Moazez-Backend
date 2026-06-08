import { Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { OrganizationStatus, SchoolStatus, UserStatus } from '@prisma/client';

export const PLATFORM_SCHOOL_PROVISIONING_ORGANIZATION_MODES = [
  'existing',
  'create',
] as const;

export const PLATFORM_SCHOOL_PROVISIONING_CREDENTIAL_DELIVERY_MODES = [
  'activation_link',
  'temporary_password',
  'manual',
] as const;

export type PlatformSchoolProvisioningOrganizationMode =
  (typeof PLATFORM_SCHOOL_PROVISIONING_ORGANIZATION_MODES)[number];

export type PlatformSchoolProvisioningCredentialDeliveryMode =
  (typeof PLATFORM_SCHOOL_PROVISIONING_CREDENTIAL_DELIVERY_MODES)[number];

export type PlatformSchoolProvisioningCredentialStatus =
  | 'activation_link_deferred'
  | 'temporary_password_ready'
  | 'manual_pending';

export class PlatformSchoolProvisioningOrganizationDto {
  @IsIn(PLATFORM_SCHOOL_PROVISIONING_ORGANIZATION_MODES)
  mode!: PlatformSchoolProvisioningOrganizationMode;

  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  slug?: string;
}

export class PlatformSchoolProvisioningSchoolDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  slug!: string;
}

export class PlatformSchoolProvisioningLoginIdentityDto {
  @IsString()
  @MinLength(1)
  @MaxLength(253)
  loginDomain!: string;
}

export class PlatformSchoolProvisioningPrimaryAdminDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  username!: string;

  @IsEmail()
  @MaxLength(254)
  contactEmail!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;
}

export class PlatformSchoolProvisioningCredentialsDto {
  @IsOptional()
  @IsIn(PLATFORM_SCHOOL_PROVISIONING_CREDENTIAL_DELIVERY_MODES)
  deliveryMode?: PlatformSchoolProvisioningCredentialDeliveryMode =
    'activation_link';
}

export class ProvisionPlatformSchoolDto {
  @ValidateNested()
  @Type(() => PlatformSchoolProvisioningOrganizationDto)
  organization!: PlatformSchoolProvisioningOrganizationDto;

  @ValidateNested()
  @Type(() => PlatformSchoolProvisioningSchoolDto)
  school!: PlatformSchoolProvisioningSchoolDto;

  @ValidateNested()
  @Type(() => PlatformSchoolProvisioningLoginIdentityDto)
  loginIdentity!: PlatformSchoolProvisioningLoginIdentityDto;

  @ValidateNested()
  @Type(() => PlatformSchoolProvisioningPrimaryAdminDto)
  primaryAdmin!: PlatformSchoolProvisioningPrimaryAdminDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PlatformSchoolProvisioningCredentialsDto)
  credentials?: PlatformSchoolProvisioningCredentialsDto;
}

export class PlatformSchoolProvisioningOrganizationResponseDto {
  organizationId!: string;
  name!: string;
  slug!: string;
  status!: OrganizationStatus;
}

export class PlatformSchoolProvisioningSchoolResponseDto {
  schoolId!: string;
  organizationId!: string;
  name!: string;
  slug!: string;
  status!: SchoolStatus;
}

export class PlatformSchoolProvisioningLoginIdentityResponseDto {
  loginDomain!: string;
  primaryAdminLoginEmail!: string;
}

export class PlatformSchoolProvisioningPrimaryAdminResponseDto {
  userId!: string;
  username!: string;
  loginEmail!: string;
  contactEmail!: string | null;
  userType!: 'school_user';
  status!: Lowercase<UserStatus>;
  mustChangePassword!: boolean;
}

export class PlatformSchoolProvisioningCredentialsResponseDto {
  deliveryMode!: PlatformSchoolProvisioningCredentialDeliveryMode;
  status!: PlatformSchoolProvisioningCredentialStatus;
  temporaryPassword!: string | null;
}

export class PlatformSchoolProvisioningDeferredResponseDto {
  entitlements!: 'deferred';
  featureControl!: 'deferred';
  studentSeatLimit!: 'deferred';
  billing!: 'out_of_scope_v1';
}

export class PlatformSchoolProvisioningResponseDto {
  provisioningId!: string;
  organization!: PlatformSchoolProvisioningOrganizationResponseDto;
  school!: PlatformSchoolProvisioningSchoolResponseDto;
  loginIdentity!: PlatformSchoolProvisioningLoginIdentityResponseDto;
  primaryAdmin!: PlatformSchoolProvisioningPrimaryAdminResponseDto;
  credentials!: PlatformSchoolProvisioningCredentialsResponseDto;
  deferred!: PlatformSchoolProvisioningDeferredResponseDto;
}
