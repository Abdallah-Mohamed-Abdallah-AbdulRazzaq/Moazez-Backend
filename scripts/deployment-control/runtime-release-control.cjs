'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { isDeepStrictEqual } = require('node:util');

const REPOSITORY = 'Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Backend';
const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..');
const CONTRACT_PATH = path.join(
  REPOSITORY_ROOT,
  'config',
  'deployment',
  'release-sequence.contract.json',
);
const FIRST_REMAINING_GATE_ID = 'core-worker-promotion';
const BLOCKED_SAVED_PLAN_SHA256 =
  'ccc0473c853e0ea2a47e8cb6700acf3a80a454907130ce9992049e7d7ded43e7';
const SMOKE_PUBLIC_PATH = '/.well-known/moazez/candidate-readiness';
const SMOKE_BACKEND_PATH = '/api/v1/auth/me';
const STAGING_API_ORIGIN = 'https://staging-api.moazez.cloud';
const RUNTIME_ROOT = 'infra/gcp/backend-runtime/environments/nonprod/runtime';
const EDGE_ROOT = 'infra/gcp/edge/environments/nonprod';

const RUNTIME_RESOURCE_ADDRESSES = Object.freeze({
  api: 'module.runtime_environment.google_cloud_run_v2_service.api',
  coreWorker: 'module.runtime_environment.google_cloud_run_v2_worker_pool.core',
  mediaWorker:
    'module.runtime_environment.google_cloud_run_v2_worker_pool.media',
  maintenanceScheduler:
    'module.runtime_environment.google_cloud_run_v2_worker_pool.maintenance_scheduler',
});

const EDGE_CANDIDATE_RESOURCE_ADDRESSES = Object.freeze([
  'module.edge_environment.google_compute_region_network_endpoint_group.api_candidate[0]',
  'module.edge_environment.google_compute_backend_service.api_candidate[0]',
  'module.edge_environment.google_compute_url_map.edge',
]);

const RUNTIME_OPERATOR_VARIABLES = Object.freeze([
  Object.freeze({ name: 'queue_redis_host', sensitive: false }),
  Object.freeze({ name: 'queue_redis_port', sensitive: false }),
  Object.freeze({ name: 'queue_redis_ca_pem', sensitive: true }),
  Object.freeze({ name: 'realtime_redis_host', sensitive: false }),
  Object.freeze({ name: 'realtime_redis_port', sensitive: false }),
  Object.freeze({ name: 'realtime_redis_ca_pem', sensitive: true }),
]);

const SUPPORTED_GATE_BUILDERS = Object.freeze({
  'core-worker-promotion': true,
  'media-worker-promotion': true,
  'api-no-traffic-promotion': true,
  'maintenance-scheduler-promotion': true,
  'protected-readiness-and-smoke': true,
  'traffic-promotion': true,
});

class DeploymentControlError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DeploymentControlError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new DeploymentControlError(code, message);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function readJson(filePath, label = 'JSON file') {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(
      'INVALID_JSON',
      `${label} could not be read as JSON: ${error.message}`,
    );
  }
  return parsed;
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
    fail('INVALID_INPUT', `${label} must be an object.`);
  }
  return value;
}

function requireString(value, label, pattern) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail('INVALID_INPUT', `${label} must be a non-empty string.`);
  }
  if (pattern && !pattern.test(value)) {
    fail('INVALID_INPUT', `${label} has an invalid format.`);
  }
  return value;
}

function requireTerraformStateLineage(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    fail('INVALID_INPUT', `${label} must be a non-empty string.`);
  }
  if (value.trim() !== value) {
    fail(
      'INVALID_INPUT',
      `${label} must not have leading or trailing whitespace.`,
    );
  }
  if (/[\u0000-\u001f\u007f-\u009f]/u.test(value)) {
    fail('INVALID_INPUT', `${label} must not contain control characters.`);
  }
  if (Buffer.byteLength(value, 'utf8') > 1024) {
    fail('INVALID_INPUT', `${label} must not exceed 1024 UTF-8 bytes.`);
  }
  return value;
}

function requireIsoTimestamp(value, label) {
  requireString(value, label);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    fail('INVALID_INPUT', `${label} must be an ISO-8601 UTC timestamp.`);
  }
  return value;
}

function requireState(value, label) {
  const state = requireObject(value, label);
  const lineage = requireTerraformStateLineage(
    state.lineage,
    `${label}.lineage`,
  );
  if (!Number.isSafeInteger(state.serial) || state.serial < 0) {
    fail('INVALID_INPUT', `${label}.serial must be a non-negative integer.`);
  }
  return Object.freeze({ lineage, serial: state.serial });
}

function requireExactKeys(value, expectedKeys, label) {
  const object = requireObject(value, label);
  const actualKeys = Object.keys(object).sort();
  const normalizedExpectedKeys = [...expectedKeys].sort();
  if (!isDeepStrictEqual(actualKeys, normalizedExpectedKeys)) {
    fail('MANIFEST_SCHEMA_MISMATCH', `${label} contains unexpected fields.`);
  }
  return object;
}

function requireExactValue(value, expected, label) {
  if (!isDeepStrictEqual(value, expected)) {
    fail(
      'MANIFEST_SPEC_MISMATCH',
      `${label} differs from the governed specification.`,
    );
  }
}

function normalizeRelativeRoot(value, label) {
  requireString(value, label);
  const normalized = value.replaceAll('\\', '/').replace(/^\.\//u, '');
  if (
    path.isAbsolute(value) ||
    normalized.startsWith('../') ||
    normalized.includes('/../')
  ) {
    fail('INVALID_PATH', `${label} must be repository-relative.`);
  }
  return normalized;
}

function isPathInside(parentPath, candidatePath) {
  const relative = path.relative(parentPath, candidatePath);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  );
}

function requireExternalAbsolutePath(value, label) {
  requireString(value, label);
  if (!path.isAbsolute(value)) {
    fail('INVALID_PATH', `${label} must be an absolute path.`);
  }
  const resolved = path.resolve(value);
  if (isPathInside(REPOSITORY_ROOT, resolved)) {
    fail('SOURCE_ARTIFACT_PATH_FORBIDDEN', `${label} must be outside source.`);
  }
  return resolved;
}

function currentSourceSha() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    fail(
      'GIT_SOURCE_UNAVAILABLE',
      'The repository HEAD could not be resolved.',
    );
  }
}

function loadReleaseContract() {
  const raw = fs.readFileSync(CONTRACT_PATH);
  const contract = readJson(CONTRACT_PATH, 'release contract');
  requireObject(contract, 'release contract');
  if (contract.contractVersion !== 1) {
    fail('CONTRACT_UNSUPPORTED', 'release contract version must be 1.');
  }
  if (contract.failurePolicy !== 'stop-after-first-failure') {
    fail(
      'CONTRACT_UNSUPPORTED',
      'release contract must retain stop-after-first-failure.',
    );
  }
  if (contract.automaticRetryAllowed !== false) {
    fail(
      'CONTRACT_UNSUPPORTED',
      'automatic release retries must remain disabled.',
    );
  }
  if (!Array.isArray(contract.stages) || contract.stages.length === 0) {
    fail('CONTRACT_UNSUPPORTED', 'release contract stages are required.');
  }
  const seen = new Set();
  for (const [index, stage] of contract.stages.entries()) {
    requireObject(stage, `release contract stage ${index}`);
    requireString(stage.id, `release contract stage ${index}.id`);
    if (stage.blocking !== true || seen.has(stage.id)) {
      fail(
        'CONTRACT_UNSUPPORTED',
        'release contract stages must be unique and blocking.',
      );
    }
    seen.add(stage.id);
  }
  const firstRemaining = contract.stages.findIndex(
    (stage) => stage.id === FIRST_REMAINING_GATE_ID,
  );
  if (firstRemaining < 0) {
    fail('CONTRACT_UNSUPPORTED', 'remaining release boundary was not found.');
  }
  const remainingStages = contract.stages.slice(firstRemaining);
  if (
    remainingStages.length !== Object.keys(SUPPORTED_GATE_BUILDERS).length ||
    remainingStages.some((stage) => !SUPPORTED_GATE_BUILDERS[stage.id])
  ) {
    fail(
      'CONTRACT_UNSUPPORTED',
      'remaining contract gates do not match the implemented D1 capabilities.',
    );
  }
  return Object.freeze({
    contract,
    contractSha256: sha256(raw),
    predecessorStages: contract.stages.slice(0, firstRemaining),
    remainingStages,
  });
}

function expectedCandidateTag(imageReference) {
  return `candidate-${sha256(imageReference).slice(0, 12)}`;
}

function stagingImagePattern() {
  return /^me-central2-docker[.]pkg[.]dev\/moazez-nonprod-91001421934\/moazez-staging-containers\/moazez-backend@sha256:[a-f0-9]{64}$/u;
}

