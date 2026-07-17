'use strict';

const DEFAULT_SAMPLE_LIMIT = 20;
const MAX_SAMPLE_LIMIT = 50;
const READ_PAGE_SIZE = 500;
const ALLOCATION_TERM_STATES = [
  'future',
  'historical',
  'current_active',
  'current_inactive',
  'inconsistent',
  'invalid',
];
const ANOMALY_CATEGORIES = [
  'teacherUsersWithoutActiveTeacherMemberships',
  'activeTeacherMembershipsWhoseUserIsNotTeacher',
  'teacherUsersWithMoreThanOneActiveTeacherMembership',
  'teacherUsersWithRoleKeyOrUserTypeMismatch',
  'activeTeacherFootprintsWithRoleOrUserTypeMismatch',
  'teacherUsersMissingUsername',
  'teacherUsersMissingContactEmail',
  'teacherUsersMissingPasswordHash',
  'teacherUsersWithMustChangePassword',
  'teacherAllocationsWithInvalidTeacherMembershipState',
  'activeOrFutureAllocationsWithInvalidTeacherMembershipState',
  'teacherAllocationsWithInvalidSchoolRelationships',
  'teacherAllocationsWithInconsistentTermState',
  'teacherAllocationsWithInvalidTermState',
  'teacherUsersRequiringFutureTeacherProfileBackfill',
  'teacherUsersWhoseProfileBackfillRequiresRemediation',
];

function isOperationallyActiveMembership(membership) {
  return (
    membership.status === 'ACTIVE' &&
    membership.endedAt == null &&
    membership.deletedAt == null
  );
}

function classifyMemberships(teacherUsers, memberships) {
  const teacherUserIds = new Set(teacherUsers.map((user) => user.id));
  const activeMemberships = memberships.filter(isOperationallyActiveMembership);
  const activeTeacherMemberships = activeMemberships.filter(
    (membership) => membership.userType === 'TEACHER',
  );
  const activeTeacherMembershipsByUserId = groupBy(
    activeTeacherMemberships,
    (membership) => membership.userId,
  );

  const withActiveTeacherMembership = [];
  const withoutActiveTeacherMembership = [];
  const withMultipleActiveTeacherMemberships = [];

  for (const user of teacherUsers) {
    const activeForUser = activeTeacherMembershipsByUserId.get(user.id) ?? [];
    if (activeForUser.length > 0) {
      withActiveTeacherMembership.push(user.id);
    } else {
      withoutActiveTeacherMembership.push(user.id);
    }
    if (activeForUser.length > 1) {
      withMultipleActiveTeacherMemberships.push(user.id);
    }
  }

  const nonTeacherUserMembershipIds = activeTeacherMemberships
    .filter(
      (membership) =>
        membership.user == null ||
        membership.user.userType !== 'TEACHER' ||
        membership.user.deletedAt != null,
    )
    .map((membership) => membership.id);

  return {
    teacherUserIds,
    activeMemberships,
    activeTeacherMemberships,
    withActiveTeacherMembership,
    withoutActiveTeacherMembership,
    withMultipleActiveTeacherMemberships,
    nonTeacherUserMembershipIds,
  };
}

function classifyRoleAndUserTypeMismatch(teacherUsers, memberships) {
  const activeMemberships = memberships.filter(isOperationallyActiveMembership);
  const activeMembershipsByUserId = groupBy(
    activeMemberships,
    (membership) => membership.userId,
  );
  const mismatchUserIds = [];
  const mismatchedTeacherFootprintMembershipIds = [];
  const mismatchedRoleKeyCounts = new Map();

  for (const user of teacherUsers) {
    const membershipsForUser = activeMembershipsByUserId.get(user.id) ?? [];
    const hasMismatch = membershipsForUser.some(
      (membership) =>
        membership.userType !== 'TEACHER' || membership.roleKey !== 'teacher',
    );
    if (hasMismatch) mismatchUserIds.push(user.id);
  }

  for (const membership of activeMemberships) {
    const hasTeacherFootprint =
      membership.userType === 'TEACHER' ||
      membership.user?.userType === 'TEACHER' ||
      membership.roleKey === 'teacher';
    const isConsistentTeacher =
      membership.userType === 'TEACHER' &&
      membership.user?.userType === 'TEACHER' &&
      membership.user?.deletedAt == null &&
      membership.roleKey === 'teacher';

    if (hasTeacherFootprint && !isConsistentTeacher) {
      mismatchedTeacherFootprintMembershipIds.push(membership.id);
      const roleKey = membership.roleKey ?? '<missing>';
      mismatchedRoleKeyCounts.set(
        roleKey,
        (mismatchedRoleKeyCounts.get(roleKey) ?? 0) + 1,
      );
    }
  }

  return {
    mismatchUserIds: uniqueSorted(mismatchUserIds),
    mismatchedTeacherFootprintMembershipIds: uniqueSorted(
      mismatchedTeacherFootprintMembershipIds,
    ),
    mismatchedRoleKeyCounts: sortedCountRecord(mismatchedRoleKeyCounts),
  };
}

