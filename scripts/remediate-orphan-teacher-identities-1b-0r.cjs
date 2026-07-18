'use strict';

const {
  LOCKED_TARGET_COUNT,
  classifyDatabase,
  iterateCursorPages,
  parseExactIsoTimestamp,
} = require('./classify-teacher-identity-remediation-1b-0r.cjs');

const TOOL = 'SCHOOL-TEACHER-DIRECTORY-1B-0R-REMEDIATION';
const MAX_PAGE_SIZE = 500;
const APPLY_ENVIRONMENT_KEY = 'TEACHER_ORPHAN_REMEDIATION_APPLY';

function parseArguments(argv) {
  let asOf;
  let applyRequested = false;
  for (const argument of argv) {
    if (argument === '--apply') {
      if (applyRequested) throw new Error('duplicate_apply');
      applyRequested = true;
    } else if (argument.startsWith('--as-of=')) {
      if (asOf) throw new Error('duplicate_as_of');
      asOf = parseExactIsoTimestamp(argument.slice('--as-of='.length));
    } else {
      throw new Error('unknown_argument');
    }
  }
  if (!asOf) throw new Error('missing_as_of');
  return { asOf, applyRequested };
}

function resolveApplyGate({ applyRequested, env }) {
  const environmentConfirmed = env[APPLY_ENVIRONMENT_KEY] === '1';
  if (applyRequested && environmentConfirmed && env.NODE_ENV === 'production') {
    return {
      allowed: false,
      apply: false,
      reason: 'production_apply_forbidden',
    };
  }
  if (applyRequested && environmentConfirmed) {
    return { allowed: true, apply: true, reason: 'explicit_dual_confirmation' };
  }
  if (applyRequested || environmentConfirmed) {
    return {
      allowed: false,
      apply: false,
      reason: 'dual_confirmation_required',
    };
  }
  return { allowed: true, apply: false, reason: 'dry_run_default' };
}

async function readEligibleCandidates(prisma, asOf, pageSize = MAX_PAGE_SIZE) {
  const candidateIds = [];
  await iterateCursorPages(
    prisma.user.findMany.bind(prisma.user),
    {
      where: {
        userType: 'TEACHER',
        status: 'ACTIVE',
        deletedAt: null,
        memberships: { none: {} },
        teacherProfiles: { none: {} },
        teacherSubjectAllocations: { none: {} },
        sessions: {
          none: { revokedAt: null, expiresAt: { gt: asOf } },
        },
      },
      select: { id: true },
    },
    (page) => {
      for (const row of page) candidateIds.push(row.id);
    },
    pageSize,
  );
  return candidateIds;
}

function evaluatePreconditions(classification, eligibleCount) {
  const counts = classification.counts ?? {};
  const credentials = classification.credentialStateCounts ?? {};
  const preconditions = {
    classificationSucceeded: classification.ok === true,
    targetCountExact: counts.targetPopulation === LOCKED_TARGET_COUNT,
    everyTargetHasNoMembershipHistory:
      classification.exclusiveMembershipCohorts?.NO_MEMBERSHIP_HISTORY ===
      LOCKED_TARGET_COUNT,
    everyTargetHasNoProfileHistory:
      classification.profileHistoryCounts?.noProfileRows ===
      LOCKED_TARGET_COUNT,
    everyTargetHasNoAllocationHistory:
      classification.allocationExposureCounts?.noAllocations ===
      LOCKED_TARGET_COUNT,
    noTargetHasActiveSession:
      classification.sessionExposureCounts
        ?.usersWithUnrevokedUnexpiredSession === 0 &&
      classification.sessionExposureCounts?.totalUnrevokedUnexpiredSessions ===
        0,
    everyTargetAccountIsActive:
      classification.accountStatusCounts?.ACTIVE === LOCKED_TARGET_COUNT,
    credentialBaselineUnchanged:
      credentials.hasUsername === 0 &&
      credentials.hasContactEmail === 0 &&
      credentials.hasPassword === 0 &&
      credentials.mustChangePassword === 0 &&
      credentials.passwordProvisioned === 0 &&
      credentials.credentialVersionZero === LOCKED_TARGET_COUNT &&
      credentials.credentialVersionGreaterThanZero === 0,
    eligibleCountExact: eligibleCount === LOCKED_TARGET_COUNT,
  };
  return {
    ...preconditions,
    ready: Object.values(preconditions).every(Boolean),
  };
}

async function inspectRemediationState(
  prisma,
  asOf,
  pageSize = MAX_PAGE_SIZE,
  dependencies = {},
) {
  const classify = dependencies.classify ?? classifyDatabase;
  const readCandidates = dependencies.readCandidates ?? readEligibleCandidates;
  const classification = await classify(prisma, asOf, pageSize);
  const candidateIds = await readCandidates(prisma, asOf, pageSize);
  const preconditions = evaluatePreconditions(
    classification,
    candidateIds.length,
  );
  return {
    candidateIds,
    counts: {
      lockedExpectedTarget: LOCKED_TARGET_COUNT,
      classifiedTarget: classification.counts?.targetPopulation ?? 0,
      eligibleForRemediation: candidateIds.length,
      noMembershipHistory:
        classification.exclusiveMembershipCohorts?.NO_MEMBERSHIP_HISTORY ?? 0,
      noProfileHistory: classification.profileHistoryCounts?.noProfileRows ?? 0,
      noAllocationHistory:
        classification.allocationExposureCounts?.noAllocations ?? 0,
      usersWithActiveSession:
        classification.sessionExposureCounts
          ?.usersWithUnrevokedUnexpiredSession ?? 0,
      activeSessions:
        classification.sessionExposureCounts?.totalUnrevokedUnexpiredSessions ??
        0,
    },
    preconditions,
  };
}

