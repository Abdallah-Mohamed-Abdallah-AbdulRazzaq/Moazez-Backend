import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { GetParentMessageConversationUseCase } from '../application/get-parent-message-conversation.use-case';
import { ListParentConversationMessagesUseCase } from '../application/list-parent-conversation-messages.use-case';
import { ListParentMessageConversationsUseCase } from '../application/list-parent-message-conversations.use-case';
import { MarkParentConversationReadUseCase } from '../application/mark-parent-conversation-read.use-case';
import { SendParentConversationMessageUseCase } from '../application/send-parent-conversation-message.use-case';
import {
  ListParentConversationMessagesQueryDto,
  ListParentMessageConversationsQueryDto,
  ParentConversationMessageResponseDto,
  ParentConversationMessagesResponseDto,
  ParentConversationReadResponseDto,
  ParentMessageConversationResponseDto,
  ParentMessageConversationsResponseDto,
  SendParentConversationMessageDto,
} from '../dto/parent-messages.dto';

@ApiTags('parent-app')
@ApiBearerAuth()
@Controller('parent/messages')
export class ParentMessagesController {
  constructor(
    private readonly listParentMessageConversationsUseCase: ListParentMessageConversationsUseCase,
    private readonly getParentMessageConversationUseCase: GetParentMessageConversationUseCase,
    private readonly listParentConversationMessagesUseCase: ListParentConversationMessagesUseCase,
    private readonly sendParentConversationMessageUseCase: SendParentConversationMessageUseCase,
    private readonly markParentConversationReadUseCase: MarkParentConversationReadUseCase,
  ) {}

  @Get('conversations')
  @ApiOkResponse({ type: ParentMessageConversationsResponseDto })
  listConversations(
    @Query() query: ListParentMessageConversationsQueryDto,
  ): Promise<ParentMessageConversationsResponseDto> {
    return this.listParentMessageConversationsUseCase.execute(query);
  }

  @Get('conversations/:conversationId')
  @ApiOkResponse({ type: ParentMessageConversationResponseDto })
  getConversation(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
  ): Promise<ParentMessageConversationResponseDto> {
    return this.getParentMessageConversationUseCase.execute(conversationId);
  }

  @Get('conversations/:conversationId/messages')
  @ApiOkResponse({ type: ParentConversationMessagesResponseDto })
  listMessages(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Query() query: ListParentConversationMessagesQueryDto,
  ): Promise<ParentConversationMessagesResponseDto> {
    return this.listParentConversationMessagesUseCase.execute({
      conversationId,
      query,
    });
  }

  @Post('conversations/:conversationId/messages')
  @ApiCreatedResponse({ type: ParentConversationMessageResponseDto })
  sendMessage(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Body() body: SendParentConversationMessageDto,
  ): Promise<ParentConversationMessageResponseDto> {
    return this.sendParentConversationMessageUseCase.execute({
      conversationId,
      body,
    });
  }

  @Post('conversations/:conversationId/read')
  @ApiCreatedResponse({ type: ParentConversationReadResponseDto })
  markRead(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
  ): Promise<ParentConversationReadResponseDto> {
    return this.markParentConversationReadUseCase.execute(conversationId);
  }
}
