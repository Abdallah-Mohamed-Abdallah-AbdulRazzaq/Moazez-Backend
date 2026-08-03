import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { OperationalProbeModule } from './operational-probe.module';

@Module({
  imports: [OperationalProbeModule.forRole('api')],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