function validateImageReference(value, label) {
  requireString(value, label, stagingImagePattern());
  return value;
}

function validatePredecessorEvidence(inputStages, predecessorStages) {
  if (
    !Array.isArray(inputStages) ||
    inputStages.length !== predecessorStages.length
  ) {
    fail(
      'PREDECESSOR_EVIDENCE_REQUIRED',
      'completedPredecessorStages must cover every earlier contract stage.',
    );
  }
  return predecessorStages.map((stage, index) => {
    const supplied = requireObject(
      inputStages[index],
      `completedPredecessorStages[${index}]`,
    );
    if (supplied.id !== stage.id || supplied.status !== 'passed') {
      fail(
        'PREDECESSOR_EVIDENCE_REQUIRED',
        `predecessor stage ${stage.id} must be passed in contract order.`,
      );
    }
    return Object.freeze({
      id: stage.id,
      status: 'passed',
      evidenceRef: requireString(
        supplied.evidenceRef,
        `completedPredecessorStages[${index}].evidenceRef`,
      ),
    });
  });
}

function runtimeVariables(images, trafficMode, stableRevision, candidateTag) {
  return {
    api_image_reference: images.api,
    core_worker_image_reference: images.coreWorker,
    media_worker_image_reference: images.mediaWorker,
    maintenance_scheduler_image_reference: images.maintenanceScheduler,
    api_traffic_mode: trafficMode,
    api_stable_revision: stableRevision,
    api_candidate_tag: candidateTag,
  };
}

function statePrecondition(initialState, boundFromOperationId = null) {
  if (initialState) {
    return {
      lineage: initialState.lineage,
      serial: initialState.serial,
      boundFromOperationId: null,
      status: 'bound',
    };
  }
  return {
    lineage: null,
    serial: null,
    boundFromOperationId,
    status: 'awaiting-predecessor',
  };
}

function buildPlanPath(
  context,
  gateIndex,
  gateId,
  operationIndex,
  operationId,
) {
  const rootKey = operationId.includes('edge') ? 'edge' : 'backend-runtime';
  const fileName = `${String(gateIndex + 1).padStart(2, '0')}-${gateId}-${String(operationIndex + 1).padStart(2, '0')}-${operationId}.tfplan`;
  return path.join(
    context.savedPlanRoot,
    context.environment,
    rootKey,
    context.executionId,
    fileName,
  );
}

function buildTfDataDir(context, terraformRoot) {
  const rootKey = terraformRoot === EDGE_ROOT ? 'edge' : 'backend-runtime';
  return path.join(
    context.tfDataRoot,
    context.executionId,
    context.environment,
    rootKey,
  );
}

function buildTerraformOperation(
  context,
  gateIndex,
  operationIndex,
  definition,
) {
  const terraformRoot = normalizeRelativeRoot(
    definition.terraformRoot,
    'terraformRoot',
  );
  return {
    id: definition.id,
    sequence: operationIndex + 1,
    kind: 'terraform',
    releaseGateId: definition.gateId,
    repository: REPOSITORY,
    sourceSha: context.sourceSha,
    environment: context.environment,
    terraformRoot,
    absoluteTerraformRoot: path.join(
      REPOSITORY_ROOT,
      ...terraformRoot.split('/'),
    ),
    tfDataDir: buildTfDataDir(context, terraformRoot),
    savedPlanPath: buildPlanPath(
      context,
      gateIndex,
      definition.gateId,
      operationIndex,
      definition.id,
    ),
    requiredVariables: definition.requiredVariables,
    operatorSuppliedVariables:
      terraformRoot === RUNTIME_ROOT ? RUNTIME_OPERATOR_VARIABLES : [],
    expectedResourceAddressAllowlist:
      definition.expectedResourceAddressAllowlist,
    expectedChangeType: definition.expectedChangeType,
    allowedAttributeChanges: definition.allowedAttributeChanges,
    statePrecondition: definition.statePrecondition,
    planEvidence: {
      status: 'not-created',
      sha256: null,
      sizeBytes: null,
      registeredAt: null,
      reviewed: false,
    },
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
    singleConsumptionStatus: 'unconsumed',
    liveVerification: {
      status: 'pending',
      evidenceRef: null,
      recordedAt: null,
      observations: null,
    },
    verificationExpectation: definition.verificationExpectation,
    status: 'pending',
  };
}

function buildVerificationOperation(context, definition) {
  return {
    id: definition.id,
    sequence: 1,
    kind: 'verification',
    releaseGateId: definition.gateId,
    repository: REPOSITORY,
    sourceSha: context.sourceSha,
    environment: context.environment,
    candidateSmokeUrl: `${STAGING_API_ORIGIN}${SMOKE_PUBLIC_PATH}`,
    publicPath: SMOKE_PUBLIC_PATH,
    backendPath: SMOKE_BACKEND_PATH,
    httpMethod: 'GET',
    authentication: {
      mechanism:
        'Authorization: Bearer <ephemeral staging application access token>',
      actorContract:
        'Active dedicated staging smoke actor whose session and membership remain valid; credentials and tokens are never recorded.',
    },
    candidateTag: context.candidateTag,
    expectedRevision: context.candidateRevision,
    expectedImage: context.candidateImageReference,
    expectedSuccessEvidence: [
      'HTTP 200 from the exact public path',
      'sanitized auth/me response for the approved smoke actor',
      'Cloud Run request-log evidence naming the expected candidate revision',
      'candidate image, tag, timestamp, and evidence reference with no credentials',
    ],
    liveVerification: {
      status: 'pending',
      evidenceRef: null,
      recordedAt: null,
      observations: null,
    },
    verificationExpectation: {
      image: context.candidateImageReference,
      revision: context.candidateRevision,
      candidateTag: context.candidateTag,
      publicPath: SMOKE_PUBLIC_PATH,
      backendPath: SMOKE_BACKEND_PATH,
      httpStatus: 200,
    },
    status: 'pending',
  };
}

