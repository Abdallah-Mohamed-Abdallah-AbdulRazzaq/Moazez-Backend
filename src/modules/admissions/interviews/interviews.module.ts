import { Module } from '@nestjs/common';
import { ApplicationsModule } from '../applications/applications.module';
import { CreateInterviewUseCase } from './application/create-interview.use-case';
import { GetInterviewUseCase } from './application/get-interview.use-case';
import { ListInterviewsUseCase } from './application/list-interviews.use-case';
import { UpdateInterviewUseCase } from './application/update-interview.use-case';
import { InterviewsController } from './controller/interviews.controller';
import { InterviewsRepository } from './infrastructure/interviews.repository';
import { InterviewWorkflowValidator } from './validators/interview-workflow.validator';

@Module({
  imports: [ApplicationsModule],
  controllers: [InterviewsController],
  providers: [
    InterviewsRepository,
    InterviewWorkflowValidator,
    ListInterviewsUseCase,
    CreateInterviewUseCase,
    GetInterviewUseCase,
    UpdateInterviewUseCase,
  ],
})
export class InterviewsModule {}
