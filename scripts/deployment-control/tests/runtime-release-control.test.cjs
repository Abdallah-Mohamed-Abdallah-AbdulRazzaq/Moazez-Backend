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
const NEXT_CANDIDATE_IMAGE =
  'me-central2-docker.pkg.dev/moazez-nonprod-91001421934/moazez-staging-containers/moazez-backend@sha256:a256576ef34bf301c4677f367a8df1868925ffdcb88492ced1babfc5e74af240';
const LINEAGE = '123e4567-e89b-42d3-a456-426614174000';
const EDGE_LINEAGE = '223e4567-e89b-42d3-a456-426614174000';
const LIVE_RUNTIME_LINEAGE = '32365b63-3fda-f044-1b7f-e8d686105bac';
const LIVE_EDGE_LINEAGE = '545dd53b-773c-667a-aa75-fb3d1f65db23';
const OPAQUE_LINEAGE = 'terraform-lineage-opaque-identity-01';
const RECORDED_AT = '2026-08-31T18:00:00Z';
const AUTHORITATIVE_PREVIOUS_SOURCE_SHA =
  '0ff08950da8f787f6ef9ccfa1c757e448a03a50b';
const PREVIOUS_RELEASE_EXECUTION_ID = 'day2-staging-academics-20260911023836';
const CRLF_RELEASE_CONTRACT_SHA256 =
  '87d85e81512582339483537cfcf84ff37d0861e468838607598ee35e766d6cc6';
const REPRESENTATIVE_PLAN_FIXTURE_PATH = path.join(
  __dirname,
  'fixtures',
  'successful-edge-continuation-v3-real-plan.json',
);

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