function classifyCredentialReadiness(user) {
  return {
    missingUsername: user.hasUsername !== true,
    missingContactEmail: user.hasContactEmail !== true,
    missingPasswordHash: user.hasPasswordHash !== true,
    mustChangePassword: user.mustChangePassword === true,
  };
}

function classifyAllocationTermState(term, asOf = new Date()) {
  const asOfTime = toTimestamp(asOf);
  if (asOfTime == null || !term || term.academicYear == null) {
    return 'invalid';
  }

  const startTime = toTimestamp(term.startDate);
  const endTime = toTimestamp(term.endDate);
  if (startTime == null || endTime == null) return 'invalid';
  if (startTime > endTime) return 'inconsistent';

  const termIsActive = term.isActive === true;
  const academicYearIsActive =
    term.academicYear.isActive === true && term.academicYear.deletedAt == null;

  if (startTime > asOfTime) {
    return termIsActive ? 'inconsistent' : 'future';
  }
  if (endTime < asOfTime) {
    return termIsActive ? 'inconsistent' : 'historical';
  }

  if (
    termIsActive &&
    (term.deletedAt != null || academicYearIsActive !== true)
  ) {
    return 'inconsistent';
  }

  return termIsActive && academicYearIsActive
    ? 'current_active'
    : 'current_inactive';
}

function hasInvalidAllocationSchoolRelationships(allocation) {
  const relatedSchoolIds = [
    allocation.term?.schoolId,
    allocation.term?.academicYear?.schoolId,
    allocation.subject?.schoolId,
    allocation.classroom?.schoolId,
    allocation.classroom?.section?.schoolId,
    allocation.classroom?.section?.grade?.schoolId,
    allocation.classroom?.section?.grade?.stage?.schoolId,
  ];

  return relatedSchoolIds.some(
    (schoolId) => schoolId == null || schoolId !== allocation.schoolId,
  );
}

function hasValidTeacherMembershipForAllocation(allocation, memberships) {
  if (
    allocation.teacherUser == null ||
    allocation.teacherUser.userType !== 'TEACHER' ||
    allocation.teacherUser.deletedAt != null
  ) {
    return false;
  }

  return memberships.some(
    (membership) =>
      membership.userId === allocation.teacherUserId &&
      membership.schoolId === allocation.schoolId &&
      membership.userType === 'TEACHER' &&
      membership.roleKey === 'teacher' &&
      isOperationallyActiveMembership(membership),
  );
}

