import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { GetParentChildBehaviorRecordUseCase } from '../application/get-parent-child-behavior-record.use-case';
import { GetParentChildBehaviorSummaryUseCase } from '../application/get-parent-child-behavior-summary.use-case';
import { ListParentChildBehaviorUseCase } from '../application/list-parent-child-behavior.use-case';
import {
  ParentBehaviorListResponseDto,
  ParentBehaviorQueryDto,
  ParentBehaviorRecordResponseDto,
  ParentBehaviorSummaryResponseDto,
} from '../dto/parent-behavior.dto';

@ApiTags('parent-app')
@ApiBearerAuth()
@Controller('parent/children/:studentId/behavior')
export class ParentBehaviorController {
  constructor(
    private readonly listParentChildBehaviorUseCase: ListParentChildBehaviorUseCase,
    private readonly getParentChildBehaviorSummaryUseCase: GetParentChildBehaviorSummaryUseCase,
    private readonly getParentChildBehaviorRecordUseCase: GetParentChildBehaviorRecordUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: ParentBehaviorListResponseDto })
  listBehavior(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Query() query: ParentBehaviorQueryDto,
  ): Promise<ParentBehaviorListResponseDto> {
    return this.listParentChildBehaviorUseCase.execute(studentId, query);
  }

  @Get('summary')
  @ApiOkResponse({ type: ParentBehaviorSummaryResponseDto })
  getSummary(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Query() query: ParentBehaviorQueryDto,
  ): Promise<ParentBehaviorSummaryResponseDto> {
    return this.getParentChildBehaviorSummaryUseCase.execute(studentId, query);
  }

  @Get(':recordId')
  @ApiOkResponse({ type: ParentBehaviorRecordResponseDto })
  getRecord(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Param('recordId', new ParseUUIDPipe()) recordId: string,
  ): Promise<ParentBehaviorRecordResponseDto> {
    return this.getParentChildBehaviorRecordUseCase.execute(
      studentId,
      recordId,
    );
  }
}
