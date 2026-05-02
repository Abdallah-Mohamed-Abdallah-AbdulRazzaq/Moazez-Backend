import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../common/decorators/required-permissions.decorator';
import {
  ArchiveCommunicationConversationUseCase,
  CloseCommunicationConversationUseCase,
  CreateCommunicationConversationUseCase,
  GetCommunicationConversationUseCase,
  ListCommunicationConversationsUseCase,
  ReopenCommunicationConversationUseCase,
  UpdateCommunicationConversationUseCase,
} from '../application/communication-conversation.use-cases';
import {
  CreateCommunicationConversationDto,
  ListCommunicationConversationsQueryDto,
  UpdateCommunicationConversationDto,
} from '../dto/communication-conversation.dto';

@ApiTags('communication')
@ApiBearerAuth()
@Controller('communication/conversations')
export class CommunicationConversationController {
  constructor(
    private readonly listCommunicationConversationsUseCase: ListCommunicationConversationsUseCase,
    private readonly createCommunicationConversationUseCase: CreateCommunicationConversationUseCase,
    private readonly getCommunicationConversationUseCase: GetCommunicationConversationUseCase,
    private readonly updateCommunicationConversationUseCase: UpdateCommunicationConversationUseCase,
    private readonly archiveCommunicationConversationUseCase: ArchiveCommunicationConversationUseCase,
    private readonly closeCommunicationConversationUseCase: CloseCommunicationConversationUseCase,
    private readonly reopenCommunicationConversationUseCase: ReopenCommunicationConversationUseCase,
  ) {}

  @Get()
  @RequiredPermissions('communication.conversations.view')
  listConversations(@Query() query: ListCommunicationConversationsQueryDto) {
    return this.listCommunicationConversationsUseCase.execute(query);
  }

  @Post()
  @RequiredPermissions('communication.conversations.create')
  createConversation(@Body() dto: CreateCommunicationConversationDto) {
    return this.createCommunicationConversationUseCase.execute(dto);
  }

  @Get(':conversationId')
  @RequiredPermissions('communication.conversations.view')
  getConversation(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
  ) {
    return this.getCommunicationConversationUseCase.execute(conversationId);
  }

  @Patch(':conversationId')
  @RequiredPermissions('communication.conversations.manage')
  updateConversation(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Body() dto: UpdateCommunicationConversationDto,
  ) {
    return this.updateCommunicationConversationUseCase.execute(
      conversationId,
      dto,
    );
  }

  @Post(':conversationId/archive')
  @RequiredPermissions('communication.conversations.manage')
  archiveConversation(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
  ) {
    return this.archiveCommunicationConversationUseCase.execute(conversationId);
  }

  @Post(':conversationId/close')
  @RequiredPermissions('communication.conversations.manage')
  closeConversation(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
  ) {
    return this.closeCommunicationConversationUseCase.execute(conversationId);
  }

  @Post(':conversationId/reopen')
  @RequiredPermissions('communication.conversations.manage')
  reopenConversation(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
  ) {
    return this.reopenCommunicationConversationUseCase.execute(conversationId);
  }
}
