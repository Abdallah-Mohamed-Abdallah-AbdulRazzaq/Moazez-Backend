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

export enum TeacherTaskStatusQueryValue {
  PENDING = 'pending',
  IN_PROGRESS = 'inProgress',
  UNDER_REVIEW = 'underReview',
  COMPLETED = 'completed',
}

export enum TeacherTaskSourceQueryValue {
  TEACHER = 'teacher',
  PARENT = 'parent',
  SYSTEM = 'system',
}

export class TeacherTaskParamsDto {
  @IsUUID()
  taskId!: string;
}

export class ListTeacherTasksQueryDto {
  @IsOptional()
  @IsEnum(TeacherTaskStatusQueryValue)
  status?: TeacherTaskStatusQueryValue;

  @IsOptional()
  @IsUUID()
  classId?: string;

  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsEnum(TeacherTaskSourceQueryValue)
  source?: TeacherTaskSourceQueryValue;

  @IsOptional()
  @IsString()
  @MaxLength(160)
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

export class TeacherTaskSummaryDto {
  totalTasks!: number;
  pendingTasks!: number;
  inProgressTasks!: number;
  underReviewTasks!: number;
  completedTasks!: number;
}

export class TeacherTaskClassDashboardDto {
  classId!: string;
  className!: string;
  subjectName!: string;
  studentsCount!: number;
  activeTasksCount!: number;
  underReviewCount!: number;
  completedCount!: number;
}

export class TeacherTaskRewardDto {
  type!: string | null;
  value!: number | null;
  label!: string | null;
}

export class TeacherTaskTargetSummaryDto {
  type!: 'class' | 'student' | 'mixed';
  classId!: string | null;
  className!: string | null;
  subjectName!: string | null;
  studentsCount!: number;
  studentId!: string | null;
  studentName!: string | null;
}

export class TeacherTaskCardDto {
  taskId!: string;
  title!: string;
  description!: string | null;
  status!: string;
  source!: string;
  target!: TeacherTaskTargetSummaryDto;
  reward!: TeacherTaskRewardDto;
  proofType!: string;
  stagesCount!: number;
  submissionsCount!: number;
  underReviewCount!: number;
  createdAt!: string;
  dueAt!: string | null;
}

export class TeacherTasksPaginationDto {
  page!: number;
  limit!: number;
  total!: number;
}

export class TeacherTasksListResponseDto {
  tasks!: TeacherTaskCardDto[];
  pagination!: TeacherTasksPaginationDto;
}

export class TeacherTaskDashboardResponseDto {
  summary!: TeacherTaskSummaryDto;
  byClass!: TeacherTaskClassDashboardDto[];
  recentTasks!: TeacherTaskCardDto[];
}

export class TeacherTaskClassSelectorDto {
  classId!: string;
  classroomName!: string;
  subjectId!: string;
  subjectName!: string;
  gradeName!: string;
  sectionName!: string;
  studentsCount!: number;
}

export class TeacherTaskStudentSelectorDto {
  studentId!: string;
  displayName!: string;
  classIds!: string[];
}

export class TeacherTaskSelectorsResponseDto {
  classes!: TeacherTaskClassSelectorDto[];
  students!: TeacherTaskStudentSelectorDto[];
  statuses!: string[];
  proofTypes!: string[];
  rewardTypes!: string[];
}

export class TeacherTaskProofFileDto {
  id!: string;
  originalName!: string;
  mimeType!: string;
  sizeBytes!: string;
  visibility!: string;
  createdAt!: string;
  downloadPath!: string;
}

export class TeacherTaskStageSummaryDto {
  stageId!: string;
  title!: string;
  description!: string | null;
  sortOrder!: number;
  proofType!: string;
  requiresApproval!: boolean;
  submissionsCount!: number;
  underReviewCount!: number;
  approvedCount!: number;
  rejectedCount!: number;
}

export class TeacherTaskAssignmentSummaryDto {
  assignmentId!: string;
  studentId!: string;
  studentName!: string;
  classId!: string | null;
  status!: string;
  progress!: number;
  assignedAt!: string;
  completedAt!: string | null;
}

export class TeacherTaskSubmissionSummaryDto {
  submissionId!: string;
  assignmentId!: string;
  stageId!: string;
  studentId!: string;
  studentName!: string;
  status!: string;
  proofText!: string | null;
  proofFile!: TeacherTaskProofFileDto | null;
  submittedAt!: string | null;
  reviewedAt!: string | null;
  review!: {
    id: string;
    outcome: string;
    note: string | null;
    reviewedAt: string;
  } | null;
}

export class TeacherTaskDetailDto {
  taskId!: string;
  title!: string;
  description!: string | null;
  status!: string;
  source!: string;
  subject!: {
    subjectId: string | null;
    subjectName: string | null;
  };
  reward!: TeacherTaskRewardDto;
  dueAt!: string | null;
  createdAt!: string;
  updatedAt!: string;
  target!: TeacherTaskTargetSummaryDto;
  stages!: TeacherTaskStageSummaryDto[];
  assignments!: TeacherTaskAssignmentSummaryDto[];
  submissions!: TeacherTaskSubmissionSummaryDto[];
}

export class TeacherTaskDetailResponseDto {
  task!: TeacherTaskDetailDto;
}
