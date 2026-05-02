import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  COMMUNICATION_REPORT_REASONS,
  COMMUNICATION_REPORT_STATUSES,
} from '../domain/communication-report-domain';

export class CreateCommunicationMessageReportDto {
  @IsIn(COMMUNICATION_REPORT_REASONS)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string | null;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}

export class ListCommunicationMessageReportsQueryDto {
  @IsOptional()
  @IsIn(COMMUNICATION_REPORT_STATUSES)
  status?: string;

  @IsOptional()
  @IsIn(COMMUNICATION_REPORT_REASONS)
  reason?: string;

  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @IsOptional()
  @IsUUID()
  messageId?: string;

  @IsOptional()
  @IsUUID()
  reporterId?: string;

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
  @Max(10000)
  page?: number;
}

export class UpdateCommunicationMessageReportDto {
  @IsIn(COMMUNICATION_REPORT_STATUSES)
  status!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  resolutionNote?: string | null;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}
