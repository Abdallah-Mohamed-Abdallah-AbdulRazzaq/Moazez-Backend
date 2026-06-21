import { Injectable } from '@nestjs/common';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import {
  SearchStudentConversationMessagesQueryDto,
  StudentConversationMessageSearchResponseDto,
} from '../dto/student-messages.dto';
import { StudentMessagesReadAdapter } from '../infrastructure/student-messages-read.adapter';
import { StudentMessagesPresenter } from '../presenters/student-messages.presenter';
import { assertConversationVisible } from './list-student-conversation-messages.use-case';

@Injectable()
export class SearchStudentConversationMessagesUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentMessagesReadAdapter,
  ) {}

  async execute(params: {
    conversationId: string;
    query: SearchStudentConversationMessagesQueryDto;
  }): Promise<StudentConversationMessageSearchResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    await assertConversationVisible({
      readAdapter: this.readAdapter,
      conversationId: params.conversationId,
      studentUserId: context.studentUserId,
    });

    const result = await this.readAdapter.searchMessages({
      conversationId: params.conversationId,
      studentUserId: context.studentUserId,
      q: params.query.q,
      page: params.query.page,
      limit: params.query.limit,
    });

    return StudentMessagesPresenter.presentMessageSearch({
      result,
      studentUserId: context.studentUserId,
      query: params.query.q,
    });
  }
}
