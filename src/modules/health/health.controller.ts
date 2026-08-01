import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublicRoute } from '../../common/decorators/public-route.decorator';
import { HealthService } from './health.service';
import type { PublicHealthReport } from './health.service';

@ApiTags('health')
@Controller('health')
@PublicRoute()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Public compatibility health status' })
  @ApiOkResponse({ description: 'Minimal public health status' })
  check(): PublicHealthReport {
    return this.healthService.check();
  }
}
