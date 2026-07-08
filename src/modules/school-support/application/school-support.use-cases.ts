import { Injectable } from '@nestjs/common';
import { CommunicationConversationStatus } from '@prisma/client';
import {
  requirePlatformSupportScope,
  requireSchoolSupportScope,
} from '../school-support-context';
import {
  MarkPlatformSupportReadDto,
  PlatformSupportConversationsQueryDto,
  PlatformSupportConversationResponseDto,
  PlatformSupportConversationsResponseDto,
  PlatformSupportMessagesListResponseDto,
  PlatformSupportMessagesQueryDto,
  PlatformSupportReadResponseDto,
  PlatformSupportTransitionDto,
  PlatformSupportTransitionResponseDto,
  SendPlatformSupportMessageDto,
} from '../dto/platform-support.dto';
import {
  MarkSchoolSupportReadDto,
  SchoolSupportConversationResponseDto,
  SchoolSupportMessageResponseDto,
  SchoolSupportMessagesListResponseDto,
  SchoolSupportMessagesQueryDto,
  SchoolSupportReadResponseDto,
  SendSchoolSupportMessageDto,
} from '../dto/school-support.dto';
import {
  PlatformSupportConversationNotFoundException,
  PlatformSupportMessageEmptyException,
  SchoolSupportMessageEmptyException,
} from '../domain/school-support.errors';
import { SchoolSupportRepository } from '../infrastructure/school-support.repository';
import {
  presentPlatformSupportConversation,
  presentPlatformSupportConversations,
  presentPlatformSupportMessagesList,
  presentPlatformSupportRead,
  presentSchoolSupportConversation,
  presentSchoolSupportMessagesList,
  presentSupportMessage,
  presentSupportRead,
  presentSupportTransition,
} from '../presenters/school-support.presenter';

@Injectable()
export class GetSchoolSupportConversationUseCase {
  constructor(private readonly repository: SchoolSupportRepository) {}

  async execute(): Promise<SchoolSupportConversationResponseDto> {
    const scope = requireSchoolSupportScope();
    const result = await this.repository.getOrCreateSchoolConversation(scope);
    return presentSchoolSupportConversation(result);
  }
}

@Injectable()
export class ListSchoolSupportMessagesUseCase {
  constructor(private readonly repository: SchoolSupportRepository) {}

  async execute(
    query: SchoolSupportMessagesQueryDto,
  ): Promise<SchoolSupportMessagesListResponseDto> {
    const scope = requireSchoolSupportScope();
    const result = await this.repository.listSchoolMessages({
      scope,
      filters: toMessageFilters(query),
    });

    return presentSchoolSupportMessagesList(result, scope.actorId);
  }
}

@Injectable()
export class SendSchoolSupportMessageUseCase {
  constructor(private readonly repository: SchoolSupportRepository) {}

  async execute(
    dto: SendSchoolSupportMessageDto,
  ): Promise<SchoolSupportMessageResponseDto> {
    const scope = requireSchoolSupportScope();
    const body = normalizeBody(dto.body, () => new SchoolSupportMessageEmptyException());
    const message = await this.repository.createSchoolMessage({
      scope,
      body,
      clientMessageId: dto.clientMessageId,
    });

    return presentSupportMessage(message, scope.actorId);
  }
}

@Injectable()
export class MarkSchoolSupportReadUseCase {
  constructor(private readonly repository: SchoolSupportRepository) {}

  async execute(
    dto: MarkSchoolSupportReadDto,
  ): Promise<SchoolSupportReadResponseDto> {
    const scope = requireSchoolSupportScope();
    const result = await this.repository.markSchoolConversationRead({
      scope,
      readAt: dto.readAt ? new Date(dto.readAt) : new Date(),
    });

    return presentSupportRead(result);
  }
}

@Injectable()
export class ListPlatformSupportConversationsUseCase {
  constructor(private readonly repository: SchoolSupportRepository) {}

  async execute(
    query: PlatformSupportConversationsQueryDto,
  ): Promise<PlatformSupportConversationsResponseDto> {
    const scope = requirePlatformSupportScope();
    const result = await this.repository.listPlatformConversations({
      scope,
      filters: {
        schoolId: query.schoolId,
        organizationId: query.organizationId,
        status: query.status ? toConversationStatus(query.status) : undefined,
        search: query.search,
        hasUnread: query.hasUnread,
        page: query.page,
        limit: query.limit,
      },
    });

    return presentPlatformSupportConversations(result);
  }
}

