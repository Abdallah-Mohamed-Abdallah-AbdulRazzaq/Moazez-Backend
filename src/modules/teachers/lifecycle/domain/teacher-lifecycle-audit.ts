import type { UserType } from '@prisma/client';

export const TEACHER_LIFECYCLE_AUDIT_ACTIONS = [
  'teachers.account.provision',
  'teachers.account.activate',
  'teachers.account.disable',
  'teachers.account.rehire',
  'teachers.account.transfer',
  'teachers.membership.suspend',
  'teachers.membership.transfer',
  'teachers.profile.create',
  'teachers.profile.update',
  'teachers.profile.restore',
  'teachers.profile.archive',
  'teachers.employment_status.change',
  'teachers.role.promote',
  'teachers.role.demote',
  'teachers.role_transition.rejected',
] as const;

export type TeacherLifecycleAuditAction =
  (typeof TEACHER_LIFECYCLE_AUDIT_ACTIONS)[number];

export const TEACHER_LIFECYCLE_AUDIT_RESOURCE_TYPES = [
  'user',
  'membership',
  'teacher_profile',
] as const;

export type TeacherLifecycleAuditResourceType =
  (typeof TEACHER_LIFECYCLE_AUDIT_RESOURCE_TYPES)[number];

export const TEACHER_LIFECYCLE_CHANGED_FIELDS = [
  'firstName',
  'lastName',
  'status',
  'userType',
  'roleId',
  'membershipStatus',
  'endedAt',
  'teacherCode',
  'firstNameAr',
  'lastNameAr',
  'firstNameEn',
  'lastNameEn',
  'gender',
  'employmentStatus',
  'department',
  'specialization',
  'employmentType',
  'experienceYears',
  'hireDate',
  'workingDays',
  'workStartTime',
  'workEndTime',
  'notesAr',
  'notesEn',
  'deletedAt',
] as const;

export type TeacherLifecycleChangedField =
  (typeof TEACHER_LIFECYCLE_CHANGED_FIELDS)[number];

export const TEACHER_LIFECYCLE_AUDIT_ENUM_VALUES = [
  'ACTIVE',
  'INVITED',
  'SUSPENDED',
  'DISABLED',
  'INACTIVE',
  'TRANSFERRED',
  'TERMINATED',
  'PLATFORM_USER',
  'ORGANIZATION_USER',
  'SCHOOL_USER',
  'TEACHER',
  'PARENT',
  'STUDENT',
  'APPLICANT',
  'PICKUP_DELEGATE',
  'DISMISSAL_STAFF',
  'SERVICE_ACCOUNT',
  'MALE',
  'FEMALE',
  'FULL_TIME',
  'PART_TIME',
  'CONTRACT',
] as const;

export type TeacherLifecycleAuditEnumValue =
  (typeof TEACHER_LIFECYCLE_AUDIT_ENUM_VALUES)[number];

export const TEACHER_LIFECYCLE_AUDIT_REASON_CODES = [
  'teacher_directory_provisioning_required',
  'teacher_display_projection_managed',
  'teacher_promotion_requires_profile',
  'teacher_activation_requires_lifecycle',
  'teacher_invite_managed_by_directory',
  'legacy_reset_forbidden',
  'active_or_future_allocations',
  'allocation_integrity_risk',
  'invalid_transition',
  'profile_incomplete',
  'revocation_failed',
] as const;

export type TeacherLifecycleAuditReasonCode =
  (typeof TEACHER_LIFECYCLE_AUDIT_REASON_CODES)[number];

export const TEACHER_ALLOCATION_TERM_STATE_LABELS = [
  'future',
  'historical',
  'current_active',
  'current_inactive',
  'inconsistent',
  'invalid',
] as const;

export type TeacherAllocationTermStateLabel =
  (typeof TEACHER_ALLOCATION_TERM_STATE_LABELS)[number];

export interface TeacherLifecycleAuditMetadataInput {
  userId?: string;
  membershipId?: string;
  teacherProfileId?: string;
  changedFields?: TeacherLifecycleChangedField[];
  previousValue?: TeacherLifecycleAuditEnumValue;
  nextValue?: TeacherLifecycleAuditEnumValue;
  allocationDependencyCounts?: {
    currentActive: number;
    future: number;
    currentInactive: number;
    inconsistent: number;
    invalid: number;
    historical: number;
    timetableEntries: number;
    lessonPlans: number;
    homeworkAssignments: number;
  };
  termStateLabels?: TeacherAllocationTermStateLabel[];
  reasonCode?: TeacherLifecycleAuditReasonCode;
  hasPassword?: boolean;
  mustChangePassword?: boolean;
  credentialVersion?: number;
}

export type TeacherLifecycleAuditMetadata =
  Readonly<TeacherLifecycleAuditMetadataInput>;

export interface TeacherLifecycleAuditBaseEntry {
  actorId: string;
  actorUserType: UserType;
  organizationId: string;
  schoolId: string;
  resourceType: string;
  resourceId: string;
  metadata?: TeacherLifecycleAuditMetadataInput | Record<string, unknown>;
}

export interface TeacherLifecycleSuccessfulAuditEntry extends TeacherLifecycleAuditBaseEntry {
  action: string;
}

export type TeacherLifecycleRejectedAuditEntry = TeacherLifecycleAuditBaseEntry;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const METADATA_KEYS = [
  'userId',
  'membershipId',
  'teacherProfileId',
  'changedFields',
  'previousValue',
  'nextValue',
  'allocationDependencyCounts',
  'termStateLabels',
  'reasonCode',
  'hasPassword',
  'mustChangePassword',
  'credentialVersion',
] as const;

