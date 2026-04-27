import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { GradeItemStatus } from '@prisma/client';

const MAX_BULK_GRADE_ITEMS = 200;

function toUpperEnumValue(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

function toBooleanValue(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;

  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;

  return value;
}

export class ListGradeAssessmentItemsQueryDto {
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
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @Transform(({ value }) => toUpperEnumValue(value))
  @IsEnum(GradeItemStatus)
  status?: GradeItemStatus;

  @IsOptional()
  @Transform(({ value }) => toBooleanValue(value))
  @IsBoolean()
  includeMissingStudents?: boolean;
}

export class UpsertGradeAssessmentItemDto {
  @Transform(({ value }) => toUpperEnumValue(value))
  @IsEnum(GradeItemStatus)
  status!: GradeItemStatus;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  score?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string | null;
}

export class BulkGradeAssessmentItemDto extends UpsertGradeAssessmentItemDto {
  @IsUUID()
  studentId!: string;
}

export class BulkUpsertGradeAssessmentItemsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_BULK_GRADE_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => BulkGradeAssessmentItemDto)
  items!: BulkGradeAssessmentItemDto[];
}

export class GradeItemStudentSummaryResponseDto {
  id!: string;
  fullName!: string;
  nameEn!: string;
  nameAr!: string | null;
  code!: string | null;
  admissionNo!: string | null;
}

export class GradeAssessmentItemResponseDto {
  id!: string | null;
  assessmentId!: string;
  studentId!: string;
  enrollmentId!: string | null;
  student!: GradeItemStudentSummaryResponseDto | null;
  score!: number | null;
  status!: string;
  comment!: string | null;
  enteredById!: string | null;
  enteredAt!: string | null;
  createdAt!: string | null;
  updatedAt!: string | null;
  isVirtualMissing!: boolean;
}

export class GradeAssessmentItemsListResponseDto {
  items!: GradeAssessmentItemResponseDto[];
}

export class BulkGradeAssessmentItemsResponseDto {
  assessmentId!: string;
  updatedCount!: number;
  items!: GradeAssessmentItemResponseDto[];
}
