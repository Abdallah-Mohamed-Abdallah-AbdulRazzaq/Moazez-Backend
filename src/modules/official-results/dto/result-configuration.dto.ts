import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type, Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import type { ResultGrantAction } from '@prisma/client';

const periodKinds = ['TERM', 'CUSTOM', 'YEAR'] as const;
const periodStates = ['OPEN', 'ENTRY_CLOSED', 'ARCHIVED'] as const;
const groupKinds = ['SUBJECT', 'CUSTOM'] as const;
const classifications = ['PROGRESS', 'FINAL'] as const;
const sortOptions = ['ID_ASC', 'ID_DESC'] as const;
const grantActions = [
  'VIEW',
  'DESIGN',
  'EDIT',
  'IMPORT',
  'EXPORT',
  'SUBMIT',
  'PUBLISH',
  'REQUEST_CORRECTION',
  'PUBLISH_CORRECTION',
] as const satisfies readonly ResultGrantAction[];
const whenPresent = (_object: unknown, value: unknown) => value !== undefined;
const date = /^\d{4}-\d{2}-\d{2}$/u;
const code = /^[\p{L}\p{N}][\p{L}\p{N}_.-]{0,63}$/u;
const nonBlank = /\S/u;
const isoUtc = /Z$/u;

export class ResultLabelDto {
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @Matches(nonBlank)
  @MaxLength(200)
  ar!: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @Expose()
  @Transform(({ value, obj }: { value: unknown; obj: { ar: unknown } }) =>
    value === undefined ? obj.ar : value,
  )
  @IsString()
  @Matches(nonBlank)
  @MaxLength(200)
  en!: string;
}

export class ResultPageQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 50 })
  @ValidateIf(whenPresent)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({ maxLength: 300 })
  @ValidateIf(whenPresent)
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]+$/u)
  @MaxLength(300)
  cursor?: string;
}

export class ResultPeriodsQueryDto extends ResultPageQueryDto {
  @ApiPropertyOptional({ enum: sortOptions, default: 'ID_ASC' })
  @ValidateIf(whenPresent)
  @IsIn(sortOptions)
  sort?: (typeof sortOptions)[number];

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf(whenPresent)
  @IsUUID()
  academicYearId?: string;

  @ApiPropertyOptional({ enum: periodKinds })
  @ValidateIf(whenPresent)
  @IsIn(periodKinds)
  kind?: (typeof periodKinds)[number];

  @ApiPropertyOptional({ enum: periodStates })
  @ValidateIf(whenPresent)
  @IsIn(periodStates)
  status?: (typeof periodStates)[number];
}

export class ResultGroupsQueryDto extends ResultPageQueryDto {
  @ApiPropertyOptional({ enum: sortOptions, default: 'ID_ASC' })
  @ValidateIf(whenPresent)
  @IsIn(sortOptions)
  sort?: (typeof sortOptions)[number];

  @ApiPropertyOptional({ enum: groupKinds })
  @ValidateIf(whenPresent)
  @IsIn(groupKinds)
  kind?: (typeof groupKinds)[number];

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf(whenPresent)
  @IsUUID()
  subjectId?: string;

  @ApiPropertyOptional()
  @ValidateIf(whenPresent)
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  archived?: boolean;
}

export class ResultCapabilitiesQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf(whenPresent)
  @IsUUID()
  sheetId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf(whenPresent)
  @IsUUID()
  slotId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf(whenPresent)
  @IsUUID()
  reportingPeriodId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf(whenPresent)
  @IsUUID()
  groupId?: string;
}

export class ReportingPeriodCreateDto {
  @ApiProperty({ enum: periodKinds })
  @IsIn(periodKinds)
  kind!: (typeof periodKinds)[number];

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  academicYearId!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Required for TERM and CUSTOM',
  })
  @ValidateIf(whenPresent)
  @IsUUID()
  termId?: string;

  @ApiProperty({ maxLength: 64 })
  @Matches(code)
  code!: string;

  @ApiProperty({ type: ResultLabelDto })
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => ResultLabelDto)
  name!: ResultLabelDto;

  @ApiProperty({ format: 'date' })
  @Matches(date)
  startsOn!: string;

  @ApiProperty({ format: 'date' })
  @Matches(date)
  endsOn!: string;

  @ApiPropertyOptional({ enum: classifications, default: 'FINAL' })
  @ValidateIf(whenPresent)
  @IsIn(classifications)
  classification?: (typeof classifications)[number];
}

export class ResultGroupCreateDto {
  @ApiProperty({ enum: groupKinds })
  @IsIn(groupKinds)
  kind!: (typeof groupKinds)[number];

  @ApiPropertyOptional({ format: 'uuid', description: 'Required for SUBJECT' })
  @ValidateIf(whenPresent)
  @IsUUID()
  subjectId?: string;

  @ApiProperty({ maxLength: 64 })
  @Matches(code)
  code!: string;