function publicInspection(inspection) {
  return {
    counts: inspection.counts,
    preconditions: inspection.preconditions,
  };
}

function mutationPlan() {
  return {
    model: 'User',
    fields: ['status', 'deletedAt'],
    status: 'DISABLED',
    hardDelete: false,
    changesUserType: false,
    createsTenantRelations: false,
    changesCredentials: false,
    changesAllocations: false,
    appliesTeacherProfileBackfill: false,
  };
}

function remediationReport({
  mode,
  asOf,
  ok,
  gate,
  inspection,
  error,
  rowsUpdated = 0,
  deletedAt = null,
}) {
  return {
    tool: TOOL,
    mode,
    asOf: asOf.toISOString(),
    ok,
    gate,
    ...(error ? { error } : {}),
    ...publicInspection(inspection),
    mutationPlan: mutationPlan(),
    result: {
      rowsUpdated,
      fixedDeletedAt: deletedAt?.toISOString() ?? null,
    },
  };
}

async function runDryRun(prisma, asOf, dependencies = {}) {
  const inspect = dependencies.inspect ?? inspectRemediationState;
  const inspection = await inspect(prisma, asOf);
  return remediationReport({
    mode: 'dry_run',
    asOf,
    ok: inspection.preconditions.ready,
    gate: 'dry_run_default',
    inspection,
    error: inspection.preconditions.ready
      ? null
      : 'remediation_precondition_failed',
  });
}

async function runApply(prisma, asOf, dependencies = {}) {
  const inspect = dependencies.inspect ?? inspectRemediationState;
  const now = dependencies.now ?? (() => new Date());
  return prisma.$transaction(
    async (transaction) => {
      const inspection = await inspect(transaction, asOf);
      if (!inspection.preconditions.ready) {
        return remediationReport({
          mode: 'apply',
          asOf,
          ok: false,
          gate: 'explicit_dual_confirmation',
          inspection,
          error: 'remediation_precondition_failed',
        });
      }

      const fixedDeletedAt = now();
      const updateResult = await transaction.user.updateMany({
        where: {
          id: { in: inspection.candidateIds },
          userType: 'TEACHER',
          status: 'ACTIVE',
          deletedAt: null,
        },
        data: { status: 'DISABLED', deletedAt: fixedDeletedAt },
      });
      if (updateResult.count !== LOCKED_TARGET_COUNT) {
        throw new Error('update_count_mismatch');
      }

      const verified = [];
      await iterateCursorPages(
        transaction.user.findMany.bind(transaction.user),
        {
          where: { id: { in: inspection.candidateIds } },
          select: { id: true, status: true, deletedAt: true },
        },
        (page) => verified.push(...page),
      );
      if (
        verified.length !== LOCKED_TARGET_COUNT ||
        verified.some(
          (row) =>
            row.status !== 'DISABLED' ||
            row.deletedAt?.getTime() !== fixedDeletedAt.getTime(),
        )
      ) {
        throw new Error('verification_failed');
      }

      return remediationReport({
        mode: 'apply',
        asOf,
        ok: true,
        gate: 'explicit_dual_confirmation',
        inspection,
        rowsUpdated: updateResult.count,
        deletedAt: fixedDeletedAt,
      });
    },
    { isolationLevel: 'Serializable', maxWait: 5_000, timeout: 30_000 },
  );
}

function safeFailure(asOf, error, gate = null) {
  return {
    tool: TOOL,
    mode: 'not_executed',
    asOf: asOf?.toISOString() ?? null,
    ok: false,
    gate,
    error,
  };
}

async function runCli(argv, dependencies = {}) {
  const write = dependencies.write ?? ((value) => process.stdout.write(value));
  let options;
  try {
    options = parseArguments(argv);
  } catch (error) {
    write(`${JSON.stringify(safeFailure(null, error.message))}\n`);
    return 2;
  }

  const env = dependencies.env ?? process.env;
  const gate = resolveApplyGate({
    applyRequested: options.applyRequested,
    env,
  });
  if (!gate.allowed) {
    write(
      `${JSON.stringify(safeFailure(options.asOf, gate.reason, gate.reason))}\n`,
    );
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
  let databaseFailure = false;
  try {
    prisma = createPrisma();
    const applyRunner = dependencies.runApply ?? runApply;
    const dryRunRunner = dependencies.runDryRun ?? runDryRun;
    report = gate.apply
      ? await applyRunner(prisma, options.asOf)
      : await dryRunRunner(prisma, options.asOf);
  } catch {
    databaseFailure = true;
  } finally {
    if (prisma) {
      try {
        await prisma.$disconnect();
      } catch {
        databaseFailure = true;
      }
    }
  }
  if (databaseFailure) {
    report = safeFailure(
      options.asOf,
      'database_operation_failed',
      gate.reason,
    );
  }
  write(`${JSON.stringify(report, null, 2)}\n`);
  return report.ok ? 0 : 1;
}

if (require.main === module) {
  void runCli(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}

module.exports = {
  APPLY_ENVIRONMENT_KEY,
  TOOL,
  evaluatePreconditions,
  inspectRemediationState,
  mutationPlan,
  parseArguments,
  publicInspection,
  readEligibleCandidates,
  remediationReport,
  resolveApplyGate,
  runApply,
  runCli,
  runDryRun,
  safeFailure,
};