function buildGateOperations(context, gate, gateIndex) {
  const current = context.currentImages;
  const candidate = context.candidateImageReference;
  const normalTraffic = ['normal', null, null];
  const candidateTraffic = [
    'candidate_no_traffic',
    context.stableApiRevision,
    context.candidateTag,
  ];
  const promotedTraffic = [
    'candidate_promoted',
    context.stableApiRevision,
    context.candidateTag,
  ];

  switch (gate.id) {
    case 'core-worker-promotion':
      return [
        buildTerraformOperation(context, gateIndex, 0, {
          id: 'core-worker-runtime',
          gateId: gate.id,
          terraformRoot: RUNTIME_ROOT,
          requiredVariables: runtimeVariables(
            {
              ...current,
              coreWorker: candidate,
            },
            ...normalTraffic,
          ),
          expectedResourceAddressAllowlist: [
            RUNTIME_RESOURCE_ADDRESSES.coreWorker,
          ],
          expectedChangeType: 'update-in-place:core-worker-image-only',
          allowedAttributeChanges: {
            [RUNTIME_RESOURCE_ADDRESSES.coreWorker]: [
              'template[0].containers[0].image',
            ],
          },
          statePrecondition: statePrecondition(context.runtimeState),
          verificationExpectation: { image: candidate },
        }),
      ];

    case 'media-worker-promotion':
      return [
        buildTerraformOperation(context, gateIndex, 0, {
          id: 'media-worker-runtime',
          gateId: gate.id,
          terraformRoot: RUNTIME_ROOT,
          requiredVariables: runtimeVariables(
            {
              api: current.api,
              coreWorker: candidate,
              mediaWorker: candidate,
              maintenanceScheduler: current.maintenanceScheduler,
            },
            ...normalTraffic,
          ),
          expectedResourceAddressAllowlist: [
            RUNTIME_RESOURCE_ADDRESSES.mediaWorker,
          ],
          expectedChangeType: 'update-in-place:media-worker-image-only',
          allowedAttributeChanges: {
            [RUNTIME_RESOURCE_ADDRESSES.mediaWorker]: [
              'template[0].containers[0].image',
            ],
          },
          statePrecondition: statePrecondition(null, 'core-worker-runtime'),
          verificationExpectation: { image: candidate },
        }),
      ];

    case 'api-no-traffic-promotion':
      return [
        buildTerraformOperation(context, gateIndex, 0, {
          id: 'api-candidate-runtime',
          gateId: gate.id,
          terraformRoot: RUNTIME_ROOT,
          requiredVariables: runtimeVariables(
            {
              api: candidate,
              coreWorker: candidate,
              mediaWorker: candidate,
              maintenanceScheduler: current.maintenanceScheduler,
            },
            ...candidateTraffic,
          ),
          expectedResourceAddressAllowlist: [RUNTIME_RESOURCE_ADDRESSES.api],
          expectedChangeType:
            'update-in-place:api-image-plus-explicit-zero-traffic-candidate',
          allowedAttributeChanges: {
            [RUNTIME_RESOURCE_ADDRESSES.api]: [
              'template[0].containers[0].image',
              'template[0].revision',
              'traffic',
            ],
          },
          statePrecondition: statePrecondition(null, 'media-worker-runtime'),
          verificationExpectation: {
            image: candidate,
            revision: context.candidateRevision,
            candidateTag: context.candidateTag,
            stablePercent: 100,
            candidatePercent: 0,
          },
        }),
        buildTerraformOperation(context, gateIndex, 1, {
          id: 'api-candidate-edge',
          gateId: gate.id,
          terraformRoot: EDGE_ROOT,
          requiredVariables: {
            candidate_edge_enabled: true,
            candidate_api_tag: context.candidateTag,
          },
          expectedResourceAddressAllowlist: EDGE_CANDIDATE_RESOURCE_ADDRESSES,
          expectedChangeType:
            'create-tagged-neg-and-backend-plus-narrow-url-map-route',
          allowedAttributeChanges: {
            [EDGE_CANDIDATE_RESOURCE_ADDRESSES[0]]: ['create'],
            [EDGE_CANDIDATE_RESOURCE_ADDRESSES[1]]: ['create'],
            [EDGE_CANDIDATE_RESOURCE_ADDRESSES[2]]: [
              'path_matcher[api].path_rule',
            ],
          },
          statePrecondition: statePrecondition(context.edgeState),
          verificationExpectation: {
            candidateTag: context.candidateTag,
            publicPath: SMOKE_PUBLIC_PATH,
            backendPath: SMOKE_BACKEND_PATH,
          },
        }),
      ];

    case 'maintenance-scheduler-promotion':
      return [
        buildTerraformOperation(context, gateIndex, 0, {
          id: 'maintenance-scheduler-runtime',
          gateId: gate.id,
          terraformRoot: RUNTIME_ROOT,
          requiredVariables: runtimeVariables(
            {
              api: candidate,
              coreWorker: candidate,
              mediaWorker: candidate,
              maintenanceScheduler: candidate,
            },
            ...candidateTraffic,
          ),
          expectedResourceAddressAllowlist: [
            RUNTIME_RESOURCE_ADDRESSES.maintenanceScheduler,
          ],
          expectedChangeType:
            'update-in-place:maintenance-scheduler-image-only',
          allowedAttributeChanges: {
            [RUNTIME_RESOURCE_ADDRESSES.maintenanceScheduler]: [
              'template[0].containers[0].image',
            ],
          },
          statePrecondition: statePrecondition(null, 'api-candidate-runtime'),
          verificationExpectation: { image: candidate },
        }),
      ];

    case 'protected-readiness-and-smoke':
      return [
        buildVerificationOperation(context, {
          id: 'protected-candidate-smoke',
          gateId: gate.id,
        }),
      ];

    case 'traffic-promotion':
      return [
        buildTerraformOperation(context, gateIndex, 0, {
          id: 'api-traffic-promotion',
          gateId: gate.id,
          terraformRoot: RUNTIME_ROOT,
          requiredVariables: runtimeVariables(
            {
              api: candidate,
              coreWorker: candidate,
              mediaWorker: candidate,
              maintenanceScheduler: candidate,
            },
            ...promotedTraffic,
          ),
          expectedResourceAddressAllowlist: [RUNTIME_RESOURCE_ADDRESSES.api],
          expectedChangeType: 'update-in-place:api-traffic-only',
          allowedAttributeChanges: {
            [RUNTIME_RESOURCE_ADDRESSES.api]: ['traffic'],
          },
          statePrecondition: statePrecondition(
            null,
            'maintenance-scheduler-runtime',
          ),
          verificationExpectation: {
            image: candidate,
            revision: context.candidateRevision,
            candidateTag: context.candidateTag,
            stablePercent: 0,
            candidatePercent: 100,
          },
        }),
      ];

    default:
      fail('CONTRACT_UNSUPPORTED', `unsupported release gate: ${gate.id}`);
  }
}

function buildManifest(input) {
  requireObject(input, 'context');
  const contract = loadReleaseContract();
  const sourceSha = requireString(
    input.sourceSha,
    'sourceSha',
    /^[a-f0-9]{40}$/u,
  );
  if (sourceSha !== currentSourceSha()) {
    fail(
      'SOURCE_SHA_MISMATCH',
      'sourceSha must equal the current repository HEAD.',
    );
  }
  if (input.repository !== REPOSITORY) {
    fail('REPOSITORY_MISMATCH', `repository must equal ${REPOSITORY}.`);
  }
  if (input.environment !== 'staging') {
    fail(
      'ENVIRONMENT_UNSUPPORTED',
      'The D1 live adapter is staging-only; Production candidate edge routing is not approved.',
    );
  }
  const executionId = requireString(
    input.executionId,
    'executionId',
    /^[a-z0-9][a-z0-9._-]{2,80}$/u,
  );
  const candidateImageReference = validateImageReference(
    input.candidateImageReference,
    'candidateImageReference',
  );
  const candidateTag = requireString(
    input.candidateTag,
    'candidateTag',
    /^candidate-[a-f0-9]{12}$/u,
  );
  if (candidateTag !== expectedCandidateTag(candidateImageReference)) {
    fail(
      'CANDIDATE_TAG_MISMATCH',
      'candidateTag must be deterministically derived from candidateImageReference.',
    );
  }
  const live = requireObject(input.liveDiscovery, 'liveDiscovery');
  requireString(live.evidenceRef, 'liveDiscovery.evidenceRef');
  requireIsoTimestamp(live.discoveredAt, 'liveDiscovery.discoveredAt');
  if (live.apiTrafficMode !== 'normal') {
    fail(
      'LIVE_TRAFFIC_BASELINE_UNSAFE',
      'liveDiscovery.apiTrafficMode must be normal before the remaining sequence.',
    );
  }
  const discoveredImages = requireObject(
    live.runtimeImages,
    'liveDiscovery.runtimeImages',
  );
  const currentImages = {
    api: validateImageReference(
      discoveredImages.api,
      'liveDiscovery.runtimeImages.api',
    ),
    coreWorker: validateImageReference(
      discoveredImages.coreWorker,
      'liveDiscovery.runtimeImages.coreWorker',
    ),
    mediaWorker: validateImageReference(
      discoveredImages.mediaWorker,
      'liveDiscovery.runtimeImages.mediaWorker',
    ),
    maintenanceScheduler: validateImageReference(
      discoveredImages.maintenanceScheduler,
      'liveDiscovery.runtimeImages.maintenanceScheduler',
    ),
  };
  const stableApiRevision = requireString(
    live.stableApiRevision,
    'liveDiscovery.stableApiRevision',
    /^moazez-staging-api-[a-z0-9][a-z0-9-]{0,42}[a-z0-9]$/u,
  );
  const candidateRevision = `moazez-staging-api-${candidateTag}`;
  if (stableApiRevision === candidateRevision) {
    fail(
      'AMBIGUOUS_API_REVISIONS',
      'stable and candidate revision identities must be distinct.',
    );
  }
  const runtimeState = requireState(
    live.runtimeState,
    'liveDiscovery.runtimeState',
  );
  const edgeState = requireState(live.edgeState, 'liveDiscovery.edgeState');
  const tfDataRoot = requireExternalAbsolutePath(
    input.externalTfDataRoot,
    'externalTfDataRoot',
  );
  const savedPlanRoot = requireExternalAbsolutePath(
    input.externalSavedPlanRoot,
    'externalSavedPlanRoot',
  );
  const predecessorEvidence = validatePredecessorEvidence(
    input.completedPredecessorStages,
    contract.predecessorStages,
  );
  const context = {
    executionId,
    sourceSha,
    environment: input.environment,
    candidateImageReference,
    candidateTag,
    candidateRevision,
    stableApiRevision,
    currentImages,
    runtimeState,
    edgeState,
    tfDataRoot,
    savedPlanRoot,
  };
  const gates = contract.remainingStages.map((gate, gateIndex) => ({
    id: gate.id,
    sequence: gateIndex + 1,
    blocking: true,
    status: 'pending',
    operations: buildGateOperations(context, gate, gateIndex),
  }));
  const manifest = {
    manifestVersion: 1,
    releaseExecutionId: executionId,
    repository: REPOSITORY,
    sourceSha,
    environment: input.environment,
    authoritativeContract: {
      path: 'config/deployment/release-sequence.contract.json',
      sha256: contract.contractSha256,
      contractVersion: contract.contract.contractVersion,
      failurePolicy: contract.contract.failurePolicy,
      automaticRetryAllowed: contract.contract.automaticRetryAllowed,
    },
    predecessorEvidence,
    liveDiscovery: {
      evidenceRef: live.evidenceRef,
      discoveredAt: live.discoveredAt,
      apiTrafficMode: live.apiTrafficMode,
      stableApiRevision,
      runtimeImages: currentImages,
      runtimeState,
      edgeState,
    },
    candidate: {
      imageReference: candidateImageReference,
      tag: candidateTag,
      revision: candidateRevision,
    },
    externalArtifactRoots: {
      tfDataRoot,
      savedPlanRoot,
    },
    releaseStatus: 'pending',
    failedGateId: null,
    gates,
    candidateEdgeCleanupTemplate: {
      authoritativeReleaseGate: false,
      requiresSeparatePostReleaseApproval: true,
      terraformRoot: EDGE_ROOT,
      requiredVariables: {
        candidate_edge_enabled: false,
        candidate_api_tag: null,
      },
      expectedResourceAddressAllowlist: EDGE_CANDIDATE_RESOURCE_ADDRESSES,
      expectedChangeType:
        'destroy-candidate-neg-and-backend-plus-remove-narrow-url-map-route',
    },
    blockedSavedPlanHashes: [BLOCKED_SAVED_PLAN_SHA256],
  };
  validateManifest(manifest);
  return manifest;
}

