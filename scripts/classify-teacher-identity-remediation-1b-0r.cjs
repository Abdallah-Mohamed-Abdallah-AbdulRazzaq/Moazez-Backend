'use strict';

const {
  classifyAllocationTermState,
} = require('./classify-teacher-directory-reality-0a.cjs');

const CLASSIFIER = 'SCHOOL-TEACHER-DIRECTORY-1B-0R';
const MODE = 'read_only';
const LOCKED_TARGET_COUNT = 18;
const MAX_PAGE_SIZE = 500;

const TOP_LEVEL_COHORTS = [
  'NO_MEMBERSHIP_HISTORY',
  'ONE_MEMBERSHIP_HISTORY',
  'MULTIPLE_MEMBERSHIP_HISTORY',
];
const ONE_MEMBERSHIP_SUBTYPES = [
  'ONE_TENANT_LINK_MISMATCH',
  'ONE_SCHOOLLESS_MEMBERSHIP',
  'ONE_TEACHER_FOOTPRINT_MISMATCH',
  'ONE_EXACT_HISTORICAL_TEACHER_MEMBERSHIP',
  'ONE_NON_TEACHER_MEMBERSHIP',
];
const MULTIPLE_MEMBERSHIP_SUBTYPES = [
  'MULTIPLE_CROSS_ORGANIZATION_HISTORY',
  'MULTIPLE_CROSS_SCHOOL_HISTORY',
  'MULTIPLE_MIXED_OR_MISMATCHED_HISTORY',
  'MULTIPLE_SAME_SCHOOL_EXACT_HISTORICAL_HISTORY',
];
const ACCOUNT_STATUSES = ['ACTIVE', 'INVITED', 'SUSPENDED', 'DISABLED'];
const ALLOCATION_STATES = [
  'future',
  'historical',
  'current_active',
  'current_inactive',
  'inconsistent',
  'invalid',
];
const ALLOCATION_RISKS = [
  'invalid',
  'inconsistent',
  'cross_school',
  'current_active',
  'future',
  'current_inactive',
  'historical_only',
  'none',
];
const REMEDIATION_FAMILIES = [
  'OWNER_DECISION_IDENTITY_RETIRE_OR_REPROVISION',
  'SAME_SCHOOL_HISTORICAL_TEACHER_REVIEW',
  'IAM_IDENTITY_CORRECTION_REQUIRED',
  'CROSS_TENANT_OR_MULTI_HISTORY_MANUAL_REVIEW',
  'ACADEMIC_DEPENDENCY_REVIEW_REQUIRED',
  'SESSION_SECURITY_REVIEW_REQUIRED',
  'HISTORICAL_PRESERVE_NO_AUTOMATIC_ACTION',
];

function zeroRecord(keys) {
  return Object.fromEntries(keys.map((key) => [key, 0]));
}

function parseExactIsoTimestamp(raw) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(
      raw,
    );
  if (!match) throw new Error('invalid_as_of');

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const millisecond = Number((match[7] ?? '').padEnd(3, '0'));
  const offsetHour = match[8] === 'Z' ? 0 : Number(match[10]);
  const offsetMinute = match[8] === 'Z' ? 0 : Number(match[11]);
  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    isLeapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth[month - 1] ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    throw new Error('invalid_as_of');
  }

  const localTime = new Date(0);
  localTime.setUTCFullYear(year, month - 1, day);
  localTime.setUTCHours(hour, minute, second, millisecond);
  const offsetSign = match[8] === 'Z' || match[9] === '+' ? 1 : -1;
  const offsetMilliseconds =
    offsetSign * (offsetHour * 60 + offsetMinute) * 60_000;
  const result = new Date(localTime.getTime() - offsetMilliseconds);
  if (Number.isNaN(result.getTime())) throw new Error('invalid_as_of');
  return result;
}

function parseArguments(argv) {
  let asOf;
  for (const argument of argv) {
    if (!argument.startsWith('--as-of=')) {
      throw new Error('unknown_argument');
    }
    if (asOf) throw new Error('duplicate_as_of');
    const raw = argument.slice('--as-of='.length);
    asOf = parseExactIsoTimestamp(raw);
  }
  if (!asOf) throw new Error('missing_as_of');
  return { asOf };
}

