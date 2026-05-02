import { Module } from '@nestjs/common';
import { AuthModule } from '../../modules/iam/auth/auth.module';
import { RealtimeAuthService } from './realtime-auth.service';
import { RealtimeCommunicationAccessService } from './realtime-communication-access.service';
import { RealtimePresenceService } from './realtime-presence.service';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimePublisherService } from './realtime-publisher.service';
import { RealtimeStateStoreService } from './realtime-state-store.service';
import { RealtimeTypingService } from './realtime-typing.service';

@Module({
  imports: [AuthModule],
  providers: [
    RealtimeAuthService,
    RealtimeCommunicationAccessService,
    RealtimeGateway,
    RealtimePresenceService,
    RealtimePublisherService,
    RealtimeStateStoreService,
    RealtimeTypingService,
  ],
  exports: [RealtimeAuthService, RealtimePublisherService],
})
export class RealtimeModule {}