function flattenOperations(manifest) {
  return manifest.gates.flatMap((gate) =>
    gate.operations.map((operation) => ({ gate, operation })),
  );
}

function findOperation(manifest, gateId, operationId) {
  const gate = manifest.gates.find((candidate) => candidate.id === gateId);
  if (!gate) fail('UNKNOWN_GATE', `unknown release gate: ${gateId}`);
  const operation = gate.operations.find(
    (candidate) => candidate.id === operationId,
  );
  if (!operation) {
    fail('UNKNOWN_OPERATION', `unknown operation ${operationId} in ${gateId}.`);
  }
  return { gate, operation };
}

function assertReleaseCanAdvance(manifest, gate, operation) {
  if (manifest.releaseStatus === 'failed') {
    fail(
      'STOP_AFTER_FIRST_FAILURE',
      `release stopped after failure at ${manifest.failedGateId}.`,
    );
  }
  if (manifest.releaseStatus === 'complete') {
    fail('RELEASE_ALREADY_COMPLETE', 'release manifest is already complete.');
  }
  const gateIndex = manifest.gates.indexOf(gate);
  for (const predecessor of manifest.gates.slice(0, gateIndex)) {
    if (predecessor.status !== 'passed') {
      fail(
        'OUT_OF_ORDER_GATE',
        `${gate.id} cannot advance before ${predecessor.id} passes.`,
      );
    }
  }
  const operationIndex = gate.operations.indexOf(operation);
  for (const predecessor of gate.operations.slice(0, operationIndex)) {
    if (predecessor.status !== 'passed') {
      fail(
        'OUT_OF_ORDER_SUBOPERATION',
        `${operation.id} cannot advance before ${predecessor.id} passes.`,
      );
    }
  }
}

function assertSourceBinding(manifest) {
  if (manifest.sourceSha !== currentSourceSha()) {
    fail(
      'SOURCE_SHA_MISMATCH',
      'manifest source SHA no longer equals the current repository HEAD.',
    );
  }
}

function assertPromotionPrerequisites(manifest) {
  const api = findOperation(
    manifest,
    'api-no-traffic-promotion',
    'api-candidate-runtime',
  ).operation;
  const smoke = findOperation(
    manifest,
    'protected-readiness-and-smoke',
    'protected-candidate-smoke',
  ).operation;
  const maintenance = findOperation(
    manifest,
    'maintenance-scheduler-promotion',
    'maintenance-scheduler-runtime',
  ).operation;
  const expected = manifest.candidate;
  if (
    maintenance.status !== 'passed' ||
    maintenance.liveVerification.observations.observedImage !==
      expected.imageReference
  ) {
    fail(
      'PROMOTION_PREREQUISITE_MISSING',
      'Maintenance Scheduler candidate evidence has not passed.',
    );
  }
  for (const [label, operation] of [
    ['API candidate', api],
    ['protected smoke', smoke],
  ]) {
    if (operation.status !== 'passed') {
      fail('PROMOTION_PREREQUISITE_MISSING', `${label} has not passed.`);
    }
    const observations = operation.liveVerification.observations;
    if (
      observations.observedImage !== expected.imageReference ||
      observations.observedRevision !== expected.revision ||
      observations.observedCandidateTag !== expected.tag
    ) {
      fail(
        'PROMOTION_IDENTITY_CHANGED',
        `${label} did not preserve the candidate image/revision/tag identity.`,
      );
    }
  }
}

function immutableOperationSpecification(operation) {
  const common = {
    id: operation.id,
    sequence: operation.sequence,
    kind: operation.kind,
    releaseGateId: operation.releaseGateId,
    repository: operation.repository,
    sourceSha: operation.sourceSha,
    environment: operation.environment,
  };
  if (operation.kind === 'terraform') {
    return {
      ...common,
      terraformRoot: operation.terraformRoot,
      absoluteTerraformRoot: operation.absoluteTerraformRoot,
      tfDataDir: operation.tfDataDir,
      savedPlanPath: operation.savedPlanPath,
      requiredVariables: operation.requiredVariables,
      operatorSuppliedVariables: operation.operatorSuppliedVariables,
      expectedResourceAddressAllowlist:
        operation.expectedResourceAddressAllowlist,
      expectedChangeType: operation.expectedChangeType,
      allowedAttributeChanges: operation.allowedAttributeChanges,
      verificationExpectation: operation.verificationExpectation,
    };
  }
  if (operation.kind === 'verification') {
    return {
      ...common,
      candidateSmokeUrl: operation.candidateSmokeUrl,
      publicPath: operation.publicPath,
      backendPath: operation.backendPath,
      httpMethod: operation.httpMethod,
      authentication: operation.authentication,
      candidateTag: operation.candidateTag,
      expectedRevision: operation.expectedRevision,
      expectedImage: operation.expectedImage,
      expectedSuccessEvidence: operation.expectedSuccessEvidence,
      verificationExpectation: operation.verificationExpectation,
    };
  }
  fail(
    'MANIFEST_SCHEMA_MISMATCH',
    `${operation.id ?? 'operation'} has an invalid kind.`,
  );
}

function validatePlanEvidence(operation, label) {
  const evidence = requireExactKeys(
    operation.planEvidence,
    ['status', 'sha256', 'sizeBytes', 'registeredAt', 'reviewed'],
    `${label}.planEvidence`,
  );
  if (evidence.status === 'not-created') {
    requireExactValue(
      evidence,
      {
        status: 'not-created',
        sha256: null,
        sizeBytes: null,
        registeredAt: null,
        reviewed: false,
      },
      `${label}.planEvidence`,
    );
    return;
  }
  if (evidence.status !== 'registered') {
    fail(
      'MANIFEST_LIFECYCLE_INVALID',
      `${label} has invalid plan evidence status.`,
    );
  }
  requireString(
    evidence.sha256,
    `${label}.planEvidence.sha256`,
    /^[a-f0-9]{64}$/u,
  );
  if (!Number.isSafeInteger(evidence.sizeBytes) || evidence.sizeBytes <= 0) {
    fail(
      'MANIFEST_LIFECYCLE_INVALID',
      `${label}.planEvidence.sizeBytes must be a positive integer.`,
    );
  }
  requireIsoTimestamp(
    evidence.registeredAt,
    `${label}.planEvidence.registeredAt`,
  );
  if (typeof evidence.reviewed !== 'boolean') {
    fail(
      'MANIFEST_LIFECYCLE_INVALID',
      `${label}.planEvidence.reviewed must be boolean.`,
    );
  }
}

function validateApproval(operation, label) {
  const approval = requireExactKeys(
    operation.approval,
    ['status', 'approver', 'approvalRef', 'approvedAt'],
    `${label}.approval`,
  );
  if (approval.status === 'pending') {
    requireExactValue(
      approval,
      {
        status: 'pending',
        approver: null,
        approvalRef: null,
        approvedAt: null,
      },
      `${label}.approval`,
    );
    return;
  }
  if (approval.status !== 'approved') {
    fail('MANIFEST_LIFECYCLE_INVALID', `${label} has invalid approval status.`);
  }
  requireString(approval.approver, `${label}.approval.approver`);
  requireString(approval.approvalRef, `${label}.approval.approvalRef`);
  requireIsoTimestamp(approval.approvedAt, `${label}.approval.approvedAt`);
}

