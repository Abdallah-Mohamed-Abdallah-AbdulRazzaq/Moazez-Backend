import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { GetOverviewUseCase } from '../application/get-overview.use-case';
import { OverviewResponseDto } from '../dto/overview-response.dto';

@ApiTags('settings-overview')
@ApiBearerAuth()
@Controller('settings/overview')
export class OverviewController {
  constructor(private readonly getOverviewUseCase: GetOverviewUseCase) {}

  @Get()
  @RequiredPermissions('settings.overview.view')
  getOverview(): Promise<OverviewResponseDto> {
    return this.getOverviewUseCase.execute();
  }
}
