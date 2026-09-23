import { HttpStatus, Injectable } from '@nestjs/common';
import {
  AcademicContentAudienceType,
  AcademicContentType,
} from '@prisma/client';
import { getRequestContext } from '../../../../common/context/request-context';
import { DomainException } from '../../../../common/exceptions/domain-exception';
import { assertAcademicContentAudience } from '../domain/academic-content-audience.policy';
import { canManageAcademicContent } from '../domain/academic-content-authoring.policy';
import { AcademicContentRepository } from '../infrastructure/academic-content.repository';
import { AcademicContentContextValidator } from './academic-content-context-validator';

export interface CreateAcademicContentCommand {
  academicYearId: string;
  termId: string;
  type: AcademicContentType;
  audience: AcademicContentAudienceType;
}

@Injectable()
export class CreateAcademicContentUseCase {
  constructor(
    private readonly contextValidator: AcademicContentContextValidator,
    private readonly contentRepository: AcademicContentRepository,
  ) {}

  async execute(command: CreateAcademicContentCommand) {
    const context = getRequestContext();
    const schoolId = context?.activeMembership?.schoolId;
    const actor = context?.actor;
    if (
      !schoolId ||
      !actor ||
      !canManageAcademicContent(
        actor.userType,
        context?.activeMembership?.permissions ?? [],
      )
    ) {
      throw new DomainException({
        code: 'auth.scope.missing',
        message: 'Academic content management scope is required',
        httpStatus: HttpStatus.FORBIDDEN,
      });
    }
    assertAcademicContentAudience(command.type, command.audience);
    await this.contextValidator.validate({
      schoolId,
      academicYearId: command.academicYearId,
      termId: command.termId,
    });
    return this.contentRepository.create({
      schoolId,
      academicYearId: command.academicYearId,
      termId: command.termId,
      type: command.type,
      audience: command.audience,
      createdByUserId: actor.id,
    });
  }
}