function validateApplyEvidence(operation, label) {
  const apply = requireExactKeys(
    operation.apply,
    ['status', 'attempted', 'evidenceRef', 'recordedAt', 'postApplyState'],
    `${label}.apply`,
  );
  if (apply.status === 'not-applied') {
    requireExactValue(
      apply,
      {
        status: 'not-applied',
        attempted: false,
        evidenceRef: null,
        recordedAt: null,
        postApplyState: null,
      },
      `${label}.apply`,
    );
    return;
  }
  if (
    !['succeeded', 'failed'].includes(apply.status) ||
    apply.attempted !== true
  ) {
    fail('MANIFEST_LIFECYCLE_INVALID', `${label} has invalid apply evidence.`);
  }
  requireString(apply.evidenceRef, `${label}.apply.evidenceRef`);
  requireIsoTimestamp(apply.recordedAt, `${label}.apply.recordedAt`);
  if (apply.status === 'succeeded') {
    requireState(apply.postApplyState, `${label}.apply.postApplyState`);
  } else if (apply.postApplyState !== null) {
    fail(
      'MANIFEST_LIFECYCLE_INVALID',
      `${label} failed apply must not claim post-apply state.`,
    );
  }
}

function validateLiveVerification(operation, label) {
  const verification = requireExactKeys(
    operation.liveVerification,
    ['status', 'evidenceRef', 'recordedAt', 'observations'],
    `${label}.liveVerification`,
  );
  if (verification.status === 'pending') {
    requireExactValue(
      verification,
      {
        status: 'pending',
        evidenceRef: null,
        recordedAt: null,
        observations: null,
      },
      `${label}.liveVerification`,
    );
    return;
  }
  if (!['passed', 'failed'].includes(verification.status)) {
    fail(
      'MANIFEST_LIFECYCLE_INVALID',
      `${label} has invalid live verification status.`,
    );
  }
  requireString(
    verification.evidenceRef,
    `${label}.liveVerification.evidenceRef`,
  );
  requireIsoTimestamp(
    verification.recordedAt,
    `${label}.liveVerification.recordedAt`,
  );
  const observations = requireObject(
    verification.observations,
    `${label}.liveVerification.observations`,
  );
  const allowedObservationKeys = new Set([
    'observedImage',
    'observedRevision',
    'observedCandidateTag',
    'observedPublicPath',
    'observedBackendPath',
    'observedStablePercent',
    'observedCandidatePercent',
    'httpStatus',
  ]);
  if (
    Object.keys(observations).some((key) => !allowedObservationKeys.has(key))
  ) {
    fail(
      'MANIFEST_SCHEMA_MISMATCH',
      `${label}.liveVerification.observations contains unexpected fields.`,
    );
  }
}

function validateTerraformLifecycle(operation, label) {
  requireExactKeys(
    operation,
    [
      'id',
      'sequence',
      'kind',
      'releaseGateId',
      'repository',
      'sourceSha',
      'environment',
      'terraformRoot',
      'absoluteTerraformRoot',
      'tfDataDir',
      'savedPlanPath',
      'requiredVariables',
      'operatorSuppliedVariables',
      'expectedResourceAddressAllowlist',
      'expectedChangeType',
      'allowedAttributeChanges',
      'statePrecondition',
      'planEvidence',
      'approval',
      'apply',
      'singleConsumptionStatus',
      'liveVerification',
      'verificationExpectation',
      'status',
    ],
    label,
  );
  validatePlanEvidence(operation, label);
  validateApproval(operation, label);
  validateApplyEvidence(operation, label);
  validateLiveVerification(operation, label);
  const signature = [
    operation.planEvidence.status,
    String(operation.planEvidence.reviewed),
    operation.approval.status,
    operation.apply.status,
    operation.singleConsumptionStatus,
    operation.liveVerification.status,
  ].join('|');
  const allowedByStatus = {
    pending: ['not-created|false|pending|not-applied|unconsumed|pending'],
    'plan-registered': [
      'registered|false|pending|not-applied|unconsumed|pending',
    ],
    approved: ['registered|true|approved|not-applied|unconsumed|pending'],
    'applied-awaiting-live-verification': [
      'registered|true|approved|succeeded|consumed-success|pending',
    ],
    passed: ['registered|true|approved|succeeded|consumed-success|passed'],
    failed: [
      'registered|true|approved|failed|invalidated-after-failed-attempt|pending',
      'registered|true|approved|succeeded|consumed-success|failed',
    ],
    blocked: ['not-created|false|pending|not-applied|unconsumed|pending'],
  };
  if (!allowedByStatus[operation.status]?.includes(signature)) {
    fail(
      'MANIFEST_LIFECYCLE_INVALID',
      `${label} has contradictory Terraform lifecycle evidence.`,
    );
  }
}

function validateVerificationLifecycle(operation, label) {
  requireExactKeys(
    operation,
    [
      'id',
      'sequence',
      'kind',
      'releaseGateId',
      'repository',
      'sourceSha',
      'environment',
      'candidateSmokeUrl',
      'publicPath',
      'backendPath',
      'httpMethod',
      'authentication',
      'candidateTag',
      'expectedRevision',
      'expectedImage',
      'expectedSuccessEvidence',
      'liveVerification',
      'verificationExpectation',
      'status',
    ],
    label,
  );
  validateLiveVerification(operation, label);
  const allowed = {
    pending: 'pending',
    passed: 'passed',
    failed: 'failed',
    blocked: 'pending',
  };
  if (allowed[operation.status] !== operation.liveVerification.status) {
    fail(
      'MANIFEST_LIFECYCLE_INVALID',
      `${label} has contradictory verification lifecycle evidence.`,
    );
  }
}

function validateStatePrecondition(
  manifest,
  operation,
  expectedOperation,
  label,
) {
  const state = requireExactKeys(
    operation.statePrecondition,
    ['lineage', 'serial', 'boundFromOperationId', 'status'],
    `${label}.statePrecondition`,
  );
  const initial = expectedOperation.statePrecondition;
  if (initial.status === 'bound') {
    requireExactValue(state, initial, `${label}.statePrecondition`);
    return;
  }
  const predecessor = flattenOperations(manifest).find(
    ({ operation: candidate }) => candidate.id === initial.boundFromOperationId,
  )?.operation;
  if (!predecessor) {
    fail(
      'MANIFEST_SPEC_MISMATCH',
      `${label} references an unknown state predecessor.`,
    );
  }
  if (predecessor.status !== 'passed') {
    requireExactValue(state, initial, `${label}.statePrecondition`);
    return;
  }
  requireExactValue(
    state,
    {
      lineage: predecessor.apply.postApplyState.lineage,
      serial: predecessor.apply.postApplyState.serial,
      boundFromOperationId: predecessor.id,
      status: 'bound',
    },
    `${label}.statePrecondition`,
  );
}

function validateReleaseLifecycle(manifest) {
  for (const gate of manifest.gates) {
    const derivedStatus = gate.operations.some(
      (operation) => operation.status === 'failed',
    )
      ? 'failed'
      : gate.operations.every((operation) => operation.status === 'passed')
        ? 'passed'
        : gate.operations.every((operation) => operation.status === 'blocked')
          ? 'blocked'
          : 'pending';
    if (gate.status !== derivedStatus) {
      fail(
        'MANIFEST_LIFECYCLE_INVALID',
        `${gate.id} status contradicts its operation states.`,
      );
    }
  }
  const failedGates = manifest.gates.filter((gate) => gate.status === 'failed');
  if (manifest.releaseStatus === 'complete') {
    if (
      manifest.failedGateId !== null ||
      !manifest.gates.every((gate) => gate.status === 'passed')
    ) {
      fail(
        'MANIFEST_LIFECYCLE_INVALID',
        'complete release state is contradictory.',
      );
    }
    return;
  }
  if (manifest.releaseStatus === 'failed') {
    if (
      failedGates.length !== 1 ||
      manifest.failedGateId !== failedGates[0].id ||
      manifest.gates
        .slice(manifest.gates.indexOf(failedGates[0]) + 1)
        .some((gate) => gate.status !== 'blocked')
    ) {
      fail(
        'MANIFEST_LIFECYCLE_INVALID',
        'failed release state is contradictory.',
      );
    }
    return;
  }
  if (!['pending', 'in-progress'].includes(manifest.releaseStatus)) {
    fail('MANIFEST_LIFECYCLE_INVALID', 'releaseStatus is invalid.');
  }
  if (manifest.failedGateId !== null || failedGates.length > 0) {
    fail(
      'MANIFEST_LIFECYCLE_INVALID',
      'active release cannot contain a failed gate.',
    );
  }
  if (
    manifest.releaseStatus === 'in-progress' &&
    !manifest.gates.some((gate) => gate.status === 'passed')
  ) {
    fail(
      'MANIFEST_LIFECYCLE_INVALID',
      'in-progress release must contain a passed gate.',
    );
  }
}

