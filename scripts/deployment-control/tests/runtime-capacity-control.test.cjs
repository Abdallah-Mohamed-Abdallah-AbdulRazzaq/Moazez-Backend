'use strict';

const assert = require('node:assert/strict');
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

function capacityEvidence(database, queueRedis, realtimeRedis) {
  const record = (name, budget) => ({
    authorityRef: `evidence://${name}`,
    safetyReserveAuthority: `governed-${name}-reserve`,
    effectiveApprovalBudget: budget,
  });
  return {
    database: record('database', database),
    queueRedis: record('queue-redis', queueRedis),
    realtimeRedis: record('realtime-redis', realtimeRedis),
  };
}

function executionInput(environment = 'staging') {
  const current = capacity.baselineCapacitySpec(environment);
  const desired = clone(current);
  desired.api.serviceMaxInstances -= 1;
  return {
    executionId: `capacity-${environment}-test`,
    repository: release.REPOSITORY,
    sourceSha: SOURCE_SHA,
    environment,
    discoveredAt: NOW,
    terraformState: { lineage: `${environment}-lineage`, serial: 19 },
    currentCapacitySpec: current,
    desiredCapacitySpec: desired,
    capacityEvidence: null,
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
    }),
  );
  assertCapacityError('CAPACITY_EVIDENCE_INSUFFICIENT', () =>
    capacity.evaluateStandaloneCapacityChange({
      currentCapacitySpec: current,
      desiredCapacitySpec: desired,
      capacityEvidence: capacityEvidence(59, 35, 30),
    }),
  );
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
    capacity.evaluateCandidateOverlapEvidence(overlap, null),
  );
  const result = capacity.evaluateCandidateOverlapEvidence(
    overlap,
    capacityEvidence(39, 27, 19),
  );
  assert.equal(result.database.approvalResult, 'approved');
  assert.equal(
    result.database.safetyReserveAuthority,
    'governed-database-reserve',
  );
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
  assertCapacityError('NORMALIZATION_PREREQUISITE_MISSING', () =>
    capacity.candidateServiceCapacity(input),
  );
  assert.deepEqual(
    capacity.candidateServiceCapacity({ ...input, promotionStable: true }),
    {
      minInstances: 1,
      maxInstances: 10,
      authority: 'governed-post-promotion-service-normalization',
    },
  );
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
  assert.equal(
    capacity.capacityPreApplyGuard(execution, {
      sourceSha: SOURCE_SHA,
      terraformState: { lineage: 'staging-lineage', serial: 19 },
      savedPlanBytes: PLAN_BYTES,
    }).status,
    'passed',
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
      capacity.capacityPreApplyGuard(execution, {
        sourceSha: SOURCE_SHA,
        terraformState,
        savedPlanBytes: PLAN_BYTES,
      }),
    );
  }
  assertCapacityError('CAPACITY_SOURCE_SHA_MISMATCH', () =>
    capacity.capacityPreApplyGuard(execution, {
      sourceSha: '0'.repeat(40),
      terraformState: execution.terraformStatePrecondition,
      savedPlanBytes: PLAN_BYTES,
    }),
  );
  assertCapacityError('CAPACITY_SAVED_PLAN_CHANGED', () =>
    capacity.capacityPreApplyGuard(execution, {
      sourceSha: SOURCE_SHA,
      terraformState: execution.terraformStatePrecondition,
      savedPlanBytes: Buffer.from('changed'),
    }),
  );
});

test('capacity plan registration rejects blocked and already-registered replay', () => {
  const crypto = require('node:crypto');
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
  increaseInput.capacityEvidence = capacityEvidence(24, 21, 10);
  const tamperedBudget = capacity.buildCapacityExecution(increaseInput);
  tamperedBudget.capacityEvaluation.realtimeRedis.effectiveApprovalBudget = 9;
  assertCapacityError('CAPACITY_EVALUATION_MISMATCH', () =>
    capacity.validateCapacityExecution(tamperedBudget),
  );

  const tamperedPath = capacity.buildCapacityExecution(executionInput());
  tamperedPath.savedPlanPath = path.join(
    process.cwd(),
    'runtime-capacity-adjustment.tfplan',
  );
  assertCapacityError('CAPACITY_ARTIFACT_PATH_INVALID', () =>
    capacity.validateCapacityExecution(tamperedPath),
  );
});
