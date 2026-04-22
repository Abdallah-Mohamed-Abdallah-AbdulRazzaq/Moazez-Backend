import {
  Body,
  Controller,
  Delete,
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
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { DeleteAttachmentUseCase } from '../application/delete-attachment.use-case';
import { ListAttachmentsUseCase } from '../application/list-attachments.use-case';
import { LinkAttachmentUseCase } from '../application/link-attachment.use-case';
import {
  AttachmentResponseDto,
  CreateAttachmentDto,
  DeleteAttachmentResponseDto,
  ListAttachmentsQueryDto,
} from '../dto/link-attachment.dto';

@ApiTags('files-attachments')
@ApiBearerAuth()
@Controller('files/attachments')
export class AttachmentsController {
  constructor(
    private readonly linkAttachmentUseCase: LinkAttachmentUseCase,
    private readonly listAttachmentsUseCase: ListAttachmentsUseCase,
    private readonly deleteAttachmentUseCase: DeleteAttachmentUseCase,
  ) {}

  @Post()
  @ApiCreatedResponse({ type: AttachmentResponseDto })
  @RequiredPermissions('admissions.applications.manage')
  linkAttachment(
    @Body() dto: CreateAttachmentDto,
  ): Promise<AttachmentResponseDto> {
    return this.linkAttachmentUseCase.execute(dto);
  }

  @Get()
  @ApiOkResponse({ type: AttachmentResponseDto, isArray: true })
  @RequiredPermissions('admissions.applications.view')
  listAttachments(
    @Query() query: ListAttachmentsQueryDto,
  ): Promise<AttachmentResponseDto[]> {
    return this.listAttachmentsUseCase.execute(query);
  }

  @Delete(':id')
  @ApiOkResponse({ type: DeleteAttachmentResponseDto })
  @RequiredPermissions('admissions.applications.manage')
  deleteAttachment(
    @Param('id', new ParseUUIDPipe()) attachmentId: string,
  ): Promise<DeleteAttachmentResponseDto> {
    return this.deleteAttachmentUseCase.execute(attachmentId);
  }
}
