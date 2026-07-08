import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class PlatformSupportConversationsQueryDto {
  @IsOptional()
  @IsUUID()
  schoolId?: string;

  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @IsOptional()
  @IsIn(['active', 'closed', 'archived'])
  status?: 'active' | 'closed' | 'archived';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  hasUnread?: boolean;

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
  limit = 20;
}

export class PlatformSupportMessagesQueryDto {
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

export class SendPlatformSupportMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  body!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  clientMessageId?: string;
}

export class MarkPlatformSupportReadDto {
  @IsOptional()
  @IsISO8601()
  readAt?: string;
}

export class PlatformSupportTransitionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class PlatformSupportConversationsResponseDto {
  items!: Array<{
    conversation: {
      id: string;
      status: 'active' | 'closed' | 'archived';
      lastMessageAt: string | null;
    };
    school: {
      id: string;
      name: string;
      status: 'active' | 'suspended' | 'archived';
    };
    organization: {
      id: string;
      name: string;
    };
    lastMessage: {
      preview: string | null;
      senderKind: 'school' | 'support' | 'system';
      sentAt: string;
    } | null;
    unread: {
      count: number;
    };
  }>;
  pagination!: {
    page: number;
    limit: number;
    total: number;
  };
}

export class PlatformSupportConversationResponseDto {
  conversation!: {
    id: string;
    type: 'support';
    status: 'active' | 'closed' | 'archived';
    lastMessageAt: string | null;
    createdAt: string;
  };
  school!: {
    id: string;
    name: string;
    status: 'active' | 'suspended' | 'archived';
  };
  organization!: {
    id: string;
    name: string;
  };
  unread!: {
    count: number;
    lastReadAt: string | null;
  };
}

export class PlatformSupportMessagesListResponseDto {
  conversation!: {
    id: string;
    status: 'active' | 'closed' | 'archived';
  };
  school!: {
    id: string;
    name: string;
  };
  items!: Array<{
    id: string;
    conversationId: string;
    body: string | null;
    sender: {
      kind: 'school' | 'support' | 'system';
      displayName: string;
    };
    isMine: boolean;
    sentAt: string;
  }>;
  pagination!: {
    page: number;
    limit: number;
    total: number;
  };
}

export class PlatformSupportReadResponseDto {
  conversationId!: string;
  readAt!: string;
  markedCount!: number;
}

export class PlatformSupportTransitionResponseDto {
  conversation!: {
    id: string;
    status: 'active' | 'closed' | 'archived';
    closedAt?: string | null;
    reopenedAt?: string;
  };
}