async function iterateCursorPages(
  findMany,
  baseArgs,
  onPage,
  pageSize = MAX_PAGE_SIZE,
) {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new Error('invalid_page_size');
  }
  let cursor;
  for (;;) {
    const page = await findMany({
      ...baseArgs,
      orderBy: { id: 'asc' },
      take: pageSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!Array.isArray(page)) throw new Error('invalid_page');
    if (page.length === 0) {
      await onPage([], { terminal: true });
      return;
    }
    let previous = cursor;
    for (const row of page) {
      if (typeof row.id !== 'string' || (previous && row.id <= previous)) {
        throw new Error('non_monotonic_cursor');
      }
      previous = row.id;
    }
    await onPage(page, { terminal: false });
    cursor = page.at(-1).id;
  }
}

async function readAll(findMany, baseArgs, pageSize = MAX_PAGE_SIZE) {
  const rows = [];
  await iterateCursorPages(
    findMany,
    baseArgs,
    (page) => {
      rows.push(...page);
    },
    pageSize,
  );
  return rows;
}

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function sanitizeUser(row) {
  const sanitized = {
    id: row.id,
    userType: row.userType,
    status: row.status,
    deletedAt: row.deletedAt,
    hasUsername: hasValue(row.username),
    hasContactEmail: hasValue(row.contactEmail),
    hasPassword: hasValue(row.passwordHash),
    mustChangePassword: row.mustChangePassword === true,
    passwordProvisioned: row.passwordProvisionedAt != null,
    credentialVersion: Number.isInteger(row.credentialVersion)
      ? row.credentialVersion
      : 0,
  };
  row.username = undefined;
  row.contactEmail = undefined;
  row.passwordHash = undefined;
  return sanitized;
}

function isOperationalMembership(membership) {
  return (
    membership.status === 'ACTIVE' &&
    membership.endedAt == null &&
    membership.deletedAt == null
  );
}

function hasMembershipSchoolOrganizationMismatch(membership) {
  return (
    membership.schoolId != null &&
    membership.school != null &&
    membership.organizationId !== membership.school.organizationId
  );
}

function hasTenantLinkMismatch(membership) {
  return (
    (membership.schoolId != null && membership.school == null) ||
    membership.organization == null ||
    hasMembershipSchoolOrganizationMismatch(membership) ||
    (membership.role?.schoolId != null &&
      membership.role.schoolId !== membership.schoolId)
  );
}

function isStructurallyExactTeacherMembership(membership) {
  return (
    membership.schoolId != null &&
    membership.userType === 'TEACHER' &&
    membership.role?.key === 'teacher' &&
    membership.role.deletedAt == null &&
    (membership.role.schoolId == null ||
      membership.role.schoolId === membership.schoolId) &&
    membership.school != null &&
    membership.school.deletedAt == null &&
    membership.organization != null &&
    membership.organization.deletedAt == null &&
    membership.organizationId === membership.school.organizationId
  );
}

function isExactOperationalTeacherMembership(membership) {
  return (
    isOperationalMembership(membership) &&
    isStructurallyExactTeacherMembership(membership)
  );
}

function hasTeacherSignal(user, membership) {
  return (
    user.userType === 'TEACHER' ||
    membership.userType === 'TEACHER' ||
    membership.role?.key === 'teacher'
  );
}

function historicalMembershipReasons(membership) {
  return {
    statusInactive: membership.status === 'INACTIVE',
    statusSuspended: membership.status === 'SUSPENDED',
    statusTransferred: membership.status === 'TRANSFERRED',
    ended: membership.endedAt != null,
    softDeleted: membership.deletedAt != null,
  };
}

function classifyOneMembership(user, membership) {
  if (hasTenantLinkMismatch(membership)) {
    return 'ONE_TENANT_LINK_MISMATCH';
  }
  if (membership.schoolId == null) return 'ONE_SCHOOLLESS_MEMBERSHIP';
  if (isStructurallyExactTeacherMembership(membership)) {
    return isOperationalMembership(membership)
      ? 'ONE_TEACHER_FOOTPRINT_MISMATCH'
      : 'ONE_EXACT_HISTORICAL_TEACHER_MEMBERSHIP';
  }
  if (hasTeacherSignal(user, membership)) {
    return 'ONE_TEACHER_FOOTPRINT_MISMATCH';
  }
  return 'ONE_NON_TEACHER_MEMBERSHIP';
}

