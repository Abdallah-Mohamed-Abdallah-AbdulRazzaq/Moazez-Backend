import { Controller, Get } from '@nestjs/common';
import type { ApplicationIdentity } from './bootstrap/application-metadata';
import { PublicRoute } from './common/decorators/public-route.decorator';
import { AppService } from './app.service';

@Controller()
@PublicRoute()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getIdentity(): ApplicationIdentity {
    return this.appService.getIdentity();
  }
}
