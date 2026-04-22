import { Injectable } from '@nestjs/common';
import { AuditOutcome } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireApplicationsScope } from '../../applications/applications-scope';
import { mapApplicationStatusToApi } from '../../applications/domain/application.enums';
import { ApplicationsRepository } from '../../applications/infrastructure/applications.repository';
import {
  AdmissionDecisionResponseDto,
  CreateAdmissionDecisionDto,
} from '../dto/admission-decision.dto';
import {
  mapAdmissionDecisionFromApi,
  mapDecisionToApplicationStatus,
} from '../domain/admission-decision.enums';
import { AdmissionDecisionsRepository } from '../infrastructure/admission-decisions.repository';
import { presentAdmissionDecision } from '../presenters/admission-decision.presenter';
import { DecisionWorkflowValidator } from '../validators/decision-workflow.validator';

function normalizeOptionalReason(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

@Injectable()
export class CreateAdmissionDecisionUseCase {
  constructor(
    private readonly applicationsRepository: ApplicationsRepository,
    private readonly admissionDecisionsRepository: AdmissionDecisionsRepository,
    private readonly decisionWorkflowValidator: DecisionWorkflowValidator,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    command: CreateAdmissionDecisionDto,
  ): Promise<AdmissionDecisionResponseDto> {
    const scope = requireApplicationsScope();

    const application =
      await this.applicationsRepository.findApplicationById(command.applicationId);
    if (!application) {
      throw new NotFoundDomainException('Application not found', {
        applicationId: command.applicationId,
      });
    }

    await this.decisionWorkflowValidator.ensureDecisionCanBeCreated(application);

    const decision = mapAdmissionDecisionFromApi(command.decision);
    const decidedAt = new Date();
    const admissionDecision =
      await this.admissionDecisionsRepository.createDecisionAndUpdateApplicationStatus(
        {
          schoolId: scope.schoolId,
          applicationId: command.applicationId,
          decision,
          reason: normalizeOptionalReason(command.reason),
          decidedByUserId: scope.actorId,
          decidedAt,
          applicationStatus: mapDecisionToApplicationStatus(decision),
        },
      );

    await this.authRepository.createAuditLog({
      actorId: scope.actorId,
      userType: scope.userType,
      organizationId: scope.organizationId,
      schoolId: scope.schoolId,
      module: 'admissions',
      action: 'admissions.application.decision',
      resourceType: 'admission_decision',
      resourceId: admissionDecision.id,
      outcome: AuditOutcome.SUCCESS,
      before: {
        applicationId: application.id,
        applicationStatus: mapApplicationStatusToApi(application.status),
        hasDecision: false,
      },
      after: {
        applicationId: admissionDecision.applicationId,
        decision: command.decision,
        decidedAt: admissionDecision.decidedAt.toISOString(),
        applicationStatus: mapApplicationStatusToApi(
          admissionDecision.application.status,
        ),
        reasonProvided: admissionDecision.reason !== null,
      },
    });

    return presentAdmissionDecision(admissionDecision);
  }
}
