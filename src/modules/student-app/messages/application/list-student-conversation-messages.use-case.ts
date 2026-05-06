import { Injectable } from '@nestjs/common';
import { CommunicationMessageKind } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import {
  ListStudentConversationMessagesQueryDto,
  StudentConversationMessagesResponseDto,
} from '../dto/student-messages.dto';
import {
  StudentMessageFilters,
  StudentMessagesReadAdapter,
} from '../infrastructure/student-messages-read.adapter';
import { StudentMessagesPresenter } from '../presenters/student-messages.presenter';

@Injectable()
export class ListStudentConversationMessagesUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentMessagesReadAdapter,
  ) {}

  async execute(params: {
    conversationId: string;
    query?: ListStudentConversationMessagesQueryDto;
  }): Promise<StudentConversationMessagesResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    await assertConversationVisible({
      readAdapter: this.readAdapter,
      conversationId: params.conversationId,
      studentUserId: context.studentUserId,
    });

    const result = await this.readAdapter.listMessages({
      conversationId: params.conversationId,
      filters: toMessageFilters(params.query),
    });

    return StudentMessagesPresenter.presentMessageList({
      result,
      studentUserId: context.studentUserId,
    });
  }
}

export async function assertConversationVisible(params: {
  readAdapter: StudentMessagesReadAdapter;
  conversationId: string;
  studentUserId: string;
}): Promise<void> {
  const conversation = await params.readAdapter.findConversationForStudent({
    conversationId: params.conversationId,
    studentUserId: params.studentUserId,
  });

  if (!conversation) {
    throw new NotFoundDomainException('Student App conversation not found', {
      conversationId: params.conversationId,
    });
  }
}

export function toMessageFilters(
  query?: ListStudentConversationMessagesQueryDto,
): StudentMessageFilters {
  return {
    ...(query?.type ? { kind: toMessageKind(query.type) } : {}),
    ...(query?.before ? { before: new Date(query.before) } : {}),
    ...(query?.after ? { after: new Date(query.after) } : {}),
    ...(query?.limit !== undefined ? { limit: query.limit } : {}),
    ...(query?.page !== undefined ? { page: query.page } : {}),
  };
}

function toMessageKind(value: string): CommunicationMessageKind {
  return value.toUpperCase() as CommunicationMessageKind;
}
