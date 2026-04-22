import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  INTERVIEW_STATUS_API_VALUES,
  type InterviewStatusApiValue,
} from '../domain/interview.enums';

export class ListInterviewsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsIn(INTERVIEW_STATUS_API_VALUES)
  status?: InterviewStatusApiValue;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}

export class CreateInterviewDto {
  @IsUUID()
  applicationId!: string;

  @IsDateString()
  scheduledAt!: string;

  @IsOptional()
  @IsUUID()
  interviewerUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateInterviewDto {
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsUUID()
  interviewerUserId?: string;

  @IsOptional()
  @IsIn(INTERVIEW_STATUS_API_VALUES)
  status?: InterviewStatusApiValue;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class InterviewResponseDto {
  id!: string;
  applicationId!: string;
  studentName!: string;
  scheduledAt!: string | null;
  interviewerUserId!: string | null;
  interviewerName!: string | null;
  status!: InterviewStatusApiValue;
  notes!: string | null;
  createdAt!: string;
  updatedAt!: string;
}

export class InterviewsListResponseDto {
  items!: InterviewResponseDto[];
  pagination!: {
    page: number;
    limit: number;
    total: number;
  };
}
