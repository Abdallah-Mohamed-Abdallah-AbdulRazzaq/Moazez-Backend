import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  GradeAssessmentApprovalStatus,
  GradeAssessmentDeliveryMode,
  GradeAssessmentType,
} from '@prisma/client';

function toUpperEnumValue(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

export class ListGradeAssessmentsQueryDto {
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
  @IsUUID()
  subjectId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  scopeType?: string;

  @IsOptional()
  @IsUUID()
  scopeId?: string;

  @IsOptional()
  @IsUUID()
  stageId?: string;

  @IsOptional()
  @IsUUID()
  gradeId?: string;

  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @IsOptional()
  @IsUUID()
  classroomId?: string;

  @IsOptional()
  @Transform(({ value }) => toUpperEnumValue(value))
  @IsEnum(GradeAssessmentApprovalStatus)
  approvalStatus?: GradeAssessmentApprovalStatus;

  @IsOptional()
  @Transform(({ value }) => toUpperEnumValue(value))
  @IsEnum(GradeAssessmentType)
  type?: GradeAssessmentType;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

export class CreateGradeAssessmentDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  yearId?: string;

  @IsUUID()
  termId!: string;

  @IsUUID()
  subjectId!: string;

  @IsString()
  @MaxLength(32)
  scopeType!: string;

  @IsOptional()
  @IsUUID()
  scopeId?: string | null;

  @IsOptional()
  @IsUUID()
  stageId?: string | null;

  @IsOptional()
  @IsUUID()
  gradeId?: string | null;

  @IsOptional()
  @IsUUID()
  sectionId?: string | null;

  @IsOptional()
  @IsUUID()
  classroomId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  titleEn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  titleAr?: string | null;

  @Transform(({ value }) => toUpperEnumValue(value))
  @IsEnum(GradeAssessmentType)
  type!: GradeAssessmentType;

  @IsOptional()
  @Transform(({ value }) => toUpperEnumValue(value))
  @IsEnum(GradeAssessmentDeliveryMode)
  deliveryMode?: GradeAssessmentDeliveryMode;

  @IsDateString()
  date!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100)
  weight!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  maxScore!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedTimeMinutes?: number | null;
}

export class CreateQuestionBasedGradeAssessmentDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  yearId?: string;

  @IsUUID()
  termId!: string;

  @IsUUID()
  subjectId!: string;

  @IsString()
  @MaxLength(32)
  scopeType!: string;

  @IsOptional()
  @IsUUID()
  scopeId?: string | null;

  @IsOptional()
  @IsUUID()
  stageId?: string | null;

  @IsOptional()
  @IsUUID()
  gradeId?: string | null;

  @IsOptional()
  @IsUUID()
  sectionId?: string | null;

  @IsOptional()
  @IsUUID()
  classroomId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  titleEn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  titleAr?: string | null;

  @Transform(({ value }) => toUpperEnumValue(value))
  @IsEnum(GradeAssessmentType)
  type!: GradeAssessmentType;

  @IsDateString()
  date!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100)
  weight!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  maxScore!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedTimeMinutes?: number | null;
}

export class UpdateGradeAssessmentDto {
  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  scopeType?: string;

  @IsOptional()
  @IsUUID()
  scopeId?: string | null;

  @IsOptional()
  @IsUUID()
  stageId?: string | null;

  @IsOptional()
  @IsUUID()
  gradeId?: string | null;

  @IsOptional()
  @IsUUID()
  sectionId?: string | null;

  @IsOptional()
  @IsUUID()
  classroomId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  titleEn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  titleAr?: string | null;

  @IsOptional()
  @Transform(({ value }) => toUpperEnumValue(value))
  @IsEnum(GradeAssessmentType)
  type?: GradeAssessmentType;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100)
  weight?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  maxScore?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedTimeMinutes?: number | null;
}

export class GradeAssessmentSubjectResponseDto {
  id!: string;
  name!: string;
  nameAr!: string;
  nameEn!: string;
  code!: string | null;
  color!: string | null;
}

export class GradeAssessmentResponseDto {
  id!: string;
  academicYearId!: string;
  yearId!: string;
  termId!: string;
  subjectId!: string;
  subject!: GradeAssessmentSubjectResponseDto | null;
  scopeType!: string;
  scopeKey!: string;
  scopeId!: string;
  stageId!: string | null;
  gradeId!: string | null;
  sectionId!: string | null;
  classroomId!: string | null;
  title!: string | null;
  titleEn!: string | null;
  titleAr!: string | null;
  type!: string;
  deliveryMode!: string;
  date!: string;
  weight!: number;
  maxScore!: number;
  expectedTimeMinutes!: number | null;
  approvalStatus!: string;
  isLocked!: boolean;
  publishedAt!: string | null;
  publishedById!: string | null;
  approvedAt!: string | null;
  approvedById!: string | null;
  lockedAt!: string | null;
  lockedById!: string | null;
  createdById!: string | null;
  createdAt!: string;
  updatedAt!: string;
}

export class GradeAssessmentsListResponseDto {
  items!: GradeAssessmentResponseDto[];
}

export class DeleteGradeAssessmentResponseDto {
  ok!: true;
}
