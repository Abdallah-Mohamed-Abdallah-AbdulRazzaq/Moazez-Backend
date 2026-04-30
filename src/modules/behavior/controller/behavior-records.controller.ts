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
  CancelBehaviorRecordUseCase,
  CreateBehaviorRecordUseCase,
  GetBehaviorRecordUseCase,
  ListBehaviorRecordsUseCase,
  SubmitBehaviorRecordUseCase,
  UpdateBehaviorRecordUseCase,
} from '../application/behavior-records.use-cases';
import {
  CancelBehaviorRecordDto,
  CreateBehaviorRecordDto,
  ListBehaviorRecordsQueryDto,
  UpdateBehaviorRecordDto,
} from '../dto/behavior-records.dto';

@ApiTags('behavior')
@ApiBearerAuth()
@Controller('behavior')
export class BehaviorRecordsController {
  constructor(
    private readonly listBehaviorRecordsUseCase: ListBehaviorRecordsUseCase,
    private readonly getBehaviorRecordUseCase: GetBehaviorRecordUseCase,
    private readonly createBehaviorRecordUseCase: CreateBehaviorRecordUseCase,
    private readonly updateBehaviorRecordUseCase: UpdateBehaviorRecordUseCase,
    private readonly submitBehaviorRecordUseCase: SubmitBehaviorRecordUseCase,
    private readonly cancelBehaviorRecordUseCase: CancelBehaviorRecordUseCase,
  ) {}

  @Get('records')
  @RequiredPermissions('behavior.records.view')
  listRecords(@Query() query: ListBehaviorRecordsQueryDto) {
    return this.listBehaviorRecordsUseCase.execute(query);
  }

  @Get('records/:recordId')
  @RequiredPermissions('behavior.records.view')
  getRecord(@Param('recordId', new ParseUUIDPipe()) recordId: string) {
    return this.getBehaviorRecordUseCase.execute(recordId);
  }

  @Post('records')
  @RequiredPermissions('behavior.records.create')
  createRecord(@Body() dto: CreateBehaviorRecordDto) {
    return this.createBehaviorRecordUseCase.execute(dto);
  }

  @Patch('records/:recordId')
  @RequiredPermissions('behavior.records.manage')
  updateRecord(
    @Param('recordId', new ParseUUIDPipe()) recordId: string,
    @Body() dto: UpdateBehaviorRecordDto,
  ) {
    return this.updateBehaviorRecordUseCase.execute(recordId, dto);
  }

  @Post('records/:recordId/submit')
  @RequiredPermissions('behavior.records.create')
  submitRecord(@Param('recordId', new ParseUUIDPipe()) recordId: string) {
    return this.submitBehaviorRecordUseCase.execute(recordId);
  }

  @Post('records/:recordId/cancel')
  @RequiredPermissions('behavior.records.manage')
  cancelRecord(
    @Param('recordId', new ParseUUIDPipe()) recordId: string,
    @Body() dto: CancelBehaviorRecordDto,
  ) {
    return this.cancelBehaviorRecordUseCase.execute(recordId, dto);
  }
}
