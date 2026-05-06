import { Injectable } from '@nestjs/common';
import {
  CommunicationConversationStatus,
  CommunicationConversationType,
} from '@prisma/client';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import {
  ListStudentMessageConversationsQueryDto,
  StudentMessageConversationsResponseDto,
} from '../dto/student-messages.dto';
import {
  StudentMessageConversationFilters,
  StudentMessagesReadAdapter,
} from '../infrastructure/student-messages-read.adapter';
import { StudentMessagesPresenter } from '../presenters/student-messages.presenter';

@Injectable()
export class ListStudentMessageConversationsUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentMessagesReadAdapter,
  ) {}

  async execute(
    query?: ListStudentMessageConversationsQueryDto,
  ): Promise<StudentMessageConversationsResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const filters = toConversationFilters(query);
    const [result, unreadSummary] = await Promise.all([
      this.readAdapter.listConversations({
        studentUserId: context.studentUserId,
        filters,
      }),
      this.readAdapter.getUnreadSummary({
        studentUserId: context.studentUserId,
      }),
    ]);

    return StudentMessagesPresenter.presentConversationList({
      result,
      studentUserId: context.studentUserId,
      unreadSummary,
    });
  }
}

export function toConversationFilters(
  query?: ListStudentMessageConversationsQueryDto,
): StudentMessageConversationFilters {
  return {
    ...(query?.type ? { type: toConversationType(query.type) } : {}),
    ...(query?.status ? { status: toConversationStatus(query.status) } : {}),
    ...(query?.search ? { search: query.search } : {}),
    ...(query?.limit !== undefined ? { limit: query.limit } : {}),
    ...(query?.page !== undefined ? { page: query.page } : {}),
  };
}

function toConversationType(value: string): CommunicationConversationType {
  return value.toUpperCase() as CommunicationConversationType;
}

function toConversationStatus(value: string): CommunicationConversationStatus {
  return value.toUpperCase() as CommunicationConversationStatus;
}
