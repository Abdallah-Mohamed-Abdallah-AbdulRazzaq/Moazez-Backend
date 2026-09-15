'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { isDeepStrictEqual } = require('node:util');

const REPOSITORY = 'Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Backend';
const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..');
const CAPACITY_SPEC_VERSION = 1;
const CAPACITY_EXECUTION_SCHEMA_VERSION = 1;
const CAPACITY_OPERATION_ID = 'runtime-capacity-adjustment';
const CANDIDATE_IDENTITY_VERSION = 'capacity-v1';
const GOOGLE_PROVIDER_NAME = 'registry.terraform.io/hashicorp/google';

const RUNTIME_RESOURCE_ADDRESSES = Object.freeze({
  api: 'module.runtime_environment.google_cloud_run_v2_service.api',
  coreWorker: 'module.runtime_environment.google_cloud_run_v2_worker_pool.core',
  mediaWorker:
    'module.runtime_environment.google_cloud_run_v2_worker_pool.media',
});

const CAPACITY_ENVIRONMENTS = Object.freeze({
  staging: Object.freeze({
    terraformRoot: 'infra/gcp/backend-runtime/environments/nonprod/runtime',
    project: 'moazez-nonprod-91001421934',
    region: 'me-central2',
    apiService: 'moazez-staging-api',
    coreWorker: 'moazez-staging-core-worker',
    mediaWorker: 'moazez-staging-media-worker',
  }),
  production: Object.freeze({
    terraformRoot: 'infra/gcp/backend-runtime/environments/production/runtime',
    project: 'moazez-production',
    region: 'me-central2',
    apiService: 'moazez-production-api',
    coreWorker: 'moazez-production-core-worker',
    mediaWorker: 'moazez-production-media-worker',
  }),
});

const BASELINE_CAPACITY_SPECS = Object.freeze({
  staging: Object.freeze({
    capacitySpecVersion: CAPACITY_SPEC_VERSION,
    api: Object.freeze({
      serviceMinInstances: 1,
      serviceMaxInstances: 4,
      revision: Object.freeze({
        maxInstances: null,
        concurrency: 40,
        requestTimeoutSeconds: null,
        sessionAffinity: null,
        databaseConnectionLimit: 5,
      }),
    }),
    workers: Object.freeze({
      coreManualInstanceCount: 1,
      mediaManualInstanceCount: 1,
    }),
  }),
  production: Object.freeze({
    capacitySpecVersion: CAPACITY_SPEC_VERSION,
    api: Object.freeze({
      serviceMinInstances: 1,
      serviceMaxInstances: 10,
      revision: Object.freeze({
        maxInstances: null,
        concurrency: 40,
        requestTimeoutSeconds: null,
        sessionAffinity: null,
        databaseConnectionLimit: 5,
      }),
    }),
    workers: Object.freeze({
      coreManualInstanceCount: 1,
      mediaManualInstanceCount: 1,
    }),
  }),
});

const API_SERVICE_ALLOWED_PATHS = Object.freeze([
  'scaling[0].min_instance_count',
  'scaling[0].max_instance_count',
]);
const WORKER_ALLOWED_PATHS = Object.freeze([
  'scaling[0].manual_instance_count',
]);
const REDIS_CONNECTION_OWNERSHIP = Object.freeze({
  apiQueue: 2,
  apiRealtime: 3,
  coreQueue: 9,
  coreRealtime: 1,
  mediaQueue: 4,
  maintenanceQueue: 2,
});
const DATABASE_CONNECTION_OWNERSHIP = Object.freeze({
  core: 6,
  media: 3,
});

class CapacityControlError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CapacityControlError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new CapacityControlError(code, message);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function requireObject(value, label) {
  if (!isPlainObject(value)) {
    fail('CAPACITY_SCHEMA_INVALID', `${label} must be an object.`);
  }
  return value;
}

function requireExactKeys(value, keys, label) {
  const object = requireObject(value, label);
  const actual = Object.keys(object).sort();
  const expected = [...keys].sort();
  if (!isDeepStrictEqual(actual, expected)) {
    fail(
      'CAPACITY_SCHEMA_INVALID',
      `${label} must contain exactly: ${expected.join(', ')}.`,
    );
  }
  return object;
}

function requireString(value, label, pattern) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    fail('CAPACITY_SCHEMA_INVALID', `${label} must be a non-empty string.`);
  }
  if (pattern && !pattern.test(value)) {
    fail('CAPACITY_SCHEMA_INVALID', `${label} has an invalid format.`);
  }
  return value;
}

function requireInteger(value, label, minimum = 1, maximum = null) {
  if (
    !Number.isSafeInteger(value) ||
    value < minimum ||
    (maximum !== null && value > maximum)
  ) {
    const upper = maximum === null ? '' : ` through ${maximum}`;
    fail(
      'CAPACITY_SCHEMA_INVALID',
      `${label} must be an integer from ${minimum}${upper}.`,
    );
  }
  return value;
}

function requireNullableInteger(value, label, minimum = 1, maximum = null) {
  if (value === null) return null;
  return requireInteger(value, label, minimum, maximum);
}

function requireNullableBoolean(value, label) {
  if (value !== null && typeof value !== 'boolean') {
    fail('CAPACITY_SCHEMA_INVALID', `${label} must be null or boolean.`);
  }
  return value;
}

function requireState(value, label) {
  const state = requireExactKeys(value, ['lineage', 'serial'], label);
  requireString(state.lineage, `${label}.lineage`);
  requireInteger(state.serial, `${label}.serial`, 0);
  return structuredClone(state);
}

function requireIsoTimestamp(value, label) {
  requireString(value, label);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    fail('CAPACITY_SCHEMA_INVALID', `${label} must be an ISO UTC timestamp.`);
  }
  return value;
}

function validateCapacitySpec(value, label = 'capacitySpec') {
  const spec = requireExactKeys(
    value,
    ['capacitySpecVersion', 'api', 'workers'],
    label,
  );
  if (spec.capacitySpecVersion !== CAPACITY_SPEC_VERSION) {
    fail(
      'CAPACITY_SCHEMA_UNSUPPORTED',
      `${label}.capacitySpecVersion must be ${CAPACITY_SPEC_VERSION}.`,
    );
  }
  const api = requireExactKeys(
    spec.api,
    ['serviceMinInstances', 'serviceMaxInstances', 'revision'],
    `${label}.api`,
  );
  const revision = requireExactKeys(
    api.revision,
    [
      'maxInstances',
      'concurrency',
      'requestTimeoutSeconds',
      'sessionAffinity',
      'databaseConnectionLimit',
    ],
    `${label}.api.revision`,
  );
  const workers = requireExactKeys(
    spec.workers,
    ['coreManualInstanceCount', 'mediaManualInstanceCount'],
    `${label}.workers`,
  );

  requireInteger(api.serviceMinInstances, `${label}.api.serviceMinInstances`);
  requireInteger(api.serviceMaxInstances, `${label}.api.serviceMaxInstances`);
  if (api.serviceMinInstances > api.serviceMaxInstances) {
    fail(
      'CAPACITY_RANGE_INVALID',
      `${label}.api.serviceMinInstances must not exceed serviceMaxInstances.`,
    );
  }
  requireNullableInteger(
    revision.maxInstances,
    `${label}.api.revision.maxInstances`,
  );
  requireInteger(
    revision.concurrency,
    `${label}.api.revision.concurrency`,
    1,
    1000,
  );
  requireNullableInteger(
    revision.requestTimeoutSeconds,
    `${label}.api.revision.requestTimeoutSeconds`,
    1,
    3600,
  );
  requireNullableBoolean(
    revision.sessionAffinity,
    `${label}.api.revision.sessionAffinity`,
  );
  requireInteger(
    revision.databaseConnectionLimit,
    `${label}.api.revision.databaseConnectionLimit`,
  );
  requireInteger(
    workers.coreManualInstanceCount,
    `${label}.workers.coreManualInstanceCount`,
  );
  requireInteger(
    workers.mediaManualInstanceCount,
    `${label}.workers.mediaManualInstanceCount`,
  );
  return structuredClone(spec);
}

