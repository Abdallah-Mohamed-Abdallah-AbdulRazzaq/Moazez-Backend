import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsISO8601,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const TEACHER_MESSAGE_CONVERSATION_TYPES = [
  'direct',
  'group',
  'classroom',
  'grade',
  'section',
  'stage',
  'school_wide',
  'support',
  'system',
] as const;

export const TEACHER_MESSAGE_CONVERSATION_STATUSES = [
  'active',
  'archived',
  'closed',
] as const;

export const TEACHER_MESSAGE_TYPES = [
  'text',
  'image',
  'file',
  'audio',
  'video',
  'system',
] as const;

export const TEACHER_MESSAGE_SEND_TYPES = [
  'text',
  'image',
  'file',
  'audio',
  'voice',
  'video',
] as const;

function toLowerOptionalString(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class TeacherMessageConversationParamsDto {
  @IsUUID()
  conversationId!: string;
}

export class TeacherMessageInfoParamsDto extends TeacherMessageConversationParamsDto {
  @IsUUID()
  messageId!: string;
}

export class ListTeacherMessageConversationsQueryDto {
  @IsOptional()
  @IsIn(TEACHER_MESSAGE_CONVERSATION_TYPES)
  type?: string;

  @IsOptional()
  @IsIn(TEACHER_MESSAGE_CONVERSATION_STATUSES)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
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
  @Max(10000)
  page?: number;
}

export class ListTeacherConversationMessagesQueryDto {
  @IsOptional()
  @IsIn(TEACHER_MESSAGE_TYPES)
  type?: string;

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

export class TeacherMessageReadersQueryDto {
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

export class SendTeacherConversationMessageAttachmentDto {
  @IsUUID()
  fileId!: string;

  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
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

export class SendTeacherConversationMessageDto {
  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(TEACHER_MESSAGE_SEND_TYPES)
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
  @MaxLength(1000)
  caption?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  clientMessageId?: string;

  @IsOptional()
  @IsUUID()
  replyToMessageId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SendTeacherConversationMessageAttachmentDto)
  attachments?: SendTeacherConversationMessageAttachmentDto[];
}

export class TeacherMessagePaginationDto {
  page!: number;
  limit!: number;
  total!: number;
}

export class TeacherMessageSenderDto {
  userId!: string | null;
  displayName!: string | null;
  userType!: string | null;
  isMe!: boolean;
}

export class TeacherMessageReaderDto {
  userId!: string;
  displayName!: string;
  userType!: string;
  isMe!: boolean;
  readAt!: string;
}

export class TeacherMessageReactionSummaryDto {
  key!: string;
  emoji!: string | null;
  count!: number;
  reactedByMe!: boolean;
}

export class TeacherMessageAttachmentSummaryDto {
  attachmentId!: string;
  fileId!: string;
  displayName!: string | null;
  originalName!: string | null;
  mimeType!: string | null;
  sizeBytes!: string;
  mediaKind!: string;
  visibility!: string;
  caption!: string | null;
  sortOrder!: number;
  downloadPath!: string;
  createdAt!: string;
}

export class TeacherMessageDto {
  messageId!: string;
  sender!: TeacherMessageSenderDto;
  type!: string;
  status!: string;
  body!: string | null;
  content!: string | null;
  replyToMessageId!: string | null;
  editedAt!: string | null;
  createdAt!: string;
  reactions!: TeacherMessageReactionSummaryDto[];
  attachments!: TeacherMessageAttachmentSummaryDto[];
  attachmentsCount!: number;
  readCount!: number;
}

export class TeacherMessageLastMessageDto {
  id!: string;
  messageId!: string;
  sender!: TeacherMessageSenderDto;
  senderType!: 'me' | 'other';
  type!: string;
  status!: string;
  text!: string | null;
  body!: string | null;
  content!: string | null;
  readCount!: number;
  attachmentsCount!: number;
  createdAt!: string;
}

export class TeacherMessageConversationCardDto {
  conversationId!: string;
  type!: string;
  title!: string | null;
  displayName!: string;
  status!: string;
  isGroup!: boolean;
  lastMessage!: TeacherMessageLastMessageDto | null;
  unreadCount!: number;
  participantsCount!: number;
  lastMessageReadCount!: number;
  lastActivityAt!: string | null;
  updatedAt!: string;
}

export class TeacherMessageConversationParticipantDto {
  userId!: string;
  displayName!: string;
  userType!: string;
  role!: string;
  isMe!: boolean;
}

export class TeacherMessageConversationDetailDto {
  conversationId!: string;
  type!: string;
  title!: string | null;
  displayName!: string;
  status!: string;
  readOnly!: boolean;
  pinned!: boolean;
  participantsCount!: number;
  participants!: TeacherMessageConversationParticipantDto[];
  ownReadState!: {
    lastReadMessageId: string | null;
    lastReadAt: string | null;
  };
  lastActivityAt!: string | null;
  createdAt!: string;
  updatedAt!: string;
}

export class TeacherMessageConversationsResponseDto {
  conversations!: TeacherMessageConversationCardDto[];
  pagination!: TeacherMessagePaginationDto;
  summary!: {
    unreadConversationsCount: number;
    unreadMessagesCount: number;
  };
}

export class TeacherMessageConversationResponseDto {
  conversation!: TeacherMessageConversationDetailDto;
}

export class TeacherConversationMessagesResponseDto {
  conversationId!: string;
  messages!: TeacherMessageDto[];
  pagination!: TeacherMessagePaginationDto;
}

export class TeacherConversationMessageResponseDto {
  message!: TeacherMessageDto;
}

export class TeacherConversationReadResponseDto {
  conversationId!: string;
  readAt!: string;
  markedCount!: number;
}

export class TeacherMessageReadersResponseDto {
  messageId!: string;
  conversationId!: string;
  readCount!: number;
  participantsCount!: number;
  fullyRead!: boolean;
  readers!: TeacherMessageReaderDto[];
  pagination!: TeacherMessagePaginationDto;
}

export class TeacherMessageInfoMessageDto {
  messageId!: string;
  conversationId!: string;
  sender!: TeacherMessageSenderDto;
  type!: string;
  status!: string;
  body!: string | null;
  content!: string | null;
  createdAt!: string;
  readCount!: number;
}

export class TeacherMessageInfoResponseDto {
  message!: TeacherMessageInfoMessageDto;
  readers!: TeacherMessageReaderDto[];
  readCount!: number;
  participantsCount!: number;
  fullyRead!: boolean;
  pagination!: TeacherMessagePaginationDto;
}