function classifyMultipleMemberships(memberships) {
  const organizationIds = new Set(
    memberships
      .map((membership) => membership.organizationId)
      .filter((value) => typeof value === 'string'),
  );
  if (
    organizationIds.size > 1 ||
    memberships.some(hasMembershipSchoolOrganizationMismatch)
  ) {
    return 'MULTIPLE_CROSS_ORGANIZATION_HISTORY';
  }
  const schoolIds = new Set(
    memberships
      .map((membership) => membership.schoolId)
      .filter((value) => typeof value === 'string'),
  );
  if (schoolIds.size > 1) return 'MULTIPLE_CROSS_SCHOOL_HISTORY';
  if (
    memberships.some(
      (membership) =>
        membership.schoolId == null ||
        !isStructurallyExactTeacherMembership(membership),
    )
  ) {
    return 'MULTIPLE_MIXED_OR_MISMATCHED_HISTORY';
  }
  return 'MULTIPLE_SAME_SCHOOL_EXACT_HISTORICAL_HISTORY';
}

function classifyMembershipHistory(user, memberships) {
  if (memberships.length === 0) {
    return { cohort: 'NO_MEMBERSHIP_HISTORY', subtype: null };
  }
  if (memberships.length === 1) {
    return {
      cohort: 'ONE_MEMBERSHIP_HISTORY',
      subtype: classifyOneMembership(user, memberships[0]),
    };
  }
  return {
    cohort: 'MULTIPLE_MEMBERSHIP_HISTORY',
    subtype: classifyMultipleMemberships(memberships),
  };
}

function isTargetUser(user, memberships, profiles) {
  return (
    user.userType === 'TEACHER' &&
    user.deletedAt == null &&
    memberships.filter(isExactOperationalTeacherMembership).length === 0 &&
    profiles.filter((profile) => profile.deletedAt == null).length === 0
  );
}

function deriveUnambiguousHistoricalSchool(memberships) {
  if (
    memberships.length === 0 ||
    memberships.some(
      (membership) => !isStructurallyExactTeacherMembership(membership),
    )
  ) {
    return null;
  }
  const schoolIds = [
    ...new Set(memberships.map((membership) => membership.schoolId)),
  ];
  return schoolIds.length === 1 ? schoolIds[0] : null;
}

function classifyProfileHistory(profiles, memberships) {
  const archived = profiles.filter((profile) => profile.deletedAt != null);
  const historicalSchoolId = deriveUnambiguousHistoricalSchool(memberships);
  const schoolIds = new Set(archived.map((profile) => profile.schoolId));
  return {
    noProfileRows: profiles.length === 0,
    hasArchivedHistory: archived.length > 0,
    archivedSameSchoolProfile:
      historicalSchoolId != null &&
      archived.some((profile) => profile.schoolId === historicalSchoolId),
    archivedOtherSchoolProfile:
      historicalSchoolId != null &&
      archived.some((profile) => profile.schoolId !== historicalSchoolId),
    multipleArchivedProfiles: archived.length > 1,
    crossSchoolArchivedProfileHistory: schoolIds.size > 1,
  };
}

function allocationHasCrossSchoolRelationship(allocation) {
  const schoolId = allocation.schoolId;
  const relatedSchoolIds = [
    allocation.term?.schoolId,
    allocation.term?.academicYear?.schoolId,
    allocation.subject?.schoolId,
    allocation.classroom?.schoolId,
    allocation.classroom?.section?.schoolId,
    allocation.classroom?.section?.grade?.schoolId,
    allocation.classroom?.section?.grade?.stage?.schoolId,
  ].filter((value) => typeof value === 'string');
  return relatedSchoolIds.some((value) => value !== schoolId);
}

function allocationHasInvalidRelation(allocation) {
  return (
    allocation.term == null ||
    allocation.term.deletedAt != null ||
    allocation.term.academicYear == null ||
    allocation.term.academicYear.deletedAt != null ||
    allocation.subject == null ||
    allocation.subject.deletedAt != null ||
    allocation.classroom == null ||
    allocation.classroom.deletedAt != null ||
    allocation.classroom.section == null ||
    allocation.classroom.section.deletedAt != null ||
    allocation.classroom.section.grade == null ||
    allocation.classroom.section.grade.deletedAt != null ||
    allocation.classroom.section.grade.stage == null ||
    allocation.classroom.section.grade.stage.deletedAt != null
  );
}

