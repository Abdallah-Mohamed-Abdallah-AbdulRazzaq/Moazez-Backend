import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

function toBooleanValue(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;
  return value;
}

export class ReinforcementFilterOptionsQueryDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  yearId?: string;

  @IsOptional()
  @IsUUID()
  termId?: string;
}

export class ListReinforcementTasksQueryDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  yearId?: string;

  @IsOptional()
  @IsUUID()
  termId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  targetScope?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  scope?: string;

  @IsOptional()
  @IsUUID()
  targetId?: string;

  @IsOptional()
  @IsUUID()
  classroomId?: string;

  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @IsOptional()
  @IsUUID()
  gradeId?: string;

  @IsOptional()
  @IsUUID()
  stageId?: string;

  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsOptional()
  @IsDateString()
  dueFrom?: string;

  @IsOptional()
  @IsDateString()
  dueTo?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @Transform(({ value }) => toBooleanValue(value))
  @IsBoolean()
  includeCancelled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class ReinforcementTaskTargetDto {
  @IsString()
  @MaxLength(32)
  scopeType!: string;

  @IsOptional()
  @IsUUID()
  scopeId?: string | null;
}

export class ReinforcementTaskStageDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sortOrder?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  titleEn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  titleAr?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descriptionEn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descriptionAr?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  proofType?: string | null;

  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean | null;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreateReinforcementTaskDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  yearId?: string;

  @IsUUID()
  termId!: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  titleEn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  titleAr?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descriptionEn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descriptionAr?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  rewardType?: string | null;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  rewardValue?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  rewardLabelEn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  rewardLabelAr?: string | null;

  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @IsOptional()
  @IsUUID()
  assignedById?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  assignedByName?: string | null;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReinforcementTaskTargetDto)
  targets!: ReinforcementTaskTargetDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReinforcementTaskStageDto)
  stages?: ReinforcementTaskStageDto[];
}

export class DuplicateReinforcementTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  titleEn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  titleAr?: string | null;

  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @IsOptional()
  @IsUUID()
  academicYearId?: string | null;

  @IsOptional()
  @IsUUID()
  yearId?: string | null;

  @IsOptional()
  @IsUUID()
  termId?: string | null;
}

export class CancelReinforcementTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string | null;
}

export class ReinforcementAssignmentSummaryResponseDto {
  total!: number;
  notCompleted!: number;
  inProgress!: number;
  underReview!: number;
  completed!: number;
  cancelled!: number;
}

export class ReinforcementTaskResponseDto {
  id!: string;
  academicYearId!: string;
  yearId!: string;
  termId!: string;
  subjectId!: string | null;
  titleEn!: string | null;
  titleAr!: string | null;
  descriptionEn!: string | null;
  descriptionAr!: string | null;
  source!: string;
  status!: string;
  reward!: {
    type: string | null;
    value: number | null;
    labelEn: string | null;
    labelAr: string | null;
  };
  dueDate!: string | null;
  assignedById!: string | null;
  assignedByName!: string | null;
  cancelledAt!: string | null;
  cancellationReason!: string | null;
  targets!: Array<{
    id: string;
    scopeType: string;
    scopeKey: string;
    stageId: string | null;
    gradeId: string | null;
    sectionId: string | null;
    classroomId: string | null;
    studentId: string | null;
  }>;
  stages!: Array<{
    id: string;
    sortOrder: number;
    titleEn: string | null;
    titleAr: string | null;
    descriptionEn: string | null;
    descriptionAr: string | null;
    proofType: string;
    requiresApproval: boolean;
  }>;
  assignmentSummary!: ReinforcementAssignmentSummaryResponseDto;
  createdAt!: string;
  updatedAt!: string;
}

export class ReinforcementTasksListResponseDto {
  items!: ReinforcementTaskResponseDto[];
  total!: number;
  limit!: number | null;
  offset!: number | null;
}

export class ReinforcementFilterOptionsResponseDto {
  academicYears!: Array<Record<string, unknown>>;
  terms!: Array<Record<string, unknown>>;
  stages!: Array<Record<string, unknown>>;
  grades!: Array<Record<string, unknown>>;
  sections!: Array<Record<string, unknown>>;
  classrooms!: Array<Record<string, unknown>>;
  subjects!: Array<Record<string, unknown>>;
  students!: Array<Record<string, unknown>>;
  sources!: Array<Record<string, unknown>>;
  statuses!: Array<Record<string, unknown>>;
  targetScopes!: Array<Record<string, unknown>>;
  proofTypes!: Array<Record<string, unknown>>;
  rewardTypes!: Array<Record<string, unknown>>;
}
