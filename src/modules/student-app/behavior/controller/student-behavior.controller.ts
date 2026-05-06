import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { GetStudentBehaviorRecordUseCase } from '../application/get-student-behavior-record.use-case';
import { GetStudentBehaviorSummaryUseCase } from '../application/get-student-behavior-summary.use-case';
import { ListStudentBehaviorRecordsUseCase } from '../application/list-student-behavior-records.use-case';
import {
  StudentBehaviorListResponseDto,
  StudentBehaviorQueryDto,
  StudentBehaviorRecordResponseDto,
  StudentBehaviorSummaryResponseDto,
} from '../dto/student-behavior.dto';

@ApiTags('student-app')
@ApiBearerAuth()
@Controller('student/behavior')
export class StudentBehaviorController {
  constructor(
    private readonly listStudentBehaviorRecordsUseCase: ListStudentBehaviorRecordsUseCase,
    private readonly getStudentBehaviorSummaryUseCase: GetStudentBehaviorSummaryUseCase,
    private readonly getStudentBehaviorRecordUseCase: GetStudentBehaviorRecordUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: StudentBehaviorListResponseDto })
  listBehaviorRecords(
    @Query() query: StudentBehaviorQueryDto,
  ): Promise<StudentBehaviorListResponseDto> {
    return this.listStudentBehaviorRecordsUseCase.execute(query);
  }

  @Get('summary')
  @ApiOkResponse({ type: StudentBehaviorSummaryResponseDto })
  getBehaviorSummary(
    @Query() query: StudentBehaviorQueryDto,
  ): Promise<StudentBehaviorSummaryResponseDto> {
    return this.getStudentBehaviorSummaryUseCase.execute(query);
  }

  @Get(':recordId')
  @ApiOkResponse({ type: StudentBehaviorRecordResponseDto })
  getBehaviorRecord(
    @Param('recordId', new ParseUUIDPipe()) recordId: string,
  ): Promise<StudentBehaviorRecordResponseDto> {
    return this.getStudentBehaviorRecordUseCase.execute(recordId);
  }
}
