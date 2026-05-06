import { Transform, Type } from 'class-transformer';
import {
  IsISO8601,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
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

export class SendStudentConversationMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  body!: string;
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

export class StudentConversationLastMessageDto {
  messageId!: string;
  sender!: StudentMessageSenderDto;
  type!: string;
  status!: string;
  body!: string | null;
  content!: string | null;
  createdAt!: string;
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