function validateManifest(manifest) {
  requireExactKeys(
    manifest,
    [
      'manifestVersion',
      'releaseExecutionId',
      'repository',
      'sourceSha',
      'environment',
      'authoritativeContract',
      'predecessorEvidence',
      'liveDiscovery',
      'candidate',
      'externalArtifactRoots',
      'releaseStatus',
      'failedGateId',
      'gates',
      'candidateEdgeCleanupTemplate',
      'blockedSavedPlanHashes',
    ],
    'manifest',
  );
  if (manifest.manifestVersion !== 1) {
    fail('MANIFEST_UNSUPPORTED', 'manifestVersion must be 1.');
  }
  const executionId = requireString(
    manifest.releaseExecutionId,
    'manifest.releaseExecutionId',
    /^[a-z0-9][a-z0-9._-]{2,80}$/u,
  );
  if (manifest.repository !== REPOSITORY) {
    fail('REPOSITORY_MISMATCH', 'manifest repository is not authoritative.');
  }
  const sourceSha = requireString(
    manifest.sourceSha,
    'manifest.sourceSha',
    /^[a-f0-9]{40}$/u,
  );
  if (manifest.environment !== 'staging') {
    fail('ENVIRONMENT_UNSUPPORTED', 'manifest environment must be staging.');
  }
  const contract = loadReleaseContract();
  requireExactValue(
    requireExactKeys(
      manifest.authoritativeContract,
      [
        'path',
        'sha256',
        'contractVersion',
        'failurePolicy',
        'automaticRetryAllowed',
      ],
      'manifest.authoritativeContract',
    ),
    {
      path: 'config/deployment/release-sequence.contract.json',
      sha256: contract.contractSha256,
      contractVersion: contract.contract.contractVersion,
      failurePolicy: contract.contract.failurePolicy,
      automaticRetryAllowed: contract.contract.automaticRetryAllowed,
    },
    'manifest.authoritativeContract',
  );
  const predecessorEvidence = validatePredecessorEvidence(
    manifest.predecessorEvidence,
    contract.predecessorStages,
  );
  requireExactValue(
    manifest.predecessorEvidence,
    predecessorEvidence,
    'manifest.predecessorEvidence',
  );

  const live = requireExactKeys(
    manifest.liveDiscovery,
    [
      'evidenceRef',
      'discoveredAt',
      'apiTrafficMode',
      'stableApiRevision',
      'runtimeImages',
      'runtimeState',
      'edgeState',
    ],
    'manifest.liveDiscovery',
  );
  const evidenceRef = requireString(
    live.evidenceRef,
    'manifest.liveDiscovery.evidenceRef',
  );
  const discoveredAt = requireIsoTimestamp(
    live.discoveredAt,
    'manifest.liveDiscovery.discoveredAt',
  );
  if (live.apiTrafficMode !== 'normal') {
    fail(
      'LIVE_TRAFFIC_BASELINE_UNSAFE',
      'manifest live traffic baseline must remain normal.',
    );
  }
  const runtimeImages = requireExactKeys(
    live.runtimeImages,
    ['api', 'coreWorker', 'mediaWorker', 'maintenanceScheduler'],
    'manifest.liveDiscovery.runtimeImages',
  );
  const currentImages = {
    api: validateImageReference(
      runtimeImages.api,
      'manifest.liveDiscovery.runtimeImages.api',
    ),
    coreWorker: validateImageReference(
      runtimeImages.coreWorker,
      'manifest.liveDiscovery.runtimeImages.coreWorker',
    ),
    mediaWorker: validateImageReference(
      runtimeImages.mediaWorker,
      'manifest.liveDiscovery.runtimeImages.mediaWorker',
    ),
    maintenanceScheduler: validateImageReference(
      runtimeImages.maintenanceScheduler,
      'manifest.liveDiscovery.runtimeImages.maintenanceScheduler',
    ),
  };
  requireExactValue(
    live.runtimeImages,
    currentImages,
    'manifest.liveDiscovery.runtimeImages',
  );
  const stableApiRevision = requireString(
    live.stableApiRevision,
    'manifest.liveDiscovery.stableApiRevision',
    /^moazez-staging-api-[a-z0-9][a-z0-9-]{0,42}[a-z0-9]$/u,
  );
  const runtimeState = requireState(
    live.runtimeState,
    'manifest.liveDiscovery.runtimeState',
  );
  const edgeState = requireState(
    live.edgeState,
    'manifest.liveDiscovery.edgeState',
  );
  requireExactValue(
    live,
    {
      evidenceRef,
      discoveredAt,
      apiTrafficMode: 'normal',
      stableApiRevision,
      runtimeImages: currentImages,
      runtimeState,
      edgeState,
    },
    'manifest.liveDiscovery',
  );

  const candidate = requireExactKeys(
    manifest.candidate,
    ['imageReference', 'tag', 'revision'],
    'manifest.candidate',
  );
  const candidateImageReference = validateImageReference(
    candidate.imageReference,
    'manifest.candidate.imageReference',
  );
  const candidateTag = requireString(
    candidate.tag,
    'manifest.candidate.tag',
    /^candidate-[a-f0-9]{12}$/u,
  );
  const candidateRevision = `moazez-staging-api-${candidateTag}`;
  if (
    candidateTag !== expectedCandidateTag(candidateImageReference) ||
    candidate.revision !== candidateRevision ||
    stableApiRevision === candidateRevision
  ) {
    fail(
      'CANDIDATE_IDENTITY_MISMATCH',
      'manifest candidate image, tag, revision, and stable identity are inconsistent.',
    );
  }
  requireExactValue(
    candidate,
    {
      imageReference: candidateImageReference,
      tag: candidateTag,
      revision: candidateRevision,
    },
    'manifest.candidate',
  );

  const externalRoots = requireExactKeys(
    manifest.externalArtifactRoots,
    ['tfDataRoot', 'savedPlanRoot'],
    'manifest.externalArtifactRoots',
  );
  const tfDataRoot = requireExternalAbsolutePath(
    externalRoots.tfDataRoot,
    'manifest.externalArtifactRoots.tfDataRoot',
  );
  const savedPlanRoot = requireExternalAbsolutePath(
    externalRoots.savedPlanRoot,
    'manifest.externalArtifactRoots.savedPlanRoot',
  );
  requireExactValue(
    externalRoots,
    { tfDataRoot, savedPlanRoot },
    'manifest.externalArtifactRoots',
  );

  const expectedContext = {
    executionId,
    sourceSha,
    environment: manifest.environment,
    candidateImageReference,
    candidateTag,
    candidateRevision,
    stableApiRevision,
    currentImages,
    runtimeState,
    edgeState,
    tfDataRoot,
    savedPlanRoot,
  };
  const expectedGates = contract.remainingStages.map((gate, gateIndex) => ({
    id: gate.id,
    sequence: gateIndex + 1,
    blocking: true,
    operations: buildGateOperations(expectedContext, gate, gateIndex),
  }));
  if (
    !Array.isArray(manifest.gates) ||
    manifest.gates.length !== expectedGates.length ||
    manifest.gates.some((gate, index) => gate.id !== expectedGates[index].id)
  ) {
    fail(
      'GATE_ORDER_MISMATCH',
      'manifest gate order differs from the contract.',
    );
  }

  const hashes = new Set();
  for (const [gateIndex, gate] of manifest.gates.entries()) {
    const expectedGate = expectedGates[gateIndex];
    requireExactKeys(
      gate,
      ['id', 'sequence', 'blocking', 'status', 'operations'],
      `manifest.gates[${gateIndex}]`,
    );
    requireExactValue(
      {
        id: gate.id,
        sequence: gate.sequence,
        blocking: gate.blocking,
      },
      {
        id: expectedGate.id,
        sequence: expectedGate.sequence,
        blocking: expectedGate.blocking,
      },
      `manifest.gates[${gateIndex}]`,
    );
    if (
      !Array.isArray(gate.operations) ||
      gate.operations.length !== expectedGate.operations.length
    ) {
      fail(
        'MANIFEST_SPEC_MISMATCH',
        `${gate.id} operation count differs from the governed specification.`,
      );
    }
    for (const [operationIndex, operation] of gate.operations.entries()) {
      const expectedOperation = expectedGate.operations[operationIndex];
      requireExactValue(
        immutableOperationSpecification(operation),
        immutableOperationSpecification(expectedOperation),
        `${gate.id}.${expectedOperation.id}`,
      );
      if (operation.kind === 'terraform' && operation.planEvidence?.sha256) {
        if (
          operation.planEvidence.sha256 === BLOCKED_SAVED_PLAN_SHA256 ||
          hashes.has(operation.planEvidence.sha256)
        ) {
          fail(
            'PLAN_REUSE_FORBIDDEN',
            'saved plan hash is blocked or duplicated.',
          );
        }
        hashes.add(operation.planEvidence.sha256);
      }
      const label = `${gate.id}.${expectedOperation.id}`;
      if (operation.kind === 'terraform') {
        validateTerraformLifecycle(operation, label);
        validateStatePrecondition(
          manifest,
          operation,
          expectedOperation,
          label,
        );
      } else {
        validateVerificationLifecycle(operation, label);
      }
    }
  }

  requireExactValue(
    manifest.candidateEdgeCleanupTemplate,
    {
      authoritativeReleaseGate: false,
      requiresSeparatePostReleaseApproval: true,
      terraformRoot: EDGE_ROOT,
      requiredVariables: {
        candidate_edge_enabled: false,
        candidate_api_tag: null,
      },
      expectedResourceAddressAllowlist: EDGE_CANDIDATE_RESOURCE_ADDRESSES,
      expectedChangeType:
        'destroy-candidate-neg-and-backend-plus-remove-narrow-url-map-route',
    },
    'manifest.candidateEdgeCleanupTemplate',
  );
  requireExactValue(
    manifest.blockedSavedPlanHashes,
    [BLOCKED_SAVED_PLAN_SHA256],
    'manifest.blockedSavedPlanHashes',
  );
  validateReleaseLifecycle(manifest);
  return manifest;
}

