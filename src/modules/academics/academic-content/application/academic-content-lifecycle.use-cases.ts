import { HttpStatus, Injectable } from '@nestjs/common';
import { AcademicContentAudienceType } from '@prisma/client';
import { getRequestContext } from '../../../../common/context/request-context';
import {
  DomainException,
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { assertAcademicContentAudience } from '../domain/academic-content-audience.policy';
import { canManageAcademicContent } from '../domain/academic-content-authoring.policy';
import {
  normalizeAcademicContentDescription,
  normalizeAcademicContentTitle,
} from '../domain/academic-content-lifecycle.policy';
import { AcademicContentRepository } from '../infrastructure/academic-content.repository';

export type UpdateAcademicContentCommand = {
  title?: string;
  description?: string | null;
  audience?: AcademicContentAudienceType;
};

@Injectable()
export class AcademicContentLifecycleUseCases {
  constructor(private readonly contents: AcademicContentRepository) {}

  private scope() {
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
    return {
      schoolId: membership.schoolId,
      organizationId: membership.organizationId,
      actorId: actor.id,
    };
  }

  async update(
    id: string,
    command: UpdateAcademicContentCommand,
    now = new Date(),
  ) {
    const scope = this.scope();
    if (
      !command ||
      Object.keys(command).some(
        (key) => !['title', 'description', 'audience'].includes(key),
      )
    )
      throw new ValidationDomainException('Only draft metadata may be updated');
    const current = await this.contents.findByIdInSchool(id, scope.schoolId);
    if (!current)
      throw new NotFoundDomainException('Academic content not found');
    if (command.audience !== undefined)
      assertAcademicContentAudience(current.type, command.audience);
    return this.contents.mutate({
      ...scope,
      id,
      action: 'update',
      now,
      changes: {
        ...(command.title !== undefined
          ? { title: normalizeAcademicContentTitle(command.title) }
          : {}),
        ...(command.description !== undefined
          ? {
              description: normalizeAcademicContentDescription(
                command.description,
              ),
            }
          : {}),
        ...(command.audience !== undefined
          ? { audience: command.audience }
          : {}),
      },
    });
  }

  archive(id: string, now = new Date()) {
    return this.contents.mutate({
      ...this.scope(),
      id,
      action: 'archive',
      now,
    });
  }

  restore(id: string, now = new Date()) {
    return this.contents.mutate({
      ...this.scope(),
      id,
      action: 'restore',
      now,
    });
  }

  delete(id: string, now = new Date()) {
    return this.contents.mutate({ ...this.scope(), id, action: 'delete', now });
  }
}
