import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { GetTeacherMessageConversationUseCase } from '../application/get-teacher-message-conversation.use-case';
import { ListTeacherConversationMessagesUseCase } from '../application/list-teacher-conversation-messages.use-case';
import { ListTeacherMessageConversationsUseCase } from '../application/list-teacher-message-conversations.use-case';
import { MarkTeacherConversationReadUseCase } from '../application/mark-teacher-conversation-read.use-case';
import { SendTeacherConversationMessageUseCase } from '../application/send-teacher-conversation-message.use-case';
import {
  ListTeacherConversationMessagesQueryDto,
  ListTeacherMessageConversationsQueryDto,
  SendTeacherConversationMessageDto,
  TeacherConversationMessageResponseDto,
  TeacherConversationMessagesResponseDto,
  TeacherConversationReadResponseDto,
  TeacherMessageConversationParamsDto,
  TeacherMessageConversationResponseDto,
  TeacherMessageConversationsResponseDto,
} from '../dto/teacher-messages.dto';

@ApiTags('teacher-app')
@ApiBearerAuth()
@Controller('teacher/messages')
export class TeacherMessagesController {
  constructor(
    private readonly listTeacherMessageConversationsUseCase: ListTeacherMessageConversationsUseCase,
    private readonly getTeacherMessageConversationUseCase: GetTeacherMessageConversationUseCase,
    private readonly listTeacherConversationMessagesUseCase: ListTeacherConversationMessagesUseCase,
    private readonly sendTeacherConversationMessageUseCase: SendTeacherConversationMessageUseCase,
    private readonly markTeacherConversationReadUseCase: MarkTeacherConversationReadUseCase,
  ) {}

  @Get('conversations')
  @ApiOkResponse({ type: TeacherMessageConversationsResponseDto })
  listConversations(
    @Query() query: ListTeacherMessageConversationsQueryDto,
  ): Promise<TeacherMessageConversationsResponseDto> {
    return this.listTeacherMessageConversationsUseCase.execute(query);
  }

  @Get('conversations/:conversationId')
  @ApiOkResponse({ type: TeacherMessageConversationResponseDto })
  getConversation(
    @Param() params: TeacherMessageConversationParamsDto,
  ): Promise<TeacherMessageConversationResponseDto> {
    return this.getTeacherMessageConversationUseCase.execute(
      params.conversationId,
    );
  }

  @Get('conversations/:conversationId/messages')
  @ApiOkResponse({ type: TeacherConversationMessagesResponseDto })
  listMessages(
    @Param() params: TeacherMessageConversationParamsDto,
    @Query() query: ListTeacherConversationMessagesQueryDto,
  ): Promise<TeacherConversationMessagesResponseDto> {
    return this.listTeacherConversationMessagesUseCase.execute(
      params.conversationId,
      query,
    );
  }

  @Post('conversations/:conversationId/messages')
  @ApiCreatedResponse({ type: TeacherConversationMessageResponseDto })
  sendMessage(
    @Param() params: TeacherMessageConversationParamsDto,
    @Body() dto: SendTeacherConversationMessageDto,
  ): Promise<TeacherConversationMessageResponseDto> {
    return this.sendTeacherConversationMessageUseCase.execute(
      params.conversationId,
      dto,
    );
  }

  @Post('conversations/:conversationId/read')
  @ApiCreatedResponse({ type: TeacherConversationReadResponseDto })
  markRead(
    @Param() params: TeacherMessageConversationParamsDto,
  ): Promise<TeacherConversationReadResponseDto> {
    return this.markTeacherConversationReadUseCase.execute(
      params.conversationId,
    );
  }
}
