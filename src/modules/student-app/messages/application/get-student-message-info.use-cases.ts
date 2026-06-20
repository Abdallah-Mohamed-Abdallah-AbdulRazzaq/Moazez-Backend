import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import {
  GetCommunicationMessageInfoUseCase,
  GetCommunicationMessageReadersUseCase,
} from '../../../communication/application/communication-message.use-cases';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import {
  StudentMessageInfoResponseDto,
  StudentMessageReadersQueryDto,
  StudentMessageReadersResponseDto,
} from '../dto/student-messages.dto';
import { StudentMessagesReadAdapter } from '../infrastructure/student-messages-read.adapter';
import { StudentMessagesPresenter } from '../presenters/student-messages.presenter';
import { assertConversationVisible } from './list-student-conversation-messages.use-case';

@Injectable()
export class GetStudentMessageReadersUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentMessagesReadAdapter,
    private readonly getCommunicationMessageReadersUseCase: GetCommunicationMessageReadersUseCase,
  ) {}

  async execute(params: {
    conversationId: string;
    messageId: string;
    query?: StudentMessageReadersQueryDto;
  }): Promise<StudentMessageReadersResponseDto> {
    await this.assertStudentCanViewMessage(params);

    const result = await this.getCommunicationMessageReadersUseCase.execute(
      params.messageId,
      params.query,
    );

    return StudentMessagesPresenter.presentMessageReaders(result);
  }

  private async assertStudentCanViewMessage(params: {
    conversationId: string;
    messageId: string;
  }): Promise<void> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    await assertConversationVisible({
      readAdapter: this.readAdapter,
      conversationId: params.conversationId,
      studentUserId: context.studentUserId,
    });
    const message = await this.readAdapter.findMessageForStudent(params);

    if (!message) {
      throw new NotFoundDomainException('Student App message not found', {
        messageId: params.messageId,
      });
    }
  }
}

@Injectable()
export class GetStudentMessageInfoUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentMessagesReadAdapter,
    private readonly getCommunicationMessageInfoUseCase: GetCommunicationMessageInfoUseCase,
  ) {}

  async execute(params: {
    conversationId: string;
    messageId: string;
    query?: StudentMessageReadersQueryDto;
  }): Promise<StudentMessageInfoResponseDto> {
    await this.assertStudentCanViewMessage(params);

    const result = await this.getCommunicationMessageInfoUseCase.execute(
      params.messageId,
      params.query,
    );

    return StudentMessagesPresenter.presentMessageInfo(result);
  }

  private async assertStudentCanViewMessage(params: {
    conversationId: string;
    messageId: string;
  }): Promise<void> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    await assertConversationVisible({
      readAdapter: this.readAdapter,
      conversationId: params.conversationId,
      studentUserId: context.studentUserId,
    });
    const message = await this.readAdapter.findMessageForStudent(params);

    if (!message) {
      throw new NotFoundDomainException('Student App message not found', {
        messageId: params.messageId,
      });
    }
  }
}