function buildClassification(snapshot, options = {}) {
  const asOf = options.asOf ?? new Date();
  const sampleLimit = clampSampleLimit(options.sampleLimit);
  const teacherUsers = snapshot.teacherUsers ?? [];
  const memberships = snapshot.memberships ?? [];
  const allocations = snapshot.allocations ?? [];
  const membershipClassification = classifyMemberships(
    teacherUsers,
    memberships,
  );
  const mismatchClassification = classifyRoleAndUserTypeMismatch(
    teacherUsers,
    memberships,
  );
  const teacherUserIds = membershipClassification.teacherUserIds;
  const allocatedTeacherUserIds = new Set(
    allocations
      .filter((allocation) => teacherUserIds.has(allocation.teacherUserId))
      .map((allocation) => allocation.teacherUserId),
  );

  const credentialIds = {
    missingUsername: [],
    missingContactEmail: [],
    missingPasswordHash: [],
    mustChangePassword: [],
  };
  for (const user of teacherUsers) {
    const readiness = classifyCredentialReadiness(user);
    for (const category of Object.keys(credentialIds)) {
      if (readiness[category]) credentialIds[category].push(user.id);
    }
  }

  const allocationsByTermState = Object.fromEntries(
    ALLOCATION_TERM_STATES.map((termState) => [termState, 0]),
  );
  const invalidMembershipAllocationIds = [];
  const activeOrFutureInvalidMembershipAllocationIds = [];
  const invalidSchoolRelationshipAllocationIds = [];
  const inconsistentTermAllocationIds = [];
  const invalidTermAllocationIds = [];

  for (const allocation of allocations) {
    const termState = classifyAllocationTermState(allocation.term, asOf);
    allocationsByTermState[termState] += 1;

    if (!hasValidTeacherMembershipForAllocation(allocation, memberships)) {
      invalidMembershipAllocationIds.push(allocation.id);
      if (isActiveOrFutureAllocationState(termState)) {
        activeOrFutureInvalidMembershipAllocationIds.push(allocation.id);
      }
    }
    if (hasInvalidAllocationSchoolRelationships(allocation)) {
      invalidSchoolRelationshipAllocationIds.push(allocation.id);
    }
    if (termState === 'inconsistent') {
      inconsistentTermAllocationIds.push(allocation.id);
    }
    if (termState === 'invalid') {
      invalidTermAllocationIds.push(allocation.id);
    }
  }

  const activeTeacherUserIds = teacherUsers
    .filter((user) => user.status === 'ACTIVE')
    .map((user) => user.id);
  const disabledOrSuspendedTeacherUserIds = teacherUsers
    .filter((user) => user.status === 'DISABLED' || user.status === 'SUSPENDED')
    .map((user) => user.id);
  const invitedTeacherUserIds = teacherUsers
    .filter((user) => user.status === 'INVITED')
    .map((user) => user.id);
  const teacherUsersWithAllocations = teacherUsers
    .filter((user) => allocatedTeacherUserIds.has(user.id))
    .map((user) => user.id);
  const teacherUsersWithoutAllocations = teacherUsers
    .filter((user) => !allocatedTeacherUserIds.has(user.id))
    .map((user) => user.id);
  const backfillBlockedUserIds = uniqueSorted([
    ...membershipClassification.withoutActiveTeacherMembership,
    ...membershipClassification.withMultipleActiveTeacherMemberships,
    ...mismatchClassification.mismatchUserIds,
  ]);

  const counts = {
    totalTeacherUsers: teacherUsers.length,
    activeTeacherUsers: activeTeacherUserIds.length,
    disabledOrSuspendedTeacherUsers: disabledOrSuspendedTeacherUserIds.length,
    invitedTeacherUsers: invitedTeacherUserIds.length,
    teacherUsersWithActiveTeacherMemberships:
      membershipClassification.withActiveTeacherMembership.length,
    teacherUsersWithoutActiveTeacherMemberships:
      membershipClassification.withoutActiveTeacherMembership.length,
    activeTeacherMembershipsWhoseUserIsNotTeacher:
      membershipClassification.nonTeacherUserMembershipIds.length,
    teacherUsersWithMoreThanOneActiveTeacherMembership:
      membershipClassification.withMultipleActiveTeacherMemberships.length,
    teacherUsersWithAllocations: teacherUsersWithAllocations.length,
    teacherUsersWithoutAllocations: teacherUsersWithoutAllocations.length,
    teacherUsersMissingUsername: credentialIds.missingUsername.length,
    teacherUsersMissingContactEmail: credentialIds.missingContactEmail.length,
    teacherUsersMissingPasswordHash: credentialIds.missingPasswordHash.length,
    teacherUsersWithMustChangePassword: credentialIds.mustChangePassword.length,
    teacherUsersWithRoleKeyOrUserTypeMismatch:
      mismatchClassification.mismatchUserIds.length,
    teacherAllocationsWithInvalidTeacherMembershipState:
      invalidMembershipAllocationIds.length,
    activeOrFutureAllocationsWithInvalidTeacherMembershipState:
      activeOrFutureInvalidMembershipAllocationIds.length,
    teacherAllocationsWithInvalidSchoolRelationships:
      invalidSchoolRelationshipAllocationIds.length,
    teacherAllocationsWithInconsistentTermState:
      inconsistentTermAllocationIds.length,
    teacherAllocationsWithInvalidTermState: invalidTermAllocationIds.length,
    teacherUsersRequiringFutureTeacherProfileBackfill: teacherUsers.length,
    teacherUsersWhoseProfileBackfillRequiresRemediation:
      backfillBlockedUserIds.length,
  };

  return formatSafeReport(
    {
      asOf: asOf.toISOString(),
      counts,
      allocationsByTermState,
      mismatchedRoleKeyCounts: mismatchClassification.mismatchedRoleKeyCounts,
      anomalyIds: {
        teacherUsersWithoutActiveTeacherMemberships:
          membershipClassification.withoutActiveTeacherMembership,
        activeTeacherMembershipsWhoseUserIsNotTeacher:
          membershipClassification.nonTeacherUserMembershipIds,
        teacherUsersWithMoreThanOneActiveTeacherMembership:
          membershipClassification.withMultipleActiveTeacherMemberships,
        teacherUsersWithRoleKeyOrUserTypeMismatch:
          mismatchClassification.mismatchUserIds,
        activeTeacherFootprintsWithRoleOrUserTypeMismatch:
          mismatchClassification.mismatchedTeacherFootprintMembershipIds,
        teacherUsersMissingUsername: credentialIds.missingUsername,
        teacherUsersMissingContactEmail: credentialIds.missingContactEmail,
        teacherUsersMissingPasswordHash: credentialIds.missingPasswordHash,
        teacherUsersWithMustChangePassword: credentialIds.mustChangePassword,
        teacherAllocationsWithInvalidTeacherMembershipState:
          invalidMembershipAllocationIds,
        activeOrFutureAllocationsWithInvalidTeacherMembershipState:
          activeOrFutureInvalidMembershipAllocationIds,
        teacherAllocationsWithInvalidSchoolRelationships:
          invalidSchoolRelationshipAllocationIds,
        teacherAllocationsWithInconsistentTermState:
          inconsistentTermAllocationIds,
        teacherAllocationsWithInvalidTermState: invalidTermAllocationIds,
        teacherUsersRequiringFutureTeacherProfileBackfill: teacherUsers.map(
          (user) => user.id,
        ),
        teacherUsersWhoseProfileBackfillRequiresRemediation:
          backfillBlockedUserIds,
      },
    },
    { sampleLimit },
  );
}

