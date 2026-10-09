import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  getRequestContext,
  getCurrentRequestId,
} from '../../../../common/context/request-context';
import {
  DomainException,
  NotFoundDomainException,
} from '../../../../common/exceptions/domain-exception';
import { AcademicContentCurrentRecipientContext } from '../domain/academic-content-current-access.policy';
import { assertAcademicContentPublicationUuid } from '../domain/academic-content-publication.policy';
import { AcademicContentAcknowledgementRepository } from '../infrastructure/academic-content-acknowledgement.repository';
import { AcademicContentAcknowledgementResponseDto } from '../dto/academic-content-acknowledgement.dto';

@Injectable()
export class AcademicContentAcknowledgementService {
  private readonly logger = new Logger(
    AcademicContentAcknowledgementService.name,
  );
  constructor(
    private readonly repository: AcademicContentAcknowledgementRepository,
  ) {}

  async resolve(
    context: AcademicContentCurrentRecipientContext,
    contentId: string,
    expectedPublicationId: string,
    write: boolean,
  ): Promise<AcademicContentAcknowledgementResponseDto> {
    try {
      return await this.resolveAuthorized(
        context,
        contentId,
        expectedPublicationId,
        write,
      );
    } catch (error) {
      if (write)
        this.signal(
          error instanceof DomainException &&
            error.httpStatus === HttpStatus.TOO_MANY_REQUESTS
            ? 'rate_limited'
            : error instanceof DomainException &&
                error.httpStatus < HttpStatus.INTERNAL_SERVER_ERROR
              ? 'denied'
              : 'unavailable',
        );
      throw error;
    }
  }

  private signal(
    outcome:
      | 'accepted'
      | 'identical_retry'
      | 'denied'
      | 'rate_limited'
      | 'unavailable',
  ) {
    try {
      this.logger.log({
        event: 'academic_content.acknowledgement',
        outcome,
        requestId: getCurrentRequestId(),
      });
    } catch {
      // A logging sink failure must never change the authoritative operation.
    }
  }

  private async resolveAuthorized(
    context: AcademicContentCurrentRecipientContext,
    contentId: string,
    expectedPublicationId: string,
    write: boolean,
  ): Promise<AcademicContentAcknowledgementResponseDto> {
    assertAcademicContentPublicationUuid(contentId);
    assertAcademicContentPublicationUuid(expectedPublicationId);
    const request = getRequestContext(),
      membership = request?.activeMembership;
    if (
      context.actorKind !== 'PARENT' ||
      request?.actor?.id !== context.userId ||
      request.actor.userType !== 'PARENT' ||
      membership?.schoolId !== context.schoolId ||
      !membership.permissions.includes('academics.academic_content.view')
    ) {
      throw new NotFoundDomainException('Academic content not found');
    }
    try {
      if (write) await this.repository.admit(context, membership.membershipId);
      const result = await this.repository.resolve(
        context,
        membership.membershipId,
        contentId.toLowerCase(),
        expectedPublicationId.toLowerCase(),
        write,
      );
      // The repository promise resolves only after commit and the final eligibility recheck.
      if (write) this.signal(result.created ? 'accepted' : 'identical_retry');
      return {
        publicationId: result.publicationId,
        revisionId: result.revisionId,
        requiresAcknowledgement: result.requiresAcknowledgement,
        status: !result.requiresAcknowledgement
          ? 'NOT_REQUIRED'
          : result.acknowledgement
            ? 'ACKNOWLEDGED'
            : 'PENDING',
        acknowledgementId: result.acknowledgement?.id ?? null,
        acknowledgedAt:
          result.acknowledgement?.acknowledgedAt.toISOString() ?? null,
      };
    } catch (error) {
      if (error instanceof DomainException) throw error;
      throw new DomainException({
        code: 'service_unavailable',
        message: 'Acknowledgement temporarily unavailable',
        httpStatus: HttpStatus.SERVICE_UNAVAILABLE,
      });
    }
  }
}
