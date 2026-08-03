import { DynamicModule, Module, type Provider } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { FirebaseAdminModule } from '../../infrastructure/push/firebase/firebase-admin.module';
import { QueueModule } from '../../infrastructure/queue/queue.module';
import { RealtimeEmitterModule } from '../../infrastructure/realtime/realtime-emitter.module';
import { RealtimeModule } from '../../infrastructure/realtime/realtime.module';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import { RUNTIME_ROLE, type RuntimeRole } from '../../runtime/runtime-role';
import { UploadsModule } from '../files/uploads/uploads.module';
import {
  createOperationalRoleManifests,
  OPERATIONAL_ROLE_MANIFESTS,
} from './operational-probe.manifests';
import { OperationalProbeService } from './operational-probe.service';
import { TemporaryDiskProbe } from './temporary-disk.probe';

@Module({})
export class OperationalProbeModule {
  static forRole(role: RuntimeRole): DynamicModule {
    const imports = [QueueModule];
    const providers: Provider[] = [
      OperationalProbeService,
      { provide: RUNTIME_ROLE, useValue: role },
      {
        provide: OPERATIONAL_ROLE_MANIFESTS,
        useValue: createOperationalRoleManifests(),
      },
    ];

    if (role !== 'maintenance-scheduler') imports.push(PrismaModule);
    if (role === 'api') {
      imports.push(RealtimeModule, StorageModule, UploadsModule);
      providers.push(TemporaryDiskProbe);
    }
    if (role === 'core-worker') {
      imports.push(FirebaseAdminModule, RealtimeEmitterModule, StorageModule);
    }
    if (role === 'media-worker') imports.push(StorageModule);

    return {
      module: OperationalProbeModule,
      imports,
      providers,
      exports: [OperationalProbeService],
    };
  }
}
