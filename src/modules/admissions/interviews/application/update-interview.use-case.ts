import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireApplicationsScope } from '../../applications/applications-scope';
import { InterviewResponseDto, UpdateInterviewDto } from '../dto/interview.dto';
import { mapInterviewStatusFromApi } from '../domain/interview.enums';
import { InterviewsRepository } from '../infrastructure/interviews.repository';
import { presentInterview } from '../presenters/interview.presenter';
import { InterviewWorkflowValidator } from '../validators/interview-workflow.validator';

function normalizeOptionalNotes(
  value: string | undefined,
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

@Injectable()
export class UpdateInterviewUseCase {
  constructor(
    private readonly interviewsRepository: InterviewsRepository,
    private readonly interviewWorkflowValidator: InterviewWorkflowValidator,
  ) {}

  async execute(
    interviewId: string,
    command: UpdateInterviewDto,
  ): Promise<InterviewResponseDto> {
    requireApplicationsScope();

    const existing = await this.interviewsRepository.findInterviewById(interviewId);
    if (!existing) {
      throw new NotFoundDomainException('Interview not found', {
        interviewId,
      });
    }

    if (command.interviewerUserId) {
      await this.interviewWorkflowValidator.validateInterviewer(
        command.interviewerUserId,
      );
    }

    const data: Prisma.InterviewUncheckedUpdateInput = {
      ...(command.scheduledAt !== undefined
        ? { scheduledAt: new Date(command.scheduledAt) }
        : {}),
      ...(command.interviewerUserId !== undefined
        ? { interviewerUserId: command.interviewerUserId }
        : {}),
      ...(command.status !== undefined
        ? { status: mapInterviewStatusFromApi(command.status) }
        : {}),
      ...(command.notes !== undefined
        ? { notes: normalizeOptionalNotes(command.notes) }
        : {}),
    };

    if (Object.keys(data).length === 0) {
      return presentInterview(existing);
    }

    const updated = await this.interviewsRepository.updateInterview(
      interviewId,
      data,
    );
    if (!updated) {
      throw new NotFoundDomainException('Interview not found', {
        interviewId,
      });
    }

    return presentInterview(updated);
  }
}
