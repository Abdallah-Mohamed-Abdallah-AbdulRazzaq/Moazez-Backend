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
      assert.equal(
        manifest.liveDiscovery.runtimeState.lineage,
        runtimeLineage,
      );
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
