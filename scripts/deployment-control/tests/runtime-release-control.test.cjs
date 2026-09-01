'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const control = require('../runtime-release-control.cjs');

const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..', '..');
const CANDIDATE_IMAGE =
  'me-central2-docker.pkg.dev/moazez-nonprod-91001421934/moazez-staging-containers/moazez-backend@sha256:1a6b5f41a4dfbb4921a11fe60ccb7d46d89397353dad9aebfcb0df71017986c6';
const LINEAGE = '123e4567-e89b-42d3-a456-426614174000';
const EDGE_LINEAGE = '223e4567-e89b-42d3-a456-426614174000';
const LIVE_RUNTIME_LINEAGE = '32365b63-3fda-f044-1b7f-e8d686105bac';
const LIVE_EDGE_LINEAGE = '545dd53b-773c-667a-aa75-fb3d1f65db23';
const OPAQUE_LINEAGE = 'terraform-lineage-opaque-identity-01';
const RECORDED_AT = '2026-08-31T18:00:00Z';

function stagingImage(hexCharacter) {
  return `me-central2-docker.pkg.dev/moazez-nonprod-91001421934/moazez-staging-containers/moazez-backend@sha256:${hexCharacter.repeat(64)}`;
}

function makeContext(temporaryRoot) {
  const contract = control.loadReleaseContract();
  return {
    executionId: 'day2-staging-test-001',
    repository: control.REPOSITORY,
    sourceSha: control.currentSourceSha(),
    environment: 'staging',
    candidateImageReference: CANDIDATE_IMAGE,
    candidateTag: control.expectedCandidateTag(CANDIDATE_IMAGE),
    externalTfDataRoot: path.join(temporaryRoot, 'tfdata'),
    externalSavedPlanRoot: path.join(temporaryRoot, 'plans'),
    completedPredecessorStages: contract.predecessorStages.map((stage) => ({
      id: stage.id,
      status: 'passed',
      evidenceRef: `evidence:${stage.id}`,
    })),
    liveDiscovery: {
      evidenceRef: 'evidence:live-discovery',
      discoveredAt: RECORDED_AT,
      apiTrafficMode: 'normal',
      stableApiRevision: 'moazez-staging-api-stable01',
      runtimeImages: {
        api: stagingImage('2'),
        coreWorker: stagingImage('3'),
        mediaWorker: stagingImage('4'),
        maintenanceScheduler: stagingImage('5'),
      },
      runtimeState: { lineage: LINEAGE, serial: 10 },
      edgeState: { lineage: EDGE_LINEAGE, serial: 20 },
    },
  };
}