function classifyAllocationExposure(allocations, asOf) {
  const flags = Object.fromEntries(
    ALLOCATION_STATES.map((key) => [key, false]),
  );
  let crossSchool = false;
  for (const allocation of allocations) {
    const state = classifyAllocationTermState(allocation.term, asOf);
    flags[state] = true;
    if (allocationHasInvalidRelation(allocation)) flags.invalid = true;
    if (allocationHasCrossSchoolRelationship(allocation)) crossSchool = true;
  }
  const historicalOnly =
    allocations.length > 0 &&
    flags.historical &&
    !flags.future &&
    !flags.current_active &&
    !flags.current_inactive &&
    !flags.inconsistent &&
    !flags.invalid &&
    !crossSchool;
  let highestRisk = 'none';
  if (flags.invalid) highestRisk = 'invalid';
  else if (flags.inconsistent) highestRisk = 'inconsistent';
  else if (crossSchool) highestRisk = 'cross_school';
  else if (flags.current_active) highestRisk = 'current_active';
  else if (flags.future) highestRisk = 'future';
  else if (flags.current_inactive) highestRisk = 'current_inactive';
  else if (historicalOnly) highestRisk = 'historical_only';
  return {
    noAllocations: allocations.length === 0,
    historicalOnly,
    ...flags,
    crossSchool,
    highestRisk,
  };
}

function isActiveSession(session, asOf) {
  const expiresAt =
    session.expiresAt instanceof Date
      ? session.expiresAt.getTime()
      : Date.parse(session.expiresAt);
  return (
    session.revokedAt == null &&
    Number.isFinite(expiresAt) &&
    expiresAt > asOf.getTime()
  );
}

function classifyRemediationFamilies({
  user,
  memberships,
  profiles,
  allocations,
  activeSessionCount,
  membershipClassification,
  profileClassification,
  allocationClassification,
}) {
  const subtype = membershipClassification.subtype;
  const sameSchoolHistorical = [
    'ONE_EXACT_HISTORICAL_TEACHER_MEMBERSHIP',
    'MULTIPLE_SAME_SCHOOL_EXACT_HISTORICAL_HISTORY',
  ].includes(subtype);
  const iamMismatch = memberships.some(
    (membership) =>
      hasTeacherSignal(user, membership) &&
      !isStructurallyExactTeacherMembership(membership),
  );
  const crossTenantOrMulti =
    memberships.some(hasTenantLinkMismatch) ||
    [
      'MULTIPLE_CROSS_ORGANIZATION_HISTORY',
      'MULTIPLE_CROSS_SCHOOL_HISTORY',
      'MULTIPLE_MIXED_OR_MISMATCHED_HISTORY',
    ].includes(subtype);
  const academicRisk = [
    'invalid',
    'inconsistent',
    'cross_school',
    'current_active',
    'future',
  ].includes(allocationClassification.highestRisk);
  const profileHistoryConsistent =
    profileClassification.noProfileRows ||
    (profileClassification.archivedSameSchoolProfile &&
      !profileClassification.archivedOtherSchoolProfile &&
      !profileClassification.crossSchoolArchivedProfileHistory);
  const historicalPreserve =
    sameSchoolHistorical &&
    !academicRisk &&
    activeSessionCount === 0 &&
    profileHistoryConsistent;
  return {
    OWNER_DECISION_IDENTITY_RETIRE_OR_REPROVISION:
      memberships.length === 0 &&
      profiles.length === 0 &&
      allocations.length === 0,
    SAME_SCHOOL_HISTORICAL_TEACHER_REVIEW: sameSchoolHistorical,
    IAM_IDENTITY_CORRECTION_REQUIRED: iamMismatch,
    CROSS_TENANT_OR_MULTI_HISTORY_MANUAL_REVIEW: crossTenantOrMulti,
    ACADEMIC_DEPENDENCY_REVIEW_REQUIRED: academicRisk,
    SESSION_SECURITY_REVIEW_REQUIRED: activeSessionCount > 0,
    HISTORICAL_PRESERVE_NO_AUTOMATIC_ACTION: historicalPreserve,
    sameSchoolReviewWithArchivedProfile:
      sameSchoolHistorical && profileClassification.archivedSameSchoolProfile,
    sameSchoolReviewWithoutProfile:
      sameSchoolHistorical && profileClassification.noProfileRows,
  };
}

