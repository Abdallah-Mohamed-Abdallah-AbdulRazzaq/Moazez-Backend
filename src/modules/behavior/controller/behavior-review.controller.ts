import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../common/decorators/required-permissions.decorator';
import {
  ApproveBehaviorRecordUseCase,
  GetBehaviorReviewQueueItemUseCase,
  ListBehaviorReviewQueueUseCase,
  RejectBehaviorRecordUseCase,
} from '../application/behavior-review.use-cases';
import {
  ApproveBehaviorRecordDto,
  ListBehaviorReviewQueueQueryDto,
  RejectBehaviorRecordDto,
} from '../dto/behavior-review.dto';

@ApiTags('behavior')
@ApiBearerAuth()
@Controller('behavior')
export class BehaviorReviewController {
  constructor(
    private readonly listBehaviorReviewQueueUseCase: ListBehaviorReviewQueueUseCase,
    private readonly getBehaviorReviewQueueItemUseCase: GetBehaviorReviewQueueItemUseCase,
    private readonly approveBehaviorRecordUseCase: ApproveBehaviorRecordUseCase,
    private readonly rejectBehaviorRecordUseCase: RejectBehaviorRecordUseCase,
  ) {}

  @Get('review-queue')
  @RequiredPermissions('behavior.records.view')
  listReviewQueue(@Query() query: ListBehaviorReviewQueueQueryDto) {
    return this.listBehaviorReviewQueueUseCase.execute(query);
  }

  @Get('review-queue/:recordId')
  @RequiredPermissions('behavior.records.view')
  getReviewQueueItem(@Param('recordId', new ParseUUIDPipe()) recordId: string) {
    return this.getBehaviorReviewQueueItemUseCase.execute(recordId);
  }

  @Post('records/:recordId/approve')
  @RequiredPermissions('behavior.records.review')
  approveRecord(
    @Param('recordId', new ParseUUIDPipe()) recordId: string,
    @Body() dto: ApproveBehaviorRecordDto,
  ) {
    return this.approveBehaviorRecordUseCase.execute(recordId, dto);
  }

  @Post('records/:recordId/reject')
  @RequiredPermissions('behavior.records.review')
  rejectRecord(
    @Param('recordId', new ParseUUIDPipe()) recordId: string,
    @Body() dto: RejectBehaviorRecordDto,
  ) {
    return this.rejectBehaviorRecordUseCase.execute(recordId, dto);
  }
}
