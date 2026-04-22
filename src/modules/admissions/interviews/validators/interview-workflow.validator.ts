import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import {
  InterviewsRepository,
  type ScopedInterviewerRecord,
} from '../infrastructure/interviews.repository';

@Injectable()
export class InterviewWorkflowValidator {
  constructor(private readonly interviewsRepository: InterviewsRepository) {}

  async validateInterviewer(
    interviewerUserId?: string,
  ): Promise<ScopedInterviewerRecord | null> {
    if (!interviewerUserId) {
      return null;
    }

    const interviewer =
      await this.interviewsRepository.findScopedInterviewerByUserId(
        interviewerUserId,
      );
    if (!interviewer) {
      throw new NotFoundDomainException('Interviewer not found', {
        interviewerUserId,
      });
    }

    return interviewer;
  }
}
