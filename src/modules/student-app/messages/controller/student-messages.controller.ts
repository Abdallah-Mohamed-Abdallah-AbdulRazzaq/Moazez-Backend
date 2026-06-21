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
import { GetStudentMessageAttachmentDownloadUrlUseCase } from '../application/get-student-message-attachment-download-url.use-case';
import {
  GetStudentMessageInfoUseCase,
  GetStudentMessageReadersUseCase,
} from '../application/get-student-message-info.use-cases';
import { GetStudentMessageConversationUseCase } from '../application/get-student-message-conversation.use-case';
import { ListStudentConversationMessagesUseCase } from '../application/list-student-conversation-messages.use-case';
import { ListStudentMessageConversationsUseCase } from '../application/list-student-message-conversations.use-case';
import { MarkStudentConversationReadUseCase } from '../application/mark-student-conversation-read.use-case';
import { SearchStudentConversationMessagesUseCase } from '../application/search-student-conversation-messages.use-case';
import { SendStudentConversationMessageUseCase } from '../application/send-student-conversation-message.use-case';
import {
  CreateStudentMessageConversationUseCase,
  ListStudentMessageContactsUseCase,
} from '../application/student-message-contacts.use-cases';
import {
  CreateStudentMessageConversationDto,
  ListStudentConversationMessagesQueryDto,
  ListStudentMessageContactsQueryDto,
  ListStudentMessageConversationsQueryDto,
  SearchStudentConversationMessagesQueryDto,
  SendStudentConversationMessageDto,
  StudentConversationMessageSearchResponseDto,
  StudentConversationMessageResponseDto,
  StudentConversationMessagesResponseDto,
  StudentConversationReadResponseDto,
  StudentMessageInfoResponseDto,
  StudentMessageContactsResponseDto,
  StudentMessageConversationResponseDto,
  StudentMessageConversationsResponseDto,
  StudentMessageReadersQueryDto,
  StudentMessageReadersResponseDto,
} from '../dto/student-messages.dto';

@ApiTags('student-app')
@ApiBearerAuth()
@Controller('student/messages')
export class StudentMessagesController {
  constructor(
    private readonly listStudentMessageConversationsUseCase: ListStudentMessageConversationsUseCase,
    private readonly getStudentMessageConversationUseCase: GetStudentMessageConversationUseCase,
    private readonly listStudentConversationMessagesUseCase: ListStudentConversationMessagesUseCase,
    private readonly searchStudentConversationMessagesUseCase: SearchStudentConversationMessagesUseCase,
    private readonly sendStudentConversationMessageUseCase: SendStudentConversationMessageUseCase,
    private readonly markStudentConversationReadUseCase: MarkStudentConversationReadUseCase,
    private readonly getStudentMessageReadersUseCase: GetStudentMessageReadersUseCase,
    private readonly getStudentMessageInfoUseCase: GetStudentMessageInfoUseCase,
    private readonly getStudentMessageAttachmentDownloadUrlUseCase: GetStudentMessageAttachmentDownloadUrlUseCase,
    private readonly listStudentMessageContactsUseCase: ListStudentMessageContactsUseCase,
    private readonly createStudentMessageConversationUseCase: CreateStudentMessageConversationUseCase,
  ) {}

  @Get('contacts')
  @ApiOkResponse({ type: StudentMessageContactsResponseDto })
  listContacts(
    @Query() query: ListStudentMessageContactsQueryDto,
  ): Promise<StudentMessageContactsResponseDto> {
    return this.listStudentMessageContactsUseCase.execute(query);
  }

  @Get('conversations')
  @ApiOkResponse({ type: StudentMessageConversationsResponseDto })
  listConversations(
    @Query() query: ListStudentMessageConversationsQueryDto,
  ): Promise<StudentMessageConversationsResponseDto> {
    return this.listStudentMessageConversationsUseCase.execute(query);
  }

  @Get('conversations/:conversationId')
  @ApiOkResponse({ type: StudentMessageConversationResponseDto })
  getConversation(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
  ): Promise<StudentMessageConversationResponseDto> {
    return this.getStudentMessageConversationUseCase.execute(conversationId);
  }

  @Get('conversations/:conversationId/search')
  @ApiOkResponse({ type: StudentConversationMessageSearchResponseDto })
  searchMessages(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Query() query: SearchStudentConversationMessagesQueryDto,
  ): Promise<StudentConversationMessageSearchResponseDto> {
    return this.searchStudentConversationMessagesUseCase.execute({
      conversationId,
      query,
    });
  }

  @Get('conversations/:conversationId/messages')
  @ApiOkResponse({ type: StudentConversationMessagesResponseDto })
  listMessages(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Query() query: ListStudentConversationMessagesQueryDto,
  ): Promise<StudentConversationMessagesResponseDto> {
    return this.listStudentConversationMessagesUseCase.execute({
      conversationId,
      query,
    });
  }

  @Get('conversations/:conversationId/messages/:messageId/readers')
  @ApiOkResponse({ type: StudentMessageReadersResponseDto })
  getMessageReaders(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Param('messageId', new ParseUUIDPipe()) messageId: string,
    @Query() query: StudentMessageReadersQueryDto,
  ): Promise<StudentMessageReadersResponseDto> {
    return this.getStudentMessageReadersUseCase.execute({
      conversationId,
      messageId,
      query,
    });
  }

  @Get('conversations/:conversationId/messages/:messageId/info')
  @ApiOkResponse({ type: StudentMessageInfoResponseDto })
  getMessageInfo(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Param('messageId', new ParseUUIDPipe()) messageId: string,
    @Query() query: StudentMessageReadersQueryDto,
  ): Promise<StudentMessageInfoResponseDto> {
    return this.getStudentMessageInfoUseCase.execute({
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
      url: await this.getStudentMessageAttachmentDownloadUrlUseCase.execute({
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
      url: await this.getStudentMessageAttachmentDownloadUrlUseCase.execute({
        conversationId,
        messageId,
        attachmentId,
        mode: 'preview',
      }),
    };
  }

  @Post('conversations')
  @ApiCreatedResponse({ type: StudentMessageConversationResponseDto })
  createConversation(
    @Body() body: CreateStudentMessageConversationDto,
  ): Promise<StudentMessageConversationResponseDto> {
    return this.createStudentMessageConversationUseCase.execute(body);
  }

  @Post('conversations/:conversationId/messages')
  @ApiCreatedResponse({ type: StudentConversationMessageResponseDto })
  sendMessage(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Body() body: SendStudentConversationMessageDto,
  ): Promise<StudentConversationMessageResponseDto> {
    return this.sendStudentConversationMessageUseCase.execute({
      conversationId,
      body,
    });
  }

  @Post('conversations/:conversationId/read')
  @ApiCreatedResponse({ type: StudentConversationReadResponseDto })
  markRead(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
  ): Promise<StudentConversationReadResponseDto> {
    return this.markStudentConversationReadUseCase.execute(conversationId);
  }
}