function registerPlan(manifest, options) {
  validateManifest(manifest);
  assertSourceBinding(manifest);
  const { gate, operation } = findOperation(
    manifest,
    options.gateId,
    options.operationId,
  );
  assertReleaseCanAdvance(manifest, gate, operation);
  if (operation.kind !== 'terraform') {
    fail(
      'PLAN_NOT_APPLICABLE',
      `${operation.id} is not a Terraform operation.`,
    );
  }
  if (
    operation.status !== 'pending' ||
    operation.planEvidence.status !== 'not-created'
  ) {
    fail(
      'PLAN_ALREADY_REGISTERED',
      `${operation.id} already has plan evidence.`,
    );
  }
  if (operation.statePrecondition.status !== 'bound') {
    fail(
      'STATE_PRECONDITION_UNBOUND',
      `${operation.id} is waiting for predecessor state evidence.`,
    );
  }
  const suppliedPlanPath = requireExternalAbsolutePath(
    options.planPath,
    'planPath',
  );
  if (path.resolve(operation.savedPlanPath) !== suppliedPlanPath) {
    fail(
      'PLAN_PATH_MISMATCH',
      'planPath differs from the governed saved-plan path.',
    );
  }
  if (!fs.statSync(suppliedPlanPath, { throwIfNoEntry: false })?.isFile()) {
    fail('PLAN_FILE_MISSING', 'saved plan file does not exist.');
  }
  if (
    options.sourceSha !== manifest.sourceSha ||
    options.environment !== manifest.environment ||
    normalizeRelativeRoot(options.terraformRoot, 'terraformRoot') !==
      operation.terraformRoot ||
    options.lineage !== operation.statePrecondition.lineage ||
    Number(options.serial) !== operation.statePrecondition.serial
  ) {
    fail(
      'PLAN_BINDING_MISMATCH',
      'plan metadata differs from source/root/environment/lineage/serial preconditions.',
    );
  }
  if (gate.id === 'traffic-promotion') {
    assertPromotionPrerequisites(manifest);
  }
  const planBytes = fs.readFileSync(suppliedPlanPath);
  if (planBytes.length === 0) {
    fail('PLAN_FILE_INVALID', 'saved plan file must not be empty.');
  }
  const planSha = sha256(planBytes);
  if (
    planSha === BLOCKED_SAVED_PLAN_SHA256 ||
    flattenOperations(manifest).some(
      ({ operation: candidate }) =>
        candidate !== operation && candidate.planEvidence?.sha256 === planSha,
    )
  ) {
    fail(
      'PLAN_REUSE_FORBIDDEN',
      'saved plan hash is blocked or already registered.',
    );
  }
  operation.planEvidence = {
    status: 'registered',
    sha256: planSha,
    sizeBytes: planBytes.length,
    registeredAt: requireIsoTimestamp(options.recordedAt, 'recordedAt'),
    reviewed: false,
  };
  operation.status = 'plan-registered';
  return manifest;
}

function approvePlan(manifest, options) {
  validateManifest(manifest);
  assertSourceBinding(manifest);
  const { gate, operation } = findOperation(
    manifest,
    options.gateId,
    options.operationId,
  );
  assertReleaseCanAdvance(manifest, gate, operation);
  if (
    operation.kind !== 'terraform' ||
    operation.status !== 'plan-registered' ||
    operation.planEvidence.status !== 'registered' ||
    operation.apply.attempted
  ) {
    fail('PLAN_NOT_APPROVABLE', `${operation.id} is not awaiting approval.`);
  }
  const approver = requireString(options.approver, 'approver');
  const approvalRef = requireString(options.approvalRef, 'approvalRef');
  const approvedAt = requireIsoTimestamp(options.recordedAt, 'recordedAt');
  operation.planEvidence.reviewed = true;
  operation.approval = {
    status: 'approved',
    approver,
    approvalRef,
    approvedAt,
  };
  operation.status = 'approved';
  return manifest;
}

function stopRelease(manifest, gate, operation, evidenceRef, recordedAt) {
  operation.status = 'failed';
  gate.status = 'failed';
  manifest.releaseStatus = 'failed';
  manifest.failedGateId = gate.id;
  const operationIndex = gate.operations.indexOf(operation);
  for (const laterOperation of gate.operations.slice(operationIndex + 1)) {
    laterOperation.status = 'blocked';
  }
  const gateIndex = manifest.gates.indexOf(gate);
  for (const laterGate of manifest.gates.slice(gateIndex + 1)) {
    laterGate.status = 'blocked';
    for (const laterOperation of laterGate.operations) {
      laterOperation.status = 'blocked';
    }
  }
  return { evidenceRef, recordedAt };
}

function recordApply(manifest, options) {
  validateManifest(manifest);
  assertSourceBinding(manifest);
  const { gate, operation } = findOperation(
    manifest,
    options.gateId,
    options.operationId,
  );
  assertReleaseCanAdvance(manifest, gate, operation);
  if (
    operation.kind !== 'terraform' ||
    operation.status !== 'approved' ||
    operation.approval.status !== 'approved' ||
    operation.apply.attempted ||
    operation.singleConsumptionStatus !== 'unconsumed'
  ) {
    fail(
      'PLAN_APPLY_REUSE_FORBIDDEN',
      `${operation.id} cannot record another apply.`,
    );
  }
  const recordedAt = requireIsoTimestamp(options.recordedAt, 'recordedAt');
  const evidenceRef = requireString(options.evidenceRef, 'evidenceRef');
  if (!['succeeded', 'failed'].includes(options.result)) {
    fail('INVALID_INPUT', 'apply result must be succeeded or failed.');
  }
  let postApplyState = null;
  if (options.result === 'succeeded') {
    postApplyState = requireState(
      {
        lineage: options.postLineage,
        serial: Number(options.postSerial),
      },
      'postApplyState',
    );
    if (
      postApplyState.lineage !== operation.statePrecondition.lineage ||
      postApplyState.serial <= operation.statePrecondition.serial
    ) {
      fail(
        'POST_APPLY_STATE_INVALID',
        'post-apply lineage must be unchanged and serial must increase.',
      );
    }
  }
  operation.apply.attempted = true;
  operation.apply.evidenceRef = evidenceRef;
  operation.apply.recordedAt = recordedAt;
  if (options.result === 'failed') {
    operation.apply.status = 'failed';
    operation.singleConsumptionStatus = 'invalidated-after-failed-attempt';
    stopRelease(manifest, gate, operation, evidenceRef, recordedAt);
    return manifest;
  }
  operation.apply.status = 'succeeded';
  operation.apply.postApplyState = postApplyState;
  operation.singleConsumptionStatus = 'consumed-success';
  operation.status = 'applied-awaiting-live-verification';
  return manifest;
}

function normalizeObservations(options) {
  const observations = {};
  for (const [optionKey, outputKey] of [
    ['observedImage', 'observedImage'],
    ['observedRevision', 'observedRevision'],
    ['observedCandidateTag', 'observedCandidateTag'],
    ['observedPublicPath', 'observedPublicPath'],
    ['observedBackendPath', 'observedBackendPath'],
  ]) {
    if (options[optionKey] !== undefined) {
      observations[outputKey] = requireString(options[optionKey], optionKey);
    }
  }
  if (options.httpStatus !== undefined) {
    const status = Number(options.httpStatus);
    if (!Number.isInteger(status) || status < 100 || status > 599) {
      fail('INVALID_INPUT', 'httpStatus must be an integer HTTP status.');
    }
    observations.httpStatus = status;
  }
  for (const [optionKey, outputKey] of [
    ['observedStablePercent', 'observedStablePercent'],
    ['observedCandidatePercent', 'observedCandidatePercent'],
  ]) {
    if (options[optionKey] === undefined) continue;
    const percent = Number(options[optionKey]);
    if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
      fail(
        'INVALID_INPUT',
        `${optionKey} must be an integer from 0 through 100.`,
      );
    }
    observations[outputKey] = percent;
  }
  return observations;
}