function createState(asOf) {
  return {
    asOf,
    counts: {
      totalTeacherUsers: 0,
      targetPopulation: 0,
      lockedExpectedTarget: LOCKED_TARGET_COUNT,
      classifiedTargets: 0,
      usersWithArchivedProfileHistory: 0,
      usersWithActiveOrFutureAllocations: 0,
      usersWithInvalidOrInconsistentAllocations: 0,
      sameSchoolReviewWithArchivedProfile: 0,
      sameSchoolReviewWithoutProfile: 0,
    },
    exclusiveMembershipCohorts: zeroRecord(TOP_LEVEL_COHORTS),
    oneMembershipSubtypes: zeroRecord(ONE_MEMBERSHIP_SUBTYPES),
    multipleMembershipSubtypes: zeroRecord(MULTIPLE_MEMBERSHIP_SUBTYPES),
    accountStatusCounts: zeroRecord(ACCOUNT_STATUSES),
    credentialStateCounts: {
      hasUsername: 0,
      hasContactEmail: 0,
      hasPassword: 0,
      mustChangePassword: 0,
      passwordProvisioned: 0,
      credentialVersionZero: 0,
      credentialVersionGreaterThanZero: 0,
    },
    membershipFootprintCounts: {
      ACTIVE: 0,
      INACTIVE: 0,
      TRANSFERRED: 0,
      SUSPENDED: 0,
      ended: 0,
      softDeleted: 0,
      teacherMembershipType: 0,
      teacherRoleKey: 0,
      deletedRole: 0,
      schoolless: 0,
      tenantLinkMismatch: 0,
      historicalStatusInactive: 0,
      historicalStatusSuspended: 0,
      historicalStatusTransferred: 0,
    },
    profileHistoryCounts: {
      noProfileRows: 0,
      archivedSameSchoolProfile: 0,
      archivedOtherSchoolProfile: 0,
      multipleArchivedProfiles: 0,
      crossSchoolArchivedProfileHistory: 0,
    },
    allocationExposureCounts: {
      noAllocations: 0,
      historicalOnly: 0,
      currentInactive: 0,
      currentActive: 0,
      future: 0,
      inconsistent: 0,
      invalid: 0,
      crossSchool: 0,
    },
    allocationHighestRiskCounts: zeroRecord(ALLOCATION_RISKS),
    sessionExposureCounts: {
      usersWithUnrevokedUnexpiredSession: 0,
      totalUnrevokedUnexpiredSessions: 0,
      activeUsersWithUnrevokedUnexpiredSession: 0,
      nonActiveUsersWithUnrevokedUnexpiredSession: 0,
    },
    remediationDecisionFamilyCounts: zeroRecord(REMEDIATION_FAMILIES),
  };
}

function incrementBooleanCounts(target, flags) {
  for (const [key, enabled] of Object.entries(flags)) {
    if (enabled && Object.hasOwn(target, key)) target[key] += 1;
  }
}

