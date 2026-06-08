import { HttpStatus } from '@nestjs/common';
import { OrganizationStatus, SchoolStatus } from '@prisma/client';
import { DomainException } from '../../../common/exceptions/domain-exception';

export class PlatformOrganizationNotFoundException extends DomainException {
  constructor(organizationId: string) {
    super({
      code: 'platform.organization.not_found',
      message: 'Organization was not found',
      httpStatus: HttpStatus.NOT_FOUND,
      details: { organizationId },
    });
  }
}

export class PlatformOrganizationSlugTakenException extends DomainException {
  constructor(slug: string) {
    super({
      code: 'platform.organization.slug_taken',
      message: 'Organization slug is already taken',
      httpStatus: HttpStatus.CONFLICT,
      details: { slug },
    });
  }
}

export class PlatformOrganizationArchivedException extends DomainException {
  constructor(organizationId: string) {
    super({
      code: 'platform.organization.archived',
      message: 'Organization is archived',
      httpStatus: HttpStatus.CONFLICT,
      details: { organizationId },
    });
  }
}

export class PlatformOrganizationInvalidStatusTransitionException extends DomainException {
  constructor(
    organizationId: string,
    currentStatus: OrganizationStatus,
    targetStatus: OrganizationStatus,
  ) {
    super({
      code: 'platform.organization.invalid_status_transition',
      message: 'Organization status transition is invalid',
      httpStatus: HttpStatus.CONFLICT,
      details: { organizationId, currentStatus, targetStatus },
    });
  }
}

export class PlatformSchoolNotFoundException extends DomainException {
  constructor(schoolId: string) {
    super({
      code: 'platform.school.not_found',
      message: 'School was not found',
      httpStatus: HttpStatus.NOT_FOUND,
      details: { schoolId },
    });
  }
}

export class PlatformSchoolSlugTakenException extends DomainException {
  constructor(organizationId: string, slug: string) {
    super({
      code: 'platform.school.slug_taken',
      message: 'School slug is already taken in this organization',
      httpStatus: HttpStatus.CONFLICT,
      details: { organizationId, slug },
    });
  }
}

export class PlatformSchoolArchivedException extends DomainException {
  constructor(schoolId: string) {
    super({
      code: 'platform.school.archived',
      message: 'School is archived',
      httpStatus: HttpStatus.CONFLICT,
      details: { schoolId },
    });
  }
}

export class PlatformSchoolInvalidStatusTransitionException extends DomainException {
  constructor(
    schoolId: string,
    currentStatus: SchoolStatus,
    targetStatus: SchoolStatus,
  ) {
    super({
      code: 'platform.school.invalid_status_transition',
      message: 'School status transition is invalid',
      httpStatus: HttpStatus.CONFLICT,
      details: { schoolId, currentStatus, targetStatus },
    });
  }
}
