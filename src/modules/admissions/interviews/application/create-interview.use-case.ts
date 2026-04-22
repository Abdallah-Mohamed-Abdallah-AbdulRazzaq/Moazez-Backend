import { Injectable } from '@nestjs/common';
import { InterviewStatus } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireApplicationsScope } from '../../applications/applications-scope';
import { ApplicationsRepository } from '../../applications/infrastructure/applications.repository';
import { CreateInterviewDto, InterviewResponseDto } from '../dto/interview.dto';
import { InterviewsRepository } from '../infrastructure/interviews.repository';
import { presentInterview } from '../presenters/interview.presenter';
import { InterviewWorkflowValidator } from '../validators/interview-workflow.validator';

function normalizeOptionalNotes(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

@Injectable()
export class CreateInterviewUseCase {
  constructor(
    private readonly applicationsRepository: ApplicationsRepository,
    private readonly interviewsRepository: InterviewsRepository,
    private readonly interviewWorkflowValidator: InterviewWorkflowValidator,
  ) {}

  async execute(command: CreateInterviewDto): Promise<InterviewResponseDto> {
    const scope = requireApplicationsScope();

    const application =
      await this.applicationsRepository.findApplicationById(command.applicationId);
    if (!application) {
      throw new NotFoundDomainException('Application not found', {
        applicationId: command.applicationId,
      });
    }

    await this.interviewWorkflowValidator.validateInterviewer(
      command.interviewerUserId,
    );

    const interview = await this.interviewsRepository.createInterview({
      schoolId: scope.schoolId,
      applicationId: command.applicationId,
      scheduledAt: new Date(command.scheduledAt),
      interviewerUserId: command.interviewerUserId ?? null,
      status: InterviewStatus.SCHEDULED,
      notes: normalizeOptionalNotes(command.notes),
    });

    return presentInterview(interview);
  }
}
