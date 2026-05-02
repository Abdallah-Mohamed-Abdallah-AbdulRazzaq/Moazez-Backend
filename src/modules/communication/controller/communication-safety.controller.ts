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
  CreateCommunicationUserBlockUseCase,
  DeleteCommunicationUserBlockUseCase,
  ListCommunicationUserBlocksUseCase,
} from '../application/communication-block.use-cases';
import {
  CreateCommunicationModerationActionUseCase,
  ListCommunicationModerationActionsUseCase,
} from '../application/communication-moderation.use-cases';
import {
  CreateCommunicationMessageReportUseCase,
  GetCommunicationMessageReportUseCase,
  ListCommunicationMessageReportsUseCase,
  UpdateCommunicationMessageReportUseCase,
} from '../application/communication-report.use-cases';
import {
  CreateCommunicationUserRestrictionUseCase,
  ListCommunicationUserRestrictionsUseCase,
  RevokeCommunicationUserRestrictionUseCase,
  UpdateCommunicationUserRestrictionUseCase,
} from '../application/communication-restriction.use-cases';
import { CreateCommunicationUserBlockDto } from '../dto/communication-block.dto';
import { CreateCommunicationModerationActionDto } from '../dto/communication-moderation.dto';
import {
  CreateCommunicationMessageReportDto,
  ListCommunicationMessageReportsQueryDto,
  UpdateCommunicationMessageReportDto,
} from '../dto/communication-report.dto';
import {
  CreateCommunicationUserRestrictionDto,
  ListCommunicationUserRestrictionsQueryDto,
  UpdateCommunicationUserRestrictionDto,
} from '../dto/communication-restriction.dto';

@ApiTags('communication')
@ApiBearerAuth()
@Controller('communication')
export class CommunicationSafetyController {
  constructor(
    private readonly createCommunicationMessageReportUseCase: CreateCommunicationMessageReportUseCase,
    private readonly listCommunicationMessageReportsUseCase: ListCommunicationMessageReportsUseCase,
    private readonly getCommunicationMessageReportUseCase: GetCommunicationMessageReportUseCase,
    private readonly updateCommunicationMessageReportUseCase: UpdateCommunicationMessageReportUseCase,
    private readonly listCommunicationModerationActionsUseCase: ListCommunicationModerationActionsUseCase,
    private readonly createCommunicationModerationActionUseCase: CreateCommunicationModerationActionUseCase,
    private readonly listCommunicationUserBlocksUseCase: ListCommunicationUserBlocksUseCase,
    private readonly createCommunicationUserBlockUseCase: CreateCommunicationUserBlockUseCase,
    private readonly deleteCommunicationUserBlockUseCase: DeleteCommunicationUserBlockUseCase,
    private readonly listCommunicationUserRestrictionsUseCase: ListCommunicationUserRestrictionsUseCase,
    private readonly createCommunicationUserRestrictionUseCase: CreateCommunicationUserRestrictionUseCase,
    private readonly updateCommunicationUserRestrictionUseCase: UpdateCommunicationUserRestrictionUseCase,
    private readonly revokeCommunicationUserRestrictionUseCase: RevokeCommunicationUserRestrictionUseCase,
  ) {}

  @Post('messages/:messageId/reports')
  @RequiredPermissions('communication.messages.report')
  createMessageReport(
    @Param('messageId', new ParseUUIDPipe()) messageId: string,
    @Body() dto: CreateCommunicationMessageReportDto,
  ) {
    return this.createCommunicationMessageReportUseCase.execute(
      messageId,
      dto,
    );
  }

  @Get('message-reports')
  @RequiredPermissions('communication.messages.moderate')
  listMessageReports(
    @Query() query: ListCommunicationMessageReportsQueryDto,
  ) {
    return this.listCommunicationMessageReportsUseCase.execute(query);
  }

  @Get('message-reports/:reportId')
  @RequiredPermissions('communication.messages.moderate')
  getMessageReport(
    @Param('reportId', new ParseUUIDPipe()) reportId: string,
  ) {
    return this.getCommunicationMessageReportUseCase.execute(reportId);
  }

  @Patch('message-reports/:reportId')
  @RequiredPermissions('communication.messages.moderate')
  updateMessageReport(
    @Param('reportId', new ParseUUIDPipe()) reportId: string,
    @Body() dto: UpdateCommunicationMessageReportDto,
  ) {
    return this.updateCommunicationMessageReportUseCase.execute(
      reportId,
      dto,
    );
  }

  @Get('messages/:messageId/moderation-actions')
  @RequiredPermissions('communication.messages.moderate')
  listModerationActions(
    @Param('messageId', new ParseUUIDPipe()) messageId: string,
  ) {
    return this.listCommunicationModerationActionsUseCase.execute(messageId);
  }

  @Post('messages/:messageId/moderation-actions')
  @RequiredPermissions('communication.messages.moderate')
  createModerationAction(
    @Param('messageId', new ParseUUIDPipe()) messageId: string,
    @Body() dto: CreateCommunicationModerationActionDto,
  ) {
    return this.createCommunicationModerationActionUseCase.execute(
      messageId,
      dto,
    );
  }

  @Get('blocks')
  @RequiredPermissions('communication.conversations.view')
  listBlocks() {
    return this.listCommunicationUserBlocksUseCase.execute();
  }

  @Post('blocks')
  @RequiredPermissions('communication.conversations.view')
  createBlock(@Body() dto: CreateCommunicationUserBlockDto) {
    return this.createCommunicationUserBlockUseCase.execute(dto);
  }

  @Delete('blocks/:blockId')
  @RequiredPermissions('communication.conversations.view')
  deleteBlock(@Param('blockId', new ParseUUIDPipe()) blockId: string) {
    return this.deleteCommunicationUserBlockUseCase.execute(blockId);
  }

  @Get('restrictions')
  @RequiredPermissions('communication.messages.moderate')
  listRestrictions(
    @Query() query: ListCommunicationUserRestrictionsQueryDto,
  ) {
    return this.listCommunicationUserRestrictionsUseCase.execute(query);
  }

  @Post('restrictions')
  @RequiredPermissions('communication.messages.moderate')
  createRestriction(@Body() dto: CreateCommunicationUserRestrictionDto) {
    return this.createCommunicationUserRestrictionUseCase.execute(dto);
  }

  @Patch('restrictions/:restrictionId')
  @RequiredPermissions('communication.messages.moderate')
  updateRestriction(
    @Param('restrictionId', new ParseUUIDPipe()) restrictionId: string,
    @Body() dto: UpdateCommunicationUserRestrictionDto,
  ) {
    return this.updateCommunicationUserRestrictionUseCase.execute(
      restrictionId,
      dto,
    );
  }

  @Delete('restrictions/:restrictionId')
  @RequiredPermissions('communication.messages.moderate')
  revokeRestriction(
    @Param('restrictionId', new ParseUUIDPipe()) restrictionId: string,
  ) {
    return this.revokeCommunicationUserRestrictionUseCase.execute(
      restrictionId,
    );
  }
}
