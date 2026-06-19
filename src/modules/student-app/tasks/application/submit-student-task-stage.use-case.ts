import { Injectable } from '@nestjs/common';
import {
  ReinforcementProofType,
  ReinforcementTaskStatus,
} from '@prisma/client';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { SubmitReinforcementStageUseCase } from '../../../reinforcement/reviews/application/submit-reinforcement-stage.use-case';
import { ReinforcementReviewItemResponseDto } from '../../../reinforcement/reviews/dto/reinforcement-review.dto';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import type { StudentAppContext } from '../../shared/student-app.types';
import {
  StudentTaskSubmissionResponseDto,
  SubmitStudentTaskStageDto,
} from '../dto/student-tasks.dto';
import {
  StudentTaskAssignmentReadModel,
  StudentTasksReadAdapter,
} from '../infrastructure/student-tasks-read.adapter';
import { StudentTasksPresenter } from '../presenters/student-tasks.presenter';

@Injectable()
export class SubmitStudentTaskStageUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentTasksReadAdapter,
    private readonly submitReinforcementStageUseCase: SubmitReinforcementStageUseCase,
  ) {}

  async execute(params: {
    taskId: string;
    stageId: string;
    dto: SubmitStudentTaskStageDto;
  }): Promise<StudentTaskSubmissionResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const assignment = await this.assertVisibleAssignment({
      context,
      taskId: params.taskId,
    });
    const stage = this.assertVisibleStage({
      assignment,
      taskId: params.taskId,
      stageId: params.stageId,
    });

    const proofText = normalizeNullableText(params.dto.proofText);
    const proofFileId = normalizeNullableText(params.dto.proofFileId);
    this.assertProofPayloadMatchesStudentContract({
      proofType: stage.proofType,
      proofFileId,
    });

    if (proofFileId) {
      await this.assertOwnedProofFile({ context, proofFileId });
    }

    const submitted =
      (await this.submitReinforcementStageUseCase.execute(
        assignment.id,
        params.stageId,
        {
          proofText,
          proofFileId,
        },
      )) as ReinforcementReviewItemResponseDto;

    const submission = await this.readAdapter.findTaskSubmission({
      context,
      taskId: params.taskId,
      submissionId: submitted.id,
    });
    if (!submission) {
      throw new NotFoundDomainException(
        'Student App task submission not found',
        {
          taskId: params.taskId,
          stageId: params.stageId,
          submissionId: submitted.id,
        },
      );
    }

    return StudentTasksPresenter.presentSubmission(submission);
  }

  private async assertVisibleAssignment(params: {
    context: StudentAppContext;
    taskId: string;
  }): Promise<StudentTaskAssignmentReadModel> {
    const assignment = await this.readAdapter.findTask(params);
    if (!assignment) {
      throw new NotFoundDomainException('Student App task not found', {
        taskId: params.taskId,
      });
    }

    if (
      assignment.status === ReinforcementTaskStatus.CANCELLED ||
      assignment.task.status === ReinforcementTaskStatus.CANCELLED ||
      assignment.cancelledAt
    ) {
      throw new NotFoundDomainException('Student App task not found', {
        taskId: params.taskId,
      });
    }

    return assignment;
  }

  private assertVisibleStage(params: {
    assignment: StudentTaskAssignmentReadModel;
    taskId: string;
    stageId: string;
  }): StudentTaskAssignmentReadModel['task']['stages'][number] {
    const stage =
      params.assignment.task.stages.find(
        (candidate) => candidate.id === params.stageId,
      ) ?? null;

    if (!stage) {
      throw new NotFoundDomainException('Student App task stage not found', {
        taskId: params.taskId,
        stageId: params.stageId,
      });
    }

    return stage;
  }

  private assertProofPayloadMatchesStudentContract(params: {
    proofType: ReinforcementProofType;
    proofFileId: string | null;
  }): void {
    if (params.proofType === ReinforcementProofType.NONE) return;

    if (!params.proofFileId) {
      throw new ValidationDomainException(
        'Proof file is required for this stage',
        {
          field: 'proofFileId',
          proofType: params.proofType,
        },
      );
    }
  }

  private async assertOwnedProofFile(params: {
    context: StudentAppContext;
    proofFileId: string;
  }): Promise<void> {
    const proofFile = await this.readAdapter.findOwnedProofFile(params);
    if (!proofFile) {
      throw new NotFoundDomainException('Proof file not found', {
        proofFileId: params.proofFileId,
      });
    }
  }
}

function normalizeNullableText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}
