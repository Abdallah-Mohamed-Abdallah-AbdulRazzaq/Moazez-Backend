import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PlatformSchoolFeatureCategory } from '../domain/platform-admin-feature-registry';

export const SCHOOL_FEATURE_CONTROL_SOURCE_API_VALUES = [
  'platform',
  'entitlement',
  'system',
] as const;

export type SchoolFeatureControlSourceApiValue =
  (typeof SCHOOL_FEATURE_CONTROL_SOURCE_API_VALUES)[number];

export type SchoolFeatureControlResponseSource =
  | SchoolFeatureControlSourceApiValue
  | 'platform_default';

export class UpsertPlatformSchoolFeatureControlDto {
  @IsBoolean()
  enabled!: boolean;

  @ValidateIf((_, value) => value !== undefined)
  @IsIn(SCHOOL_FEATURE_CONTROL_SOURCE_API_VALUES)
  source?: SchoolFeatureControlSourceApiValue;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}

export class BulkPlatformSchoolFeatureControlItemDto extends UpsertPlatformSchoolFeatureControlDto {
  @IsString()
  @Matches(/^[a-z][a-z0-9_]*$/)
  featureKey!: string;
}

export class BulkUpdatePlatformSchoolFeatureControlsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BulkPlatformSchoolFeatureControlItemDto)
  features!: BulkPlatformSchoolFeatureControlItemDto[];
}

export class PlatformSchoolFeatureControlSchoolDto {
  schoolId!: string;
  organizationId!: string;
  name!: string;
  slug!: string;
  status!: 'active' | 'suspended' | 'archived';
}

export class PlatformSchoolFeatureControlItemDto {
  featureKey!: string;
  label!: string;
  category!: PlatformSchoolFeatureCategory;
  enabled!: boolean;
  configured!: boolean;
  source!: SchoolFeatureControlResponseSource;
  notes!: string | null;
  updatedAt!: string | null;
}

export class PlatformSchoolFeatureControlSummaryDto {
  totalKnownFeatures!: number;
  configured!: number;
  enabled!: number;
  disabled!: number;
}

export class PlatformSchoolFeatureControlDeferredDto {
  runtimeEnforcement!: 'deferred';
  planAutomation!: 'deferred';
  billing!: 'out_of_scope_v1';
  rollouts!: 'deferred';
}

export class PlatformSchoolFeatureControlsResponseDto {
  school!: PlatformSchoolFeatureControlSchoolDto;
  features!: PlatformSchoolFeatureControlItemDto[];
  summary!: PlatformSchoolFeatureControlSummaryDto;
  deferred!: PlatformSchoolFeatureControlDeferredDto;
}