function validateCandidateRevisionCapacitySpec(
  value,
  label = 'candidateRevisionCapacitySpec',
) {
  const revision = requireExactKeys(
    value,
    [
      'revisionMaxInstances',
      'concurrency',
      'requestTimeoutSeconds',
      'sessionAffinity',
      'databaseConnectionLimit',
    ],
    label,
  );
  requireInteger(
    revision.revisionMaxInstances,
    `${label}.revisionMaxInstances`,
  );
  requireInteger(revision.concurrency, `${label}.concurrency`, 1, 1000);
  requireInteger(
    revision.requestTimeoutSeconds,
    `${label}.requestTimeoutSeconds`,
    1,
    3600,
  );
  if (typeof revision.sessionAffinity !== 'boolean') {
    fail(
      'CANDIDATE_REVISION_CAPACITY_REQUIRED',
      `${label}.sessionAffinity must be explicit boolean.`,
    );
  }
  requireInteger(
    revision.databaseConnectionLimit,
    `${label}.databaseConnectionLimit`,
  );
  return structuredClone(revision);
}

function environmentAuthority(environment) {
  const authority = CAPACITY_ENVIRONMENTS[environment];
  if (!authority) {
    fail(
      'CAPACITY_ENVIRONMENT_UNSUPPORTED',
      'environment must be exactly staging or production.',
    );
  }
  return structuredClone(authority);
}

function baselineCapacitySpec(environment) {
  environmentAuthority(environment);
  return structuredClone(BASELINE_CAPACITY_SPECS[environment]);
}

function terraformVariablesForCapacitySpec(value) {
  const spec = validateCapacitySpec(value);
  return {
    api_service_min_instances: spec.api.serviceMinInstances,
    api_service_max_instances: spec.api.serviceMaxInstances,
    api_revision_max_instances: spec.api.revision.maxInstances,
    api_max_instance_request_concurrency: spec.api.revision.concurrency,
    api_request_timeout_seconds: spec.api.revision.requestTimeoutSeconds,
    api_session_affinity: spec.api.revision.sessionAffinity,
    api_database_connection_limit: spec.api.revision.databaseConnectionLimit,
    core_worker_manual_instance_count: spec.workers.coreManualInstanceCount,
    media_worker_manual_instance_count: spec.workers.mediaManualInstanceCount,
  };
}

function standaloneMutableCapacity(value) {
  const spec = validateCapacitySpec(value);
  return {
    api: {
      serviceMinInstances: spec.api.serviceMinInstances,
      serviceMaxInstances: spec.api.serviceMaxInstances,
    },
    workers: structuredClone(spec.workers),
  };
}

function assertStandaloneRevisionCapacityPreserved(currentValue, desiredValue) {
  const current = validateCapacitySpec(currentValue, 'currentCapacitySpec');
  const desired = validateCapacitySpec(desiredValue, 'desiredCapacitySpec');
  if (!isDeepStrictEqual(current.api.revision, desired.api.revision)) {
    fail(
      'STANDALONE_REVISION_MUTATION_FORBIDDEN',
      'runtime-capacity-adjustment cannot mutate revision max, concurrency, timeout, session affinity, or DATABASE_CONNECTION_LIMIT.',
    );
  }
  return { current, desired };
}

function calculateSteadyStateEnvelopes(value) {
  const spec = validateCapacitySpec(value);
  const apiMax = spec.api.serviceMaxInstances;
  const core = spec.workers.coreManualInstanceCount;
  const media = spec.workers.mediaManualInstanceCount;
  return {
    database:
      apiMax * spec.api.revision.databaseConnectionLimit +
      core * DATABASE_CONNECTION_OWNERSHIP.core +
      media * DATABASE_CONNECTION_OWNERSHIP.media,
    queueRedis:
      apiMax * REDIS_CONNECTION_OWNERSHIP.apiQueue +
      core * REDIS_CONNECTION_OWNERSHIP.coreQueue +
      media * REDIS_CONNECTION_OWNERSHIP.mediaQueue +
      REDIS_CONNECTION_OWNERSHIP.maintenanceQueue,
    realtimeRedis:
      apiMax * REDIS_CONNECTION_OWNERSHIP.apiRealtime +
      core * REDIS_CONNECTION_OWNERSHIP.coreRealtime,
  };
}

function calculateCandidateOverlap({
  servingServiceMaxInstances,
  servingDatabaseConnectionLimit,
  candidateRevisionCapacitySpec,
  workers,
}) {
  requireInteger(servingServiceMaxInstances, 'servingServiceMaxInstances');
  requireInteger(
    servingDatabaseConnectionLimit,
    'servingDatabaseConnectionLimit',
  );
  const candidate = validateCandidateRevisionCapacitySpec(
    candidateRevisionCapacitySpec,
  );
  const workerCapacity = requireExactKeys(
    workers,
    ['coreManualInstanceCount', 'mediaManualInstanceCount'],
    'workers',
  );
  const core = requireInteger(
    workerCapacity.coreManualInstanceCount,
    'workers.coreManualInstanceCount',
  );
  const media = requireInteger(
    workerCapacity.mediaManualInstanceCount,
    'workers.mediaManualInstanceCount',
  );
  const candidateMax = candidate.revisionMaxInstances;
  const servingDatabase =
    servingServiceMaxInstances * servingDatabaseConnectionLimit;
  const candidateDatabase = candidateMax * candidate.databaseConnectionLimit;
  const servingQueue =
    servingServiceMaxInstances * REDIS_CONNECTION_OWNERSHIP.apiQueue;
  const candidateQueue = candidateMax * REDIS_CONNECTION_OWNERSHIP.apiQueue;
  const servingRealtime =
    servingServiceMaxInstances * REDIS_CONNECTION_OWNERSHIP.apiRealtime;
  const candidateRealtime =
    candidateMax * REDIS_CONNECTION_OWNERSHIP.apiRealtime;
  return {
    trafficServingServiceCapacity: servingServiceMaxInstances,
    taggedZeroTrafficCandidateRevisionCapacity: candidateMax,
    serviceMaximumIsInstantaneousHardBound: false,
    database: {
      servingApiEnvelope: servingDatabase,
      taggedCandidateEnvelope: candidateDatabase,
      totalRuntimeOverlap:
        servingDatabase +
        candidateDatabase +
        core * DATABASE_CONNECTION_OWNERSHIP.core +
        media * DATABASE_CONNECTION_OWNERSHIP.media,
    },
    queueRedis: {
      servingApiEnvelope: servingQueue,
      taggedCandidateEnvelope: candidateQueue,
      totalRuntimeOverlap:
        servingQueue +
        candidateQueue +
        core * REDIS_CONNECTION_OWNERSHIP.coreQueue +
        media * REDIS_CONNECTION_OWNERSHIP.mediaQueue +
        REDIS_CONNECTION_OWNERSHIP.maintenanceQueue,
    },
    realtimeRedis: {
      servingApiEnvelope: servingRealtime,
      taggedCandidateEnvelope: candidateRealtime,
      totalRuntimeOverlap:
        servingRealtime +
        candidateRealtime +
        core * REDIS_CONNECTION_OWNERSHIP.coreRealtime,
    },
  };
}

