import { Type } from 'class-transformer';
import {
  IsISO8601,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
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

export class TeacherMessageConversationParamsDto {
  @IsUUID()
  conversationId!: string;
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

export class SendTeacherConversationMessageDto {
  @IsString()
  @MaxLength(20000)
  body!: string;

  @IsOptional()
  @IsUUID()
  replyToMessageId?: string;
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

export class TeacherMessageReactionSummaryDto {
  key!: string;
  emoji!: string | null;
  count!: number;
  reactedByMe!: boolean;
}

export class TeacherMessageAttachmentSummaryDto {
  attachmentId!: string;
  fileId!: string;
  originalName!: string | null;
  mimeType!: string | null;
  sizeBytes!: string;
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
  readCount!: number;
}

export class TeacherMessageLastMessageDto {
  messageId!: string;
  sender!: TeacherMessageSenderDto;
  type!: string;
  status!: string;
  body!: string | null;
  content!: string | null;
  createdAt!: string;
}

export class TeacherMessageConversationCardDto {
  conversationId!: string;
  type!: string;
  title!: string | null;
  displayName!: string;
  status!: string;
  lastMessage!: TeacherMessageLastMessageDto | null;
  unreadCount!: number;
  participantsCount!: number;
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
