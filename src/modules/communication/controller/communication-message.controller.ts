import {
  Body,
  Controller,
  Delete,
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
  CreateCommunicationMessageUseCase,
  DeleteCommunicationMessageUseCase,
  GetCommunicationMessageUseCase,
  GetCommunicationReadSummaryUseCase,
  ListCommunicationMessagesUseCase,
  MarkCommunicationConversationReadUseCase,
  MarkCommunicationMessageReadUseCase,
  UpdateCommunicationMessageUseCase,
} from '../application/communication-message.use-cases';
import {
  CreateCommunicationMessageDto,
  ListCommunicationMessagesQueryDto,
  MarkConversationReadDto,
  ReadSummaryQueryDto,
  UpdateCommunicationMessageDto,
} from '../dto/communication-message.dto';

@ApiTags('communication')
@ApiBearerAuth()
@Controller('communication')
export class CommunicationMessageController {
  constructor(
    private readonly listCommunicationMessagesUseCase: ListCommunicationMessagesUseCase,
    private readonly createCommunicationMessageUseCase: CreateCommunicationMessageUseCase,
    private readonly getCommunicationMessageUseCase: GetCommunicationMessageUseCase,
    private readonly updateCommunicationMessageUseCase: UpdateCommunicationMessageUseCase,
    private readonly deleteCommunicationMessageUseCase: DeleteCommunicationMessageUseCase,
    private readonly markCommunicationMessageReadUseCase: MarkCommunicationMessageReadUseCase,
    private readonly markCommunicationConversationReadUseCase: MarkCommunicationConversationReadUseCase,
    private readonly getCommunicationReadSummaryUseCase: GetCommunicationReadSummaryUseCase,
  ) {}

  @Get('conversations/:conversationId/messages')
  @RequiredPermissions('communication.messages.view')
  listMessages(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Query() query: ListCommunicationMessagesQueryDto,
  ) {
    return this.listCommunicationMessagesUseCase.execute(
      conversationId,
      query,
    );
  }

  @Post('conversations/:conversationId/messages')
  @RequiredPermissions('communication.messages.send')
  createMessage(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Body() dto: CreateCommunicationMessageDto,
  ) {
    return this.createCommunicationMessageUseCase.execute(
      conversationId,
      dto,
    );
  }

  @Post('conversations/:conversationId/read')
  @RequiredPermissions('communication.messages.view')
  markConversationRead(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Body() dto: MarkConversationReadDto,
  ) {
    return this.markCommunicationConversationReadUseCase.execute(
      conversationId,
      dto,
    );
  }

  @Get('conversations/:conversationId/read-summary')
  @RequiredPermissions('communication.messages.view')
  getReadSummary(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Query() query: ReadSummaryQueryDto,
  ) {
    return this.getCommunicationReadSummaryUseCase.execute(
      conversationId,
      query,
    );
  }

  @Get('messages/:messageId')
  @RequiredPermissions('communication.messages.view')
  getMessage(@Param('messageId', new ParseUUIDPipe()) messageId: string) {
    return this.getCommunicationMessageUseCase.execute(messageId);
  }

  @Patch('messages/:messageId')
  @RequiredPermissions('communication.messages.edit')
  updateMessage(
    @Param('messageId', new ParseUUIDPipe()) messageId: string,
    @Body() dto: UpdateCommunicationMessageDto,
  ) {
    return this.updateCommunicationMessageUseCase.execute(messageId, dto);
  }

  @Delete('messages/:messageId')
  @RequiredPermissions('communication.messages.delete')
  deleteMessage(@Param('messageId', new ParseUUIDPipe()) messageId: string) {
    return this.deleteCommunicationMessageUseCase.execute(messageId);
  }

  @Post('messages/:messageId/read')
  @RequiredPermissions('communication.messages.view')
  markMessageRead(
    @Param('messageId', new ParseUUIDPipe()) messageId: string,
  ) {
    return this.markCommunicationMessageReadUseCase.execute(messageId);
  }
}