function formatSafeReport(classification, options = {}) {
  const sampleLimit = clampSampleLimit(options.sampleLimit);
  const counts = { ...(classification.counts ?? {}) };
  const anomalies = {};

  for (const [category, value] of Object.entries(
    classification.anomalies ?? classification.anomalyIds ?? {},
  )) {
    const ids = Array.isArray(value) ? uniqueSorted(value) : null;
    const recordSampleIds = Array.isArray(value?.sampleIds)
      ? uniqueSorted(value.sampleIds)
      : [];
    anomalies[category] = {
      count: ids
        ? ids.length
        : Number.isInteger(value?.count) && value.count >= 0
          ? value.count
          : 0,
      sampleIds: (ids ?? recordSampleIds).slice(0, sampleLimit),
    };
  }

  return {
    classifier: 'SCHOOL-TEACHER-DIRECTORY-0A',
    mode: 'read_only',
    generatedAt: new Date().toISOString(),
    asOf: classification.asOf,
    sampleLimit,
    counts,
    allocationsByTermState: Object.fromEntries(
      ALLOCATION_TERM_STATES.map((termState) => [
        termState,
        classification.allocationsByTermState?.[termState] ?? 0,
      ]),
    ),
    mismatchedRoleKeyCounts: {
      ...(classification.mismatchedRoleKeyCounts ?? {}),
    },
    anomalies,
  };
}

function strictModeExitCode(report, strict) {
  if (!strict) return 0;
  const anomalyCount = Object.values(report.anomalies ?? {}).reduce(
    (total, anomaly) => total + (Number(anomaly.count) || 0),
    0,
  );
  return anomalyCount > 0 ? 2 : 0;
}

async function classifyReality(prisma, options = {}) {
  const state = createIncrementalState(options);

  await iterateCursorPages(
    prisma.membership,
    {
      select: membershipSelect(true),
    },
    (rows) => processGlobalMembershipPage(state, normalizeMemberships(rows)),
  );

  await iterateCursorPages(
    prisma.user,
    {
      where: { userType: 'TEACHER', deletedAt: null },
      select: {
        id: true,
        status: true,
        username: true,
        contactEmail: true,
        passwordHash: true,
        mustChangePassword: true,
      },
    },
    async (rows) => {
      const teacherUsers = rows.map(sanitizeTeacherUser);
      const userIds = teacherUsers.map((user) => user.id);
      const membershipStats = await loadTeacherPageMembershipStats(
        prisma,
        userIds,
      );
      const allocatedTeacherUserIds = await loadAllocatedTeacherUserIds(
        prisma,
        userIds,
      );
      processTeacherUserPage(
        state,
        teacherUsers,
        membershipStats,
        allocatedTeacherUserIds,
      );
    },
  );

  await iterateCursorPages(
    prisma.teacherSubjectAllocation,
    { select: allocationSelect() },
    async (allocations) => {
      const validMembershipKeys = await loadValidMembershipKeys(
        prisma,
        uniqueSorted(allocations.map((allocation) => allocation.teacherUserId)),
      );
      processAllocationPage(state, allocations, validMembershipKeys);
    },
  );

  return finalizeIncrementalState(state);
}

