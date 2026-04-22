import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireApplicationsScope } from '../../applications/applications-scope';
import { AdmissionDecisionResponseDto } from '../dto/admission-decision.dto';
import { AdmissionDecisionsRepository } from '../infrastructure/admission-decisions.repository';
import { presentAdmissionDecision } from '../presenters/admission-decision.presenter';

@Injectable()
export class GetAdmissionDecisionUseCase {
  constructor(
    private readonly admissionDecisionsRepository: AdmissionDecisionsRepository,
  ) {}

  async execute(
    admissionDecisionId: string,
  ): Promise<AdmissionDecisionResponseDto> {
    requireApplicationsScope();

    const admissionDecision =
      await this.admissionDecisionsRepository.findAdmissionDecisionById(
        admissionDecisionId,
      );
    if (!admissionDecision) {
      throw new NotFoundDomainException('Admission decision not found', {
        admissionDecisionId,
      });
    }

    return presentAdmissionDecision(admissionDecision);
  }
}
