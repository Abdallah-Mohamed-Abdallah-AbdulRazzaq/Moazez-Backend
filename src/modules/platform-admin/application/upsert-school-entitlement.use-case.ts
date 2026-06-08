import { Injectable } from '@nestjs/common';
import { AuditOutcome, SchoolStatus } from '@prisma/client';
import { PlatformScope } from '../../../common/decorators/platform-scope.decorator';
import { AuthRepository } from '../../iam/auth/infrastructure/auth.repository';
import {
  PlatformSchoolEntitlementResponseDto,
  UpsertPlatformSchoolEntitlementDto,
} from '../dto/platform-admin-entitlement.dto';
import {
  mapEntitlementStatusToApi,
  normalizeEntitlementInput,
  NormalizedEntitlementInput,
} from '../domain/platform-admin-entitlement-inputs';
import {
  PlatformEntitlementSchoolArchivedException,
  PlatformSchoolNotFoundException,
} from '../domain/platform-admin-errors';
import {
  PlatformAdminEntitlementsRepository,
  PlatformSchoolEntitlementRecord,
} from '../infrastructure/platform-admin-entitlements.repository';
import { requirePlatformAdminScope } from '../platform-admin-context';
import { presentPlatformSchoolEntitlement } from '../presenters/platform-admin-entitlement.presenter';

type EntitlementChangedField =
  | 'status'
  | 'startsAt'
  | 'endsAt'
  | 'studentSeatLimit'
  | 'notes';

@Injectable()
@PlatformScope()
export class UpsertSchoolEntitlementUseCase {
  constructor(
    private readonly entitlementsRepository: PlatformAdminEntitlementsRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    schoolId: string,
    command: UpsertPlatformSchoolEntitlementDto,
  ): Promise<PlatformSchoolEntitlementResponseDto> {
    const scope = requirePlatformAdminScope();
    const school = await this.entitlementsRepository.findSchoolById(schoolId);
    if (!school) {
      throw new PlatformSchoolNotFoundException(schoolId);
    }

    if (school.status === SchoolStatus.ARCHIVED) {
      throw new PlatformEntitlementSchoolArchivedException(schoolId);
    }

    const existing =
      await this.entitlementsRepository.findEntitlementBySchoolId(schoolId);
    const normalized = normalizeEntitlementInput(command, existing);
    const changedFields = collectChangedFields(existing, normalized);

    if (existing && changedFields.length === 0) {
      const activeStudentSeatUsage =
        await this.entitlementsRepository.countActiveStudentSeats(schoolId);
      return presentPlatformSchoolEntitlement({
        school,
        entitlement: existing,
        activeStudentSeatUsage,
      });
    }

    const entitlement =
      await this.entitlementsRepository.upsertSchoolEntitlement({
        schoolId: school.id,
        organizationId: school.organizationId,
        status: normalized.status,
        startsAt: normalized.startsAt,
        endsAt: normalized.endsAt,
        studentSeatLimit: normalized.studentSeatLimit,
        notes: normalized.notes,
      });

    await this.authRepository.createAuditLog({
      actorId: scope.actorId,
      userType: scope.userType,
      organizationId: school.organizationId,
      schoolId: school.id,
      module: 'platform_admin',
      action: existing
        ? 'platform.entitlement.update'
        : 'platform.entitlement.create',
      resourceType: 'school_entitlement',
      resourceId: entitlement.id,
      outcome: AuditOutcome.SUCCESS,
      before: existing ? auditSnapshot(existing) : undefined,
      after: {
        ...auditSnapshot(entitlement),
        changedFields,
      },
    });

    const activeStudentSeatUsage =
      await this.entitlementsRepository.countActiveStudentSeats(schoolId);

    return presentPlatformSchoolEntitlement({
      school,
      entitlement,
      activeStudentSeatUsage,
    });
  }
}

function collectChangedFields(
  existing: PlatformSchoolEntitlementRecord | null,
  normalized: NormalizedEntitlementInput,
): EntitlementChangedField[] {
  if (!existing) {
    return normalized.providedFields;
  }

  const changedFields: EntitlementChangedField[] = [];

  if (
    normalized.status !== undefined &&
    normalized.status !== existing.status
  ) {
    changedFields.push('status');
  }

  if (
    normalized.startsAt !== undefined &&
    !sameNullableDate(normalized.startsAt, existing.startsAt)
  ) {
    changedFields.push('startsAt');
  }

  if (
    normalized.endsAt !== undefined &&
    !sameNullableDate(normalized.endsAt, existing.endsAt)
  ) {
    changedFields.push('endsAt');
  }

  if (
    normalized.studentSeatLimit !== undefined &&
    normalized.studentSeatLimit !== existing.studentSeatLimit
  ) {
    changedFields.push('studentSeatLimit');
  }

  if (normalized.notes !== undefined && normalized.notes !== existing.notes) {
    changedFields.push('notes');
  }

  return changedFields;
}

function auditSnapshot(entitlement: PlatformSchoolEntitlementRecord): {
  entitlementId: string;
  schoolId: string;
  organizationId: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  studentSeatLimit: number | null;
  notesPresent: boolean;
} {
  return {
    entitlementId: entitlement.id,
    schoolId: entitlement.schoolId,
    organizationId: entitlement.organizationId,
    status: mapEntitlementStatusToApi(entitlement.status),
    startsAt: entitlement.startsAt?.toISOString() ?? null,
    endsAt: entitlement.endsAt?.toISOString() ?? null,
    studentSeatLimit: entitlement.studentSeatLimit,
    notesPresent: entitlement.notes !== null,
  };
}

function sameNullableDate(left: Date | null, right: Date | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }

  return left.getTime() === right.getTime();
}
