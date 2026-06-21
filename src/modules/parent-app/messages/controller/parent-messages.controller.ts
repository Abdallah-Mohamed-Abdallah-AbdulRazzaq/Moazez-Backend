import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Redirect,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
  ApiTemporaryRedirectResponse,
} from '@nestjs/swagger';
import { GetParentMessageAttachmentDownloadUrlUseCase } from '../application/get-parent-message-attachment-download-url.use-case';
import {
  GetParentMessageInfoUseCase,
  GetParentMessageReadersUseCase,
} from '../application/get-parent-message-info.use-cases';
import { GetParentMessageConversationUseCase } from '../application/get-parent-message-conversation.use-case';
import { ListParentConversationMessagesUseCase } from '../application/list-parent-conversation-messages.use-case';
import { ListParentMessageConversationsUseCase } from '../application/list-parent-message-conversations.use-case';
import { MarkParentConversationReadUseCase } from '../application/mark-parent-conversation-read.use-case';
import {
  CreateParentMessageConversationUseCase,
  ListParentMessageContactsUseCase,
} from '../application/parent-message-contacts.use-cases';
import { SendParentConversationMessageUseCase } from '../application/send-parent-conversation-message.use-case';
import {
  CreateParentMessageConversationDto,
  ListParentConversationMessagesQueryDto,
  ListParentMessageContactsQueryDto,
  ListParentMessageConversationsQueryDto,
  ParentConversationMessageResponseDto,
  ParentConversationMessagesResponseDto,
  ParentConversationReadResponseDto,
  ParentMessageInfoResponseDto,
  ParentMessageContactsResponseDto,
  ParentMessageConversationResponseDto,
  ParentMessageConversationsResponseDto,
  ParentMessageReadersQueryDto,
  ParentMessageReadersResponseDto,
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
    private readonly getParentMessageReadersUseCase: GetParentMessageReadersUseCase,
    private readonly getParentMessageInfoUseCase: GetParentMessageInfoUseCase,
    private readonly getParentMessageAttachmentDownloadUrlUseCase: GetParentMessageAttachmentDownloadUrlUseCase,
    private readonly listParentMessageContactsUseCase: ListParentMessageContactsUseCase,
    private readonly createParentMessageConversationUseCase: CreateParentMessageConversationUseCase,
  ) {}

  @Get('contacts')
  @ApiOkResponse({ type: ParentMessageContactsResponseDto })
  listContacts(
    @Query() query: ListParentMessageContactsQueryDto,
  ): Promise<ParentMessageContactsResponseDto> {
    return this.listParentMessageContactsUseCase.execute(query);
  }

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

  @Get('conversations/:conversationId/messages/:messageId/readers')
  @ApiOkResponse({ type: ParentMessageReadersResponseDto })
  getMessageReaders(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Param('messageId', new ParseUUIDPipe()) messageId: string,
    @Query() query: ParentMessageReadersQueryDto,
  ): Promise<ParentMessageReadersResponseDto> {
    return this.getParentMessageReadersUseCase.execute({
      conversationId,
      messageId,
      query,
    });
  }

  @Get('conversations/:conversationId/messages/:messageId/info')
  @ApiOkResponse({ type: ParentMessageInfoResponseDto })
  getMessageInfo(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Param('messageId', new ParseUUIDPipe()) messageId: string,
    @Query() query: ParentMessageReadersQueryDto,
  ): Promise<ParentMessageInfoResponseDto> {
    return this.getParentMessageInfoUseCase.execute({
      conversationId,
      messageId,
      query,
    });
  }

  @Get(
    'conversations/:conversationId/messages/:messageId/attachments/:attachmentId/download',
  )
  @Redirect(undefined, 307)
  @ApiTemporaryRedirectResponse({
    description:
      'Redirects to an authorized temporary attachment download URL.',
  })
  async downloadAttachment(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Param('messageId', new ParseUUIDPipe()) messageId: string,
    @Param('attachmentId', new ParseUUIDPipe()) attachmentId: string,
  ): Promise<{ url: string }> {
    return {
      url: await this.getParentMessageAttachmentDownloadUrlUseCase.execute({
        conversationId,
        messageId,
        attachmentId,
        mode: 'download',
      }),
    };
  }

  @Get(
    'conversations/:conversationId/messages/:messageId/attachments/:attachmentId/preview',
  )
  @Redirect(undefined, 307)
  @ApiTemporaryRedirectResponse({
    description: 'Redirects to an authorized temporary attachment preview URL.',
  })
  async previewAttachment(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Param('messageId', new ParseUUIDPipe()) messageId: string,
    @Param('attachmentId', new ParseUUIDPipe()) attachmentId: string,
  ): Promise<{ url: string }> {
    return {
      url: await this.getParentMessageAttachmentDownloadUrlUseCase.execute({
        conversationId,
        messageId,
        attachmentId,
        mode: 'preview',
      }),
    };
  }

  @Post('conversations')
  @ApiCreatedResponse({ type: ParentMessageConversationResponseDto })
  createConversation(
    @Body() body: CreateParentMessageConversationDto,
  ): Promise<ParentMessageConversationResponseDto> {
    return this.createParentMessageConversationUseCase.execute(body);
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