async function iterateCursorPages(
  delegate,
  baseQuery,
  processPage,
  options = {},
) {
  const pageSize = options.pageSize ?? READ_PAGE_SIZE;
  if (
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > READ_PAGE_SIZE
  ) {
    throw new Error('invalid_page_size');
  }

  let cursorId = null;
  let previousId = null;
  let pageCount = 0;
  let rowCount = 0;

  while (true) {
    const query = {
      ...baseQuery,
      orderBy: { id: 'asc' },
      take: pageSize,
      ...(cursorId == null ? {} : { cursor: { id: cursorId }, skip: 1 }),
    };
    const rows = await delegate.findMany(query);
    if (!Array.isArray(rows)) throw new Error('invalid_page_result');
    if (rows.length === 0) break;

    for (const row of rows) {
      if (
        typeof row?.id !== 'string' ||
        (previousId != null && row.id <= previousId)
      ) {
        throw new Error('non_monotonic_page');
      }
      previousId = row.id;
    }

    await processPage(rows, { pageIndex: pageCount, cursorId });
    cursorId = rows.at(-1).id;
    pageCount += 1;
    rowCount += rows.length;
  }

  return { pageCount, rowCount, lastCursorId: cursorId };
}

async function loadTeacherPageMembershipStats(prisma, userIds) {
  const stats = new Map(
    userIds.map((userId) => [
      userId,
      { activeTeacherMembershipCount: 0, hasRoleOrTypeMismatch: false },
    ]),
  );
  if (userIds.length === 0) return stats;

  await iterateCursorPages(
    prisma.membership,
    {
      where: { userId: { in: userIds } },
      select: membershipSelect(false),
    },
    (rows) => {
      for (const membership of normalizeMemberships(rows)) {
        const userStats = stats.get(membership.userId);
        if (!userStats || !isOperationallyActiveMembership(membership)) {
          continue;
        }
        if (membership.userType === 'TEACHER') {
          userStats.activeTeacherMembershipCount += 1;
        }
        if (
          membership.userType !== 'TEACHER' ||
          membership.roleKey !== 'teacher'
        ) {
          userStats.hasRoleOrTypeMismatch = true;
        }
      }
    },
  );

  return stats;
}

async function loadAllocatedTeacherUserIds(prisma, userIds) {
  const allocatedTeacherUserIds = new Set();
  if (userIds.length === 0) return allocatedTeacherUserIds;

  await iterateCursorPages(
    prisma.teacherSubjectAllocation,
    {
      where: { teacherUserId: { in: userIds } },
      select: { id: true, teacherUserId: true },
    },
    (rows) => {
      for (const row of rows) allocatedTeacherUserIds.add(row.teacherUserId);
    },
  );

  return allocatedTeacherUserIds;
}

async function loadValidMembershipKeys(prisma, userIds) {
  const validMembershipKeys = new Set();
  if (userIds.length === 0) return validMembershipKeys;

  await iterateCursorPages(
    prisma.membership,
    {
      where: { userId: { in: userIds } },
      select: membershipSelect(false),
    },
    (rows) => {
      for (const membership of normalizeMemberships(rows)) {
        if (
          membership.userType === 'TEACHER' &&
          membership.roleKey === 'teacher' &&
          isOperationallyActiveMembership(membership)
        ) {
          validMembershipKeys.add(
            membershipSchoolKey(membership.userId, membership.schoolId),
          );
        }
      }
    },
  );

  return validMembershipKeys;
}

