import { Type } from 'class-transformer';
import {
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class SchoolSupportMessagesQueryDto {
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
  @Max(10000)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}

export class SendSchoolSupportMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  body!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  clientMessageId?: string;
}

export class MarkSchoolSupportReadDto {
  @IsOptional()
  @IsISO8601()
  readAt?: string;
}

export class SchoolSupportConversationSummaryDto {
  id!: string;
  type!: 'support';
  status!: 'active' | 'closed' | 'archived';
  title!: string;
  lastMessageAt!: string | null;
}

export class SchoolSupportUnreadDto {
  count!: number;
  lastReadAt!: string | null;
}

export class SchoolSupportConversationResponseDto {
  conversation!: SchoolSupportConversationSummaryDto;
  unread!: SchoolSupportUnreadDto;
}

export class SchoolSupportMessageSenderDto {
  kind!: 'school' | 'support' | 'system';
  displayName!: string;
}

export class SchoolSupportMessageResponseDto {
  id!: string;
  conversationId!: string;
  body!: string | null;
  sender!: SchoolSupportMessageSenderDto;
  isMine!: boolean;
  sentAt!: string;
}

export class SchoolSupportMessagesListResponseDto {
  conversation!: {
    id: string;
    status: 'active' | 'closed' | 'archived';
  };
  items!: SchoolSupportMessageResponseDto[];
  pagination!: {
    page: number;
    limit: number;
    total: number;
  };
}

export class SchoolSupportReadResponseDto {
  conversationId!: string;
  readAt!: string;
  markedCount!: number;
}
