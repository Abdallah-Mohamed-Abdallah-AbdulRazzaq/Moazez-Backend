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

@Injectable()
export class ApplicationEnrollmentHandoffValidator {
  constructor(
    private readonly applicationsRepository: ApplicationsRepository,
  ) {}

  async ensureApplicationCanPrepareEnrollmentHandoff(
    application: ApplicationEnrollmentHandoffRecord,
  ): Promise<void> {
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

    const placementTestsComplete =
      totalPlacementTests > 0 &&
      totalPlacementTests === completedPlacementTests;
    const interviewsComplete =
      totalInterviews > 0 && totalInterviews === completedInterviews;

    if (!placementTestsComplete || !interviewsComplete) {
      throw new DecisionRequiresAllStepsException({
        applicationId: application.id,
        applicationStatus: mapApplicationStatusToApi(application.status),
        placementTests: {
          total: totalPlacementTests,
          completed: completedPlacementTests,
        },
        interviews: {
          total: totalInterviews,
          completed: completedInterviews,
        },
      });
    }

    const isAcceptedApplication =
      application.status === AdmissionApplicationStatus.ACCEPTED;
    const isAcceptedDecision =
      application.decision?.decision === AdmissionDecisionType.ACCEPT;

    if (!isAcceptedApplication || !isAcceptedDecision) {
      throw new ApplicationNotAcceptedException({
        applicationId: application.id,
        applicationStatus: mapApplicationStatusToApi(application.status),
        decision: application.decision
          ? mapAdmissionDecisionToApi(application.decision.decision)
          : null,
      });
    }
  }
}
