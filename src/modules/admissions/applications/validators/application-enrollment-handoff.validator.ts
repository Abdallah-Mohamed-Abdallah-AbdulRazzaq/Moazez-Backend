import { Injectable } from '@nestjs/common';
import {
  AdmissionApplicationStatus,
  AdmissionDecisionType,
  InterviewStatus,
  PlacementTestStatus,
} from '@prisma/client';
import { mapApplicationStatusToApi } from '../domain/application.enums';
import { ApplicationNotAcceptedException } from '../domain/application.exceptions';
import {
  ApplicationEnrollmentHandoffRecord,
  ApplicationsRepository,
} from '../infrastructure/applications.repository';
import { DecisionRequiresAllStepsException } from '../../decisions/domain/admission-decision.exceptions';
import { mapAdmissionDecisionToApi } from '../../decisions/domain/admission-decision.enums';
import { ResolveAdmissionWorkflowPolicyService } from '../../workflow-policy/application/resolve-admission-workflow-policy.service';
import { evaluateAdmissionWorkflowPolicy } from '../../workflow-policy/application/admission-workflow-policy.evaluator';

@Injectable()
export class ApplicationEnrollmentHandoffValidator {
  constructor(
    private readonly applicationsRepository: ApplicationsRepository,
    private readonly resolveAdmissionWorkflowPolicyService: ResolveAdmissionWorkflowPolicyService,
  ) {}

  async ensureApplicationCanPrepareEnrollmentHandoff(
    application: ApplicationEnrollmentHandoffRecord,
  ): Promise<void> {
    const decision = application.decision;
    const isAcceptedApplication =
      application.status === AdmissionApplicationStatus.ACCEPTED;
    const isAcceptedDecision =
      decision?.decision === AdmissionDecisionType.ACCEPT;

    if (!isAcceptedApplication || !isAcceptedDecision) {
      throw new ApplicationNotAcceptedException({
        applicationId: application.id,
        applicationStatus: mapApplicationStatusToApi(application.status),
        decision: decision ? mapAdmissionDecisionToApi(decision.decision) : null,
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
      this.applicationsRepository.countPlacementTestsForApplication({
        applicationId: application.id,
      }),
      this.applicationsRepository.countPlacementTestsForApplication({
        applicationId: application.id,
        status: PlacementTestStatus.COMPLETED,
      }),
      this.applicationsRepository.countInterviewsForApplication({
        applicationId: application.id,
      }),
      this.applicationsRepository.countInterviewsForApplication({
        applicationId: application.id,
        status: InterviewStatus.COMPLETED,
      }),
    ]);

    const workflow = evaluateAdmissionWorkflowPolicy({
      applicationId: application.id,
      applicationStatus: mapApplicationStatusToApi(application.status),
      policy,
      decision: AdmissionDecisionType.ACCEPT,
      placementTests: {
        total: totalPlacementTests,
        completed: completedPlacementTests,
      },
      interviews: {
        total: totalInterviews,
        completed: completedInterviews,
      },
    });

    if (!workflow.satisfied) {
      throw new DecisionRequiresAllStepsException(workflow.details);
    }
  }
}
