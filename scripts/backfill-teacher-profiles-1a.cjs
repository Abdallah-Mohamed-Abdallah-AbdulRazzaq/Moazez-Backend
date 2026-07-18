#!/usr/bin/env node
'use strict';

const { performance } = require('node:perf_hooks');
const { PrismaClient } = require('@prisma/client');

const DEFAULT_BATCH_SIZE = 500;
const MAX_BATCH_SIZE = 500;
const DEFAULT_SAMPLE_LIMIT = 20;
const MAX_SAMPLE_LIMIT = 100;

const BACKFILL_STATUS = Object.freeze({
  ELIGIBLE: 'eligible',
  DELETED_OR_MISSING_USER: 'deleted_or_missing_user_relation',
  USER_TYPE_MISMATCH: 'user_type_mismatch',
  NO_OPERATIONAL_MEMBERSHIP: 'no_operational_teacher_membership',
  MULTIPLE_OPERATIONAL_MEMBERSHIPS: 'multiple_operational_memberships',
  MEMBERSHIP_WITHOUT_SCHOOL: 'membership_without_school',
  ROLE_OR_TYPE_MISMATCH: 'role_or_type_mismatch',
  ROLE_SCHOOL_MISMATCH: 'role_school_mismatch',
  EXISTING_SAME_SCHOOL_LIVE: 'existing_same_school_live_profile',
  ARCHIVED_SAME_SCHOOL: 'archived_same_school_profile_requires_restore',
  EXISTING_LIVE_OTHER_SCHOOL: 'existing_live_other_school_profile',
  CROSS_SCHOOL_AMBIGUITY: 'cross_school_ambiguity',
  UNIQUE_RACE_CONFLICT: 'unique_index_race_conflict',
});

function boundedInteger(value, fallback, maximum, minimum = 1) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error('invalid_bounded_integer');
  }
  return parsed;
}

function parseArguments(argv) {
  const options = {
    applyRequested: false,
    batchSize: DEFAULT_BATCH_SIZE,
    sampleLimit: DEFAULT_SAMPLE_LIMIT,
  };

  for (const argument of argv) {
    if (argument === '--apply') {
      options.applyRequested = true;
    } else if (argument.startsWith('--batch-size=')) {
      options.batchSize = boundedInteger(
        argument.slice('--batch-size='.length),
        DEFAULT_BATCH_SIZE,
        MAX_BATCH_SIZE,
      );
    } else if (argument.startsWith('--sample-limit=')) {
      options.sampleLimit = boundedInteger(
        argument.slice('--sample-limit='.length),
        DEFAULT_SAMPLE_LIMIT,
        MAX_SAMPLE_LIMIT,
        0,
      );
    } else {
      throw new Error('unknown_argument');
    }
  }

  return options;
}

function resolveApplyGate({ applyRequested, env }) {
  const envAuthorized = env.TEACHER_PROFILE_BACKFILL_APPLY === '1';
  if (applyRequested && envAuthorized && env.NODE_ENV === 'production') {
    return {
      apply: false,
      allowed: false,
      reason: 'production_apply_forbidden',
    };
  }
  if (applyRequested && envAuthorized) {
    return { apply: true, allowed: true, reason: 'explicit_apply' };
  }
  if (applyRequested || envAuthorized) {
    return {
      apply: false,
      allowed: false,
      reason: 'dual_confirmation_required',
    };
  }
  return { apply: false, allowed: true, reason: 'dry_run_default' };
}

