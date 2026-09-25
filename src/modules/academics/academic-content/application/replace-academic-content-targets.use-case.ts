import { HttpStatus, Injectable } from '@nestjs/common';
import { getRequestContext } from '../../../../common/context/request-context';
import {
  DomainException,
  NotFoundDomainException,
} from '../../../../common/exceptions/domain-exception';
import { assertAcademicContentAudience } from '../domain/academic-content-audience.policy';
import { canReplaceAcademicContentTargets } from '../domain/academic-content-authoring.policy';
import {
  AcademicContentTargetInput,
  normalizeAcademicContentTargets,
} from '../domain/academic-content-target.policy';
import { AcademicContentRepository } from '../infrastructure/academic-content.repository';
import { AcademicContentTargetRepository } from '../infrastructure/academic-content-target.repository';
import { AcademicContentContextValidator } from './academic-content-context-validator';
import { AcademicContentTargetValidator } from './academic-content-target-validator';

@Injectable()
export class ReplaceAcademicContentTargetsUseCase {
  constructor(
    private readonly contents: AcademicContentRepository,
    private readonly contextValidator: AcademicContentContextValidator,
    private readonly targetValidator: AcademicContentTargetValidator,
    private readonly targets: AcademicContentTargetRepository,
  ) {}

  async execute(
    academicContentId: string,
    targets: readonly AcademicContentTargetInput[],
  ) {
    const context = getRequestContext();
    const schoolId = context?.activeMembership?.schoolId;
    const actor = context?.actor;
    if (
      !schoolId ||
      !actor ||
      !canReplaceAcademicContentTargets(
        actor.userType,
        context?.activeMembership?.permissions ?? [],
      )
    ) {
      throw new DomainException({
        code: 'auth.scope.missing',
        message: 'Academic content target authoring scope is required',
        httpStatus: HttpStatus.FORBIDDEN,
      });
    }
    const content = await this.contents.findByIdInSchool(
      academicContentId,
      schoolId,
    );
    if (!content)
      throw new NotFoundDomainException('Academic content not found');
    await this.contextValidator.validate(content);
    assertAcademicContentAudience(content.type, content.audience);
    const normalized = normalizeAcademicContentTargets(
      content.type,
      actor.userType,
      targets,
    );
    await this.targetValidator.validate(content, normalized, actor);

    return this.targets.replace({
      content,
      targets: normalized,
      actorId: actor.id,
    });
  }
}
