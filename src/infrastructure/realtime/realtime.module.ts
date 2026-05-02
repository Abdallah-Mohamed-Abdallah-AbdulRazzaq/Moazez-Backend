import { Module } from '@nestjs/common';
import { AuthModule } from '../../modules/iam/auth/auth.module';
import { RealtimeAuthService } from './realtime-auth.service';
import { RealtimeCommunicationAccessService } from './realtime-communication-access.service';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimePublisherService } from './realtime-publisher.service';

@Module({
  imports: [AuthModule],
  providers: [
    RealtimeAuthService,
    RealtimeCommunicationAccessService,
    RealtimeGateway,
    RealtimePublisherService,
  ],
  exports: [RealtimeAuthService, RealtimePublisherService],
})
export class RealtimeModule {}
