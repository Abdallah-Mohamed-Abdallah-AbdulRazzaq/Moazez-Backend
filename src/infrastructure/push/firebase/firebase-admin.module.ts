import { Module } from '@nestjs/common';
import { FirebaseAdminService } from './firebase-admin.service';
import { FirebasePushProvider } from './firebase-push.provider';

@Module({
  providers: [FirebaseAdminService, FirebasePushProvider],
  exports: [FirebaseAdminService, FirebasePushProvider],
})
export class FirebaseAdminModule {}