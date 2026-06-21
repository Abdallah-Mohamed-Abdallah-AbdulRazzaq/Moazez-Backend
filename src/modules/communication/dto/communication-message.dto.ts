import { Type } from 'class-transformer';
import {
  IsISO8601,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsObject,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
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

export const PUBLIC_COMMUNICATION_MESSAGE_CREATE_TYPES = [
  'text',
  'image',
  'file',
  'audio',
  'voice',
  'video',
] as const;

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
  @IsIn(PUBLIC_COMMUNICATION_MESSAGE_CREATE_TYPES)
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
  @IsString()
  @MaxLength(1000)
  caption?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCommunicationMessageAttachmentDto)
  attachments?: CreateCommunicationMessageAttachmentDto[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}

export class CreateCommunicationMessageAttachmentDto {
  @IsUUID()
  fileId!: string;

  @IsOptional()
  @IsIn(['image', 'file', 'audio', 'video'])
  mediaKind?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  caption?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;
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

export class MessageReadersQueryDto {
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

export class CommunicationMessageReaderDto {
  userId!: string;
  displayName!: string;
  userType!: string;
  isMe!: boolean;
  readAt!: string;
}

export class CommunicationMessageReadersPaginationDto {
  page!: number;
  limit!: number;
  total!: number;
}

export class CommunicationMessageReadersResponseDto {
  messageId!: string;
  conversationId!: string;
  readCount!: number;
  participantsCount!: number;
  fullyRead!: boolean;
  readers!: CommunicationMessageReaderDto[];
  pagination!: CommunicationMessageReadersPaginationDto;
}

export class CommunicationMessageInfoSenderDto {
  userId!: string | null;
  displayName!: string | null;
  userType!: string | null;
  isMe!: boolean;
}

export class CommunicationMessageInfoMessageDto {
  messageId!: string;
  conversationId!: string;
  sender!: CommunicationMessageInfoSenderDto;
  type!: string;
  status!: string;
  body!: string | null;
  content!: string | null;
  createdAt!: string;
  readCount!: number;
}

export class CommunicationMessageInfoResponseDto {
  message!: CommunicationMessageInfoMessageDto;
  readers!: CommunicationMessageReaderDto[];
  readCount!: number;
  participantsCount!: number;
  fullyRead!: boolean;
  pagination!: CommunicationMessageReadersPaginationDto;
}
