import { Injectable } from '@nestjs/common';
import {
  AdmissionApplicationStatus,
  InterviewStatus,
  PlacementTestStatus,
} from '@prisma/client';
import { ApplicationRecord } from '../../applications/infrastructure/applications.repository';
import { mapApplicationStatusToApi } from '../../applications/domain/application.enums';
import { ApplicationAlreadyDecidedException, DecisionRequiresAllStepsException } from '../domain/admission-decision.exceptions';
import { AdmissionDecisionsRepository } from '../infrastructure/admission-decisions.repository';

@Injectable()
export class DecisionWorkflowValidator {
  constructor(
    private readonly admissionDecisionsRepository: AdmissionDecisionsRepository,
  ) {}

  async ensureDecisionCanBeCreated(
    application: ApplicationRecord,
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

    const placementTestsComplete =
      totalPlacementTests > 0 &&
      totalPlacementTests === completedPlacementTests;
    const interviewsComplete =
      totalInterviews > 0 && totalInterviews === completedInterviews;

    if (
      !applicationStatusAllowsDecision ||
      !placementTestsComplete ||
      !interviewsComplete
    ) {
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
  }
}
