import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { GetAcademicsOverviewUseCase } from '../application/get-academics-overview.use-case';
import { AcademicsOverviewQueryDto } from '../dto/academics-overview-query.dto';
import { AcademicsOverviewResponseDto } from '../dto/academics-overview-response.dto';

@ApiTags('academics-overview')
@ApiBearerAuth()
@Controller('academics/overview')
export class AcademicsOverviewController {
  constructor(
    private readonly getAcademicsOverviewUseCase: GetAcademicsOverviewUseCase,
  ) {}

  @Get()
  @RequiredPermissions('academics.overview.view')
  @ApiOperation({ summary: 'Get academics overview readiness summary' })
  @ApiOkResponse({ type: AcademicsOverviewResponseDto })
  getOverview(
    @Query() query: AcademicsOverviewQueryDto,
  ): Promise<AcademicsOverviewResponseDto> {
    return this.getAcademicsOverviewUseCase.execute(query);
  }
}
