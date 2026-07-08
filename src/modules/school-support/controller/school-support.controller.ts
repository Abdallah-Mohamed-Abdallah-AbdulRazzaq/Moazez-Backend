import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../common/decorators/required-permissions.decorator';
import {
  GetSchoolSupportConversationUseCase,
  ListSchoolSupportMessagesUseCase,
  MarkSchoolSupportReadUseCase,
  SendSchoolSupportMessageUseCase,
} from '../application/school-support.use-cases';
import {
  MarkSchoolSupportReadDto,
  SchoolSupportConversationResponseDto,
  SchoolSupportMessageResponseDto,
  SchoolSupportMessagesListResponseDto,
  SchoolSupportMessagesQueryDto,
  SchoolSupportReadResponseDto,
  SendSchoolSupportMessageDto,
} from '../dto/school-support.dto';

@ApiTags('school-support')
@ApiBearerAuth()
@Controller('school-support')
export class SchoolSupportController {
  constructor(
    private readonly getConversationUseCase: GetSchoolSupportConversationUseCase,
    private readonly listMessagesUseCase: ListSchoolSupportMessagesUseCase,
    private readonly sendMessageUseCase: SendSchoolSupportMessageUseCase,
    private readonly markReadUseCase: MarkSchoolSupportReadUseCase,
  ) {}

  @Get('conversation')
  @RequiredPermissions('school.support.view')
  getConversation(): Promise<SchoolSupportConversationResponseDto> {
    return this.getConversationUseCase.execute();
  }

  @Get('messages')
  @RequiredPermissions('school.support.view')
  listMessages(
    @Query() query: SchoolSupportMessagesQueryDto,
  ): Promise<SchoolSupportMessagesListResponseDto> {
    return this.listMessagesUseCase.execute(query);
  }

  @Post('messages')
  @RequiredPermissions('school.support.send')
  sendMessage(
    @Body() dto: SendSchoolSupportMessageDto,
  ): Promise<SchoolSupportMessageResponseDto> {
    return this.sendMessageUseCase.execute(dto);
  }

  @Post('read')
  @HttpCode(HttpStatus.OK)
  @RequiredPermissions('school.support.view')
  markRead(
    @Body() dto: MarkSchoolSupportReadDto,
  ): Promise<SchoolSupportReadResponseDto> {
    return this.markReadUseCase.execute(dto);
  }
}
