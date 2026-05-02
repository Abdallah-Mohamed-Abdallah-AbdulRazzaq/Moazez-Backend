import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../common/decorators/required-permissions.decorator';
import {
  DeleteCommunicationMessageAttachmentUseCase,
  LinkCommunicationMessageAttachmentUseCase,
  ListCommunicationMessageAttachmentsUseCase,
} from '../application/communication-message-attachment.use-cases';
import {
  DeleteCommunicationMessageReactionUseCase,
  ListCommunicationMessageReactionsUseCase,
  UpsertCommunicationMessageReactionUseCase,
} from '../application/communication-reaction.use-cases';
import { LinkCommunicationMessageAttachmentDto } from '../dto/communication-message-attachment.dto';
import { UpsertCommunicationReactionDto } from '../dto/communication-reaction.dto';

@ApiTags('communication')
@ApiBearerAuth()
@Controller('communication/messages/:messageId')
export class CommunicationMessageInteractionsController {
  constructor(
    private readonly listCommunicationMessageReactionsUseCase: ListCommunicationMessageReactionsUseCase,
    private readonly upsertCommunicationMessageReactionUseCase: UpsertCommunicationMessageReactionUseCase,
    private readonly deleteCommunicationMessageReactionUseCase: DeleteCommunicationMessageReactionUseCase,
    private readonly listCommunicationMessageAttachmentsUseCase: ListCommunicationMessageAttachmentsUseCase,
    private readonly linkCommunicationMessageAttachmentUseCase: LinkCommunicationMessageAttachmentUseCase,
    private readonly deleteCommunicationMessageAttachmentUseCase: DeleteCommunicationMessageAttachmentUseCase,
  ) {}

  @Get('reactions')
  @RequiredPermissions('communication.messages.view')
  listReactions(
    @Param('messageId', new ParseUUIDPipe()) messageId: string,
  ) {
    return this.listCommunicationMessageReactionsUseCase.execute(messageId);
  }

  @Put('reactions')
  @RequiredPermissions('communication.messages.react')
  upsertReaction(
    @Param('messageId', new ParseUUIDPipe()) messageId: string,
    @Body() dto: UpsertCommunicationReactionDto,
  ) {
    return this.upsertCommunicationMessageReactionUseCase.execute(
      messageId,
      dto,
    );
  }

  @Delete('reactions/me')
  @RequiredPermissions('communication.messages.react')
  deleteMyReaction(
    @Param('messageId', new ParseUUIDPipe()) messageId: string,
  ) {
    return this.deleteCommunicationMessageReactionUseCase.execute(messageId);
  }

  @Get('attachments')
  @RequiredPermissions('communication.messages.view')
  listAttachments(
    @Param('messageId', new ParseUUIDPipe()) messageId: string,
  ) {
    return this.listCommunicationMessageAttachmentsUseCase.execute(messageId);
  }

  @Post('attachments')
  @RequiredPermissions('communication.messages.attachments.manage')
  linkAttachment(
    @Param('messageId', new ParseUUIDPipe()) messageId: string,
    @Body() dto: LinkCommunicationMessageAttachmentDto,
  ) {
    return this.linkCommunicationMessageAttachmentUseCase.execute(
      messageId,
      dto,
    );
  }

  @Delete('attachments/:attachmentId')
  @RequiredPermissions('communication.messages.attachments.manage')
  deleteAttachment(
    @Param('messageId', new ParseUUIDPipe()) messageId: string,
    @Param('attachmentId', new ParseUUIDPipe()) attachmentId: string,
  ) {
    return this.deleteCommunicationMessageAttachmentUseCase.execute(
      messageId,
      attachmentId,
    );
  }
}