function makePromotedBaselineContext(temporaryRoot) {
  const context = makeContext(temporaryRoot);
  const promotedCandidateTag = control.expectedCandidateTag(CANDIDATE_IMAGE, 1);
  delete context.liveDiscovery.stableApiRevision;
  context.candidateImageReference = NEXT_CANDIDATE_IMAGE;
  context.candidateTag = control.expectedCandidateTag(NEXT_CANDIDATE_IMAGE);
  context.liveDiscovery.apiTrafficMode = 'candidate_promoted';
  context.liveDiscovery.runtimeImages = {
    api: CANDIDATE_IMAGE,
    coreWorker: CANDIDATE_IMAGE,
    mediaWorker: CANDIDATE_IMAGE,
    maintenanceScheduler: CANDIDATE_IMAGE,
  };
  context.liveDiscovery.promotedBaseline = {
    previousStableRevision: 'moazez-staging-api-00005-fct',
    previousStableTrafficPercent: 0,
    promotedRevision: `moazez-staging-api-${promotedCandidateTag}`,
    promotedTrafficPercent: 100,
    promotedCandidateTag,
    promotedImageReference: CANDIDATE_IMAGE,
  };
  context.liveDiscovery.candidateEdgeResources = {
    candidateNegPresent: false,
    candidateBackendPresent: false,
    candidateSmokeRoutePresent: false,
  };
  return context;
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

function representativePlanFixture() {
  return JSON.parse(fs.readFileSync(REPRESENTATIVE_PLAN_FIXTURE_PATH, 'utf8'));
}

function representativeNoOpUrlMapRecord() {
  return {
    address: control.EDGE_CANDIDATE_RESOURCE_ADDRESSES[2],
    mode: 'managed',
    type: 'google_compute_url_map',
    name: 'edge',
    provider_name: 'registry.terraform.io/hashicorp/google',
    change: {
      actions: ['no-op'],
      before: { name: 'moazez-staging-edge-url-map' },
      after: { name: 'moazez-staging-edge-url-map' },
      after_unknown: {},
    },
  };
}

function writeSuccessfulContinuationReviewEvidence(
  manifest,
  target,
  manifestBytes,
) {
  const planJsonBytes = fs.readFileSync(REPRESENTATIVE_PLAN_FIXTURE_PATH);
  const savedPlanBytes = fs.readFileSync(target.savedPlanPath);
  const planJsonPath = `${target.savedPlanPath}.plan.json`;
  fs.writeFileSync(planJsonPath, planJsonBytes);
  const review = control.reviewTerraformPlanJson(
    JSON.parse(planJsonBytes.toString('utf8')),
    manifest,
    {
      gateId: control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
      operationId: control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
    },
  );
  const evidence = {
    schemaVersion: review.schemaVersion,
    status: review.status,
    manifestSha256: hashText(manifestBytes),
    releaseExecutionId: review.releaseExecutionId,
    sourceSha: review.sourceSha,
    gateId: review.gateId,
    operationId: review.operationId,
    immutableOperationSpecificationSha256:
      review.immutableOperationSpecificationSha256,
    savedPlanPath: target.savedPlanPath,
    savedPlanSha256: hashText(savedPlanBytes),
    savedPlanSizeBytes: savedPlanBytes.length,
    planJsonSha256: hashText(planJsonBytes),
    planJsonSizeBytes: planJsonBytes.length,
    formatVersion: review.formatVersion,
    terraformVersion: review.terraformVersion,
    nonNoopResourceChangeCount: review.nonNoopResourceChangeCount,
    intendedSemanticChangeCount: review.intendedSemanticChangeCount,
    refreshOnlyDriftCount: review.refreshOnlyDriftCount,
    unapprovedSemanticChangeCount: review.unapprovedSemanticChangeCount,
    unapprovedUnknownCount: review.unapprovedUnknownCount,
    unapprovedNormalizationCount: review.unapprovedNormalizationCount,
    unapprovedDriftCount: review.unapprovedDriftCount,
    urlMapMutation: review.urlMapMutation,
  };
  const reviewEvidencePath = `${target.savedPlanPath}.review.json`;
  fs.writeFileSync(
    reviewEvidencePath,
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
  return { reviewEvidencePath, planJsonPath, evidence };
}

function registerAndApprove(manifest, gateId, operationId, uniquePlanText) {
  const target = operation(manifest, gateId, operationId);
  fs.mkdirSync(path.dirname(target.savedPlanPath), { recursive: true });
  fs.writeFileSync(target.savedPlanPath, uniquePlanText);
  const requiresDeterministicReview =
    [3, 4].includes(manifest.manifestVersion) &&
    gateId === control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID &&
    operationId === control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID;
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  const reviewBinding = requiresDeterministicReview
    ? writeSuccessfulContinuationReviewEvidence(manifest, target, manifestBytes)
    : null;
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
    ...(reviewBinding
      ? {
          reviewEvidencePath: reviewBinding.reviewEvidencePath,
          planJsonPath: reviewBinding.planJsonPath,
          manifestBytes,
        }
      : {}),
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

function predecessorSourceSha() {
  return control.currentSourceSha() === AUTHORITATIVE_PREVIOUS_SOURCE_SHA
    ? 'a5085660c2069d76be632aaff8b73d3a9c8c0584'
    : AUTHORITATIVE_PREVIOUS_SOURCE_SHA;
}

function replaceManifestSourceSha(manifest, sourceSha) {
  manifest.sourceSha = sourceSha;
  for (const gate of manifest.gates) {
    for (const candidateOperation of gate.operations) {
      candidateOperation.sourceSha = sourceSha;
    }
  }
}

function makeSuccessfulContinuationContext(temporaryRoot) {
  const predecessorContext = makePromotedBaselineContext(temporaryRoot);
  predecessorContext.executionId = PREVIOUS_RELEASE_EXECUTION_ID;
  predecessorContext.liveDiscovery.runtimeState = {
    lineage: LIVE_RUNTIME_LINEAGE,
    serial: 12,
  };
  predecessorContext.liveDiscovery.edgeState = {
    lineage: LIVE_EDGE_LINEAGE,
    serial: 9,
  };
  const predecessorManifest = control.buildManifest(predecessorContext);
  passThroughWorkers(predecessorManifest);
  applyAndVerifyTerraform(
    predecessorManifest,
    'api-no-traffic-promotion',
    'api-candidate-runtime',
    'previous-plan-api-runtime',
    {
      observedImage: predecessorManifest.candidate.imageReference,
      observedRevision: predecessorManifest.candidate.revision,
      observedCandidateTag: predecessorManifest.candidate.tag,
      observedStablePercent: 100,
      observedCandidatePercent: 0,
    },
  );

  const previousSourceSha = predecessorSourceSha();
  replaceManifestSourceSha(predecessorManifest, previousSourceSha);
  delete predecessorManifest.liveDiscovery.candidateEdgeResources;
  assert.doesNotThrow(() =>
    control.validateManifest(structuredClone(predecessorManifest)),
  );
  const previousManifestRef = path.join(
    temporaryRoot,
    'previous-release-manifest.json',
  );
  const serializedPreviousManifest = `${JSON.stringify(predecessorManifest, null, 2)}\n`;
  fs.writeFileSync(previousManifestRef, serializedPreviousManifest);

  const promoted = predecessorManifest.liveDiscovery.promotedBaseline;
  const apiRuntime = operation(
    predecessorManifest,
    'api-no-traffic-promotion',
    'api-candidate-runtime',
  );
  const apiEdge = operation(
    predecessorManifest,
    'api-no-traffic-promotion',
    'api-candidate-edge',
  );
  const identities = control.CANDIDATE_EDGE_IDENTITIES;
  return {
    predecessorManifest,
    previousManifestRef,
    context: {
      executionMode: control.SUCCESSFUL_CONTINUATION_MODE,
      executionId: 'day2-staging-academics-edge-continuation-001',
      repository: control.REPOSITORY,
      sourceSha: control.currentSourceSha(),
      environment: 'staging',
      resumeGateId: control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
      resumeOperationId: control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
      continuation: {
        previousReleaseExecutionId: predecessorManifest.releaseExecutionId,
        previousManifestRef,
        previousManifestSha256: hashText(serializedPreviousManifest),
        previousSourceSha,
      },
      liveDiscovery: {
        evidenceRef: 'evidence:successful-continuation-live-discovery',
        discoveredAt: RECORDED_AT,
        apiTrafficMode: 'candidate_no_traffic',
        servingBaseline: {
          revision: promoted.promotedRevision,
          candidateTag: promoted.promotedCandidateTag,
          imageReference: promoted.promotedImageReference,
          trafficPercent: 100,
        },
        candidate: {
          imageReference: predecessorManifest.candidate.imageReference,
          tag: predecessorManifest.candidate.tag,
          revision: predecessorManifest.candidate.revision,
          trafficPercent: 0,
          ready: true,
        },
        runtimeImages: {
          api: predecessorManifest.candidate.imageReference,
          coreWorker: predecessorManifest.candidate.imageReference,
          mediaWorker: predecessorManifest.candidate.imageReference,
          maintenanceScheduler:
            predecessorManifest.liveDiscovery.runtimeImages
              .maintenanceScheduler,
        },
        runtimeState: structuredClone(apiRuntime.apply.postApplyState),
        edgeState: {
          lineage: apiEdge.statePrecondition.lineage,
          serial: apiEdge.statePrecondition.serial,
        },
        candidateEdgeResources: {
          completeness: 'complete',
          neg: {
            present: true,
            name: identities.negName,
            region: identities.region,
            networkEndpointType: identities.networkEndpointType,
            cloudRunService: identities.cloudRunService,
            cloudRunTag: promoted.promotedCandidateTag,
          },
          backend: {
            present: true,
            name: identities.backendName,
            negName: identities.negName,
            protocol: identities.protocol,
            loadBalancingScheme: identities.loadBalancingScheme,
            securityPolicyMatchesPrimaryApi: true,
            customRequestHeaders: [identities.trustedClientIpHeader],
          },
          smokeRoute: {
            present: true,
            urlMapName: identities.urlMapName,
            publicPath: control.SMOKE_PUBLIC_PATH,
            backendName: identities.backendName,
            backendPath: control.SMOKE_BACKEND_PATH,
          },
        },
      },
      externalTfDataRoot: path.join(temporaryRoot, 'continuation-tfdata'),
      externalSavedPlanRoot: path.join(temporaryRoot, 'continuation-plans'),
    },
  };
}

function rewriteSuccessfulContinuationPredecessor(fixture, mutate) {
  mutate(fixture.predecessorManifest);
  const serialized = `${JSON.stringify(fixture.predecessorManifest, null, 2)}\n`;
  fs.writeFileSync(fixture.previousManifestRef, serialized);
  fixture.context.continuation.previousManifestSha256 = hashText(serialized);
}

function writeExternalJson(filePath, value) {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  fs.writeFileSync(filePath, serialized);
  return { serialized, sha256: hashText(serialized) };
}

function makeEdgeStateSuccessorRecoveryContext(temporaryRoot) {
  const continuationFixture = makeSuccessfulContinuationContext(temporaryRoot);
  const predecessorManifest = control.buildManifest(
    continuationFixture.context,
  );
  const edgeOperation = operation(
    predecessorManifest,
    control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
    control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
  );
  fs.mkdirSync(path.dirname(edgeOperation.savedPlanPath), { recursive: true });
  fs.writeFileSync(edgeOperation.savedPlanPath, 'prior-interrupted-edge-plan');
  const preRegistrationManifestBytes = Buffer.from(
    `${JSON.stringify(predecessorManifest, null, 2)}\n`,
  );
  const reviewBinding = writeSuccessfulContinuationReviewEvidence(
    predecessorManifest,
    edgeOperation,
    preRegistrationManifestBytes,
  );
  control.registerPlan(predecessorManifest, {
    gateId: control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
    operationId: control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
    planPath: edgeOperation.savedPlanPath,
    sourceSha: predecessorManifest.sourceSha,
    environment: predecessorManifest.environment,
    terraformRoot: edgeOperation.terraformRoot,
    lineage: edgeOperation.statePrecondition.lineage,
    serial: edgeOperation.statePrecondition.serial,
    recordedAt: RECORDED_AT,
    reviewEvidencePath: reviewBinding.reviewEvidencePath,
    planJsonPath: reviewBinding.planJsonPath,
    manifestBytes: preRegistrationManifestBytes,
  });
  const approvalEvidenceRef = path.join(
    temporaryRoot,
    'prior-v3-approval-evidence.json',
  );
  writeExternalJson(approvalEvidenceRef, {
    status: 'approved',
    releaseExecutionId: predecessorManifest.releaseExecutionId,
    gateId: control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
    operationId: control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
  });
  control.approvePlan(predecessorManifest, {
    gateId: control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
    operationId: control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
    approver: 'test-release-owner',
    approvalRef: approvalEvidenceRef,
    recordedAt: RECORDED_AT,
  });
  predecessorManifest.releaseStatus = 'in-progress';

  const priorPreApplyEvidenceRef = path.join(
    temporaryRoot,
    'prior-v3-pre-apply-evidence.json',
  );
  writeExternalJson(priorPreApplyEvidenceRef, {
    status: 'external-attempt-interrupted',
    releaseExecutionId: predecessorManifest.releaseExecutionId,
    gateId: control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
    operationId: control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
    controllerApplyAttempted: false,
  });

  const priorManifestRef = path.join(
    temporaryRoot,
    'interrupted-v3-manifest.json',
  );
  const priorManifestArtifact = writeExternalJson(
    priorManifestRef,
    predecessorManifest,
  );
  const priorEdgeState = {
    lineage: edgeOperation.statePrecondition.lineage,
    serial: edgeOperation.statePrecondition.serial,
  };
  const currentEdgeState = {
    lineage: priorEdgeState.lineage,
    serial: priorEdgeState.serial + 1,
  };
  const semantic = predecessorManifest.liveDiscovery.candidateEdgeResources;
  const stateReconciliationEvidenceRef = path.join(
    temporaryRoot,
    'edge-state-reconciliation-evidence.json',
  );
  const reconciliation = {
    schemaVersion: 1,
    classification: 'STATE_ADVANCED_WITHOUT_GOVERNED_SEMANTIC_EDGE_CHANGE',
    priorReleaseExecutionId: predecessorManifest.releaseExecutionId,
    priorEdgeState,
    currentEdgeState,
    stateCandidateNeg: structuredClone(semantic.neg),
    liveCandidateNeg: structuredClone(semantic.neg),
    stateCandidateBackend: structuredClone(semantic.backend),
    liveCandidateBackend: structuredClone(semantic.backend),
    stateCandidateSmokeRoute: structuredClone(semantic.smokeRoute),
    liveCandidateSmokeRoute: structuredClone(semantic.smokeRoute),
    servingRevision: predecessorManifest.liveDiscovery.servingBaseline.revision,
    servingTrafficPercent: 100,
    candidateRevision: predecessorManifest.liveDiscovery.candidate.revision,
    candidateTag: predecessorManifest.liveDiscovery.candidate.tag,
    candidateTrafficPercent: 0,
    candidateReady: true,
    desiredCandidateTag: predecessorManifest.candidate.tag,
    urlMapSemanticStatus: 'unchanged',
    productionMutationObserved: false,
  };
  const reconciliationArtifact = writeExternalJson(
    stateReconciliationEvidenceRef,
    reconciliation,
  );
  const approvalEvidenceBytes = fs.readFileSync(approvalEvidenceRef);
  const preApplyEvidenceBytes = fs.readFileSync(priorPreApplyEvidenceRef);
  const savedPlanBytes = fs.readFileSync(edgeOperation.savedPlanPath);
  const planJsonBytes = fs.readFileSync(reviewBinding.planJsonPath);
  const reviewEvidenceBytes = fs.readFileSync(reviewBinding.reviewEvidencePath);
  const metadata = {
    priorReleaseExecutionId: predecessorManifest.releaseExecutionId,
    priorManifestRef,
    priorManifestSha256: priorManifestArtifact.sha256,
    priorSavedPlanRef: edgeOperation.savedPlanPath,
    priorSavedPlanSha256: hashText(savedPlanBytes),
    priorPlanJsonRef: reviewBinding.planJsonPath,
    priorPlanJsonSha256: hashText(planJsonBytes),
    priorReviewEvidenceRef: reviewBinding.reviewEvidencePath,
    priorReviewEvidenceSha256: hashText(reviewEvidenceBytes),
    priorApprovalEvidenceRef: approvalEvidenceRef,
    priorApprovalEvidenceSha256: hashText(approvalEvidenceBytes),
    priorPreApplyEvidenceRef,
    priorPreApplyEvidenceSha256: hashText(preApplyEvidenceBytes),
    stateReconciliationEvidenceRef,
    stateReconciliationEvidenceSha256: reconciliationArtifact.sha256,
  };
  const liveDiscovery = structuredClone(predecessorManifest.liveDiscovery);
  liveDiscovery.evidenceRef = 'evidence:edge-state-successor-live-discovery';
  liveDiscovery.edgeState = currentEdgeState;
  return {
    predecessorManifest,
    priorManifestRef,
    reconciliation,
    context: {
      executionMode: control.EDGE_STATE_SUCCESSOR_RECOVERY_MODE,
      executionId: 'day2-staging-edge-state-successor-recovery-001',
      repository: control.REPOSITORY,
      sourceSha: control.currentSourceSha(),
      environment: 'staging',
      resumeGateId: control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
      resumeOperationId: control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
      edgeStateSuccessorRecovery: metadata,
      liveDiscovery,
      externalTfDataRoot: path.join(temporaryRoot, 'successor-tfdata'),
      externalSavedPlanRoot: path.join(temporaryRoot, 'successor-plans'),
    },
  };
}

function rewriteEdgeStateSuccessorPredecessor(fixture, mutate) {
  mutate(fixture.predecessorManifest);
  const artifact = writeExternalJson(
    fixture.priorManifestRef,
    fixture.predecessorManifest,
  );
  fixture.context.edgeStateSuccessorRecovery.priorManifestSha256 =
    artifact.sha256;
}

function rewriteStateReconciliationEvidence(fixture, mutate) {
  mutate(fixture.reconciliation);
  const artifact = writeExternalJson(
    fixture.context.edgeStateSuccessorRecovery.stateReconciliationEvidenceRef,
    fixture.reconciliation,
  );
  fixture.context.edgeStateSuccessorRecovery.stateReconciliationEvidenceSha256 =
    artifact.sha256;
}

function prepareCandidateEdgeRegistration(
  manifest,
  uniquePlanText = 'fresh-candidate-edge-plan',
) {
  const target = operation(
    manifest,
    control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
    control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
  );
  fs.mkdirSync(path.dirname(target.savedPlanPath), { recursive: true });
  fs.writeFileSync(target.savedPlanPath, uniquePlanText);
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  const reviewBinding = writeSuccessfulContinuationReviewEvidence(
    manifest,
    target,
    manifestBytes,
  );
  return {
    target,
    reviewBinding,
    options: {
      gateId: control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
      operationId: control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
      planPath: target.savedPlanPath,
      sourceSha: manifest.sourceSha,
      environment: manifest.environment,
      terraformRoot: target.terraformRoot,
      lineage: target.statePrecondition.lineage,
      serial: target.statePrecondition.serial,
      recordedAt: RECORDED_AT,
      reviewEvidencePath: reviewBinding.reviewEvidencePath,
      planJsonPath: reviewBinding.planJsonPath,
      manifestBytes,
    },
  };
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
      Object.hasOwn(manifest.liveDiscovery, 'promotedBaseline'),
      false,
    );
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

test('normal v1 preserves a previous promoted baseline through workers and rolls its serving revision forward for the new candidate', () => {
  withTemporaryRoot((temporaryRoot) => {
    const context = makePromotedBaselineContext(temporaryRoot);
    const manifest = control.buildManifest(context);
    const promoted = context.liveDiscovery.promotedBaseline;
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
    const api = operation(
      manifest,
      'api-no-traffic-promotion',
      'api-candidate-runtime',
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

    assert.equal(manifest.manifestVersion, 1);
    assert.equal(Object.hasOwn(manifest, 'executionMode'), false);
    assert.equal(manifest.liveDiscovery.apiTrafficMode, 'candidate_promoted');
    assert.equal(
      Object.hasOwn(manifest.liveDiscovery, 'stableApiRevision'),
      false,
    );
    assert.deepEqual(manifest.liveDiscovery.promotedBaseline, promoted);
    assert.equal(
      promoted.promotedCandidateTag,
      control.expectedCandidateTag(CANDIDATE_IMAGE, 1),
    );
    assert.doesNotThrow(() =>
      control.validateManifest(structuredClone(manifest)),
    );

    assert.deepEqual(manifest.candidate, {
      imageReference: NEXT_CANDIDATE_IMAGE,
      tag: control.expectedCandidateTag(NEXT_CANDIDATE_IMAGE),
      revision: `moazez-staging-api-${control.expectedCandidateTag(NEXT_CANDIDATE_IMAGE)}`,
    });
    assert.notEqual(
      promoted.promotedImageReference,
      manifest.candidate.imageReference,
    );
    assert.notEqual(promoted.promotedCandidateTag, manifest.candidate.tag);
    assert.notEqual(promoted.promotedRevision, manifest.candidate.revision);

    assert.deepEqual(core.requiredVariables, {
      api_image_reference: CANDIDATE_IMAGE,
      core_worker_image_reference: NEXT_CANDIDATE_IMAGE,
      media_worker_image_reference: CANDIDATE_IMAGE,
      maintenance_scheduler_image_reference: CANDIDATE_IMAGE,
      api_traffic_mode: 'candidate_promoted',
      api_stable_revision: promoted.previousStableRevision,
      api_candidate_tag: promoted.promotedCandidateTag,
    });
    assert.deepEqual(core.expectedResourceAddressAllowlist, [
      control.RUNTIME_RESOURCE_ADDRESSES.coreWorker,
    ]);
    assert.deepEqual(core.allowedAttributeChanges, {
      [control.RUNTIME_RESOURCE_ADDRESSES.coreWorker]: [
        'template[0].containers[0].image',
      ],
    });

    assert.deepEqual(media.requiredVariables, {
      api_image_reference: CANDIDATE_IMAGE,
      core_worker_image_reference: NEXT_CANDIDATE_IMAGE,
      media_worker_image_reference: NEXT_CANDIDATE_IMAGE,
      maintenance_scheduler_image_reference: CANDIDATE_IMAGE,
      api_traffic_mode: 'candidate_promoted',
      api_stable_revision: promoted.previousStableRevision,
      api_candidate_tag: promoted.promotedCandidateTag,
    });
    assert.deepEqual(media.expectedResourceAddressAllowlist, [
      control.RUNTIME_RESOURCE_ADDRESSES.mediaWorker,
    ]);
    assert.deepEqual(media.allowedAttributeChanges, {
      [control.RUNTIME_RESOURCE_ADDRESSES.mediaWorker]: [
        'template[0].containers[0].image',
      ],
    });

    assert.deepEqual(api.requiredVariables, {
      api_image_reference: NEXT_CANDIDATE_IMAGE,
      core_worker_image_reference: NEXT_CANDIDATE_IMAGE,
      media_worker_image_reference: NEXT_CANDIDATE_IMAGE,
      maintenance_scheduler_image_reference: CANDIDATE_IMAGE,
      api_traffic_mode: 'candidate_no_traffic',
      api_stable_revision: promoted.promotedRevision,
      api_candidate_tag: manifest.candidate.tag,
    });
    assert.notEqual(
      api.requiredVariables.api_stable_revision,
      promoted.previousStableRevision,
    );
    assert.notEqual(
      api.requiredVariables.api_candidate_tag,
      promoted.promotedCandidateTag,
    );
    assert.deepEqual(api.verificationExpectation, {
      image: NEXT_CANDIDATE_IMAGE,
      revision: manifest.candidate.revision,
      candidateTag: manifest.candidate.tag,
      stablePercent: 100,
      candidatePercent: 0,
    });

    assert.equal(
      maintenance.requiredVariables.api_traffic_mode,
      'candidate_no_traffic',
    );
    assert.equal(
      maintenance.requiredVariables.api_stable_revision,
      promoted.promotedRevision,
    );
    assert.equal(
      maintenance.requiredVariables.api_candidate_tag,
      manifest.candidate.tag,
    );
    assert.equal(
      traffic.requiredVariables.api_traffic_mode,
      'candidate_promoted',
    );
    assert.equal(
      traffic.requiredVariables.api_stable_revision,
      promoted.promotedRevision,
    );
    assert.equal(
      traffic.requiredVariables.api_candidate_tag,
      manifest.candidate.tag,
    );
    assert.deepEqual(traffic.verificationExpectation, {
      image: NEXT_CANDIDATE_IMAGE,
      revision: manifest.candidate.revision,
      candidateTag: manifest.candidate.tag,
      stablePercent: 0,
      candidatePercent: 100,
    });

    const tupleTamper = structuredClone(manifest);
    operation(
      tupleTamper,
      'core-worker-promotion',
      'core-worker-runtime',
    ).requiredVariables.api_traffic_mode = 'normal';
    assert.throws(() => control.validateManifest(tupleTamper), {
      code: 'MANIFEST_SPEC_MISMATCH',
    });
  });
});

test('normal v1 rejects contradictory previous promoted baselines', () => {
  withTemporaryRoot((temporaryRoot) => {
    const mutations = [
      {
        name: 'previous stable traffic is not zero',
        apply(context) {
          context.liveDiscovery.promotedBaseline.previousStableTrafficPercent = 1;
        },
      },
      {
        name: 'promoted traffic is not one hundred',
        apply(context) {
          context.liveDiscovery.promotedBaseline.promotedTrafficPercent = 99;
        },
      },
      {
        name: 'promoted tag is missing',
        apply(context) {
          delete context.liveDiscovery.promotedBaseline.promotedCandidateTag;
        },
      },
      {
        name: 'promoted revision does not match its tag',
        apply(context) {
          context.liveDiscovery.promotedBaseline.promotedRevision =
            'moazez-staging-api-candidate-000000000000';
        },
      },
      {
        name: 'promoted image does not match the live API image',
        apply(context) {
          context.liveDiscovery.promotedBaseline.promotedImageReference =
            NEXT_CANDIDATE_IMAGE;
        },
      },
      {
        name: 'promoted tag is not derived from the promoted image',
        apply(context) {
          const unrelatedTag = control.expectedCandidateTag(
            stagingImage('9'),
            1,
          );
          context.liveDiscovery.promotedBaseline.promotedCandidateTag =
            unrelatedTag;
          context.liveDiscovery.promotedBaseline.promotedRevision = `moazez-staging-api-${unrelatedTag}`;
        },
      },
      {
        name: 'promoted and new candidate images are identical',
        apply(context) {
          const repeatedImageTag = control.expectedCandidateTag(
            NEXT_CANDIDATE_IMAGE,
            1,
          );
          context.liveDiscovery.runtimeImages.api = NEXT_CANDIDATE_IMAGE;
          context.liveDiscovery.promotedBaseline.promotedImageReference =
            NEXT_CANDIDATE_IMAGE;
          context.liveDiscovery.promotedBaseline.promotedCandidateTag =
            repeatedImageTag;
          context.liveDiscovery.promotedBaseline.promotedRevision = `moazez-staging-api-${repeatedImageTag}`;
        },
      },
      {
        name: 'previous stable and promoted revisions are identical',
        apply(context) {
          context.liveDiscovery.promotedBaseline.previousStableRevision =
            context.liveDiscovery.promotedBaseline.promotedRevision;
        },
      },
      {
        name: 'promoted revision belongs to the wrong service',
        apply(context) {
          context.liveDiscovery.promotedBaseline.promotedRevision = `moazez-staging-core-${context.liveDiscovery.promotedBaseline.promotedCandidateTag}`;
        },
      },
      {
        name: 'previous promoted and new candidate tags are conflated',
        apply(context) {
          context.liveDiscovery.promotedBaseline.promotedCandidateTag =
            context.candidateTag;
          context.liveDiscovery.promotedBaseline.promotedRevision = `moazez-staging-api-${context.candidateTag}`;
        },
      },
      {
        name: 'promoted baseline is declared under normal traffic mode',
        apply(context) {
          context.liveDiscovery.apiTrafficMode = 'normal';
          context.liveDiscovery.stableApiRevision =
            context.liveDiscovery.promotedBaseline.previousStableRevision;
        },
      },
    ];

    for (const mutation of mutations) {
      const context = makePromotedBaselineContext(temporaryRoot);
      mutation.apply(context);
      assert.throws(
        () => control.buildManifest(context),
        control.DeploymentControlError,
        mutation.name,
      );
    }
  });
});

test('normal v1 promoted-baseline construction fails closed unless Candidate Edge is proven absent', () => {
  withTemporaryRoot((temporaryRoot) => {
    assert.doesNotThrow(() =>
      control.buildManifest(makePromotedBaselineContext(temporaryRoot)),
    );

    const missing = makePromotedBaselineContext(temporaryRoot);
    delete missing.liveDiscovery.candidateEdgeResources;
    assert.throws(() => control.buildManifest(missing), {
      code: 'CANDIDATE_EDGE_PREFLIGHT_REQUIRED',
    });

    for (const field of [
      'candidateNegPresent',
      'candidateBackendPresent',
      'candidateSmokeRoutePresent',
    ]) {
      const retained = makePromotedBaselineContext(temporaryRoot);
      retained.liveDiscovery.candidateEdgeResources[field] = true;
      assert.throws(() => control.buildManifest(retained), {
        code: 'CANDIDATE_EDGE_PREFLIGHT_UNSAFE',
      });
    }

    assert.doesNotThrow(() =>
      control.buildManifest(makeContext(temporaryRoot)),
    );
  });
});

test('successful Edge continuation imports passed work without replay and builds only the unresolved remainder', () => {
  withTemporaryRoot((temporaryRoot) => {
    const fixture = makeSuccessfulContinuationContext(temporaryRoot);
    for (const gate of fixture.predecessorManifest.gates) {
      for (const candidateOperation of gate.operations) {
        if (candidateOperation.kind === 'terraform') {
          candidateOperation.absoluteTerraformRoot = path.join(
            temporaryRoot,
            'retained-predecessor-checkout',
            ...candidateOperation.terraformRoot.split('/'),
          );
        }
      }
    }
    rewriteSuccessfulContinuationPredecessor(fixture, () => {});
    const manifest = control.buildManifest(fixture.context);
    const edge = operation(
      manifest,
      control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
      control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
    );
    const maintenance = operation(
      manifest,
      'maintenance-scheduler-promotion',
      'maintenance-scheduler-runtime',
    );

    assert.equal(manifest.manifestVersion, 3);
    assert.equal(manifest.executionMode, control.SUCCESSFUL_CONTINUATION_MODE);
    assert.notEqual(
      manifest.releaseExecutionId,
      manifest.continuation.previousReleaseExecutionId,
    );
    assert.notEqual(
      manifest.sourceSha,
      manifest.continuation.previousSourceSha,
    );
    assert.deepEqual(
      manifest.gates.map((gate) => gate.id),
      control.SUCCESSFUL_CONTINUATION_GATE_IDS,
    );
    assert.deepEqual(
      manifest.gates.flatMap((gate) =>
        gate.operations.map((candidateOperation) => candidateOperation.id),
      ),
      [
        control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
        'maintenance-scheduler-runtime',
        'protected-candidate-smoke',
        'api-traffic-promotion',
      ],
    );
    assert.equal(
      manifest.gates.some((gate) =>
        gate.operations.some((candidateOperation) =>
          [
            'core-worker-runtime',
            'media-worker-runtime',
            'api-candidate-runtime',
          ].includes(candidateOperation.id),
        ),
      ),
      false,
    );
    assert.deepEqual(
      manifest.predecessorEvidence.completedStages.map((stage) => stage.id),
      control.RECOVERY_PREDECESSOR_STAGE_IDS,
    );
    assert.deepEqual(
      manifest.predecessorEvidence.importedPassedOperations.map(
        (candidateOperation) => candidateOperation.operationId,
      ),
      ['core-worker-runtime', 'media-worker-runtime', 'api-candidate-runtime'],
    );
    assert.equal(
      manifest.predecessorEvidence.importedPassedOperations.every(
        (candidateOperation) =>
          candidateOperation.status === 'passed' &&
          candidateOperation.planEvidence.status === 'registered' &&
          candidateOperation.planEvidence.reviewed === true &&
          candidateOperation.approval.status === 'approved' &&
          candidateOperation.apply.status === 'succeeded' &&
          candidateOperation.liveVerification.status === 'passed',
      ),
      true,
    );
    assert.equal(
      manifest.predecessorEvidence.importedPassedOperations.every(
        (candidateOperation) =>
          manifest.blockedSavedPlanHashes.includes(
            candidateOperation.planEvidence.sha256,
          ),
      ),
      true,
    );

    assert.deepEqual(edge.expectedResourceAddressAllowlist, [
      ...control.EDGE_CANDIDATE_RECONCILIATION_RESOURCE_ADDRESSES,
    ]);
    assert.deepEqual(edge.expectedResourceActions, {
      [control.EDGE_CANDIDATE_RECONCILIATION_RESOURCE_ADDRESSES[0]]: [
        'delete',
        'create',
      ],
      [control.EDGE_CANDIDATE_RECONCILIATION_RESOURCE_ADDRESSES[1]]: ['update'],
    });
    assert.equal(
      edge.expectedResourceAddressAllowlist.includes(
        control.EDGE_CANDIDATE_RESOURCE_ADDRESSES[2],
      ),
      false,
    );
    assert.deepEqual(edge.allowedAttributeChanges, {
      [control.EDGE_CANDIDATE_RECONCILIATION_RESOURCE_ADDRESSES[0]]: [
        'cloud_run[0].tag',
      ],
      [control.EDGE_CANDIDATE_RECONCILIATION_RESOURCE_ADDRESSES[1]]: [
        'backend[0].group',
      ],
    });
    assert.deepEqual(edge.allowedComputedAfterApplyChanges, {
      [control.EDGE_CANDIDATE_RECONCILIATION_RESOURCE_ADDRESSES[0]]: [
        'id',
        'self_link',
        'network',
        'psc_data',
      ],
      [control.EDGE_CANDIDATE_RECONCILIATION_RESOURCE_ADDRESSES[1]]: [
        'backend[0].max_connections',
        'backend[0].max_connections_per_endpoint',
        'backend[0].max_connections_per_instance',
        'backend[0].max_rate',
        'backend[0].max_rate_per_endpoint',
        'backend[0].max_rate_per_instance',
        'backend[0].max_utilization',
        'fingerprint',
      ],
    });
    assert.deepEqual(edge.expectedResourcePlanIdentities, {
      [control.EDGE_CANDIDATE_RECONCILIATION_RESOURCE_ADDRESSES[0]]: {
        mode: 'managed',
        type: 'google_compute_region_network_endpoint_group',
        providerName: 'registry.terraform.io/hashicorp/google',
      },
      [control.EDGE_CANDIDATE_RECONCILIATION_RESOURCE_ADDRESSES[1]]: {
        mode: 'managed',
        type: 'google_compute_backend_service',
        providerName: 'registry.terraform.io/hashicorp/google',
      },
    });
    assert.equal(edge.planReviewRequirements.required, true);
    assert.equal(edge.planReviewRequirements.compatiblePlanJsonFormatMajor, 1);
    assert.deepEqual(edge.deterministicReviewEvidence, {
      status: 'not-reviewed',
      reviewEvidenceSha256: null,
      reviewedManifestSha256: null,
      immutableOperationSpecificationSha256: null,
      planJsonSha256: null,
      savedPlanSha256: null,
    });
    assert.deepEqual(edge.statePrecondition, {
      lineage: fixture.context.liveDiscovery.edgeState.lineage,
      serial: fixture.context.liveDiscovery.edgeState.serial,
      boundFromOperationId: null,
      status: 'bound',
    });
    assert.deepEqual(maintenance.statePrecondition, {
      lineage: fixture.context.liveDiscovery.runtimeState.lineage,
      serial: fixture.context.liveDiscovery.runtimeState.serial,
      boundFromOperationId: null,
      status: 'bound',
    });
    assert.equal(
      maintenance.requiredVariables.api_traffic_mode,
      'candidate_no_traffic',
    );
    assert.equal(
      maintenance.requiredVariables.api_stable_revision,
      fixture.context.liveDiscovery.servingBaseline.revision,
    );
    assert.equal(
      maintenance.requiredVariables.api_candidate_tag,
      fixture.context.liveDiscovery.candidate.tag,
    );
    assert.equal(
      manifest.candidateEdgeCleanupTemplate.authoritativeReleaseGate,
      false,
    );
    assert.equal(
      manifest.candidateEdgeCleanupTemplate.requiresSeparatePostReleaseApproval,
      true,
    );
    assert.doesNotThrow(() =>
      control.validateManifest(structuredClone(manifest)),
    );
  });
});

test('successful continuation rejects predecessor identity, manifest bytes, source, and incomplete API Runtime evidence', () => {
  withTemporaryRoot((temporaryRoot) => {
    const crlfContractFixture =
      makeSuccessfulContinuationContext(temporaryRoot);
    rewriteSuccessfulContinuationPredecessor(
      crlfContractFixture,
      (manifest) => {
        manifest.authoritativeContract.sha256 = CRLF_RELEASE_CONTRACT_SHA256;
      },
    );
    assert.doesNotThrow(() =>
      control.buildManifest(crlfContractFixture.context),
    );

    const contextMutations = [
      {
        name: 'manifest bytes hash mismatch',
        code: 'CONTINUATION_PREDECESSOR_EVIDENCE_INVALID',
        apply(fixture) {
          fixture.context.continuation.previousManifestSha256 = 'f'.repeat(64);
        },
      },
      {
        name: 'previous execution mismatch',
        code: 'CONTINUATION_PREDECESSOR_EVIDENCE_INVALID',
        apply(fixture) {
          fixture.context.continuation.previousReleaseExecutionId =
            'day2-staging-unrelated-execution';
        },
      },
      {
        name: 'previous source mismatch',
        code: 'CONTINUATION_PREDECESSOR_EVIDENCE_INVALID',
        apply(fixture) {
          fixture.context.continuation.previousSourceSha = 'e'.repeat(40);
        },
      },
      {
        name: 'source binding is reused',
        code: 'CONTINUATION_SOURCE_REUSE_FORBIDDEN',
        apply(fixture) {
          fixture.context.continuation.previousSourceSha =
            fixture.context.sourceSha;
        },
      },
      {
        name: 'execution identity is reused',
        code: 'CONTINUATION_EXECUTION_ID_REUSE',
        apply(fixture) {
          fixture.context.executionId =
            fixture.context.continuation.previousReleaseExecutionId;
        },
      },
    ];
    for (const mutation of contextMutations) {
      const fixture = makeSuccessfulContinuationContext(temporaryRoot);
      mutation.apply(fixture);
      assert.throws(() => control.buildManifest(fixture.context), {
        code: mutation.code,
      });
    }

    const inconsistentCheckout =
      makeSuccessfulContinuationContext(temporaryRoot);
    rewriteSuccessfulContinuationPredecessor(
      inconsistentCheckout,
      (manifest) => {
        const edgeOperation = operation(
          manifest,
          'api-no-traffic-promotion',
          'api-candidate-edge',
        );
        edgeOperation.absoluteTerraformRoot = path.join(
          temporaryRoot,
          'different-checkout',
          ...edgeOperation.terraformRoot.split('/'),
        );
      },
    );
    assert.throws(() => control.buildManifest(inconsistentCheckout.context), {
      code: 'CONTINUATION_PREDECESSOR_EVIDENCE_INVALID',
    });

    const unverified = makeSuccessfulContinuationContext(temporaryRoot);
    rewriteSuccessfulContinuationPredecessor(unverified, (manifest) => {
      const apiRuntime = operation(
        manifest,
        'api-no-traffic-promotion',
        'api-candidate-runtime',
      );
      apiRuntime.status = 'applied-awaiting-live-verification';
      apiRuntime.liveVerification = {
        status: 'pending',
        evidenceRef: null,
        recordedAt: null,
        observations: null,
      };
      operation(
        manifest,
        'maintenance-scheduler-promotion',
        'maintenance-scheduler-runtime',
      ).statePrecondition = {
        lineage: null,
        serial: null,
        boundFromOperationId: 'api-candidate-runtime',
        status: 'awaiting-predecessor',
      };
    });
    assert.throws(() => control.buildManifest(unverified.context), {
      code: 'CONTINUATION_BOUNDARY_UNSUPPORTED',
    });

    const contradictoryVerification =
      makeSuccessfulContinuationContext(temporaryRoot);
    rewriteSuccessfulContinuationPredecessor(
      contradictoryVerification,
      (manifest) => {
        operation(
          manifest,
          'api-no-traffic-promotion',
          'api-candidate-runtime',
        ).liveVerification.observations.observedCandidatePercent = 1;
      },
    );
    assert.throws(
      () => control.buildManifest(contradictoryVerification.context),
      { code: 'MANIFEST_SPEC_MISMATCH' },
    );
  });
});

test('successful continuation live discovery rejects traffic, readiness, identity, image, and state contradictions', () => {
  withTemporaryRoot((temporaryRoot) => {
    const mutations = [
      (context) => {
        context.liveDiscovery.apiTrafficMode = 'candidate_promoted';
      },
      (context) => {
        context.liveDiscovery.servingBaseline.trafficPercent = 99;
      },
      (context) => {
        context.liveDiscovery.candidate.trafficPercent = 1;
      },
      (context) => {
        context.liveDiscovery.candidate.ready = false;
      },
      (context) => {
        context.liveDiscovery.candidate.imageReference = stagingImage('a');
      },
      (context) => {
        context.liveDiscovery.candidate.tag =
          context.liveDiscovery.servingBaseline.candidateTag;
      },
      (context) => {
        context.liveDiscovery.candidate.revision =
          'moazez-staging-api-candidate-000000000000';
      },
      (context) => {
        context.liveDiscovery.runtimeImages.coreWorker = stagingImage('b');
      },
      (context) => {
        context.liveDiscovery.runtimeState.serial += 1;
      },
      (context) => {
        context.liveDiscovery.edgeState.serial += 1;
      },
    ];
    for (const mutate of mutations) {
      const fixture = makeSuccessfulContinuationContext(temporaryRoot);
      mutate(fixture.context);
      assert.throws(
        () => control.buildManifest(fixture.context),
        control.DeploymentControlError,
      );
    }
  });
});

test('successful continuation requires a complete exact retained Candidate Edge security posture', () => {
  withTemporaryRoot((temporaryRoot) => {
    const mutations = [
      (edge) => {
        delete edge.backend;
      },
      (edge) => {
        edge.completeness = 'partial';
      },
      (edge, context) => {
        edge.neg.cloudRunTag = context.liveDiscovery.candidate.tag;
      },
      (edge) => {
        edge.neg.cloudRunService = 'moazez-production-api';
      },
      (edge) => {
        edge.backend.negName = 'unrelated-neg';
      },
      (edge) => {
        edge.backend.securityPolicyMatchesPrimaryApi = false;
      },
      (edge) => {
        edge.backend.customRequestHeaders = [];
      },
      (edge) => {
        edge.smokeRoute.publicPath = '/unapproved';
      },
      (edge) => {
        edge.smokeRoute.backendPath = '/api/v1/unapproved';
      },
      (edge) => {
        edge.smokeRoute.urlMapName = 'parallel-url-map';
      },
    ];
    for (const mutate of mutations) {
      const fixture = makeSuccessfulContinuationContext(temporaryRoot);
      mutate(
        fixture.context.liveDiscovery.candidateEdgeResources,
        fixture.context,
      );
      assert.throws(
        () => control.buildManifest(fixture.context),
        control.DeploymentControlError,
      );
    }
  });
});

test('successful continuation reconciliation guards exact actions, addresses, attributes, and Edge state binding', () => {
  withTemporaryRoot((temporaryRoot) => {
    const fixture = makeSuccessfulContinuationContext(temporaryRoot);
    const manifest = control.buildManifest(fixture.context);
    const edge = operation(
      manifest,
      control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
      control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
    );
    const serializedContract = JSON.stringify({
      addresses: edge.expectedResourceAddressAllowlist,
      attributes: edge.allowedAttributeChanges,
      computed: edge.allowedComputedAfterApplyChanges,
    });
    for (const forbidden of [
      'dns',
      'global_address',
      'certificate',
      'target_https_proxy',
      'forwarding_rule',
      'security_policy',
      'ingress',
      'url_map',
    ]) {
      assert.equal(serializedContract.includes(forbidden), false);
    }

    const unexpectedAddress = structuredClone(manifest);
    operation(
      unexpectedAddress,
      control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
      control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
    ).expectedResourceAddressAllowlist.push(
      'module.edge_environment.google_compute_global_forwarding_rule.https',
    );
    assert.throws(() => control.validateManifest(unexpectedAddress), {
      code: 'MANIFEST_SPEC_MISMATCH',
    });

    const unrelatedAttribute = structuredClone(manifest);
    operation(
      unrelatedAttribute,
      control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
      control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
    ).allowedAttributeChanges[
      control.EDGE_CANDIDATE_RECONCILIATION_RESOURCE_ADDRESSES[1]
    ].push('security_policy');
    assert.throws(() => control.validateManifest(unrelatedAttribute), {
      code: 'MANIFEST_SPEC_MISMATCH',
    });

    const urlMapMutation = structuredClone(manifest);
    operation(
      urlMapMutation,
      control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
      control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
    ).expectedResourceActions[control.EDGE_CANDIDATE_RESOURCE_ADDRESSES[2]] = [
      'update',
    ];
    assert.throws(() => control.validateManifest(urlMapMutation), {
      code: 'MANIFEST_SPEC_MISMATCH',
    });

    fs.mkdirSync(path.dirname(edge.savedPlanPath), { recursive: true });
    fs.writeFileSync(edge.savedPlanPath, 'continuation-edge-plan');
    for (const binding of [
      {
        lineage: 'different-edge-lineage',
        serial: edge.statePrecondition.serial,
      },
      {
        lineage: edge.statePrecondition.lineage,
        serial: edge.statePrecondition.serial + 1,
      },
    ]) {
      assert.throws(
        () =>
          control.registerPlan(structuredClone(manifest), {
            gateId: control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
            operationId: control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
            planPath: edge.savedPlanPath,
            sourceSha: manifest.sourceSha,
            environment: manifest.environment,
            terraformRoot: edge.terraformRoot,
            lineage: binding.lineage,
            serial: binding.serial,
            recordedAt: RECORDED_AT,
          }),
        { code: 'PLAN_BINDING_MISMATCH' },
      );
    }
  });
});

test('successful continuation preserves separate Edge and Runtime successor chains through final traffic promotion', () => {
  withTemporaryRoot((temporaryRoot) => {
    const fixture = makeSuccessfulContinuationContext(temporaryRoot);
    const manifest = control.buildManifest(fixture.context);
    applyAndVerifyTerraform(
      manifest,
      control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
      control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
      'continuation-edge-reconciliation-plan',
      {
        observedCandidateTag: manifest.candidate.tag,
        observedPublicPath: control.SMOKE_PUBLIC_PATH,
        observedBackendPath: control.SMOKE_BACKEND_PATH,
      },
    );
    const edge = operation(
      manifest,
      control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
      control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
    );
    const maintenance = operation(
      manifest,
      'maintenance-scheduler-promotion',
      'maintenance-scheduler-runtime',
    );
    assert.equal(
      edge.apply.postApplyState.lineage,
      fixture.context.liveDiscovery.edgeState.lineage,
    );
    assert.equal(
      maintenance.statePrecondition.lineage,
      fixture.context.liveDiscovery.runtimeState.lineage,
    );
    assert.equal(
      maintenance.statePrecondition.serial,
      fixture.context.liveDiscovery.runtimeState.serial,
    );
    assert.notEqual(
      maintenance.statePrecondition.lineage,
      edge.apply.postApplyState.lineage,
    );

    passThroughMaintenance(manifest);
    const traffic = operation(
      manifest,
      'traffic-promotion',
      'api-traffic-promotion',
    );
    assert.deepEqual(traffic.statePrecondition, {
      lineage: maintenance.apply.postApplyState.lineage,
      serial: maintenance.apply.postApplyState.serial,
      boundFromOperationId: 'maintenance-scheduler-runtime',
      status: 'bound',
    });
    passThroughProtectedSmoke(manifest);
    applyAndVerifyTerraform(
      manifest,
      'traffic-promotion',
      'api-traffic-promotion',
      'continuation-traffic-promotion-plan',
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
    assert.doesNotThrow(() => control.validateManifest(manifest));
  });
});

test('edge state-successor recovery v4 deterministically resumes only the governed unresolved remainder', () => {
  withTemporaryRoot((temporaryRoot) => {
    const fixture = makeEdgeStateSuccessorRecoveryContext(temporaryRoot);
    const first = control.buildManifest(fixture.context);
    const second = control.buildManifest(structuredClone(fixture.context));
    const operationIds = first.gates.flatMap((gate) =>
      gate.operations.map((candidateOperation) => candidateOperation.id),
    );
    const priorEdge = operation(
      fixture.predecessorManifest,
      control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
      control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
    );
    const currentEdge = operation(
      first,
      control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
      control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
    );

    assert.equal(first.manifestVersion, 4);
    assert.equal(
      first.executionMode,
      control.EDGE_STATE_SUCCESSOR_RECOVERY_MODE,
    );
    assert.equal(
      first.resumeGateId,
      control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
    );
    assert.equal(
      first.resumeOperationId,
      control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
    );
    assert.deepEqual(first, second);
    assert.deepEqual(
      first.gates.map((gate) => gate.id),
      control.EDGE_STATE_SUCCESSOR_RECOVERY_GATE_IDS,
    );
    assert.deepEqual(operationIds, [
      'api-candidate-edge-reconciliation',
      'maintenance-scheduler-runtime',
      'protected-candidate-smoke',
      'api-traffic-promotion',
    ]);
    for (const replayOperationId of [
      'migration',
      'core-worker-runtime',
      'media-worker-runtime',
      'api-candidate-runtime',
    ]) {
      assert.equal(operationIds.includes(replayOperationId), false);
    }
    assert.equal(
      currentEdge.statePrecondition.lineage,
      priorEdge.statePrecondition.lineage,
    );
    assert.equal(priorEdge.statePrecondition.serial, 9);
    assert.equal(currentEdge.statePrecondition.serial, 10);
    assert.deepEqual(
      first.liveDiscovery.candidateEdgeResources,
      fixture.predecessorManifest.liveDiscovery.candidateEdgeResources,
    );
    assert.equal(
      first.blockedSavedPlanHashes.includes(
        fixture.context.edgeStateSuccessorRecovery.priorSavedPlanSha256,
      ),
      true,
    );
    assert.deepEqual(currentEdge.expectedResourceAddressAllowlist, [
      ...control.EDGE_CANDIDATE_RECONCILIATION_RESOURCE_ADDRESSES,
    ]);
    assert.deepEqual(
      currentEdge.planReviewRequirements,
      priorEdge.planReviewRequirements,
    );
    assert.deepEqual(
      currentEdge.expectedResourcePlanIdentities,
      priorEdge.expectedResourcePlanIdentities,
    );
    assert.deepEqual(
      currentEdge.allowedProviderNormalizations,
      priorEdge.allowedProviderNormalizations,
    );
    assert.deepEqual(
      currentEdge.allowedRefreshOnlyDrift,
      priorEdge.allowedRefreshOnlyDrift,
    );
    assert.doesNotThrow(() => control.validateManifest(structuredClone(first)));
  });
});

test('edge state-successor recovery v4 preserves single-use Edge and Runtime successor chains through completion', () => {
  withTemporaryRoot((temporaryRoot) => {
    const fixture = makeEdgeStateSuccessorRecoveryContext(temporaryRoot);
    const manifest = control.buildManifest(fixture.context);
    applyAndVerifyTerraform(
      manifest,
      control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
      control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
      'fresh-v4-edge-reconciliation-plan',
      {
        observedCandidateTag: manifest.candidate.tag,
        observedPublicPath: control.SMOKE_PUBLIC_PATH,
        observedBackendPath: control.SMOKE_BACKEND_PATH,
      },
    );
    passThroughMaintenance(manifest);
    passThroughProtectedSmoke(manifest);
    applyAndVerifyTerraform(
      manifest,
      'traffic-promotion',
      'api-traffic-promotion',
      'fresh-v4-traffic-promotion-plan',
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
    assert.doesNotThrow(() => control.validateManifest(manifest));
  });
});

test('edge state-successor recovery v4 rejects unsafe state, traffic, runtime, and Edge semantic baselines', () => {
  withTemporaryRoot((temporaryRoot) => {
    const fixture = makeEdgeStateSuccessorRecoveryContext(temporaryRoot);
    const cases = [
      {
        name: 'same Edge serial',
        code: 'EDGE_STATE_SUCCESSOR_INVALID',
        apply(context) {
          context.liveDiscovery.edgeState.serial =
            fixture.predecessorManifest.liveDiscovery.edgeState.serial;
        },
      },
      {
        name: 'lower Edge serial',
        code: 'EDGE_STATE_SUCCESSOR_INVALID',
        apply(context) {
          context.liveDiscovery.edgeState.serial =
            fixture.predecessorManifest.liveDiscovery.edgeState.serial - 1;
        },
      },
      {
        name: 'different Edge lineage',
        code: 'EDGE_STATE_SUCCESSOR_INVALID',
        apply(context) {
          context.liveDiscovery.edgeState.lineage = 'different-edge-lineage';
        },
      },
      {
        name: 'Candidate NEG name changed',
        apply(context) {
          context.liveDiscovery.candidateEdgeResources.neg.name =
            'unrelated-candidate-neg';
        },
      },
      {
        name: 'desired Candidate tag already live',
        apply(context) {
          context.liveDiscovery.candidateEdgeResources.neg.cloudRunTag =
            context.liveDiscovery.candidate.tag;
        },
      },
      {
        name: 'Candidate Backend changed',
        apply(context) {
          context.liveDiscovery.candidateEdgeResources.backend.name =
            'unrelated-candidate-backend';
        },
      },
      {
        name: 'Candidate Backend points to another NEG',
        apply(context) {
          context.liveDiscovery.candidateEdgeResources.backend.negName =
            'unrelated-candidate-neg';
        },
      },
      {
        name: 'Candidate Edge partial',
        apply(context) {
          context.liveDiscovery.candidateEdgeResources.completeness = 'partial';
        },
      },
      {
        name: 'serving traffic changed',
        apply(context) {
          context.liveDiscovery.servingBaseline.trafficPercent = 99;
        },
      },
      {
        name: 'candidate traffic changed',
        apply(context) {
          context.liveDiscovery.candidate.trafficPercent = 1;
        },
      },
      {
        name: 'candidate is not Ready',
        apply(context) {
          context.liveDiscovery.candidate.ready = false;
        },
      },
      {
        name: 'Cloud Armor posture changed',
        apply(context) {
          context.liveDiscovery.candidateEdgeResources.backend.securityPolicyMatchesPrimaryApi = false;
        },
      },
      {
        name: 'trusted client-IP header changed',
        apply(context) {
          context.liveDiscovery.candidateEdgeResources.backend.customRequestHeaders =
            [];
        },
      },
      {
        name: 'smoke route path changed',
        apply(context) {
          context.liveDiscovery.candidateEdgeResources.smokeRoute.publicPath =
            '/unapproved';
        },
      },
      {
        name: 'URL Map identity changed',
        apply(context) {
          context.liveDiscovery.candidateEdgeResources.smokeRoute.urlMapName =
            'unrelated-url-map';
        },
      },
      {
        name: 'runtime image authority changed',
        apply(context) {
          context.liveDiscovery.runtimeImages.api = stagingImage('f');
        },
      },
      {
        name: 'runtime state authority changed',
        apply(context) {
          context.liveDiscovery.runtimeState.serial += 1;
        },
      },
    ];

    for (const scenario of cases) {
      const context = structuredClone(fixture.context);
      scenario.apply(context);
      assert.throws(
        () => control.buildManifest(context),
        scenario.code
          ? { code: scenario.code }
          : control.DeploymentControlError,
        scenario.name,
      );
    }
  });
});

test('edge state-successor recovery v4 requires mutually consistent structured reconciliation evidence', () => {
  withTemporaryRoot((temporaryRoot) => {
    const fixture = makeEdgeStateSuccessorRecoveryContext(temporaryRoot);
    const original = structuredClone(fixture.reconciliation);
    const cases = [
      {
        name: 'state Candidate NEG differs from live',
        apply(evidence) {
          evidence.stateCandidateNeg.cloudRunTag = 'candidate-000000000000';
        },
      },
      {
        name: 'state Candidate Backend differs from live',
        apply(evidence) {
          evidence.stateCandidateBackend.negName = 'unrelated-neg';
        },
      },
      {
        name: 'state smoke route differs from live',
        apply(evidence) {
          evidence.stateCandidateSmokeRoute.backendPath = '/unapproved';
        },
      },
      {
        name: 'current reconciliation state differs from live',
        apply(evidence) {
          evidence.currentEdgeState.serial += 1;
        },
      },
      {
        name: 'reconciliation belongs to another release',
        apply(evidence) {
          evidence.priorReleaseExecutionId = 'day2-staging-unrelated-release';
        },
      },
      {
        name: 'URL Map semantic mutation is reported',
        apply(evidence) {
          evidence.urlMapSemanticStatus = 'changed';
        },
      },
      {
        name: 'Production mutation is reported',
        apply(evidence) {
          evidence.productionMutationObserved = true;
        },
      },
      {
        name: 'unknown reconciliation field',
        apply(evidence) {
          evidence.semanticEqual = true;
        },
      },
    ];

    for (const scenario of cases) {
      fixture.reconciliation = structuredClone(original);
      rewriteStateReconciliationEvidence(fixture, scenario.apply);
      assert.throws(
        () => control.buildManifest(fixture.context),
        control.DeploymentControlError,
        scenario.name,
      );
    }
  });
});

test('edge state-successor recovery v4 reads and verifies every prior artifact byte binding', () => {
  withTemporaryRoot((temporaryRoot) => {
    const fixture = makeEdgeStateSuccessorRecoveryContext(temporaryRoot);
    const hashFields = [
      'priorManifestSha256',
      'priorSavedPlanSha256',
      'priorPlanJsonSha256',
      'priorReviewEvidenceSha256',
      'priorApprovalEvidenceSha256',
      'priorPreApplyEvidenceSha256',
      'stateReconciliationEvidenceSha256',
    ];
    for (const field of hashFields) {
      const context = structuredClone(fixture.context);
      context.edgeStateSuccessorRecovery[field] = 'f'.repeat(64);
      assert.throws(() => control.buildManifest(context), {
        code: 'EDGE_SUCCESSOR_ARTIFACT_HASH_MISMATCH',
      });
    }

    const repositoryArtifact = structuredClone(fixture.context);
    repositoryArtifact.edgeStateSuccessorRecovery.priorPreApplyEvidenceRef =
      path.join(REPOSITORY_ROOT, 'package.json');
    assert.throws(() => control.buildManifest(repositoryArtifact), {
      code: 'SOURCE_ARTIFACT_PATH_FORBIDDEN',
    });

    const duplicateReference = structuredClone(fixture.context);
    duplicateReference.edgeStateSuccessorRecovery.priorPreApplyEvidenceRef =
      duplicateReference.edgeStateSuccessorRecovery.priorApprovalEvidenceRef;
    assert.throws(
      () => control.buildManifest(duplicateReference),
      control.DeploymentControlError,
    );
  });
});

test('edge state-successor recovery v4 accepts only the exact interrupted approved v3 controller boundary', () => {
  withTemporaryRoot((temporaryRoot) => {
    const cases = [
      {
        name: 'operation status is not approved',
        apply(manifest, edge) {
          edge.status = 'plan-registered';
        },
      },
      {
        name: 'plan is not registered',
        apply(manifest, edge) {
          edge.planEvidence.status = 'not-created';
        },
      },
      {
        name: 'plan reviewed is false',
        apply(manifest, edge) {
          edge.planEvidence.reviewed = false;
        },
      },
      {
        name: 'deterministic review did not pass',
        apply(manifest, edge) {
          edge.deterministicReviewEvidence.status = 'not-reviewed';
        },
      },
      {
        name: 'approval is not approved',
        apply(manifest, edge) {
          edge.approval.status = 'pending';
        },
      },
      {
        name: 'apply attempted is true',
        apply(manifest, edge) {
          edge.apply.attempted = true;
        },
      },
      {
        name: 'apply status is failed',
        apply(manifest, edge) {
          edge.apply.status = 'failed';
        },
      },
      {
        name: 'operation is already applied',
        apply(manifest, edge) {
          edge.apply.status = 'succeeded';
          edge.apply.attempted = true;
          edge.status = 'applied-awaiting-live-verification';
        },
      },
      {
        name: 'operation is failed',
        apply(manifest, edge) {
          edge.status = 'failed';
        },
      },
      {
        name: 'operation is consumed',
        apply(manifest, edge) {
          edge.singleConsumptionStatus = 'consumed';
        },
      },
      {
        name: 'live verification is no longer pending',
        apply(manifest, edge) {
          edge.liveVerification.status = 'passed';
        },
      },
      {
        name: 'prior release is complete',
        apply(manifest) {
          manifest.releaseStatus = 'complete';
        },
      },
    ];

    for (const [index, scenario] of cases.entries()) {
      const fixture = makeEdgeStateSuccessorRecoveryContext(
        path.join(temporaryRoot, `boundary-${index}`),
      );
      rewriteEdgeStateSuccessorPredecessor(fixture, (manifest) => {
        const edge = operation(
          manifest,
          control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
          control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
        );
        scenario.apply(manifest, edge);
      });
      assert.throws(
        () => control.buildManifest(fixture.context),
        control.DeploymentControlError,
        scenario.name,
      );
    }
  });
});

test('edge state-successor recovery v4 dynamically blocks the interrupted Saved Plan from registration', () => {
  withTemporaryRoot((temporaryRoot) => {
    const fixture = makeEdgeStateSuccessorRecoveryContext(temporaryRoot);
    const manifest = control.buildManifest(fixture.context);
    const target = operation(
      manifest,
      control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
      control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
    );
    fs.mkdirSync(path.dirname(target.savedPlanPath), { recursive: true });
    fs.copyFileSync(
      fixture.context.edgeStateSuccessorRecovery.priorSavedPlanRef,
      target.savedPlanPath,
    );
    assert.throws(
      () =>
        control.registerPlan(manifest, {
          gateId: control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
          operationId: control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
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
  });
});

test('edge state-successor recovery v4 rejects replay injection and immutable policy edits', () => {
  withTemporaryRoot((temporaryRoot) => {
    const fixture = makeEdgeStateSuccessorRecoveryContext(temporaryRoot);
    const manifest = control.buildManifest(fixture.context);
    for (const replayOperationId of [
      'migration',
      'core-worker-runtime',
      'media-worker-runtime',
      'api-candidate-runtime',
    ]) {
      const edited = structuredClone(manifest);
      edited.gates[0].operations.push({
        ...structuredClone(edited.gates[0].operations[0]),
        id: replayOperationId,
      });
      assert.throws(
        () => control.validateManifest(edited),
        control.DeploymentControlError,
      );
    }

    const mutations = [
      (edited) => {
        edited.resumeOperationId = 'api-candidate-runtime';
      },
      (edited) => {
        edited.blockedSavedPlanHashes = edited.blockedSavedPlanHashes.filter(
          (hash) =>
            hash !== edited.edgeStateSuccessorRecovery.priorSavedPlanSha256,
        );
      },
      (edited) => {
        operation(
          edited,
          control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
          control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
        ).planReviewRequirements.required = false;
      },
      (edited) => {
        operation(
          edited,
          control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
          control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
        ).allowedAttributeChanges[
          control.EDGE_CANDIDATE_RECONCILIATION_RESOURCE_ADDRESSES[1]
        ].push('security_policy');
      },
      (edited) => {
        edited.edgeStateSuccessorRecovery.priorReleaseExecutionId =
          'day2-staging-unrelated-release';
      },
      (edited) => {
        edited.edgeStateSuccessorRecovery.unapproved = true;
      },
    ];
    for (const mutate of mutations) {
      const edited = structuredClone(manifest);
      mutate(edited);
      assert.throws(
        () => control.validateManifest(edited),
        control.DeploymentControlError,
      );
    }
  });
});

test('v4 Candidate Edge review and registration retain the exact v3 deterministic policy and lifecycle', () => {
  withTemporaryRoot((temporaryRoot) => {
    const v3Fixture = makeSuccessfulContinuationContext(
      path.join(temporaryRoot, 'v3'),
    );
    const v4Fixture = makeEdgeStateSuccessorRecoveryContext(
      path.join(temporaryRoot, 'v4'),
    );
    const v3 = control.buildManifest(v3Fixture.context);
    const v4 = control.buildManifest(v4Fixture.context);
    const v3Edge = operation(
      v3,
      control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
      control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
    );
    const v4Edge = operation(
      v4,
      control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
      control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
    );
    for (const field of [
      'expectedResourceAddressAllowlist',
      'expectedResourceActions',
      'allowedAttributeChanges',
      'allowedComputedAfterApplyChanges',
      'expectedResourcePlanIdentities',
      'allowedProviderNormalizations',
      'allowedRefreshOnlyDrift',
      'planReviewRequirements',
    ]) {
      assert.deepEqual(v4Edge[field], v3Edge[field]);
    }

    const reviewCases = [
      {
        name: 'unapproved resource',
        code: 'PLAN_RESOURCE_CHANGE_SET_MISMATCH',
        apply(plan) {
          const extra = structuredClone(plan.resource_changes[1]);
          extra.address =
            'module.edge_environment.google_compute_global_forwarding_rule.https';
          extra.type = 'google_compute_global_forwarding_rule';
          plan.resource_changes.push(extra);
        },
      },
      {
        name: 'unapproved unknown',
        code: 'PLAN_UNKNOWN_UNAPPROVED',
        apply(plan) {
          plan.resource_changes[1].change.after_unknown.security_policy = true;
        },
      },
      {
        name: 'unapproved normalization',
        code: 'PLAN_NORMALIZATION_UNAPPROVED',
        apply(plan) {
          plan.resource_changes[0].change.before.description =
            'not-an-empty-string';
        },
      },
      {
        name: 'unapproved drift',
        code: 'PLAN_DRIFT_UNAPPROVED',
        apply(plan) {
          plan.resource_drift[1].address =
            'module.edge_environment.google_compute_global_address.https';
          plan.resource_drift[1].type = 'google_compute_global_address';
        },
      },
      {
        name: 'URL Map non-noop mutation',
        code: 'PLAN_RESOURCE_CHANGE_SET_MISMATCH',
        apply(plan) {
          const urlMap = representativeNoOpUrlMapRecord();
          urlMap.change.actions = ['update'];
          plan.resource_changes.push(urlMap);
        },
      },
    ];
    for (const scenario of reviewCases) {
      for (const manifest of [v3, v4]) {
        const plan = representativePlanFixture();
        scenario.apply(plan);
        assert.throws(
          () =>
            control.reviewTerraformPlanJson(plan, manifest, {
              gateId: control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
              operationId: control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
            }),
          { code: scenario.code },
          `${scenario.name} manifest v${manifest.manifestVersion}`,
        );
      }
    }

    const target = v4Edge;
    fs.mkdirSync(path.dirname(target.savedPlanPath), { recursive: true });
    fs.writeFileSync(target.savedPlanPath, 'fresh-v4-reviewed-plan');
    const manifestPath = path.join(temporaryRoot, 'v4-manifest.json');
    const manifestBytes = Buffer.from(`${JSON.stringify(v4, null, 2)}\n`);
    fs.writeFileSync(manifestPath, manifestBytes);
    const planJsonPath = path.join(temporaryRoot, 'v4-plan.json');
    fs.copyFileSync(REPRESENTATIVE_PLAN_FIXTURE_PATH, planJsonPath);
    const reviewEvidencePath = path.join(
      temporaryRoot,
      'v4-review-evidence.json',
    );
    const beforeReview = structuredClone(v4);
    const reviewed = control.runCli([
      'review-plan',
      '--manifest',
      manifestPath,
      '--gate',
      control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
      '--operation',
      control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
      '--plan',
      target.savedPlanPath,
      '--plan-json',
      planJsonPath,
      '--review-evidence',
      reviewEvidencePath,
    ]);
    assert.deepEqual(v4, beforeReview);
    assert.equal(reviewed.status, 'passed');
    assert.equal(fs.statSync(reviewEvidencePath).isFile(), true);

    const registrationOptions = {
      gateId: control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
      operationId: control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
      planPath: target.savedPlanPath,
      sourceSha: v4.sourceSha,
      environment: v4.environment,
      terraformRoot: target.terraformRoot,
      lineage: target.statePrecondition.lineage,
      serial: target.statePrecondition.serial,
      recordedAt: RECORDED_AT,
      reviewEvidencePath,
      planJsonPath,
      manifestBytes,
    };
    control.registerPlan(v4, registrationOptions);
    assert.equal(v4Edge.planEvidence.status, 'registered');
    assert.equal(v4Edge.planEvidence.reviewed, false);
    assert.equal(v4Edge.deterministicReviewEvidence.status, 'passed');
    control.approvePlan(v4, {
      gateId: control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
      operationId: control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
      approver: 'test-independent-reviewer',
      approvalRef: 'approval:v4-independent-review',
      recordedAt: RECORDED_AT,
    });
    assert.equal(v4Edge.status, 'approved');
    assert.equal(v4Edge.planEvidence.reviewed, true);
    assert.equal(v4Edge.apply.attempted, false);
  });
});

test('v4 registration fails closed without exact review inputs or with tampered evidence', () => {
  withTemporaryRoot((temporaryRoot) => {
    const fixture = makeEdgeStateSuccessorRecoveryContext(temporaryRoot);
    const manifest = control.buildManifest(fixture.context);
    const prepared = prepareCandidateEdgeRegistration(manifest);

    const withoutReviewEvidence = { ...prepared.options };
    delete withoutReviewEvidence.reviewEvidencePath;
    assert.throws(
      () =>
        control.registerPlan(structuredClone(manifest), withoutReviewEvidence),
      { code: 'PLAN_REVIEW_EVIDENCE_REQUIRED' },
    );

    const withoutPlanJson = { ...prepared.options };
    delete withoutPlanJson.planJsonPath;
    assert.throws(
      () => control.registerPlan(structuredClone(manifest), withoutPlanJson),
      { code: 'PLAN_REVIEW_EVIDENCE_REQUIRED' },
    );

    const tampered = structuredClone(prepared.reviewBinding.evidence);
    tampered.terraformVersion = `${tampered.terraformVersion}-tampered`;
    fs.writeFileSync(
      prepared.reviewBinding.reviewEvidencePath,
      `${JSON.stringify(tampered, null, 2)}\n`,
    );
    assert.throws(
      () => control.registerPlan(structuredClone(manifest), prepared.options),
      { code: 'PLAN_REVIEW_EVIDENCE_MISMATCH' },
    );
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
    unsupportedManifest.manifestVersion = 4;
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

test('v3 deterministic reviewer accepts the sanitized real provider shape with structured evidence', () => {
  withTemporaryRoot((temporaryRoot) => {
    const fixture = makeSuccessfulContinuationContext(temporaryRoot);
    const manifest = control.buildManifest(fixture.context);
    const review = control.reviewTerraformPlanJson(
      representativePlanFixture(),
      manifest,
      {
        gateId: control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
        operationId: control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
      },
    );

    assert.deepEqual(
      {
        status: review.status,
        formatVersion: review.formatVersion,
        terraformVersion: review.terraformVersion,
        nonNoopResourceChangeCount: review.nonNoopResourceChangeCount,
        intendedSemanticChangeCount: review.intendedSemanticChangeCount,
        refreshOnlyDriftCount: review.refreshOnlyDriftCount,
        unapprovedSemanticChangeCount: review.unapprovedSemanticChangeCount,
        unapprovedUnknownCount: review.unapprovedUnknownCount,
        unapprovedNormalizationCount: review.unapprovedNormalizationCount,
        unapprovedDriftCount: review.unapprovedDriftCount,
        urlMapMutation: review.urlMapMutation,
      },
      {
        status: 'passed',
        formatVersion: '1.2',
        terraformVersion: '1.15.8',
        nonNoopResourceChangeCount: 2,
        intendedSemanticChangeCount: 2,
        refreshOnlyDriftCount: 5,
        unapprovedSemanticChangeCount: 0,
        unapprovedUnknownCount: 0,
        unapprovedNormalizationCount: 0,
        unapprovedDriftCount: 0,
        urlMapMutation: false,
      },
    );
    assert.match(
      review.immutableOperationSpecificationSha256,
      /^[a-f0-9]{64}$/u,
    );
    assert.equal(
      JSON.stringify(review).includes('sanitized-primary-api-security-policy'),
      false,
    );
    assert.equal(
      control.canonicalizeTerraformPath(['cloud_run', 0, 'tag']),
      'cloud_run[0].tag',
    );

    const backwardCompatibleFingerprint = representativePlanFixture();
    backwardCompatibleFingerprint.resource_changes[1].change.after.fingerprint =
      null;
    backwardCompatibleFingerprint.resource_changes[1].change.after_unknown.fingerprint = true;
    assert.doesNotThrow(() =>
      control.reviewTerraformPlanJson(backwardCompatibleFingerprint, manifest, {
        gateId: control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
        operationId: control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
      }),
    );

    const compatibleMinorWithNoOp = representativePlanFixture();
    compatibleMinorWithNoOp.format_version = '1.99';
    compatibleMinorWithNoOp.terraform_version = '1.16.0';
    compatibleMinorWithNoOp.resource_changes.push(
      representativeNoOpUrlMapRecord(),
    );
    assert.equal(
      control.reviewTerraformPlanJson(compatibleMinorWithNoOp, manifest, {
        gateId: control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
        operationId: control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
      }).nonNoopResourceChangeCount,
      2,
    );

    const absentUnknownValue = representativePlanFixture();
    delete absentUnknownValue.resource_changes[1].change.after.backend[0].group;
    assert.doesNotThrow(() =>
      control.reviewTerraformPlanJson(absentUnknownValue, manifest, {
        gateId: control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
        operationId: control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
      }),
    );

    const exactCrossResourceIdentity = representativePlanFixture();
    assert.equal(
      exactCrossResourceIdentity.resource_changes[0].change.before.self_link,
      exactCrossResourceIdentity.resource_changes[1].change.before.backend[0]
        .group,
    );
    assert.doesNotThrow(() =>
      control.reviewTerraformPlanJson(exactCrossResourceIdentity, manifest, {
        gateId: control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
        operationId: control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
      }),
    );
  });
});

test('v3 plan identities, provider exceptions, drift policy, and review requirements are immutable', () => {
  withTemporaryRoot((temporaryRoot) => {
    const fixture = makeSuccessfulContinuationContext(temporaryRoot);
    const manifest = control.buildManifest(fixture.context);
    const reviewTarget = operation(
      manifest,
      control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
      control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
    );
    for (const driftPolicy of Object.values(
      reviewTarget.allowedRefreshOnlyDrift,
    )) {
      assert.equal(
        Object.hasOwn(driftPolicy, 'timestampTransitionCanonicalPaths'),
        false,
      );
    }
    const mutations = [
      (target) => {
        target.expectedResourcePlanIdentities[
          control.EDGE_CANDIDATE_RECONCILIATION_RESOURCE_ADDRESSES[0]
        ].providerName = 'registry.terraform.io/hashicorp/unapproved';
      },
      (target) => {
        target.allowedComputedAfterApplyChanges[
          control.EDGE_CANDIDATE_RECONCILIATION_RESOURCE_ADDRESSES[1]
        ].push('backend[0].unapproved');
      },
      (target) => {
        target.allowedProviderNormalizations[
          control.EDGE_CANDIDATE_RECONCILIATION_RESOURCE_ADDRESSES[0]
        ].push({ canonicalPath: 'name', before: '', after: null });
      },
      (target) => {
        target.allowedRefreshOnlyDrift[
          'module.edge_environment.google_compute_global_address.https'
        ] = {
          mode: 'managed',
          type: 'google_compute_global_address',
          providerName: 'registry.terraform.io/hashicorp/google',
          actions: ['update'],
        };
      },
      (target) => {
        target.planReviewRequirements.required = false;
      },
    ];
    for (const mutate of mutations) {
      const changedManifest = structuredClone(manifest);
      mutate(
        operation(
          changedManifest,
          control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
          control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
        ),
      );
      assert.throws(() => control.validateManifest(changedManifest), {
        code: 'MANIFEST_SPEC_MISMATCH',
      });
    }
  });
});

test('v3 deterministic reviewer fails closed for semantic, unknown, normalization, drift, envelope, and provenance violations', () => {
  withTemporaryRoot((temporaryRoot) => {
    const fixture = makeSuccessfulContinuationContext(temporaryRoot);
    const manifest = control.buildManifest(fixture.context);
    const review = (plan) =>
      control.reviewTerraformPlanJson(plan, manifest, {
        gateId: control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
        operationId: control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
      });
    const addNonNoopChange = (
      plan,
      address,
      type = 'google_compute_url_map',
    ) => {
      const extra = structuredClone(plan.resource_changes[1]);
      extra.address = address;
      extra.type = type;
      extra.change.actions = ['update'];
      plan.resource_changes.push(extra);
    };
    const addNoOpUrlMap = (plan) => {
      const record = representativeNoOpUrlMapRecord();
      plan.resource_changes.push(record);
      return record;
    };
    const cases = [
      {
        name: 'URL map mutation',
        code: 'PLAN_RESOURCE_CHANGE_SET_MISMATCH',
        apply(plan) {
          addNonNoopChange(plan, control.EDGE_CANDIDATE_RESOURCE_ADDRESSES[2]);
        },
      },
      {
        name: 'URL map no-op with changed values',
        code: 'PLAN_NOOP_CONTRADICTORY',
        apply(plan) {
          addNoOpUrlMap(plan).change.after.name =
            'moazez-staging-edge-url-map-changed';
        },
      },
      {
        name: 'URL map no-op with an unknown value',
        code: 'PLAN_NOOP_CONTRADICTORY',
        apply(plan) {
          addNoOpUrlMap(plan).change.after_unknown.name = true;
        },
      },
      {
        name: 'URL map no-op with replacement paths',
        code: 'PLAN_NOOP_CONTRADICTORY',
        apply(plan) {
          addNoOpUrlMap(plan).change.replace_paths = [['name']];
        },
      },
      {
        name: 'URL map no-op with previous_address',
        code: 'PLAN_NOOP_CONTRADICTORY',
        apply(plan) {
          addNoOpUrlMap(plan).previous_address =
            'module.edge_environment.google_compute_url_map.previous';
        },
      },
      {
        name: 'URL map no-op with importing provenance',
        code: 'PLAN_NOOP_CONTRADICTORY',
        apply(plan) {
          addNoOpUrlMap(plan).change.importing = {
            id: 'sanitized-import-id',
          };
        },
      },
      {
        name: 'URL map no-op with a deposed object',
        code: 'PLAN_NOOP_CONTRADICTORY',
        apply(plan) {
          addNoOpUrlMap(plan).deposed = 'sanitized-deposed-key';
        },
      },
      {
        name: 'Cloud Armor security_policy mutation',
        code: 'PLAN_SEMANTIC_CHANGE_UNAPPROVED',
        apply(plan) {
          plan.resource_changes[1].change.after.security_policy =
            'sanitized-different-policy';
        },
      },
      {
        name: 'trusted-client-IP custom_request_headers mutation',
        code: 'PLAN_SEMANTIC_CHANGE_UNAPPROVED',
        apply(plan) {
          plan.resource_changes[1].change.after.custom_request_headers = [];
        },
      },
      {
        name: 'certificate semantic mutation',
        code: 'PLAN_DRIFT_UNAPPROVED',
        apply(plan) {
          plan.resource_drift[1].change.after.certificates = [
            'sanitized-certificate',
          ];
        },
      },
      {
        name: 'certificate-map semantic mutation',
        code: 'PLAN_DRIFT_UNAPPROVED',
        apply(plan) {
          plan.resource_drift[1].change.after.name = 'sanitized-different-map';
        },
      },
      {
        name: 'certificate-map-entry hostname mutation',
        code: 'PLAN_DRIFT_UNAPPROVED',
        apply(plan) {
          plan.resource_drift[2].change.after.hostname =
            'different.example.invalid';
        },
      },
      {
        name: 'unapproved Backend attribute',
        code: 'PLAN_SEMANTIC_CHANGE_UNAPPROVED',
        apply(plan) {
          plan.resource_changes[1].change.after.name =
            'sanitized-different-backend';
        },
      },
      {
        name: 'unapproved NEG attribute',
        code: 'PLAN_SEMANTIC_CHANGE_UNAPPROVED',
        apply(plan) {
          plan.resource_changes[0].change.after.network_endpoint_type =
            'INTERNET_IP_PORT';
        },
      },
      {
        name: 'arbitrary NEG tag transition',
        code: 'PLAN_SEMANTIC_CHANGE_UNAPPROVED',
        apply(plan) {
          plan.resource_changes[0].change.after.cloud_run[0].tag =
            'candidate-000000000000';
        },
      },
      {
        name: 'Backend group does not identify the retained Candidate NEG',
        code: 'PLAN_SEMANTIC_CHANGE_UNAPPROVED',
        apply(plan) {
          plan.resource_changes[1].change.before.backend[0].group =
            'https://www.googleapis.com/compute/v1/projects/sanitized-project/regions/me-central2/networkEndpointGroups/unrelated-neg';
        },
      },
      {
        name: 'Backend group identifies the same NEG in another project',
        code: 'PLAN_SEMANTIC_CHANGE_UNAPPROVED',
        apply(plan) {
          plan.resource_changes[1].change.before.backend[0].group =
            'https://www.googleapis.com/compute/v1/projects/different-sanitized-project/regions/me-central2/networkEndpointGroups/moazez-staging-api-candidate-neg';
        },
      },
      {
        name: 'governed resource has another provider identity',
        code: 'PLAN_RESOURCE_IDENTITY_MISMATCH',
        apply(plan) {
          plan.resource_changes[0].provider_name =
            'registry.terraform.io/hashicorp/unapproved';
        },
      },
      {
        name: 'arbitrary drift address',
        code: 'PLAN_DRIFT_UNAPPROVED',
        apply(plan) {
          plan.resource_drift[1].address =
            'module.edge_environment.google_compute_global_address.https';
          plan.resource_drift[1].type = 'google_compute_global_address';
        },
      },
      {
        name: 'certificate drift path other than update_time',
        code: 'PLAN_DRIFT_UNAPPROVED',
        apply(plan) {
          plan.resource_drift[3].change.after.description = 'changed';
        },
      },
      {
        name: 'external certificate drift with corresponding resource change',
        code: 'PLAN_RESOURCE_CHANGE_SET_MISMATCH',
        apply(plan) {
          addNonNoopChange(
            plan,
            plan.resource_drift[1].address,
            'google_certificate_manager_certificate_map',
          );
        },
      },
      {
        name: 'new resource outside mutable allowlist',
        code: 'PLAN_RESOURCE_CHANGE_SET_MISMATCH',
        apply(plan) {
          addNonNoopChange(
            plan,
            'module.edge_environment.google_compute_global_forwarding_rule.https',
            'google_compute_global_forwarding_rule',
          );
        },
      },
      {
        name: 'managed read outside mutable allowlist',
        code: 'PLAN_RESOURCE_CHANGE_SET_MISMATCH',
        apply(plan) {
          addNonNoopChange(
            plan,
            'module.edge_environment.google_compute_global_address.https',
            'google_compute_global_address',
          );
          plan.resource_changes.at(-1).change.actions = ['read'];
        },
      },
      {
        name: 'additional Backend after_unknown path',
        code: 'PLAN_UNKNOWN_UNAPPROVED',
        apply(plan) {
          plan.resource_changes[1].change.after_unknown.security_policy = true;
        },
      },
      {
        name: 'additional NEG after_unknown path',
        code: 'PLAN_UNKNOWN_UNAPPROVED',
        apply(plan) {
          plan.resource_changes[0].change.after_unknown.description = true;
        },
      },
      {
        name: 'NEG id claims unknown while after is a known string',
        code: 'PLAN_UNKNOWN_AFTER_VALUE_KNOWN',
        apply(plan) {
          plan.resource_changes[0].change.after.id = 'known-sanitized-id';
        },
      },
      {
        name: 'NEG psc_data claims unknown while after is an empty list',
        code: 'PLAN_UNKNOWN_AFTER_VALUE_KNOWN',
        apply(plan) {
          plan.resource_changes[0].change.after.psc_data = [];
        },
      },
      {
        name: 'Backend max_rate claims unknown while after is a number',
        code: 'PLAN_UNKNOWN_AFTER_VALUE_KNOWN',
        apply(plan) {
          plan.resource_changes[1].change.after.backend[0].max_rate = 100;
        },
      },
      {
        name: 'Backend fingerprint claims unknown while after is known',
        code: 'PLAN_UNKNOWN_AFTER_VALUE_KNOWN',
        apply(plan) {
          plan.resource_changes[1].change.after_unknown.fingerprint = true;
        },
      },
      {
        name: 'approved normalization with wrong before value',
        code: 'PLAN_NORMALIZATION_UNAPPROVED',
        apply(plan) {
          plan.resource_changes[0].change.before.description =
            'not-an-empty-string';
        },
      },
      {
        name: 'regional self-link identifies another region',
        code: 'PLAN_NORMALIZATION_UNAPPROVED',
        apply(plan) {
          plan.resource_changes[0].change.before.region =
            'https://www.googleapis.com/compute/v1/projects/sanitized-project/regions/me-central1';
        },
      },
      {
        name: 'regional self-link identifies another project',
        code: 'PLAN_NORMALIZATION_UNAPPROVED',
        apply(plan) {
          plan.resource_changes[0].change.before.region =
            'https://www.googleapis.com/compute/v1/projects/different-sanitized-project/regions/me-central2';
        },
      },
      {
        name: 'unexpected action combination',
        code: 'PLAN_ACTION_MISMATCH',
        apply(plan) {
          plan.resource_changes[1].change.actions = ['delete', 'create'];
        },
      },
      {
        name: 'malformed plan JSON',
        code: 'PLAN_JSON_MALFORMED',
        value: null,
      },
      {
        name: 'structurally malformed resource change',
        code: 'PLAN_JSON_MALFORMED',
        apply(plan) {
          delete plan.resource_changes[0].provider_name;
        },
      },
      {
        name: 'unsupported format_version major',
        code: 'PLAN_FORMAT_VERSION_UNSUPPORTED',
        apply(plan) {
          plan.format_version = '2.0';
        },
      },
      {
        name: 'applyable false',
        code: 'PLAN_NOT_APPLYABLE',
        apply(plan) {
          plan.applyable = false;
        },
      },
      {
        name: 'complete false',
        code: 'PLAN_INCOMPLETE',
        apply(plan) {
          plan.complete = false;
        },
      },
      {
        name: 'errored true',
        code: 'PLAN_ERRORED',
        apply(plan) {
          plan.errored = true;
        },
      },
      {
        name: 'backend cardinality zero',
        code: 'PLAN_BACKEND_CARDINALITY_INVALID',
        apply(plan) {
          plan.resource_changes[1].change.after.backend = [];
        },
      },
      {
        name: 'backend cardinality expansion',
        code: 'PLAN_BACKEND_CARDINALITY_INVALID',
        apply(plan) {
          plan.resource_changes[1].change.after.backend.push(
            structuredClone(plan.resource_changes[1].change.after.backend[0]),
          );
        },
      },
      {
        name: 'NEG replacement caused by unrelated path',
        code: 'PLAN_REPLACEMENT_CAUSE_UNAPPROVED',
        apply(plan) {
          plan.resource_changes[0].change.replace_paths = [['region']];
        },
      },
      {
        name: 'NEG replacement has an additional path',
        code: 'PLAN_REPLACEMENT_CAUSE_UNAPPROVED',
        apply(plan) {
          plan.resource_changes[0].change.replace_paths.push(['region']);
        },
      },
      {
        name: 'NEG replacement caused by taint',
        code: 'PLAN_REPLACEMENT_CAUSE_UNAPPROVED',
        apply(plan) {
          plan.resource_changes[0].action_reason = 'replace_because_tainted';
        },
      },
      {
        name: 'NEG replacement explicitly requested',
        code: 'PLAN_REPLACEMENT_CAUSE_UNAPPROVED',
        apply(plan) {
          plan.resource_changes[0].action_reason = 'replace_by_request';
        },
      },
      {
        name: 'previous_address on governed mutable resource',
        code: 'PLAN_RESOURCE_PROVENANCE_UNSAFE',
        apply(plan) {
          plan.resource_changes[0].previous_address =
            'module.edge_environment.google_compute_region_network_endpoint_group.previous';
        },
      },
      {
        name: 'deposed governed resource',
        code: 'PLAN_RESOURCE_PROVENANCE_UNSAFE',
        apply(plan) {
          plan.resource_changes[1].deposed = 'sanitized-deposed-key';
        },
      },
      {
        name: 'importing governed resource',
        code: 'PLAN_RESOURCE_PROVENANCE_UNSAFE',
        apply(plan) {
          plan.resource_changes[1].change.importing = {
            id: 'sanitized-import-id',
          };
        },
      },
      {
        name: 'after_unknown false is not an unknown permission',
        code: 'PLAN_SEMANTIC_CHANGE_UNAPPROVED',
        apply(plan) {
          plan.resource_changes[1].change.after_unknown.backend[0].group = false;
        },
      },
      {
        name: 'empty array is not an unknown permission',
        code: 'PLAN_SEMANTIC_CHANGE_UNAPPROVED',
        apply(plan) {
          plan.resource_changes[1].change.after_unknown.backend[0].group = [];
        },
      },
      {
        name: 'empty object is not an unknown permission',
        code: 'PLAN_SEMANTIC_CHANGE_UNAPPROVED',
        apply(plan) {
          plan.resource_changes[1].change.after_unknown.backend[0].group = {};
        },
      },
      {
        name: 'known null is not confused with unknown',
        code: 'PLAN_SEMANTIC_CHANGE_UNAPPROVED',
        apply(plan) {
          delete plan.resource_changes[1].change.after_unknown.backend[0].group;
        },
      },
      {
        name: 'duplicate mutable resource change',
        code: 'PLAN_DUPLICATE_RESOURCE_CHANGE',
        apply(plan) {
          plan.resource_changes.push(structuredClone(plan.resource_changes[0]));
        },
      },
      {
        name: 'duplicate drift record',
        code: 'PLAN_DUPLICATE_DRIFT',
        apply(plan) {
          plan.resource_drift.push(structuredClone(plan.resource_drift[0]));
        },
      },
      {
        name: 'certificate drift timestamp is invalid',
        code: 'PLAN_DRIFT_UNAPPROVED',
        apply(plan) {
          plan.resource_drift[4].change.after.update_time = 'not-a-timestamp';
        },
      },
      {
        name: 'certificate drift has after_unknown true',
        code: 'PLAN_DRIFT_UNAPPROVED',
        apply(plan) {
          plan.resource_drift[4].change.after_unknown.update_time = true;
        },
      },
    ];

    for (const scenario of cases) {
      const plan = Object.hasOwn(scenario, 'value')
        ? scenario.value
        : representativePlanFixture();
      scenario.apply?.(plan);
      assert.throws(() => review(plan), { code: scenario.code }, scenario.name);
    }
  });
});

test('v3 register-plan revalidates exact plan JSON and binds the manifest, specification, evidence, and Saved Plan', () => {
  withTemporaryRoot((temporaryRoot) => {
    const fixture = makeSuccessfulContinuationContext(temporaryRoot);
    const manifest = control.buildManifest(fixture.context);
    const target = operation(
      manifest,
      control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
      control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
    );
    fs.mkdirSync(path.dirname(target.savedPlanPath), { recursive: true });
    const originalPlanBytes = Buffer.from('exact-reviewed-saved-plan');
    fs.writeFileSync(target.savedPlanPath, originalPlanBytes);
    const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
    const { evidence, planJsonPath } =
      writeSuccessfulContinuationReviewEvidence(
        manifest,
        target,
        manifestBytes,
      );
    const baseOptions = {
      gateId: control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
      operationId: control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
      planPath: target.savedPlanPath,
      sourceSha: manifest.sourceSha,
      environment: manifest.environment,
      terraformRoot: target.terraformRoot,
      lineage: target.statePrecondition.lineage,
      serial: target.statePrecondition.serial,
      recordedAt: RECORDED_AT,
      manifestBytes,
      planJsonPath,
    };
    const writeEvidence = (name, value) => {
      const evidencePath = path.join(temporaryRoot, `${name}.review.json`);
      fs.writeFileSync(evidencePath, `${JSON.stringify(value, null, 2)}\n`);
      return evidencePath;
    };
    const bindingCases = [
      {
        name: 'another releaseExecutionId',
        code: 'PLAN_REVIEW_BINDING_MISMATCH',
        apply(value) {
          value.releaseExecutionId = 'day2-staging-another-release';
        },
      },
      {
        name: 'another source SHA',
        code: 'PLAN_REVIEW_BINDING_MISMATCH',
        apply(value) {
          value.sourceSha = 'f'.repeat(40);
        },
      },
      {
        name: 'another manifest SHA',
        code: 'PLAN_REVIEW_BINDING_MISMATCH',
        apply(value) {
          value.manifestSha256 = 'e'.repeat(64);
        },
      },
      {
        name: 'another operation-spec digest',
        code: 'PLAN_REVIEW_BINDING_MISMATCH',
        apply(value) {
          value.immutableOperationSpecificationSha256 = 'd'.repeat(64);
        },
      },
      {
        name: 'alternate valid plan JSON SHA',
        code: 'PLAN_REVIEW_EVIDENCE_MISMATCH',
        apply(value) {
          value.planJsonSha256 = '0'.repeat(64);
        },
      },
      {
        name: 'alternate valid Terraform version',
        code: 'PLAN_REVIEW_EVIDENCE_MISMATCH',
        apply(value) {
          value.terraformVersion = '1.99.0';
        },
      },
      {
        name: 'alternate valid format version',
        code: 'PLAN_REVIEW_EVIDENCE_MISMATCH',
        apply(value) {
          value.formatVersion = '1.99';
        },
      },
      {
        name: 'alternate valid refresh-only drift count',
        code: 'PLAN_REVIEW_EVIDENCE_MISMATCH',
        apply(value) {
          value.refreshOnlyDriftCount = 4;
        },
      },
      {
        name: 'alternate semantic count rejected by the evidence schema',
        code: 'PLAN_REVIEW_EVIDENCE_INVALID',
        apply(value) {
          value.intendedSemanticChangeCount = 1;
        },
      },
      {
        name: 'review evidence tampering',
        code: 'PLAN_REVIEW_EVIDENCE_INVALID',
        apply(value) {
          value.unreviewedPayload = true;
        },
      },
    ];
    for (const scenario of bindingCases) {
      const changedEvidence = structuredClone(evidence);
      scenario.apply(changedEvidence);
      const reviewEvidencePath = writeEvidence(
        scenario.name.replaceAll(' ', '-'),
        changedEvidence,
      );
      assert.throws(
        () =>
          control.registerPlan(structuredClone(manifest), {
            ...baseOptions,
            reviewEvidencePath,
          }),
        { code: scenario.code },
        scenario.name,
      );
    }

    assert.throws(
      () =>
        control.registerPlan(structuredClone(manifest), {
          ...baseOptions,
        }),
      { code: 'PLAN_REVIEW_EVIDENCE_REQUIRED' },
    );

    const exactEvidencePath = writeEvidence('exact', evidence);
    const { planJsonPath: ignoredPlanJsonPath, ...withoutPlanJson } =
      baseOptions;
    assert.equal(typeof ignoredPlanJsonPath, 'string');
    assert.throws(
      () =>
        control.registerPlan(structuredClone(manifest), {
          ...withoutPlanJson,
          reviewEvidencePath: exactEvidencePath,
        }),
      { code: 'PLAN_REVIEW_EVIDENCE_REQUIRED' },
    );

    fs.writeFileSync(target.savedPlanPath, 'changed-after-review');
    assert.throws(
      () =>
        control.registerPlan(structuredClone(manifest), {
          ...baseOptions,
          reviewEvidencePath: exactEvidencePath,
        }),
      { code: 'REVIEWED_PLAN_MISMATCH' },
    );
    fs.writeFileSync(target.savedPlanPath, originalPlanBytes);

    const changedPlanJsonPath = path.join(
      temporaryRoot,
      'changed-semantics.plan.json',
    );
    const changedPlanJson = representativePlanFixture();
    changedPlanJson.terraform_version = '1.15.9';
    fs.writeFileSync(
      changedPlanJsonPath,
      `${JSON.stringify(changedPlanJson, null, 2)}\n`,
    );
    assert.throws(
      () =>
        control.registerPlan(structuredClone(manifest), {
          ...baseOptions,
          planJsonPath: changedPlanJsonPath,
          reviewEvidencePath: exactEvidencePath,
        }),
      { code: 'PLAN_REVIEW_EVIDENCE_MISMATCH' },
    );

    const sameSemanticsDifferentBytesPath = path.join(
      temporaryRoot,
      'same-semantics-different-bytes.plan.json',
    );
    fs.writeFileSync(
      sameSemanticsDifferentBytesPath,
      JSON.stringify(representativePlanFixture()),
    );
    assert.throws(
      () =>
        control.registerPlan(structuredClone(manifest), {
          ...baseOptions,
          planJsonPath: sameSemanticsDifferentBytesPath,
          reviewEvidencePath: exactEvidencePath,
        }),
      { code: 'PLAN_REVIEW_EVIDENCE_MISMATCH' },
    );

    const registered = structuredClone(manifest);
    control.registerPlan(registered, {
      ...baseOptions,
      reviewEvidencePath: exactEvidencePath,
    });
    const registeredTarget = operation(
      registered,
      control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
      control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
    );
    assert.equal(registeredTarget.planEvidence.reviewed, false);
    assert.equal(registeredTarget.deterministicReviewEvidence.status, 'passed');
    assert.equal(
      registeredTarget.deterministicReviewEvidence.savedPlanSha256,
      registeredTarget.planEvidence.sha256,
    );
    assert.match(
      registeredTarget.deterministicReviewEvidence.reviewEvidenceSha256,
      /^[a-f0-9]{64}$/u,
    );
    const staleDigestManifest = structuredClone(registered);
    operation(
      staleDigestManifest,
      control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
      control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
    ).deterministicReviewEvidence.immutableOperationSpecificationSha256 =
      'c'.repeat(64);
    assert.throws(() => control.validateManifest(staleDigestManifest), {
      code: 'MANIFEST_LIFECYCLE_INVALID',
    });
    control.approvePlan(registered, {
      gateId: control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
      operationId: control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
      approver: 'independent-test-approver',
      approvalRef: 'approval:independent-v3-review',
      recordedAt: RECORDED_AT,
    });
    assert.equal(registeredTarget.planEvidence.reviewed, true);
    assert.equal(registeredTarget.approval.status, 'approved');
  });
});

test('review-plan CLI creates only atomic sanitized evidence and register-plan consumes that exact review', () => {
  withTemporaryRoot((temporaryRoot) => {
    const fixture = makeSuccessfulContinuationContext(temporaryRoot);
    const manifest = control.buildManifest(fixture.context);
    const target = operation(
      manifest,
      control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
      control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
    );
    const manifestPath = path.join(temporaryRoot, 'continuation-manifest.json');
    const planJsonPath = path.join(temporaryRoot, 'exact-plan.json');
    const reviewEvidencePath = path.join(
      temporaryRoot,
      'exact-plan.review.json',
    );
    fs.mkdirSync(path.dirname(target.savedPlanPath), { recursive: true });
    fs.writeFileSync(target.savedPlanPath, 'cli-reviewed-plan');
    fs.copyFileSync(REPRESENTATIVE_PLAN_FIXTURE_PATH, planJsonPath);
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const manifestBeforeReview = fs.readFileSync(manifestPath);

    const reviewResult = control.runCli([
      'review-plan',
      '--manifest',
      manifestPath,
      '--gate',
      control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
      '--operation',
      control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
      '--plan',
      target.savedPlanPath,
      '--plan-json',
      planJsonPath,
      '--review-evidence',
      reviewEvidencePath,
    ]);
    assert.equal(reviewResult.status, 'passed');
    assert.equal(reviewResult.nonNoopResourceChangeCount, 2);
    assert.equal(reviewResult.intendedSemanticChangeCount, 2);
    assert.equal(reviewResult.refreshOnlyDriftCount, 5);
    assert.equal(reviewResult.urlMapMutation, false);
    assert.deepEqual(fs.readFileSync(manifestPath), manifestBeforeReview);
    assert.equal(fs.statSync(reviewEvidencePath).isFile(), true);
    assert.throws(
      () =>
        control.runCli([
          'review-plan',
          '--manifest',
          manifestPath,
          '--gate',
          control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
          '--operation',
          control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
          '--plan',
          target.savedPlanPath,
          '--plan-json',
          planJsonPath,
          '--review-evidence',
          reviewEvidencePath,
        ]),
      { code: 'REVIEW_EVIDENCE_ALREADY_EXISTS' },
    );

    control.runCli([
      'register-plan',
      '--manifest',
      manifestPath,
      '--gate',
      control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
      '--operation',
      control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
      '--recorded-at',
      RECORDED_AT,
      '--plan',
      target.savedPlanPath,
      '--plan-json',
      planJsonPath,
      '--review-evidence',
      reviewEvidencePath,
      '--source-sha',
      manifest.sourceSha,
      '--environment',
      manifest.environment,
      '--terraform-root',
      target.terraformRoot,
      '--lineage',
      target.statePrecondition.lineage,
      '--serial',
      String(target.statePrecondition.serial),
    ]);
    const registeredManifest = JSON.parse(
      fs.readFileSync(manifestPath, 'utf8'),
    );
    const registeredTarget = operation(
      registeredManifest,
      control.SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
      control.SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
    );
    assert.equal(registeredTarget.status, 'plan-registered');
    assert.equal(registeredTarget.planEvidence.reviewed, false);
    assert.equal(registeredTarget.deterministicReviewEvidence.status, 'passed');
  });
});