function validateBudgetEvidence(value, label, calculatedEnvelope) {
  const evidence = requireExactKeys(
    value,
    ['authorityRef', 'safetyReserveAuthority', 'effectiveApprovalBudget'],
    label,
  );
  requireString(evidence.authorityRef, `${label}.authorityRef`);
  requireString(
    evidence.safetyReserveAuthority,
    `${label}.safetyReserveAuthority`,
  );
  requireInteger(
    evidence.effectiveApprovalBudget,
    `${label}.effectiveApprovalBudget`,
  );
  if (evidence.effectiveApprovalBudget < calculatedEnvelope) {
    fail(
      'CAPACITY_EVIDENCE_INSUFFICIENT',
      `${label} budget is below the calculated governed envelope.`,
    );
  }
  return {
    calculatedGovernedEnvelope: calculatedEnvelope,
    safetyReserveAuthority: evidence.safetyReserveAuthority,
    effectiveApprovalBudget: evidence.effectiveApprovalBudget,
    evidenceAuthorityUsed: evidence.authorityRef,
    reserveStatus: 'governed',
    approvalResult: 'approved',
  };
}

function evaluateStandaloneCapacityChange({
  currentCapacitySpec,
  desiredCapacitySpec,
  capacityEvidence,
}) {
  const { current, desired } = assertStandaloneRevisionCapacityPreserved(
    currentCapacitySpec,
    desiredCapacitySpec,
  );
  const currentEnvelope = calculateSteadyStateEnvelopes(current);
  const desiredEnvelope = calculateSteadyStateEnvelopes(desired);
  const increased = Object.keys(desiredEnvelope).some(
    (key) => desiredEnvelope[key] > currentEnvelope[key],
  );
  if (!increased) {
    return {
      profileChange: 'preservation-or-decrease',
      currentEnvelope,
      desiredEnvelope,
      database: {
        calculatedGovernedEnvelope: desiredEnvelope.database,
        safetyReserveAuthority: null,
        effectiveApprovalBudget: null,
        evidenceAuthorityUsed: 'already-live-preservation-or-decrease',
        reserveStatus: 'not-required-for-preservation-or-decrease',
        approvalResult: 'approved',
      },
      queueRedis: {
        calculatedGovernedEnvelope: desiredEnvelope.queueRedis,
        safetyReserveAuthority: null,
        effectiveApprovalBudget: null,
        evidenceAuthorityUsed: 'already-live-preservation-or-decrease',
        reserveStatus: 'not-required-for-preservation-or-decrease',
        approvalResult: 'approved',
      },
      realtimeRedis: {
        calculatedGovernedEnvelope: desiredEnvelope.realtimeRedis,
        safetyReserveAuthority: null,
        effectiveApprovalBudget: null,
        evidenceAuthorityUsed: 'already-live-preservation-or-decrease',
        reserveStatus: 'not-required-for-preservation-or-decrease',
        approvalResult: 'approved',
      },
    };
  }
  if (!capacityEvidence) {
    fail(
      'CAPACITY_DATABASE_EVIDENCE_REQUIRED',
      'a new capacity increase requires governed database and Redis budget evidence.',
    );
  }
  const evidence = requireExactKeys(
    capacityEvidence,
    ['database', 'queueRedis', 'realtimeRedis'],
    'capacityEvidence',
  );
  return {
    profileChange: 'increase',
    currentEnvelope,
    desiredEnvelope,
    database: validateBudgetEvidence(
      evidence.database,
      'capacityEvidence.database',
      desiredEnvelope.database,
    ),
    queueRedis: validateBudgetEvidence(
      evidence.queueRedis,
      'capacityEvidence.queueRedis',
      desiredEnvelope.queueRedis,
    ),
    realtimeRedis: validateBudgetEvidence(
      evidence.realtimeRedis,
      'capacityEvidence.realtimeRedis',
      desiredEnvelope.realtimeRedis,
    ),
  };
}

function validateRecordedCapacityEvaluation(value, current, desired) {
  const evaluation = requireExactKeys(
    value,
    [
      'profileChange',
      'currentEnvelope',
      'desiredEnvelope',
      'database',
      'queueRedis',
      'realtimeRedis',
    ],
    'capacityExecution.capacityEvaluation',
  );
  const currentEnvelope = calculateSteadyStateEnvelopes(current);
  const desiredEnvelope = calculateSteadyStateEnvelopes(desired);
  if (
    !isDeepStrictEqual(evaluation.currentEnvelope, currentEnvelope) ||
    !isDeepStrictEqual(evaluation.desiredEnvelope, desiredEnvelope)
  ) {
    fail(
      'CAPACITY_EVALUATION_MISMATCH',
      'recorded capacity envelopes differ from the governed capacity specifications.',
    );
  }
  const increased = Object.keys(desiredEnvelope).some(
    (key) => desiredEnvelope[key] > currentEnvelope[key],
  );
  const expectedProfileChange = increased
    ? 'increase'
    : 'preservation-or-decrease';
  if (evaluation.profileChange !== expectedProfileChange) {
    fail(
      'CAPACITY_EVALUATION_MISMATCH',
      'recorded capacity profile classification is invalid.',
    );
  }
  for (const [resource, calculatedEnvelope] of Object.entries(
    desiredEnvelope,
  )) {
    const resourceEvaluation = requireExactKeys(
      evaluation[resource],
      [
        'calculatedGovernedEnvelope',
        'safetyReserveAuthority',
        'effectiveApprovalBudget',
        'evidenceAuthorityUsed',
        'reserveStatus',
        'approvalResult',
      ],
      `capacityExecution.capacityEvaluation.${resource}`,
    );
    if (resourceEvaluation.calculatedGovernedEnvelope !== calculatedEnvelope) {
      fail(
        'CAPACITY_EVALUATION_MISMATCH',
        `${resource} recorded envelope is invalid.`,
      );
    }
    if (!increased) {
      const expected = {
        calculatedGovernedEnvelope: calculatedEnvelope,
        safetyReserveAuthority: null,
        effectiveApprovalBudget: null,
        evidenceAuthorityUsed: 'already-live-preservation-or-decrease',
        reserveStatus: 'not-required-for-preservation-or-decrease',
        approvalResult: 'approved',
      };
      if (!isDeepStrictEqual(resourceEvaluation, expected)) {
        fail(
          'CAPACITY_EVALUATION_MISMATCH',
          `${resource} preservation evidence is invalid.`,
        );
      }
      continue;
    }
    requireString(
      resourceEvaluation.safetyReserveAuthority,
      `capacityExecution.capacityEvaluation.${resource}.safetyReserveAuthority`,
    );
    requireString(
      resourceEvaluation.evidenceAuthorityUsed,
      `capacityExecution.capacityEvaluation.${resource}.evidenceAuthorityUsed`,
    );
    requireInteger(
      resourceEvaluation.effectiveApprovalBudget,
      `capacityExecution.capacityEvaluation.${resource}.effectiveApprovalBudget`,
    );
    if (
      resourceEvaluation.effectiveApprovalBudget < calculatedEnvelope ||
      resourceEvaluation.reserveStatus !== 'governed' ||
      resourceEvaluation.approvalResult !== 'approved'
    ) {
      fail(
        'CAPACITY_EVALUATION_MISMATCH',
        `${resource} governed budget evidence is invalid.`,
      );
    }
  }
  return evaluation;
}

function evaluateCandidateOverlapEvidence(overlapValue, capacityEvidence) {
  const overlap = requireObject(overlapValue, 'candidateOverlap');
  if (!capacityEvidence) {
    fail(
      'CAPACITY_DATABASE_EVIDENCE_REQUIRED',
      'candidate overlap requires governed database and Redis budget evidence.',
    );
  }
  const evidence = requireExactKeys(
    capacityEvidence,
    ['database', 'queueRedis', 'realtimeRedis'],
    'capacityEvidence',
  );
  return {
    database: validateBudgetEvidence(
      evidence.database,
      'capacityEvidence.database',
      overlap.database.totalRuntimeOverlap,
    ),
    queueRedis: validateBudgetEvidence(
      evidence.queueRedis,
      'capacityEvidence.queueRedis',
      overlap.queueRedis.totalRuntimeOverlap,
    ),
    realtimeRedis: validateBudgetEvidence(
      evidence.realtimeRedis,
      'capacityEvidence.realtimeRedis',
      overlap.realtimeRedis.totalRuntimeOverlap,
    ),
  };
}

