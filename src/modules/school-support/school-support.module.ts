import { Module } from '@nestjs/common';
import { RealtimeModule } from '../../infrastructure/realtime/realtime.module';
import { CommunicationModule } from '../communication/communication.module';
import { AuthModule } from '../iam/auth/auth.module';
import {
  ClosePlatformSupportConversationUseCase,
  GetPlatformSupportConversationUseCase,
  GetSchoolSupportConversationUseCase,
  ListPlatformSupportConversationsUseCase,
  ListPlatformSupportMessagesUseCase,
  ListSchoolSupportMessagesUseCase,
  MarkPlatformSupportReadUseCase,
  MarkSchoolSupportReadUseCase,
  ReopenPlatformSupportConversationUseCase,
  SendPlatformSupportMessageUseCase,
  SendSchoolSupportMessageUseCase,
} from './application/school-support.use-cases';
import { SchoolSupportSideEffectsService } from './application/school-support-side-effects.service';
import { PlatformSupportController } from './controller/platform-support.controller';
import { SchoolSupportController } from './controller/school-support.controller';
import { SchoolSupportRepository } from './infrastructure/school-support.repository';

@Module({
  imports: [AuthModule, CommunicationModule, RealtimeModule],
  controllers: [SchoolSupportController, PlatformSupportController],
  providers: [
    SchoolSupportRepository,
    SchoolSupportSideEffectsService,
    GetSchoolSupportConversationUseCase,
    ListSchoolSupportMessagesUseCase,
    SendSchoolSupportMessageUseCase,
    MarkSchoolSupportReadUseCase,
    ListPlatformSupportConversationsUseCase,
    GetPlatformSupportConversationUseCase,
    ListPlatformSupportMessagesUseCase,
    SendPlatformSupportMessageUseCase,
    MarkPlatformSupportReadUseCase,
    ClosePlatformSupportConversationUseCase,
    ReopenPlatformSupportConversationUseCase,
  ],
})
export class SchoolSupportModule {}
