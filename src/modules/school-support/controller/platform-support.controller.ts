import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PlatformScope } from '../../../common/decorators/platform-scope.decorator';
import { RequiredPermissions } from '../../../common/decorators/required-permissions.decorator';
import {
  ClosePlatformSupportConversationUseCase,
  GetPlatformSupportConversationUseCase,
  ListPlatformSupportConversationsUseCase,
  ListPlatformSupportMessagesUseCase,
  MarkPlatformSupportReadUseCase,
  ReopenPlatformSupportConversationUseCase,
  SendPlatformSupportMessageUseCase,
} from '../application/school-support.use-cases';
import {
  MarkPlatformSupportReadDto,
  PlatformSupportConversationResponseDto,
  PlatformSupportConversationsQueryDto,
  PlatformSupportConversationsResponseDto,
  PlatformSupportMessagesListResponseDto,
  PlatformSupportMessagesQueryDto,
  PlatformSupportReadResponseDto,
  PlatformSupportTransitionDto,
  PlatformSupportTransitionResponseDto,
  SendPlatformSupportMessageDto,
} from '../dto/platform-support.dto';
import { SchoolSupportMessageResponseDto } from '../dto/school-support.dto';

@ApiTags('platform-support')
@ApiBearerAuth()
@Controller('platform-admin/support')
@PlatformScope()
export class PlatformSupportController {
  constructor(
    private readonly listConversationsUseCase: ListPlatformSupportConversationsUseCase,
    private readonly getConversationUseCase: GetPlatformSupportConversationUseCase,
    private readonly listMessagesUseCase: ListPlatformSupportMessagesUseCase,
    private readonly sendMessageUseCase: SendPlatformSupportMessageUseCase,
    private readonly markReadUseCase: MarkPlatformSupportReadUseCase,
    private readonly closeConversationUseCase: ClosePlatformSupportConversationUseCase,
    private readonly reopenConversationUseCase: ReopenPlatformSupportConversationUseCase,
  ) {}

  @Get('conversations')
  @RequiredPermissions('platform.support.view')
  listConversations(
    @Query() query: PlatformSupportConversationsQueryDto,
  ): Promise<PlatformSupportConversationsResponseDto> {
    return this.listConversationsUseCase.execute(query);
  }

  @Get('conversations/:conversationId')
  @RequiredPermissions('platform.support.view')
  getConversation(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
  ): Promise<PlatformSupportConversationResponseDto> {
    return this.getConversationUseCase.execute(conversationId);
  }

  @Get('conversations/:conversationId/messages')
  @RequiredPermissions('platform.support.view')
  listMessages(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Query() query: PlatformSupportMessagesQueryDto,
  ): Promise<PlatformSupportMessagesListResponseDto> {
    return this.listMessagesUseCase.execute(conversationId, query);
  }

  @Post('conversations/:conversationId/messages')
  @RequiredPermissions('platform.support.reply')
  sendMessage(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Body() dto: SendPlatformSupportMessageDto,
  ): Promise<SchoolSupportMessageResponseDto> {
    return this.sendMessageUseCase.execute(conversationId, dto);
  }

  @Post('conversations/:conversationId/read')
  @HttpCode(HttpStatus.OK)
  @RequiredPermissions('platform.support.view')
  markRead(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Body() dto: MarkPlatformSupportReadDto,
  ): Promise<PlatformSupportReadResponseDto> {
    return this.markReadUseCase.execute(conversationId, dto);
  }

  @Post('conversations/:conversationId/close')
  @HttpCode(HttpStatus.OK)
  @RequiredPermissions('platform.support.manage')
  closeConversation(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Body() dto: PlatformSupportTransitionDto,
  ): Promise<PlatformSupportTransitionResponseDto> {
    return this.closeConversationUseCase.execute(conversationId, dto);
  }

  @Post('conversations/:conversationId/reopen')
  @HttpCode(HttpStatus.OK)
  @RequiredPermissions('platform.support.manage')
  reopenConversation(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Body() dto: PlatformSupportTransitionDto,
  ): Promise<PlatformSupportTransitionResponseDto> {
    return this.reopenConversationUseCase.execute(conversationId, dto);
  }
}