function canonicalRevisionCapacityJson(value) {
  const revision = validateCandidateRevisionCapacitySpec(value);
  return JSON.stringify({
    revisionMaxInstances: revision.revisionMaxInstances,
    concurrency: revision.concurrency,
    requestTimeoutSeconds: revision.requestTimeoutSeconds,
    sessionAffinity: revision.sessionAffinity,
    databaseConnectionLimit: revision.databaseConnectionLimit,
  });
}

function capacityAwareCandidateIdentity(artifactDigest, revisionValue) {
  requireString(artifactDigest, 'artifactDigest', /^sha256:[a-f0-9]{64}$/u);
  const canonicalRevisionCapacity =
    canonicalRevisionCapacityJson(revisionValue);
  const fingerprint = sha256(
    `${CANDIDATE_IDENTITY_VERSION}\n${artifactDigest}\n${canonicalRevisionCapacity}`,
  );
  return {
    identityVersion: CANDIDATE_IDENTITY_VERSION,
    fingerprint,
    canonicalRevisionCapacity,
    candidateTag: `candidate-${fingerprint.slice(0, 12)}`,
  };
}

function candidateServiceCapacity({
  mode,
  liveServiceMinInstances,
  liveServiceMaxInstances,
  governedServiceMinInstances,
  governedServiceMaxInstances,
  promotionStable = false,
}) {
  for (const [name, value] of Object.entries({
    liveServiceMinInstances,
    liveServiceMaxInstances,
    governedServiceMinInstances,
    governedServiceMaxInstances,
  })) {
    requireInteger(value, name);
  }
  if (liveServiceMinInstances > liveServiceMaxInstances) {
    fail('CAPACITY_RANGE_INVALID', 'live service minimum exceeds maximum.');
  }
  if (governedServiceMinInstances > governedServiceMaxInstances) {
    fail('CAPACITY_RANGE_INVALID', 'governed service minimum exceeds maximum.');
  }
  if (mode === 'candidate_no_traffic') {
    return {
      minInstances: liveServiceMinInstances,
      maxInstances: liveServiceMaxInstances,
      authority: 'fresh-live-service-capacity-preservation',
    };
  }
  if (mode === 'post_promotion_normalization') {
    if (promotionStable !== true) {
      fail(
        'NORMALIZATION_PREREQUISITE_MISSING',
        'service normalization requires completed promotion and stability evidence.',
      );
    }
    return {
      minInstances: governedServiceMinInstances,
      maxInstances: governedServiceMaxInstances,
      authority: 'governed-post-promotion-service-normalization',
    };
  }
  fail(
    'CAPACITY_MODE_UNSUPPORTED',
    'mode must be candidate_no_traffic or post_promotion_normalization.',
  );
}

function currentSourceSha() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
      windowsHide: true,
    }).trim();
  } catch (error) {
    fail(
      'SOURCE_AUTHORITY_UNAVAILABLE',
      `current source SHA could not be resolved: ${error.message}`,
    );
  }
}

function initialPlanLifecycle() {
  return {
    status: 'not-created',
    savedPlanSha256: null,
    savedPlanSizeBytes: null,
    planJsonSha256: null,
    review: null,
    registeredAt: null,
  };
}

function buildCapacityExecution(input) {
  const context = requireExactKeys(
    input,
    [
      'executionId',
      'repository',
      'sourceSha',
      'environment',
      'discoveredAt',
      'terraformState',
      'currentCapacitySpec',
      'desiredCapacitySpec',
      'capacityEvidence',
      'savedPlanPath',
    ],
    'context',
  );
  const executionId = requireString(
    context.executionId,
    'context.executionId',
    /^[a-z0-9][a-z0-9._-]{2,80}$/u,
  );
  if (context.repository !== REPOSITORY) {
    fail(
      'CAPACITY_REPOSITORY_MISMATCH',
      `repository must equal ${REPOSITORY}.`,
    );
  }
  const sourceSha = requireString(
    context.sourceSha,
    'context.sourceSha',
    /^[a-f0-9]{40}$/u,
  );
  if (sourceSha !== currentSourceSha()) {
    fail(
      'CAPACITY_SOURCE_SHA_MISMATCH',
      'sourceSha must equal the current repository HEAD.',
    );
  }
  const authority = environmentAuthority(context.environment);
  requireIsoTimestamp(context.discoveredAt, 'context.discoveredAt');
  const state = requireState(context.terraformState, 'context.terraformState');
  const current = validateCapacitySpec(
    context.currentCapacitySpec,
    'context.currentCapacitySpec',
  );
  const desired = validateCapacitySpec(
    context.desiredCapacitySpec,
    'context.desiredCapacitySpec',
  );
  const evaluation = evaluateStandaloneCapacityChange({
    currentCapacitySpec: current,
    desiredCapacitySpec: desired,
    capacityEvidence: context.capacityEvidence,
  });
  if (
    isDeepStrictEqual(
      standaloneMutableCapacity(current),
      standaloneMutableCapacity(desired),
    )
  ) {
    fail(
      'CAPACITY_NO_CHANGE',
      'runtime-capacity-adjustment requires at least one service or worker count change.',
    );
  }
  const savedPlanPath = path.resolve(
    requireString(context.savedPlanPath, 'context.savedPlanPath'),
  );
  if (savedPlanPath.startsWith(`${REPOSITORY_ROOT}${path.sep}`)) {
    fail(
      'CAPACITY_ARTIFACT_PATH_INVALID',
      'saved plans must be stored outside the source repository.',
    );
  }
  const execution = {
    capacityExecutionSchemaVersion: CAPACITY_EXECUTION_SCHEMA_VERSION,
    capacitySpecVersion: CAPACITY_SPEC_VERSION,
    operationId: CAPACITY_OPERATION_ID,
    executionId,
    repository: REPOSITORY,
    sourceSha,
    environment: context.environment,
    environmentAuthority: authority,
    discoveredAt: context.discoveredAt,
    terraformStatePrecondition: state,
    currentCapacitySpec: current,
    desiredCapacitySpec: desired,
    mutableCapacityChange: {
      before: standaloneMutableCapacity(current),
      after: standaloneMutableCapacity(desired),
    },
    forbiddenRevisionMutation: false,
    capacityEvaluation: evaluation,
    terraformVariables: terraformVariablesForCapacitySpec(desired),
    savedPlanPath,
    planEvidence: initialPlanLifecycle(),
    approval: {
      status: 'pending',
      approver: null,
      approvalRef: null,
      approvedAt: null,
    },
    apply: {
      status: 'not-applied',
      attempted: false,
      evidenceRef: null,
      recordedAt: null,
      postApplyState: null,
    },
    liveVerification: {
      status: 'pending',
      evidenceRef: null,
      recordedAt: null,
      observedMutableCapacity: null,
    },
    singleConsumptionStatus: 'unconsumed',
    blockedSavedPlanHashes: [],
    consumedSavedPlanHashes: [],
    status: 'constructed',
  };
  validateCapacityExecution(execution);
  return execution;
}