function processTarget(
  state,
  user,
  memberships,
  profiles,
  allocations,
  sessions,
) {
  const membershipClassification = classifyMembershipHistory(user, memberships);
  const profileClassification = classifyProfileHistory(profiles, memberships);
  const allocationClassification = classifyAllocationExposure(
    allocations,
    state.asOf,
  );
  const activeSessionCount = sessions.filter((session) =>
    isActiveSession(session, state.asOf),
  ).length;
  const remediation = classifyRemediationFamilies({
    user,
    memberships,
    profiles,
    allocations,
    activeSessionCount,
    membershipClassification,
    profileClassification,
    allocationClassification,
  });

  state.counts.targetPopulation += 1;
  state.counts.classifiedTargets += 1;
  state.exclusiveMembershipCohorts[membershipClassification.cohort] += 1;
  if (membershipClassification.cohort === 'ONE_MEMBERSHIP_HISTORY') {
    state.oneMembershipSubtypes[membershipClassification.subtype] += 1;
  } else if (
    membershipClassification.cohort === 'MULTIPLE_MEMBERSHIP_HISTORY'
  ) {
    state.multipleMembershipSubtypes[membershipClassification.subtype] += 1;
  }

  state.accountStatusCounts[user.status] += 1;
  incrementBooleanCounts(state.credentialStateCounts, {
    hasUsername: user.hasUsername,
    hasContactEmail: user.hasContactEmail,
    hasPassword: user.hasPassword,
    mustChangePassword: user.mustChangePassword,
    passwordProvisioned: user.passwordProvisioned,
    credentialVersionZero: user.credentialVersion === 0,
    credentialVersionGreaterThanZero: user.credentialVersion > 0,
  });

  const membershipFlags = {
    ACTIVE: memberships.some((membership) => membership.status === 'ACTIVE'),
    INACTIVE: memberships.some(
      (membership) => membership.status === 'INACTIVE',
    ),
    TRANSFERRED: memberships.some(
      (membership) => membership.status === 'TRANSFERRED',
    ),
    SUSPENDED: memberships.some(
      (membership) => membership.status === 'SUSPENDED',
    ),
    ended: memberships.some((membership) => membership.endedAt != null),
    softDeleted: memberships.some((membership) => membership.deletedAt != null),
    teacherMembershipType: memberships.some(
      (membership) => membership.userType === 'TEACHER',
    ),
    teacherRoleKey: memberships.some(
      (membership) => membership.role?.key === 'teacher',
    ),
    deletedRole: memberships.some(
      (membership) => membership.role?.deletedAt != null,
    ),
    schoolless: memberships.some((membership) => membership.schoolId == null),
    tenantLinkMismatch: memberships.some(hasTenantLinkMismatch),
    historicalStatusInactive: memberships.some(
      (membership) => historicalMembershipReasons(membership).statusInactive,
    ),
    historicalStatusSuspended: memberships.some(
      (membership) => historicalMembershipReasons(membership).statusSuspended,
    ),
    historicalStatusTransferred: memberships.some(
      (membership) => historicalMembershipReasons(membership).statusTransferred,
    ),
  };
  incrementBooleanCounts(state.membershipFootprintCounts, membershipFlags);
  incrementBooleanCounts(state.profileHistoryCounts, profileClassification);
  if (profileClassification.hasArchivedHistory) {
    state.counts.usersWithArchivedProfileHistory += 1;
  }
  incrementBooleanCounts(state.allocationExposureCounts, {
    noAllocations: allocationClassification.noAllocations,
    historicalOnly: allocationClassification.historicalOnly,
    currentInactive: allocationClassification.current_inactive,
    currentActive: allocationClassification.current_active,
    future: allocationClassification.future,
    inconsistent: allocationClassification.inconsistent,
    invalid: allocationClassification.invalid,
    crossSchool: allocationClassification.crossSchool,
  });
  state.allocationHighestRiskCounts[allocationClassification.highestRisk] += 1;
  if (
    allocationClassification.current_active ||
    allocationClassification.future
  ) {
    state.counts.usersWithActiveOrFutureAllocations += 1;
  }
  if (
    allocationClassification.invalid ||
    allocationClassification.inconsistent
  ) {
    state.counts.usersWithInvalidOrInconsistentAllocations += 1;
  }

  if (activeSessionCount > 0) {
    state.sessionExposureCounts.usersWithUnrevokedUnexpiredSession += 1;
    state.sessionExposureCounts.totalUnrevokedUnexpiredSessions +=
      activeSessionCount;
    if (user.status === 'ACTIVE') {
      state.sessionExposureCounts.activeUsersWithUnrevokedUnexpiredSession += 1;
    } else {
      state.sessionExposureCounts.nonActiveUsersWithUnrevokedUnexpiredSession += 1;
    }
  }
  for (const family of REMEDIATION_FAMILIES) {
    if (remediation[family]) state.remediationDecisionFamilyCounts[family] += 1;
  }
  if (remediation.sameSchoolReviewWithArchivedProfile) {
    state.counts.sameSchoolReviewWithArchivedProfile += 1;
  }
  if (remediation.sameSchoolReviewWithoutProfile) {
    state.counts.sameSchoolReviewWithoutProfile += 1;
  }
}

function sumRecord(record) {
  return Object.values(record).reduce((total, value) => total + value, 0);
}

