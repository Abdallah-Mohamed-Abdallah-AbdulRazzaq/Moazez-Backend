import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublicRoute } from '../../common/decorators/public-route.decorator';
import { HealthService, HealthReport } from './health.service';

@ApiTags('health')
@Controller('health')
@PublicRoute()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Liveness and dependency readiness check' })
  @ApiOkResponse({ description: 'Liveness and dependency check report' })
  async check(): Promise<HealthReport> {
    return this.healthService.check();
  }
}
