import { Type } from 'class-transformer';
import {
  IsISO8601,
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

export const COMMUNICATION_MESSAGE_TYPES = [
  'text',
  'image',
  'file',
  'audio',
  'video',
  'system',
] as const;

export const PUBLIC_COMMUNICATION_MESSAGE_TYPES = ['text'] as const;

export const COMMUNICATION_MESSAGE_STATUSES = [
  'sent',
  'hidden',
  'deleted',
] as const;

export class ListCommunicationMessagesQueryDto {
  @IsOptional()
  @IsIn(COMMUNICATION_MESSAGE_TYPES)
  type?: string;

  @IsOptional()
  @IsIn(COMMUNICATION_MESSAGE_STATUSES)
  status?: string;

  @IsOptional()
  @IsISO8601()
  before?: string;

  @IsOptional()
  @IsISO8601()
  after?: string;

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

export class CreateCommunicationMessageDto {
  @IsOptional()
  @IsIn(PUBLIC_COMMUNICATION_MESSAGE_TYPES)
  type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  clientMessageId?: string;

  @IsOptional()
  @IsUUID()
  replyToMessageId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}

export class UpdateCommunicationMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  content?: string;
}

export class MarkConversationReadDto {
  @IsOptional()
  @IsISO8601()
  readAt?: string;
}

export class ReadSummaryQueryDto {
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
