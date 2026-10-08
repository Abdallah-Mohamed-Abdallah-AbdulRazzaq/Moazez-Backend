import { HttpStatus, Injectable } from '@nestjs/common';
import { getRequestContext } from '../../../../common/context/request-context';
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
  constructor(
    private readonly repository: AcademicContentAcknowledgementRepository,
  ) {}

  async resolve(
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
