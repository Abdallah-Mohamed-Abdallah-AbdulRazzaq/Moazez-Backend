import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ApplicationLifecycleModule } from '../../bootstrap/application-lifecycle.module';
import { QueueModule } from '../../infrastructure/queue/queue.module';
import { OperationalProbeModule } from '../../modules/health/operational-probe.module';
import { MaintenanceSchedulesModule } from './maintenance-schedules.module';
import { validateMaintenanceSchedulerEnv } from '../runtime-env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      ignoreEnvFile: true,
      validate: validateMaintenanceSchedulerEnv,
    }),
    ApplicationLifecycleModule,
    QueueModule,
    MaintenanceSchedulesModule,
    OperationalProbeModule.forRole('maintenance-scheduler'),
  ],
})
export class MaintenanceSchedulerRuntimeModule {}
