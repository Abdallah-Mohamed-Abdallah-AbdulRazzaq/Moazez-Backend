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

export const STUDENT_TASK_STATUSES = [
  'pending',
  'in_progress',
  'under_review',
  'completed',
] as const;

export type StudentTaskStatus = (typeof STUDENT_TASK_STATUSES)[number];

function toLowerOptionalString(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class StudentTasksQueryDto {
  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(STUDENT_TASK_STATUSES)
  status?: StudentTaskStatus;

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

export class StudentTaskRewardDto {
  type!: string | null;
  value!: number | null;
  label!: string | null;
}

export class StudentTaskSubjectDto {
  subjectId!: string;
  name!: string;
  code!: string | null;
}

export class StudentTaskProofFileDto {
  fileId!: string;
  filename!: string;
  mimeType!: string;
  size!: string;
}

export class StudentTaskStageSubmissionDto {
  submissionId!: string;
  status!: string;
  submittedAt!: string | null;
  reviewedAt!: string | null;
  proofText!: string | null;
  proofFile!: StudentTaskProofFileDto | null;
}

export class StudentTaskStageDto {
  id!: string;
  title!: string | null;
  description!: string | null;
  sortOrder!: number;
  proofType!: string;
  requiresApproval!: boolean;
  isCompleted!: boolean;
  is_completed!: boolean;
  proof_type!: string;
  proof_url!: null;
  submission!: StudentTaskStageSubmissionDto | null;
}

export class StudentTaskCardDto {
  id!: string;
  taskId!: string;
  task_id!: string;
  assignmentId!: string;
  assignment_id!: string;
  title!: string | null;
  description!: string | null;
  source!: string;
  status!: StudentTaskStatus;
  reinforcer_type!: string | null;
  reinforcer_value!: string | null;
  reward!: StudentTaskRewardDto;
  progress!: number;
  dueDate!: string | null;
  due_date!: string | null;
  subject!: StudentTaskSubjectDto | null;
  subject_name!: string | null;
  assignedAt!: string;
  assigned_at!: string;
}

export class StudentTaskDetailDto extends StudentTaskCardDto {
  stages!: StudentTaskStageDto[];
  submissions!: StudentTaskStageSubmissionDto[];
}

export class StudentTasksSummaryDto {
  total!: number;
  pending!: number;
  inProgress!: number;
  in_progress!: number;
  underReview!: number;
  under_review!: number;
  completed!: number;
  overdue!: number;
}

export class StudentTaskPaginationDto {
  page!: number;
  limit!: number;
  total!: number;
}

export class StudentTasksListResponseDto {
  tasks!: StudentTaskCardDto[];
  pagination!: StudentTaskPaginationDto;
  summary!: StudentTasksSummaryDto;
}

export class StudentTasksSummaryResponseDto {
  summary!: StudentTasksSummaryDto;
}

export class StudentTaskResponseDto {
  task!: StudentTaskDetailDto;
}

export class StudentTaskSubmissionsResponseDto {
  taskId!: string;
  task_id!: string;
  submissions!: StudentTaskStageSubmissionDto[];
}

export class StudentTaskSubmissionResponseDto {
  submission!: StudentTaskStageSubmissionDto;
}