async function* iterateCursorPages(findMany, batchSize) {
  let cursor;
  for (;;) {
    const page = await findMany({
      orderBy: { id: 'asc' },
      take: batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (page.length === 0) return;
    yield page;
    cursor = page[page.length - 1].id;
  }
}

function classifyBackfillCandidate({ user, memberships, profiles }) {
  if (!user || user.deletedAt !== null) {
    return { status: BACKFILL_STATUS.DELETED_OR_MISSING_USER };
  }
  if (user.userType !== 'TEACHER') {
    return { status: BACKFILL_STATUS.USER_TYPE_MISMATCH };
  }

  const operationalMemberships = memberships.filter(
    (membership) =>
      membership.status === 'ACTIVE' &&
      membership.endedAt === null &&
      membership.deletedAt === null,
  );

  if (operationalMemberships.length === 0) {
    return { status: BACKFILL_STATUS.NO_OPERATIONAL_MEMBERSHIP };
  }
  if (operationalMemberships.length > 1) {
    const schools = new Set(
      operationalMemberships.map((membership) => membership.schoolId),
    );
    return {
      status:
        schools.size > 1
          ? BACKFILL_STATUS.CROSS_SCHOOL_AMBIGUITY
          : BACKFILL_STATUS.MULTIPLE_OPERATIONAL_MEMBERSHIPS,
    };
  }

  const membership = operationalMemberships[0];
  if (membership.schoolId === null) {
    return { status: BACKFILL_STATUS.MEMBERSHIP_WITHOUT_SCHOOL };
  }
  if (
    membership.userType !== 'TEACHER' ||
    membership.role?.key !== 'teacher' ||
    membership.role.deletedAt !== null
  ) {
    return { status: BACKFILL_STATUS.ROLE_OR_TYPE_MISMATCH };
  }
  if (
    membership.role.schoolId !== null &&
    membership.role.schoolId !== membership.schoolId
  ) {
    return { status: BACKFILL_STATUS.ROLE_SCHOOL_MISMATCH };
  }

  const sameSchoolProfile = profiles.find(
    (profile) => profile.schoolId === membership.schoolId,
  );
  if (sameSchoolProfile?.deletedAt === null) {
    return { status: BACKFILL_STATUS.EXISTING_SAME_SCHOOL_LIVE };
  }
  if (sameSchoolProfile) {
    return { status: BACKFILL_STATUS.ARCHIVED_SAME_SCHOOL };
  }
  if (profiles.some((profile) => profile.deletedAt === null)) {
    return { status: BACKFILL_STATUS.EXISTING_LIVE_OTHER_SCHOOL };
  }

  return { status: BACKFILL_STATUS.ELIGIBLE, schoolId: membership.schoolId };
}

function addBoundedSample(samples, status, opaqueId, sampleLimit) {
  if (!samples[status]) samples[status] = [];
  if (samples[status].length < sampleLimit) samples[status].push(opaqueId);
}

function createEmptyCounts() {
  return Object.fromEntries(
    Object.values(BACKFILL_STATUS).map((status) => [status, 0]),
  );
}

async function loadCandidateContext(prisma, userId) {
  const memberships = await prisma.membership.findMany({
    where: {
      userId,
      status: 'ACTIVE',
      endedAt: null,
      deletedAt: null,
    },
    orderBy: { id: 'asc' },
    take: 3,
    select: {
      id: true,
      schoolId: true,
      userType: true,
      status: true,
      endedAt: true,
      deletedAt: true,
      role: { select: { key: true, schoolId: true, deletedAt: true } },
    },
  });
  const candidateSchoolId =
    memberships.length === 1 ? memberships[0].schoolId : null;
  const profileRelevance = [{ deletedAt: null }];
  if (candidateSchoolId !== null) {
    profileRelevance.push({ schoolId: candidateSchoolId });
  }
  const profiles = await prisma.teacherProfile.findMany({
    where: { userId, OR: profileRelevance },
    orderBy: { id: 'asc' },
    take: 3,
    select: { id: true, schoolId: true, deletedAt: true },
  });
  return { memberships, profiles };
}

async function runBackfill({ prisma, options, applyGate }) {
  const startedAt = performance.now();
  const counts = createEmptyCounts();
  const samples = {};
  let batches = 0;
  let teacherUsers = 0;
  let created = 0;

  const findTeacherUsers = (pagination) =>
    prisma.user.findMany({
      where: { userType: 'TEACHER', deletedAt: null },
      select: { id: true, userType: true, deletedAt: true },
      ...pagination,
    });

  for await (const users of iterateCursorPages(
    findTeacherUsers,
    options.batchSize,
  )) {
    batches += 1;
    for (const user of users) {
      teacherUsers += 1;
      const context = await loadCandidateContext(prisma, user.id);
      const classification = classifyBackfillCandidate({ user, ...context });
      counts[classification.status] += 1;

      if (classification.status !== BACKFILL_STATUS.ELIGIBLE) {
        addBoundedSample(
          samples,
          classification.status,
          user.id,
          options.sampleLimit,
        );
        continue;
      }
      if (!applyGate.apply) continue;

      try {
        await prisma.teacherProfile.create({
          data: {
            schoolId: classification.schoolId,
            userId: user.id,
            employmentStatus: 'INACTIVE',
            workingDays: [],
          },
          select: { id: true },
        });
        created += 1;
      } catch (error) {
        if (error?.code !== 'P2002') throw error;
        counts[BACKFILL_STATUS.ELIGIBLE] -= 1;
        counts[BACKFILL_STATUS.UNIQUE_RACE_CONFLICT] += 1;
        addBoundedSample(
          samples,
          BACKFILL_STATUS.UNIQUE_RACE_CONFLICT,
          user.id,
          options.sampleLimit,
        );
      }
    }
  }

  return {
    ok: true,
    mode: applyGate.apply ? 'apply' : 'dry_run',
    gate: applyGate.reason,
    teacherUsers,
    batches,
    created,
    skipped: teacherUsers - created,
    counts,
    samples,
    durationMs: Math.round(performance.now() - startedAt),
  };
}

function safeFailure(code) {
  return { ok: false, error: code };
}

async function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch {
    process.stdout.write(
      `${JSON.stringify(safeFailure('invalid_arguments'))}\n`,
    );
    process.exitCode = 2;
    return;
  }

  const applyGate = resolveApplyGate({
    applyRequested: options.applyRequested,
    env: process.env,
  });
  if (!applyGate.allowed) {
    process.stdout.write(`${JSON.stringify(safeFailure(applyGate.reason))}\n`);
    process.exitCode = 2;
    return;
  }

  const prisma = new PrismaClient();
  try {
    const report = await runBackfill({ prisma, options, applyGate });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } catch {
    process.stdout.write(
      `${JSON.stringify(safeFailure('backfill_execution_failed'))}\n`,
    );
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

module.exports = {
  BACKFILL_STATUS,
  addBoundedSample,
  classifyBackfillCandidate,
  iterateCursorPages,
  parseArguments,
  resolveApplyGate,
  runBackfill,
  safeFailure,
};

if (require.main === module) {
  void main();
}
