import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireApplicationsScope } from '../../applications/applications-scope';
import { InterviewResponseDto } from '../dto/interview.dto';
import { InterviewsRepository } from '../infrastructure/interviews.repository';
import { presentInterview } from '../presenters/interview.presenter';

@Injectable()
export class GetInterviewUseCase {
  constructor(private readonly interviewsRepository: InterviewsRepository) {}

  async execute(interviewId: string): Promise<InterviewResponseDto> {
    requireApplicationsScope();

    const interview = await this.interviewsRepository.findInterviewById(interviewId);
    if (!interview) {
      throw new NotFoundDomainException('Interview not found', {
        interviewId,
      });
    }

    return presentInterview(interview);
  }
}
