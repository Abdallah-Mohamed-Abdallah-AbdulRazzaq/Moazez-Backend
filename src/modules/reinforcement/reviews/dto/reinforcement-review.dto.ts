import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class SubmitReinforcementStageDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  proofText?: string | null;

  @IsOptional()
  @IsUUID()
  proofFileId?: string | null;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class ListReinforcementReviewQueueQueryDto {
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
  @IsUUID()
  taskId?: string;

  @IsOptional()
  @IsUUID()
  studentId?: string;

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
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsDateString()
  submittedFrom?: string;

  @IsOptional()
  @IsDateString()
  submittedTo?: string;

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

export class ReviewReinforcementSubmissionDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  noteAr?: string | null;
}

export class ReinforcementReviewQueueListResponseDto {
  items!: ReinforcementReviewItemResponseDto[];
  total!: number;
  limit!: number | null;
  offset!: number | null;
}

export class ReinforcementReviewItemResponseDto {
  id!: string;
  assignmentId!: string;
  taskId!: string;
  stageId!: string;
  studentId!: string;
  enrollmentId!: string;
  status!: string;
  submittedAt!: string | null;
  reviewedAt!: string | null;
  task!: Record<string, unknown>;
  stage!: Record<string, unknown>;
  student!: Record<string, unknown>;
  assignment!: Record<string, unknown>;
  proof!: Record<string, unknown>;
  currentReview?: Record<string, unknown> | null;
  reviewHistory?: Array<Record<string, unknown>>;
  createdAt?: string;
  updatedAt?: string;
}
