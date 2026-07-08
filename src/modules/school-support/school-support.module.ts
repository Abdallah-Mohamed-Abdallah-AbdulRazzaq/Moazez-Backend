import { Module } from '@nestjs/common';
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
import { PlatformSupportController } from './controller/platform-support.controller';
import { SchoolSupportController } from './controller/school-support.controller';
import { SchoolSupportRepository } from './infrastructure/school-support.repository';

@Module({
  imports: [AuthModule],
  controllers: [SchoolSupportController, PlatformSupportController],
  providers: [
    SchoolSupportRepository,
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