function finalizeState(state) {
  const invariants = {
    targetMatchesLockedEvidence:
      state.counts.targetPopulation === LOCKED_TARGET_COUNT,
    topLevelCohortsSumToTarget:
      sumRecord(state.exclusiveMembershipCohorts) ===
      state.counts.targetPopulation,
    oneMembershipSubtypesSumCorrectly:
      sumRecord(state.oneMembershipSubtypes) ===
      state.exclusiveMembershipCohorts.ONE_MEMBERSHIP_HISTORY,
    multipleMembershipSubtypesSumCorrectly:
      sumRecord(state.multipleMembershipSubtypes) ===
      state.exclusiveMembershipCohorts.MULTIPLE_MEMBERSHIP_HISTORY,
    allTargetsClassifiedExactlyOnce:
      state.counts.classifiedTargets === state.counts.targetPopulation,
  };
  const classificationInvariants = [
    invariants.topLevelCohortsSumToTarget,
    invariants.oneMembershipSubtypesSumCorrectly,
    invariants.multipleMembershipSubtypesSumCorrectly,
    invariants.allTargetsClassifiedExactlyOnce,
  ];
  if (classificationInvariants.includes(false)) {
    return safeFailure(state.asOf, 'classification_invariant_failed');
  }
  const report = {
    classifier: CLASSIFIER,
    mode: MODE,
    asOf: state.asOf.toISOString(),
    ok: true,
    counts: state.counts,
    exclusiveMembershipCohorts: state.exclusiveMembershipCohorts,
    oneMembershipSubtypes: state.oneMembershipSubtypes,
    multipleMembershipSubtypes: state.multipleMembershipSubtypes,
    accountStatusCounts: state.accountStatusCounts,
    credentialStateCounts: state.credentialStateCounts,
    membershipFootprintCounts: state.membershipFootprintCounts,
    profileHistoryCounts: state.profileHistoryCounts,
    allocationExposureCounts: state.allocationExposureCounts,
    allocationHighestRiskCounts: state.allocationHighestRiskCounts,
    sessionExposureCounts: state.sessionExposureCounts,
    remediationDecisionFamilyCounts: state.remediationDecisionFamilyCounts,
    invariants,
  };
  if (!invariants.targetMatchesLockedEvidence) {
    return {
      ...report,
      ok: false,
      error: 'data_baseline_moved',
    };
  }
  return report;
}

function groupByUserId(rows, key = 'userId') {
  const grouped = new Map();
  for (const row of rows) {
    const values = grouped.get(row[key]) ?? [];
    values.push(row);
    grouped.set(row[key], values);
  }
  return grouped;
}

function membershipSelect() {
  return {
    id: true,
    userId: true,
    organizationId: true,
    schoolId: true,
    userType: true,
    status: true,
    startedAt: true,
    endedAt: true,
    deletedAt: true,
    createdAt: true,
    updatedAt: true,
    role: { select: { key: true, schoolId: true, deletedAt: true } },
    school: {
      select: { organizationId: true, status: true, deletedAt: true },
    },
    organization: { select: { status: true, deletedAt: true } },
  };
}

function profileSelect() {
  return {
    id: true,
    userId: true,
    schoolId: true,
    employmentStatus: true,
    deletedAt: true,
    createdAt: true,
    updatedAt: true,
  };
}

function allocationSelect() {
  return {
    id: true,
    teacherUserId: true,
    schoolId: true,
    term: {
      select: {
        schoolId: true,
        isActive: true,
        startDate: true,
        endDate: true,
        deletedAt: true,
        academicYear: {
          select: { schoolId: true, isActive: true, deletedAt: true },
        },
      },
    },
    subject: { select: { schoolId: true, deletedAt: true } },
    classroom: {
      select: {
        schoolId: true,
        deletedAt: true,
        section: {
          select: {
            schoolId: true,
            deletedAt: true,
            grade: {
              select: {
                schoolId: true,
                deletedAt: true,
                stage: { select: { schoolId: true, deletedAt: true } },
              },
            },
          },
        },
      },
    },
  };
}