function assertVerificationMatches(operation, observations) {
  const expected = operation.verificationExpectation ?? {};
  const comparisons = [
    ['image', 'observedImage'],
    ['revision', 'observedRevision'],
    ['candidateTag', 'observedCandidateTag'],
    ['publicPath', 'observedPublicPath'],
    ['backendPath', 'observedBackendPath'],
    ['stablePercent', 'observedStablePercent'],
    ['candidatePercent', 'observedCandidatePercent'],
    ['httpStatus', 'httpStatus'],
  ];
  for (const [expectedKey, observedKey] of comparisons) {
    if (
      expected[expectedKey] !== undefined &&
      expected[expectedKey] !== observations[observedKey]
    ) {
      fail(
        'LIVE_VERIFICATION_MISMATCH',
        `${operation.id} ${observedKey} did not match the governed expectation.`,
      );
    }
  }
}

function bindSuccessorState(manifest, operation) {
  if (operation.kind !== 'terraform' || !operation.apply.postApplyState) return;
  for (const { operation: successor } of flattenOperations(manifest)) {
    if (
      successor.kind === 'terraform' &&
      successor.statePrecondition.boundFromOperationId === operation.id
    ) {
      successor.statePrecondition = {
        lineage: operation.apply.postApplyState.lineage,
        serial: operation.apply.postApplyState.serial,
        boundFromOperationId: operation.id,
        status: 'bound',
      };
    }
  }
}

function recordVerification(manifest, options) {
  validateManifest(manifest);
  assertSourceBinding(manifest);
  const { gate, operation } = findOperation(
    manifest,
    options.gateId,
    options.operationId,
  );
  assertReleaseCanAdvance(manifest, gate, operation);
  if (
    operation.status === 'passed' ||
    operation.liveVerification.status !== 'pending'
  ) {
    fail(
      'VERIFICATION_ALREADY_RECORDED',
      `${operation.id} is already verified.`,
    );
  }
  if (
    operation.kind === 'terraform' &&
    operation.status !== 'applied-awaiting-live-verification'
  ) {
    fail('VERIFICATION_OUT_OF_ORDER', `${operation.id} must be applied first.`);
  }
  if (operation.kind === 'verification' && operation.status !== 'pending') {
    fail(
      'VERIFICATION_OUT_OF_ORDER',
      `${operation.id} cannot be verified now.`,
    );
  }
  const recordedAt = requireIsoTimestamp(options.recordedAt, 'recordedAt');
  const evidenceRef = requireString(options.evidenceRef, 'evidenceRef');
  const observations = normalizeObservations(options);
  if (options.result === 'failed') {
    operation.liveVerification = {
      status: 'failed',
      evidenceRef,
      recordedAt,
      observations,
    };
    stopRelease(manifest, gate, operation, evidenceRef, recordedAt);
    return manifest;
  }
  if (options.result !== 'passed') {
    fail('INVALID_INPUT', 'verification result must be passed or failed.');
  }
  assertVerificationMatches(operation, observations);
  operation.liveVerification = {
    status: 'passed',
    evidenceRef,
    recordedAt,
    observations,
  };
  operation.status = 'passed';
  bindSuccessorState(manifest, operation);
  if (gate.operations.every((candidate) => candidate.status === 'passed')) {
    gate.status = 'passed';
  }
  if (manifest.gates.every((candidate) => candidate.status === 'passed')) {
    manifest.releaseStatus = 'complete';
  } else if (manifest.releaseStatus === 'pending') {
    manifest.releaseStatus = 'in-progress';
  }
  return manifest;
}

function writeJsonAtomic(filePath, value) {
  const resolved = requireExternalAbsolutePath(filePath, 'manifestPath');
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const temporary = `${resolved}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  fs.renameSync(temporary, resolved);
}

function parseCliArguments(argv) {
  const [command, ...rest] = argv;
  if (!command) fail('CLI_USAGE', 'a command is required.');
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (!flag?.startsWith('--') || value === undefined) {
      fail('CLI_USAGE', `invalid command argument near ${flag ?? '<end>'}.`);
    }
    const key = flag
      .slice(2)
      .replace(/-([a-z])/gu, (_, character) => character.toUpperCase());
    if (Object.hasOwn(options, key)) {
      fail('CLI_USAGE', `duplicate option: ${flag}`);
    }
    options[key] = value;
  }
  return { command, options };
}

function requireCliOption(options, key) {
  if (!Object.hasOwn(options, key)) {
    fail(
      'CLI_USAGE',
      `--${key.replace(/[A-Z]/gu, (value) => `-${value.toLowerCase()}`)} is required.`,
    );
  }
  return options[key];
}

function loadManifestForUpdate(options) {
  const manifestPath = requireExternalAbsolutePath(
    requireCliOption(options, 'manifest'),
    'manifestPath',
  );
  const manifest = readJson(manifestPath, 'release manifest');
  return { manifestPath, manifest };
}

function runCli(argv = process.argv.slice(2)) {
  const { command, options } = parseCliArguments(argv);
  if (command === 'create-spec') {
    const inputPath = path.resolve(requireCliOption(options, 'input'));
    const outputPath = requireExternalAbsolutePath(
      requireCliOption(options, 'output'),
      'output',
    );
    const manifest = buildManifest(readJson(inputPath, 'release context'));
    writeJsonAtomic(outputPath, manifest);
    return {
      command,
      manifestPath: outputPath,
      status: manifest.releaseStatus,
    };
  }
  if (command === 'validate-spec') {
    const manifestPath = requireExternalAbsolutePath(
      requireCliOption(options, 'manifest'),
      'manifestPath',
    );
    const manifest = validateManifest(
      readJson(manifestPath, 'release manifest'),
    );
    assertSourceBinding(manifest);
    return { command, manifestPath, status: manifest.releaseStatus };
  }
  const { manifestPath, manifest } = loadManifestForUpdate(options);
  const shared = {
    gateId: requireCliOption(options, 'gate'),
    operationId: requireCliOption(options, 'operation'),
    recordedAt: requireCliOption(options, 'recordedAt'),
  };
  if (command === 'register-plan') {
    registerPlan(manifest, {
      ...shared,
      planPath: requireCliOption(options, 'plan'),
      sourceSha: requireCliOption(options, 'sourceSha'),
      environment: requireCliOption(options, 'environment'),
      terraformRoot: requireCliOption(options, 'terraformRoot'),
      lineage: requireCliOption(options, 'lineage'),
      serial: requireCliOption(options, 'serial'),
    });
  } else if (command === 'approve-plan') {
    approvePlan(manifest, {
      ...shared,
      approver: requireCliOption(options, 'approver'),
      approvalRef: requireCliOption(options, 'approvalRef'),
    });
  } else if (command === 'record-apply') {
    recordApply(manifest, {
      ...shared,
      result: requireCliOption(options, 'result'),
      evidenceRef: requireCliOption(options, 'evidenceRef'),
      postLineage: options.postLineage,
      postSerial: options.postSerial,
    });
  } else if (command === 'record-verification') {
    recordVerification(manifest, {
      ...shared,
      result: requireCliOption(options, 'result'),
      evidenceRef: requireCliOption(options, 'evidenceRef'),
      observedImage: options.observedImage,
      observedRevision: options.observedRevision,
      observedCandidateTag: options.observedCandidateTag,
      observedPublicPath: options.observedPublicPath,
      observedBackendPath: options.observedBackendPath,
      observedStablePercent: options.observedStablePercent,
      observedCandidatePercent: options.observedCandidatePercent,
      httpStatus: options.httpStatus,
    });
  } else {
    fail('CLI_USAGE', `unknown command: ${command}`);
  }
  validateManifest(manifest);
  writeJsonAtomic(manifestPath, manifest);
  return { command, manifestPath, status: manifest.releaseStatus };
}

if (require.main === module) {
  try {
    const result = runCli();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const code =
      error instanceof DeploymentControlError ? error.code : 'UNEXPECTED';
    process.stderr.write(`${code}: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = Object.freeze({
  BLOCKED_SAVED_PLAN_SHA256,
  DeploymentControlError,
  EDGE_CANDIDATE_RESOURCE_ADDRESSES,
  REPOSITORY,
  RUNTIME_RESOURCE_ADDRESSES,
  SMOKE_BACKEND_PATH,
  SMOKE_PUBLIC_PATH,
  approvePlan,
  buildManifest,
  currentSourceSha,
  expectedCandidateTag,
  loadReleaseContract,
  recordApply,
  recordVerification,
  registerPlan,
  runCli,
  validateManifest,
  writeJsonAtomic,
});
