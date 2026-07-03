import { Injectable } from '@nestjs/common';
import {
  AdmissionApplicationStatus,
  AdmissionDecisionType,
  InterviewStatus,
  PlacementTestStatus,
} from '@prisma/client';
import { ApplicationRecord } from '../../applications/infrastructure/applications.repository';
import { mapApplicationStatusToApi } from '../../applications/domain/application.enums';
import { ApplicationAlreadyDecidedException, DecisionRequiresAllStepsException } from '../domain/admission-decision.exceptions';
import { AdmissionDecisionsRepository } from '../infrastructure/admission-decisions.repository';
import { ResolveAdmissionWorkflowPolicyService } from '../../workflow-policy/application/resolve-admission-workflow-policy.service';
import { evaluateAdmissionWorkflowPolicy } from '../../workflow-policy/application/admission-workflow-policy.evaluator';

@Injectable()
export class DecisionWorkflowValidator {
  constructor(
    private readonly admissionDecisionsRepository: AdmissionDecisionsRepository,
    private readonly resolveAdmissionWorkflowPolicyService: ResolveAdmissionWorkflowPolicyService,
  ) {}

  async ensureDecisionCanBeCreated(
    application: ApplicationRecord,
    decision: AdmissionDecisionType,
  ): Promise<void> {
    const existing =
      await this.admissionDecisionsRepository.findAdmissionDecisionByApplicationId(
        application.id,
      );
    if (existing) {
      throw new ApplicationAlreadyDecidedException({
        applicationId: application.id,
        admissionDecisionId: existing.id,
      });
    }

    const policy =
      await this.resolveAdmissionWorkflowPolicyService.resolveForCurrentSchool();
    const [
      totalPlacementTests,
      completedPlacementTests,
      totalInterviews,
      completedInterviews,
    ] = await Promise.all([
      this.admissionDecisionsRepository.countPlacementTestsForApplication({
        applicationId: application.id,
      }),
      this.admissionDecisionsRepository.countPlacementTestsForApplication({
        applicationId: application.id,
        status: PlacementTestStatus.COMPLETED,
      }),
      this.admissionDecisionsRepository.countInterviewsForApplication({
        applicationId: application.id,
      }),
      this.admissionDecisionsRepository.countInterviewsForApplication({
        applicationId: application.id,
        status: InterviewStatus.COMPLETED,
      }),
    ]);

    const applicationStatusAllowsDecision =
      application.status === AdmissionApplicationStatus.SUBMITTED ||
      application.status === AdmissionApplicationStatus.UNDER_REVIEW;

    const workflow = evaluateAdmissionWorkflowPolicy({
      applicationId: application.id,
      applicationStatus: mapApplicationStatusToApi(application.status),
      policy,
      decision,
      placementTests: {
        total: totalPlacementTests,
        completed: completedPlacementTests,
      },
      interviews: {
        total: totalInterviews,
        completed: completedInterviews,
      },
    });

    if (!applicationStatusAllowsDecision || !workflow.satisfied) {
      throw new DecisionRequiresAllStepsException(workflow.details);
    }
  }
}
