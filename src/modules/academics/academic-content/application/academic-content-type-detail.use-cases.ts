import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { getRequestContext } from '../../../../common/context/request-context';
import { DomainException } from '../../../../common/exceptions/domain-exception';
import { canManageAcademicContent } from '../domain/academic-content-authoring.policy';
import {
  GuardianNoteCommand,
  OnlineSessionCommand,
  PreparationCommand,
  SubjectResourceCommand,
  WeeklyPlanCommand,
  NormalizedDetail,
  normalizeGuardianNote,
  normalizeOnlineSession,
  normalizePreparation,
  normalizeSubjectResource,
  normalizeWeeklyPlan,
} from '../domain/academic-content-type-detail.policy';
import { ACADEMIC_CONTENT_TYPE_DETAIL_UNIT_OF_WORK } from './academic-content-type-detail.unit-of-work';
import type { AcademicContentTypeDetailUnitOfWork } from './academic-content-type-detail.unit-of-work';

@Injectable()
export class AcademicContentTypeDetailUseCases {
  constructor(
    @Inject(ACADEMIC_CONTENT_TYPE_DETAIL_UNIT_OF_WORK)
    private readonly unitOfWork: AcademicContentTypeDetailUnitOfWork,
  ) {}

  private execute(contentId: string, detail: NormalizedDetail, now: Date) {
    const context = getRequestContext();
    const actor = context?.actor;
    const membership = context?.activeMembership;
    if (
      !actor ||
      !membership?.schoolId ||
      !canManageAcademicContent(actor.userType, membership.permissions ?? [])
    ) {
      throw new DomainException({
        code: 'auth.scope.missing',
        message: 'Academic content management scope is required',
        httpStatus: HttpStatus.FORBIDDEN,
      });
    }
    return this.unitOfWork.mutate({
      contentId,
      detail,
      now,
      actorId: actor.id,
      schoolId: membership.schoolId,
      organizationId: membership.organizationId,
    });
  }

  replacePreparation(
    id: string,
    command: PreparationCommand,
    now = new Date(),
  ) {
    return this.execute(id, normalizePreparation(command), now);
  }
  replaceWeeklyPlan(id: string, command: WeeklyPlanCommand, now = new Date()) {
    return this.execute(id, normalizeWeeklyPlan(command), now);
  }
  replaceGuardianNote(
    id: string,
    command: GuardianNoteCommand,
    now = new Date(),
  ) {
    return this.execute(id, normalizeGuardianNote(command), now);
  }
  replaceSubjectResource(
    id: string,
    command: SubjectResourceCommand,
    now = new Date(),
  ) {
    return this.execute(id, normalizeSubjectResource(command), now);
  }
  replaceOnlineSession(
    id: string,
    command: OnlineSessionCommand,
    now = new Date(),
  ) {
    return this.execute(id, normalizeOnlineSession(command), now);
  }
}
