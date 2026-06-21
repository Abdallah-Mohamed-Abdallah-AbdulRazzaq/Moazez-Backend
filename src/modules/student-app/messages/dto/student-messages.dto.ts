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

export const STUDENT_MESSAGE_CONVERSATION_TYPES = [
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

export const STUDENT_MESSAGE_CONVERSATION_STATUSES = [
  'active',
  'archived',
  'closed',
] as const;

export const STUDENT_MESSAGE_TYPES = [
  'text',
  'image',
  'file',
  'audio',
  'video',
  'system',
] as const;

export const STUDENT_MESSAGE_SEND_TYPES = [
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

export class ListStudentMessageConversationsQueryDto {
  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(STUDENT_MESSAGE_CONVERSATION_TYPES)
  type?: string;

  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(STUDENT_MESSAGE_CONVERSATION_STATUSES)
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

export class ListStudentConversationMessagesQueryDto {
  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(STUDENT_MESSAGE_TYPES)
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

export class StudentMessageReadersQueryDto {
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

export class SendStudentConversationMessageAttachmentDto {
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

export class SendStudentConversationMessageDto {
  @IsOptional()
  @Transform(({ value }) => toLowerOptionalString(value))
  @IsIn(STUDENT_MESSAGE_SEND_TYPES)
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
  @Type(() => SendStudentConversationMessageAttachmentDto)
  attachments?: SendStudentConversationMessageAttachmentDto[];
}

export class StudentMessagePaginationDto {
  page!: number;
  limit!: number;
  total!: number;
}

export class StudentMessageSenderDto {
  userId!: string | null;
  displayName!: string | null;
  userType!: string | null;
  isMe!: boolean;
}

export class StudentMessageReaderDto {
  userId!: string;
  user_id!: string;
  displayName!: string;
  display_name!: string;
  userType!: string;
  user_type!: string;
  isMe!: boolean;
  is_me!: boolean;
  readAt!: string;
  read_at!: string;
}

export class StudentMessageAttachmentDto {
  attachmentId!: string;
  attachment_id!: string;
  fileId!: string;
  file_id!: string;
  displayName!: string | null;
  display_name!: string | null;
  mimeType!: string | null;
  mime_type!: string | null;
  sizeBytes!: string;
  size_bytes!: string;
  mediaKind!: string;
  media_kind!: string;
  caption!: string | null;
  sortOrder!: number;
  sort_order!: number;
  createdAt!: string;
  created_at!: string;
  downloadPath!: string;
  download_path!: string;
  authorizedDownloadPath?: string;
  authorized_download_path?: string;
  previewPath?: string;
  preview_path?: string;
}

export class StudentConversationLastMessageDto {
  id!: string;
  messageId!: string;
  message_id!: string;
  sender!: StudentMessageSenderDto;
  senderType!: 'me' | 'other';
  sender_type!: 'me' | 'other';
  type!: string;
  status!: string;
  text!: string | null;
  body!: string | null;
  content!: string | null;
  readCount!: number;
  read_count!: number;
  attachmentsCount!: number;
  attachments_count!: number;
  createdAt!: string;
  created_at!: string;
}

export class StudentMessageConversationCardDto {
  id!: string;
  conversationId!: string;
  conversation_id!: string;
  type!: string;
  title!: string | null;
  displayName!: string;
  display_name!: string;
  status!: string;
  category!: string;
  isGroup!: boolean;
  is_group!: boolean;
  avatar_url!: null;
  lastMessage!: StudentConversationLastMessageDto | null;
  last_message!: StudentConversationLastMessageDto | null;
  unreadCount!: number;
  unread_count!: number;
  participantsCount!: number;
  participants_count!: number;
  lastMessageReadCount!: number;
  last_message_read_count!: number;
  lastActivityAt!: string | null;
  last_activity_at!: string | null;
  updatedAt!: string;
  updated_at!: string;
}

export class StudentMessageConversationParticipantDto {
  userId!: string;
  displayName!: string;
  userType!: string;
  role!: string;
  isMe!: boolean;
}

export class StudentMessageConversationDetailDto extends StudentMessageConversationCardDto {
  readOnly!: boolean;
  read_only!: boolean;
  participants!: StudentMessageConversationParticipantDto[];
  ownReadState!: {
    lastReadMessageId: string | null;
    lastReadAt: string | null;
  };
  own_read_state!: {
    last_read_message_id: string | null;
    last_read_at: string | null;
  };
  createdAt!: string;
  created_at!: string;
}

export class StudentMessageDto {
  id!: string;
  messageId!: string;
  message_id!: string;
  sender!: StudentMessageSenderDto;
  senderType!: 'me' | 'other';
  sender_type!: 'me' | 'other';
  type!: string;
  status!: string;
  text!: string | null;
  body!: string | null;
  content!: string | null;
  replyToMessageId!: string | null;
  reply_to_message_id!: string | null;
  editedAt!: string | null;
  edited_at!: string | null;
  createdAt!: string;
  created_at!: string;
  date!: string;
  time!: string;
  isRead!: boolean;
  is_read!: boolean;
  readCount!: number;
  read_count!: number;
  attachments!: StudentMessageAttachmentDto[];
  attachmentsCount!: number;
  attachments_count!: number;
  audio_url!: null;
  audio_duration!: null;
}

export class StudentMessageConversationsResponseDto {
  conversations!: StudentMessageConversationCardDto[];
  pagination!: StudentMessagePaginationDto;
  summary!: {
    unreadConversationsCount: number;
    unreadMessagesCount: number;
  };
}

export class StudentMessageConversationResponseDto {
  conversation!: StudentMessageConversationDetailDto;
}

export class StudentConversationMessagesResponseDto {
  conversationId!: string;
  conversation_id!: string;
  messages!: StudentMessageDto[];
  pagination!: StudentMessagePaginationDto;
}

export class StudentConversationMessageResponseDto {
  message!: StudentMessageDto;
}

export class StudentConversationReadResponseDto {
  conversationId!: string;
  conversation_id!: string;
  readAt!: string;
  read_at!: string;
  markedCount!: number;
  marked_count!: number;
}

export class StudentMessageReadersResponseDto {
  messageId!: string;
  message_id!: string;
  conversationId!: string;
  conversation_id!: string;
  readCount!: number;
  read_count!: number;
  participantsCount!: number;
  participants_count!: number;
  fullyRead!: boolean;
  fully_read!: boolean;
  readers!: StudentMessageReaderDto[];
  pagination!: StudentMessagePaginationDto;
}

export class StudentMessageInfoMessageDto {
  messageId!: string;
  message_id!: string;
  conversationId!: string;
  conversation_id!: string;
  sender!: StudentMessageSenderDto;
  type!: string;
  status!: string;
  body!: string | null;
  content!: string | null;
  createdAt!: string;
  created_at!: string;
  readCount!: number;
  read_count!: number;
}

export class StudentMessageInfoResponseDto {
  message!: StudentMessageInfoMessageDto;
  readers!: StudentMessageReaderDto[];
  readCount!: number;
  read_count!: number;
  participantsCount!: number;
  participants_count!: number;
  fullyRead!: boolean;
  fully_read!: boolean;
  pagination!: StudentMessagePaginationDto;
}