function validateCapacityExecution(value) {
  const execution = requireExactKeys(
    value,
    [
      'capacityExecutionSchemaVersion',
      'capacitySpecVersion',
      'operationId',
      'executionId',
      'repository',
      'sourceSha',
      'environment',
      'environmentAuthority',
      'discoveredAt',
      'terraformStatePrecondition',
      'currentCapacitySpec',
      'desiredCapacitySpec',
      'mutableCapacityChange',
      'forbiddenRevisionMutation',
      'capacityEvaluation',
      'terraformVariables',
      'savedPlanPath',
      'planEvidence',
      'approval',
      'apply',
      'liveVerification',
      'singleConsumptionStatus',
      'blockedSavedPlanHashes',
      'consumedSavedPlanHashes',
      'status',
    ],
    'capacityExecution',
  );
  if (
    execution.capacityExecutionSchemaVersion !==
      CAPACITY_EXECUTION_SCHEMA_VERSION ||
    execution.capacitySpecVersion !== CAPACITY_SPEC_VERSION ||
    execution.operationId !== CAPACITY_OPERATION_ID
  ) {
    fail(
      'CAPACITY_SCHEMA_UNSUPPORTED',
      'capacity execution schema, capacity specification, or operation identity is unsupported.',
    );
  }
  if (Object.hasOwn(execution, 'releaseManifestVersion')) {
    fail(
      'CAPACITY_SCHEMA_INVALID',
      'a Release manifest cannot validate as a Capacity execution.',
    );
  }
  requireString(execution.executionId, 'capacityExecution.executionId');
  if (execution.repository !== REPOSITORY) {
    fail('CAPACITY_REPOSITORY_MISMATCH', 'repository authority changed.');
  }
  requireString(
    execution.sourceSha,
    'capacityExecution.sourceSha',
    /^[a-f0-9]{40}$/u,
  );
  if (execution.sourceSha !== currentSourceSha()) {
    fail(
      'CAPACITY_SOURCE_SHA_MISMATCH',
      'capacity execution source authority is stale.',
    );
  }
  const authority = environmentAuthority(execution.environment);
  if (!isDeepStrictEqual(execution.environmentAuthority, authority)) {
    fail(
      'CAPACITY_ENVIRONMENT_IDENTITY_MISMATCH',
      'capacity environment resource identity does not match its allowlist.',
    );
  }
  requireIsoTimestamp(execution.discoveredAt, 'capacityExecution.discoveredAt');
  requireState(
    execution.terraformStatePrecondition,
    'capacityExecution.terraformStatePrecondition',
  );
  const { current, desired } = assertStandaloneRevisionCapacityPreserved(
    execution.currentCapacitySpec,
    execution.desiredCapacitySpec,
  );
  if (
    isDeepStrictEqual(
      standaloneMutableCapacity(current),
      standaloneMutableCapacity(desired),
    )
  ) {
    fail(
      'CAPACITY_NO_CHANGE',
      'runtime-capacity-adjustment requires at least one service or worker count change.',
    );
  }
  validateRecordedCapacityEvaluation(
    execution.capacityEvaluation,
    current,
    desired,
  );
  if (
    execution.forbiddenRevisionMutation !== false ||
    !isDeepStrictEqual(execution.mutableCapacityChange, {
      before: standaloneMutableCapacity(current),
      after: standaloneMutableCapacity(desired),
    }) ||
    !isDeepStrictEqual(
      execution.terraformVariables,
      terraformVariablesForCapacitySpec(desired),
    )
  ) {
    fail(
      'CAPACITY_SPEC_MISMATCH',
      'capacity execution mutation or Terraform variables changed.',
    );
  }
  const savedPlanPath = path.resolve(
    requireString(execution.savedPlanPath, 'capacityExecution.savedPlanPath'),
  );
  if (
    savedPlanPath !== execution.savedPlanPath ||
    savedPlanPath.startsWith(`${REPOSITORY_ROOT}${path.sep}`)
  ) {
    fail(
      'CAPACITY_ARTIFACT_PATH_INVALID',
      'saved plan path must be absolute and outside the source repository.',
    );
  }
  const plan = requireExactKeys(
    execution.planEvidence,
    [
      'status',
      'savedPlanSha256',
      'savedPlanSizeBytes',
      'planJsonSha256',
      'review',
      'registeredAt',
    ],
    'capacityExecution.planEvidence',
  );
  const approval = requireExactKeys(
    execution.approval,
    ['status', 'approver', 'approvalRef', 'approvedAt'],
    'capacityExecution.approval',
  );
  const apply = requireExactKeys(
    execution.apply,
    ['status', 'attempted', 'evidenceRef', 'recordedAt', 'postApplyState'],
    'capacityExecution.apply',
  );
  const verification = requireExactKeys(
    execution.liveVerification,
    ['status', 'evidenceRef', 'recordedAt', 'observedMutableCapacity'],
    'capacityExecution.liveVerification',
  );
  if (plan.status === 'not-created') {
    if (!isDeepStrictEqual(plan, initialPlanLifecycle())) {
      fail(
        'CAPACITY_LIFECYCLE_INVALID',
        'uncreated plan evidence must retain exact empty values.',
      );
    }
  } else if (plan.status === 'registered') {
    for (const field of ['savedPlanSha256', 'planJsonSha256']) {
      requireString(
        plan[field],
        `capacityExecution.planEvidence.${field}`,
        /^[a-f0-9]{64}$/u,
      );
    }
    requireInteger(
      plan.savedPlanSizeBytes,
      'capacityExecution.planEvidence.savedPlanSizeBytes',
    );
    requireIsoTimestamp(
      plan.registeredAt,
      'capacityExecution.planEvidence.registeredAt',
    );
    const review = requireExactKeys(
      plan.review,
      [
        'schemaVersion',
        'status',
        'executionId',
        'sourceSha',
        'environment',
        'operationId',
        'stateLineage',
        'stateSerial',
        'formatVersion',
        'nonNoopResourceChangeCount',
        'intendedSemanticChangeCount',
        'unapprovedSemanticChangeCount',
        'apiTemplateMutation',
        'trafficMutation',
      ],
      'capacityExecution.planEvidence.review',
    );
    if (
      review.schemaVersion !== 1 ||
      review.status !== 'passed' ||
      review.executionId !== execution.executionId ||
      review.sourceSha !== execution.sourceSha ||
      review.environment !== execution.environment ||
      review.operationId !== CAPACITY_OPERATION_ID ||
      review.stateLineage !== execution.terraformStatePrecondition.lineage ||
      review.stateSerial !== execution.terraformStatePrecondition.serial ||
      !/^1[.]\d+$/u.test(review.formatVersion) ||
      !Number.isSafeInteger(review.nonNoopResourceChangeCount) ||
      review.nonNoopResourceChangeCount < 1 ||
      !Number.isSafeInteger(review.intendedSemanticChangeCount) ||
      review.intendedSemanticChangeCount < 1 ||
      review.unapprovedSemanticChangeCount !== 0 ||
      review.apiTemplateMutation !== false ||
      review.trafficMutation !== false
    ) {
      fail(
        'CAPACITY_LIFECYCLE_INVALID',
        'registered deterministic plan review evidence is invalid or stale.',
      );
    }
  } else {
    fail('CAPACITY_LIFECYCLE_INVALID', 'plan status is invalid.');
  }
  if (approval.status === 'pending') {
    if (
      !isDeepStrictEqual(approval, {
        status: 'pending',
        approver: null,
        approvalRef: null,
        approvedAt: null,
      })
    ) {
      fail('CAPACITY_LIFECYCLE_INVALID', 'pending approval is contradictory.');
    }
  } else if (approval.status === 'approved') {
    requireString(approval.approver, 'capacityExecution.approval.approver');
    requireString(
      approval.approvalRef,
      'capacityExecution.approval.approvalRef',
    );
    requireIsoTimestamp(
      approval.approvedAt,
      'capacityExecution.approval.approvedAt',
    );
  } else {
    fail('CAPACITY_LIFECYCLE_INVALID', 'approval status is invalid.');
  }
  if (apply.status === 'not-applied') {
    if (
      !isDeepStrictEqual(apply, {
        status: 'not-applied',
        attempted: false,
        evidenceRef: null,
        recordedAt: null,
        postApplyState: null,
      })
    ) {
      fail(
        'CAPACITY_LIFECYCLE_INVALID',
        'not-applied evidence is contradictory.',
      );
    }
  } else if (['succeeded', 'failed'].includes(apply.status)) {
    if (apply.attempted !== true) {
      fail('CAPACITY_LIFECYCLE_INVALID', 'apply attempt evidence is missing.');
    }
    requireString(apply.evidenceRef, 'capacityExecution.apply.evidenceRef');
    requireIsoTimestamp(apply.recordedAt, 'capacityExecution.apply.recordedAt');
    if (apply.status === 'succeeded') {
      const postState = requireState(
        apply.postApplyState,
        'capacityExecution.apply.postApplyState',
      );
      if (
        postState.lineage !== execution.terraformStatePrecondition.lineage ||
        postState.serial <= execution.terraformStatePrecondition.serial
      ) {
        fail(
          'CAPACITY_LIFECYCLE_INVALID',
          'successful apply state must retain lineage and advance serial.',
        );
      }
    } else if (apply.postApplyState !== null) {
      fail(
        'CAPACITY_LIFECYCLE_INVALID',
        'failed apply must not claim successor state.',
      );
    }
  } else {
    fail('CAPACITY_LIFECYCLE_INVALID', 'apply status is invalid.');
  }
  if (verification.status === 'pending') {
    if (
      !isDeepStrictEqual(verification, {
        status: 'pending',
        evidenceRef: null,
        recordedAt: null,
        observedMutableCapacity: null,
      })
    ) {
      fail(
        'CAPACITY_LIFECYCLE_INVALID',
        'pending live verification is contradictory.',
      );
    }
  } else if (['passed', 'failed'].includes(verification.status)) {
    requireString(
      verification.evidenceRef,
      'capacityExecution.liveVerification.evidenceRef',
    );
    requireIsoTimestamp(
      verification.recordedAt,
      'capacityExecution.liveVerification.recordedAt',
    );
    const observed = requireExactKeys(
      verification.observedMutableCapacity,
      ['api', 'workers'],
      'capacityExecution.liveVerification.observedMutableCapacity',
    );
    if (
      verification.status === 'passed' &&
      !isDeepStrictEqual(observed, execution.mutableCapacityChange.after)
    ) {
      fail(
        'CAPACITY_LIFECYCLE_INVALID',
        'passed live verification differs from desired service/worker capacity.',
      );
    }
  } else {
    fail('CAPACITY_LIFECYCLE_INVALID', 'verification status is invalid.');
  }
  const lifecycleSignature = [
    execution.status,
    plan.status,
    approval.status,
    apply.status,
    verification.status,
    execution.singleConsumptionStatus,
  ].join('|');
  const allowed = new Set([
    'constructed|not-created|pending|not-applied|pending|unconsumed',
    'plan-registered|registered|pending|not-applied|pending|unconsumed',
    'approved|registered|approved|not-applied|pending|unconsumed',
    'applied-awaiting-live-verification|registered|approved|succeeded|pending|consumed-success',
    'closed|registered|approved|succeeded|passed|consumed-success',
    'failed|registered|approved|failed|pending|invalidated-after-failed-attempt',
    'failed|registered|approved|succeeded|failed|consumed-success',
  ]);
  if (!allowed.has(lifecycleSignature)) {
    fail(
      'CAPACITY_LIFECYCLE_INVALID',
      'capacity lifecycle evidence is contradictory.',
    );
  }
  for (const field of ['blockedSavedPlanHashes', 'consumedSavedPlanHashes']) {
    if (
      !Array.isArray(execution[field]) ||
      execution[field].some((hash) => !/^[a-f0-9]{64}$/u.test(hash)) ||
      new Set(execution[field]).size !== execution[field].length
    ) {
      fail('CAPACITY_LIFECYCLE_INVALID', `${field} is invalid.`);
    }
  }
  if (
    execution.blockedSavedPlanHashes.some((hash) =>
      execution.consumedSavedPlanHashes.includes(hash),
    ) ||
    (apply.attempted &&
      !execution.consumedSavedPlanHashes.includes(plan.savedPlanSha256)) ||
    (!apply.attempted && execution.consumedSavedPlanHashes.length !== 0)
  ) {
    fail(
      'CAPACITY_PLAN_REPLAY',
      'blocked, registered, and consumed Saved Plan authorities conflict.',
    );
  }
  return execution;
}

