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

export class PlatformSchoolProvisioningInvalidOrganizationModeException extends DomainException {
  constructor(mode?: string) {
    super({
      code: 'platform.school_provisioning.invalid_organization_mode',
      message: 'School provisioning organization mode is invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details: { mode },
    });
  }
}

export class PlatformSchoolProvisioningOrganizationRequiredException extends DomainException {
  constructor(fields: string[]) {
    super({
      code: 'platform.school_provisioning.organization_required',
      message: 'School provisioning organization data is required',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details: { fields },
    });
  }
}

export class PlatformSchoolProvisioningLoginDomainTakenException extends DomainException {
  constructor(loginDomain: string) {
    super({
      code: 'platform.school_provisioning.login_domain_taken',
      message: 'Login domain is already configured for another school',
      httpStatus: HttpStatus.CONFLICT,
      details: { loginDomain },
    });
  }
}

export class PlatformSchoolProvisioningLoginDomainInvalidException extends DomainException {
  constructor(reason: string, loginDomain?: string) {
    super({
      code: 'platform.school_provisioning.login_domain_invalid',
      message: 'Login domain is invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details: { reason, loginDomain },
    });
  }
}

export class PlatformSchoolProvisioningPrimaryAdminLoginTakenException extends DomainException {
  constructor(loginEmail: string) {
    super({
      code: 'platform.school_provisioning.primary_admin_login_taken',
      message: 'Primary admin login email is already taken',
      httpStatus: HttpStatus.CONFLICT,
      details: { loginEmail },
    });
  }
}

export class PlatformSchoolProvisioningSchoolAdminRoleMissingException extends DomainException {
  constructor() {
    super({
      code: 'platform.school_provisioning.school_admin_role_missing',
      message: 'School admin role is missing',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
    });
  }
}

export class PlatformEntitlementInvalidDateRangeException extends DomainException {
  constructor(details: { startsAt?: string | null; endsAt?: string | null }) {
    super({
      code: 'platform.entitlement.invalid_date_range',
      message: 'Entitlement end date must be after the start date',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class PlatformEntitlementInvalidStatusException extends DomainException {
  constructor(status?: string) {
    super({
      code: 'platform.entitlement.invalid_status',
      message: 'Entitlement status is invalid',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details: { status },
    });
  }
}

export class PlatformEntitlementSchoolArchivedException extends DomainException {
  constructor(schoolId: string) {
    super({
      code: 'platform.entitlement.school_archived',
      message: 'School is archived and cannot receive entitlement changes',
      httpStatus: HttpStatus.CONFLICT,
      details: { schoolId },
    });
  }
}

export class PlatformEntitlementStudentSeatLimitInvalidException extends DomainException {
  constructor(studentSeatLimit?: number | null) {
    super({
      code: 'platform.entitlement.student_seat_limit_invalid',
      message: 'Student seat limit must be a positive integer',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details: { studentSeatLimit },
    });
  }
}

export class PlatformFeatureUnknownException extends DomainException {
  constructor(featureKey: string) {
    super({
      code: 'platform.feature.unknown',
      message: 'Feature key is not registered',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details: { featureKey },
    });
  }
}

export class PlatformFeatureDuplicateKeyException extends DomainException {
  constructor(featureKeys: string[]) {
    super({
      code: 'platform.feature.duplicate_key',
      message: 'Feature keys must be unique in a bulk update',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details: { featureKeys },
    });
  }
}

export class PlatformFeatureSchoolArchivedException extends DomainException {
  constructor(schoolId: string) {
    super({
      code: 'platform.feature.school_archived',
      message: 'School is archived and cannot receive feature control changes',
      httpStatus: HttpStatus.CONFLICT,
      details: { schoolId },
    });
  }
}