function createIncrementalState(options = {}) {
  const anomalies = {};
  for (const category of ANOMALY_CATEGORIES) {
    anomalies[category] = { count: 0, sampleIds: [], sampleIdSet: new Set() };
  }

  return {
    asOf: options.asOf ?? new Date(),
    sampleLimit: clampSampleLimit(options.sampleLimit),
    counts: {
      totalTeacherUsers: 0,
      activeTeacherUsers: 0,
      disabledOrSuspendedTeacherUsers: 0,
      invitedTeacherUsers: 0,
      teacherUsersWithActiveTeacherMemberships: 0,
      teacherUsersWithoutActiveTeacherMemberships: 0,
      activeTeacherMembershipsWhoseUserIsNotTeacher: 0,
      teacherUsersWithMoreThanOneActiveTeacherMembership: 0,
      teacherUsersWithAllocations: 0,
      teacherUsersWithoutAllocations: 0,
      teacherUsersMissingUsername: 0,
      teacherUsersMissingContactEmail: 0,
      teacherUsersMissingPasswordHash: 0,
      teacherUsersWithMustChangePassword: 0,
      teacherUsersWithRoleKeyOrUserTypeMismatch: 0,
      teacherAllocationsWithInvalidTeacherMembershipState: 0,
      activeOrFutureAllocationsWithInvalidTeacherMembershipState: 0,
      teacherAllocationsWithInvalidSchoolRelationships: 0,
      teacherAllocationsWithInconsistentTermState: 0,
      teacherAllocationsWithInvalidTermState: 0,
      teacherUsersRequiringFutureTeacherProfileBackfill: 0,
      teacherUsersWhoseProfileBackfillRequiresRemediation: 0,
    },
    allocationsByTermState: Object.fromEntries(
      ALLOCATION_TERM_STATES.map((termState) => [termState, 0]),
    ),
    mismatchedRoleKeyCounts: new Map(),
    anomalies,
  };
}

function processGlobalMembershipPage(state, memberships) {
  for (const membership of memberships) {
    if (!isOperationallyActiveMembership(membership)) continue;

    if (
      membership.userType === 'TEACHER' &&
      (membership.user == null ||
        membership.user.userType !== 'TEACHER' ||
        membership.user.deletedAt != null)
    ) {
      state.counts.activeTeacherMembershipsWhoseUserIsNotTeacher += 1;
      recordAnomaly(
        state,
        'activeTeacherMembershipsWhoseUserIsNotTeacher',
        membership.id,
      );
    }

    const hasTeacherFootprint =
      membership.userType === 'TEACHER' ||
      membership.user?.userType === 'TEACHER' ||
      membership.roleKey === 'teacher';
    const isConsistentTeacher =
      membership.userType === 'TEACHER' &&
      membership.user?.userType === 'TEACHER' &&
      membership.user?.deletedAt == null &&
      membership.roleKey === 'teacher';

    if (hasTeacherFootprint && !isConsistentTeacher) {
      recordAnomaly(
        state,
        'activeTeacherFootprintsWithRoleOrUserTypeMismatch',
        membership.id,
      );
      const roleKey = membership.roleKey ?? '<missing>';
      state.mismatchedRoleKeyCounts.set(
        roleKey,
        (state.mismatchedRoleKeyCounts.get(roleKey) ?? 0) + 1,
      );
    }
  }
}

function processTeacherUserPage(
  state,
  teacherUsers,
  membershipStats,
  allocatedTeacherUserIds,
) {
  for (const user of teacherUsers) {
    state.counts.totalTeacherUsers += 1;
    if (user.status === 'ACTIVE') state.counts.activeTeacherUsers += 1;
    if (user.status === 'DISABLED' || user.status === 'SUSPENDED') {
      state.counts.disabledOrSuspendedTeacherUsers += 1;
    }
    if (user.status === 'INVITED') state.counts.invitedTeacherUsers += 1;

    const userMembershipStats = membershipStats.get(user.id) ?? {
      activeTeacherMembershipCount: 0,
      hasRoleOrTypeMismatch: false,
    };
    const hasActiveMembership =
      userMembershipStats.activeTeacherMembershipCount > 0;
    const hasMultipleActiveMemberships =
      userMembershipStats.activeTeacherMembershipCount > 1;

    if (hasActiveMembership) {
      state.counts.teacherUsersWithActiveTeacherMemberships += 1;
    } else {
      state.counts.teacherUsersWithoutActiveTeacherMemberships += 1;
      recordAnomaly(
        state,
        'teacherUsersWithoutActiveTeacherMemberships',
        user.id,
      );
    }
    if (hasMultipleActiveMemberships) {
      state.counts.teacherUsersWithMoreThanOneActiveTeacherMembership += 1;
      recordAnomaly(
        state,
        'teacherUsersWithMoreThanOneActiveTeacherMembership',
        user.id,
      );
    }
    if (userMembershipStats.hasRoleOrTypeMismatch) {
      state.counts.teacherUsersWithRoleKeyOrUserTypeMismatch += 1;
      recordAnomaly(
        state,
        'teacherUsersWithRoleKeyOrUserTypeMismatch',
        user.id,
      );
    }

    if (allocatedTeacherUserIds.has(user.id)) {
      state.counts.teacherUsersWithAllocations += 1;
    } else {
      state.counts.teacherUsersWithoutAllocations += 1;
    }

    const readiness = classifyCredentialReadiness(user);
    const readinessMappings = [
      ['missingUsername', 'teacherUsersMissingUsername'],
      ['missingContactEmail', 'teacherUsersMissingContactEmail'],
      ['missingPasswordHash', 'teacherUsersMissingPasswordHash'],
      ['mustChangePassword', 'teacherUsersWithMustChangePassword'],
    ];
    for (const [readinessKey, category] of readinessMappings) {
      if (!readiness[readinessKey]) continue;
      state.counts[category] += 1;
      recordAnomaly(state, category, user.id);
    }

    state.counts.teacherUsersRequiringFutureTeacherProfileBackfill += 1;
    recordAnomaly(
      state,
      'teacherUsersRequiringFutureTeacherProfileBackfill',
      user.id,
    );
    if (
      !hasActiveMembership ||
      hasMultipleActiveMemberships ||
      userMembershipStats.hasRoleOrTypeMismatch
    ) {
      state.counts.teacherUsersWhoseProfileBackfillRequiresRemediation += 1;
      recordAnomaly(
        state,
        'teacherUsersWhoseProfileBackfillRequiresRemediation',
        user.id,
      );
    }
  }
}

