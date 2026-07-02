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
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { GetTeacherMessageAttachmentDownloadUrlUseCase } from '../application/get-teacher-message-attachment-download-url.use-case';
import {
  GetTeacherMessageInfoUseCase,
  GetTeacherMessageReadersUseCase,
} from '../application/get-teacher-message-info.use-cases';
import { GetTeacherMessageConversationUseCase } from '../application/get-teacher-message-conversation.use-case';
import { ListTeacherConversationMessagesUseCase } from '../application/list-teacher-conversation-messages.use-case';
import { ListTeacherMessageConversationsUseCase } from '../application/list-teacher-message-conversations.use-case';
import { MarkTeacherConversationReadUseCase } from '../application/mark-teacher-conversation-read.use-case';
import { SearchTeacherConversationMessagesUseCase } from '../application/search-teacher-conversation-messages.use-case';
import { SendTeacherConversationMessageUseCase } from '../application/send-teacher-conversation-message.use-case';
import {
  CreateTeacherMessageConversationUseCase,
  ListTeacherMessageContactsUseCase,
} from '../application/teacher-message-contacts.use-cases';
import {
  CreateTeacherMessageConversationDto,
  ListTeacherConversationMessagesQueryDto,
  ListTeacherMessageContactsQueryDto,
  ListTeacherMessageConversationsQueryDto,
  SearchTeacherConversationMessagesQueryDto,
  SendTeacherConversationMessageDto,
  TeacherConversationMessageSearchResponseDto,
  TeacherConversationMessageResponseDto,
  TeacherConversationMessagesResponseDto,
  TeacherConversationReadResponseDto,
  TeacherMessageInfoParamsDto,
  TeacherMessageInfoResponseDto,
  TeacherMessageContactsResponseDto,
  TeacherMessageConversationParamsDto,
  TeacherMessageConversationResponseDto,
  TeacherMessageConversationsResponseDto,
  TeacherMessageReadersQueryDto,
  TeacherMessageReadersResponseDto,
} from '../dto/teacher-messages.dto';

@ApiTags('teacher-app')
@ApiBearerAuth()
@Controller('teacher/messages')
export class TeacherMessagesController {
  constructor(
    private readonly listTeacherMessageConversationsUseCase: ListTeacherMessageConversationsUseCase,
    private readonly getTeacherMessageConversationUseCase: GetTeacherMessageConversationUseCase,
    private readonly listTeacherConversationMessagesUseCase: ListTeacherConversationMessagesUseCase,
    private readonly searchTeacherConversationMessagesUseCase: SearchTeacherConversationMessagesUseCase,
    private readonly sendTeacherConversationMessageUseCase: SendTeacherConversationMessageUseCase,
    private readonly markTeacherConversationReadUseCase: MarkTeacherConversationReadUseCase,
    private readonly getTeacherMessageReadersUseCase: GetTeacherMessageReadersUseCase,
    private readonly getTeacherMessageInfoUseCase: GetTeacherMessageInfoUseCase,
    private readonly getTeacherMessageAttachmentDownloadUrlUseCase: GetTeacherMessageAttachmentDownloadUrlUseCase,
    private readonly listTeacherMessageContactsUseCase: ListTeacherMessageContactsUseCase,
    private readonly createTeacherMessageConversationUseCase: CreateTeacherMessageConversationUseCase,
  ) {}

  @Get('contacts')
  @RequiredPermissions('communication.contacts.view')
  @ApiOkResponse({ type: TeacherMessageContactsResponseDto })
  listContacts(
    @Query() query: ListTeacherMessageContactsQueryDto,
  ): Promise<TeacherMessageContactsResponseDto> {
    return this.listTeacherMessageContactsUseCase.execute(query);
  }

  @Get('conversations')
  @RequiredPermissions('communication.conversations.view')
  @ApiOkResponse({ type: TeacherMessageConversationsResponseDto })
  listConversations(
    @Query() query: ListTeacherMessageConversationsQueryDto,
  ): Promise<TeacherMessageConversationsResponseDto> {
    return this.listTeacherMessageConversationsUseCase.execute(query);
  }

  @Get('conversations/:conversationId')
  @RequiredPermissions('communication.conversations.view')
  @ApiOkResponse({ type: TeacherMessageConversationResponseDto })
  getConversation(
    @Param() params: TeacherMessageConversationParamsDto,
  ): Promise<TeacherMessageConversationResponseDto> {
    return this.getTeacherMessageConversationUseCase.execute(
      params.conversationId,
    );
  }

  @Get('conversations/:conversationId/search')
  @RequiredPermissions('communication.messages.view')
  @ApiOkResponse({ type: TeacherConversationMessageSearchResponseDto })
  searchMessages(
    @Param() params: TeacherMessageConversationParamsDto,
    @Query() query: SearchTeacherConversationMessagesQueryDto,
  ): Promise<TeacherConversationMessageSearchResponseDto> {
    return this.searchTeacherConversationMessagesUseCase.execute(
      params.conversationId,
      query,
    );
  }

  @Get('conversations/:conversationId/messages')
  @RequiredPermissions('communication.messages.view')
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

  @Get('conversations/:conversationId/messages/:messageId/readers')
  @RequiredPermissions('communication.messages.view')
  @ApiOkResponse({ type: TeacherMessageReadersResponseDto })
  getMessageReaders(
    @Param() params: TeacherMessageInfoParamsDto,
    @Query() query: TeacherMessageReadersQueryDto,
  ): Promise<TeacherMessageReadersResponseDto> {
    return this.getTeacherMessageReadersUseCase.execute({
      conversationId: params.conversationId,
      messageId: params.messageId,
      query,
    });
  }

  @Get('conversations/:conversationId/messages/:messageId/info')
  @RequiredPermissions('communication.messages.view')
  @ApiOkResponse({ type: TeacherMessageInfoResponseDto })
  getMessageInfo(
    @Param() params: TeacherMessageInfoParamsDto,
    @Query() query: TeacherMessageReadersQueryDto,
  ): Promise<TeacherMessageInfoResponseDto> {
    return this.getTeacherMessageInfoUseCase.execute({
      conversationId: params.conversationId,
      messageId: params.messageId,
      query,
    });
  }

  @Get(
    'conversations/:conversationId/messages/:messageId/attachments/:attachmentId/download',
  )
  @RequiredPermissions('communication.messages.view')
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
      url: await this.getTeacherMessageAttachmentDownloadUrlUseCase.execute({
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
  @RequiredPermissions('communication.messages.view')
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
      url: await this.getTeacherMessageAttachmentDownloadUrlUseCase.execute({
        conversationId,
        messageId,
        attachmentId,
        mode: 'preview',
      }),
    };
  }

  @Post('conversations')
  @ApiCreatedResponse({ type: TeacherMessageConversationResponseDto })
  createConversation(
    @Body() dto: CreateTeacherMessageConversationDto,
  ): Promise<TeacherMessageConversationResponseDto> {
    return this.createTeacherMessageConversationUseCase.execute(dto);
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
