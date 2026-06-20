import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import {
  GetCommunicationMessageInfoUseCase,
  GetCommunicationMessageReadersUseCase,
} from '../../../communication/application/communication-message.use-cases';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import {
  TeacherMessageInfoResponseDto,
  TeacherMessageReadersQueryDto,
  TeacherMessageReadersResponseDto,
} from '../dto/teacher-messages.dto';
import { TeacherMessagesReadAdapter } from '../infrastructure/teacher-messages-read.adapter';
import { TeacherMessagesPresenter } from '../presenters/teacher-messages.presenter';

@Injectable()
export class GetTeacherMessageReadersUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly readAdapter: TeacherMessagesReadAdapter,
    private readonly getCommunicationMessageReadersUseCase: GetCommunicationMessageReadersUseCase,
  ) {}

  async execute(params: {
    conversationId: string;
    messageId: string;
    query?: TeacherMessageReadersQueryDto;
  }): Promise<TeacherMessageReadersResponseDto> {
    await this.assertTeacherCanViewMessage(params);

    const result = await this.getCommunicationMessageReadersUseCase.execute(
      params.messageId,
      params.query,
    );

    return TeacherMessagesPresenter.presentMessageReaders(result);
  }

  private async assertTeacherCanViewMessage(params: {
    conversationId: string;
    messageId: string;
  }): Promise<void> {
    const context = this.accessService.assertCurrentTeacher();
    const conversation = await this.readAdapter.findConversationForTeacher({
      conversationId: params.conversationId,
      teacherUserId: context.teacherUserId,
    });

    if (!conversation) {
      throw new NotFoundDomainException(
        'Teacher message conversation not found',
        { conversationId: params.conversationId },
      );
    }

    const message = await this.readAdapter.findMessageForTeacher(params);
    if (!message) {
      throw new NotFoundDomainException('Teacher App message not found', {
        messageId: params.messageId,
      });
    }
  }
}

@Injectable()
export class GetTeacherMessageInfoUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly readAdapter: TeacherMessagesReadAdapter,
    private readonly getCommunicationMessageInfoUseCase: GetCommunicationMessageInfoUseCase,
  ) {}

  async execute(params: {
    conversationId: string;
    messageId: string;
    query?: TeacherMessageReadersQueryDto;
  }): Promise<TeacherMessageInfoResponseDto> {
    await this.assertTeacherCanViewMessage(params);

    const result = await this.getCommunicationMessageInfoUseCase.execute(
      params.messageId,
      params.query,
    );

    return TeacherMessagesPresenter.presentMessageInfo(result);
  }

  private async assertTeacherCanViewMessage(params: {
    conversationId: string;
    messageId: string;
  }): Promise<void> {
    const context = this.accessService.assertCurrentTeacher();
    const conversation = await this.readAdapter.findConversationForTeacher({
      conversationId: params.conversationId,
      teacherUserId: context.teacherUserId,
    });

    if (!conversation) {
      throw new NotFoundDomainException(
        'Teacher message conversation not found',
        { conversationId: params.conversationId },
      );
    }

    const message = await this.readAdapter.findMessageForTeacher(params);
    if (!message) {
      throw new NotFoundDomainException('Teacher App message not found', {
        messageId: params.messageId,
      });
    }
  }
}