const DEPENDENCY_COUNT_KEYS = [
  'currentActive',
  'future',
  'currentInactive',
  'inconsistent',
  'invalid',
  'historical',
  'timetableEntries',
  'lessonPlans',
  'homeworkAssignments',
] as const;

export class TeacherLifecycleAuditContractError extends Error {
  constructor() {
    super('Teacher lifecycle audit contract rejected the entry');
    this.name = 'TeacherLifecycleAuditContractError';
  }
}

export function assertTeacherLifecycleAuditAction(
  action: string,
): asserts action is TeacherLifecycleAuditAction {
  if (!TEACHER_LIFECYCLE_AUDIT_ACTIONS.includes(action as never)) {
    throw new TeacherLifecycleAuditContractError();
  }
}

export function assertTeacherLifecycleAuditResourceType(
  resourceType: string,
): asserts resourceType is TeacherLifecycleAuditResourceType {
  if (!TEACHER_LIFECYCLE_AUDIT_RESOURCE_TYPES.includes(resourceType as never)) {
    throw new TeacherLifecycleAuditContractError();
  }
}

export function assertTeacherLifecycleTrustedUuid(value: string): void {
  if (!UUID_PATTERN.test(value)) {
    throw new TeacherLifecycleAuditContractError();
  }
}

export function buildTeacherLifecycleAuditMetadata(
  input: TeacherLifecycleAuditMetadataInput | Record<string, unknown> = {},
): TeacherLifecycleAuditMetadata {
  assertPlainRecord(input);
  const unknownKeys = Object.keys(input).filter(
    (key) => !METADATA_KEYS.includes(key as never),
  );
  if (unknownKeys.length > 0) throw new TeacherLifecycleAuditContractError();

  const metadata: TeacherLifecycleAuditMetadataInput = {};
  for (const key of ['userId', 'membershipId', 'teacherProfileId'] as const) {
    const value = input[key];
    if (value !== undefined) {
      if (typeof value !== 'string') {
        throw new TeacherLifecycleAuditContractError();
      }
      assertTeacherLifecycleTrustedUuid(value);
      metadata[key] = value;
    }
  }

  if (input.changedFields !== undefined) {
    if (
      !Array.isArray(input.changedFields) ||
      input.changedFields.some(
        (field) =>
          typeof field !== 'string' ||
          !TEACHER_LIFECYCLE_CHANGED_FIELDS.includes(field as never),
      )
    ) {
      throw new TeacherLifecycleAuditContractError();
    }
    metadata.changedFields = [
      ...new Set(input.changedFields),
    ].sort() as TeacherLifecycleChangedField[];
  }

  for (const key of ['previousValue', 'nextValue'] as const) {
    const value = input[key];
    if (value !== undefined) {
      if (
        typeof value !== 'string' ||
        !TEACHER_LIFECYCLE_AUDIT_ENUM_VALUES.includes(value as never)
      ) {
        throw new TeacherLifecycleAuditContractError();
      }
      metadata[key] = value as TeacherLifecycleAuditEnumValue;
    }
  }

  if (input.allocationDependencyCounts !== undefined) {
    assertPlainRecord(input.allocationDependencyCounts);
    if (
      Object.keys(input.allocationDependencyCounts).length !==
        DEPENDENCY_COUNT_KEYS.length ||
      DEPENDENCY_COUNT_KEYS.some(
        (key) => !isNonNegativeInteger(input.allocationDependencyCounts?.[key]),
      )
    ) {
      throw new TeacherLifecycleAuditContractError();
    }
    metadata.allocationDependencyCounts = Object.fromEntries(
      DEPENDENCY_COUNT_KEYS.map((key) => [
        key,
        input.allocationDependencyCounts?.[key],
      ]),
    ) as TeacherLifecycleAuditMetadataInput['allocationDependencyCounts'];
  }

  if (input.termStateLabels !== undefined) {
    if (
      !Array.isArray(input.termStateLabels) ||
      input.termStateLabels.some(
        (value) =>
          typeof value !== 'string' ||
          !TEACHER_ALLOCATION_TERM_STATE_LABELS.includes(value as never),
      )
    ) {
      throw new TeacherLifecycleAuditContractError();
    }
    const selected = new Set(input.termStateLabels);
    metadata.termStateLabels = TEACHER_ALLOCATION_TERM_STATE_LABELS.filter(
      (state) => selected.has(state),
    );
  }

  if (input.reasonCode !== undefined) {
    if (
      typeof input.reasonCode !== 'string' ||
      !TEACHER_LIFECYCLE_AUDIT_REASON_CODES.includes(input.reasonCode as never)
    ) {
      throw new TeacherLifecycleAuditContractError();
    }
    metadata.reasonCode = input.reasonCode as TeacherLifecycleAuditReasonCode;
  }

  for (const key of ['hasPassword', 'mustChangePassword'] as const) {
    const value = input[key];
    if (value !== undefined) {
      if (typeof value !== 'boolean') {
        throw new TeacherLifecycleAuditContractError();
      }
      metadata[key] = value;
    }
  }

  if (input.credentialVersion !== undefined) {
    if (!isNonNegativeInteger(input.credentialVersion)) {
      throw new TeacherLifecycleAuditContractError();
    }
    metadata.credentialVersion = input.credentialVersion;
  }

  return Object.freeze(metadata);
}

function assertPlainRecord(
  value: unknown,
): asserts value is Record<string, unknown> {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new TeacherLifecycleAuditContractError();
  }
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}
