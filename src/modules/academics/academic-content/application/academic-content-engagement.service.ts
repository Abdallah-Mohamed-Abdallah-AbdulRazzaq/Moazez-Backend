import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  getRequestContext,
  getCurrentRequestId,
} from '../../../../common/context/request-context';
import {
  DomainException,
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { AcademicContentCurrentRecipientContext } from '../domain/academic-content-current-access.policy';
import { academicContentEngagementShapeAllows } from '../domain/academic-content-engagement.policy';
import { assertAcademicContentPublicationUuid } from '../domain/academic-content-publication.policy';
import {
  AcademicContentEngagementResponseDto,
  RecordAcademicContentEngagementDto,
} from '../dto/academic-content-engagement.dto';
import { AcademicContentEngagementRepository } from '../infrastructure/academic-content-engagement.repository';

@Injectable()
export class AcademicContentEngagementService {
  private readonly logger = new Logger(AcademicContentEngagementService.name);
  constructor(
    private readonly repository: AcademicContentEngagementRepository,
  ) {}

  async record(
    context: AcademicContentCurrentRecipientContext,
    contentId: string,
    body: RecordAcademicContentEngagementDto,
  ): Promise<AcademicContentEngagementResponseDto> {
    try {
      const result = await this.recordAuthorized(context, contentId, body);
      this.signal('accepted');
      return result;
    } catch (error) {
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
    outcome: 'accepted' | 'denied' | 'rate_limited' | 'unavailable',
  ) {
    try {
      this.logger.log({
        event: 'academic_content.engagement',
        outcome,
        requestId: getCurrentRequestId(),
      });
    } catch {
      // A logging sink failure must never change the authoritative operation.
    }
  }

  private async recordAuthorized(
    context: AcademicContentCurrentRecipientContext,
    contentId: string,
    body: RecordAcademicContentEngagementDto,
  ): Promise<AcademicContentEngagementResponseDto> {
    assertAcademicContentPublicationUuid(contentId);
    assertAcademicContentPublicationUuid(body.expectedPublicationId);
    // The additive HTTP precondition never enters the original ACC-11A command.
    const command = {
      clientRequestId: body.clientRequestId.toLowerCase(),
      eventType: body.eventType,
      ...(body.fileId === undefined
        ? {}
        : { fileId: body.fileId.toLowerCase() }),
      ...(body.revisionLinkId === undefined
        ? {}
        : { revisionLinkId: body.revisionLinkId.toLowerCase() }),
    };
    if (!academicContentEngagementShapeAllows(command))
      throw new ValidationDomainException('Invalid engagement event shape');
    const request = getRequestContext();
    const membership = request?.activeMembership;
    if (
      request?.actor?.id !== context.userId ||
      request.actor.userType !== context.actorKind ||
      membership?.schoolId !== context.schoolId ||
      !membership.permissions.includes('academics.academic_content.view')
    ) {
      throw new NotFoundDomainException('Academic content not found');
    }
    try {
      await this.repository.admit(context, membership.membershipId);
      const event = await this.repository.record(
        context,
        membership.membershipId,
        contentId.toLowerCase(),
        body.expectedPublicationId.toLowerCase(),
        command,
      );
      return {
        eventId: event.id,
        eventType: event.eventType,
        publicationId: event.publicationId,
        revisionId: event.revisionId,
        recordedAt: event.createdAt.toISOString(),
      };
    } catch (error) {
      if (error instanceof DomainException) throw error;
      // Never attach a database error: raw SQL parameters can contain private metadata.
      throw new DomainException({
        code: 'service_unavailable',
        message: 'Engagement recording temporarily unavailable',
        httpStatus: HttpStatus.SERVICE_UNAVAILABLE,
      });
    }
  }
}
