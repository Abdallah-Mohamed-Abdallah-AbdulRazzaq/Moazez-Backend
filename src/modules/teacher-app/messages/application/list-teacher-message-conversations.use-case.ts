import { Injectable } from '@nestjs/common';
import {
  CommunicationConversationStatus,
  CommunicationConversationType,
} from '@prisma/client';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import {
  ListTeacherMessageConversationsQueryDto,
  TeacherMessageConversationsResponseDto,
} from '../dto/teacher-messages.dto';
import { TeacherMessagesReadAdapter } from '../infrastructure/teacher-messages-read.adapter';
import { TeacherMessagesPresenter } from '../presenters/teacher-messages.presenter';

const TYPE_FILTERS: Record<string, CommunicationConversationType> = {
  direct: CommunicationConversationType.DIRECT,
  group: CommunicationConversationType.GROUP,
  classroom: CommunicationConversationType.CLASSROOM,
  grade: CommunicationConversationType.GRADE,
  section: CommunicationConversationType.SECTION,
  stage: CommunicationConversationType.STAGE,
  school_wide: CommunicationConversationType.SCHOOL_WIDE,
  support: CommunicationConversationType.SUPPORT,
  system: CommunicationConversationType.SYSTEM,
};

const STATUS_FILTERS: Record<string, CommunicationConversationStatus> = {
  active: CommunicationConversationStatus.ACTIVE,
  archived: CommunicationConversationStatus.ARCHIVED,
  closed: CommunicationConversationStatus.CLOSED,
};

@Injectable()
export class ListTeacherMessageConversationsUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly messagesReadAdapter: TeacherMessagesReadAdapter,
  ) {}

  async execute(
    query: ListTeacherMessageConversationsQueryDto,
  ): Promise<TeacherMessageConversationsResponseDto> {
    const context = this.accessService.assertCurrentTeacher();
    const [result, unreadSummary] = await Promise.all([
      this.messagesReadAdapter.listConversations({
        teacherUserId: context.teacherUserId,
        filters: {
          type: query.type ? TYPE_FILTERS[query.type] : undefined,
          status: query.status ? STATUS_FILTERS[query.status] : undefined,
          search: query.search,
          page: query.page,
          limit: query.limit,
        },
      }),
      this.messagesReadAdapter.getUnreadSummary({
        teacherUserId: context.teacherUserId,
      }),
    ]);

    return TeacherMessagesPresenter.presentConversationList({
      result,
      unreadSummary,
      teacherUserId: context.teacherUserId,
    });
  }
}
