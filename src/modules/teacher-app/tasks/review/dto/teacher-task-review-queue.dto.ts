import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export enum TeacherTaskReviewStatusQueryValue {
  PENDING = 'pending',
  SUBMITTED = 'submitted',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export class TeacherTaskReviewSubmissionParamsDto {
  @IsUUID()
  submissionId!: string;
}

export class ListTeacherTaskReviewQueueQueryDto {
  @IsOptional()
  @IsEnum(TeacherTaskReviewStatusQueryValue)
  status?: TeacherTaskReviewStatusQueryValue;

  @IsOptional()
  @IsUUID()
  classId?: string;

  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}

export class ApproveTeacherTaskReviewSubmissionDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  noteAr?: string | null;
}

export class RejectTeacherTaskReviewSubmissionDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  noteAr?: string | null;
}

export class TeacherTaskReviewStageSummaryDto {
  stageId!: string;
  title!: string;
  sortOrder!: number;
  proofType!: string;
  requiresApproval!: boolean;
}

export class TeacherTaskReviewStudentSummaryDto {
  studentId!: string;
  displayName!: string;
}

export class TeacherTaskReviewClassSummaryDto {
  classId!: string | null;
  className!: string | null;
  subjectName!: string | null;
  gradeName!: string | null;
  sectionName!: string | null;
}

export class TeacherTaskReviewRewardSummaryDto {
  type!: string | null;
  value!: number | null;
  label!: string | null;
}

export class TeacherTaskReviewProofFileDto {
  id!: string;
  originalName!: string;
  mimeType!: string;
  sizeBytes!: string;
  visibility!: string;
  createdAt!: string;
  downloadPath!: string;
}

export class TeacherTaskReviewProofSummaryDto {
  text!: string | null;
  file!: TeacherTaskReviewProofFileDto | null;
}

export class TeacherTaskReviewStatusSummaryDto {
  status!: string;
  reviewedAt!: string | null;
  comment!: string | null;
}

export class TeacherTaskReviewCardDto {
  submissionId!: string;
  taskId!: string;
  taskTitle!: string;
  stage!: TeacherTaskReviewStageSummaryDto;
  student!: TeacherTaskReviewStudentSummaryDto;
  class!: TeacherTaskReviewClassSummaryDto;
  status!: string;
  submittedAt!: string | null;
  proof!: TeacherTaskReviewProofSummaryDto;
  review!: TeacherTaskReviewStatusSummaryDto;
  reward!: TeacherTaskReviewRewardSummaryDto;
}

export class TeacherTaskReviewDetailDto extends TeacherTaskReviewCardDto {
  assignment!: {
    assignmentId: string;
    status: string;
    progress: number;
    assignedAt: string;
    completedAt: string | null;
  };
  reviewHistory!: Array<{
    id: string;
    outcome: string;
    comment: string | null;
    reviewedAt: string;
  }>;
}

export class TeacherTaskReviewPaginationDto {
  page!: number;
  limit!: number;
  total!: number;
}

export class TeacherTaskReviewQueueResponseDto {
  items!: TeacherTaskReviewCardDto[];
  pagination!: TeacherTaskReviewPaginationDto;
}

export class TeacherTaskReviewSubmissionResponseDto {
  submission!: TeacherTaskReviewDetailDto;
}
