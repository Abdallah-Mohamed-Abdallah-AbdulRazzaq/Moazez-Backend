import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditOutcome, UserType } from '@prisma/client';
import {
  DomainException,
  NotFoundDomainException,
} from '../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../iam/auth/infrastructure/auth.repository';
import { ApplicantRequestDetailResponseDto } from '../dto/applicant-request.dto';
import { ApplicantPortalRepository } from '../infrastructure/applicant-portal.repository';
import { presentApplicantRequestDetail } from '../presenters/applicant-request.presenter';
import { ApplicantPortalAccessService } from './applicant-portal-access.service';

export interface SubmitApplicantRequestCommand {
  requestId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class SubmitApplicantRequestUseCase {
  constructor(
    private readonly applicantPortalAccessService: ApplicantPortalAccessService,
    private readonly applicantPortalRepository: ApplicantPortalRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    command: SubmitApplicantRequestCommand,
  ): Promise<ApplicantRequestDetailResponseDto> {
    const applicantContext =
      await this.applicantPortalAccessService.getApplicantContext();

    const result =
      await this.applicantPortalRepository.submitApplicantAdmissionRequest({
        applicantUserId: applicantContext.applicantUserId,
        requestId: command.requestId,
        submittedAt: new Date(),
      });

    if (result.kind !== 'submitted') {
      throw this.toSubmitException(result.kind, command.requestId);
    }

    const mandatoryItemsCount =
      await this.applicantPortalRepository.countMandatoryRequiredDocumentsForSchool(
        result.schoolId,
      );
    const response = presentApplicantRequestDetail(
      result.request,
      result.missingItemsCount,
      mandatoryItemsCount,
    );

    if (result.createdApplication) {
      await this.authRepository.createAuditLog({
        actorId: applicantContext.applicantUserId,
        userType: UserType.APPLICANT,
        organizationId: result.organizationId,
        schoolId: result.schoolId,
        module: 'applicant_portal',
        action: 'applicant.request.submit',
        resourceType: 'applicant_admission_request',
        resourceId: result.request.id,
        outcome: AuditOutcome.SUCCESS,
        ipAddress: command.ipAddress,
        userAgent: command.userAgent,
        after: {
          status: response.status,
          missingItemsCount: result.missingItemsCount,
          applicationCreated: true,
        },
      });
    }

    return response;
  }

  private toSubmitException(
    kind:
      | 'not_found'
      | 'unsafe_school'
      | 'invalid_academic_year'
      | 'invalid_grade'
      | 'invalid_state'
      | 'integrity_error',
    requestId: string,
  ): DomainException {
    switch (kind) {
      case 'not_found':
        return new NotFoundDomainException('Applicant request not found', {
          requestId,
        });
      case 'unsafe_school':
        return new NotFoundDomainException('School not found', {
          requestId,
        });
      case 'invalid_academic_year':
        return new NotFoundDomainException(
          'Requested academic year not found',
          {
            requestId,
          },
        );
      case 'invalid_grade':
        return new NotFoundDomainException('Requested grade not found', {
          requestId,
        });
      case 'invalid_state':
        return new DomainException({
          code: 'conflict',
          message:
            'Applicant request cannot be submitted from its current state',
          httpStatus: HttpStatus.CONFLICT,
          details: { requestId },
        });
      case 'integrity_error':
        return new DomainException({
          code: 'conflict',
          message: 'Applicant request application link is invalid',
          httpStatus: HttpStatus.CONFLICT,
          details: { requestId },
        });
    }
  }
}