function processAllocationPage(state, allocations, validMembershipKeys) {
  for (const allocation of allocations) {
    const termState = classifyAllocationTermState(allocation.term, state.asOf);
    state.allocationsByTermState[termState] += 1;

    if (termState === 'inconsistent') {
      state.counts.teacherAllocationsWithInconsistentTermState += 1;
      recordAnomaly(
        state,
        'teacherAllocationsWithInconsistentTermState',
        allocation.id,
      );
    }
    if (termState === 'invalid') {
      state.counts.teacherAllocationsWithInvalidTermState += 1;
      recordAnomaly(
        state,
        'teacherAllocationsWithInvalidTermState',
        allocation.id,
      );
    }

    const hasValidMembership =
      allocation.teacherUser != null &&
      allocation.teacherUser.userType === 'TEACHER' &&
      allocation.teacherUser.deletedAt == null &&
      validMembershipKeys.has(
        membershipSchoolKey(allocation.teacherUserId, allocation.schoolId),
      );
    if (!hasValidMembership) {
      state.counts.teacherAllocationsWithInvalidTeacherMembershipState += 1;
      recordAnomaly(
        state,
        'teacherAllocationsWithInvalidTeacherMembershipState',
        allocation.id,
      );
      if (isActiveOrFutureAllocationState(termState)) {
        state.counts.activeOrFutureAllocationsWithInvalidTeacherMembershipState += 1;
        recordAnomaly(
          state,
          'activeOrFutureAllocationsWithInvalidTeacherMembershipState',
          allocation.id,
        );
      }
    }
    if (hasInvalidAllocationSchoolRelationships(allocation)) {
      state.counts.teacherAllocationsWithInvalidSchoolRelationships += 1;
      recordAnomaly(
        state,
        'teacherAllocationsWithInvalidSchoolRelationships',
        allocation.id,
      );
    }
  }
}

function recordAnomaly(state, category, id) {
  const anomaly = state.anomalies[category];
  if (!anomaly) throw new Error('unknown_anomaly_category');
  anomaly.count += 1;
  if (
    typeof id === 'string' &&
    anomaly.sampleIds.length < state.sampleLimit &&
    !anomaly.sampleIdSet.has(id)
  ) {
    anomaly.sampleIdSet.add(id);
    anomaly.sampleIds.push(id);
  }
}

function finalizeIncrementalState(state) {
  return formatSafeReport(
    {
      asOf: state.asOf.toISOString(),
      counts: state.counts,
      allocationsByTermState: state.allocationsByTermState,
      mismatchedRoleKeyCounts: sortedCountRecord(state.mismatchedRoleKeyCounts),
      anomalies: state.anomalies,
    },
    { sampleLimit: state.sampleLimit },
  );
}

