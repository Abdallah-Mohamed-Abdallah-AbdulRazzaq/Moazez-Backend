'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const capacity = require('../runtime-capacity-control.cjs');
const release = require('../runtime-release-control.cjs');

const SOURCE_SHA = capacity.currentSourceSha?.() ?? release.currentSourceSha();
const PLAN_BYTES = Buffer.from('governed-capacity-plan-bytes');
const NOW = '2026-09-15T02:00:00.000Z';
const PROVIDER = 'registry.terraform.io/hashicorp/google';

function clone(value) {
  return structuredClone(value);
}

function withEvidenceRoot(callback) {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'moazez-capacity-evidence-'),
  );
  try {
    return callback(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function writeEvidence(root, name, document) {
  const evidencePath = path.join(root, name);
  const bytes = Buffer.from(`${JSON.stringify(document, null, 2)}\n`);
  fs.writeFileSync(evidencePath, bytes);
  return {
    path: evidencePath,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  };
}

function capacityEvidenceDocument(
  database,
  queueRedis,
  realtimeRedis,
  { environment = 'staging', status = 'approved' } = {},
) {
  const record = (name, budget) => ({
    effectiveApprovalBudget: budget,
    safetyReserveAuthority: `governed-${name}-reserve`,
  });
  return {
    capacityBudgetEvidenceSchemaVersion: 1,
    environment,
    status,
    evidenceId: `capacity-budget-${environment}-test`,
    database: record('database', database),
    queueRedis: record('queue-redis', queueRedis),
    realtimeRedis: record('realtime-redis', realtimeRedis),
  };
}

function promotionEvidenceDocument(overrides = {}) {
  return {
    promotionStabilityEvidenceSchemaVersion: 1,
    evidenceId: 'production-promotion-stability-test',
    environment: 'production',
    status: 'approved',
    trafficPromotionStatus: 'completed',
    formerEmergencyRevision: 'moazez-production-api-emergency',
    formerEmergencyRevisionTrafficStatus: 'removed',
    promotedRevision: 'moazez-production-api-candidate',
    currentServingRevision: 'moazez-production-api-candidate',
    stabilityValidationStatus: 'passed',
    ...overrides,
  };
}

function executionInput(environment = 'staging') {
  const current = capacity.baselineCapacitySpec(environment);
  const desired = clone(current);
  if (environment === 'production') {
    current.workers.coreManualInstanceCount = 2;
  } else {
    desired.api.serviceMaxInstances -= 1;
  }
  return {
    executionId: `capacity-${environment}-test`,
    repository: release.REPOSITORY,
    sourceSha: SOURCE_SHA,
    environment,
    discoveredAt: NOW,
    terraformState: { lineage: `${environment}-lineage`, serial: 19 },
    currentCapacitySpec: current,
    desiredCapacitySpec: desired,
    executionIntent: 'standalone-adjustment',
    capacityEvidence: null,
    promotionStabilityEvidence: null,
    savedPlanPath: path.join(
      os.tmpdir(),
      'moazez-capacity-tests',
      environment,
      'runtime-capacity-adjustment.tfplan',
    ),
  };
}

function record(address, type, before, after) {
  return {
    address,
    mode: 'managed',
    type,
    provider_name: PROVIDER,
    change: {
      actions: ['update'],
      before,
      after,
      after_unknown: {},
    },
  };
}

function maxOnlyPlan(before = 4, after = 3) {
  return {
    format_version: '1.2',
    terraform_version: '1.14.3',
    applyable: true,
    complete: true,
    errored: false,
    resource_changes: [
      record(
        capacity.RUNTIME_RESOURCE_ADDRESSES.api,
        'google_cloud_run_v2_service',
        { scaling: [{ min_instance_count: 1, max_instance_count: before }] },
        { scaling: [{ min_instance_count: 1, max_instance_count: after }] },
      ),
    ],
    resource_drift: [],
  };
}

function serviceMinMaxPlan(beforeMin, beforeMax, afterMin, afterMax) {
  return {
    format_version: '1.2',
    applyable: true,
    complete: true,
    errored: false,
    resource_changes: [
      record(
        capacity.RUNTIME_RESOURCE_ADDRESSES.api,
        'google_cloud_run_v2_service',
        {
          scaling: [
            {
              min_instance_count: beforeMin,
              max_instance_count: beforeMax,
            },
          ],
        },
        {
          scaling: [
            { min_instance_count: afterMin, max_instance_count: afterMax },
          ],
        },
      ),
    ],
    resource_drift: [],
  };
}

function assertCapacityError(code, callback) {
  assert.throws(
    callback,
    (error) =>
      error instanceof capacity.CapacityControlError && error.code === code,
  );
}

test('capacity schemas and operation identity are independent from Release V6', () => {
  assert.equal(capacity.CAPACITY_SPEC_VERSION, 1);
  assert.equal(capacity.CAPACITY_EXECUTION_SCHEMA_VERSION, 1);
  assert.equal(capacity.CAPACITY_OPERATION_ID, 'runtime-capacity-adjustment');
  assert.equal(release.RELEASE_MANIFEST_VERSION, 6);
  const execution = capacity.buildCapacityExecution(executionInput());
  assert.equal(Object.hasOwn(execution, 'releaseManifestVersion'), false);
  assert.throws(() => release.validateManifest(execution));
  assertCapacityError('CAPACITY_SCHEMA_INVALID', () =>
    capacity.validateCapacityExecution({
      ...execution,
      releaseManifestVersion: 6,
    }),
  );
});

test('environment authority is a closed exact staging/production allowlist', () => {
  assert.deepEqual(capacity.environmentAuthority('staging'), {
    terraformRoot: 'infra/gcp/backend-runtime/environments/nonprod/runtime',
    project: 'moazez-nonprod-91001421934',
    region: 'me-central2',
    apiService: 'moazez-staging-api',
    coreWorker: 'moazez-staging-core-worker',
    mediaWorker: 'moazez-staging-media-worker',
  });
  assert.deepEqual(capacity.environmentAuthority('production'), {
    terraformRoot: 'infra/gcp/backend-runtime/environments/production/runtime',
    project: 'moazez-production',
    region: 'me-central2',
    apiService: 'moazez-production-api',
    coreWorker: 'moazez-production-core-worker',
    mediaWorker: 'moazez-production-media-worker',
  });
  assertCapacityError('CAPACITY_ENVIRONMENT_UNSUPPORTED', () =>
    capacity.environmentAuthority('preview'),
  );
});

test('staging and production permanent baselines remain isolated', () => {
  const staging = capacity.baselineCapacitySpec('staging');
  const production = capacity.baselineCapacitySpec('production');
  assert.deepEqual(
    [staging.api.serviceMinInstances, staging.api.serviceMaxInstances],
    [1, 4],
  );
  assert.deepEqual(
    [production.api.serviceMinInstances, production.api.serviceMaxInstances],
    [1, 10],
  );
  for (const spec of [staging, production]) {
    assert.equal(spec.api.revision.concurrency, 40);
    assert.equal(spec.api.revision.databaseConnectionLimit, 5);
    assert.equal(spec.api.revision.maxInstances, null);
    assert.equal(spec.api.revision.requestTimeoutSeconds, null);
    assert.equal(spec.api.revision.sessionAffinity, null);
    assert.deepEqual(spec.workers, {
      coreManualInstanceCount: 1,
      mediaManualInstanceCount: 1,
    });
  }
  production.api.serviceMaxInstances = 40;
  assert.equal(
    capacity.baselineCapacitySpec('staging').api.serviceMaxInstances,
    4,
  );
});

test('steady DB and separate Redis envelopes match governed examples', () => {
  assert.deepEqual(
    capacity.calculateSteadyStateEnvelopes(
      capacity.baselineCapacitySpec('staging'),
    ),
    { database: 29, queueRedis: 23, realtimeRedis: 13 },
  );
  assert.deepEqual(
    capacity.calculateSteadyStateEnvelopes(
      capacity.baselineCapacitySpec('production'),
    ),
    { database: 59, queueRedis: 35, realtimeRedis: 31 },
  );
  const testCandidate = capacity.baselineCapacitySpec('production');
  testCandidate.api.serviceMaxInstances = 40;
  testCandidate.api.revision.databaseConnectionLimit = 1;
  assert.equal(
    capacity.calculateSteadyStateEnvelopes(testCandidate).database,
    49,
  );
});

test('production baseline 10 is not newly approvable against historical realtime budget 30', () => {
  const current = capacity.baselineCapacitySpec('production');
  current.api.serviceMaxInstances = 9;
  const desired = capacity.baselineCapacitySpec('production');
  assertCapacityError('CAPACITY_DATABASE_EVIDENCE_REQUIRED', () =>
    capacity.evaluateStandaloneCapacityChange({
      currentCapacitySpec: current,
      desiredCapacitySpec: desired,
      capacityEvidence: null,
      environment: 'production',
    }),
  );
  withEvidenceRoot((root) => {
    const evidence = writeEvidence(
      root,
      'capacity-budget.json',
      capacityEvidenceDocument(59, 35, 30, { environment: 'production' }),
    );
    assertCapacityError('CAPACITY_EVIDENCE_INSUFFICIENT', () =>
      capacity.evaluateStandaloneCapacityChange({
        currentCapacitySpec: current,
        desiredCapacitySpec: desired,
        capacityEvidence: evidence,
        environment: 'production',
      }),
    );
  });
});

test('tagged zero-traffic candidate is accounted independently in all envelopes', () => {
  const overlap = capacity.calculateCandidateOverlap({
    servingServiceMaxInstances: 40,
    servingDatabaseConnectionLimit: 1,
    candidateRevisionCapacitySpec: {
      revisionMaxInstances: 10,
      concurrency: 40,
      requestTimeoutSeconds: 300,
      sessionAffinity: false,
      databaseConnectionLimit: 5,
    },
    workers: { coreManualInstanceCount: 1, mediaManualInstanceCount: 1 },
  });
  assert.deepEqual(overlap.database, {
    servingApiEnvelope: 40,
    taggedCandidateEnvelope: 50,
    totalRuntimeOverlap: 99,
  });
  assert.deepEqual(overlap.queueRedis, {
    servingApiEnvelope: 80,
    taggedCandidateEnvelope: 20,
    totalRuntimeOverlap: 115,
  });
  assert.deepEqual(overlap.realtimeRedis, {
    servingApiEnvelope: 120,
    taggedCandidateEnvelope: 30,
    totalRuntimeOverlap: 151,
  });
  assert.equal(overlap.serviceMaximumIsInstantaneousHardBound, false);
});

test('candidate overlap requires complete revision capacity and governed evidence', () => {
  const input = {
    servingServiceMaxInstances: 4,
    servingDatabaseConnectionLimit: 5,
    candidateRevisionCapacitySpec: {
      revisionMaxInstances: 2,
      concurrency: 40,
      requestTimeoutSeconds: 300,
      sessionAffinity: false,
      databaseConnectionLimit: 5,
    },
    workers: { coreManualInstanceCount: 1, mediaManualInstanceCount: 1 },
  };
  const missingMax = clone(input);
  delete missingMax.candidateRevisionCapacitySpec.revisionMaxInstances;
  assertCapacityError('CAPACITY_SCHEMA_INVALID', () =>
    capacity.calculateCandidateOverlap(missingMax),
  );
  const overlap = capacity.calculateCandidateOverlap(input);
  assertCapacityError('CAPACITY_DATABASE_EVIDENCE_REQUIRED', () =>
    capacity.evaluateCandidateOverlapEvidence(overlap, null, 'staging'),
  );
  withEvidenceRoot((root) => {
    const evidence = writeEvidence(
      root,
      'candidate-capacity-budget.json',
      capacityEvidenceDocument(39, 27, 19),
    );
    const result = capacity.evaluateCandidateOverlapEvidence(
      overlap,
      evidence,
      'staging',
    );
    assert.equal(result.database.approvalResult, 'approved');
    assert.equal(
      result.database.safetyReserveAuthority,
      'governed-database-reserve',
    );
    assert.equal(
      result.capacityBudgetEvidenceAuthority.sha256,
      evidence.sha256,
    );
  });
});

test('capacity-aware identity binds artifact plus canonical complete revision capacity', () => {
  const digest = `sha256:${'a'.repeat(64)}`;
  const revision = {
    revisionMaxInstances: 40,
    concurrency: 200,
    requestTimeoutSeconds: 3600,
    sessionAffinity: true,
    databaseConnectionLimit: 1,
  };
  const first = capacity.capacityAwareCandidateIdentity(digest, revision);
  const second = capacity.capacityAwareCandidateIdentity(
    digest,
    clone(revision),
  );
  assert.deepEqual(first, second);
  assert.match(first.candidateTag, /^candidate-[a-f0-9]{12}$/u);
  for (const [field, value] of [
    ['revisionMaxInstances', 39],
    ['concurrency', 199],
    ['requestTimeoutSeconds', 3599],
    ['sessionAffinity', false],
    ['databaseConnectionLimit', 2],
  ]) {
    assert.notEqual(
      capacity.capacityAwareCandidateIdentity(digest, {
        ...revision,
        [field]: value,
      }).candidateTag,
      first.candidateTag,
    );
  }
});

test('candidate identity excludes control source and historical imported identity stays unchanged', () => {
  const identity = capacity.capacityAwareCandidateIdentity(
    release.GOVERNED_APPLICATION_ARTIFACT_DIGEST,
    {
      revisionMaxInstances: 4,
      concurrency: 40,
      requestTimeoutSeconds: 300,
      sessionAffinity: false,
      databaseConnectionLimit: 5,
    },
  );
  assert.equal(identity.canonicalRevisionCapacity.includes(SOURCE_SHA), false);
  assert.deepEqual(release.GOVERNED_IMPORTED_CANDIDATE, {
    imageReference: release.GOVERNED_APPLICATION_ARTIFACT,
    tag: 'candidate-5377bd0c7d84',
    revision: 'moazez-staging-api-candidate-5377bd0c7d84',
  });
});

test('emergency candidate creation preserves live service 5/40', () => {
  assert.deepEqual(
    capacity.candidateServiceCapacity({
      mode: 'candidate_no_traffic',
      liveServiceMinInstances: 5,
      liveServiceMaxInstances: 40,
      governedServiceMinInstances: 1,
      governedServiceMaxInstances: 10,
    }),
    {
      minInstances: 5,
      maxInstances: 40,
      authority: 'fresh-live-service-capacity-preservation',
    },
  );
});

test('post-promotion normalization is service-only and requires stability', () => {
  const input = {
    mode: 'post_promotion_normalization',
    liveServiceMinInstances: 5,
    liveServiceMaxInstances: 40,
    governedServiceMinInstances: 1,
    governedServiceMaxInstances: 10,
  };
  assertCapacityError('PROMOTION_STABILITY_EVIDENCE_REQUIRED', () =>
    capacity.candidateServiceCapacity(input),
  );
  withEvidenceRoot((root) => {
    const promotionStabilityEvidence = writeEvidence(
      root,
      'promotion-stability.json',
      promotionEvidenceDocument(),
    );
    assert.deepEqual(
      capacity.candidateServiceCapacity({
        ...input,
        promotionStabilityEvidence,
      }),
      {
        minInstances: 1,
        maxInstances: 10,
        authority: 'governed-post-promotion-service-normalization',
      },
    );
  });
});

test('nullable provider-defaulted revision values stay unmanaged in Terraform inputs', () => {
  const managed = capacity.baselineCapacitySpec('staging');
  const observed = clone(managed);
  observed.api.revision.maxInstances = 100;
  observed.api.revision.requestTimeoutSeconds = 300;
  observed.api.revision.sessionAffinity = false;
  const variables = capacity.terraformVariablesForCapacitySpec(managed);
  assert.equal(variables.api_revision_max_instances, null);
  assert.equal(variables.api_request_timeout_seconds, null);
  assert.equal(variables.api_session_affinity, null);
  assert.equal(observed.api.revision.maxInstances, 100);
});

test('capacity specification rejects unknowns, invalid integers, and inverted service range', () => {
  const unknown = capacity.baselineCapacitySpec('staging');
  unknown.api.unapproved = 1;
  assertCapacityError('CAPACITY_SCHEMA_INVALID', () =>
    capacity.validateCapacitySpec(unknown),
  );
  const invalid = capacity.baselineCapacitySpec('staging');
  invalid.workers.coreManualInstanceCount = 1.5;
  assertCapacityError('CAPACITY_SCHEMA_INVALID', () =>
    capacity.validateCapacitySpec(invalid),
  );
  const inverted = capacity.baselineCapacitySpec('staging');
  inverted.api.serviceMinInstances = 5;
  assertCapacityError('CAPACITY_RANGE_INVALID', () =>
    capacity.validateCapacitySpec(inverted),
  );
});

test('standalone capacity rejects every revision-owned mutation', () => {
  const fields = [
    ['maxInstances', 2],
    ['concurrency', 80],
    ['requestTimeoutSeconds', 300],
    ['sessionAffinity', true],
    ['databaseConnectionLimit', 6],
  ];
  for (const [field, value] of fields) {
    const input = executionInput();
    input.desiredCapacitySpec.api.revision[field] = value;
    assertCapacityError('STANDALONE_REVISION_MUTATION_FORBIDDEN', () =>
      capacity.buildCapacityExecution(input),
    );
  }
});

test('capacity execution is bound to the exact environment identity', () => {
  const execution = capacity.buildCapacityExecution(
    executionInput('production'),
  );
  execution.environmentAuthority.apiService = 'moazez-staging-api';
  assertCapacityError('CAPACITY_ENVIRONMENT_IDENTITY_MISMATCH', () =>
    capacity.validateCapacityExecution(execution),
  );
});

test('capacity plan accepts exact service max adjustment only', () => {
  const execution = capacity.buildCapacityExecution(executionInput());
  const review = capacity.reviewCapacityPlanJson(maxOnlyPlan(), execution);
  assert.equal(review.nonNoopResourceChangeCount, 1);
  assert.equal(review.intendedSemanticChangeCount, 1);
  assert.equal(review.apiTemplateMutation, false);
  assert.equal(review.trafficMutation, false);
});

test('capacity plan rejects revision, image, traffic, DB, and unknown API paths', () => {
  const execution = capacity.buildCapacityExecution(executionInput());
  for (const pathName of [
    'template',
    'traffic',
    'image',
    'candidate_tag',
    'database_connection_limit',
  ]) {
    const plan = maxOnlyPlan();
    plan.resource_changes[0].change.before[pathName] = 'before';
    plan.resource_changes[0].change.after[pathName] = 'after';
    assertCapacityError('CAPACITY_PLAN_NON_CAPACITY_MUTATION', () =>
      capacity.reviewCapacityPlanJson(plan, execution),
    );
  }
});

test('capacity plan rejects worker images, Maintenance, Edge, IAM, VPC, Redis, secrets, and storage', () => {
  const execution = capacity.buildCapacityExecution(executionInput());
  const forbiddenAddresses = [
    'module.runtime_environment.google_cloud_run_v2_worker_pool.maintenance_scheduler',
    'module.edge_environment.google_compute_url_map.edge',
    'google_project_iam_member.runtime',
    'google_compute_network.runtime',
    'google_redis_instance.queue',
    'google_secret_manager_secret.runtime',
    'google_storage_bucket.runtime',
  ];
  for (const address of forbiddenAddresses) {
    const plan = maxOnlyPlan();
    plan.resource_changes = [
      record(address, 'forbidden_resource', { value: 1 }, { value: 2 }),
    ];
    assertCapacityError('CAPACITY_PLAN_NON_CAPACITY_MUTATION', () =>
      capacity.reviewCapacityPlanJson(plan, execution),
    );
  }
});

test('capacity plan rejects wrong provider identity, unknowns, drift, and unsafe provenance', () => {
  const execution = capacity.buildCapacityExecution(executionInput());
  const wrongIdentity = maxOnlyPlan();
  wrongIdentity.resource_changes[0].provider_name = 'example/unsafe';
  assertCapacityError('CAPACITY_PLAN_RESOURCE_IDENTITY_MISMATCH', () =>
    capacity.reviewCapacityPlanJson(wrongIdentity, execution),
  );
  const unknown = maxOnlyPlan();
  unknown.resource_changes[0].change.after_unknown = { scaling: true };
  assertCapacityError('CAPACITY_PLAN_UNKNOWN_VALUE', () =>
    capacity.reviewCapacityPlanJson(unknown, execution),
  );
  const drift = maxOnlyPlan();
  drift.resource_drift = [drift.resource_changes[0]];
  assertCapacityError('CAPACITY_PLAN_DRIFT_FORBIDDEN', () =>
    capacity.reviewCapacityPlanJson(drift, execution),
  );
  const provenance = maxOnlyPlan();
  provenance.resource_changes[0].previous_address = 'old.api';
  assertCapacityError('CAPACITY_PLAN_NON_CAPACITY_MUTATION', () =>
    capacity.reviewCapacityPlanJson(provenance, execution),
  );
});

test('capacity lifecycle binds plan hash, source, state, approval, one apply, and live verification', () => {
  const planJsonBytes = Buffer.from(JSON.stringify(maxOnlyPlan()));
  let execution = capacity.buildCapacityExecution(executionInput());
  execution = capacity.registerCapacityPlan(execution, {
    savedPlanBytes: PLAN_BYTES,
    planJsonBytes,
    recordedAt: NOW,
  });
  execution = capacity.approveCapacityPlan(execution, {
    approver: 'MOAZEZ_PROJECT_OWNER',
    approvalRef: 'evidence://approval',
    approvedAt: '2026-09-15T02:01:00.000Z',
  });
  assertCapacityError('CAPACITY_PRE_APPLY_GUARD_FAILED', () =>
    capacity.recordCapacityApply(execution, {
      savedPlanBytes: PLAN_BYTES,
      result: 'succeeded',
      evidenceRef: 'evidence://direct-apply',
      recordedAt: '2026-09-15T02:01:30.000Z',
      postApplyState: { lineage: 'staging-lineage', serial: 20 },
    }),
  );
  execution = capacity.recordCapacityPreApplyGuard(execution, {
    sourceSha: SOURCE_SHA,
    terraformState: { lineage: 'staging-lineage', serial: 19 },
    savedPlanBytes: PLAN_BYTES,
    evidenceRef: 'evidence://fresh-pre-apply',
    recordedAt: '2026-09-15T02:01:45.000Z',
  });
  assert.equal(execution.status, 'pre-apply-authorized');
  assert.equal(execution.preApplyAuthority.status, 'passed');
  const wrongExecutionAuthority = clone(execution);
  wrongExecutionAuthority.preApplyAuthority.executionId = 'another-execution';
  assertCapacityError('CAPACITY_PRE_APPLY_AUTHORITY_MISMATCH', () =>
    capacity.recordCapacityApply(wrongExecutionAuthority, {
      savedPlanBytes: PLAN_BYTES,
      result: 'succeeded',
      evidenceRef: 'evidence://wrong-execution-authority',
      recordedAt: '2026-09-15T02:01:49.000Z',
      postApplyState: { lineage: 'staging-lineage', serial: 20 },
    }),
  );
  const failedPreApplyAuthority = clone(execution);
  failedPreApplyAuthority.preApplyAuthority.status = 'failed';
  assertCapacityError('CAPACITY_LIFECYCLE_INVALID', () =>
    capacity.recordCapacityApply(failedPreApplyAuthority, {
      savedPlanBytes: PLAN_BYTES,
      result: 'succeeded',
      evidenceRef: 'evidence://failed-pre-apply-authority',
      recordedAt: '2026-09-15T02:01:49.000Z',
      postApplyState: { lineage: 'staging-lineage', serial: 20 },
    }),
  );
  assertCapacityError('CAPACITY_SAVED_PLAN_CHANGED', () =>
    capacity.recordCapacityApply(execution, {
      savedPlanBytes: Buffer.from('changed-after-pre-apply'),
      result: 'succeeded',
      evidenceRef: 'evidence://wrong-apply-bytes',
      recordedAt: '2026-09-15T02:01:50.000Z',
      postApplyState: { lineage: 'staging-lineage', serial: 20 },
    }),
  );
  execution = capacity.recordCapacityApply(execution, {
    savedPlanBytes: PLAN_BYTES,
    result: 'succeeded',
    evidenceRef: 'evidence://apply',
    recordedAt: '2026-09-15T02:02:00.000Z',
    postApplyState: { lineage: 'staging-lineage', serial: 20 },
  });
  assertCapacityError('CAPACITY_PRE_APPLY_GUARD_FAILED', () =>
    capacity.recordCapacityApply(execution, {
      savedPlanBytes: PLAN_BYTES,
      result: 'succeeded',
      evidenceRef: 'evidence://apply-again',
      recordedAt: '2026-09-15T02:03:00.000Z',
      postApplyState: { lineage: 'staging-lineage', serial: 21 },
    }),
  );
  execution = capacity.recordCapacityVerification(execution, {
    result: 'passed',
    evidenceRef: 'evidence://verification',
    recordedAt: '2026-09-15T02:04:00.000Z',
    observedMutableCapacity: execution.mutableCapacityChange.after,
  });
  assert.equal(execution.status, 'closed');
  assert.equal(execution.consumedSavedPlanHashes.length, 1);
});

test('capacity pre-apply guard rejects stale lineage, serial, source, and plan bytes', () => {
  let execution = capacity.buildCapacityExecution(executionInput());
  execution = capacity.registerCapacityPlan(execution, {
    savedPlanBytes: PLAN_BYTES,
    planJsonBytes: Buffer.from(JSON.stringify(maxOnlyPlan())),
    recordedAt: NOW,
  });
  execution = capacity.approveCapacityPlan(execution, {
    approver: 'owner',
    approvalRef: 'evidence://approval',
    approvedAt: '2026-09-15T02:01:00.000Z',
  });
  for (const terraformState of [
    { lineage: 'other-lineage', serial: 19 },
    { lineage: 'staging-lineage', serial: 20 },
  ]) {
    assertCapacityError('CAPACITY_STATE_PRECONDITION_STALE', () =>
      capacity.recordCapacityPreApplyGuard(execution, {
        sourceSha: SOURCE_SHA,
        terraformState,
        savedPlanBytes: PLAN_BYTES,
        evidenceRef: 'evidence://fresh-pre-apply',
        recordedAt: '2026-09-15T02:01:30.000Z',
      }),
    );
  }
  assertCapacityError('CAPACITY_SOURCE_SHA_MISMATCH', () =>
    capacity.recordCapacityPreApplyGuard(execution, {
      sourceSha: '0'.repeat(40),
      terraformState: execution.terraformStatePrecondition,
      savedPlanBytes: PLAN_BYTES,
      evidenceRef: 'evidence://fresh-pre-apply',
      recordedAt: '2026-09-15T02:01:30.000Z',
    }),
  );
  assertCapacityError('CAPACITY_SAVED_PLAN_CHANGED', () =>
    capacity.recordCapacityPreApplyGuard(execution, {
      sourceSha: SOURCE_SHA,
      terraformState: execution.terraformStatePrecondition,
      savedPlanBytes: Buffer.from('changed'),
      evidenceRef: 'evidence://fresh-pre-apply',
      recordedAt: '2026-09-15T02:01:30.000Z',
    }),
  );
});

test('capacity plan registration rejects blocked and already-registered replay', () => {
  const hash = crypto.createHash('sha256').update(PLAN_BYTES).digest('hex');
  const blocked = capacity.buildCapacityExecution(executionInput());
  blocked.blockedSavedPlanHashes.push(hash);
  assertCapacityError('CAPACITY_PLAN_REPLAY', () =>
    capacity.registerCapacityPlan(blocked, {
      savedPlanBytes: PLAN_BYTES,
      planJsonBytes: Buffer.from(JSON.stringify(maxOnlyPlan())),
      recordedAt: NOW,
    }),
  );
  let registered = capacity.buildCapacityExecution(executionInput());
  registered = capacity.registerCapacityPlan(registered, {
    savedPlanBytes: PLAN_BYTES,
    planJsonBytes: Buffer.from(JSON.stringify(maxOnlyPlan())),
    recordedAt: NOW,
  });
  assertCapacityError('CAPACITY_PLAN_REPLAY', () =>
    capacity.registerCapacityPlan(registered, {
      savedPlanBytes: PLAN_BYTES,
      planJsonBytes: Buffer.from(JSON.stringify(maxOnlyPlan())),
      recordedAt: NOW,
    }),
  );
});

test('capacity budget evidence is external, hash-bound, exact, complete, and reverified pre-Apply', () => {
  withEvidenceRoot((root) => {
    const decreaseWithFreeformClaim = executionInput();
    decreaseWithFreeformClaim.capacityEvidence = {
      authorityRef: 'caller-made',
      effectiveApprovalBudget: 1000,
    };
    assertCapacityError('CAPACITY_EVIDENCE_UNEXPECTED', () =>
      capacity.buildCapacityExecution(decreaseWithFreeformClaim),
    );

    const input = executionInput();
    input.currentCapacitySpec.api.serviceMaxInstances = 2;
    input.desiredCapacitySpec.api.serviceMaxInstances = 3;

    input.capacityEvidence = {
      database: {
        authorityRef: 'caller-made',
        safetyReserveAuthority: 'caller-made',
        effectiveApprovalBudget: 1000,
      },
      queueRedis: {},
      realtimeRedis: {},
    };
    assertCapacityError('CAPACITY_SCHEMA_INVALID', () =>
      capacity.buildCapacityExecution(input),
    );

    input.capacityEvidence = {
      path: path.join(root, 'missing.json'),
      sha256: 'a'.repeat(64),
    };
    assertCapacityError('CAPACITY_EVIDENCE_FILE_MISSING', () =>
      capacity.buildCapacityExecution(input),
    );

    const hashMismatch = writeEvidence(
      root,
      'hash-mismatch.json',
      capacityEvidenceDocument(1000, 1000, 1000),
    );
    hashMismatch.sha256 = 'b'.repeat(64);
    input.capacityEvidence = hashMismatch;
    assertCapacityError('CAPACITY_EVIDENCE_HASH_MISMATCH', () =>
      capacity.buildCapacityExecution(input),
    );

    const tampered = writeEvidence(
      root,
      'tampered.json',
      capacityEvidenceDocument(1000, 1000, 1000),
    );
    fs.appendFileSync(tampered.path, ' ');
    input.capacityEvidence = tampered;
    assertCapacityError('CAPACITY_EVIDENCE_HASH_MISMATCH', () =>
      capacity.buildCapacityExecution(input),
    );

    input.capacityEvidence = writeEvidence(
      root,
      'wrong-environment.json',
      capacityEvidenceDocument(1000, 1000, 1000, {
        environment: 'production',
      }),
    );
    assertCapacityError('CAPACITY_EVIDENCE_ENVIRONMENT_MISMATCH', () =>
      capacity.buildCapacityExecution(input),
    );

    input.capacityEvidence = writeEvidence(
      root,
      'unapproved.json',
      capacityEvidenceDocument(1000, 1000, 1000, { status: 'pending' }),
    );
    assertCapacityError('CAPACITY_EVIDENCE_NOT_APPROVED', () =>
      capacity.buildCapacityExecution(input),
    );

    for (const domain of ['database', 'queueRedis', 'realtimeRedis']) {
      const incomplete = capacityEvidenceDocument(1000, 1000, 1000);
      delete incomplete[domain];
      input.capacityEvidence = writeEvidence(
        root,
        `missing-${domain}.json`,
        incomplete,
      );
      assertCapacityError('CAPACITY_SCHEMA_INVALID', () =>
        capacity.buildCapacityExecution(input),
      );
    }

    input.capacityEvidence = writeEvidence(
      root,
      'insufficient.json',
      capacityEvidenceDocument(1, 1000, 1000),
    );
    assertCapacityError('CAPACITY_EVIDENCE_INSUFFICIENT', () =>
      capacity.buildCapacityExecution(input),
    );

    const exactEvidence = writeEvidence(
      root,
      'exact.json',
      capacityEvidenceDocument(1000, 1000, 1000),
    );
    input.capacityEvidence = exactEvidence;
    let execution = capacity.buildCapacityExecution(input);
    assert.equal(
      execution.capacityEvaluation.capacityBudgetEvidenceAuthority.sha256,
      exactEvidence.sha256,
    );
    assert.equal(
      execution.capacityEvaluation.capacityBudgetEvidenceAuthority.environment,
      'staging',
    );
    execution = capacity.registerCapacityPlan(execution, {
      savedPlanBytes: PLAN_BYTES,
      planJsonBytes: Buffer.from(JSON.stringify(maxOnlyPlan(2, 3))),
      recordedAt: NOW,
    });
    execution = capacity.approveCapacityPlan(execution, {
      approver: 'owner',
      approvalRef: 'evidence://approval',
      approvedAt: '2026-09-15T02:01:00.000Z',
    });
    fs.appendFileSync(exactEvidence.path, 'tampered-after-approval');
    assertCapacityError('CAPACITY_EVIDENCE_HASH_MISMATCH', () =>
      capacity.recordCapacityPreApplyGuard(execution, {
        sourceSha: SOURCE_SHA,
        terraformState: input.terraformState,
        savedPlanBytes: PLAN_BYTES,
        evidenceRef: 'evidence://pre-apply',
        recordedAt: '2026-09-15T02:02:00.000Z',
      }),
    );
  });
});

test('production API service decreases require hash-bound post-promotion stability authority', () => {
  withEvidenceRoot((root) => {
    const input = executionInput('production');
    input.currentCapacitySpec = capacity.baselineCapacitySpec('production');
    input.currentCapacitySpec.api.serviceMinInstances = 5;
    input.currentCapacitySpec.api.serviceMaxInstances = 40;
    input.desiredCapacitySpec = capacity.baselineCapacitySpec('production');

    assertCapacityError(
      'PRODUCTION_SERVICE_DECREASE_REQUIRES_NORMALIZATION',
      () => capacity.buildCapacityExecution(input),
    );

    input.executionIntent = 'post-promotion-normalization';
    assertCapacityError('PROMOTION_STABILITY_EVIDENCE_REQUIRED', () =>
      capacity.buildCapacityExecution(input),
    );

    input.promotionStabilityEvidence = {
      path: path.join(root, 'missing-promotion.json'),
      sha256: 'a'.repeat(64),
    };
    assertCapacityError('PROMOTION_STABILITY_EVIDENCE_FILE_MISSING', () =>
      capacity.buildCapacityExecution(input),
    );

    const tampered = writeEvidence(
      root,
      'tampered-promotion.json',
      promotionEvidenceDocument(),
    );
    fs.appendFileSync(tampered.path, ' ');
    input.promotionStabilityEvidence = tampered;
    assertCapacityError('PROMOTION_STABILITY_EVIDENCE_HASH_MISMATCH', () =>
      capacity.buildCapacityExecution(input),
    );

    input.promotionStabilityEvidence = writeEvidence(
      root,
      'wrong-promotion-environment.json',
      promotionEvidenceDocument({ environment: 'staging' }),
    );
    assertCapacityError(
      'PROMOTION_STABILITY_EVIDENCE_ENVIRONMENT_MISMATCH',
      () => capacity.buildCapacityExecution(input),
    );

    input.promotionStabilityEvidence = writeEvidence(
      root,
      'unapproved-promotion.json',
      promotionEvidenceDocument({ status: 'pending' }),
    );
    assertCapacityError('PROMOTION_STABILITY_EVIDENCE_NOT_APPROVED', () =>
      capacity.buildCapacityExecution(input),
    );

    input.promotionStabilityEvidence = writeEvidence(
      root,
      'incomplete-promotion.json',
      promotionEvidenceDocument({ trafficPromotionStatus: 'pending' }),
    );
    assertCapacityError('PROMOTION_STABILITY_EVIDENCE_INCOMPLETE', () =>
      capacity.buildCapacityExecution(input),
    );

    input.promotionStabilityEvidence = writeEvidence(
      root,
      'emergency-traffic-retained.json',
      promotionEvidenceDocument({
        formerEmergencyRevisionTrafficStatus: 'retained',
      }),
    );
    assertCapacityError('PROMOTION_STABILITY_EVIDENCE_INCOMPLETE', () =>
      capacity.buildCapacityExecution(input),
    );

    for (const status of ['pending', 'failed']) {
      input.promotionStabilityEvidence = writeEvidence(
        root,
        `${status}-stability.json`,
        promotionEvidenceDocument({ stabilityValidationStatus: status }),
      );
      assertCapacityError('PROMOTION_STABILITY_EVIDENCE_NOT_STABLE', () =>
        capacity.buildCapacityExecution(input),
      );
    }

    input.promotionStabilityEvidence = writeEvidence(
      root,
      'wrong-serving-revision.json',
      promotionEvidenceDocument({
        currentServingRevision: 'moazez-production-api-other',
      }),
    );
    assertCapacityError('PROMOTION_STABILITY_EVIDENCE_INCOMPLETE', () =>
      capacity.buildCapacityExecution(input),
    );

    const exactEvidence = writeEvidence(
      root,
      'exact-promotion.json',
      promotionEvidenceDocument(),
    );
    input.promotionStabilityEvidence = exactEvidence;
    let execution = capacity.buildCapacityExecution(input);
    assert.equal(execution.executionIntent, 'post-promotion-normalization');
    assert.equal(
      execution.promotionStabilityEvidenceAuthority.sha256,
      exactEvidence.sha256,
    );
    assert.deepEqual(execution.mutableCapacityChange.after.api, {
      serviceMinInstances: 1,
      serviceMaxInstances: 10,
    });
    const normalizationReview = capacity.reviewCapacityPlanJson(
      serviceMinMaxPlan(5, 40, 1, 10),
      execution,
    );
    assert.equal(normalizationReview.status, 'passed');

    execution = capacity.registerCapacityPlan(execution, {
      savedPlanBytes: PLAN_BYTES,
      planJsonBytes: Buffer.from(
        JSON.stringify(serviceMinMaxPlan(5, 40, 1, 10)),
      ),
      recordedAt: NOW,
    });
    execution = capacity.approveCapacityPlan(execution, {
      approver: 'owner',
      approvalRef: 'evidence://normalization-approval',
      approvedAt: '2026-09-15T02:01:00.000Z',
    });
    fs.appendFileSync(exactEvidence.path, 'tampered-after-approval');
    assertCapacityError('PROMOTION_STABILITY_EVIDENCE_HASH_MISMATCH', () =>
      capacity.recordCapacityPreApplyGuard(execution, {
        sourceSha: SOURCE_SHA,
        terraformState: input.terraformState,
        savedPlanBytes: PLAN_BYTES,
        evidenceRef: 'evidence://normalization-pre-apply',
        recordedAt: '2026-09-15T02:02:00.000Z',
      }),
    );

    const revisionMutation = clone(input);
    revisionMutation.promotionStabilityEvidence = writeEvidence(
      root,
      'revision-mutation-evidence.json',
      promotionEvidenceDocument(),
    );
    revisionMutation.desiredCapacitySpec.api.revision.concurrency = 80;
    assertCapacityError('STANDALONE_REVISION_MUTATION_FORBIDDEN', () =>
      capacity.buildCapacityExecution(revisionMutation),
    );

    assert.equal(
      capacity.buildCapacityExecution(executionInput()).status,
      'constructed',
    );
    assert.equal(
      capacity.buildCapacityExecution(executionInput('production')).status,
      'constructed',
    );
  });
});

test('capacity execution rejects no-op adjustments and stale lifecycle evidence', () => {
  const noChange = executionInput();
  noChange.desiredCapacitySpec = clone(noChange.currentCapacitySpec);
  assertCapacityError('CAPACITY_NO_CHANGE', () =>
    capacity.buildCapacityExecution(noChange),
  );
  const execution = capacity.buildCapacityExecution(executionInput());
  execution.approval.approver = 'invented-before-approval';
  assertCapacityError('CAPACITY_LIFECYCLE_INVALID', () =>
    capacity.validateCapacityExecution(execution),
  );
});

test('capacity execution rejects tampered envelopes, budgets, and Saved Plan paths', () => {
  const tamperedEnvelope = capacity.buildCapacityExecution(executionInput());
  tamperedEnvelope.capacityEvaluation.desiredEnvelope.database += 1;
  assertCapacityError('CAPACITY_EVALUATION_MISMATCH', () =>
    capacity.validateCapacityExecution(tamperedEnvelope),
  );

  const increaseInput = executionInput();
  increaseInput.currentCapacitySpec.api.serviceMaxInstances = 2;
  increaseInput.desiredCapacitySpec.api.serviceMaxInstances = 3;
  withEvidenceRoot((root) => {
    increaseInput.capacityEvidence = writeEvidence(
      root,
      'capacity-budget.json',
      capacityEvidenceDocument(24, 21, 10),
    );
    const tamperedBudget = capacity.buildCapacityExecution(increaseInput);
    tamperedBudget.capacityEvaluation.realtimeRedis.effectiveApprovalBudget = 9;
    assertCapacityError('CAPACITY_EVALUATION_MISMATCH', () =>
      capacity.validateCapacityExecution(tamperedBudget),
    );
  });

  const tamperedPath = capacity.buildCapacityExecution(executionInput());
  tamperedPath.savedPlanPath = path.join(
    process.cwd(),
    'runtime-capacity-adjustment.tfplan',
  );
  assertCapacityError('CAPACITY_ARTIFACT_PATH_INVALID', () =>
    capacity.validateCapacityExecution(tamperedPath),
  );
});
