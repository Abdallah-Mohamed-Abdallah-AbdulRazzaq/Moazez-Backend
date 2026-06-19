import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const PARENT_TASK_STATUSES = [
  'pending',
  'in_progress',
  'under_review',
  'completed',
] as const;

export type ParentTaskStatus = (typeof PARENT_TASK_STATUSES)[number];

function toLowerOptionalString(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class ParentTasksQueryDto {
  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(PARENT_TASK_STATUSES)
  status?: ParentTaskStatus;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class ParentTaskChildDto {
  studentId!: string;
  student_id!: string;
}

export class ParentTaskRewardDto {
  type!: string | null;
  value!: number | null;
  label!: string | null;
}

export class ParentTaskSubjectDto {
  subjectId!: string;
  name!: string;
  code!: string | null;
}

export class ParentTaskProofFileDto {
  fileId!: string;
  filename!: string;
  originalName!: string;
  mimeType!: string;
  size!: string;
  sizeBytes!: string;
  visibility!: string;
  createdAt!: string;
}

export class ParentTaskStageSubmissionDto {
  submissionId!: string;
  stageId!: string;
  stage_id!: string;
  status!: string;
  submittedAt!: string | null;
  reviewedAt!: string | null;
  proofText!: string | null;
  proofFile!: ParentTaskProofFileDto | null;
}

export class ParentTaskStageDto {
  id!: string;
  stageId!: string;
  stage_id!: string;
  title!: string | null;
  description!: string | null;
  sortOrder!: number;
  proofType!: string;
  proof_type!: string;
  requiresApproval!: boolean;
  isCompleted!: boolean;
  is_completed!: boolean;
  proof_url!: null;
  submission!: ParentTaskStageSubmissionDto | null;
}

export class ParentTaskCardDto {
  id!: string;
  taskId!: string;
  task_id!: string;
  child!: ParentTaskChildDto;
  title!: string | null;
  description!: string | null;
  source!: string;
  status!: ParentTaskStatus;
  reinforcer_type!: string | null;
  reinforcer_value!: string | null;
  reward!: ParentTaskRewardDto;
  progress!: number;
  progressPercent!: number;
  progress_percent!: number;
  stageCount!: number;
  stage_count!: number;
  completedStageCount!: number;
  completed_stage_count!: number;
  submissionStatus!: string | null;
  submission_status!: string | null;
  reviewStatus!: string | null;
  review_status!: string | null;
  dueDate!: string | null;
  due_date!: string | null;
  subject!: ParentTaskSubjectDto | null;
  subject_name!: string | null;
  assignedAt!: string;
  assigned_at!: string;
  latestActivityAt!: string | null;
  latest_activity_at!: string | null;
}

export class ParentTaskDetailDto extends ParentTaskCardDto {
  stages!: ParentTaskStageDto[];
  submissions!: ParentTaskStageSubmissionDto[];
}

export class ParentTasksSummaryDto {
  total!: number;
  activeCount!: number;
  active_count!: number;
  pending!: number;
  inProgress!: number;
  in_progress!: number;
  underReview!: number;
  under_review!: number;
  completed!: number;
  overdue!: number;
  completionRate!: number;
  completion_rate!: number;
}

export class ParentTasksPaginationDto {
  page!: number;
  limit!: number;
  total!: number;
}

export class ParentTasksListResponseDto {
  child!: ParentTaskChildDto;
  tasks!: ParentTaskCardDto[];
  pagination!: ParentTasksPaginationDto;
  summary!: ParentTasksSummaryDto;
}

export class ParentTasksSummaryResponseDto {
  child!: ParentTaskChildDto;
  summary!: ParentTasksSummaryDto;
}

export class ParentTaskResponseDto {
  task!: ParentTaskDetailDto;
}

export class ParentTaskSubmissionsResponseDto {
  taskId!: string;
  task_id!: string;
  child!: ParentTaskChildDto;
  submissions!: ParentTaskStageSubmissionDto[];
}

export class ParentTaskSubmissionResponseDto {
  submission!: ParentTaskStageSubmissionDto;
}