@Injectable()
export class GetPlatformSupportConversationUseCase {
  constructor(private readonly repository: SchoolSupportRepository) {}

  async execute(
    conversationId: string,
  ): Promise<PlatformSupportConversationResponseDto> {
    const scope = requirePlatformSupportScope();
    const result = await this.repository.getPlatformConversation({
      scope,
      conversationId,
      ensureParticipant: true,
    });
    if (!result) throw new PlatformSupportConversationNotFoundException();

    return presentPlatformSupportConversation(result);
  }
}

@Injectable()
export class ListPlatformSupportMessagesUseCase {
  constructor(private readonly repository: SchoolSupportRepository) {}

  async execute(
    conversationId: string,
    query: PlatformSupportMessagesQueryDto,
  ): Promise<PlatformSupportMessagesListResponseDto> {
    const scope = requirePlatformSupportScope();
    const result = await this.repository.listPlatformMessages({
      scope,
      conversationId,
      filters: toMessageFilters(query),
    });
    if (!result) throw new PlatformSupportConversationNotFoundException();

    return presentPlatformSupportMessagesList(result, scope.actorId);
  }
}

@Injectable()
export class SendPlatformSupportMessageUseCase {
  constructor(private readonly repository: SchoolSupportRepository) {}

  async execute(
    conversationId: string,
    dto: SendPlatformSupportMessageDto,
  ): Promise<SchoolSupportMessageResponseDto> {
    const scope = requirePlatformSupportScope();
    const body = normalizeBody(dto.body, () => new PlatformSupportMessageEmptyException());
    const message = await this.repository.createPlatformReply({
      scope,
      conversationId,
      body,
      clientMessageId: dto.clientMessageId,
    });
    if (!message) throw new PlatformSupportConversationNotFoundException();

    return presentSupportMessage(message, scope.actorId);
  }
}

@Injectable()
export class MarkPlatformSupportReadUseCase {
  constructor(private readonly repository: SchoolSupportRepository) {}

  async execute(
    conversationId: string,
    dto: MarkPlatformSupportReadDto,
  ): Promise<PlatformSupportReadResponseDto> {
    const scope = requirePlatformSupportScope();
    const result = await this.repository.markPlatformConversationRead({
      scope,
      conversationId,
      readAt: dto.readAt ? new Date(dto.readAt) : new Date(),
    });
    if (!result) throw new PlatformSupportConversationNotFoundException();

    return presentPlatformSupportRead(result);
  }
}

@Injectable()
export class ClosePlatformSupportConversationUseCase {
  constructor(private readonly repository: SchoolSupportRepository) {}

  async execute(
    conversationId: string,
    dto: PlatformSupportTransitionDto,
  ): Promise<PlatformSupportTransitionResponseDto> {
    const scope = requirePlatformSupportScope();
    const conversation = await this.repository.closePlatformConversation({
      scope,
      conversationId,
      reason: dto.reason,
    });
    if (!conversation) throw new PlatformSupportConversationNotFoundException();

    return presentSupportTransition(conversation, 'close');
  }
}

@Injectable()
export class ReopenPlatformSupportConversationUseCase {
  constructor(private readonly repository: SchoolSupportRepository) {}

  async execute(
    conversationId: string,
    dto: PlatformSupportTransitionDto,
  ): Promise<PlatformSupportTransitionResponseDto> {
    const scope = requirePlatformSupportScope();
    const conversation = await this.repository.reopenPlatformConversation({
      scope,
      conversationId,
      reason: dto.reason,
    });
    if (!conversation) throw new PlatformSupportConversationNotFoundException();

    return presentSupportTransition(conversation, 'reopen');
  }
}

function toMessageFilters(query: {
  before?: string;
  after?: string;
  page: number;
  limit: number;
}) {
  return {
    before: query.before ? new Date(query.before) : undefined,
    after: query.after ? new Date(query.after) : undefined,
    page: query.page,
    limit: query.limit,
  };
}

function toConversationStatus(
  status: 'active' | 'closed' | 'archived',
): CommunicationConversationStatus {
  switch (status) {
    case 'closed':
      return CommunicationConversationStatus.CLOSED;
    case 'archived':
      return CommunicationConversationStatus.ARCHIVED;
    case 'active':
    default:
      return CommunicationConversationStatus.ACTIVE;
  }
}

function normalizeBody<T extends Error>(
  body: string,
  makeError: () => T,
): string {
  const trimmed = body.trim();
  if (!trimmed) throw makeError();
  return trimmed;
}