function sanitizeTeacherUser(user) {
  return {
    id: user.id,
    status: user.status,
    hasUsername: hasNonBlankValue(user.username),
    hasContactEmail: hasNonBlankValue(user.contactEmail),
    hasPasswordHash: hasNonBlankValue(user.passwordHash),
    mustChangePassword: user.mustChangePassword,
  };
}

function normalizeMemberships(rows) {
  return rows.map((membership) => ({
    id: membership.id,
    userId: membership.userId,
    schoolId: membership.schoolId,
    userType: membership.userType,
    status: membership.status,
    endedAt: membership.endedAt,
    deletedAt: membership.deletedAt,
    roleKey: membership.role?.key ?? null,
    user: membership.user,
  }));
}

function membershipSelect(includeUser) {
  return {
    id: true,
    userId: true,
    schoolId: true,
    userType: true,
    status: true,
    endedAt: true,
    deletedAt: true,
    role: { select: { key: true } },
    ...(includeUser
      ? { user: { select: { userType: true, deletedAt: true } } }
      : {}),
  };
}

function allocationSelect() {
  return {
    id: true,
    schoolId: true,
    teacherUserId: true,
    teacherUser: {
      select: { userType: true, status: true, deletedAt: true },
    },
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

function isActiveOrFutureAllocationState(termState) {
  return [
    'future',
    'current_active',
    'current_inactive',
    'inconsistent',
  ].includes(termState);
}

function membershipSchoolKey(userId, schoolId) {
  return `${userId ?? '<missing>'}\u0000${schoolId ?? '<missing>'}`;
}

function hasNonBlankValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function groupBy(values, keySelector) {
  const grouped = new Map();
  for (const value of values) {
    const key = keySelector(value);
    const group = grouped.get(key) ?? [];
    group.push(value);
    grouped.set(key, group);
  }
  return grouped;
}

function uniqueSorted(values) {
  return [
    ...new Set(values.filter((value) => typeof value === 'string')),
  ].sort();
}

function sortedCountRecord(counts) {
  return Object.fromEntries(
    [...counts.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function toTimestamp(value) {
  if (value == null) return null;
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function clampSampleLimit(value) {
  if (!Number.isInteger(value)) return DEFAULT_SAMPLE_LIMIT;
  return Math.min(Math.max(value, 0), MAX_SAMPLE_LIMIT);
}

function parseArguments(argv) {
  const result = {
    strict: false,
    asOf: new Date(),
    sampleLimit: DEFAULT_SAMPLE_LIMIT,
    help: false,
  };

  for (const argument of argv) {
    if (argument === '--strict') {
      result.strict = true;
    } else if (argument === '--help') {
      result.help = true;
    } else if (argument.startsWith('--as-of=')) {
      const value = new Date(argument.slice('--as-of='.length));
      if (Number.isNaN(value.getTime())) throw new Error('invalid_as_of');
      result.asOf = value;
    } else if (argument.startsWith('--sample-limit=')) {
      const value = Number(argument.slice('--sample-limit='.length));
      if (!Number.isInteger(value) || value < 0 || value > MAX_SAMPLE_LIMIT) {
        throw new Error('invalid_sample_limit');
      }
      result.sampleLimit = value;
    } else {
      throw new Error('unknown_argument');
    }
  }

  return result;
}

function printUsage() {
  process.stdout.write(
    [
      'Usage: node scripts/classify-teacher-directory-reality-0a.cjs [options]',
      '',
      'Options:',
      '  --strict            Exit 2 when classified anomalies are present.',
      '  --as-of=<ISO date>  Fix the date used for term-state classification.',
      '  --sample-limit=<n>  Include at most n opaque ids per anomaly (0-50).',
      '  --help              Show this help without connecting to a database.',
      '',
    ].join('\n'),
  );
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  require('dotenv/config');
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  try {
    const report = await classifyReality(prisma, options);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = strictModeExitCode(report, options.strict);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main().catch(() => {
    process.stderr.write('TEACHER DIRECTORY CLASSIFICATION: NOT EXECUTED\n');
    process.stderr.write('REASON: invalid arguments or database read failed\n');
    process.exitCode = 1;
  });
}

module.exports = {
  buildClassification,
  classifyReality,
  classifyAllocationTermState,
  classifyCredentialReadiness,
  classifyMemberships,
  classifyRoleAndUserTypeMismatch,
  formatSafeReport,
  hasInvalidAllocationSchoolRelationships,
  hasValidTeacherMembershipForAllocation,
  isOperationallyActiveMembership,
  iterateCursorPages,
  parseArguments,
  strictModeExitCode,
};