function collectUnknownPaths(value, pathPrefix = '') {
  if (value === true) return [pathPrefix];
  if (value === false || value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      collectUnknownPaths(item, `${pathPrefix}[${index}]`),
    );
  }
  if (isPlainObject(value)) {
    return Object.entries(value).flatMap(([key, item]) =>
      collectUnknownPaths(item, pathPrefix ? `${pathPrefix}.${key}` : key),
    );
  }
  return [pathPrefix];
}

function collectKnownDiffs(before, after, pathPrefix = '') {
  if (isDeepStrictEqual(before, after)) return [];
  if (Array.isArray(before) && Array.isArray(after)) {
    const length = Math.max(before.length, after.length);
    return Array.from({ length }, (_, index) =>
      collectKnownDiffs(before[index], after[index], `${pathPrefix}[${index}]`),
    ).flat();
  }
  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    return [...keys].flatMap((key) =>
      collectKnownDiffs(
        before[key],
        after[key],
        pathPrefix ? `${pathPrefix}.${key}` : key,
      ),
    );
  }
  return [{ path: pathPrefix, before, after }];
}

function desiredDiffsForExecution(execution) {
  const before = execution.mutableCapacityChange.before;
  const after = execution.mutableCapacityChange.after;
  const expected = new Map();
  const add = (address, semanticPath, oldValue, newValue) => {
    if (!isDeepStrictEqual(oldValue, newValue)) {
      expected.set(`${address}|${semanticPath}`, {
        address,
        path: semanticPath,
        before: oldValue,
        after: newValue,
      });
    }
  };
  add(
    RUNTIME_RESOURCE_ADDRESSES.api,
    'scaling[0].min_instance_count',
    before.api.serviceMinInstances,
    after.api.serviceMinInstances,
  );
  add(
    RUNTIME_RESOURCE_ADDRESSES.api,
    'scaling[0].max_instance_count',
    before.api.serviceMaxInstances,
    after.api.serviceMaxInstances,
  );
  add(
    RUNTIME_RESOURCE_ADDRESSES.coreWorker,
    'scaling[0].manual_instance_count',
    before.workers.coreManualInstanceCount,
    after.workers.coreManualInstanceCount,
  );
  add(
    RUNTIME_RESOURCE_ADDRESSES.mediaWorker,
    'scaling[0].manual_instance_count',
    before.workers.mediaManualInstanceCount,
    after.workers.mediaManualInstanceCount,
  );
  return expected;
}