async function classifyDatabase(prisma, asOf, pageSize = MAX_PAGE_SIZE) {
  const state = createState(asOf);
  await iterateCursorPages(
    prisma.user.findMany.bind(prisma.user),
    {
      where: { userType: 'TEACHER', deletedAt: null },
      select: {
        id: true,
        userType: true,
        status: true,
        deletedAt: true,
        username: true,
        contactEmail: true,
        passwordHash: true,
        mustChangePassword: true,
        passwordProvisionedAt: true,
        credentialVersion: true,
      },
    },
    async (rawUsers, page) => {
      if (page.terminal) return;
      const users = rawUsers.map(sanitizeUser);
      state.counts.totalTeacherUsers += users.length;
      const userIds = users.map((user) => user.id);
      const memberships = await readAll(
        prisma.membership.findMany.bind(prisma.membership),
        { where: { userId: { in: userIds } }, select: membershipSelect() },
        pageSize,
      );
      const profiles = await readAll(
        prisma.teacherProfile.findMany.bind(prisma.teacherProfile),
        { where: { userId: { in: userIds } }, select: profileSelect() },
        pageSize,
      );
      const membershipsByUser = groupByUserId(memberships);
      const profilesByUser = groupByUserId(profiles);
      const targets = users.filter((user) =>
        isTargetUser(
          user,
          membershipsByUser.get(user.id) ?? [],
          profilesByUser.get(user.id) ?? [],
        ),
      );
      if (targets.length === 0) return;
      const targetIds = targets.map((user) => user.id);
      const allocations = await readAll(
        prisma.teacherSubjectAllocation.findMany.bind(
          prisma.teacherSubjectAllocation,
        ),
        {
          where: { teacherUserId: { in: targetIds } },
          select: allocationSelect(),
        },
        pageSize,
      );
      const sessions = await readAll(
        prisma.session.findMany.bind(prisma.session),
        {
          where: {
            userId: { in: targetIds },
            revokedAt: null,
            expiresAt: { gt: asOf },
          },
          select: { id: true, userId: true, expiresAt: true, revokedAt: true },
        },
        pageSize,
      );
      const allocationsByUser = groupByUserId(allocations, 'teacherUserId');
      const sessionsByUser = groupByUserId(sessions);
      for (const user of targets) {
        processTarget(
          state,
          user,
          membershipsByUser.get(user.id) ?? [],
          profilesByUser.get(user.id) ?? [],
          allocationsByUser.get(user.id) ?? [],
          sessionsByUser.get(user.id) ?? [],
        );
      }
    },
    pageSize,
  );
  return finalizeState(state);
}

function safeFailure(asOf, error) {
  return {
    classifier: CLASSIFIER,
    mode: MODE,
    asOf: asOf instanceof Date ? asOf.toISOString() : null,
    ok: false,
    error,
  };
}

async function runCli(argv, dependencies = {}) {
  const write = dependencies.write ?? ((value) => process.stdout.write(value));
  let asOf;
  try {
    ({ asOf } = parseArguments(argv));
  } catch (error) {
    write(`${JSON.stringify(safeFailure(null, error.message))}\n`);
    return 2;
  }

  const createPrisma =
    dependencies.createPrisma ??
    (() => {
      require('dotenv/config');
      const { PrismaClient } = require('@prisma/client');
      return new PrismaClient();
    });
  let prisma;
  let report;
  let failed = false;
  try {
    prisma = createPrisma();
    report = await classifyDatabase(prisma, asOf);
  } catch {
    failed = true;
  } finally {
    if (prisma) {
      try {
        await prisma.$disconnect();
      } catch {
        failed = true;
      }
    }
  }
  if (failed) report = safeFailure(asOf, 'database_read_failed');
  write(`${JSON.stringify(report, null, 2)}\n`);
  return report.ok ? 0 : 1;
}

if (require.main === module) {
  void runCli(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}

module.exports = {
  ACCOUNT_STATUSES,
  ALLOCATION_RISKS,
  CLASSIFIER,
  LOCKED_TARGET_COUNT,
  MAX_PAGE_SIZE,
  MULTIPLE_MEMBERSHIP_SUBTYPES,
  ONE_MEMBERSHIP_SUBTYPES,
  REMEDIATION_FAMILIES,
  TOP_LEVEL_COHORTS,
  allocationHasCrossSchoolRelationship,
  classifyAllocationExposure,
  classifyDatabase,
  classifyMembershipHistory,
  classifyMultipleMemberships,
  classifyOneMembership,
  classifyProfileHistory,
  classifyRemediationFamilies,
  createState,
  deriveUnambiguousHistoricalSchool,
  finalizeState,
  hasTenantLinkMismatch,
  isActiveSession,
  isExactOperationalTeacherMembership,
  isStructurallyExactTeacherMembership,
  isTargetUser,
  iterateCursorPages,
  parseArguments,
  parseExactIsoTimestamp,
  processTarget,
  runCli,
  safeFailure,
  sanitizeUser,
};
