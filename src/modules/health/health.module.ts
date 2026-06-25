import { Module } from '@nestjs/common';
import { FirebaseAdminModule } from '../../infrastructure/push/firebase/firebase-admin.module';
import { QueueModule } from '../../infrastructure/queue/queue.module';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import { EmailSecretCrypto } from '../settings/email/domain/email-secret-crypto';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [QueueModule, StorageModule, FirebaseAdminModule],
  controllers: [HealthController],
  providers: [EmailSecretCrypto, HealthService],
})
export class HealthModule {}