function reviewCapacityPlanJson(planJson, executionValue) {
  const execution = validateCapacityExecution(executionValue);
  const plan = requireObject(planJson, 'planJson');
  if (
    typeof plan.format_version !== 'string' ||
    !/^1[.]\d+$/u.test(plan.format_version) ||
    plan.applyable !== true ||
    plan.complete !== true ||
    plan.errored !== false ||
    !Array.isArray(plan.resource_changes)
  ) {
    fail(
      'CAPACITY_PLAN_MALFORMED',
      'plan JSON must be complete, applyable, non-errored format version 1.',
    );
  }
  if (
    Object.hasOwn(plan, 'resource_drift') &&
    !Array.isArray(plan.resource_drift)
  ) {
    fail('CAPACITY_PLAN_MALFORMED', 'resource_drift must be an array.');
  }
  if ((plan.resource_drift ?? []).length !== 0) {
    fail(
      'CAPACITY_PLAN_DRIFT_FORBIDDEN',
      'standalone Capacity plans cannot contain refresh-only drift.',
    );
  }
  const expected = desiredDiffsForExecution(execution);
  const observed = new Map();
  const addresses = new Set();
  for (const [index, recordValue] of plan.resource_changes.entries()) {
    const record = requireObject(
      recordValue,
      `planJson.resource_changes[${index}]`,
    );
    requireString(record.address, `resource_changes[${index}].address`);
    if (addresses.has(record.address)) {
      fail(
        'CAPACITY_PLAN_DUPLICATE_RESOURCE',
        `duplicate resource change: ${record.address}.`,
      );
    }
    addresses.add(record.address);
    const change = requireObject(
      record.change,
      `resource_changes[${index}].change`,
    );
    if (!Array.isArray(change.actions)) {
      fail('CAPACITY_PLAN_MALFORMED', 'resource actions must be an array.');
    }
    for (const field of ['before', 'after', 'after_unknown']) {
      if (!Object.hasOwn(change, field)) {
        fail(
          'CAPACITY_PLAN_MALFORMED',
          `resource change ${record.address} is missing ${field}.`,
        );
      }
    }
    if (
      Object.hasOwn(record, 'previous_address') ||
      Object.hasOwn(record, 'deposed') ||
      Object.hasOwn(record, 'importing') ||
      Object.hasOwn(change, 'importing')
    ) {
      fail(
        'CAPACITY_PLAN_NON_CAPACITY_MUTATION',
        `unsafe resource provenance is forbidden: ${record.address}.`,
      );
    }
    if (isDeepStrictEqual(change.actions, ['no-op'])) {
      if (!isDeepStrictEqual(change.before, change.after)) {
        fail(
          'CAPACITY_PLAN_NON_CAPACITY_MUTATION',
          `no-op resource contains a semantic change: ${record.address}.`,
        );
      }
      continue;
    }
    if (!isDeepStrictEqual(change.actions, ['update'])) {
      fail(
        'CAPACITY_PLAN_ACTION_FORBIDDEN',
        'standalone Capacity permits update-in-place only.',
      );
    }
    const allowedPaths =
      record.address === RUNTIME_RESOURCE_ADDRESSES.api
        ? API_SERVICE_ALLOWED_PATHS
        : [
              RUNTIME_RESOURCE_ADDRESSES.coreWorker,
              RUNTIME_RESOURCE_ADDRESSES.mediaWorker,
            ].includes(record.address)
          ? WORKER_ALLOWED_PATHS
          : null;
    if (!allowedPaths) {
      fail(
        'CAPACITY_PLAN_NON_CAPACITY_MUTATION',
        `unapproved resource change: ${record.address}.`,
      );
    }
    const expectedType =
      record.address === RUNTIME_RESOURCE_ADDRESSES.api
        ? 'google_cloud_run_v2_service'
        : 'google_cloud_run_v2_worker_pool';
    if (
      record.mode !== 'managed' ||
      record.type !== expectedType ||
      record.provider_name !== GOOGLE_PROVIDER_NAME
    ) {
      fail(
        'CAPACITY_PLAN_RESOURCE_IDENTITY_MISMATCH',
        `resource identity is not governed for ${record.address}.`,
      );
    }
    const unknown = collectUnknownPaths(change.after_unknown);
    if (unknown.length !== 0) {
      fail(
        'CAPACITY_PLAN_UNKNOWN_VALUE',
        `capacity change contains unknown values: ${record.address}.`,
      );
    }
    const diffs = collectKnownDiffs(change.before, change.after);
    if (diffs.length === 0) {
      fail(
        'CAPACITY_PLAN_MALFORMED',
        `update action has no semantic change: ${record.address}.`,
      );
    }
    for (const diff of diffs) {
      if (!allowedPaths.includes(diff.path)) {
        fail(
          'CAPACITY_PLAN_NON_CAPACITY_MUTATION',
          `forbidden semantic path ${diff.path} on ${record.address}.`,
        );
      }
      const key = `${record.address}|${diff.path}`;
      if (observed.has(key)) {
        fail('CAPACITY_PLAN_DUPLICATE_CHANGE', `duplicate change: ${key}.`);
      }
      observed.set(key, { address: record.address, ...diff });
    }
  }
  if (
    !isDeepStrictEqual([...observed.keys()].sort(), [...expected.keys()].sort())
  ) {
    fail(
      'CAPACITY_PLAN_CHANGE_SET_MISMATCH',
      'plan changes do not exactly match the governed Capacity specification.',
    );
  }
  for (const [key, expectedDiff] of expected) {
    const actual = observed.get(key);
    if (
      !isDeepStrictEqual(actual.before, expectedDiff.before) ||
      !isDeepStrictEqual(actual.after, expectedDiff.after)
    ) {
      fail(
        'CAPACITY_PLAN_VALUE_MISMATCH',
        `plan values differ from the governed specification for ${key}.`,
      );
    }
  }
  return {
    schemaVersion: 1,
    status: 'passed',
    executionId: execution.executionId,
    sourceSha: execution.sourceSha,
    environment: execution.environment,
    operationId: CAPACITY_OPERATION_ID,
    stateLineage: execution.terraformStatePrecondition.lineage,
    stateSerial: execution.terraformStatePrecondition.serial,
    formatVersion: plan.format_version,
    nonNoopResourceChangeCount: new Set(
      [...observed.values()].map((item) => item.address),
    ).size,
    intendedSemanticChangeCount: observed.size,
    unapprovedSemanticChangeCount: 0,
    apiTemplateMutation: false,
    trafficMutation: false,
  };
}

function registerCapacityPlan(
  executionValue,
  { savedPlanBytes, planJsonBytes, recordedAt },
) {
  const execution = structuredClone(validateCapacityExecution(executionValue));
  if (execution.status !== 'constructed') {
    fail('CAPACITY_PLAN_REPLAY', 'capacity execution already has a plan.');
  }
  if (!Buffer.isBuffer(savedPlanBytes) || savedPlanBytes.length === 0) {
    fail('CAPACITY_PLAN_INVALID', 'saved plan bytes must be non-empty.');
  }
  if (!Buffer.isBuffer(planJsonBytes) || planJsonBytes.length === 0) {
    fail('CAPACITY_PLAN_INVALID', 'plan JSON bytes must be non-empty.');
  }
  requireIsoTimestamp(recordedAt, 'recordedAt');
  const savedPlanSha256 = sha256(savedPlanBytes);
  if (
    execution.blockedSavedPlanHashes.includes(savedPlanSha256) ||
    execution.consumedSavedPlanHashes.includes(savedPlanSha256)
  ) {
    fail(
      'CAPACITY_PLAN_REPLAY',
      'saved plan hash is blocked or already consumed.',
    );
  }
  let planJson;
  try {
    planJson = JSON.parse(planJsonBytes.toString('utf8'));
  } catch (error) {
    fail(
      'CAPACITY_PLAN_MALFORMED',
      `plan JSON could not be parsed: ${error.message}`,
    );
  }
  const review = reviewCapacityPlanJson(planJson, execution);
  execution.planEvidence = {
    status: 'registered',
    savedPlanSha256,
    savedPlanSizeBytes: savedPlanBytes.length,
    planJsonSha256: sha256(planJsonBytes),
    review,
    registeredAt: recordedAt,
  };
  execution.status = 'plan-registered';
  validateCapacityExecution(execution);
  return execution;
}

