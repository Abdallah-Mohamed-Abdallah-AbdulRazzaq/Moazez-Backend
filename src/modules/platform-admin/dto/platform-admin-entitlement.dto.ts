import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export const SCHOOL_ENTITLEMENT_STATUS_API_VALUES = [
  'active',
  'trial',
  'suspended',
  'expired',
  'archived',
] as const;

export type SchoolEntitlementStatusApiValue =
  (typeof SCHOOL_ENTITLEMENT_STATUS_API_VALUES)[number];

export class UpsertPlatformSchoolEntitlementDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsIn(SCHOOL_ENTITLEMENT_STATUS_API_VALUES)
  status?: SchoolEntitlementStatusApiValue;

  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsDateString()
  startsAt?: string | null;

  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsDateString()
  endsAt?: string | null;

  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsInt()
  studentSeatLimit?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}

export class PlatformSchoolEntitlementSchoolDto {
  schoolId!: string;
  organizationId!: string;
  name!: string;
  slug!: string;
  status!: 'active' | 'suspended' | 'archived';
}

export class PlatformSchoolEntitlementDto {
  entitlementId!: string;
  status!: SchoolEntitlementStatusApiValue;
  startsAt!: string | null;
  endsAt!: string | null;
  studentSeatLimit!: number | null;
  notes!: string | null;
  createdAt!: string;
  updatedAt!: string;
}

export class PlatformStudentSeatUsageDto {
  used!: number;
  limit!: number | null;
  remaining!: number | null;
  isUnlimited!: boolean;
  isOverLimit!: boolean;
  calculation!: 'active_students';
}

export class PlatformSchoolEntitlementDeferredDto {
  seatLimitEnforcement!: 'available';
  featureControl!: 'deferred';
  billing!: 'out_of_scope_v1';
  invoices!: 'out_of_scope_v1';
  payments!: 'out_of_scope_v1';
}

export class PlatformSchoolEntitlementResponseDto {
  school!: PlatformSchoolEntitlementSchoolDto;
  entitlement!: PlatformSchoolEntitlementDto | null;
  studentSeatUsage!: PlatformStudentSeatUsageDto;
  deferred!: PlatformSchoolEntitlementDeferredDto;
}
