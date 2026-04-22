import { Controller, Get } from '@nestjs/common';
import { PublicRoute } from './common/decorators/public-route.decorator';
import { AppService } from './app.service';

@Controller()
@PublicRoute()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