function approveCapacityPlan(
  executionValue,
  { approver, approvalRef, approvedAt },
) {
  const execution = structuredClone(validateCapacityExecution(executionValue));
  if (execution.status !== 'plan-registered') {
    fail('CAPACITY_APPROVAL_OUT_OF_ORDER', 'a registered plan is required.');
  }
  execution.approval = {
    status: 'approved',
    approver: requireString(approver, 'approver'),
    approvalRef: requireString(approvalRef, 'approvalRef'),
    approvedAt: requireIsoTimestamp(approvedAt, 'approvedAt'),
  };
  execution.status = 'approved';
  validateCapacityExecution(execution);
  return execution;
}

function capacityPreApplyGuard(
  executionValue,
  { sourceSha, terraformState, savedPlanBytes },
) {
  const execution = validateCapacityExecution(executionValue);
  if (
    execution.status !== 'approved' ||
    execution.singleConsumptionStatus !== 'unconsumed'
  ) {
    fail(
      'CAPACITY_PRE_APPLY_GUARD_FAILED',
      'capacity plan must be approved and unconsumed.',
    );
  }
  if (sourceSha !== execution.sourceSha || sourceSha !== currentSourceSha()) {
    fail(
      'CAPACITY_SOURCE_SHA_MISMATCH',
      'pre-apply source authority is stale.',
    );
  }
  const state = requireState(terraformState, 'terraformState');
  if (!isDeepStrictEqual(state, execution.terraformStatePrecondition)) {
    fail(
      'CAPACITY_STATE_PRECONDITION_STALE',
      'Terraform state lineage or serial changed after planning.',
    );
  }
  if (
    !Buffer.isBuffer(savedPlanBytes) ||
    sha256(savedPlanBytes) !== execution.planEvidence.savedPlanSha256
  ) {
    fail(
      'CAPACITY_SAVED_PLAN_CHANGED',
      'saved plan bytes no longer match registered authority.',
    );
  }
  return {
    status: 'passed',
    executionId: execution.executionId,
    operationId: CAPACITY_OPERATION_ID,
    sourceSha,
    state,
    savedPlanSha256: execution.planEvidence.savedPlanSha256,
    singleConsumptionStatus: 'unconsumed',
  };
}

function recordCapacityApply(
  executionValue,
  { savedPlanBytes, result, evidenceRef, recordedAt, postApplyState = null },
) {
  const execution = structuredClone(validateCapacityExecution(executionValue));
  capacityPreApplyGuard(execution, {
    sourceSha: execution.sourceSha,
    terraformState: execution.terraformStatePrecondition,
    savedPlanBytes,
  });
  if (!['succeeded', 'failed'].includes(result)) {
    fail(
      'CAPACITY_APPLY_RESULT_INVALID',
      'result must be succeeded or failed.',
    );
  }
  const planHash = execution.planEvidence.savedPlanSha256;
  execution.consumedSavedPlanHashes.push(planHash);
  execution.apply = {
    status: result,
    attempted: true,
    evidenceRef: requireString(evidenceRef, 'evidenceRef'),
    recordedAt: requireIsoTimestamp(recordedAt, 'recordedAt'),
    postApplyState:
      result === 'succeeded'
        ? requireState(postApplyState, 'postApplyState')
        : null,
  };
  execution.singleConsumptionStatus =
    result === 'succeeded'
      ? 'consumed-success'
      : 'invalidated-after-failed-attempt';
  execution.status =
    result === 'succeeded' ? 'applied-awaiting-live-verification' : 'failed';
  validateCapacityExecution(execution);
  return execution;
}

function recordCapacityVerification(
  executionValue,
  { result, evidenceRef, recordedAt, observedMutableCapacity },
) {
  const execution = structuredClone(validateCapacityExecution(executionValue));
  if (execution.status !== 'applied-awaiting-live-verification') {
    fail(
      'CAPACITY_VERIFICATION_OUT_OF_ORDER',
      'successful single-consume apply is required before verification.',
    );
  }
  if (!['passed', 'failed'].includes(result)) {
    fail(
      'CAPACITY_VERIFICATION_RESULT_INVALID',
      'result must be passed or failed.',
    );
  }
  const observed = requireExactKeys(
    observedMutableCapacity,
    ['api', 'workers'],
    'observedMutableCapacity',
  );
  const expected = execution.mutableCapacityChange.after;
  if (result === 'passed' && !isDeepStrictEqual(observed, expected)) {
    fail(
      'CAPACITY_LIVE_VERIFICATION_MISMATCH',
      'observed service/worker capacity differs from the governed specification.',
    );
  }
  execution.liveVerification = {
    status: result,
    evidenceRef: requireString(evidenceRef, 'evidenceRef'),
    recordedAt: requireIsoTimestamp(recordedAt, 'recordedAt'),
    observedMutableCapacity: structuredClone(observed),
  };
  execution.status = result === 'passed' ? 'closed' : 'failed';
  validateCapacityExecution(execution);
  return execution;
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(
      'CAPACITY_JSON_INVALID',
      `${label} could not be read: ${error.message}`,
    );
  }
}

function writeJsonAtomic(filePath, value) {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const temporary = `${resolved}.tmp-${process.pid}-${crypto.randomUUID()}`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    fs.renameSync(temporary, resolved);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function parseArgs(argv) {
  const [command, ...tokens] = argv;
  const options = {};
  for (let index = 0; index < tokens.length; index += 2) {
    const key = tokens[index];
    if (!key?.startsWith('--') || tokens[index + 1] === undefined) {
      fail('CAPACITY_CLI_USAGE', 'arguments must use --name value pairs.');
    }
    options[key.slice(2)] = tokens[index + 1];
  }
  return { command, options };
}

function runCli(argv = process.argv.slice(2)) {
  const { command, options } = parseArgs(argv);
  if (command === 'create-spec') {
    const execution = buildCapacityExecution(readJson(options.input, 'input'));
    writeJsonAtomic(options.output, execution);
    return {
      command,
      output: path.resolve(options.output),
      status: execution.status,
    };
  }
  if (command === 'validate-spec') {
    const execution = validateCapacityExecution(
      readJson(options.execution, 'capacity execution'),
    );
    return {
      command,
      executionId: execution.executionId,
      status: execution.status,
    };
  }
  fail('CAPACITY_CLI_USAGE', `unknown command: ${command ?? '<missing>'}.`);
}

if (require.main === module) {
  try {
    process.stdout.write(`${JSON.stringify(runCli())}\n`);
  } catch (error) {
    const code =
      error instanceof CapacityControlError ? error.code : 'UNEXPECTED';
    process.stderr.write(`${code}: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = Object.freeze({
  BASELINE_CAPACITY_SPECS,
  CAPACITY_ENVIRONMENTS,
  CAPACITY_EXECUTION_SCHEMA_VERSION,
  CAPACITY_OPERATION_ID,
  CAPACITY_SPEC_VERSION,
  CANDIDATE_IDENTITY_VERSION,
  CapacityControlError,
  RUNTIME_RESOURCE_ADDRESSES,
  approveCapacityPlan,
  baselineCapacitySpec,
  buildCapacityExecution,
  calculateCandidateOverlap,
  calculateSteadyStateEnvelopes,
  candidateServiceCapacity,
  canonicalRevisionCapacityJson,
  capacityAwareCandidateIdentity,
  capacityPreApplyGuard,
  currentSourceSha,
  environmentAuthority,
  evaluateCandidateOverlapEvidence,
  evaluateStandaloneCapacityChange,
  recordCapacityApply,
  recordCapacityVerification,
  registerCapacityPlan,
  reviewCapacityPlanJson,
  runCli,
  standaloneMutableCapacity,
  terraformVariablesForCapacitySpec,
  validateCandidateRevisionCapacitySpec,
  validateCapacityExecution,
  validateCapacitySpec,
  writeJsonAtomic,
});