  @ApiProperty({ type: ResultLabelDto })
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => ResultLabelDto)
  label!: ResultLabelDto;

  @ApiPropertyOptional({ maxLength: 2000 })
  @ValidateIf(whenPresent)
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class ResultPeriodPatchDto {
  @ApiPropertyOptional({ type: ResultLabelDto })
  @ValidateIf(whenPresent)
  @IsObject()
  @ValidateNested()
  @Type(() => ResultLabelDto)
  name?: ResultLabelDto;

  @ApiPropertyOptional({ maxLength: 2000 })
  @ValidateIf(whenPresent)
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ format: 'date' })
  @ValidateIf(whenPresent)
  @Matches(date)
  startsOn?: string;

  @ApiPropertyOptional({ format: 'date' })
  @ValidateIf(whenPresent)
  @Matches(date)
  endsOn?: string;
}

export class ResultGroupPatchDto {
  @ApiPropertyOptional({ type: ResultLabelDto })
  @ValidateIf(whenPresent)
  @IsObject()
  @ValidateNested()
  @Type(() => ResultLabelDto)
  label?: ResultLabelDto;

  @ApiPropertyOptional({ maxLength: 2000 })
  @ValidateIf(whenPresent)
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class ResultRevisionDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedRevision!: number;
}

export class ReportingPeriodUpdateDto extends ResultRevisionDto {
  @ApiProperty({ type: ResultPeriodPatchDto })
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => ResultPeriodPatchDto)
  patch!: ResultPeriodPatchDto;
}

export class ResultGroupUpdateDto extends ResultRevisionDto {
  @ApiProperty({ type: ResultGroupPatchDto })
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => ResultGroupPatchDto)
  patch!: ResultGroupPatchDto;
}

class ExpectedPolicyDto {
  @ApiProperty({ type: 'string', format: 'uuid', nullable: true })
  @ValidateIf((_object: unknown, value: unknown) => value !== null)
  @IsUUID()
  expectedPolicyVersionId!: string | null;
}

export class ResultPolicyPreviewDto extends ExpectedPolicyDto {
  @ApiProperty({ type: 'object', additionalProperties: false })
  @IsObject()
  policy!: object;
}

export class ResultPolicyActivateDto extends ExpectedPolicyDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  previewId!: string;

  @ApiProperty({ minLength: 64, maxLength: 64 })
  @Matches(/^[a-f0-9]{64}$/u)
  previewDigest!: string;
}

export class ResultGranteeDto {
  @ApiProperty({ enum: ['USER', 'ROLE'] })
  @IsIn(['USER', 'ROLE'])
  kind!: 'USER' | 'ROLE';

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id!: string;
}

export class ResultGrantScopeDto {
  @ApiProperty({ type: [String], minItems: 1, maxItems: 200 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  reportingPeriodIds!: string[];

  @ApiProperty({ type: [String], minItems: 1, maxItems: 200 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  groupIds!: string[];

  @ApiProperty({ type: [String], minItems: 1, maxItems: 200 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  classroomIds!: string[];

  @ApiPropertyOptional({ type: [String], minItems: 1, maxItems: 200 })
  @ValidateIf(whenPresent)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  fieldIds?: string[];
}

export class ResultGrantCreateDto {
  @ApiProperty({ type: ResultGranteeDto })
  @IsObject()
  @ValidateNested()
  @Type(() => ResultGranteeDto)
  grantee!: ResultGranteeDto;

  @ApiProperty({ type: ResultGrantScopeDto })
  @IsObject()
  @ValidateNested()
  @Type(() => ResultGrantScopeDto)
  scope!: ResultGrantScopeDto;

  @ApiProperty({ enum: grantActions, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(grantActions.length)
  @ArrayUnique()
  @IsIn(grantActions, { each: true })
  actions!: ResultGrantAction[];

  @ApiProperty({ maxLength: 2000 })
  @Matches(nonBlank)
  @MaxLength(2000)
  reason!: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @ValidateIf(whenPresent)
  @IsISO8601({ strict: true })
  @Matches(isoUtc)
  startsAt?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @ValidateIf(whenPresent)
  @IsISO8601({ strict: true })
  @Matches(isoUtc)
  expiresAt?: string;
}

export class ResultReasonedCommandDto extends ResultRevisionDto {
  @ApiProperty({ maxLength: 2000 })
  @Matches(nonBlank)
  @MaxLength(2000)
  reason!: string;
}

export class CorrectionWindowTargetDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  slotId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  releaseUnitId!: string;

  @ApiProperty({ type: [String], minItems: 1, maxItems: 200 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  authorizedActorIds!: string[];
}

export class ResultCorrectionWindowDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedPeriodRevision!: number;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true })
  @Matches(isoUtc)
  expiresAt!: string;

  @ApiProperty({ maxLength: 2000 })
  @Matches(nonBlank)
  @MaxLength(2000)
  reason!: string;

  @ApiProperty({
    type: [CorrectionWindowTargetDto],
    minItems: 1,
    maxItems: 200,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CorrectionWindowTargetDto)
  targets!: CorrectionWindowTargetDto[];
}