function hashText(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function makeRecoveryContext(
  temporaryRoot,
  { recoveryAttempt = 1, failedPlanSha256 = 'd'.repeat(64) } = {},
) {
  const baseTag = control.expectedCandidateTag(CANDIDATE_IMAGE);
  const ordinals = Array.from(
    { length: recoveryAttempt },
    (_, ordinal) => ordinal,
  );
  const tagForOrdinal = (ordinal) =>
    ordinal === 0
      ? baseTag
      : control.expectedCandidateTag(CANDIDATE_IMAGE, ordinal);
  const failedTag = tagForOrdinal(ordinals.at(-1));
  return {
    executionMode: 'recovery',
    executionId: `day2-staging-recovery-${recoveryAttempt}`,
    repository: control.REPOSITORY,
    sourceSha: control.currentSourceSha(),
    environment: 'staging',
    candidateImageReference: CANDIDATE_IMAGE,
    recovery: {
      recoveryAttempt,
      failedReleaseExecutionId: 'day2-staging-failed-001',
      failedManifestRef: 'evidence:failed-manifest',
      failedGateId: control.RECOVERY_RESUME_GATE_ID,
      failedOperationId: 'api-candidate-runtime',
      failedPlanSha256,
      failureEvidenceRef: 'evidence:failed-api-runtime',
    },
    resumeGateId: control.RECOVERY_RESUME_GATE_ID,
    completedPredecessorStages: control.RECOVERY_PREDECESSOR_STAGE_IDS.map(
      (id) => ({ id, status: 'passed', evidenceRef: `evidence:${id}` }),
    ),
    liveDiscovery: {
      evidenceRef: 'evidence:recovery-live-discovery',
      discoveredAt: RECORDED_AT,
      apiTrafficMode: 'failed_zero_traffic_candidate',
      stableApiRevision: 'moazez-staging-api-stable01',
      stableApiTrafficPercent: 100,
      failedCandidate: {
        imageReference: CANDIDATE_IMAGE,
        tag: failedTag,
        revision: `moazez-staging-api-${failedTag}`,
        trafficPercent: 0,
      },
      runtimeImages: {
        api: CANDIDATE_IMAGE,
        coreWorker: CANDIDATE_IMAGE,
        mediaWorker: CANDIDATE_IMAGE,
        maintenanceScheduler: stagingImage('5'),
      },
      runtimeState: { lineage: LIVE_RUNTIME_LINEAGE, serial: 31 },
      edgeState: { lineage: LIVE_EDGE_LINEAGE, serial: 47 },
      candidateEdgeResources: {
        candidateNegPresent: false,
        candidateBackendPresent: false,
        candidateSmokeRoutePresent: false,
      },
      candidateRevisionInventory: {
        evidenceRef: 'evidence:complete-revision-inventory',
        service: 'moazez-staging-api',
        baseTag,
        completeness: 'complete-base-family',
        revisions: ordinals.map((ordinal) => {
          const tag = tagForOrdinal(ordinal);
          return {
            revision: `moazez-staging-api-${tag}`,
            imageReference: CANDIDATE_IMAGE,
          };
        }),
      },
    },
    externalTfDataRoot: path.join(temporaryRoot, 'tfdata'),
    externalSavedPlanRoot: path.join(temporaryRoot, 'plans'),
  };
}

function withTemporaryRoot(callback) {
  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'moazez-day2-release-control-'),
  );
  try {
    return callback(temporaryRoot);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function operation(manifest, gateId, operationId) {
  return manifest.gates
    .find((gate) => gate.id === gateId)
    .operations.find((candidate) => candidate.id === operationId);
}

function registerAndApprove(manifest, gateId, operationId, uniquePlanText) {
  const target = operation(manifest, gateId, operationId);
  fs.mkdirSync(path.dirname(target.savedPlanPath), { recursive: true });
  fs.writeFileSync(target.savedPlanPath, uniquePlanText);
  control.registerPlan(manifest, {
    gateId,
    operationId,
    planPath: target.savedPlanPath,
    sourceSha: manifest.sourceSha,
    environment: manifest.environment,
    terraformRoot: target.terraformRoot,
    lineage: target.statePrecondition.lineage,
    serial: target.statePrecondition.serial,
    recordedAt: RECORDED_AT,
  });
  control.approvePlan(manifest, {
    gateId,
    operationId,
    approver: 'test-release-owner',
    approvalRef: `approval:${operationId}`,
    recordedAt: RECORDED_AT,
  });
  return target;
}

function applyAndVerifyTerraform(
  manifest,
  gateId,
  operationId,
  uniquePlanText,
  observations,
) {
  const target = registerAndApprove(
    manifest,
    gateId,
    operationId,
    uniquePlanText,
  );
  control.recordApply(manifest, {
    gateId,
    operationId,
    result: 'succeeded',
    evidenceRef: `apply:${operationId}`,
    postLineage: target.statePrecondition.lineage,
    postSerial: target.statePrecondition.serial + 1,
    recordedAt: RECORDED_AT,
  });
  control.recordVerification(manifest, {
    gateId,
    operationId,
    result: 'passed',
    evidenceRef: `verify:${operationId}`,
    recordedAt: RECORDED_AT,
    ...observations,
  });
}

function passThroughProtectedSmoke(manifest) {
  control.recordVerification(manifest, {
    gateId: 'protected-readiness-and-smoke',
    operationId: 'protected-candidate-smoke',
    result: 'passed',
    evidenceRef: 'verify:protected-candidate-smoke',
    recordedAt: RECORDED_AT,
    observedImage: manifest.candidate.imageReference,
    observedRevision: manifest.candidate.revision,
    observedCandidateTag: manifest.candidate.tag,
    observedPublicPath: control.SMOKE_PUBLIC_PATH,
    observedBackendPath: control.SMOKE_BACKEND_PATH,
    httpStatus: 200,
  });
}

function passThroughMaintenance(manifest) {
  applyAndVerifyTerraform(
    manifest,
    'maintenance-scheduler-promotion',
    'maintenance-scheduler-runtime',
    'plan-maintenance',
    { observedImage: manifest.candidate.imageReference },
  );
}

function passThroughApiCandidate(manifest) {
  applyAndVerifyTerraform(
    manifest,
    'api-no-traffic-promotion',
    'api-candidate-runtime',
    'plan-api-runtime',
    {
      observedImage: manifest.candidate.imageReference,
      observedRevision: manifest.candidate.revision,
      observedCandidateTag: manifest.candidate.tag,
      observedStablePercent: 100,
      observedCandidatePercent: 0,
    },
  );
  applyAndVerifyTerraform(
    manifest,
    'api-no-traffic-promotion',
    'api-candidate-edge',
    'plan-api-edge',
    {
      observedCandidateTag: manifest.candidate.tag,
      observedPublicPath: control.SMOKE_PUBLIC_PATH,
      observedBackendPath: control.SMOKE_BACKEND_PATH,
    },
  );
}

function passThroughWorkers(manifest) {
  applyAndVerifyTerraform(
    manifest,
    'core-worker-promotion',
    'core-worker-runtime',
    'plan-core',
    { observedImage: manifest.candidate.imageReference },
  );
  applyAndVerifyTerraform(
    manifest,
    'media-worker-promotion',
    'media-worker-runtime',
    'plan-media',
    { observedImage: manifest.candidate.imageReference },
  );
}

test('remaining gate order is read from the unchanged authoritative contract', () => {
  withTemporaryRoot((temporaryRoot) => {
    const contract = control.loadReleaseContract();
    const manifest = control.buildManifest(makeContext(temporaryRoot));
    assert.deepEqual(
      manifest.gates.map((gate) => gate.id),
      contract.remainingStages.map((stage) => stage.id),
    );
    assert.equal(
      manifest.authoritativeContract.failurePolicy,
      'stop-after-first-failure',
    );
    assert.equal(manifest.authoritativeContract.automaticRetryAllowed, false);
  });
});

test('normal manifest v1 identity, predecessor window, gates, and blocker remain backward compatible', () => {
  withTemporaryRoot((temporaryRoot) => {
    const contract = control.loadReleaseContract();
    const manifest = control.buildManifest(makeContext(temporaryRoot));
    assert.equal(manifest.manifestVersion, 1);
    assert.equal(Object.hasOwn(manifest, 'executionMode'), false);
    assert.equal(
      manifest.candidate.tag,
      control.expectedCandidateTag(CANDIDATE_IMAGE),
    );
    assert.equal(
      manifest.candidate.revision,
      `moazez-staging-api-${control.expectedCandidateTag(CANDIDATE_IMAGE)}`,
    );
    assert.deepEqual(
      manifest.predecessorEvidence.map((stage) => stage.id),
      contract.predecessorStages.map((stage) => stage.id),
    );
    assert.deepEqual(
      manifest.gates.map((gate) => gate.id),
      contract.remainingStages.map((stage) => stage.id),
    );
    assert.deepEqual(manifest.blockedSavedPlanHashes, [
      control.BLOCKED_SAVED_PLAN_SHA256,
    ]);
  });
});

test('recovery manifest v2 derives deterministic attempts and contains only the API-first window', () => {
  withTemporaryRoot((temporaryRoot) => {
    for (const recoveryAttempt of [1, 2]) {
      const context = makeRecoveryContext(temporaryRoot, {
        recoveryAttempt,
      });
      const first = control.buildManifest(context);
      const second = control.buildManifest(structuredClone(context));
      const expectedTag = control.expectedCandidateTag(
        CANDIDATE_IMAGE,
        recoveryAttempt,
      );
      assert.equal(first.manifestVersion, 2);
      assert.equal(first.executionMode, 'recovery');
      assert.equal(first.resumeGateId, control.RECOVERY_RESUME_GATE_ID);
      assert.equal(first.candidate.tag, expectedTag);
      assert.equal(
        first.candidate.revision,
        `moazez-staging-api-${expectedTag}`,
      );
      assert.deepEqual(first.candidate, second.candidate);
      assert.equal(first.predecessorEvidence.length, 6);
      assert.deepEqual(
        first.predecessorEvidence.map((stage) => stage.id),
        control.RECOVERY_PREDECESSOR_STAGE_IDS,
      );
      assert.deepEqual(
        first.gates.map((gate) => gate.id),
        control.RECOVERY_GATE_IDS,
      );
      assert.equal(first.gates.length, 4);
      const serializedOperations = first.gates.flatMap((gate) =>
        gate.operations.map((candidate) => candidate.id),
      );
      assert.equal(serializedOperations.includes('core-worker-runtime'), false);
      assert.equal(
        serializedOperations.includes('media-worker-runtime'),
        false,
      );
      assert.notEqual(
        first.releaseExecutionId,
        first.recovery.failedReleaseExecutionId,
      );
      assert.equal(
        first.liveDiscovery.candidateRevisionInventory.revisions.every(
          (entry) => !Object.hasOwn(entry, 'tag'),
        ),
        true,
      );
    }
  });
});

test('recovery attempt accepts only safe integers in the canonical governed range', () => {
  withTemporaryRoot((temporaryRoot) => {
    for (const invalidAttempt of [
      0,
      -1,
      1.5,
      '1',
      Number.NaN,
      Number.POSITIVE_INFINITY,
      control.MAX_RECOVERY_ATTEMPT + 1,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      const context = makeRecoveryContext(temporaryRoot);
      context.recovery.recoveryAttempt = invalidAttempt;
      assert.throws(() => control.buildManifest(context), {
        code: 'RECOVERY_ATTEMPT_INVALID',
      });
    }
    assert.equal(
      control.expectedCandidateTag(
        CANDIDATE_IMAGE,
        control.MAX_RECOVERY_ATTEMPT,
      ),
      `${control.expectedCandidateTag(CANDIDATE_IMAGE)}-r999999999999999`,
    );
  });
});

test('recovery construction rejects implicit mode, operator candidate tags, reused execution IDs, and alternate resume gates', () => {
  withTemporaryRoot((temporaryRoot) => {
    const implicit = makeRecoveryContext(temporaryRoot);
    delete implicit.executionMode;
    assert.throws(() => control.buildManifest(implicit));

    const suppliedTag = makeRecoveryContext(temporaryRoot);
    suppliedTag.candidateTag = control.expectedCandidateTag(CANDIDATE_IMAGE, 1);
    assert.throws(() => control.buildManifest(suppliedTag), {
      code: 'MANIFEST_SCHEMA_MISMATCH',
    });

    const reusedExecution = makeRecoveryContext(temporaryRoot);
    reusedExecution.executionId =
      reusedExecution.recovery.failedReleaseExecutionId;
    assert.throws(() => control.buildManifest(reusedExecution), {
      code: 'RECOVERY_EXECUTION_ID_REUSE',
    });

    const alternateGate = makeRecoveryContext(temporaryRoot);
    alternateGate.resumeGateId = 'maintenance-scheduler-promotion';
    assert.throws(() => control.buildManifest(alternateGate), {
      code: 'RECOVERY_BOUNDARY_UNSUPPORTED',
    });

    const extraRuntimeStateField = makeRecoveryContext(temporaryRoot);
    extraRuntimeStateField.liveDiscovery.runtimeState.unexpected = true;
    assert.throws(() => control.buildManifest(extraRuntimeStateField), {
      code: 'MANIFEST_SCHEMA_MISMATCH',
    });

    const extraEdgeStateField = makeRecoveryContext(temporaryRoot);
    extraEdgeStateField.liveDiscovery.edgeState.unexpected = true;
    assert.throws(() => control.buildManifest(extraEdgeStateField), {
      code: 'MANIFEST_SCHEMA_MISMATCH',
    });

    const unsupportedManifest = control.buildManifest(
      makeRecoveryContext(temporaryRoot),
    );
    unsupportedManifest.manifestVersion = 3;
    assert.throws(() => control.validateManifest(unsupportedManifest), {
      code: 'MANIFEST_UNSUPPORTED',
    });
  });
});

test('recovery requires six exact ordered passed predecessor evidence records', () => {
  withTemporaryRoot((temporaryRoot) => {
    const missing = makeRecoveryContext(temporaryRoot);
    missing.completedPredecessorStages.pop();
    assert.throws(() => control.buildManifest(missing), {
      code: 'PREDECESSOR_EVIDENCE_REQUIRED',
    });

    const reordered = makeRecoveryContext(temporaryRoot);
    [
      reordered.completedPredecessorStages[4],
      reordered.completedPredecessorStages[5],
    ] = [
      reordered.completedPredecessorStages[5],
      reordered.completedPredecessorStages[4],
    ];
    assert.throws(() => control.buildManifest(reordered), {
      code: 'PREDECESSOR_EVIDENCE_REQUIRED',
    });

    const duplicate = makeRecoveryContext(temporaryRoot);
    duplicate.completedPredecessorStages[5] = structuredClone(
      duplicate.completedPredecessorStages[4],
    );
    assert.throws(() => control.buildManifest(duplicate), {
      code: 'PREDECESSOR_EVIDENCE_REQUIRED',
    });

    const failed = makeRecoveryContext(temporaryRoot);
    failed.completedPredecessorStages[5].status = 'failed';
    assert.throws(() => control.buildManifest(failed), {
      code: 'PREDECESSOR_EVIDENCE_REQUIRED',
    });

    const extra = makeRecoveryContext(temporaryRoot);
    extra.completedPredecessorStages[0].unexpected = true;
    assert.throws(() => control.buildManifest(extra), {
      code: 'MANIFEST_SCHEMA_MISMATCH',
    });
  });
});

test('complete revision inventory enforces image-bound monotonic non-reuse without requiring tags', () => {
  withTemporaryRoot((temporaryRoot) => {
    const attemptThree = control.buildManifest(
      makeRecoveryContext(temporaryRoot, { recoveryAttempt: 3 }),
    );
    assert.equal(
      attemptThree.candidate.tag,
      control.expectedCandidateTag(CANDIDATE_IMAGE, 3),
    );
    assert.deepEqual(
      attemptThree.liveDiscovery.candidateRevisionInventory.revisions.map(
        (entry) => entry.revision,
      ),
      [0, 1, 2].map((ordinal) => {
        const tag =
          ordinal === 0
            ? control.expectedCandidateTag(CANDIDATE_IMAGE)
            : control.expectedCandidateTag(CANDIDATE_IMAGE, ordinal);
        return `moazez-staging-api-${tag}`;
      }),
    );

    const optionalTag = makeRecoveryContext(temporaryRoot);
    optionalTag.liveDiscovery.candidateRevisionInventory.revisions[0].tag =
      control.expectedCandidateTag(CANDIDATE_IMAGE);
    assert.equal(
      control.buildManifest(optionalTag).liveDiscovery
        .candidateRevisionInventory.revisions[0].tag,
      control.expectedCandidateTag(CANDIDATE_IMAGE),
    );

    const missingFailedRevision = makeRecoveryContext(temporaryRoot);
    missingFailedRevision.liveDiscovery.candidateRevisionInventory.revisions =
      [];
    assert.throws(() => control.buildManifest(missingFailedRevision), {
      code: 'RECOVERY_REVISION_INVENTORY_INVALID',
    });

    const duplicateRevision = makeRecoveryContext(temporaryRoot);
    duplicateRevision.liveDiscovery.candidateRevisionInventory.revisions.push(
      structuredClone(
        duplicateRevision.liveDiscovery.candidateRevisionInventory.revisions[0],
      ),
    );
    assert.throws(() => control.buildManifest(duplicateRevision), {
      code: 'RECOVERY_REVISION_INVENTORY_INVALID',
    });

    const differentImage = makeRecoveryContext(temporaryRoot);
    differentImage.liveDiscovery.candidateRevisionInventory.revisions[0].imageReference =
      stagingImage('a');
    assert.throws(() => control.buildManifest(differentImage), {
      code: 'RECOVERY_REVISION_INVENTORY_INVALID',
    });

    const outOfOrderAttempt = makeRecoveryContext(temporaryRoot);
    outOfOrderAttempt.recovery.recoveryAttempt = 2;
    assert.throws(() => control.buildManifest(outOfOrderAttempt), {
      code: 'RECOVERY_ATTEMPT_MISMATCH',
    });

    const existingResultRevision = makeRecoveryContext(temporaryRoot);
    const existingTag = control.expectedCandidateTag(CANDIDATE_IMAGE, 1);
    existingResultRevision.liveDiscovery.candidateRevisionInventory.revisions.push(
      {
        revision: `moazez-staging-api-${existingTag}`,
        imageReference: CANDIDATE_IMAGE,
      },
    );
    assert.throws(() => control.buildManifest(existingResultRevision), {
      code: 'RECOVERY_ATTEMPT_MISMATCH',
    });
  });
});

test('recovery failed-plan evidence is full, lowercase, distinct, and dynamically blocklisted', () => {
  withTemporaryRoot((temporaryRoot) => {
    const failedPlanText = 'exact-current-failed-plan-bytes';
    const failedPlanSha256 = hashText(failedPlanText);
    const context = makeRecoveryContext(temporaryRoot, {
      failedPlanSha256,
    });
    const manifest = control.buildManifest(context);
    assert.deepEqual(manifest.blockedSavedPlanHashes, [
      control.BLOCKED_SAVED_PLAN_SHA256,
      failedPlanSha256,
    ]);

    const target = operation(
      manifest,
      control.RECOVERY_RESUME_GATE_ID,
      'api-candidate-runtime',
    );
    fs.mkdirSync(path.dirname(target.savedPlanPath), { recursive: true });
    fs.writeFileSync(target.savedPlanPath, failedPlanText);
    assert.throws(
      () =>
        control.registerPlan(manifest, {
          gateId: control.RECOVERY_RESUME_GATE_ID,
          operationId: 'api-candidate-runtime',
          planPath: target.savedPlanPath,
          sourceSha: manifest.sourceSha,
          environment: manifest.environment,
          terraformRoot: target.terraformRoot,
          lineage: target.statePrecondition.lineage,
          serial: target.statePrecondition.serial,
          recordedAt: RECORDED_AT,
        }),
      { code: 'PLAN_REUSE_FORBIDDEN' },
    );

    for (const blockedHash of manifest.blockedSavedPlanHashes) {
      const tampered = control.buildManifest(structuredClone(context));
      const tamperedTarget = operation(
        tampered,
        control.RECOVERY_RESUME_GATE_ID,
        'api-candidate-runtime',
      );
      tamperedTarget.planEvidence.sha256 = blockedHash;
      assert.throws(() => control.validateManifest(tampered), {
        code: 'PLAN_REUSE_FORBIDDEN',
      });
    }

    const missing = makeRecoveryContext(temporaryRoot);
    delete missing.recovery.failedPlanSha256;
    assert.throws(() => control.buildManifest(missing), {
      code: 'MANIFEST_SCHEMA_MISMATCH',
    });
    for (const invalidHash of ['19cc9769', 'A'.repeat(64), 'g'.repeat(64)]) {
      const invalid = makeRecoveryContext(temporaryRoot);
      invalid.recovery.failedPlanSha256 = invalidHash;
      assert.throws(() => control.buildManifest(invalid), {
        code: 'INVALID_INPUT',
      });
    }
    const historicalCollision = makeRecoveryContext(temporaryRoot);
    historicalCollision.recovery.failedPlanSha256 =
      control.BLOCKED_SAVED_PLAN_SHA256;
    assert.throws(() => control.buildManifest(historicalCollision), {
      code: 'FAILED_PLAN_HASH_INVALID',
    });
  });
});

test('recovery live baseline requires exact traffic, same promoted images, and absent candidate edge resources', () => {
  withTemporaryRoot((temporaryRoot) => {
    const mutations = [
      (context) => {
        context.liveDiscovery.stableApiTrafficPercent = 99;
      },
      (context) => {
        context.liveDiscovery.failedCandidate.trafficPercent = 1;
      },
      (context) => {
        context.liveDiscovery.failedCandidate.imageReference =
          stagingImage('a');
      },
      (context) => {
        context.liveDiscovery.runtimeImages.api = stagingImage('a');
      },
      (context) => {
        context.liveDiscovery.runtimeImages.coreWorker = stagingImage('a');
      },
      (context) => {
        context.liveDiscovery.runtimeImages.mediaWorker = stagingImage('a');
      },
      (context) => {
        context.liveDiscovery.candidateEdgeResources.candidateNegPresent = true;
      },
      (context) => {
        context.liveDiscovery.candidateEdgeResources.candidateBackendPresent = true;
      },
      (context) => {
        context.liveDiscovery.candidateEdgeResources.candidateSmokeRoutePresent = true;
      },
    ];
    for (const mutate of mutations) {
      const context = makeRecoveryContext(temporaryRoot);
      mutate(context);
      assert.throws(() => control.buildManifest(context), {
        code: 'RECOVERY_LIVE_BASELINE_UNSAFE',
      });
    }
  });
});

test('recovery gate state bindings and API attribute allowlist are exact and image-immutable', () => {
  withTemporaryRoot((temporaryRoot) => {
    const context = makeRecoveryContext(temporaryRoot);
    const manifest = control.buildManifest(context);
    const api = operation(
      manifest,
      control.RECOVERY_RESUME_GATE_ID,
      'api-candidate-runtime',
    );
    const edge = operation(
      manifest,
      control.RECOVERY_RESUME_GATE_ID,
      'api-candidate-edge',
    );
    const maintenance = operation(
      manifest,
      'maintenance-scheduler-promotion',
      'maintenance-scheduler-runtime',
    );
    const traffic = operation(
      manifest,
      'traffic-promotion',
      'api-traffic-promotion',
    );
    assert.deepEqual(api.statePrecondition, {
      lineage: context.liveDiscovery.runtimeState.lineage,
      serial: context.liveDiscovery.runtimeState.serial,
      boundFromOperationId: null,
      status: 'bound',
    });
    assert.deepEqual(edge.statePrecondition, {
      lineage: context.liveDiscovery.edgeState.lineage,
      serial: context.liveDiscovery.edgeState.serial,
      boundFromOperationId: null,
      status: 'bound',
    });
    assert.deepEqual(maintenance.statePrecondition, {
      lineage: null,
      serial: null,
      boundFromOperationId: 'api-candidate-runtime',
      status: 'awaiting-predecessor',
    });
    assert.deepEqual(traffic.statePrecondition, {
      lineage: null,
      serial: null,
      boundFromOperationId: 'maintenance-scheduler-runtime',
      status: 'awaiting-predecessor',
    });
    assert.deepEqual(api.allowedAttributeChanges, {
      [control.RUNTIME_RESOURCE_ADDRESSES.api]: [
        'template[0].revision',
        'traffic',
        'template[0].containers[0].startup_probe[0].initial_delay_seconds',
        'template[0].containers[0].startup_probe[0].period_seconds',
        'template[0].containers[0].startup_probe[0].timeout_seconds',
        'template[0].containers[0].startup_probe[0].failure_threshold',
      ],
    });
    const allowed =
      api.allowedAttributeChanges[control.RUNTIME_RESOURCE_ADDRESSES.api];
    assert.equal(allowed.includes('template[0].containers[0].image'), false);
    assert.equal(allowed.includes('template'), false);
    assert.equal(allowed.includes('containers'), false);
    assert.equal(allowed.includes('startup_probe'), false);
    assert.equal(api.requiredVariables.api_image_reference, CANDIDATE_IMAGE);
    assert.equal(
      api.requiredVariables.maintenance_scheduler_image_reference,
      context.liveDiscovery.runtimeImages.maintenanceScheduler,
    );
    assert.deepEqual(traffic.allowedAttributeChanges, {
      [control.RUNTIME_RESOURCE_ADDRESSES.api]: ['traffic'],
    });
  });
});

test('recovery stop-after-first-failure blocks the exact remaining API-first window', () => {
  withTemporaryRoot((temporaryRoot) => {
    const apiFailure = control.buildManifest(
      makeRecoveryContext(temporaryRoot),
    );
    registerAndApprove(
      apiFailure,
      control.RECOVERY_RESUME_GATE_ID,
      'api-candidate-runtime',
      'recovery-api-runtime-failure',
    );
    control.recordApply(apiFailure, {
      gateId: control.RECOVERY_RESUME_GATE_ID,
      operationId: 'api-candidate-runtime',
      result: 'failed',
      evidenceRef: 'apply:recovery-api-runtime-failed',
      recordedAt: RECORDED_AT,
    });
    assert.equal(
      operation(
        apiFailure,
        control.RECOVERY_RESUME_GATE_ID,
        'api-candidate-edge',
      ).status,
      'blocked',
    );
    assert.equal(
      apiFailure.gates.slice(1).every((gate) => gate.status === 'blocked'),
      true,
    );

    const edgeFailure = control.buildManifest(
      makeRecoveryContext(temporaryRoot),
    );
    applyAndVerifyTerraform(
      edgeFailure,
      control.RECOVERY_RESUME_GATE_ID,
      'api-candidate-runtime',
      'recovery-api-runtime-before-edge-failure',
      {
        observedImage: edgeFailure.candidate.imageReference,
        observedRevision: edgeFailure.candidate.revision,
        observedCandidateTag: edgeFailure.candidate.tag,
        observedStablePercent: 100,
        observedCandidatePercent: 0,
      },
    );
    registerAndApprove(
      edgeFailure,
      control.RECOVERY_RESUME_GATE_ID,
      'api-candidate-edge',
      'recovery-api-edge-failure',
    );
    control.recordApply(edgeFailure, {
      gateId: control.RECOVERY_RESUME_GATE_ID,
      operationId: 'api-candidate-edge',
      result: 'failed',
      evidenceRef: 'apply:recovery-api-edge-failed',
      recordedAt: RECORDED_AT,
    });
    assert.equal(
      edgeFailure.gates.slice(1).every((gate) => gate.status === 'blocked'),
      true,
    );

    const maintenanceFailure = control.buildManifest(
      makeRecoveryContext(temporaryRoot),
    );
    passThroughApiCandidate(maintenanceFailure);
    registerAndApprove(
      maintenanceFailure,
      'maintenance-scheduler-promotion',
      'maintenance-scheduler-runtime',
      'recovery-maintenance-failure',
    );
    control.recordApply(maintenanceFailure, {
      gateId: 'maintenance-scheduler-promotion',
      operationId: 'maintenance-scheduler-runtime',
      result: 'failed',
      evidenceRef: 'apply:recovery-maintenance-failed',
      recordedAt: RECORDED_AT,
    });
    assert.equal(
      maintenanceFailure.gates
        .slice(2)
        .every((gate) => gate.status === 'blocked'),
      true,
    );

    const smokeFailure = control.buildManifest(
      makeRecoveryContext(temporaryRoot),
    );
    passThroughApiCandidate(smokeFailure);
    passThroughMaintenance(smokeFailure);
    control.recordVerification(smokeFailure, {
      gateId: 'protected-readiness-and-smoke',
      operationId: 'protected-candidate-smoke',
      result: 'failed',
      evidenceRef: 'verify:recovery-smoke-failed',
      recordedAt: RECORDED_AT,
    });
    assert.equal(
      smokeFailure.gates.find((gate) => gate.id === 'traffic-promotion').status,
      'blocked',
    );
  });
});

test('complete recovery flow preserves lifecycle single consumption through traffic promotion', () => {
  withTemporaryRoot((temporaryRoot) => {
    const manifest = control.buildManifest(makeRecoveryContext(temporaryRoot));
    passThroughApiCandidate(manifest);
    passThroughMaintenance(manifest);
    passThroughProtectedSmoke(manifest);
    applyAndVerifyTerraform(
      manifest,
      'traffic-promotion',
      'api-traffic-promotion',
      'recovery-traffic-promotion',
      {
        observedImage: manifest.candidate.imageReference,
        observedRevision: manifest.candidate.revision,
        observedCandidateTag: manifest.candidate.tag,
        observedStablePercent: 0,
        observedCandidatePercent: 100,
      },
    );
    assert.equal(manifest.releaseStatus, 'complete');
    assert.equal(
      manifest.gates.every((gate) => gate.status === 'passed'),
      true,
    );
    for (const gate of manifest.gates) {
      for (const target of gate.operations.filter(
        (candidate) => candidate.kind === 'terraform',
      )) {
        assert.equal(target.apply.attempted, true);
        assert.equal(target.singleConsumptionStatus, 'consumed-success');
      }
    }
    assert.throws(
      () =>
        control.recordApply(manifest, {
          gateId: 'traffic-promotion',
          operationId: 'api-traffic-promotion',
          result: 'succeeded',
          evidenceRef: 'apply:recovery-traffic-reuse',
          postLineage: LIVE_RUNTIME_LINEAGE,
          postSerial: 99,
          recordedAt: RECORDED_AT,
        }),
      { code: 'RELEASE_ALREADY_COMPLETE' },
    );
  });
});

test('operation specs isolate each runtime resource and model API runtime then edge suboperations', () => {
  withTemporaryRoot((temporaryRoot) => {
    const manifest = control.buildManifest(makeContext(temporaryRoot));
    const core = operation(
      manifest,
      'core-worker-promotion',
      'core-worker-runtime',
    );
    const media = operation(
      manifest,
      'media-worker-promotion',
      'media-worker-runtime',
    );
    const maintenance = operation(
      manifest,
      'maintenance-scheduler-promotion',
      'maintenance-scheduler-runtime',
    );
    assert.deepEqual(core.expectedResourceAddressAllowlist, [
      control.RUNTIME_RESOURCE_ADDRESSES.coreWorker,
    ]);
    assert.deepEqual(media.expectedResourceAddressAllowlist, [
      control.RUNTIME_RESOURCE_ADDRESSES.mediaWorker,
    ]);
    assert.deepEqual(maintenance.expectedResourceAddressAllowlist, [
      control.RUNTIME_RESOURCE_ADDRESSES.maintenanceScheduler,
    ]);
    assert.equal(
      core.requiredVariables.api_image_reference,
      manifest.liveDiscovery.runtimeImages.api,
    );
    assert.equal(
      core.requiredVariables.media_worker_image_reference,
      manifest.liveDiscovery.runtimeImages.mediaWorker,
    );
    const apiGate = manifest.gates.find(
      (gate) => gate.id === 'api-no-traffic-promotion',
    );
    assert.deepEqual(
      apiGate.operations.map((candidate) => candidate.id),
      ['api-candidate-runtime', 'api-candidate-edge'],
    );
    assert.equal(
      apiGate.operations[0].requiredVariables.api_traffic_mode,
      'candidate_no_traffic',
    );
    assert.equal(
      apiGate.operations[1].requiredVariables.candidate_edge_enabled,
      true,
    );
  });
});

test('every Terraform operation binds external paths and source/root/environment/state metadata', () => {
  withTemporaryRoot((temporaryRoot) => {
    const manifest = control.buildManifest(makeContext(temporaryRoot));
    for (const gate of manifest.gates) {
      for (const target of gate.operations.filter(
        (candidate) => candidate.kind === 'terraform',
      )) {
        assert.equal(path.isAbsolute(target.tfDataDir), true);
        assert.equal(path.isAbsolute(target.savedPlanPath), true);
        assert.equal(target.tfDataDir.startsWith(REPOSITORY_ROOT), false);
        assert.equal(target.savedPlanPath.startsWith(REPOSITORY_ROOT), false);
        assert.equal(target.sourceSha, manifest.sourceSha);
        assert.equal(target.environment, 'staging');
        assert.match(target.terraformRoot, /^infra\/gcp\//u);
        assert.equal(Object.hasOwn(target.statePrecondition, 'lineage'), true);
        assert.equal(Object.hasOwn(target.statePrecondition, 'serial'), true);
        assert.equal(target.planEvidence.status, 'not-created');
        assert.equal(target.approval.status, 'pending');
        assert.equal(target.apply.status, 'not-applied');
        assert.equal(target.singleConsumptionStatus, 'unconsumed');
      }
    }
    const serialized = JSON.stringify(manifest);
    assert.doesNotMatch(serialized, /BEGIN (?:RSA |EC )?PRIVATE KEY/u);
    assert.doesNotMatch(serialized, /Bearer [A-Za-z0-9._-]{20,}/u);
  });
});

test('candidate inputs fail closed when tag, stable revision, traffic baseline, or environment is invalid', () => {
  withTemporaryRoot((temporaryRoot) => {
    const context = makeContext(temporaryRoot);
    assert.throws(
      () =>
        control.buildManifest({
          ...context,
          candidateTag: 'candidate-000000000000',
        }),
      { code: 'CANDIDATE_TAG_MISMATCH' },
    );
    const missingStable = makeContext(temporaryRoot);
    delete missingStable.liveDiscovery.stableApiRevision;
    assert.throws(() => control.buildManifest(missingStable), {
      code: 'INVALID_INPUT',
    });
    const unsafeTraffic = makeContext(temporaryRoot);
    unsafeTraffic.liveDiscovery.apiTrafficMode = 'candidate_no_traffic';
    assert.throws(() => control.buildManifest(unsafeTraffic), {
      code: 'LIVE_TRAFFIC_BASELINE_UNSAFE',
    });
    assert.throws(
      () => control.buildManifest({ ...context, environment: 'production' }),
      { code: 'ENVIRONMENT_UNSUPPORTED' },
    );
  });
});

test('Terraform state lineages accept opaque identities and preserve exact bytes', () => {
  withTemporaryRoot((temporaryRoot) => {
    const acceptedPairs = [
      [LINEAGE, EDGE_LINEAGE],
      [LIVE_RUNTIME_LINEAGE, LIVE_EDGE_LINEAGE],
      [OPAQUE_LINEAGE, 'Terraform-Lineage-Case-Sensitive-Aa'],
      ['terraform-lineage-cafe\u0301', LIVE_EDGE_LINEAGE],
    ];

    for (const [runtimeLineage, edgeLineage] of acceptedPairs) {
      const context = makeContext(temporaryRoot);
      context.liveDiscovery.runtimeState.lineage = runtimeLineage;
      context.liveDiscovery.edgeState.lineage = edgeLineage;
      const manifest = control.buildManifest(context);
      assert.equal(manifest.liveDiscovery.runtimeState.lineage, runtimeLineage);
      assert.equal(manifest.liveDiscovery.edgeState.lineage, edgeLineage);
    }

    const decomposedLineage = 'terraform-lineage-cafe\u0301';
    const decomposedContext = makeContext(temporaryRoot);
    decomposedContext.liveDiscovery.runtimeState.lineage = decomposedLineage;
    const decomposedManifest = control.buildManifest(decomposedContext);
    assert.equal(
      decomposedManifest.liveDiscovery.runtimeState.lineage,
      decomposedLineage,
    );
    assert.notEqual(
      decomposedManifest.liveDiscovery.runtimeState.lineage,
      decomposedLineage.normalize('NFC'),
    );

    const maximumUtf8Lineage = '\u00e9'.repeat(512);
    assert.equal(Buffer.byteLength(maximumUtf8Lineage, 'utf8'), 1024);
    const maximumContext = makeContext(temporaryRoot);
    maximumContext.liveDiscovery.runtimeState.lineage = maximumUtf8Lineage;
    const maximumManifest = control.buildManifest(maximumContext);
    assert.equal(
      maximumManifest.liveDiscovery.runtimeState.lineage,
      maximumUtf8Lineage,
    );
  });
});

test('Terraform state lineages reject missing, whitespace, controls, and oversized UTF-8 values', () => {
  withTemporaryRoot((temporaryRoot) => {
    const missingContext = makeContext(temporaryRoot);
    delete missingContext.liveDiscovery.runtimeState.lineage;
    assert.throws(() => control.buildManifest(missingContext), {
      code: 'INVALID_INPUT',
    });

    for (const lineage of [
      '',
      ' \t ',
      ' lineage',
      'lineage ',
      'lineage\u0000token',
      'lineage\u001ftoken',
      'lineage\u007ftoken',
      'lineage\u009ftoken',
      '\u00e9'.repeat(513),
    ]) {
      const context = makeContext(temporaryRoot);
      context.liveDiscovery.runtimeState.lineage = lineage;
      assert.throws(() => control.buildManifest(context), {
        code: 'INVALID_INPUT',
      });
    }
  });
});

test('Terraform state serials remain non-negative safe integers', () => {
  withTemporaryRoot((temporaryRoot) => {
    for (const serial of [0, 1, Number.MAX_SAFE_INTEGER]) {
      const context = makeContext(temporaryRoot);
      context.liveDiscovery.runtimeState.serial = serial;
      const manifest = control.buildManifest(context);
      assert.equal(manifest.liveDiscovery.runtimeState.serial, serial);
    }

    const missingContext = makeContext(temporaryRoot);
    delete missingContext.liveDiscovery.runtimeState.serial;
    assert.throws(() => control.buildManifest(missingContext), {
      code: 'INVALID_INPUT',
    });

    for (const serial of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, '6']) {
      const context = makeContext(temporaryRoot);
      context.liveDiscovery.runtimeState.serial = serial;
      assert.throws(() => control.buildManifest(context), {
        code: 'INVALID_INPUT',
      });
    }
  });
});

test('register-plan binds the exact opaque lineage without canonicalization', () => {
  withTemporaryRoot((temporaryRoot) => {
    const context = makeContext(temporaryRoot);
    context.liveDiscovery.runtimeState.lineage = OPAQUE_LINEAGE;
    const manifest = control.buildManifest(context);
    const core = operation(
      manifest,
      'core-worker-promotion',
      'core-worker-runtime',
    );
    fs.mkdirSync(path.dirname(core.savedPlanPath), { recursive: true });
    fs.writeFileSync(core.savedPlanPath, 'opaque-lineage-plan');
    const options = {
      gateId: 'core-worker-promotion',
      operationId: 'core-worker-runtime',
      planPath: core.savedPlanPath,
      sourceSha: manifest.sourceSha,
      environment: manifest.environment,
      terraformRoot: core.terraformRoot,
      lineage: OPAQUE_LINEAGE,
      serial: core.statePrecondition.serial,
      recordedAt: RECORDED_AT,
    };

    assert.throws(
      () =>
        control.registerPlan(manifest, {
          ...options,
          lineage: `${OPAQUE_LINEAGE}x`,
        }),
      { code: 'PLAN_BINDING_MISMATCH' },
    );
    assert.equal(core.status, 'pending');

    control.registerPlan(manifest, options);
    assert.equal(core.status, 'plan-registered');
    assert.equal(core.statePrecondition.lineage, OPAQUE_LINEAGE);
  });
});

test('record-apply requires the same exact opaque lineage and a higher serial', () => {
  withTemporaryRoot((temporaryRoot) => {
    const context = makeContext(temporaryRoot);
    context.liveDiscovery.runtimeState.lineage = OPAQUE_LINEAGE;
    context.liveDiscovery.runtimeState.serial = 0;
    const manifest = control.buildManifest(context);
    const core = registerAndApprove(
      manifest,
      'core-worker-promotion',
      'core-worker-runtime',
      'opaque-lineage-apply-plan',
    );
    const applyOptions = {
      gateId: 'core-worker-promotion',
      operationId: 'core-worker-runtime',
      result: 'succeeded',
      evidenceRef: 'apply:opaque-lineage',
      postLineage: OPAQUE_LINEAGE,
      postSerial: 1,
      recordedAt: RECORDED_AT,
    };

    assert.throws(
      () =>
        control.recordApply(manifest, {
          ...applyOptions,
          postLineage: `${OPAQUE_LINEAGE}x`,
        }),
      { code: 'POST_APPLY_STATE_INVALID' },
    );
    assert.equal(core.apply.attempted, false);

    control.recordApply(manifest, applyOptions);
    assert.equal(core.apply.status, 'succeeded');
    assert.equal(core.apply.postApplyState.lineage, OPAQUE_LINEAGE);
    assert.equal(core.apply.postApplyState.serial, 1);
  });
});

test('out-of-order gates and ordered API suboperations are rejected', () => {
  withTemporaryRoot((temporaryRoot) => {
    const manifest = control.buildManifest(makeContext(temporaryRoot));
    const media = operation(
      manifest,
      'media-worker-promotion',
      'media-worker-runtime',
    );
    fs.mkdirSync(path.dirname(media.savedPlanPath), { recursive: true });
    fs.writeFileSync(media.savedPlanPath, 'media-plan');
    assert.throws(
      () =>
        control.registerPlan(manifest, {
          gateId: 'media-worker-promotion',
          operationId: 'media-worker-runtime',
          planPath: media.savedPlanPath,
          sourceSha: manifest.sourceSha,
          environment: manifest.environment,
          terraformRoot: media.terraformRoot,
          lineage: LINEAGE,
          serial: 10,
          recordedAt: RECORDED_AT,
        }),
      { code: 'OUT_OF_ORDER_GATE' },
    );
    passThroughWorkers(manifest);
    const edge = operation(
      manifest,
      'api-no-traffic-promotion',
      'api-candidate-edge',
    );
    fs.mkdirSync(path.dirname(edge.savedPlanPath), { recursive: true });
    fs.writeFileSync(edge.savedPlanPath, 'edge-plan');
    assert.throws(
      () =>
        control.registerPlan(manifest, {
          gateId: 'api-no-traffic-promotion',
          operationId: 'api-candidate-edge',
          planPath: edge.savedPlanPath,
          sourceSha: manifest.sourceSha,
          environment: manifest.environment,
          terraformRoot: edge.terraformRoot,
          lineage: EDGE_LINEAGE,
          serial: 20,
          recordedAt: RECORDED_AT,
        }),
      { code: 'OUT_OF_ORDER_SUBOPERATION' },
    );
  });
});

test('first failure blocks every later gate and the saved plan cannot be consumed twice', () => {
  withTemporaryRoot((temporaryRoot) => {
    const manifest = control.buildManifest(makeContext(temporaryRoot));
    const core = registerAndApprove(
      manifest,
      'core-worker-promotion',
      'core-worker-runtime',
      'plan-core-failure',
    );
    control.recordApply(manifest, {
      gateId: 'core-worker-promotion',
      operationId: 'core-worker-runtime',
      result: 'failed',
      evidenceRef: 'apply:core-failed',
      recordedAt: RECORDED_AT,
    });
    assert.equal(manifest.releaseStatus, 'failed');
    assert.equal(manifest.failedGateId, 'core-worker-promotion');
    assert.equal(
      core.singleConsumptionStatus,
      'invalidated-after-failed-attempt',
    );
    assert.equal(
      manifest.gates
        .filter((gate) => gate.sequence > 1)
        .every((gate) => gate.status === 'blocked'),
      true,
    );
    assert.throws(
      () =>
        control.recordApply(manifest, {
          gateId: 'core-worker-promotion',
          operationId: 'core-worker-runtime',
          result: 'succeeded',
          evidenceRef: 'apply:core-reuse',
          postLineage: LINEAGE,
          postSerial: 11,
          recordedAt: RECORDED_AT,
        }),
      { code: 'STOP_AFTER_FIRST_FAILURE' },
    );
  });
});

test('the historical blocked saved-plan hash and duplicate registered hashes are rejected', () => {
  withTemporaryRoot((temporaryRoot) => {
    const manifest = control.buildManifest(makeContext(temporaryRoot));
    const core = operation(
      manifest,
      'core-worker-promotion',
      'core-worker-runtime',
    );
    core.planEvidence.sha256 = control.BLOCKED_SAVED_PLAN_SHA256;
    assert.throws(() => control.validateManifest(manifest), {
      code: 'PLAN_REUSE_FORBIDDEN',
    });
    const duplicateHash = crypto
      .createHash('sha256')
      .update('same')
      .digest('hex');
    core.planEvidence = {
      status: 'registered',
      sha256: duplicateHash,
      sizeBytes: 4,
      registeredAt: RECORDED_AT,
      reviewed: false,
    };
    core.status = 'plan-registered';
    const media = operation(
      manifest,
      'media-worker-promotion',
      'media-worker-runtime',
    );
    media.planEvidence = {
      status: 'registered',
      sha256: duplicateHash,
      sizeBytes: 4,
      registeredAt: RECORDED_AT,
      reviewed: false,
    };
    media.status = 'plan-registered';
    assert.throws(() => control.validateManifest(manifest), {
      code: 'PLAN_REUSE_FORBIDDEN',
    });
  });
});

test('manifest validation rejects immutable operation-spec and lifecycle tampering', () => {
  withTemporaryRoot((temporaryRoot) => {
    const context = makeContext(temporaryRoot);
    const allowlistTamper = control.buildManifest(context);
    operation(
      allowlistTamper,
      'core-worker-promotion',
      'core-worker-runtime',
    ).expectedResourceAddressAllowlist = [
      control.RUNTIME_RESOURCE_ADDRESSES.api,
    ];
    assert.throws(() => control.validateManifest(allowlistTamper), {
      code: 'MANIFEST_SPEC_MISMATCH',
    });

    const variableTamper = control.buildManifest(context);
    operation(
      variableTamper,
      'media-worker-promotion',
      'media-worker-runtime',
    ).requiredVariables.api_image_reference =
      variableTamper.candidate.imageReference;
    assert.throws(() => control.validateManifest(variableTamper), {
      code: 'MANIFEST_SPEC_MISMATCH',
    });

    const lifecycleTamper = control.buildManifest(context);
    operation(
      lifecycleTamper,
      'core-worker-promotion',
      'core-worker-runtime',
    ).singleConsumptionStatus = 'consumed-success';
    assert.throws(() => control.validateManifest(lifecycleTamper), {
      code: 'MANIFEST_LIFECYCLE_INVALID',
    });
  });
});

test('invalid apply evidence is rejected without mutating the approved operation', () => {
  withTemporaryRoot((temporaryRoot) => {
    const manifest = control.buildManifest(makeContext(temporaryRoot));
    const core = registerAndApprove(
      manifest,
      'core-worker-promotion',
      'core-worker-runtime',
      'plan-core-invalid-result',
    );
    const before = structuredClone(core);
    assert.throws(
      () =>
        control.recordApply(manifest, {
          gateId: 'core-worker-promotion',
          operationId: 'core-worker-runtime',
          result: 'unknown',
          evidenceRef: 'apply:invalid',
          recordedAt: RECORDED_AT,
        }),
      { code: 'INVALID_INPUT' },
    );
    assert.deepEqual(core, before);
  });
});

test('protected smoke and traffic promotion cannot precede their prerequisite gates', () => {
  withTemporaryRoot((temporaryRoot) => {
    const manifest = control.buildManifest(makeContext(temporaryRoot));
    assert.throws(() => passThroughProtectedSmoke(manifest), {
      code: 'OUT_OF_ORDER_GATE',
    });
    const traffic = operation(
      manifest,
      'traffic-promotion',
      'api-traffic-promotion',
    );
    fs.mkdirSync(path.dirname(traffic.savedPlanPath), { recursive: true });
    fs.writeFileSync(traffic.savedPlanPath, 'traffic-too-early');
    assert.throws(
      () =>
        control.registerPlan(manifest, {
          gateId: 'traffic-promotion',
          operationId: 'api-traffic-promotion',
          planPath: traffic.savedPlanPath,
          sourceSha: manifest.sourceSha,
          environment: manifest.environment,
          terraformRoot: traffic.terraformRoot,
          lineage: LINEAGE,
          serial: 10,
          recordedAt: RECORDED_AT,
        }),
      { code: 'OUT_OF_ORDER_GATE' },
    );
  });
});

test('complete governed flow preserves candidate image and revision through traffic-only promotion', () => {
  withTemporaryRoot((temporaryRoot) => {
    const manifest = control.buildManifest(makeContext(temporaryRoot));
    passThroughWorkers(manifest);
    passThroughApiCandidate(manifest);
    passThroughMaintenance(manifest);
    passThroughProtectedSmoke(manifest);
    const traffic = operation(
      manifest,
      'traffic-promotion',
      'api-traffic-promotion',
    );
    assert.equal(
      traffic.expectedChangeType,
      'update-in-place:api-traffic-only',
    );
    assert.deepEqual(traffic.allowedAttributeChanges, {
      [control.RUNTIME_RESOURCE_ADDRESSES.api]: ['traffic'],
    });
    assert.equal(
      traffic.requiredVariables.api_image_reference,
      manifest.candidate.imageReference,
    );
    applyAndVerifyTerraform(
      manifest,
      'traffic-promotion',
      'api-traffic-promotion',
      'plan-traffic',
      {
        observedImage: manifest.candidate.imageReference,
        observedRevision: manifest.candidate.revision,
        observedCandidateTag: manifest.candidate.tag,
        observedStablePercent: 0,
        observedCandidatePercent: 100,
      },
    );
    assert.equal(manifest.releaseStatus, 'complete');
    assert.equal(
      manifest.gates.every((gate) => gate.status === 'passed'),
      true,
    );
    assert.equal(traffic.apply.attempted, true);
    assert.equal(traffic.singleConsumptionStatus, 'consumed-success');
    assert.match(traffic.planEvidence.sha256, /^[a-f0-9]{64}$/u);
  });
});

test('runtime Terraform source contains four isolated image consumers and traffic-only promotion mechanics', () => {
  const main = fs.readFileSync(
    path.join(
      REPOSITORY_ROOT,
      'infra/gcp/backend-runtime/modules/runtime-environment/main.tf',
    ),
    'utf8',
  );
  const variables = fs.readFileSync(
    path.join(
      REPOSITORY_ROOT,
      'infra/gcp/backend-runtime/modules/runtime-environment/variables.tf',
    ),
    'utf8',
  );
  for (const name of [
    'api_image_reference',
    'core_worker_image_reference',
    'media_worker_image_reference',
    'maintenance_scheduler_image_reference',
  ]) {
    assert.match(variables, new RegExp(`variable "${name}"`, 'u'));
  }
  assert.doesNotMatch(variables, /variable "image_reference"/u);
  assert.equal(
    (main.match(/image\s*=\s*var[.]api_image_reference/gu) ?? []).length,
    1,
  );
  assert.equal(
    (main.match(/image\s*=\s*var[.]core_worker_image_reference/gu) ?? [])
      .length,
    1,
  );
  assert.equal(
    (main.match(/image\s*=\s*var[.]media_worker_image_reference/gu) ?? [])
      .length,
    1,
  );
  assert.equal(
    (
      main.match(/image\s*=\s*var[.]maintenance_scheduler_image_reference/gu) ??
      []
    ).length,
    1,
  );
  assert.match(main, /dynamic "traffic"/u);
  assert.match(main, /TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION/u);
  assert.match(main, /candidate_no_traffic" \? 100 : 0/u);
  assert.match(main, /candidate_no_traffic" \? 0 : 100/u);
});

test('edge source adds only an optional tagged candidate NEG/backend and one exact protected route', () => {
  const edge = fs.readFileSync(
    path.join(
      REPOSITORY_ROOT,
      'infra/gcp/edge/modules/edge-environment/main.tf',
    ),
    'utf8',
  );
  const production = fs.readFileSync(
    path.join(
      REPOSITORY_ROOT,
      'infra/gcp/edge/environments/production/main.tf',
    ),
    'utf8',
  );
  const authController = fs.readFileSync(
    path.join(
      REPOSITORY_ROOT,
      'src/modules/iam/auth/controller/auth.controller.ts',
    ),
    'utf8',
  );
  assert.match(
    edge,
    /resource "google_compute_region_network_endpoint_group" "api_candidate"/u,
  );
  assert.match(
    edge,
    /cloud_run\s*\{[^}]*service\s*=\s*var[.]api_service_name[^}]*tag\s*=\s*var[.]candidate_api_tag/su,
  );
  assert.match(
    edge,
    /security_policy\s*=\s*google_compute_security_policy[.]edge[.]self_link/u,
  );
  assert.match(
    edge,
    /candidate_smoke_public_path\s*=\s*"\/[.]well-known\/moazez\/candidate-readiness"/u,
  );
  assert.match(
    edge,
    /candidate_smoke_backend_path\s*=\s*"\/api\/v1\/auth\/me"/u,
  );
  assert.equal(
    (edge.match(/resource "google_compute_global_address"/gu) ?? []).length,
    1,
  );
  assert.equal(
    (
      edge.match(
        /resource "google_certificate_manager_certificate" "edge"/gu,
      ) ?? []
    ).length,
    1,
  );
  assert.equal(
    (edge.match(/resource "google_compute_target_https_proxy"/gu) ?? []).length,
    1,
  );
  assert.doesNotMatch(edge, /resource "google_dns_/u);
  assert.match(production, /candidate_edge_enabled\s*=\s*false/u);
  assert.match(production, /candidate_api_tag\s*=\s*null/u);
  assert.match(authController, /@Get\('me'\)/u);
  const meDecoratorStart = authController.indexOf("@Get('me')");
  const meMethodEnd = authController.indexOf(
    "@Post('logout')",
    meDecoratorStart,
  );
  assert.doesNotMatch(
    authController.slice(meDecoratorStart, meMethodEnd),
    /@PublicRoute/u,
  );
});
