import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { GetParentChildReportsSummaryUseCase } from '../application/get-parent-child-reports-summary.use-case';
import { ListParentChildReportsUseCase } from '../application/list-parent-child-reports.use-case';
import {
  ParentReportsListResponseDto,
  ParentReportsSummaryResponseDto,
} from '../dto/parent-reports.dto';

@ApiTags('parent-app')
@ApiBearerAuth()
@Controller('parent/children/:studentId/reports')
export class ParentReportsController {
  constructor(
    private readonly listParentChildReportsUseCase: ListParentChildReportsUseCase,
    private readonly getParentChildReportsSummaryUseCase: GetParentChildReportsSummaryUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: ParentReportsListResponseDto })
  listReports(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
  ): Promise<ParentReportsListResponseDto> {
    return this.listParentChildReportsUseCase.execute(studentId);
  }

  @Get('summary')
  @ApiOkResponse({ type: ParentReportsSummaryResponseDto })
  getSummary(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
  ): Promise<ParentReportsSummaryResponseDto> {
    return this.getParentChildReportsSummaryUseCase.execute(studentId);
  }
}
