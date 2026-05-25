import { Module } from '@nestjs/common';
import { ParentAppAccessService } from '../access/parent-app-access.service';
import { ParentAppGuardianReadAdapter } from '../access/parent-app-guardian-read.adapter';
import {
  GetParentChildHomeworkUseCase,
  ListParentChildHomeworksUseCase,
} from './application/parent-homeworks.use-cases';
import { ParentHomeworksController } from './controller/parent-homeworks.controller';
import { ParentHomeworksReadAdapter } from './infrastructure/parent-homeworks-read.adapter';

@Module({
  controllers: [ParentHomeworksController],
  providers: [
    ParentAppAccessService,
    ParentAppGuardianReadAdapter,
    ParentHomeworksReadAdapter,
    ListParentChildHomeworksUseCase,
    GetParentChildHomeworkUseCase,
  ],
})
export class ParentHomeworksModule {}
