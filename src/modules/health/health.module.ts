import { Module } from '@nestjs/common';
import { QueueModule } from '../../infrastructure/queue/queue.module';
import { RealtimeModule } from '../../infrastructure/realtime/realtime.module';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import { UploadsModule } from '../files/uploads/uploads.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import {
  createOperationalRoleManifests,
  OPERATIONAL_ROLE_MANIFESTS,
} from './operational-probe.manifests';
import { OperationalProbeService } from './operational-probe.service';
import { TemporaryDiskProbe } from './temporary-disk.probe';

@Module({
  imports: [QueueModule, RealtimeModule, StorageModule, UploadsModule],
  controllers: [HealthController],
  providers: [
    HealthService,
    OperationalProbeService,
    TemporaryDiskProbe,
    {
      provide: OPERATIONAL_ROLE_MANIFESTS,
      useValue: createOperationalRoleManifests(),
    },
  ],
  exports: [OperationalProbeService],
})
export class HealthModule {}
