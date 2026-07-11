import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsTimeZone,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export const DASHBOARD_TODO_STATUSES = ['pending', 'completed'] as const;
export const DASHBOARD_TODO_PRIORITIES = ['low', 'normal', 'high'] as const;
export const DASHBOARD_TODO_LIST_STATUSES = [
  ...DASHBOARD_TODO_STATUSES,
  'all',
] as const;

export type DashboardTodoStatus = (typeof DASHBOARD_TODO_STATUSES)[number];
export type DashboardTodoPriority = (typeof DASHBOARD_TODO_PRIORITIES)[number];
export type DashboardTodoListStatus =
  (typeof DASHBOARD_TODO_LIST_STATUSES)[number];

export class ListDashboardTodosQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsIn(DASHBOARD_TODO_LIST_STATUSES)
  status?: DashboardTodoListStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsTimeZone()
  timezone?: string;
}

export class CreateDashboardTodoDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString()
  date!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsIn(DASHBOARD_TODO_PRIORITIES)
  priority?: DashboardTodoPriority;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}

export class UpdateDashboardTodoDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(1000)
  notes?: string | null;

  @IsOptional()
  @IsIn(DASHBOARD_TODO_STATUSES)
  status?: DashboardTodoStatus;

  @IsOptional()
  @IsIn(DASHBOARD_TODO_PRIORITIES)
  priority?: DashboardTodoPriority;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}

export class DashboardTodoDto {
  todoId!: string;
  date!: string;
  title!: string;
  notes!: string | null;
  status!: DashboardTodoStatus;
  priority!: DashboardTodoPriority;
  sortOrder!: number;
  completedAt!: string | null;
  createdAt!: string;
  updatedAt!: string;
}

export class DashboardTodosSummaryDto {
  total!: number;
  pending!: number;
  completed!: number;
}

export class DashboardTodosFiltersDto {
  date!: string;
  status!: DashboardTodoListStatus;
  limit!: number;
}

export class DashboardTodosMetaDto {
  source!: 'dashboard_todos';
  version!: 'v1';
  scope!: 'owner';
}

export class DashboardTodosResponseDto {
  generatedAt!: string;
  date!: string;
  todos!: DashboardTodoDto[];
  summary!: DashboardTodosSummaryDto;
  filters!: DashboardTodosFiltersDto;
  meta!: DashboardTodosMetaDto;
}

export class CreateDashboardTodoResponseDto {
  generatedAt!: string;
  todo!: DashboardTodoDto;
}

export class UpdateDashboardTodoResponseDto {
  generatedAt!: string;
  todo!: DashboardTodoDto;
}

export class DeleteDashboardTodoResponseDto {
  generatedAt!: string;
  deleted!: true;
  todoId!: string;
}
