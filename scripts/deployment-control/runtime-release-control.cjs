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
const RECOVERY_RESUME_GATE_ID = 'api-no-traffic-promotion';
const SUCCESSFUL_CONTINUATION_MODE = 'successful-edge-continuation';
const EDGE_STATE_SUCCESSOR_RECOVERY_MODE =
  'successful-edge-state-successor-recovery';
const SUCCESSFUL_CONTINUATION_RESUME_GATE_ID = 'api-no-traffic-promotion';
const SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID =
  'api-candidate-edge-reconciliation';
const MAX_RECOVERY_ATTEMPT = 999999999999999;
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

const EDGE_CANDIDATE_RECONCILIATION_RESOURCE_ADDRESSES = Object.freeze(
  EDGE_CANDIDATE_RESOURCE_ADDRESSES.slice(0, 2),
);

const GOOGLE_PROVIDER_NAME = 'registry.terraform.io/hashicorp/google';
const EDGE_REFRESH_ONLY_DRIFT_RESOURCE_ADDRESSES = Object.freeze([
  EDGE_CANDIDATE_RECONCILIATION_RESOURCE_ADDRESSES[1],
  'module.edge_environment.google_certificate_manager_certificate_map.edge',
  'module.edge_environment.google_certificate_manager_certificate_map_entry.host["admin"]',
  'module.edge_environment.google_certificate_manager_certificate_map_entry.host["api"]',
  'module.edge_environment.google_certificate_manager_certificate_map_entry.host["schools"]',
]);

const EDGE_CERTIFICATE_DRIFT_TYPES = Object.freeze({
  [EDGE_REFRESH_ONLY_DRIFT_RESOURCE_ADDRESSES[1]]:
    'google_certificate_manager_certificate_map',
  [EDGE_REFRESH_ONLY_DRIFT_RESOURCE_ADDRESSES[2]]:
    'google_certificate_manager_certificate_map_entry',
  [EDGE_REFRESH_ONLY_DRIFT_RESOURCE_ADDRESSES[3]]:
    'google_certificate_manager_certificate_map_entry',
  [EDGE_REFRESH_ONLY_DRIFT_RESOURCE_ADDRESSES[4]]:
    'google_certificate_manager_certificate_map_entry',
});

const CANDIDATE_EDGE_IDENTITIES = Object.freeze({
  negName: 'moazez-staging-api-candidate-neg',
  backendName: 'moazez-staging-api-candidate-backend',
  urlMapName: 'moazez-staging-edge-url-map',
  cloudRunService: 'moazez-staging-api',
  region: 'me-central2',
  networkEndpointType: 'SERVERLESS',
  protocol: 'HTTP',
  loadBalancingScheme: 'EXTERNAL_MANAGED',
  trustedClientIpHeader: 'X-Moazez-Client-IP:{client_ip_address}',
});

function successfulContinuationPlanReviewSpecification() {
  const [candidateNegAddress, candidateBackendAddress] =
    EDGE_CANDIDATE_RECONCILIATION_RESOURCE_ADDRESSES;
  const exactEmptyStringToNull = (canonicalPath) => ({
    canonicalPath,
    before: '',
    after: null,
  });
  const certificateDrift = (address) => ({
    mode: 'managed',
    type: EDGE_CERTIFICATE_DRIFT_TYPES[address],
    providerName: GOOGLE_PROVIDER_NAME,
    actions: ['update'],
    exactChangedCanonicalPaths: ['update_time'],
    correspondingNonNoopResourceChange: 'forbidden',
  });
  return {
    expectedResourcePlanIdentities: {
      [candidateNegAddress]: {
        mode: 'managed',
        type: 'google_compute_region_network_endpoint_group',
        providerName: GOOGLE_PROVIDER_NAME,
      },
      [candidateBackendAddress]: {
        mode: 'managed',
        type: 'google_compute_backend_service',
        providerName: GOOGLE_PROVIDER_NAME,
      },
    },
    allowedProviderNormalizations: {
      [candidateNegAddress]: [
        {
          canonicalPath: 'region',
          transition: 'regional-self-link-to-region-name',
          expectedRegion: CANDIDATE_EDGE_IDENTITIES.region,
        },
        exactEmptyStringToNull('cloud_run[0].url_mask'),
        exactEmptyStringToNull('description'),
        exactEmptyStringToNull('psc_target_service'),
        exactEmptyStringToNull('subnetwork'),
      ],
    },
    allowedRefreshOnlyDrift: {
      [candidateBackendAddress]: {
        mode: 'managed',
        type: 'google_compute_backend_service',
        providerName: GOOGLE_PROVIDER_NAME,
        actions: ['update'],
        exactProviderNormalizations: [
          {
            canonicalPath: 'custom_response_headers',
            before: null,
            after: [],
          },
          {
            canonicalPath: 'health_checks',
            before: null,
            after: [],
          },
        ],
        correspondingNonNoopResourceChange: 'allowed',
      },
      ...Object.fromEntries(
        EDGE_REFRESH_ONLY_DRIFT_RESOURCE_ADDRESSES.slice(1).map((address) => [
          address,
          certificateDrift(address),
        ]),
      ),
    },
    planReviewRequirements: {
      schemaVersion: 1,
      required: true,
      compatiblePlanJsonFormatMajor: 1,
      planJsonDerivationAuthority:
        'devops-guarded-export-from-exact-saved-plan',
    },
  };
}

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

const RECOVERY_PREDECESSOR_STAGE_IDS = Object.freeze([
  'artifact-and-checksum-preflight',
  'backup-and-data-authority-checkpoint',
  'migration-job',
  'migration-status-and-drift-verification',
  'core-worker-promotion',
  'media-worker-promotion',
]);

const RECOVERY_GATE_IDS = Object.freeze([
  RECOVERY_RESUME_GATE_ID,
  'maintenance-scheduler-promotion',
  'protected-readiness-and-smoke',
  'traffic-promotion',
]);

const SUCCESSFUL_CONTINUATION_GATE_IDS = Object.freeze([
  SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
  'maintenance-scheduler-promotion',
  'protected-readiness-and-smoke',
  'traffic-promotion',
]);

const EDGE_STATE_SUCCESSOR_RECOVERY_GATE_IDS = SUCCESSFUL_CONTINUATION_GATE_IDS;

function isRetainedCandidateEdgeReconciliationMode(executionMode) {
  return (
    executionMode === SUCCESSFUL_CONTINUATION_MODE ||
    executionMode === EDGE_STATE_SUCCESSOR_RECOVERY_MODE
  );
}

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
  const contractText = raw.toString('utf8');
  const lfContractText = contractText.replaceAll('\r\n', '\n');
  const crlfContractText = lfContractText.replaceAll('\n', '\r\n');
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
    equivalentTextContractSha256s: Object.freeze([
      ...new Set([
        sha256(Buffer.from(lfContractText, 'utf8')),
        sha256(Buffer.from(crlfContractText, 'utf8')),
      ]),
    ]),
    predecessorStages: contract.stages.slice(0, firstRemaining),
    remainingStages,
  });
}

function requireRecoveryAttempt(value, label = 'recoveryAttempt') {
  if (
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > MAX_RECOVERY_ATTEMPT
  ) {
    fail(
      'RECOVERY_ATTEMPT_INVALID',
      `${label} must be an integer from 1 through ${MAX_RECOVERY_ATTEMPT}.`,
    );
  }
  return value;
}

function expectedCandidateTag(imageReference, recoveryAttempt = null) {
  const baseTag = `candidate-${sha256(imageReference).slice(0, 12)}`;
  if (recoveryAttempt === null || recoveryAttempt === undefined) {
    return baseTag;
  }
  return `${baseTag}-r${requireRecoveryAttempt(recoveryAttempt)}`;
}

function stagingImagePattern() {
  return /^me-central2-docker[.]pkg[.]dev\/moazez-nonprod-91001421934\/moazez-staging-containers\/moazez-backend@sha256:[a-f0-9]{64}$/u;
}

function validateImageReference(value, label) {
  requireString(value, label, stagingImagePattern());
  return value;
}

function validateManifestV1LiveDiscovery(
  value,
  candidate,
  label = 'liveDiscovery',
  options = {},
) {
  const strictManifest = options.strictManifest === true;
  const requireCandidateEdgePreflight =
    options.requireCandidateEdgePreflight === true;
  const normalKeys = [
    'evidenceRef',
    'discoveredAt',
    'apiTrafficMode',
    'stableApiRevision',
    'runtimeImages',
    'runtimeState',
    'edgeState',
  ];
  const legacyPromotedKeys = [
    'evidenceRef',
    'discoveredAt',
    'apiTrafficMode',
    'promotedBaseline',
    'runtimeImages',
    'runtimeState',
    'edgeState',
  ];
  const promotedKeys = [...legacyPromotedKeys, 'candidateEdgeResources'];
  let live = requireObject(value, label);
  const evidenceRef = requireString(live.evidenceRef, `${label}.evidenceRef`);
  const discoveredAt = requireIsoTimestamp(
    live.discoveredAt,
    `${label}.discoveredAt`,
  );
  if (!['normal', 'candidate_promoted'].includes(live.apiTrafficMode)) {
    fail(
      'LIVE_TRAFFIC_BASELINE_UNSAFE',
      `${label}.apiTrafficMode must be normal or candidate_promoted before the remaining sequence.`,
    );
  }
  if (live.apiTrafficMode === 'candidate_promoted') {
    const hasCandidateEdgePreflight = Object.hasOwn(
      live,
      'candidateEdgeResources',
    );
    if (requireCandidateEdgePreflight && !hasCandidateEdgePreflight) {
      fail(
        'CANDIDATE_EDGE_PREFLIGHT_REQUIRED',
        `${label}.candidateEdgeResources must prove that retained Candidate Edge resources are absent before a promoted-baseline rollout starts.`,
      );
    }
    live = requireExactKeys(
      live,
      hasCandidateEdgePreflight ? promotedKeys : legacyPromotedKeys,
      label,
    );
  } else if (strictManifest) {
    live = requireExactKeys(live, normalKeys, label);
  } else if (Object.hasOwn(live, 'promotedBaseline')) {
    fail(
      'LIVE_TRAFFIC_BASELINE_UNSAFE',
      `${label}.promotedBaseline is valid only for candidate_promoted traffic.`,
    );
  }

  const runtimeImageKeys = [
    'api',
    'coreWorker',
    'mediaWorker',
    'maintenanceScheduler',
  ];
  const discoveredImages =
    live.apiTrafficMode === 'candidate_promoted' || strictManifest
      ? requireExactKeys(
          live.runtimeImages,
          runtimeImageKeys,
          `${label}.runtimeImages`,
        )
      : requireObject(live.runtimeImages, `${label}.runtimeImages`);
  const currentImages = {
    api: validateImageReference(
      discoveredImages.api,
      `${label}.runtimeImages.api`,
    ),
    coreWorker: validateImageReference(
      discoveredImages.coreWorker,
      `${label}.runtimeImages.coreWorker`,
    ),
    mediaWorker: validateImageReference(
      discoveredImages.mediaWorker,
      `${label}.runtimeImages.mediaWorker`,
    ),
    maintenanceScheduler: validateImageReference(
      discoveredImages.maintenanceScheduler,
      `${label}.runtimeImages.maintenanceScheduler`,
    ),
  };
  const exactLiveShape =
    live.apiTrafficMode === 'candidate_promoted' || strictManifest;
  const runtimeState = requireState(
    exactLiveShape
      ? requireExactKeys(
          live.runtimeState,
          ['lineage', 'serial'],
          `${label}.runtimeState`,
        )
      : live.runtimeState,
    `${label}.runtimeState`,
  );
  const edgeState = requireState(
    exactLiveShape
      ? requireExactKeys(
          live.edgeState,
          ['lineage', 'serial'],
          `${label}.edgeState`,
        )
      : live.edgeState,
    `${label}.edgeState`,
  );
  let candidateEdgeResources;
  if (
    live.apiTrafficMode === 'candidate_promoted' &&
    Object.hasOwn(live, 'candidateEdgeResources')
  ) {
    const candidateEdge = requireExactKeys(
      live.candidateEdgeResources,
      [
        'candidateNegPresent',
        'candidateBackendPresent',
        'candidateSmokeRoutePresent',
      ],
      `${label}.candidateEdgeResources`,
    );
    candidateEdgeResources = {
      candidateNegPresent: candidateEdge.candidateNegPresent,
      candidateBackendPresent: candidateEdge.candidateBackendPresent,
      candidateSmokeRoutePresent: candidateEdge.candidateSmokeRoutePresent,
    };
    if (
      candidateEdgeResources.candidateNegPresent !== false ||
      candidateEdgeResources.candidateBackendPresent !== false ||
      candidateEdgeResources.candidateSmokeRoutePresent !== false
    ) {
      fail(
        'CANDIDATE_EDGE_PREFLIGHT_UNSAFE',
        'a promoted-baseline release cannot start while complete or partial Candidate Edge resources are retained; cleanup or reconciliation requires separate approval.',
      );
    }
  }

  if (live.apiTrafficMode === 'normal') {
    const stableApiRevision = requireString(
      live.stableApiRevision,
      `${label}.stableApiRevision`,
      /^moazez-staging-api-[a-z0-9][a-z0-9-]{0,42}[a-z0-9]$/u,
    );
    if (stableApiRevision === candidate.revision) {
      if (strictManifest) {
        fail(
          'CANDIDATE_IDENTITY_MISMATCH',
          'manifest candidate image, tag, revision, and stable identity are inconsistent.',
        );
      }
      fail(
        'AMBIGUOUS_API_REVISIONS',
        'stable and candidate revision identities must be distinct.',
      );
    }
    const normalized = {
      evidenceRef,
      discoveredAt,
      apiTrafficMode: 'normal',
      stableApiRevision,
      runtimeImages: currentImages,
      runtimeState,
      edgeState,
    };
    if (strictManifest) {
      requireExactValue(live, normalized, label);
    }
    return {
      liveDiscovery: normalized,
      currentImages,
      stableApiRevision,
      runtimeState,
      edgeState,
      preApiTraffic: ['normal', null, null],
    };
  }

  const promoted = requireExactKeys(
    live.promotedBaseline,
    [
      'previousStableRevision',
      'previousStableTrafficPercent',
      'promotedRevision',
      'promotedTrafficPercent',
      'promotedCandidateTag',
      'promotedImageReference',
    ],
    `${label}.promotedBaseline`,
  );
  const previousStableRevision = requireString(
    promoted.previousStableRevision,
    `${label}.promotedBaseline.previousStableRevision`,
    /^moazez-staging-api-[a-z0-9][a-z0-9-]{0,42}[a-z0-9]$/u,
  );
  const promotedRevision = requireString(
    promoted.promotedRevision,
    `${label}.promotedBaseline.promotedRevision`,
    /^moazez-staging-api-[a-z0-9][a-z0-9-]{0,42}[a-z0-9]$/u,
  );
  const promotedCandidateTag = requireString(
    promoted.promotedCandidateTag,
    `${label}.promotedBaseline.promotedCandidateTag`,
    /^candidate-[a-f0-9]{12}(?:-r[1-9][0-9]{0,14})?$/u,
  );
  const promotedImageReference = validateImageReference(
    promoted.promotedImageReference,
    `${label}.promotedBaseline.promotedImageReference`,
  );
  const promotedBaseTag = expectedCandidateTag(promotedImageReference);
  const promotedTagMatchesImage =
    promotedCandidateTag === promotedBaseTag ||
    new RegExp(`^${promotedBaseTag}-r[1-9][0-9]{0,14}$`, 'u').test(
      promotedCandidateTag,
    );
  const identities = new Set([
    previousStableRevision,
    promotedRevision,
    candidate.revision,
  ]);
  if (
    promoted.previousStableTrafficPercent !== 0 ||
    promoted.promotedTrafficPercent !== 100 ||
    promotedRevision !== `moazez-staging-api-${promotedCandidateTag}` ||
    promotedImageReference !== currentImages.api ||
    promotedImageReference === candidate.imageReference ||
    !promotedTagMatchesImage ||
    promotedBaseTag === candidate.tag ||
    promotedCandidateTag === candidate.tag ||
    identities.size !== 3
  ) {
    fail(
      'LIVE_TRAFFIC_BASELINE_UNSAFE',
      'candidate_promoted live discovery contains contradictory traffic, revision, tag, image, or release-candidate identities.',
    );
  }
  const promotedBaseline = {
    previousStableRevision,
    previousStableTrafficPercent: 0,
    promotedRevision,
    promotedTrafficPercent: 100,
    promotedCandidateTag,
    promotedImageReference,
  };
  const normalized = {
    evidenceRef,
    discoveredAt,
    apiTrafficMode: 'candidate_promoted',
    promotedBaseline,
    runtimeImages: currentImages,
    runtimeState,
    edgeState,
    ...(candidateEdgeResources ? { candidateEdgeResources } : {}),
  };
  if (strictManifest) {
    requireExactValue(live, normalized, label);
  }
  return {
    liveDiscovery: normalized,
    currentImages,
    stableApiRevision: promotedRevision,
    runtimeState,
    edgeState,
    preApiTraffic: [
      'candidate_promoted',
      previousStableRevision,
      promotedCandidateTag,
    ],
  };
}

function recoveryContractWindow(contract) {
  const resumeIndex = contract.contract.stages.findIndex(
    (stage) => stage.id === RECOVERY_RESUME_GATE_ID,
  );
  const predecessorStages = contract.contract.stages.slice(0, resumeIndex);
  const recoveryStages = contract.contract.stages.slice(resumeIndex);
  if (
    resumeIndex < 0 ||
    !isDeepStrictEqual(
      predecessorStages.map((stage) => stage.id),
      RECOVERY_PREDECESSOR_STAGE_IDS,
    ) ||
    !isDeepStrictEqual(
      recoveryStages.map((stage) => stage.id),
      RECOVERY_GATE_IDS,
    )
  ) {
    fail(
      'CONTRACT_UNSUPPORTED',
      'the authoritative contract does not contain the approved API-first recovery window.',
    );
  }
  return { predecessorStages, recoveryStages };
}

function successfulContinuationContractWindow(contract) {
  const resumeIndex = contract.contract.stages.findIndex(
    (stage) => stage.id === SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
  );
  const predecessorStages = contract.contract.stages.slice(0, resumeIndex);
  const continuationStages = contract.contract.stages.slice(resumeIndex);
  if (
    resumeIndex < 0 ||
    !isDeepStrictEqual(
      predecessorStages.map((stage) => stage.id),
      RECOVERY_PREDECESSOR_STAGE_IDS,
    ) ||
    !isDeepStrictEqual(
      continuationStages.map((stage) => stage.id),
      SUCCESSFUL_CONTINUATION_GATE_IDS,
    )
  ) {
    fail(
      'CONTRACT_UNSUPPORTED',
      'the authoritative contract does not contain the approved successful Edge-continuation window.',
    );
  }
  return { predecessorStages, continuationStages };
}

function validateRecoveryPredecessorEvidence(inputStages, predecessorStages) {
  if (
    !Array.isArray(inputStages) ||
    inputStages.length !== predecessorStages.length
  ) {
    fail(
      'PREDECESSOR_EVIDENCE_REQUIRED',
      'recovery predecessor evidence must cover the first six stages.',
    );
  }
  return predecessorStages.map((stage, index) => {
    const supplied = requireExactKeys(
      inputStages[index],
      ['id', 'status', 'evidenceRef'],
      `completedPredecessorStages[${index}]`,
    );
    if (supplied.id !== stage.id || supplied.status !== 'passed') {
      fail(
        'PREDECESSOR_EVIDENCE_REQUIRED',
        `predecessor stage ${stage.id} must be passed in contract order.`,
      );
    }
    return {
      id: stage.id,
      status: 'passed',
      evidenceRef: requireString(
        supplied.evidenceRef,
        `completedPredecessorStages[${index}].evidenceRef`,
      ),
    };
  });
}

function validateRecoveryMetadata(value, label = 'recovery') {
  const recovery = requireExactKeys(
    value,
    [
      'recoveryAttempt',
      'failedReleaseExecutionId',
      'failedManifestRef',
      'failedGateId',
      'failedOperationId',
      'failedPlanSha256',
      'failureEvidenceRef',
    ],
    label,
  );
  const normalized = {
    recoveryAttempt: requireRecoveryAttempt(
      recovery.recoveryAttempt,
      `${label}.recoveryAttempt`,
    ),
    failedReleaseExecutionId: requireString(
      recovery.failedReleaseExecutionId,
      `${label}.failedReleaseExecutionId`,
      /^[a-z0-9][a-z0-9._-]{2,80}$/u,
    ),
    failedManifestRef: requireString(
      recovery.failedManifestRef,
      `${label}.failedManifestRef`,
    ),
    failedGateId: requireString(recovery.failedGateId, `${label}.failedGateId`),
    failedOperationId: requireString(
      recovery.failedOperationId,
      `${label}.failedOperationId`,
    ),
    failedPlanSha256: requireString(
      recovery.failedPlanSha256,
      `${label}.failedPlanSha256`,
      /^[a-f0-9]{64}$/u,
    ),
    failureEvidenceRef: requireString(
      recovery.failureEvidenceRef,
      `${label}.failureEvidenceRef`,
    ),
  };
  if (
    normalized.failedGateId !== RECOVERY_RESUME_GATE_ID ||
    normalized.failedOperationId !== 'api-candidate-runtime'
  ) {
    fail(
      'RECOVERY_BOUNDARY_UNSUPPORTED',
      'recovery is supported only for the failed API runtime operation.',
    );
  }
  if (normalized.failedPlanSha256 === BLOCKED_SAVED_PLAN_SHA256) {
    fail(
      'FAILED_PLAN_HASH_INVALID',
      'the recovery failed-plan hash must differ from the historical blocker.',
    );
  }
  return normalized;
}

function candidateFamilyOrdinal(tag, baseTag, label) {
  if (tag === baseTag) return 0;
  const match = new RegExp(`^${baseTag}-r([1-9][0-9]{0,14})$`, 'u').exec(tag);
  if (!match) {
    fail(
      'RECOVERY_CANDIDATE_FAMILY_MISMATCH',
      `${label} is not a canonical member of the approved candidate family.`,
    );
  }
  const ordinal = Number(match[1]);
  if (!Number.isSafeInteger(ordinal) || ordinal > MAX_RECOVERY_ATTEMPT) {
    fail(
      'RECOVERY_CANDIDATE_FAMILY_MISMATCH',
      `${label} has an unsupported recovery ordinal.`,
    );
  }
  return ordinal;
}

function validateRecoveryLiveDiscovery(
  value,
  candidateImageReference,
  recoveryAttempt,
  label = 'liveDiscovery',
) {
  const live = requireExactKeys(
    value,
    [
      'evidenceRef',
      'discoveredAt',
      'apiTrafficMode',
      'stableApiRevision',
      'stableApiTrafficPercent',
      'failedCandidate',
      'runtimeImages',
      'runtimeState',
      'edgeState',
      'candidateEdgeResources',
      'candidateRevisionInventory',
    ],
    label,
  );
  const evidenceRef = requireString(live.evidenceRef, `${label}.evidenceRef`);
  const discoveredAt = requireIsoTimestamp(
    live.discoveredAt,
    `${label}.discoveredAt`,
  );
  if (
    live.apiTrafficMode !== 'failed_zero_traffic_candidate' ||
    live.stableApiTrafficPercent !== 100
  ) {
    fail(
      'RECOVERY_LIVE_BASELINE_UNSAFE',
      'recovery requires stable API traffic at 100% and an explicit failed zero-traffic candidate baseline.',
    );
  }
  const stableApiRevision = requireString(
    live.stableApiRevision,
    `${label}.stableApiRevision`,
    /^moazez-staging-api-[a-z0-9][a-z0-9-]{0,42}[a-z0-9]$/u,
  );
  const runtimeImages = requireExactKeys(
    live.runtimeImages,
    ['api', 'coreWorker', 'mediaWorker', 'maintenanceScheduler'],
    `${label}.runtimeImages`,
  );
  const currentImages = {
    api: validateImageReference(
      runtimeImages.api,
      `${label}.runtimeImages.api`,
    ),
    coreWorker: validateImageReference(
      runtimeImages.coreWorker,
      `${label}.runtimeImages.coreWorker`,
    ),
    mediaWorker: validateImageReference(
      runtimeImages.mediaWorker,
      `${label}.runtimeImages.mediaWorker`,
    ),
    maintenanceScheduler: validateImageReference(
      runtimeImages.maintenanceScheduler,
      `${label}.runtimeImages.maintenanceScheduler`,
    ),
  };
  if (
    currentImages.api !== candidateImageReference ||
    currentImages.coreWorker !== candidateImageReference ||
    currentImages.mediaWorker !== candidateImageReference
  ) {
    fail(
      'RECOVERY_LIVE_BASELINE_UNSAFE',
      'the live API, Core Worker, and Media Worker images must equal the approved candidate image.',
    );
  }

  const baseTag = expectedCandidateTag(candidateImageReference);
  const failed = requireExactKeys(
    live.failedCandidate,
    ['imageReference', 'tag', 'revision', 'trafficPercent'],
    `${label}.failedCandidate`,
  );
  const failedTag = requireString(failed.tag, `${label}.failedCandidate.tag`);
  candidateFamilyOrdinal(failedTag, baseTag, `${label}.failedCandidate.tag`);
  const failedRevision = `moazez-staging-api-${failedTag}`;
  if (
    failed.imageReference !== candidateImageReference ||
    failed.revision !== failedRevision ||
    failed.trafficPercent !== 0 ||
    stableApiRevision === failedRevision
  ) {
    fail(
      'RECOVERY_LIVE_BASELINE_UNSAFE',
      'failed candidate evidence does not preserve the approved zero-traffic revision identity.',
    );
  }
  const failedCandidate = {
    imageReference: candidateImageReference,
    tag: failedTag,
    revision: failedRevision,
    trafficPercent: 0,
  };

  const candidateEdgeResources = requireExactKeys(
    live.candidateEdgeResources,
    [
      'candidateNegPresent',
      'candidateBackendPresent',
      'candidateSmokeRoutePresent',
    ],
    `${label}.candidateEdgeResources`,
  );
  if (
    candidateEdgeResources.candidateNegPresent !== false ||
    candidateEdgeResources.candidateBackendPresent !== false ||
    candidateEdgeResources.candidateSmokeRoutePresent !== false
  ) {
    fail(
      'RECOVERY_LIVE_BASELINE_UNSAFE',
      'candidate edge resources must be absent before API recovery.',
    );
  }

  const inventory = requireExactKeys(
    live.candidateRevisionInventory,
    ['evidenceRef', 'service', 'baseTag', 'completeness', 'revisions'],
    `${label}.candidateRevisionInventory`,
  );
  const inventoryEvidenceRef = requireString(
    inventory.evidenceRef,
    `${label}.candidateRevisionInventory.evidenceRef`,
  );
  if (
    inventory.service !== 'moazez-staging-api' ||
    inventory.baseTag !== baseTag ||
    inventory.completeness !== 'complete-base-family' ||
    !Array.isArray(inventory.revisions)
  ) {
    fail(
      'RECOVERY_REVISION_INVENTORY_INVALID',
      'candidate revision inventory must be complete for the exact service and image-derived base family.',
    );
  }
  const seenRevisions = new Set();
  let maxOrdinal = -1;
  const revisions = inventory.revisions.map((entry, index) => {
    const entryLabel = `${label}.candidateRevisionInventory.revisions[${index}]`;
    const keys = Object.keys(requireObject(entry, entryLabel)).sort();
    if (
      !isDeepStrictEqual(keys, ['imageReference', 'revision']) &&
      !isDeepStrictEqual(keys, ['imageReference', 'revision', 'tag'])
    ) {
      fail(
        'MANIFEST_SCHEMA_MISMATCH',
        `${entryLabel} contains unexpected fields.`,
      );
    }
    const revision = requireString(entry.revision, `${entryLabel}.revision`);
    const prefix = `${inventory.service}-`;
    if (!revision.startsWith(prefix)) {
      fail(
        'RECOVERY_REVISION_INVENTORY_INVALID',
        `${entryLabel}.revision is outside the declared service.`,
      );
    }
    const tag = revision.slice(prefix.length);
    const ordinal = candidateFamilyOrdinal(
      tag,
      baseTag,
      `${entryLabel}.revision`,
    );
    if (
      entry.imageReference !== candidateImageReference ||
      seenRevisions.has(revision)
    ) {
      fail(
        'RECOVERY_REVISION_INVENTORY_INVALID',
        'candidate revision inventory contains a duplicate or different-image family entry.',
      );
    }
    if (Object.hasOwn(entry, 'tag') && entry.tag !== tag) {
      fail(
        'RECOVERY_REVISION_INVENTORY_INVALID',
        `${entryLabel}.tag does not match its revision identity.`,
      );
    }
    seenRevisions.add(revision);
    maxOrdinal = Math.max(maxOrdinal, ordinal);
    return Object.hasOwn(entry, 'tag')
      ? { revision, imageReference: candidateImageReference, tag }
      : { revision, imageReference: candidateImageReference };
  });
  if (!seenRevisions.has(failedRevision)) {
    fail(
      'RECOVERY_REVISION_INVENTORY_INVALID',
      'the failed candidate revision must be present in the complete inventory.',
    );
  }
  if (maxOrdinal >= MAX_RECOVERY_ATTEMPT) {
    fail(
      'RECOVERY_ATTEMPT_EXHAUSTED',
      'the candidate family has exhausted the supported recovery-attempt range.',
    );
  }
  const requiredAttempt = maxOrdinal + 1;
  const candidateTag = expectedCandidateTag(
    candidateImageReference,
    recoveryAttempt,
  );
  const candidateRevision = `moazez-staging-api-${candidateTag}`;
  if (
    recoveryAttempt !== requiredAttempt ||
    seenRevisions.has(candidateRevision) ||
    stableApiRevision === candidateRevision
  ) {
    fail(
      'RECOVERY_ATTEMPT_MISMATCH',
      'recoveryAttempt must be exactly one greater than the maximum existing family ordinal and must not reuse a revision.',
    );
  }

  const runtimeState = requireState(
    requireExactKeys(
      live.runtimeState,
      ['lineage', 'serial'],
      `${label}.runtimeState`,
    ),
    `${label}.runtimeState`,
  );
  const edgeState = requireState(
    requireExactKeys(
      live.edgeState,
      ['lineage', 'serial'],
      `${label}.edgeState`,
    ),
    `${label}.edgeState`,
  );
  return {
    liveDiscovery: {
      evidenceRef,
      discoveredAt,
      apiTrafficMode: 'failed_zero_traffic_candidate',
      stableApiRevision,
      stableApiTrafficPercent: 100,
      failedCandidate,
      runtimeImages: currentImages,
      runtimeState,
      edgeState,
      candidateEdgeResources: {
        candidateNegPresent: false,
        candidateBackendPresent: false,
        candidateSmokeRoutePresent: false,
      },
      candidateRevisionInventory: {
        evidenceRef: inventoryEvidenceRef,
        service: 'moazez-staging-api',
        baseTag,
        completeness: 'complete-base-family',
        revisions,
      },
    },
    currentImages,
    stableApiRevision,
    runtimeState,
    edgeState,
    baseTag,
    candidateTag,
    candidateRevision,
    maxOrdinal,
  };
}

function validateSuccessfulContinuationMetadata(
  value,
  sourceSha,
  label = 'continuation',
) {
  const continuation = requireExactKeys(
    value,
    [
      'previousReleaseExecutionId',
      'previousManifestRef',
      'previousManifestSha256',
      'previousSourceSha',
    ],
    label,
  );
  const normalized = {
    previousReleaseExecutionId: requireString(
      continuation.previousReleaseExecutionId,
      `${label}.previousReleaseExecutionId`,
      /^[a-z0-9][a-z0-9._-]{2,80}$/u,
    ),
    previousManifestRef: requireExternalAbsolutePath(
      continuation.previousManifestRef,
      `${label}.previousManifestRef`,
    ),
    previousManifestSha256: requireString(
      continuation.previousManifestSha256,
      `${label}.previousManifestSha256`,
      /^[a-f0-9]{64}$/u,
    ),
    previousSourceSha: requireString(
      continuation.previousSourceSha,
      `${label}.previousSourceSha`,
      /^[a-f0-9]{40}$/u,
    ),
  };
  if (normalized.previousSourceSha === sourceSha) {
    fail(
      'CONTINUATION_SOURCE_REUSE_FORBIDDEN',
      'successful continuation requires a new source SHA and cannot reuse the predecessor manifest source binding.',
    );
  }
  return normalized;
}

function normalizeSuccessfulContinuationPredecessorCheckoutRoots(
  predecessor,
  label,
) {
  const checkoutRoots = new Set();
  for (const gate of predecessor.gates ?? []) {
    for (const operation of gate.operations ?? []) {
      if (operation.kind !== 'terraform') {
        continue;
      }
      const terraformRoot = normalizeRelativeRoot(
        operation.terraformRoot,
        `${label}.${gate.id}.${operation.id}.terraformRoot`,
      );
      const absoluteTerraformRoot = operation.absoluteTerraformRoot;
      if (
        typeof absoluteTerraformRoot !== 'string' ||
        !path.isAbsolute(absoluteTerraformRoot)
      ) {
        fail(
          'CONTINUATION_PREDECESSOR_EVIDENCE_INVALID',
          'every predecessor Terraform operation must retain an absolute checkout-rooted Terraform path.',
        );
      }
      const segments = terraformRoot.split('/');
      const checkoutRoot = path.resolve(
        absoluteTerraformRoot,
        ...segments.map(() => '..'),
      );
      const reconstructedTerraformRoot = path.join(checkoutRoot, ...segments);
      if (
        path.normalize(reconstructedTerraformRoot).toLowerCase() !==
        path.normalize(absoluteTerraformRoot).toLowerCase()
      ) {
        fail(
          'CONTINUATION_PREDECESSOR_EVIDENCE_INVALID',
          'a predecessor absoluteTerraformRoot does not end in its exact governed terraformRoot.',
        );
      }
      checkoutRoots.add(path.normalize(checkoutRoot).toLowerCase());
      operation.absoluteTerraformRoot = path.join(REPOSITORY_ROOT, ...segments);
    }
  }
  if (checkoutRoots.size !== 1) {
    fail(
      'CONTINUATION_PREDECESSOR_EVIDENCE_INVALID',
      'predecessor Terraform operations must share one exact retained checkout root.',
    );
  }
}

function loadSuccessfulContinuationPredecessor(metadata, label) {
  const file = fs.statSync(metadata.previousManifestRef, {
    throwIfNoEntry: false,
  });
  if (!file?.isFile()) {
    fail(
      'CONTINUATION_PREDECESSOR_EVIDENCE_INVALID',
      `${label}.previousManifestRef must name the exact retained predecessor manifest file.`,
    );
  }
  let bytes;
  let parsed;
  try {
    bytes = fs.readFileSync(metadata.previousManifestRef);
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    fail(
      'CONTINUATION_PREDECESSOR_EVIDENCE_INVALID',
      `the predecessor manifest evidence could not be read: ${error.message}`,
    );
  }
  if (sha256(bytes) !== metadata.previousManifestSha256) {
    fail(
      'CONTINUATION_PREDECESSOR_EVIDENCE_INVALID',
      'the predecessor manifest bytes do not match previousManifestSha256.',
    );
  }
  const contract = loadReleaseContract();
  const predecessorContractSha256 = parsed?.authoritativeContract?.sha256;
  if (
    !contract.equivalentTextContractSha256s.includes(predecessorContractSha256)
  ) {
    fail(
      'CONTINUATION_PREDECESSOR_EVIDENCE_INVALID',
      'the predecessor manifest release-contract hash is not an LF/CRLF byte-equivalent form of the current authoritative contract.',
    );
  }
  const validationCandidate = structuredClone(parsed);
  validationCandidate.authoritativeContract.sha256 = contract.contractSha256;
  normalizeSuccessfulContinuationPredecessorCheckoutRoots(
    validationCandidate,
    label,
  );
  validateManifestV1(validationCandidate);
  if (
    parsed.releaseExecutionId !== metadata.previousReleaseExecutionId ||
    parsed.sourceSha !== metadata.previousSourceSha
  ) {
    fail(
      'CONTINUATION_PREDECESSOR_EVIDENCE_INVALID',
      'the predecessor manifest execution or source identity does not match the continuation metadata.',
    );
  }
  return parsed;
}

function importedPassedOperationEvidence(gateId, operation) {
  return {
    gateId,
    operationId: operation.id,
    sourceSha: operation.sourceSha,
    status: 'passed',
    immutableSpecificationSha256: sha256(
      JSON.stringify(immutableOperationSpecification(operation)),
    ),
    statePrecondition: structuredClone(operation.statePrecondition),
    planEvidence: structuredClone(operation.planEvidence),
    approval: structuredClone(operation.approval),
    apply: structuredClone(operation.apply),
    liveVerification: structuredClone(operation.liveVerification),
  };
}

function validateSuccessfulContinuationPredecessor(predecessor) {
  const coreGate = predecessor.gates.find(
    (gate) => gate.id === 'core-worker-promotion',
  );
  const mediaGate = predecessor.gates.find(
    (gate) => gate.id === 'media-worker-promotion',
  );
  const apiGate = predecessor.gates.find(
    (gate) => gate.id === SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
  );
  const maintenanceGate = predecessor.gates.find(
    (gate) => gate.id === 'maintenance-scheduler-promotion',
  );
  const smokeGate = predecessor.gates.find(
    (gate) => gate.id === 'protected-readiness-and-smoke',
  );
  const trafficGate = predecessor.gates.find(
    (gate) => gate.id === 'traffic-promotion',
  );
  const core = findOperation(
    predecessor,
    'core-worker-promotion',
    'core-worker-runtime',
  ).operation;
  const media = findOperation(
    predecessor,
    'media-worker-promotion',
    'media-worker-runtime',
  ).operation;
  const apiRuntime = findOperation(
    predecessor,
    SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
    'api-candidate-runtime',
  ).operation;
  const apiEdge = findOperation(
    predecessor,
    SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
    'api-candidate-edge',
  ).operation;
  if (
    predecessor.releaseStatus !== 'in-progress' ||
    predecessor.failedGateId !== null ||
    predecessor.liveDiscovery.apiTrafficMode !== 'candidate_promoted' ||
    coreGate?.status !== 'passed' ||
    mediaGate?.status !== 'passed' ||
    apiGate?.status !== 'pending' ||
    maintenanceGate?.status !== 'pending' ||
    smokeGate?.status !== 'pending' ||
    trafficGate?.status !== 'pending' ||
    core.status !== 'passed' ||
    media.status !== 'passed' ||
    apiRuntime.status !== 'passed' ||
    apiEdge.status !== 'pending'
  ) {
    fail(
      'CONTINUATION_BOUNDARY_UNSUPPORTED',
      'the predecessor must be an active normal-v1 promoted-baseline release with Core, Media, and API Runtime passed and Candidate Edge still pending.',
    );
  }
  for (const [label, operation] of [
    ['Core', core],
    ['Media', media],
    ['API Runtime', apiRuntime],
  ]) {
    if (
      operation.planEvidence.status !== 'registered' ||
      operation.planEvidence.reviewed !== true ||
      operation.approval.status !== 'approved' ||
      operation.apply.status !== 'succeeded' ||
      operation.apply.postApplyState === null ||
      operation.liveVerification.status !== 'passed' ||
      operation.sourceSha !== predecessor.sourceSha
    ) {
      fail(
        'CONTINUATION_PREDECESSOR_EVIDENCE_INVALID',
        `${label} must retain complete passed plan, approval, apply, state, and live-verification evidence.`,
      );
    }
  }
  requireExactValue(
    core.liveVerification.observations,
    { observedImage: predecessor.candidate.imageReference },
    'predecessor Core verification',
  );
  requireExactValue(
    media.liveVerification.observations,
    { observedImage: predecessor.candidate.imageReference },
    'predecessor Media verification',
  );
  requireExactValue(
    apiRuntime.liveVerification.observations,
    {
      observedImage: predecessor.candidate.imageReference,
      observedRevision: predecessor.candidate.revision,
      observedCandidateTag: predecessor.candidate.tag,
      observedStablePercent: 100,
      observedCandidatePercent: 0,
    },
    'predecessor API Runtime verification',
  );

  const completedStages = [
    ...structuredClone(predecessor.predecessorEvidence),
    {
      id: 'core-worker-promotion',
      status: 'passed',
      evidenceRef: core.liveVerification.evidenceRef,
    },
    {
      id: 'media-worker-promotion',
      status: 'passed',
      evidenceRef: media.liveVerification.evidenceRef,
    },
  ];
  if (
    !isDeepStrictEqual(
      completedStages.map((stage) => stage.id),
      RECOVERY_PREDECESSOR_STAGE_IDS,
    )
  ) {
    fail(
      'CONTINUATION_PREDECESSOR_EVIDENCE_INVALID',
      'the imported predecessor stages do not match the authoritative contract order.',
    );
  }
  return {
    predecessorManifest: predecessor,
    predecessorEvidence: {
      completedStages,
      importedPassedOperations: [
        importedPassedOperationEvidence('core-worker-promotion', core),
        importedPassedOperationEvidence('media-worker-promotion', media),
        importedPassedOperationEvidence(
          SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
          apiRuntime,
        ),
      ],
    },
    core,
    media,
    apiRuntime,
    apiEdge,
    promotedBaseline: predecessor.liveDiscovery.promotedBaseline,
  };
}

function validateCandidateEdgeSemanticSnapshot(
  value,
  expectedCloudRunTag,
  label,
) {
  const edge = requireExactKeys(
    value,
    ['completeness', 'neg', 'backend', 'smokeRoute'],
    label,
  );
  const neg = requireExactKeys(
    edge.neg,
    [
      'present',
      'name',
      'region',
      'networkEndpointType',
      'cloudRunService',
      'cloudRunTag',
    ],
    `${label}.neg`,
  );
  const backend = requireExactKeys(
    edge.backend,
    [
      'present',
      'name',
      'negName',
      'protocol',
      'loadBalancingScheme',
      'securityPolicyMatchesPrimaryApi',
      'customRequestHeaders',
    ],
    `${label}.backend`,
  );
  const smokeRoute = requireExactKeys(
    edge.smokeRoute,
    ['present', 'urlMapName', 'publicPath', 'backendName', 'backendPath'],
    `${label}.smokeRoute`,
  );
  const snapshot = {
    completeness: edge.completeness,
    neg: {
      present: neg.present,
      name: neg.name,
      region: neg.region,
      networkEndpointType: neg.networkEndpointType,
      cloudRunService: neg.cloudRunService,
      cloudRunTag: neg.cloudRunTag,
    },
    backend: {
      present: backend.present,
      name: backend.name,
      negName: backend.negName,
      protocol: backend.protocol,
      loadBalancingScheme: backend.loadBalancingScheme,
      securityPolicyMatchesPrimaryApi: backend.securityPolicyMatchesPrimaryApi,
      customRequestHeaders: backend.customRequestHeaders,
    },
    smokeRoute: {
      present: smokeRoute.present,
      urlMapName: smokeRoute.urlMapName,
      publicPath: smokeRoute.publicPath,
      backendName: smokeRoute.backendName,
      backendPath: smokeRoute.backendPath,
    },
  };
  requireExactValue(
    snapshot,
    {
      completeness: 'complete',
      neg: {
        present: true,
        name: CANDIDATE_EDGE_IDENTITIES.negName,
        region: CANDIDATE_EDGE_IDENTITIES.region,
        networkEndpointType: CANDIDATE_EDGE_IDENTITIES.networkEndpointType,
        cloudRunService: CANDIDATE_EDGE_IDENTITIES.cloudRunService,
        cloudRunTag: expectedCloudRunTag,
      },
      backend: {
        present: true,
        name: CANDIDATE_EDGE_IDENTITIES.backendName,
        negName: CANDIDATE_EDGE_IDENTITIES.negName,
        protocol: CANDIDATE_EDGE_IDENTITIES.protocol,
        loadBalancingScheme: CANDIDATE_EDGE_IDENTITIES.loadBalancingScheme,
        securityPolicyMatchesPrimaryApi: true,
        customRequestHeaders: [CANDIDATE_EDGE_IDENTITIES.trustedClientIpHeader],
      },
      smokeRoute: {
        present: true,
        urlMapName: CANDIDATE_EDGE_IDENTITIES.urlMapName,
        publicPath: SMOKE_PUBLIC_PATH,
        backendName: CANDIDATE_EDGE_IDENTITIES.backendName,
        backendPath: SMOKE_BACKEND_PATH,
      },
    },
    label,
  );
  return snapshot;
}

function validateSuccessfulContinuationLiveDiscovery(
  value,
  predecessor,
  label = 'liveDiscovery',
) {
  const live = requireExactKeys(
    value,
    [
      'evidenceRef',
      'discoveredAt',
      'apiTrafficMode',
      'servingBaseline',
      'candidate',
      'runtimeImages',
      'runtimeState',
      'edgeState',
      'candidateEdgeResources',
    ],
    label,
  );
  const evidenceRef = requireString(live.evidenceRef, `${label}.evidenceRef`);
  const discoveredAt = requireIsoTimestamp(
    live.discoveredAt,
    `${label}.discoveredAt`,
  );
  if (live.apiTrafficMode !== 'candidate_no_traffic') {
    fail(
      'CONTINUATION_LIVE_BASELINE_UNSAFE',
      'successful Edge continuation requires the already-passed candidate_no_traffic runtime state.',
    );
  }
  const serving = requireExactKeys(
    live.servingBaseline,
    ['revision', 'candidateTag', 'imageReference', 'trafficPercent'],
    `${label}.servingBaseline`,
  );
  const servingBaseline = {
    revision: requireString(
      serving.revision,
      `${label}.servingBaseline.revision`,
    ),
    candidateTag: requireString(
      serving.candidateTag,
      `${label}.servingBaseline.candidateTag`,
    ),
    imageReference: validateImageReference(
      serving.imageReference,
      `${label}.servingBaseline.imageReference`,
    ),
    trafficPercent: serving.trafficPercent,
  };
  const expectedPromoted = predecessor.promotedBaseline;
  if (
    servingBaseline.revision !== expectedPromoted.promotedRevision ||
    servingBaseline.candidateTag !== expectedPromoted.promotedCandidateTag ||
    servingBaseline.imageReference !==
      expectedPromoted.promotedImageReference ||
    servingBaseline.trafficPercent !== 100
  ) {
    fail(
      'CONTINUATION_LIVE_BASELINE_UNSAFE',
      'the previous promoted revision, tag, image, and 100% traffic identity must remain exact.',
    );
  }

  const candidateInput = requireExactKeys(
    live.candidate,
    ['imageReference', 'tag', 'revision', 'trafficPercent', 'ready'],
    `${label}.candidate`,
  );
  const candidate = {
    imageReference: validateImageReference(
      candidateInput.imageReference,
      `${label}.candidate.imageReference`,
    ),
    tag: requireString(candidateInput.tag, `${label}.candidate.tag`),
    revision: requireString(
      candidateInput.revision,
      `${label}.candidate.revision`,
    ),
    trafficPercent: candidateInput.trafficPercent,
    ready: candidateInput.ready,
  };
  if (
    candidate.imageReference !==
      predecessor.apiRuntime.verificationExpectation.image ||
    candidate.tag !==
      predecessor.apiRuntime.verificationExpectation.candidateTag ||
    candidate.revision !==
      predecessor.apiRuntime.verificationExpectation.revision ||
    candidate.trafficPercent !== 0 ||
    candidate.ready !== true ||
    candidate.tag === servingBaseline.candidateTag ||
    candidate.revision === servingBaseline.revision ||
    candidate.imageReference === servingBaseline.imageReference
  ) {
    fail(
      'CONTINUATION_LIVE_BASELINE_UNSAFE',
      'the live candidate must retain the passed immutable image/tag/revision identity, Ready=True, and exactly 0% traffic.',
    );
  }

  const runtimeImagesInput = requireExactKeys(
    live.runtimeImages,
    ['api', 'coreWorker', 'mediaWorker', 'maintenanceScheduler'],
    `${label}.runtimeImages`,
  );
  const runtimeImages = {
    api: validateImageReference(
      runtimeImagesInput.api,
      `${label}.runtimeImages.api`,
    ),
    coreWorker: validateImageReference(
      runtimeImagesInput.coreWorker,
      `${label}.runtimeImages.coreWorker`,
    ),
    mediaWorker: validateImageReference(
      runtimeImagesInput.mediaWorker,
      `${label}.runtimeImages.mediaWorker`,
    ),
    maintenanceScheduler: validateImageReference(
      runtimeImagesInput.maintenanceScheduler,
      `${label}.runtimeImages.maintenanceScheduler`,
    ),
  };
  if (
    runtimeImages.api !== candidate.imageReference ||
    runtimeImages.coreWorker !== candidate.imageReference ||
    runtimeImages.mediaWorker !== candidate.imageReference ||
    runtimeImages.maintenanceScheduler !==
      predecessor.predecessorManifest.liveDiscovery.runtimeImages
        .maintenanceScheduler
  ) {
    fail(
      'CONTINUATION_LIVE_BASELINE_UNSAFE',
      'API, Core, and Media must remain on the candidate image while Maintenance remains on its exact predecessor image.',
    );
  }

  const runtimeState = requireState(
    requireExactKeys(
      live.runtimeState,
      ['lineage', 'serial'],
      `${label}.runtimeState`,
    ),
    `${label}.runtimeState`,
  );
  requireExactValue(
    runtimeState,
    predecessor.apiRuntime.apply.postApplyState,
    `${label}.runtimeState`,
  );
  const edgeState = requireState(
    requireExactKeys(
      live.edgeState,
      ['lineage', 'serial'],
      `${label}.edgeState`,
    ),
    `${label}.edgeState`,
  );
  requireExactValue(
    edgeState,
    {
      lineage: predecessor.apiEdge.statePrecondition.lineage,
      serial: predecessor.apiEdge.statePrecondition.serial,
    },
    `${label}.edgeState`,
  );

  const candidateEdgeResources = validateCandidateEdgeSemanticSnapshot(
    live.candidateEdgeResources,
    servingBaseline.candidateTag,
    `${label}.candidateEdgeResources`,
  );

  return {
    liveDiscovery: {
      evidenceRef,
      discoveredAt,
      apiTrafficMode: 'candidate_no_traffic',
      servingBaseline,
      candidate,
      runtimeImages,
      runtimeState,
      edgeState,
      candidateEdgeResources,
    },
    currentImages: runtimeImages,
    stableApiRevision: servingBaseline.revision,
    runtimeState,
    edgeState,
  };
}

function validateEdgeStateSuccessorRecoveryMetadata(
  value,
  label = 'edgeStateSuccessorRecovery',
) {
  const recovery = requireExactKeys(
    value,
    [
      'priorReleaseExecutionId',
      'priorManifestRef',
      'priorManifestSha256',
      'priorSavedPlanRef',
      'priorSavedPlanSha256',
      'priorPlanJsonRef',
      'priorPlanJsonSha256',
      'priorReviewEvidenceRef',
      'priorReviewEvidenceSha256',
      'priorApprovalEvidenceRef',
      'priorApprovalEvidenceSha256',
      'priorPreApplyEvidenceRef',
      'priorPreApplyEvidenceSha256',
      'stateReconciliationEvidenceRef',
      'stateReconciliationEvidenceSha256',
    ],
    label,
  );
  const normalized = {
    priorReleaseExecutionId: requireString(
      recovery.priorReleaseExecutionId,
      `${label}.priorReleaseExecutionId`,
      /^[a-z0-9][a-z0-9._-]{2,80}$/u,
    ),
  };
  for (const prefix of [
    'priorManifest',
    'priorSavedPlan',
    'priorPlanJson',
    'priorReviewEvidence',
    'priorApprovalEvidence',
    'priorPreApplyEvidence',
    'stateReconciliationEvidence',
  ]) {
    normalized[`${prefix}Ref`] = requireExternalAbsolutePath(
      recovery[`${prefix}Ref`],
      `${label}.${prefix}Ref`,
    );
    normalized[`${prefix}Sha256`] = requireString(
      recovery[`${prefix}Sha256`],
      `${label}.${prefix}Sha256`,
      /^[a-f0-9]{64}$/u,
    );
  }
  if (
    new Set(
      Object.keys(normalized)
        .filter((key) => key.endsWith('Ref'))
        .map((key) => normalized[key]),
    ).size !== 7
  ) {
    fail(
      'EDGE_SUCCESSOR_ARTIFACT_INVALID',
      'every v4 predecessor artifact reference must be a distinct external file.',
    );
  }
  return normalized;
}

function readExactEdgeStateSuccessorArtifact(reference, expectedSha256, label) {
  const stat = fs.statSync(reference, { throwIfNoEntry: false });
  if (!stat?.isFile()) {
    fail(
      'EDGE_SUCCESSOR_ARTIFACT_INVALID',
      `${label} must name an exact external regular file.`,
    );
  }
  const bytes = fs.readFileSync(reference);
  if (bytes.length === 0 || sha256(bytes) !== expectedSha256) {
    fail(
      'EDGE_SUCCESSOR_ARTIFACT_HASH_MISMATCH',
      `${label} bytes do not match the governed SHA-256 binding.`,
    );
  }
  return bytes;
}

function validatePriorV3ReviewArtifacts(
  manifest,
  operation,
  metadata,
  artifacts,
) {
  if (path.resolve(operation.savedPlanPath) !== metadata.priorSavedPlanRef) {
    fail(
      'EDGE_SUCCESSOR_ARTIFACT_INVALID',
      'priorSavedPlanRef differs from the exact Saved Plan path governed by the prior v3 operation.',
    );
  }
  const savedPlanSha256 = sha256(artifacts.savedPlanBytes);
  const planJsonSha256 = sha256(artifacts.planJsonBytes);
  const reviewEvidenceSha256 = sha256(artifacts.reviewEvidenceBytes);
  if (
    operation.planEvidence.sha256 !== savedPlanSha256 ||
    operation.planEvidence.sizeBytes !== artifacts.savedPlanBytes.length ||
    operation.deterministicReviewEvidence.savedPlanSha256 !== savedPlanSha256 ||
    operation.deterministicReviewEvidence.planJsonSha256 !== planJsonSha256 ||
    operation.deterministicReviewEvidence.reviewEvidenceSha256 !==
      reviewEvidenceSha256
  ) {
    fail(
      'EDGE_SUCCESSOR_ARTIFACT_INVALID',
      'prior v3 plan lifecycle evidence does not match the exact supplied Saved Plan, Plan JSON, or review-evidence bytes.',
    );
  }
  const reviewEvidence = requirePlanReviewEvidence(
    parseJsonBytes(
      artifacts.reviewEvidenceBytes,
      'prior v3 review evidence',
      'EDGE_SUCCESSOR_ARTIFACT_INVALID',
    ),
  );
  const review = reviewTerraformPlanJson(
    parseJsonBytes(
      artifacts.planJsonBytes,
      'prior v3 Plan JSON',
      'EDGE_SUCCESSOR_ARTIFACT_INVALID',
    ),
    manifest,
    {
      gateId: SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
      operationId: SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
    },
  );
  const expectedReviewFields = {
    schemaVersion: review.schemaVersion,
    status: review.status,
    releaseExecutionId: review.releaseExecutionId,
    sourceSha: review.sourceSha,
    gateId: review.gateId,
    operationId: review.operationId,
    immutableOperationSpecificationSha256:
      review.immutableOperationSpecificationSha256,
    savedPlanPath: metadata.priorSavedPlanRef,
    savedPlanSha256,
    savedPlanSizeBytes: artifacts.savedPlanBytes.length,
    planJsonSha256,
    planJsonSizeBytes: artifacts.planJsonBytes.length,
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
  for (const [field, expected] of Object.entries(expectedReviewFields)) {
    if (!isDeepStrictEqual(reviewEvidence[field], expected)) {
      fail(
        'EDGE_SUCCESSOR_ARTIFACT_INVALID',
        `prior v3 review evidence has a stale ${field} binding.`,
      );
    }
  }
  if (
    reviewEvidence.manifestSha256 !==
      operation.deterministicReviewEvidence.reviewedManifestSha256 ||
    reviewEvidence.immutableOperationSpecificationSha256 !==
      operation.deterministicReviewEvidence
        .immutableOperationSpecificationSha256
  ) {
    fail(
      'EDGE_SUCCESSOR_ARTIFACT_INVALID',
      'prior v3 review evidence is not the exact review registered by the predecessor operation.',
    );
  }
}

function validatePriorV3ApprovalEvidence(
  manifest,
  operation,
  metadata,
  approvalEvidenceBytes,
) {
  const label = 'prior v3 approval evidence';
  const evidence = requireExactKeys(
    parseJsonBytes(
      approvalEvidenceBytes,
      label,
      'EDGE_SUCCESSOR_APPROVAL_EVIDENCE_INVALID',
    ),
    [
      'evidenceType',
      'decision',
      'recordedAt',
      'approver',
      'releaseExecutionId',
      'sourceSha',
      'gateId',
      'operationId',
      'manifestSha256BeforeApproval',
      'savedPlan',
      'planJson',
      'deterministicReview',
      'authorization',
    ],
    label,
  );
  const savedPlan = requireExactKeys(
    evidence.savedPlan,
    ['path', 'sha256'],
    `${label}.savedPlan`,
  );
  const planJson = requireExactKeys(
    evidence.planJson,
    ['path', 'sha256'],
    `${label}.planJson`,
  );
  const deterministicReview = requireExactKeys(
    evidence.deterministicReview,
    ['evidenceRef', 'evidenceSha256', 'status'],
    `${label}.deterministicReview`,
  );
  const authorization = requireExactKeys(
    evidence.authorization,
    ['terraformApplyAuthorized', 'purpose'],
    `${label}.authorization`,
  );
  requireIsoTimestamp(evidence.recordedAt, `${label}.recordedAt`);

  const preApprovalManifest = structuredClone(manifest);
  const preApprovalOperation = findOperation(
    preApprovalManifest,
    SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
    SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
  ).operation;
  preApprovalOperation.status = 'plan-registered';
  preApprovalOperation.planEvidence.reviewed = false;
  preApprovalOperation.approval = {
    status: 'pending',
    approver: null,
    approvalRef: null,
    approvedAt: null,
  };
  const manifestSha256BeforeApproval = sha256(
    Buffer.from(`${JSON.stringify(preApprovalManifest, null, 2)}\n`),
  );

  if (
    evidence.evidenceType !== 'terraform-saved-plan-owner-approval' ||
    evidence.decision !== 'approved' ||
    evidence.recordedAt !== operation.approval.approvedAt ||
    evidence.approver !== operation.approval.approver ||
    evidence.releaseExecutionId !== manifest.releaseExecutionId ||
    evidence.sourceSha !== manifest.sourceSha ||
    evidence.gateId !== SUCCESSFUL_CONTINUATION_RESUME_GATE_ID ||
    evidence.operationId !== SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID ||
    evidence.manifestSha256BeforeApproval !== manifestSha256BeforeApproval ||
    !path.isAbsolute(savedPlan.path) ||
    path.resolve(savedPlan.path) !== metadata.priorSavedPlanRef ||
    savedPlan.sha256 !== metadata.priorSavedPlanSha256 ||
    savedPlan.sha256 !== operation.planEvidence.sha256 ||
    !path.isAbsolute(planJson.path) ||
    path.resolve(planJson.path) !== metadata.priorPlanJsonRef ||
    planJson.sha256 !== metadata.priorPlanJsonSha256 ||
    planJson.sha256 !== operation.deterministicReviewEvidence.planJsonSha256 ||
    !path.isAbsolute(deterministicReview.evidenceRef) ||
    path.resolve(deterministicReview.evidenceRef) !==
      metadata.priorReviewEvidenceRef ||
    deterministicReview.evidenceSha256 !== metadata.priorReviewEvidenceSha256 ||
    deterministicReview.evidenceSha256 !==
      operation.deterministicReviewEvidence.reviewEvidenceSha256 ||
    deterministicReview.status !== 'passed' ||
    authorization.terraformApplyAuthorized !== false ||
    authorization.purpose !==
      'approve-exact-reviewed-saved-plan-for-separate-pre-apply-gate'
  ) {
    fail(
      'EDGE_SUCCESSOR_APPROVAL_EVIDENCE_INVALID',
      'prior approval evidence is not semantically bound to the exact approved v3 Candidate Edge plan lifecycle.',
    );
  }
}

function validatePriorV3PreApplyEvidence(
  manifest,
  operation,
  metadata,
  preApplyEvidenceBytes,
) {
  const label = 'prior v3 pre-apply evidence';
  const evidence = requireExactKeys(
    parseJsonBytes(
      preApplyEvidenceBytes,
      label,
      'EDGE_SUCCESSOR_PRE_APPLY_EVIDENCE_INVALID',
    ),
    [
      'evidenceType',
      'status',
      'recordedAt',
      'releaseExecutionId',
      'sourceSha',
      'manifestSha256',
      'savedPlanSha256',
      'planJsonSha256',
      'reviewEvidenceSha256',
      'approvalEvidenceSha256',
      'statePrecondition',
      'traffic',
      'candidateEdge',
      'authorizationBoundary',
    ],
    label,
  );
  const statePrecondition = requireState(
    requireExactKeys(
      evidence.statePrecondition,
      ['lineage', 'serial'],
      `${label}.statePrecondition`,
    ),
    `${label}.statePrecondition`,
  );
  const traffic = requireExactKeys(
    evidence.traffic,
    [
      'servingRevision',
      'servingPercent',
      'candidateRevision',
      'candidateTag',
      'candidatePercent',
    ],
    `${label}.traffic`,
  );
  const candidateEdge = requireExactKeys(
    evidence.candidateEdge,
    [
      'currentNegTag',
      'desiredNegTag',
      'backendPointsToNeg',
      'securityPolicyMatch',
      'trustedHeaderMatch',
      'smokeRouteBackendMatch',
      'smokeRouteRewriteMatch',
    ],
    `${label}.candidateEdge`,
  );
  const authorizationBoundary = requireExactKeys(
    evidence.authorizationBoundary,
    ['terraformApplyExecuted', 'productionMutation'],
    `${label}.authorizationBoundary`,
  );
  requireIsoTimestamp(evidence.recordedAt, `${label}.recordedAt`);
  const priorLive = manifest.liveDiscovery;

  if (
    evidence.evidenceType !== 'edge-final-pre-apply-authority-guard' ||
    evidence.status !== 'passed' ||
    evidence.releaseExecutionId !== manifest.releaseExecutionId ||
    evidence.sourceSha !== manifest.sourceSha ||
    evidence.manifestSha256 !== metadata.priorManifestSha256 ||
    evidence.savedPlanSha256 !== metadata.priorSavedPlanSha256 ||
    evidence.savedPlanSha256 !== operation.planEvidence.sha256 ||
    evidence.planJsonSha256 !== metadata.priorPlanJsonSha256 ||
    evidence.planJsonSha256 !==
      operation.deterministicReviewEvidence.planJsonSha256 ||
    evidence.reviewEvidenceSha256 !== metadata.priorReviewEvidenceSha256 ||
    evidence.reviewEvidenceSha256 !==
      operation.deterministicReviewEvidence.reviewEvidenceSha256 ||
    evidence.approvalEvidenceSha256 !== metadata.priorApprovalEvidenceSha256 ||
    !isDeepStrictEqual(statePrecondition, {
      lineage: operation.statePrecondition.lineage,
      serial: operation.statePrecondition.serial,
    }) ||
    traffic.servingRevision !== priorLive.servingBaseline.revision ||
    traffic.servingPercent !== priorLive.servingBaseline.trafficPercent ||
    traffic.candidateRevision !== priorLive.candidate.revision ||
    traffic.candidateTag !== priorLive.candidate.tag ||
    traffic.candidatePercent !== priorLive.candidate.trafficPercent ||
    candidateEdge.currentNegTag !==
      priorLive.candidateEdgeResources.neg.cloudRunTag ||
    candidateEdge.desiredNegTag !== manifest.candidate.tag ||
    candidateEdge.backendPointsToNeg !== true ||
    candidateEdge.securityPolicyMatch !== true ||
    candidateEdge.trustedHeaderMatch !== true ||
    candidateEdge.smokeRouteBackendMatch !== true ||
    candidateEdge.smokeRouteRewriteMatch !== true ||
    authorizationBoundary.terraformApplyExecuted !== false ||
    authorizationBoundary.productionMutation !== false
  ) {
    fail(
      'EDGE_SUCCESSOR_PRE_APPLY_EVIDENCE_INVALID',
      'prior pre-apply evidence is not semantically bound to the exact unapplied v3 Candidate Edge authority boundary.',
    );
  }
}

function validateEdgeStateSuccessorRecoveryPredecessorBoundary(predecessor) {
  const edge = findOperation(
    predecessor,
    SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
    SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
  ).operation;
  const edgeGate = predecessor.gates.find(
    (gate) => gate.id === SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
  );
  const laterGates = predecessor.gates.slice(
    predecessor.gates.indexOf(edgeGate) + 1,
  );
  if (
    predecessor.manifestVersion !== 3 ||
    predecessor.executionMode !== SUCCESSFUL_CONTINUATION_MODE ||
    predecessor.releaseStatus !== 'pending' ||
    predecessor.failedGateId !== null ||
    edgeGate?.status !== 'pending' ||
    laterGates.some((gate) => gate.status !== 'pending') ||
    edge.status !== 'approved' ||
    edge.planEvidence.status !== 'registered' ||
    edge.planEvidence.reviewed !== true ||
    edge.deterministicReviewEvidence.status !== 'passed' ||
    edge.approval.status !== 'approved' ||
    edge.apply.status !== 'not-applied' ||
    edge.apply.attempted !== false ||
    edge.singleConsumptionStatus !== 'unconsumed' ||
    edge.liveVerification.status !== 'pending'
  ) {
    fail(
      'EDGE_SUCCESSOR_PREDECESSOR_BOUNDARY_INVALID',
      'the prior v3 manifest must be pending at the exact approved, registered, reviewed, controller-unapplied first Candidate Edge gate boundary.',
    );
  }
  return edge;
}

function loadEdgeStateSuccessorRecoveryPredecessor(metadata, label) {
  const manifestBytes = readExactEdgeStateSuccessorArtifact(
    metadata.priorManifestRef,
    metadata.priorManifestSha256,
    `${label}.priorManifestRef`,
  );
  const predecessorManifest = parseJsonBytes(
    manifestBytes,
    'prior v3 manifest',
    'EDGE_SUCCESSOR_ARTIFACT_INVALID',
  );
  if (
    predecessorManifest.manifestVersion !== 3 ||
    predecessorManifest.executionMode !== SUCCESSFUL_CONTINUATION_MODE
  ) {
    fail(
      'EDGE_SUCCESSOR_PREDECESSOR_BOUNDARY_INVALID',
      'v4 recovery requires an exact successful-edge-continuation v3 predecessor.',
    );
  }
  const validationCandidate = structuredClone(predecessorManifest);
  normalizeSuccessfulContinuationPredecessorCheckoutRoots(
    validationCandidate,
    label,
  );
  validateSuccessfulEdgeContinuationManifestV3(validationCandidate);
  if (
    predecessorManifest.releaseExecutionId !== metadata.priorReleaseExecutionId
  ) {
    fail(
      'EDGE_SUCCESSOR_PREDECESSOR_BOUNDARY_INVALID',
      'the prior v3 release execution identity does not match recovery metadata.',
    );
  }
  const edgeOperation =
    validateEdgeStateSuccessorRecoveryPredecessorBoundary(predecessorManifest);
  if (
    edgeOperation.approval.approvalRef !== metadata.priorApprovalEvidenceRef
  ) {
    fail(
      'EDGE_SUCCESSOR_ARTIFACT_INVALID',
      'priorApprovalEvidenceRef differs from the approval evidence referenced by the prior v3 operation.',
    );
  }
  const artifacts = {
    savedPlanBytes: readExactEdgeStateSuccessorArtifact(
      metadata.priorSavedPlanRef,
      metadata.priorSavedPlanSha256,
      `${label}.priorSavedPlanRef`,
    ),
    planJsonBytes: readExactEdgeStateSuccessorArtifact(
      metadata.priorPlanJsonRef,
      metadata.priorPlanJsonSha256,
      `${label}.priorPlanJsonRef`,
    ),
    reviewEvidenceBytes: readExactEdgeStateSuccessorArtifact(
      metadata.priorReviewEvidenceRef,
      metadata.priorReviewEvidenceSha256,
      `${label}.priorReviewEvidenceRef`,
    ),
    approvalEvidenceBytes: readExactEdgeStateSuccessorArtifact(
      metadata.priorApprovalEvidenceRef,
      metadata.priorApprovalEvidenceSha256,
      `${label}.priorApprovalEvidenceRef`,
    ),
    preApplyEvidenceBytes: readExactEdgeStateSuccessorArtifact(
      metadata.priorPreApplyEvidenceRef,
      metadata.priorPreApplyEvidenceSha256,
      `${label}.priorPreApplyEvidenceRef`,
    ),
    reconciliationEvidenceBytes: readExactEdgeStateSuccessorArtifact(
      metadata.stateReconciliationEvidenceRef,
      metadata.stateReconciliationEvidenceSha256,
      `${label}.stateReconciliationEvidenceRef`,
    ),
  };
  validatePriorV3ReviewArtifacts(
    predecessorManifest,
    edgeOperation,
    metadata,
    artifacts,
  );
  validatePriorV3ApprovalEvidence(
    predecessorManifest,
    edgeOperation,
    metadata,
    artifacts.approvalEvidenceBytes,
  );
  validatePriorV3PreApplyEvidence(
    predecessorManifest,
    edgeOperation,
    metadata,
    artifacts.preApplyEvidenceBytes,
  );
  const apiRuntime =
    predecessorManifest.predecessorEvidence.importedPassedOperations.find(
      (operation) => operation.operationId === 'api-candidate-runtime',
    );
  if (!apiRuntime || apiRuntime.status !== 'passed') {
    fail(
      'EDGE_SUCCESSOR_PREDECESSOR_BOUNDARY_INVALID',
      'the prior v3 manifest must retain immutable passed API Runtime evidence.',
    );
  }
  return {
    predecessorManifest,
    edgeOperation,
    apiRuntime,
    reconciliationEvidence: parseJsonBytes(
      artifacts.reconciliationEvidenceBytes,
      'state reconciliation evidence',
      'EDGE_SUCCESSOR_RECONCILIATION_INVALID',
    ),
  };
}

function validateEdgeStateSuccessorRecoveryLiveDiscovery(
  value,
  predecessor,
  label = 'liveDiscovery',
) {
  const priorManifest = predecessor.predecessorManifest;
  const priorEdgeState = predecessor.edgeOperation.statePrecondition;
  const currentEdgeState = requireState(
    requireExactKeys(
      requireObject(value, label).edgeState,
      ['lineage', 'serial'],
      `${label}.edgeState`,
    ),
    `${label}.edgeState`,
  );
  if (
    currentEdgeState.lineage !== priorEdgeState.lineage ||
    currentEdgeState.serial <= priorEdgeState.serial
  ) {
    fail(
      'EDGE_STATE_SUCCESSOR_INVALID',
      'v4 recovery requires the same Edge lineage and a strictly greater current serial.',
    );
  }
  const validationInput = structuredClone(value);
  validationInput.edgeState = {
    lineage: priorEdgeState.lineage,
    serial: priorEdgeState.serial,
  };
  const priorServing = priorManifest.liveDiscovery.servingBaseline;
  const adapter = {
    promotedBaseline: {
      promotedRevision: priorServing.revision,
      promotedCandidateTag: priorServing.candidateTag,
      promotedImageReference: priorServing.imageReference,
    },
    apiRuntime: {
      verificationExpectation: {
        image: priorManifest.candidate.imageReference,
        candidateTag: priorManifest.candidate.tag,
        revision: priorManifest.candidate.revision,
      },
      apply: {
        postApplyState: predecessor.apiRuntime.apply.postApplyState,
      },
    },
    apiEdge: predecessor.edgeOperation,
    predecessorManifest: priorManifest,
  };
  const validated = validateSuccessfulContinuationLiveDiscovery(
    validationInput,
    adapter,
    label,
  );
  requireExactValue(
    validated.liveDiscovery.candidateEdgeResources,
    priorManifest.liveDiscovery.candidateEdgeResources,
    `${label}.candidateEdgeResources`,
  );
  validated.liveDiscovery.edgeState = currentEdgeState;
  validated.edgeState = currentEdgeState;
  return validated;
}

function validateStateReconciliationEvidence(
  value,
  metadata,
  predecessor,
  live,
  label = 'stateReconciliationEvidence',
) {
  const evidence = requireExactKeys(
    value,
    [
      'schemaVersion',
      'classification',
      'priorReleaseExecutionId',
      'priorEdgeState',
      'currentEdgeState',
      'stateCandidateNeg',
      'liveCandidateNeg',
      'stateCandidateBackend',
      'liveCandidateBackend',
      'stateCandidateSmokeRoute',
      'liveCandidateSmokeRoute',
      'servingRevision',
      'servingTrafficPercent',
      'candidateRevision',
      'candidateTag',
      'candidateTrafficPercent',
      'candidateReady',
      'desiredCandidateTag',
      'urlMapSemanticStatus',
      'productionMutationObserved',
    ],
    label,
  );
  if (
    evidence.schemaVersion !== 1 ||
    evidence.classification !==
      'STATE_ADVANCED_WITHOUT_GOVERNED_SEMANTIC_EDGE_CHANGE' ||
    evidence.priorReleaseExecutionId !== metadata.priorReleaseExecutionId
  ) {
    fail(
      'EDGE_SUCCESSOR_RECONCILIATION_INVALID',
      'state reconciliation evidence has the wrong schema, classification, or prior release identity.',
    );
  }
  const priorEdgeState = requireState(
    requireExactKeys(
      evidence.priorEdgeState,
      ['lineage', 'serial'],
      `${label}.priorEdgeState`,
    ),
    `${label}.priorEdgeState`,
  );
  const currentEdgeState = requireState(
    requireExactKeys(
      evidence.currentEdgeState,
      ['lineage', 'serial'],
      `${label}.currentEdgeState`,
    ),
    `${label}.currentEdgeState`,
  );
  requireExactValue(
    priorEdgeState,
    {
      lineage: predecessor.edgeOperation.statePrecondition.lineage,
      serial: predecessor.edgeOperation.statePrecondition.serial,
    },
    `${label}.priorEdgeState`,
  );
  requireExactValue(
    currentEdgeState,
    live.edgeState,
    `${label}.currentEdgeState`,
  );
  const semantic = live.liveDiscovery.candidateEdgeResources;
  const componentKeys = {
    Neg: Object.keys(semantic.neg),
    Backend: Object.keys(semantic.backend),
    SmokeRoute: Object.keys(semantic.smokeRoute),
  };
  for (const component of Object.keys(componentKeys)) {
    for (const source of ['state', 'live']) {
      const field = `${source}Candidate${component}`;
      requireExactValue(
        requireExactKeys(
          evidence[field],
          componentKeys[component],
          `${label}.${field}`,
        ),
        semantic[
          component === 'SmokeRoute' ? 'smokeRoute' : component.toLowerCase()
        ],
        `${label}.${field}`,
      );
    }
  }
  const expectedScalarEvidence = {
    servingRevision: live.liveDiscovery.servingBaseline.revision,
    servingTrafficPercent: 100,
    candidateRevision: live.liveDiscovery.candidate.revision,
    candidateTag: live.liveDiscovery.candidate.tag,
    candidateTrafficPercent: 0,
    candidateReady: true,
    desiredCandidateTag: predecessor.predecessorManifest.candidate.tag,
    urlMapSemanticStatus: 'unchanged',
    productionMutationObserved: false,
  };
  for (const [field, expected] of Object.entries(expectedScalarEvidence)) {
    if (!isDeepStrictEqual(evidence[field], expected)) {
      fail(
        'EDGE_SUCCESSOR_RECONCILIATION_INVALID',
        `state reconciliation evidence has an unsafe ${field} value.`,
      );
    }
  }
  if (
    semantic.neg.cloudRunTag === evidence.desiredCandidateTag ||
    currentEdgeState.lineage !== priorEdgeState.lineage ||
    currentEdgeState.serial <= priorEdgeState.serial
  ) {
    fail(
      'EDGE_SUCCESSOR_RECONCILIATION_INVALID',
      'state reconciliation does not prove an unchanged Edge semantic baseline at a strict same-lineage successor serial.',
    );
  }
  return evidence;
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
    ...(definition.expectedResourceActions
      ? { expectedResourceActions: definition.expectedResourceActions }
      : {}),
    expectedChangeType: definition.expectedChangeType,
    allowedAttributeChanges: definition.allowedAttributeChanges,
    ...(definition.allowedComputedAfterApplyChanges
      ? {
          allowedComputedAfterApplyChanges:
            definition.allowedComputedAfterApplyChanges,
        }
      : {}),
    ...(definition.expectedResourcePlanIdentities
      ? {
          expectedResourcePlanIdentities:
            definition.expectedResourcePlanIdentities,
          allowedProviderNormalizations:
            definition.allowedProviderNormalizations,
          allowedRefreshOnlyDrift: definition.allowedRefreshOnlyDrift,
          planReviewRequirements: definition.planReviewRequirements,
          deterministicReviewEvidence: {
            status: 'not-reviewed',
            reviewEvidenceSha256: null,
            reviewedManifestSha256: null,
            immutableOperationSpecificationSha256: null,
            planJsonSha256: null,
            savedPlanSha256: null,
          },
        }
      : {}),
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
  const recovery = context.executionMode === 'recovery';
  const retainedCandidateEdgeReconciliation =
    isRetainedCandidateEdgeReconciliationMode(context.executionMode);
  const preApiTraffic = context.preApiTraffic ?? ['normal', null, null];
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
            ...preApiTraffic,
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
            ...preApiTraffic,
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
      if (retainedCandidateEdgeReconciliation) {
        const planReviewSpecification =
          successfulContinuationPlanReviewSpecification();
        return [
          buildTerraformOperation(context, gateIndex, 0, {
            id: SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
            gateId: gate.id,
            terraformRoot: EDGE_ROOT,
            requiredVariables: {
              candidate_edge_enabled: true,
              candidate_api_tag: context.candidateTag,
            },
            expectedResourceAddressAllowlist:
              EDGE_CANDIDATE_RECONCILIATION_RESOURCE_ADDRESSES,
            expectedResourceActions: {
              [EDGE_CANDIDATE_RECONCILIATION_RESOURCE_ADDRESSES[0]]: [
                'delete',
                'create',
              ],
              [EDGE_CANDIDATE_RECONCILIATION_RESOURCE_ADDRESSES[1]]: ['update'],
            },
            expectedChangeType:
              'reconcile-retained-candidate-edge:replace-neg-tag-and-update-backend-group-with-url-map-unchanged',
            allowedAttributeChanges: {
              [EDGE_CANDIDATE_RECONCILIATION_RESOURCE_ADDRESSES[0]]: [
                'cloud_run[0].tag',
              ],
              [EDGE_CANDIDATE_RECONCILIATION_RESOURCE_ADDRESSES[1]]: [
                'backend[0].group',
              ],
            },
            allowedComputedAfterApplyChanges: {
              [EDGE_CANDIDATE_RECONCILIATION_RESOURCE_ADDRESSES[0]]: [
                'id',
                'self_link',
                'network',
                'psc_data',
              ],
              [EDGE_CANDIDATE_RECONCILIATION_RESOURCE_ADDRESSES[1]]: [
                'backend[0].max_connections',
                'backend[0].max_connections_per_endpoint',
                'backend[0].max_connections_per_instance',
                'backend[0].max_rate',
                'backend[0].max_rate_per_endpoint',
                'backend[0].max_rate_per_instance',
                'backend[0].max_utilization',
                'fingerprint',
              ],
            },
            ...planReviewSpecification,
            statePrecondition: statePrecondition(context.edgeState),
            verificationExpectation: {
              candidateTag: context.candidateTag,
              publicPath: SMOKE_PUBLIC_PATH,
              backendPath: SMOKE_BACKEND_PATH,
            },
          }),
        ];
      }
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
          expectedChangeType: recovery
            ? 'update-in-place:api-revision-traffic-and-startup-probe-only'
            : 'update-in-place:api-image-plus-explicit-zero-traffic-candidate',
          allowedAttributeChanges: {
            [RUNTIME_RESOURCE_ADDRESSES.api]: recovery
              ? [
                  'template[0].revision',
                  'traffic',
                  'template[0].containers[0].startup_probe[0].initial_delay_seconds',
                  'template[0].containers[0].startup_probe[0].period_seconds',
                  'template[0].containers[0].startup_probe[0].timeout_seconds',
                  'template[0].containers[0].startup_probe[0].failure_threshold',
                ]
              : [
                  'template[0].containers[0].image',
                  'template[0].revision',
                  'traffic',
                ],
          },
          statePrecondition: recovery
            ? statePrecondition(context.runtimeState)
            : statePrecondition(null, 'media-worker-runtime'),
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
          statePrecondition: retainedCandidateEdgeReconciliation
            ? statePrecondition(context.runtimeState)
            : statePrecondition(null, 'api-candidate-runtime'),
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

function buildManifestV1(input) {
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
  const candidateRevision = `moazez-staging-api-${candidateTag}`;
  const live = validateManifestV1LiveDiscovery(
    input.liveDiscovery,
    {
      imageReference: candidateImageReference,
      tag: candidateTag,
      revision: candidateRevision,
    },
    'liveDiscovery',
    { requireCandidateEdgePreflight: true },
  );
  const {
    currentImages,
    stableApiRevision,
    runtimeState,
    edgeState,
    preApiTraffic,
  } = live;
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
    preApiTraffic,
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
    liveDiscovery: live.liveDiscovery,
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

function buildRecoveryManifest(input) {
  requireExactKeys(
    input,
    [
      'executionMode',
      'executionId',
      'repository',
      'sourceSha',
      'environment',
      'candidateImageReference',
      'recovery',
      'resumeGateId',
      'completedPredecessorStages',
      'liveDiscovery',
      'externalTfDataRoot',
      'externalSavedPlanRoot',
    ],
    'context',
  );
  if (input.executionMode !== 'recovery') {
    fail(
      'MANIFEST_UNSUPPORTED',
      'recovery manifest construction requires executionMode=recovery.',
    );
  }
  if (input.resumeGateId !== RECOVERY_RESUME_GATE_ID) {
    fail(
      'RECOVERY_BOUNDARY_UNSUPPORTED',
      `resumeGateId must equal ${RECOVERY_RESUME_GATE_ID}.`,
    );
  }
  const contract = loadReleaseContract();
  const { predecessorStages, recoveryStages } =
    recoveryContractWindow(contract);
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
    fail('ENVIRONMENT_UNSUPPORTED', 'the recovery adapter is staging-only.');
  }
  const executionId = requireString(
    input.executionId,
    'executionId',
    /^[a-z0-9][a-z0-9._-]{2,80}$/u,
  );
  const recovery = validateRecoveryMetadata(input.recovery);
  if (executionId === recovery.failedReleaseExecutionId) {
    fail(
      'RECOVERY_EXECUTION_ID_REUSE',
      'the recovery executionId must differ from the failed release execution ID.',
    );
  }
  const candidateImageReference = validateImageReference(
    input.candidateImageReference,
    'candidateImageReference',
  );
  const live = validateRecoveryLiveDiscovery(
    input.liveDiscovery,
    candidateImageReference,
    recovery.recoveryAttempt,
  );
  const tfDataRoot = requireExternalAbsolutePath(
    input.externalTfDataRoot,
    'externalTfDataRoot',
  );
  const savedPlanRoot = requireExternalAbsolutePath(
    input.externalSavedPlanRoot,
    'externalSavedPlanRoot',
  );
  const predecessorEvidence = validateRecoveryPredecessorEvidence(
    input.completedPredecessorStages,
    predecessorStages,
  );
  const context = {
    executionMode: 'recovery',
    executionId,
    sourceSha,
    environment: 'staging',
    candidateImageReference,
    candidateTag: live.candidateTag,
    candidateRevision: live.candidateRevision,
    stableApiRevision: live.stableApiRevision,
    currentImages: live.currentImages,
    runtimeState: live.runtimeState,
    edgeState: live.edgeState,
    tfDataRoot,
    savedPlanRoot,
  };
  const gates = recoveryStages.map((gate, gateIndex) => ({
    id: gate.id,
    sequence: gateIndex + 1,
    blocking: true,
    status: 'pending',
    operations: buildGateOperations(context, gate, gateIndex),
  }));
  const manifest = {
    manifestVersion: 2,
    executionMode: 'recovery',
    resumeGateId: RECOVERY_RESUME_GATE_ID,
    releaseExecutionId: executionId,
    repository: REPOSITORY,
    sourceSha,
    environment: 'staging',
    authoritativeContract: {
      path: 'config/deployment/release-sequence.contract.json',
      sha256: contract.contractSha256,
      contractVersion: contract.contract.contractVersion,
      failurePolicy: contract.contract.failurePolicy,
      automaticRetryAllowed: contract.contract.automaticRetryAllowed,
    },
    recovery,
    predecessorEvidence,
    liveDiscovery: live.liveDiscovery,
    candidate: {
      imageReference: candidateImageReference,
      tag: live.candidateTag,
      revision: live.candidateRevision,
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
    blockedSavedPlanHashes: [
      BLOCKED_SAVED_PLAN_SHA256,
      recovery.failedPlanSha256,
    ],
  };
  validateManifest(manifest);
  return manifest;
}

function buildSuccessfulEdgeContinuationManifest(input) {
  requireExactKeys(
    input,
    [
      'executionMode',
      'executionId',
      'repository',
      'sourceSha',
      'environment',
      'resumeGateId',
      'resumeOperationId',
      'continuation',
      'liveDiscovery',
      'externalTfDataRoot',
      'externalSavedPlanRoot',
    ],
    'context',
  );
  if (input.executionMode !== SUCCESSFUL_CONTINUATION_MODE) {
    fail(
      'MANIFEST_UNSUPPORTED',
      `successful continuation requires executionMode=${SUCCESSFUL_CONTINUATION_MODE}.`,
    );
  }
  if (
    input.resumeGateId !== SUCCESSFUL_CONTINUATION_RESUME_GATE_ID ||
    input.resumeOperationId !== SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID
  ) {
    fail(
      'CONTINUATION_BOUNDARY_UNSUPPORTED',
      `continuation must resume at ${SUCCESSFUL_CONTINUATION_RESUME_GATE_ID}/${SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID}.`,
    );
  }
  const contract = loadReleaseContract();
  const { continuationStages } = successfulContinuationContractWindow(contract);
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
      'successful Edge continuation is staging-only.',
    );
  }
  const executionId = requireString(
    input.executionId,
    'executionId',
    /^[a-z0-9][a-z0-9._-]{2,80}$/u,
  );
  const continuation = validateSuccessfulContinuationMetadata(
    input.continuation,
    sourceSha,
  );
  if (executionId === continuation.previousReleaseExecutionId) {
    fail(
      'CONTINUATION_EXECUTION_ID_REUSE',
      'the continuation execution ID must differ from the predecessor release execution ID.',
    );
  }
  const predecessorManifest = loadSuccessfulContinuationPredecessor(
    continuation,
    'continuation',
  );
  const predecessor =
    validateSuccessfulContinuationPredecessor(predecessorManifest);
  const live = validateSuccessfulContinuationLiveDiscovery(
    input.liveDiscovery,
    predecessor,
  );
  const candidate = structuredClone(predecessorManifest.candidate);
  const tfDataRoot = requireExternalAbsolutePath(
    input.externalTfDataRoot,
    'externalTfDataRoot',
  );
  const savedPlanRoot = requireExternalAbsolutePath(
    input.externalSavedPlanRoot,
    'externalSavedPlanRoot',
  );
  const context = {
    executionMode: SUCCESSFUL_CONTINUATION_MODE,
    executionId,
    sourceSha,
    environment: 'staging',
    candidateImageReference: candidate.imageReference,
    candidateTag: candidate.tag,
    candidateRevision: candidate.revision,
    stableApiRevision: live.stableApiRevision,
    currentImages: live.currentImages,
    runtimeState: live.runtimeState,
    edgeState: live.edgeState,
    tfDataRoot,
    savedPlanRoot,
  };
  const gates = continuationStages.map((gate, gateIndex) => ({
    id: gate.id,
    sequence: gateIndex + 1,
    blocking: true,
    status: 'pending',
    operations: buildGateOperations(context, gate, gateIndex),
  }));
  const blockedSavedPlanHashes = [
    BLOCKED_SAVED_PLAN_SHA256,
    ...predecessor.predecessorEvidence.importedPassedOperations.map(
      (operation) => operation.planEvidence.sha256,
    ),
  ];
  const manifest = {
    manifestVersion: 3,
    executionMode: SUCCESSFUL_CONTINUATION_MODE,
    resumeGateId: SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
    resumeOperationId: SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
    releaseExecutionId: executionId,
    repository: REPOSITORY,
    sourceSha,
    environment: 'staging',
    authoritativeContract: {
      path: 'config/deployment/release-sequence.contract.json',
      sha256: contract.contractSha256,
      contractVersion: contract.contract.contractVersion,
      failurePolicy: contract.contract.failurePolicy,
      automaticRetryAllowed: contract.contract.automaticRetryAllowed,
    },
    continuation,
    predecessorEvidence: predecessor.predecessorEvidence,
    liveDiscovery: live.liveDiscovery,
    candidate,
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
    blockedSavedPlanHashes,
  };
  validateManifest(manifest);
  return manifest;
}

function buildEdgeStateSuccessorRecoveryManifest(input) {
  requireExactKeys(
    input,
    [
      'executionMode',
      'executionId',
      'repository',
      'sourceSha',
      'environment',
      'resumeGateId',
      'resumeOperationId',
      'edgeStateSuccessorRecovery',
      'liveDiscovery',
      'externalTfDataRoot',
      'externalSavedPlanRoot',
    ],
    'context',
  );
  if (input.executionMode !== EDGE_STATE_SUCCESSOR_RECOVERY_MODE) {
    fail(
      'MANIFEST_UNSUPPORTED',
      `Edge state-successor recovery requires executionMode=${EDGE_STATE_SUCCESSOR_RECOVERY_MODE}.`,
    );
  }
  if (
    input.resumeGateId !== SUCCESSFUL_CONTINUATION_RESUME_GATE_ID ||
    input.resumeOperationId !== SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID
  ) {
    fail(
      'EDGE_SUCCESSOR_BOUNDARY_UNSUPPORTED',
      `v4 recovery must resume at ${SUCCESSFUL_CONTINUATION_RESUME_GATE_ID}/${SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID}.`,
    );
  }
  const contract = loadReleaseContract();
  const { continuationStages } = successfulContinuationContractWindow(contract);
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
      'Edge state-successor recovery is staging-only.',
    );
  }
  const executionId = requireString(
    input.executionId,
    'executionId',
    /^[a-z0-9][a-z0-9._-]{2,80}$/u,
  );
  const recovery = validateEdgeStateSuccessorRecoveryMetadata(
    input.edgeStateSuccessorRecovery,
  );
  if (executionId === recovery.priorReleaseExecutionId) {
    fail(
      'EDGE_SUCCESSOR_EXECUTION_ID_REUSE',
      'the v4 execution ID must differ from the interrupted v3 execution ID.',
    );
  }
  const predecessor = loadEdgeStateSuccessorRecoveryPredecessor(
    recovery,
    'edgeStateSuccessorRecovery',
  );
  const live = validateEdgeStateSuccessorRecoveryLiveDiscovery(
    input.liveDiscovery,
    predecessor,
  );
  validateStateReconciliationEvidence(
    predecessor.reconciliationEvidence,
    recovery,
    predecessor,
    live,
  );
  const candidate = structuredClone(predecessor.predecessorManifest.candidate);
  const tfDataRoot = requireExternalAbsolutePath(
    input.externalTfDataRoot,
    'externalTfDataRoot',
  );
  const savedPlanRoot = requireExternalAbsolutePath(
    input.externalSavedPlanRoot,
    'externalSavedPlanRoot',
  );
  const context = {
    executionMode: EDGE_STATE_SUCCESSOR_RECOVERY_MODE,
    executionId,
    sourceSha,
    environment: 'staging',
    candidateImageReference: candidate.imageReference,
    candidateTag: candidate.tag,
    candidateRevision: candidate.revision,
    stableApiRevision: live.stableApiRevision,
    currentImages: live.currentImages,
    runtimeState: live.runtimeState,
    edgeState: live.edgeState,
    tfDataRoot,
    savedPlanRoot,
  };
  const gates = continuationStages.map((gate, gateIndex) => ({
    id: gate.id,
    sequence: gateIndex + 1,
    blocking: true,
    status: 'pending',
    operations: buildGateOperations(context, gate, gateIndex),
  }));
  const blockedSavedPlanHashes = [
    ...new Set([
      ...predecessor.predecessorManifest.blockedSavedPlanHashes,
      recovery.priorSavedPlanSha256,
    ]),
  ];
  const manifest = {
    manifestVersion: 4,
    executionMode: EDGE_STATE_SUCCESSOR_RECOVERY_MODE,
    resumeGateId: SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
    resumeOperationId: SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
    releaseExecutionId: executionId,
    repository: REPOSITORY,
    sourceSha,
    environment: 'staging',
    authoritativeContract: {
      path: 'config/deployment/release-sequence.contract.json',
      sha256: contract.contractSha256,
      contractVersion: contract.contract.contractVersion,
      failurePolicy: contract.contract.failurePolicy,
      automaticRetryAllowed: contract.contract.automaticRetryAllowed,
    },
    edgeStateSuccessorRecovery: recovery,
    predecessorEvidence: structuredClone(
      predecessor.predecessorManifest.predecessorEvidence,
    ),
    liveDiscovery: live.liveDiscovery,
    candidate,
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
    blockedSavedPlanHashes,
  };
  validateManifest(manifest);
  return manifest;
}

function buildManifest(input) {
  const context = requireObject(input, 'context');
  if (!Object.hasOwn(context, 'executionMode')) {
    return buildManifestV1(context);
  }
  if (context.executionMode === 'recovery') {
    return buildRecoveryManifest(context);
  }
  if (context.executionMode === SUCCESSFUL_CONTINUATION_MODE) {
    return buildSuccessfulEdgeContinuationManifest(context);
  }
  if (context.executionMode === EDGE_STATE_SUCCESSOR_RECOVERY_MODE) {
    return buildEdgeStateSuccessorRecoveryManifest(context);
  }
  fail(
    'MANIFEST_UNSUPPORTED',
    `executionMode is unsupported; omit it for v1, use recovery, use ${SUCCESSFUL_CONTINUATION_MODE}, or use ${EDGE_STATE_SUCCESSOR_RECOVERY_MODE}.`,
  );
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
  const api = isRetainedCandidateEdgeReconciliationMode(manifest.executionMode)
    ? manifest.predecessorEvidence.importedPassedOperations.find(
        (operation) => operation.operationId === 'api-candidate-runtime',
      )
    : findOperation(
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
      ...(Object.hasOwn(operation, 'expectedResourceActions')
        ? { expectedResourceActions: operation.expectedResourceActions }
        : {}),
      expectedChangeType: operation.expectedChangeType,
      allowedAttributeChanges: operation.allowedAttributeChanges,
      ...(Object.hasOwn(operation, 'allowedComputedAfterApplyChanges')
        ? {
            allowedComputedAfterApplyChanges:
              operation.allowedComputedAfterApplyChanges,
          }
        : {}),
      ...(Object.hasOwn(operation, 'expectedResourcePlanIdentities')
        ? {
            expectedResourcePlanIdentities:
              operation.expectedResourcePlanIdentities,
            allowedProviderNormalizations:
              operation.allowedProviderNormalizations,
            allowedRefreshOnlyDrift: operation.allowedRefreshOnlyDrift,
            planReviewRequirements: operation.planReviewRequirements,
          }
        : {}),
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

function validateDeterministicReviewEvidence(operation, label) {
  const evidence = requireExactKeys(
    operation.deterministicReviewEvidence,
    [
      'status',
      'reviewEvidenceSha256',
      'reviewedManifestSha256',
      'immutableOperationSpecificationSha256',
      'planJsonSha256',
      'savedPlanSha256',
    ],
    `${label}.deterministicReviewEvidence`,
  );
  if (operation.planEvidence.status === 'not-created') {
    requireExactValue(
      evidence,
      {
        status: 'not-reviewed',
        reviewEvidenceSha256: null,
        reviewedManifestSha256: null,
        immutableOperationSpecificationSha256: null,
        planJsonSha256: null,
        savedPlanSha256: null,
      },
      `${label}.deterministicReviewEvidence`,
    );
    return;
  }
  if (evidence.status !== 'passed') {
    fail(
      'MANIFEST_LIFECYCLE_INVALID',
      `${label} must retain a passed deterministic plan review.`,
    );
  }
  for (const field of [
    'reviewEvidenceSha256',
    'reviewedManifestSha256',
    'immutableOperationSpecificationSha256',
    'planJsonSha256',
    'savedPlanSha256',
  ]) {
    requireString(
      evidence[field],
      `${label}.deterministicReviewEvidence.${field}`,
      /^[a-f0-9]{64}$/u,
    );
  }
  if (evidence.savedPlanSha256 !== operation.planEvidence.sha256) {
    fail(
      'MANIFEST_LIFECYCLE_INVALID',
      `${label} deterministic review is not bound to its registered plan.`,
    );
  }
  if (
    evidence.immutableOperationSpecificationSha256 !==
    immutableOperationSpecificationSha256(operation)
  ) {
    fail(
      'MANIFEST_LIFECYCLE_INVALID',
      `${label} deterministic review has a stale operation specification digest.`,
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
  const hasExpectedResourceActions = Object.hasOwn(
    operation,
    'expectedResourceActions',
  );
  const hasAllowedComputedChanges = Object.hasOwn(
    operation,
    'allowedComputedAfterApplyChanges',
  );
  const reviewPolicyFields = [
    'expectedResourcePlanIdentities',
    'allowedProviderNormalizations',
    'allowedRefreshOnlyDrift',
    'planReviewRequirements',
    'deterministicReviewEvidence',
  ];
  const reviewPolicyFieldCount = reviewPolicyFields.filter((field) =>
    Object.hasOwn(operation, field),
  ).length;
  const hasDeterministicReview = reviewPolicyFieldCount > 0;
  if (
    hasDeterministicReview &&
    reviewPolicyFieldCount !== reviewPolicyFields.length
  ) {
    fail(
      'MANIFEST_SCHEMA_MISMATCH',
      `${label} must declare the complete deterministic plan-review policy.`,
    );
  }
  if (hasExpectedResourceActions !== hasAllowedComputedChanges) {
    fail(
      'MANIFEST_SCHEMA_MISMATCH',
      `${label} must declare resource actions and computed-after-apply changes together.`,
    );
  }
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
      ...(hasExpectedResourceActions ? ['expectedResourceActions'] : []),
      'expectedChangeType',
      'allowedAttributeChanges',
      ...(hasAllowedComputedChanges
        ? ['allowedComputedAfterApplyChanges']
        : []),
      ...(hasDeterministicReview ? reviewPolicyFields : []),
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
  if (hasDeterministicReview) {
    validateDeterministicReviewEvidence(operation, label);
  }
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

function validateManifestV1(manifest) {
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
    candidate.revision !== candidateRevision
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
  const live = validateManifestV1LiveDiscovery(
    manifest.liveDiscovery,
    {
      imageReference: candidateImageReference,
      tag: candidateTag,
      revision: candidateRevision,
    },
    'manifest.liveDiscovery',
    {
      strictManifest: true,
      requireCandidateEdgePreflight: sourceSha === currentSourceSha(),
    },
  );
  const {
    currentImages,
    stableApiRevision,
    runtimeState,
    edgeState,
    preApiTraffic,
  } = live;

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
    preApiTraffic,
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
          (Array.isArray(manifest.blockedSavedPlanHashes) &&
            manifest.blockedSavedPlanHashes.includes(
              operation.planEvidence.sha256,
            )) ||
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

function validateRecoveryManifestV2(manifest) {
  requireExactKeys(
    manifest,
    [
      'manifestVersion',
      'executionMode',
      'resumeGateId',
      'releaseExecutionId',
      'repository',
      'sourceSha',
      'environment',
      'authoritativeContract',
      'recovery',
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
  if (manifest.manifestVersion !== 2 || manifest.executionMode !== 'recovery') {
    fail(
      'MANIFEST_UNSUPPORTED',
      'manifestVersion 2 requires executionMode=recovery.',
    );
  }
  if (manifest.resumeGateId !== RECOVERY_RESUME_GATE_ID) {
    fail(
      'RECOVERY_BOUNDARY_UNSUPPORTED',
      `manifest.resumeGateId must equal ${RECOVERY_RESUME_GATE_ID}.`,
    );
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
  const { predecessorStages, recoveryStages } =
    recoveryContractWindow(contract);
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

  const recovery = validateRecoveryMetadata(
    manifest.recovery,
    'manifest.recovery',
  );
  requireExactValue(manifest.recovery, recovery, 'manifest.recovery');
  if (executionId === recovery.failedReleaseExecutionId) {
    fail(
      'RECOVERY_EXECUTION_ID_REUSE',
      'the recovery execution ID must differ from the failed execution ID.',
    );
  }
  const predecessorEvidence = validateRecoveryPredecessorEvidence(
    manifest.predecessorEvidence,
    predecessorStages,
  );
  requireExactValue(
    manifest.predecessorEvidence,
    predecessorEvidence,
    'manifest.predecessorEvidence',
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
  const expectedTag = expectedCandidateTag(
    candidateImageReference,
    recovery.recoveryAttempt,
  );
  const expectedRevision = `moazez-staging-api-${expectedTag}`;
  requireExactValue(
    candidate,
    {
      imageReference: candidateImageReference,
      tag: expectedTag,
      revision: expectedRevision,
    },
    'manifest.candidate',
  );
  const live = validateRecoveryLiveDiscovery(
    manifest.liveDiscovery,
    candidateImageReference,
    recovery.recoveryAttempt,
    'manifest.liveDiscovery',
  );
  requireExactValue(
    manifest.liveDiscovery,
    live.liveDiscovery,
    'manifest.liveDiscovery',
  );
  if (
    live.candidateTag !== expectedTag ||
    live.candidateRevision !== expectedRevision
  ) {
    fail(
      'CANDIDATE_IDENTITY_MISMATCH',
      'manifest candidate identity differs from the live inventory-derived recovery attempt.',
    );
  }

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
  requireExactValue(
    manifest.blockedSavedPlanHashes,
    [BLOCKED_SAVED_PLAN_SHA256, recovery.failedPlanSha256],
    'manifest.blockedSavedPlanHashes',
  );

  const expectedContext = {
    executionMode: 'recovery',
    executionId,
    sourceSha,
    environment: 'staging',
    candidateImageReference,
    candidateTag: expectedTag,
    candidateRevision: expectedRevision,
    stableApiRevision: live.stableApiRevision,
    currentImages: live.currentImages,
    runtimeState: live.runtimeState,
    edgeState: live.edgeState,
    tfDataRoot,
    savedPlanRoot,
  };
  const expectedGates = recoveryStages.map((gate, gateIndex) => ({
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
      'recovery manifest gate order differs from the approved API-first window.',
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
        `${gate.id} operation count differs from the recovery specification.`,
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
          manifest.blockedSavedPlanHashes.includes(
            operation.planEvidence.sha256,
          ) ||
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
  validateReleaseLifecycle(manifest);
  return manifest;
}

function validateSuccessfulEdgeContinuationManifestV3(manifest) {
  requireExactKeys(
    manifest,
    [
      'manifestVersion',
      'executionMode',
      'resumeGateId',
      'resumeOperationId',
      'releaseExecutionId',
      'repository',
      'sourceSha',
      'environment',
      'authoritativeContract',
      'continuation',
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
  if (
    manifest.manifestVersion !== 3 ||
    manifest.executionMode !== SUCCESSFUL_CONTINUATION_MODE
  ) {
    fail(
      'MANIFEST_UNSUPPORTED',
      `manifestVersion 3 requires executionMode=${SUCCESSFUL_CONTINUATION_MODE}.`,
    );
  }
  if (
    manifest.resumeGateId !== SUCCESSFUL_CONTINUATION_RESUME_GATE_ID ||
    manifest.resumeOperationId !== SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID
  ) {
    fail(
      'CONTINUATION_BOUNDARY_UNSUPPORTED',
      `manifest continuation must resume at ${SUCCESSFUL_CONTINUATION_RESUME_GATE_ID}/${SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID}.`,
    );
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
  const { continuationStages } = successfulContinuationContractWindow(contract);
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

  const continuation = validateSuccessfulContinuationMetadata(
    manifest.continuation,
    sourceSha,
    'manifest.continuation',
  );
  requireExactValue(
    manifest.continuation,
    continuation,
    'manifest.continuation',
  );
  if (executionId === continuation.previousReleaseExecutionId) {
    fail(
      'CONTINUATION_EXECUTION_ID_REUSE',
      'the continuation execution ID must differ from the predecessor release execution ID.',
    );
  }
  const predecessorManifest = loadSuccessfulContinuationPredecessor(
    continuation,
    'manifest.continuation',
  );
  const predecessor =
    validateSuccessfulContinuationPredecessor(predecessorManifest);
  requireExactValue(
    manifest.predecessorEvidence,
    predecessor.predecessorEvidence,
    'manifest.predecessorEvidence',
  );
  requireExactValue(
    manifest.candidate,
    predecessorManifest.candidate,
    'manifest.candidate',
  );
  const live = validateSuccessfulContinuationLiveDiscovery(
    manifest.liveDiscovery,
    predecessor,
    'manifest.liveDiscovery',
  );
  requireExactValue(
    manifest.liveDiscovery,
    live.liveDiscovery,
    'manifest.liveDiscovery',
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
  const blockedSavedPlanHashes = [
    BLOCKED_SAVED_PLAN_SHA256,
    ...predecessor.predecessorEvidence.importedPassedOperations.map(
      (operation) => operation.planEvidence.sha256,
    ),
  ];
  requireExactValue(
    manifest.blockedSavedPlanHashes,
    blockedSavedPlanHashes,
    'manifest.blockedSavedPlanHashes',
  );

  const expectedContext = {
    executionMode: SUCCESSFUL_CONTINUATION_MODE,
    executionId,
    sourceSha,
    environment: 'staging',
    candidateImageReference: predecessorManifest.candidate.imageReference,
    candidateTag: predecessorManifest.candidate.tag,
    candidateRevision: predecessorManifest.candidate.revision,
    stableApiRevision: live.stableApiRevision,
    currentImages: live.currentImages,
    runtimeState: live.runtimeState,
    edgeState: live.edgeState,
    tfDataRoot,
    savedPlanRoot,
  };
  const expectedGates = continuationStages.map((gate, gateIndex) => ({
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
      'successful continuation gate order differs from the approved unresolved remainder.',
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
        `${gate.id} operation count differs from the successful-continuation specification.`,
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
          manifest.blockedSavedPlanHashes.includes(
            operation.planEvidence.sha256,
          ) ||
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
  validateReleaseLifecycle(manifest);
  return manifest;
}

function validateEdgeStateSuccessorRecoveryManifestV4(manifest) {
  if (
    manifest.manifestVersion !== 4 ||
    manifest.executionMode !== EDGE_STATE_SUCCESSOR_RECOVERY_MODE
  ) {
    fail(
      'MANIFEST_UNSUPPORTED',
      `manifestVersion 4 requires executionMode=${EDGE_STATE_SUCCESSOR_RECOVERY_MODE}.`,
    );
  }
  requireExactKeys(
    manifest,
    [
      'manifestVersion',
      'executionMode',
      'resumeGateId',
      'resumeOperationId',
      'releaseExecutionId',
      'repository',
      'sourceSha',
      'environment',
      'authoritativeContract',
      'edgeStateSuccessorRecovery',
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
  if (
    manifest.resumeGateId !== SUCCESSFUL_CONTINUATION_RESUME_GATE_ID ||
    manifest.resumeOperationId !== SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID
  ) {
    fail(
      'EDGE_SUCCESSOR_BOUNDARY_UNSUPPORTED',
      `manifest v4 must resume at ${SUCCESSFUL_CONTINUATION_RESUME_GATE_ID}/${SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID}.`,
    );
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
  const { continuationStages } = successfulContinuationContractWindow(contract);
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
  const recovery = validateEdgeStateSuccessorRecoveryMetadata(
    manifest.edgeStateSuccessorRecovery,
    'manifest.edgeStateSuccessorRecovery',
  );
  requireExactValue(
    manifest.edgeStateSuccessorRecovery,
    recovery,
    'manifest.edgeStateSuccessorRecovery',
  );
  if (executionId === recovery.priorReleaseExecutionId) {
    fail(
      'EDGE_SUCCESSOR_EXECUTION_ID_REUSE',
      'the v4 execution ID must differ from the interrupted v3 execution ID.',
    );
  }
  const predecessor = loadEdgeStateSuccessorRecoveryPredecessor(
    recovery,
    'manifest.edgeStateSuccessorRecovery',
  );
  requireExactValue(
    manifest.predecessorEvidence,
    predecessor.predecessorManifest.predecessorEvidence,
    'manifest.predecessorEvidence',
  );
  requireExactValue(
    manifest.candidate,
    predecessor.predecessorManifest.candidate,
    'manifest.candidate',
  );
  const live = validateEdgeStateSuccessorRecoveryLiveDiscovery(
    manifest.liveDiscovery,
    predecessor,
    'manifest.liveDiscovery',
  );
  requireExactValue(
    manifest.liveDiscovery,
    live.liveDiscovery,
    'manifest.liveDiscovery',
  );
  validateStateReconciliationEvidence(
    predecessor.reconciliationEvidence,
    recovery,
    predecessor,
    live,
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
  const blockedSavedPlanHashes = [
    ...new Set([
      ...predecessor.predecessorManifest.blockedSavedPlanHashes,
      recovery.priorSavedPlanSha256,
    ]),
  ];
  requireExactValue(
    manifest.blockedSavedPlanHashes,
    blockedSavedPlanHashes,
    'manifest.blockedSavedPlanHashes',
  );

  const candidate = predecessor.predecessorManifest.candidate;
  const expectedContext = {
    executionMode: EDGE_STATE_SUCCESSOR_RECOVERY_MODE,
    executionId,
    sourceSha,
    environment: 'staging',
    candidateImageReference: candidate.imageReference,
    candidateTag: candidate.tag,
    candidateRevision: candidate.revision,
    stableApiRevision: live.stableApiRevision,
    currentImages: live.currentImages,
    runtimeState: live.runtimeState,
    edgeState: live.edgeState,
    tfDataRoot,
    savedPlanRoot,
  };
  const expectedGates = continuationStages.map((gate, gateIndex) => ({
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
      'v4 recovery gate order differs from the approved Candidate Edge remainder.',
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
        `${gate.id} operation count differs from the v4 recovery specification.`,
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
          manifest.blockedSavedPlanHashes.includes(
            operation.planEvidence.sha256,
          ) ||
          hashes.has(operation.planEvidence.sha256)
        ) {
          fail(
            'PLAN_REUSE_FORBIDDEN',
            'saved plan hash is blocked or duplicated.',
          );
        }
        hashes.add(operation.planEvidence.sha256);
      }
      const operationLabel = `${gate.id}.${expectedOperation.id}`;
      if (operation.kind === 'terraform') {
        validateTerraformLifecycle(operation, operationLabel);
        validateStatePrecondition(
          manifest,
          operation,
          expectedOperation,
          operationLabel,
        );
      } else {
        validateVerificationLifecycle(operation, operationLabel);
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
  validateReleaseLifecycle(manifest);
  return manifest;
}

function validateManifest(manifest) {
  const candidate = requireObject(manifest, 'manifest');
  if (candidate.manifestVersion === 1) {
    return validateManifestV1(candidate);
  }
  if (candidate.manifestVersion === 2) {
    return validateRecoveryManifestV2(candidate);
  }
  if (candidate.manifestVersion === 3) {
    return validateSuccessfulEdgeContinuationManifestV3(candidate);
  }
  if (candidate.manifestVersion === 4) {
    return validateEdgeStateSuccessorRecoveryManifestV4(candidate);
  }
  fail('MANIFEST_UNSUPPORTED', 'manifestVersion must be 1, 2, 3, or 4.');
}

function canonicalizeTerraformPath(pathSegments) {
  if (!Array.isArray(pathSegments) || pathSegments.length === 0) {
    fail(
      'PLAN_JSON_MALFORMED',
      'Terraform paths must contain at least one segment.',
    );
  }
  let canonicalPath = '';
  for (const [index, segment] of pathSegments.entries()) {
    if (Number.isSafeInteger(segment) && segment >= 0) {
      if (index === 0) {
        fail(
          'PLAN_JSON_MALFORMED',
          'Terraform paths must begin with an attribute name.',
        );
      }
      canonicalPath += `[${segment}]`;
      continue;
    }
    if (typeof segment !== 'string' || segment.length === 0) {
      fail(
        'PLAN_JSON_MALFORMED',
        'Terraform path segments must be non-empty strings or non-negative integers.',
      );
    }
    if (index === 0) {
      canonicalPath = segment;
    } else if (/^[A-Za-z_][A-Za-z0-9_-]*$/u.test(segment)) {
      canonicalPath += `.${segment}`;
    } else {
      canonicalPath += `[${JSON.stringify(segment)}]`;
    }
  }
  return canonicalPath;
}

function collectUnknownPathEntries(value, pathSegments = [], output = []) {
  if (value === true) {
    output.push({
      canonicalPath: canonicalizeTerraformPath(pathSegments),
      pathSegments: [...pathSegments],
    });
    return output;
  }
  if (value === false) return output;
  if (Array.isArray(value)) {
    for (const [index, child] of value.entries()) {
      collectUnknownPathEntries(child, [...pathSegments, index], output);
    }
    return output;
  }
  if (isPlainObject(value)) {
    for (const key of Object.keys(value).sort()) {
      collectUnknownPathEntries(value[key], [...pathSegments, key], output);
    }
    return output;
  }
  fail(
    'PLAN_JSON_MALFORMED',
    'after_unknown may contain only booleans, arrays, and objects.',
  );
}

function collectUnknownCanonicalPaths(value) {
  return collectUnknownPathEntries(value).map((entry) => entry.canonicalPath);
}

const ABSENT_PLAN_VALUE = Symbol('absent-plan-value');

function collectKnownDiffs(
  before,
  after,
  unknownPaths,
  pathSegments = [],
  output = [],
) {
  const canonicalPath =
    pathSegments.length === 0 ? null : canonicalizeTerraformPath(pathSegments);
  if (canonicalPath !== null && unknownPaths.has(canonicalPath)) {
    return output;
  }
  if (
    before !== ABSENT_PLAN_VALUE &&
    after !== ABSENT_PLAN_VALUE &&
    Array.isArray(before) &&
    Array.isArray(after)
  ) {
    const length = Math.max(before.length, after.length);
    for (let index = 0; index < length; index += 1) {
      collectKnownDiffs(
        index < before.length ? before[index] : ABSENT_PLAN_VALUE,
        index < after.length ? after[index] : ABSENT_PLAN_VALUE,
        unknownPaths,
        [...pathSegments, index],
        output,
      );
    }
    return output;
  }
  if (
    before !== ABSENT_PLAN_VALUE &&
    after !== ABSENT_PLAN_VALUE &&
    isPlainObject(before) &&
    isPlainObject(after)
  ) {
    const keys = [
      ...new Set([...Object.keys(before), ...Object.keys(after)]),
    ].sort();
    for (const key of keys) {
      collectKnownDiffs(
        Object.hasOwn(before, key) ? before[key] : ABSENT_PLAN_VALUE,
        Object.hasOwn(after, key) ? after[key] : ABSENT_PLAN_VALUE,
        unknownPaths,
        [...pathSegments, key],
        output,
      );
    }
    return output;
  }
  if (!isDeepStrictEqual(before, after)) {
    if (canonicalPath === null) {
      fail(
        'PLAN_JSON_MALFORMED',
        'resource before and after values must be structured objects.',
      );
    }
    output.push({ canonicalPath, before, after });
  }
  return output;
}

function planPathState(value, pathSegments) {
  let current = value;
  for (const segment of pathSegments) {
    if (
      current === null ||
      typeof current !== 'object' ||
      !Object.hasOwn(current, segment)
    ) {
      return { state: 'absent', value: ABSENT_PLAN_VALUE };
    }
    current = current[segment];
  }
  if (current === null) return { state: 'null', value: null };
  return { state: 'known', value: current };
}

function requireUnknownAfterValueConsistency(change, label) {
  for (const unknownPath of collectUnknownPathEntries(change.after_unknown)) {
    const afterState = planPathState(change.after, unknownPath.pathSegments);
    if (!['absent', 'null'].includes(afterState.state)) {
      fail(
        'PLAN_UNKNOWN_AFTER_VALUE_KNOWN',
        `${label} declares ${unknownPath.canonicalPath} unknown while its after value is known.`,
      );
    }
  }
}

function requirePlanResourceRecord(value, label) {
  if (!isPlainObject(value)) {
    fail('PLAN_JSON_MALFORMED', `${label} must be an object.`);
  }
  const record = value;
  for (const field of ['address', 'mode', 'type', 'provider_name']) {
    if (typeof record[field] !== 'string' || record[field].length === 0) {
      fail('PLAN_JSON_MALFORMED', `${label}.${field} must be a string.`);
    }
  }
  if (!isPlainObject(record.change)) {
    fail('PLAN_JSON_MALFORMED', `${label}.change must be an object.`);
  }
  const change = record.change;
  if (
    !Array.isArray(change.actions) ||
    change.actions.length === 0 ||
    change.actions.some(
      (action) => typeof action !== 'string' || action.length === 0,
    ) ||
    new Set(change.actions).size !== change.actions.length
  ) {
    fail(
      'PLAN_JSON_MALFORMED',
      `${label}.change.actions must be a non-empty unique string array.`,
    );
  }
  for (const field of ['before', 'after', 'after_unknown']) {
    if (!Object.hasOwn(change, field)) {
      fail('PLAN_JSON_MALFORMED', `${label}.change.${field} is required.`);
    }
  }
  collectUnknownCanonicalPaths(change.after_unknown);
  return record;
}

function isNoOpActions(actions) {
  return isDeepStrictEqual(actions, ['no-op']);
}

function requireConsistentNoOpResourceChange(record) {
  const replacePaths = record.change.replace_paths;
  const hasEffectiveReplacePaths = Array.isArray(replacePaths)
    ? replacePaths.length !== 0
    : replacePaths !== undefined && replacePaths !== null;
  const hasUnsafeProvenance =
    Object.hasOwn(record, 'previous_address') ||
    Object.hasOwn(record, 'deposed') ||
    Object.hasOwn(record, 'importing') ||
    Object.hasOwn(record.change, 'importing');
  if (
    !isDeepStrictEqual(record.change.before, record.change.after) ||
    collectUnknownCanonicalPaths(record.change.after_unknown).length !== 0 ||
    hasEffectiveReplacePaths ||
    hasUnsafeProvenance
  ) {
    fail(
      'PLAN_NOOP_CONTRADICTORY',
      `no-op resource change is internally contradictory for ${record.address}.`,
    );
  }
}

function requireResourcePlanIdentity(record, expectedIdentity, label) {
  if (
    record.mode !== expectedIdentity.mode ||
    record.type !== expectedIdentity.type ||
    record.provider_name !== expectedIdentity.providerName
  ) {
    fail(
      'PLAN_RESOURCE_IDENTITY_MISMATCH',
      `${label} does not have the governed Terraform resource identity.`,
    );
  }
}

function requireNoUnsafeResourceProvenance(record, label) {
  if (Object.hasOwn(record, 'previous_address')) {
    fail(
      'PLAN_RESOURCE_PROVENANCE_UNSAFE',
      `${label} must not contain previous_address.`,
    );
  }
  if (Object.hasOwn(record, 'deposed')) {
    fail(
      'PLAN_RESOURCE_PROVENANCE_UNSAFE',
      `${label} must not contain a deposed object.`,
    );
  }
  if (
    Object.hasOwn(record, 'importing') ||
    Object.hasOwn(record.change, 'importing')
  ) {
    fail(
      'PLAN_RESOURCE_PROVENANCE_UNSAFE',
      `${label} must not contain an importing operation.`,
    );
  }
}

function parseCanonicalGoogleComputeUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol === 'https:' &&
      ['www.googleapis.com', 'compute.googleapis.com'].includes(
        parsed.hostname,
      ) &&
      parsed.username === '' &&
      parsed.password === '' &&
      parsed.port === '' &&
      parsed.search === '' &&
      parsed.hash === ''
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function parseCanonicalGoogleComputeNegIdentity(value) {
  const parsed = parseCanonicalGoogleComputeUrl(value);
  if (!parsed) return null;
  const match =
    /^\/compute\/v1\/projects\/([^/%]+)\/regions\/([^/%]+)\/networkEndpointGroups\/([^/%]+)$/u.exec(
      parsed.pathname,
    );
  return match
    ? { project: match[1], region: match[2], negName: match[3] }
    : null;
}

function parseCanonicalGoogleComputeRegionIdentity(value) {
  const parsed = parseCanonicalGoogleComputeUrl(value);
  if (!parsed) return null;
  const match = /^\/compute\/v1\/projects\/([^/%]+)\/regions\/([^/%]+)$/u.exec(
    parsed.pathname,
  );
  return match ? { project: match[1], region: match[2] } : null;
}

function requireCandidateNegBeforeIdentity(record) {
  const selfLink = planPathState(record.change.before, ['self_link']);
  const identity =
    selfLink.state === 'known'
      ? parseCanonicalGoogleComputeNegIdentity(selfLink.value)
      : null;
  if (
    !identity ||
    identity.region !== CANDIDATE_EDGE_IDENTITIES.region ||
    identity.negName !== CANDIDATE_EDGE_IDENTITIES.negName
  ) {
    fail(
      'PLAN_RESOURCE_IDENTITY_MISMATCH',
      'Candidate NEG before.self_link must identify the exact governed regional NEG.',
    );
  }
  return identity;
}

function normalizationMatches(diff, policy, expectedProject = null) {
  if (policy.transition === 'regional-self-link-to-region-name') {
    const identity = parseCanonicalGoogleComputeRegionIdentity(diff.before);
    return (
      diff.after === policy.expectedRegion &&
      identity?.region === policy.expectedRegion &&
      (expectedProject === null || identity.project === expectedProject)
    );
  }
  return (
    isDeepStrictEqual(diff.before, policy.before) &&
    isDeepStrictEqual(diff.after, policy.after)
  );
}

function requireExactBackendCardinality(record) {
  const beforeBackend = record.change.before?.backend;
  const afterBackend = record.change.after?.backend;
  if (
    !Array.isArray(beforeBackend) ||
    !Array.isArray(afterBackend) ||
    beforeBackend.length !== 1 ||
    afterBackend.length !== 1
  ) {
    fail(
      'PLAN_BACKEND_CARDINALITY_INVALID',
      'Candidate Backend must contain exactly one backend element before and after.',
    );
  }
}

function requireExpectedNegReplacement(record) {
  const unsafeReasons = new Set([
    'replace_because_tainted',
    'replace_by_request',
  ]);
  if (unsafeReasons.has(record.action_reason)) {
    fail(
      'PLAN_REPLACEMENT_CAUSE_UNAPPROVED',
      'Candidate NEG replacement has an unsafe action reason.',
    );
  }
  if (
    !Array.isArray(record.change.replace_paths) ||
    record.change.replace_paths.length !== 1 ||
    canonicalizeTerraformPath(record.change.replace_paths[0]) !==
      'cloud_run[0].tag'
  ) {
    fail(
      'PLAN_REPLACEMENT_CAUSE_UNAPPROVED',
      'Candidate NEG replacement must be caused only by cloud_run[0].tag.',
    );
  }
}

function reviewCandidateNegResourceChange(
  record,
  manifest,
  operation,
  candidateNegIdentity,
) {
  requireNoUnsafeResourceProvenance(record, 'Candidate NEG resource change');
  requireExpectedNegReplacement(record);
  const beforeCloudRun = record.change.before?.cloud_run;
  const afterCloudRun = record.change.after?.cloud_run;
  if (
    !Array.isArray(beforeCloudRun) ||
    !Array.isArray(afterCloudRun) ||
    beforeCloudRun.length !== 1 ||
    afterCloudRun.length !== 1
  ) {
    fail(
      'PLAN_SEMANTIC_CHANGE_UNAPPROVED',
      'Candidate NEG must contain exactly one cloud_run element.',
    );
  }
  const unknownPaths = new Set(
    collectUnknownCanonicalPaths(record.change.after_unknown),
  );
  const allowedUnknownPaths = new Set(
    operation.allowedComputedAfterApplyChanges[record.address],
  );
  for (const unknownPath of unknownPaths) {
    if (!allowedUnknownPaths.has(unknownPath)) {
      fail(
        'PLAN_UNKNOWN_UNAPPROVED',
        `Candidate NEG has an unapproved unknown path: ${unknownPath}.`,
      );
    }
  }
  requireUnknownAfterValueConsistency(
    record.change,
    'Candidate NEG resource change',
  );
  const diffs = collectKnownDiffs(
    record.change.before,
    record.change.after,
    unknownPaths,
  );
  const semanticPath = 'cloud_run[0].tag';
  const semanticDiffs = diffs.filter(
    (diff) => diff.canonicalPath === semanticPath,
  );
  const expectedBeforeTag = manifest.liveDiscovery.servingBaseline.candidateTag;
  const expectedAfterTag = manifest.candidate.tag;
  if (
    semanticDiffs.length !== 1 ||
    semanticDiffs[0].before !== expectedBeforeTag ||
    semanticDiffs[0].after !== expectedAfterTag ||
    expectedBeforeTag === expectedAfterTag
  ) {
    fail(
      'PLAN_SEMANTIC_CHANGE_UNAPPROVED',
      'Candidate NEG tag transition does not match the governed serving-to-candidate transition.',
    );
  }
  const normalizationPolicies = new Map(
    operation.allowedProviderNormalizations[record.address].map((policy) => [
      policy.canonicalPath,
      policy,
    ]),
  );
  for (const diff of diffs) {
    if (diff.canonicalPath === semanticPath) continue;
    const policy = normalizationPolicies.get(diff.canonicalPath);
    if (!policy) {
      fail(
        'PLAN_SEMANTIC_CHANGE_UNAPPROVED',
        `Candidate NEG has an unapproved changed path: ${diff.canonicalPath}.`,
      );
    }
    if (!normalizationMatches(diff, policy, candidateNegIdentity.project)) {
      fail(
        'PLAN_NORMALIZATION_UNAPPROVED',
        `Candidate NEG normalization has unapproved values at ${diff.canonicalPath}.`,
      );
    }
  }
  return 1;
}

function reviewCandidateBackendResourceChange(
  record,
  operation,
  candidateNegIdentity,
) {
  requireNoUnsafeResourceProvenance(
    record,
    'Candidate Backend resource change',
  );
  requireExactBackendCardinality(record);
  const unknownPaths = new Set(
    collectUnknownCanonicalPaths(record.change.after_unknown),
  );
  const semanticPath = 'backend[0].group';
  if (!unknownPaths.has(semanticPath)) {
    fail(
      'PLAN_SEMANTIC_CHANGE_UNAPPROVED',
      'Candidate Backend group must become unknown after apply.',
    );
  }
  const beforeGroup = planPathState(record.change.before, [
    'backend',
    0,
    'group',
  ]);
  const afterGroup = planPathState(record.change.after, [
    'backend',
    0,
    'group',
  ]);
  const beforeGroupIdentity =
    beforeGroup.state === 'known'
      ? parseCanonicalGoogleComputeNegIdentity(beforeGroup.value)
      : null;
  if (
    !isDeepStrictEqual(beforeGroupIdentity, candidateNegIdentity) ||
    !['null', 'absent'].includes(afterGroup.state)
  ) {
    fail(
      'PLAN_SEMANTIC_CHANGE_UNAPPROVED',
      'Candidate Backend group does not represent the governed known-NEG to unknown transition.',
    );
  }
  const allowedProviderUnknowns = new Set(
    operation.allowedComputedAfterApplyChanges[record.address],
  );
  for (const unknownPath of unknownPaths) {
    if (
      unknownPath !== semanticPath &&
      !allowedProviderUnknowns.has(unknownPath)
    ) {
      fail(
        'PLAN_UNKNOWN_UNAPPROVED',
        `Candidate Backend has an unapproved unknown path: ${unknownPath}.`,
      );
    }
  }
  requireUnknownAfterValueConsistency(
    record.change,
    'Candidate Backend resource change',
  );
  const diffs = collectKnownDiffs(
    record.change.before,
    record.change.after,
    unknownPaths,
  );
  if (diffs.length !== 0) {
    fail(
      'PLAN_SEMANTIC_CHANGE_UNAPPROVED',
      `Candidate Backend has an unapproved changed path: ${diffs[0].canonicalPath}.`,
    );
  }
  return 1;
}

function isValidTimestamp(value) {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:[.]\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(
      value,
    ) &&
    !Number.isNaN(Date.parse(value))
  );
}

function reviewRefreshOnlyDrift(record, operation, nonNoopAddresses) {
  const policy = operation.allowedRefreshOnlyDrift[record.address];
  if (!policy) {
    fail(
      'PLAN_DRIFT_UNAPPROVED',
      `Terraform plan contains an unapproved drift address: ${record.address}.`,
    );
  }
  requireResourcePlanIdentity(record, policy, 'resource drift');
  requireNoUnsafeResourceProvenance(record, 'resource drift');
  if (!isDeepStrictEqual(record.change.actions, policy.actions)) {
    fail(
      'PLAN_DRIFT_UNAPPROVED',
      `Terraform drift action is unapproved for ${record.address}.`,
    );
  }
  const unknownPaths = new Set(
    collectUnknownCanonicalPaths(record.change.after_unknown),
  );
  if (unknownPaths.size !== 0) {
    fail(
      'PLAN_DRIFT_UNAPPROVED',
      `Terraform drift contains an unknown value for ${record.address}.`,
    );
  }
  if (
    policy.correspondingNonNoopResourceChange === 'forbidden' &&
    nonNoopAddresses.has(record.address)
  ) {
    fail(
      'PLAN_DRIFT_UNAPPROVED',
      `Refresh-only certificate drift has a corresponding non-noop resource change: ${record.address}.`,
    );
  }
  const diffs = collectKnownDiffs(
    record.change.before,
    record.change.after,
    unknownPaths,
  );
  if (policy.exactProviderNormalizations) {
    if (
      diffs.length !== policy.exactProviderNormalizations.length ||
      policy.exactProviderNormalizations.some((normalization) => {
        const diff = diffs.find(
          (candidate) =>
            candidate.canonicalPath === normalization.canonicalPath,
        );
        return !diff || !normalizationMatches(diff, normalization);
      })
    ) {
      fail(
        'PLAN_DRIFT_UNAPPROVED',
        'Candidate Backend drift must contain only the two exact governed null-to-empty-list normalizations.',
      );
    }
    return;
  }
  if (
    !isDeepStrictEqual(
      diffs.map((diff) => diff.canonicalPath).sort(),
      [...policy.exactChangedCanonicalPaths].sort(),
    )
  ) {
    fail(
      'PLAN_DRIFT_UNAPPROVED',
      `Certificate-manager drift must change only update_time for ${record.address}.`,
    );
  }
  const updateTime = diffs[0];
  if (
    !isValidTimestamp(updateTime.before) ||
    !isValidTimestamp(updateTime.after) ||
    updateTime.before === updateTime.after
  ) {
    fail(
      'PLAN_DRIFT_UNAPPROVED',
      `Certificate-manager update_time drift is invalid for ${record.address}.`,
    );
  }
}

function requireCandidateEdgeReviewTarget(manifest, gateId, operationId) {
  const candidate = requireObject(manifest, 'manifest');
  const supportedManifestMode =
    (candidate.manifestVersion === 3 &&
      candidate.executionMode === SUCCESSFUL_CONTINUATION_MODE) ||
    (candidate.manifestVersion === 4 &&
      candidate.executionMode === EDGE_STATE_SUCCESSOR_RECOVERY_MODE);
  if (
    !supportedManifestMode ||
    gateId !== SUCCESSFUL_CONTINUATION_RESUME_GATE_ID ||
    operationId !== SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID
  ) {
    fail(
      'PLAN_REVIEW_NOT_APPLICABLE',
      'deterministic plan review is available only for the exact v3 or v4 Candidate Edge reconciliation.',
    );
  }
  const { gate, operation } = findOperation(candidate, gateId, operationId);
  if (
    operation.kind !== 'terraform' ||
    operation.releaseGateId !== gateId ||
    operation.sourceSha !== candidate.sourceSha ||
    operation.environment !== 'staging' ||
    operation.planReviewRequirements?.required !== true
  ) {
    fail(
      'MANIFEST_SPEC_MISMATCH',
      'the Candidate Edge review target is not the governed v3/v4 operation.',
    );
  }
  return { gate, operation };
}

function immutableOperationSpecificationSha256(operation) {
  return sha256(JSON.stringify(immutableOperationSpecification(operation)));
}

function reviewTerraformPlanJson(planJson, manifest, options = {}) {
  const gateId = options.gateId;
  const operationId = options.operationId;
  const { operation } = requireCandidateEdgeReviewTarget(
    manifest,
    gateId,
    operationId,
  );
  if (!isPlainObject(planJson)) {
    fail('PLAN_JSON_MALFORMED', 'Terraform plan JSON must be an object.');
  }
  const plan = planJson;
  if (typeof plan.format_version !== 'string') {
    fail('PLAN_JSON_MALFORMED', 'format_version must be a string.');
  }
  const formatMatch = /^(\d+)[.](\d+)$/u.exec(plan.format_version);
  if (!formatMatch) {
    fail('PLAN_JSON_MALFORMED', 'format_version must be major.minor.');
  }
  if (
    Number(formatMatch[1]) !==
    operation.planReviewRequirements.compatiblePlanJsonFormatMajor
  ) {
    fail(
      'PLAN_FORMAT_VERSION_UNSUPPORTED',
      'Terraform plan JSON format_version major must be 1.',
    );
  }
  if (plan.applyable !== true) {
    fail('PLAN_NOT_APPLYABLE', 'Terraform plan JSON must be applyable.');
  }
  if (plan.complete !== true) {
    fail('PLAN_INCOMPLETE', 'Terraform plan JSON must be complete.');
  }
  if (plan.errored !== false) {
    fail('PLAN_ERRORED', 'Terraform plan JSON must not be errored.');
  }
  if (
    typeof plan.terraform_version !== 'string' ||
    plan.terraform_version.length === 0
  ) {
    fail('PLAN_JSON_MALFORMED', 'terraform_version must be a string.');
  }
  if (!Array.isArray(plan.resource_changes)) {
    fail('PLAN_JSON_MALFORMED', 'resource_changes must be an array.');
  }
  if (
    Object.hasOwn(plan, 'resource_drift') &&
    !Array.isArray(plan.resource_drift)
  ) {
    fail('PLAN_JSON_MALFORMED', 'resource_drift must be an array.');
  }
  const resourceChanges = plan.resource_changes.map((record, index) =>
    requirePlanResourceRecord(record, `resource_changes[${index}]`),
  );
  const resourceChangeAddresses = new Set();
  for (const record of resourceChanges) {
    if (resourceChangeAddresses.has(record.address)) {
      fail(
        'PLAN_DUPLICATE_RESOURCE_CHANGE',
        `Terraform plan contains duplicate resource change address: ${record.address}.`,
      );
    }
    resourceChangeAddresses.add(record.address);
    if (isNoOpActions(record.change.actions)) {
      requireConsistentNoOpResourceChange(record);
    }
  }
  const nonNoopChanges = resourceChanges.filter(
    (record) => !isNoOpActions(record.change.actions),
  );
  const nonNoopAddresses = new Set(
    nonNoopChanges.map((record) => record.address),
  );
  if (
    nonNoopChanges.length !==
      operation.expectedResourceAddressAllowlist.length ||
    !isDeepStrictEqual(
      [...nonNoopAddresses].sort(),
      [...operation.expectedResourceAddressAllowlist].sort(),
    )
  ) {
    fail(
      'PLAN_RESOURCE_CHANGE_SET_MISMATCH',
      'non-noop resource changes must contain exactly the Candidate NEG and Candidate Backend.',
    );
  }

  const candidateNegRecord = nonNoopChanges.find(
    (record) =>
      record.address === EDGE_CANDIDATE_RECONCILIATION_RESOURCE_ADDRESSES[0],
  );
  const candidateNegIdentity =
    requireCandidateNegBeforeIdentity(candidateNegRecord);

  let intendedSemanticChangeCount = 0;
  for (const record of nonNoopChanges) {
    requireResourcePlanIdentity(
      record,
      operation.expectedResourcePlanIdentities[record.address],
      'resource change',
    );
    if (
      !isDeepStrictEqual(
        record.change.actions,
        operation.expectedResourceActions[record.address],
      )
    ) {
      fail(
        'PLAN_ACTION_MISMATCH',
        `Terraform actions differ from the governed actions for ${record.address}.`,
      );
    }
    if (
      record.address === EDGE_CANDIDATE_RECONCILIATION_RESOURCE_ADDRESSES[0]
    ) {
      intendedSemanticChangeCount += reviewCandidateNegResourceChange(
        record,
        manifest,
        operation,
        candidateNegIdentity,
      );
    } else {
      intendedSemanticChangeCount += reviewCandidateBackendResourceChange(
        record,
        operation,
        candidateNegIdentity,
      );
    }
  }

  const resourceDrift = (plan.resource_drift ?? []).map((record, index) =>
    requirePlanResourceRecord(record, `resource_drift[${index}]`),
  );
  const driftAddresses = new Set();
  for (const record of resourceDrift) {
    if (driftAddresses.has(record.address)) {
      fail(
        'PLAN_DUPLICATE_DRIFT',
        `Terraform plan contains duplicate resource drift address: ${record.address}.`,
      );
    }
    driftAddresses.add(record.address);
    reviewRefreshOnlyDrift(record, operation, nonNoopAddresses);
  }

  return {
    schemaVersion: 1,
    status: 'passed',
    releaseExecutionId: manifest.releaseExecutionId,
    sourceSha: manifest.sourceSha,
    gateId,
    operationId,
    immutableOperationSpecificationSha256:
      immutableOperationSpecificationSha256(operation),
    formatVersion: plan.format_version,
    terraformVersion: plan.terraform_version,
    nonNoopResourceChangeCount: nonNoopChanges.length,
    intendedSemanticChangeCount,
    refreshOnlyDriftCount: resourceDrift.length,
    unapprovedSemanticChangeCount: 0,
    unapprovedUnknownCount: 0,
    unapprovedNormalizationCount: 0,
    unapprovedDriftCount: 0,
    urlMapMutation: false,
  };
}

const PLAN_REVIEW_EVIDENCE_KEYS = Object.freeze([
  'schemaVersion',
  'status',
  'manifestSha256',
  'releaseExecutionId',
  'sourceSha',
  'gateId',
  'operationId',
  'immutableOperationSpecificationSha256',
  'savedPlanPath',
  'savedPlanSha256',
  'savedPlanSizeBytes',
  'planJsonSha256',
  'planJsonSizeBytes',
  'formatVersion',
  'terraformVersion',
  'nonNoopResourceChangeCount',
  'intendedSemanticChangeCount',
  'refreshOnlyDriftCount',
  'unapprovedSemanticChangeCount',
  'unapprovedUnknownCount',
  'unapprovedNormalizationCount',
  'unapprovedDriftCount',
  'urlMapMutation',
]);

function parseJsonBytes(bytes, label, errorCode) {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    fail(errorCode, `${label} could not be read as JSON: ${error.message}`);
  }
}

function requirePlanReviewEvidence(value) {
  if (!isPlainObject(value)) {
    fail('PLAN_REVIEW_EVIDENCE_INVALID', 'review evidence must be an object.');
  }
  if (
    !isDeepStrictEqual(
      Object.keys(value).sort(),
      [...PLAN_REVIEW_EVIDENCE_KEYS].sort(),
    )
  ) {
    fail(
      'PLAN_REVIEW_EVIDENCE_INVALID',
      'review evidence contains unexpected or missing fields.',
    );
  }
  if (value.schemaVersion !== 1 || value.status !== 'passed') {
    fail(
      'PLAN_REVIEW_EVIDENCE_INVALID',
      'review evidence must be schemaVersion 1 with passed status.',
    );
  }
  for (const field of [
    'manifestSha256',
    'immutableOperationSpecificationSha256',
    'savedPlanSha256',
    'planJsonSha256',
  ]) {
    if (!/^[a-f0-9]{64}$/u.test(value[field] ?? '')) {
      fail(
        'PLAN_REVIEW_EVIDENCE_INVALID',
        `review evidence ${field} is invalid.`,
      );
    }
  }
  if (!/^[a-f0-9]{40}$/u.test(value.sourceSha ?? '')) {
    fail(
      'PLAN_REVIEW_EVIDENCE_INVALID',
      'review evidence sourceSha is invalid.',
    );
  }
  for (const field of [
    'releaseExecutionId',
    'gateId',
    'operationId',
    'savedPlanPath',
    'formatVersion',
    'terraformVersion',
  ]) {
    if (typeof value[field] !== 'string' || value[field].length === 0) {
      fail(
        'PLAN_REVIEW_EVIDENCE_INVALID',
        `review evidence ${field} must be a string.`,
      );
    }
  }
  if (!/^1[.]\d+$/u.test(value.formatVersion)) {
    fail(
      'PLAN_REVIEW_EVIDENCE_INVALID',
      'review evidence formatVersion must have major version 1.',
    );
  }
  for (const field of [
    'savedPlanSizeBytes',
    'planJsonSizeBytes',
    'nonNoopResourceChangeCount',
    'intendedSemanticChangeCount',
    'refreshOnlyDriftCount',
    'unapprovedSemanticChangeCount',
    'unapprovedUnknownCount',
    'unapprovedNormalizationCount',
    'unapprovedDriftCount',
  ]) {
    if (!Number.isSafeInteger(value[field]) || value[field] < 0) {
      fail(
        'PLAN_REVIEW_EVIDENCE_INVALID',
        `review evidence ${field} must be a non-negative integer.`,
      );
    }
  }
  if (
    value.savedPlanSizeBytes === 0 ||
    value.planJsonSizeBytes === 0 ||
    value.nonNoopResourceChangeCount !== 2 ||
    value.intendedSemanticChangeCount !== 2 ||
    value.refreshOnlyDriftCount >
      EDGE_REFRESH_ONLY_DRIFT_RESOURCE_ADDRESSES.length ||
    value.unapprovedSemanticChangeCount !== 0 ||
    value.unapprovedUnknownCount !== 0 ||
    value.unapprovedNormalizationCount !== 0 ||
    value.unapprovedDriftCount !== 0 ||
    value.urlMapMutation !== false
  ) {
    fail(
      'PLAN_REVIEW_EVIDENCE_INVALID',
      'review evidence does not contain a passing governed result.',
    );
  }
  return value;
}

function buildDeterministicPlanReviewEvidence({
  manifest,
  manifestBytes,
  gateId,
  operationId,
  savedPlanPath,
  savedPlanBytes,
  planJsonBytes,
}) {
  const planJson = parseJsonBytes(
    planJsonBytes,
    'Terraform plan JSON',
    'PLAN_JSON_MALFORMED',
  );
  const review = reviewTerraformPlanJson(planJson, manifest, {
    gateId,
    operationId,
  });
  return requirePlanReviewEvidence({
    schemaVersion: review.schemaVersion,
    status: review.status,
    manifestSha256: sha256(manifestBytes),
    releaseExecutionId: review.releaseExecutionId,
    sourceSha: review.sourceSha,
    gateId: review.gateId,
    operationId: review.operationId,
    immutableOperationSpecificationSha256:
      review.immutableOperationSpecificationSha256,
    savedPlanPath,
    savedPlanSha256: sha256(savedPlanBytes),
    savedPlanSizeBytes: savedPlanBytes.length,
    planJsonSha256: sha256(planJsonBytes),
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
  });
}

function writeNewJsonAtomic(filePath, value) {
  const resolved = requireExternalAbsolutePath(filePath, 'reviewEvidencePath');
  if (fs.statSync(resolved, { throwIfNoEntry: false })) {
    fail(
      'REVIEW_EVIDENCE_ALREADY_EXISTS',
      'review evidence path already exists.',
    );
  }
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const temporary = `${resolved}.tmp-${process.pid}-${crypto.randomUUID()}`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    fs.linkSync(temporary, resolved);
  } catch (error) {
    if (error instanceof DeploymentControlError) throw error;
    fail(
      'REVIEW_EVIDENCE_WRITE_FAILED',
      `review evidence could not be created atomically: ${error.message}`,
    );
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  return resolved;
}

function reviewPlanFiles(options) {
  const manifestPath = requireExternalAbsolutePath(
    options.manifestPath,
    'manifestPath',
  );
  const savedPlanPath = requireExternalAbsolutePath(
    options.planPath,
    'planPath',
  );
  const planJsonPath = requireExternalAbsolutePath(
    options.planJsonPath,
    'planJsonPath',
  );
  const reviewEvidencePath = requireExternalAbsolutePath(
    options.reviewEvidencePath,
    'reviewEvidencePath',
  );
  if (
    new Set([manifestPath, savedPlanPath, planJsonPath, reviewEvidencePath])
      .size !== 4
  ) {
    fail(
      'INVALID_PATH',
      'manifest, saved plan, plan JSON, and review evidence paths must be distinct.',
    );
  }
  const manifestBytes = fs.readFileSync(manifestPath);
  const manifest = parseJsonBytes(
    manifestBytes,
    'release manifest',
    'INVALID_JSON',
  );
  validateManifest(manifest);
  assertSourceBinding(manifest);
  const { gate, operation } = requireCandidateEdgeReviewTarget(
    manifest,
    options.gateId,
    options.operationId,
  );
  assertReleaseCanAdvance(manifest, gate, operation);
  if (
    operation.status !== 'pending' ||
    operation.planEvidence.status !== 'not-created' ||
    operation.deterministicReviewEvidence.status !== 'not-reviewed'
  ) {
    fail(
      'PLAN_REVIEW_OUT_OF_ORDER',
      'the v3/v4 Candidate Edge operation is not awaiting deterministic review.',
    );
  }
  if (path.resolve(operation.savedPlanPath) !== savedPlanPath) {
    fail(
      'PLAN_PATH_MISMATCH',
      'planPath differs from the governed saved-plan path.',
    );
  }
  const savedPlanBytes = fs.readFileSync(savedPlanPath);
  if (savedPlanBytes.length === 0) {
    fail('PLAN_FILE_INVALID', 'saved plan file must not be empty.');
  }
  const planJsonBytes = fs.readFileSync(planJsonPath);
  if (planJsonBytes.length === 0) {
    fail('PLAN_JSON_MALFORMED', 'plan JSON file must not be empty.');
  }
  const evidence = buildDeterministicPlanReviewEvidence({
    manifest,
    manifestBytes,
    gateId: options.gateId,
    operationId: options.operationId,
    savedPlanPath,
    savedPlanBytes,
    planJsonBytes,
  });
  const createdPath = writeNewJsonAtomic(reviewEvidencePath, evidence);
  return { evidence, reviewEvidencePath: createdPath };
}

function registerPlan(manifest, options) {
  validateManifest(manifest);
  assertSourceBinding(manifest);
  const { gate, operation } = findOperation(
    manifest,
    options.gateId,
    options.operationId,
  );
  const requiresDeterministicReview =
    ((manifest.manifestVersion === 3 &&
      manifest.executionMode === SUCCESSFUL_CONTINUATION_MODE) ||
      (manifest.manifestVersion === 4 &&
        manifest.executionMode === EDGE_STATE_SUCCESSOR_RECOVERY_MODE)) &&
    gate.id === SUCCESSFUL_CONTINUATION_RESUME_GATE_ID &&
    operation.id === SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID;
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
    manifest.blockedSavedPlanHashes.includes(planSha) ||
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
  let deterministicReviewEvidence = null;
  if (requiresDeterministicReview) {
    if (!Buffer.isBuffer(options.manifestBytes)) {
      fail(
        'PLAN_REVIEW_EVIDENCE_REQUIRED',
        'v3/v4 registration requires the exact pre-registration manifest bytes.',
      );
    }
    if (
      typeof options.reviewEvidencePath !== 'string' ||
      options.reviewEvidencePath.length === 0 ||
      typeof options.planJsonPath !== 'string' ||
      options.planJsonPath.length === 0
    ) {
      fail(
        'PLAN_REVIEW_EVIDENCE_REQUIRED',
        'v3/v4 registration requires --plan-json and --review-evidence.',
      );
    }
    const reviewedManifest = parseJsonBytes(
      options.manifestBytes,
      'pre-registration manifest',
      'PLAN_REVIEW_EVIDENCE_INVALID',
    );
    if (!isDeepStrictEqual(reviewedManifest, manifest)) {
      fail(
        'PLAN_REVIEW_BINDING_MISMATCH',
        'pre-registration manifest bytes do not match the manifest being registered.',
      );
    }
    const reviewEvidencePath = requireExternalAbsolutePath(
      options.reviewEvidencePath,
      'reviewEvidencePath',
    );
    const planJsonPath = requireExternalAbsolutePath(
      options.planJsonPath,
      'planJsonPath',
    );
    if (
      new Set([suppliedPlanPath, planJsonPath, reviewEvidencePath]).size !== 3
    ) {
      fail(
        'INVALID_PATH',
        'saved plan, plan JSON, and review evidence paths must be distinct.',
      );
    }
    const planJsonBytes = fs.readFileSync(planJsonPath);
    if (planJsonBytes.length === 0) {
      fail('PLAN_JSON_MALFORMED', 'plan JSON file must not be empty.');
    }
    const reviewEvidenceBytes = fs.readFileSync(reviewEvidencePath);
    const reviewEvidence = requirePlanReviewEvidence(
      parseJsonBytes(
        reviewEvidenceBytes,
        'plan review evidence',
        'PLAN_REVIEW_EVIDENCE_INVALID',
      ),
    );
    const currentManifestSha256 = sha256(options.manifestBytes);
    const currentImmutableSpecificationSha256 =
      immutableOperationSpecificationSha256(operation);
    if (
      reviewEvidence.manifestSha256 !== currentManifestSha256 ||
      reviewEvidence.releaseExecutionId !== manifest.releaseExecutionId ||
      reviewEvidence.sourceSha !== manifest.sourceSha ||
      reviewEvidence.gateId !== gate.id ||
      reviewEvidence.operationId !== operation.id ||
      reviewEvidence.immutableOperationSpecificationSha256 !==
        currentImmutableSpecificationSha256 ||
      reviewEvidence.savedPlanPath !== suppliedPlanPath
    ) {
      fail(
        'PLAN_REVIEW_BINDING_MISMATCH',
        'plan review evidence does not match the current release, source, operation, manifest, or immutable specification.',
      );
    }
    if (
      reviewEvidence.savedPlanSha256 !== planSha ||
      reviewEvidence.savedPlanSizeBytes !== planBytes.length
    ) {
      fail(
        'REVIEWED_PLAN_MISMATCH',
        'saved plan bytes differ from the exact plan that passed review.',
      );
    }
    const reconstructedReviewEvidence = buildDeterministicPlanReviewEvidence({
      manifest,
      manifestBytes: options.manifestBytes,
      gateId: gate.id,
      operationId: operation.id,
      savedPlanPath: suppliedPlanPath,
      savedPlanBytes: planBytes,
      planJsonBytes,
    });
    if (!isDeepStrictEqual(reviewEvidence, reconstructedReviewEvidence)) {
      fail(
        'PLAN_REVIEW_EVIDENCE_MISMATCH',
        'plan review evidence does not exactly match a fresh deterministic review of the supplied plan JSON bytes.',
      );
    }
    deterministicReviewEvidence = {
      status: 'passed',
      reviewEvidenceSha256: sha256(reviewEvidenceBytes),
      reviewedManifestSha256: currentManifestSha256,
      immutableOperationSpecificationSha256:
        currentImmutableSpecificationSha256,
      planJsonSha256: reviewEvidence.planJsonSha256,
      savedPlanSha256: planSha,
    };
  }
  operation.planEvidence = {
    status: 'registered',
    sha256: planSha,
    sizeBytes: planBytes.length,
    registeredAt: requireIsoTimestamp(options.recordedAt, 'recordedAt'),
    reviewed: false,
  };
  if (requiresDeterministicReview) {
    operation.deterministicReviewEvidence = deterministicReviewEvidence;
  }
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
  } else if (
    manifest.releaseStatus === 'pending' &&
    manifest.gates.some((candidate) => candidate.status === 'passed')
  ) {
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
  const manifestBytes = fs.readFileSync(manifestPath);
  const manifest = parseJsonBytes(
    manifestBytes,
    'release manifest',
    'INVALID_JSON',
  );
  return { manifestPath, manifest, manifestBytes };
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
  if (command === 'review-plan') {
    const { evidence, reviewEvidencePath } = reviewPlanFiles({
      manifestPath: requireCliOption(options, 'manifest'),
      gateId: requireCliOption(options, 'gate'),
      operationId: requireCliOption(options, 'operation'),
      planPath: requireCliOption(options, 'plan'),
      planJsonPath: requireCliOption(options, 'planJson'),
      reviewEvidencePath: requireCliOption(options, 'reviewEvidence'),
    });
    return { command, reviewEvidencePath, ...evidence };
  }
  const { manifestPath, manifest, manifestBytes } =
    loadManifestForUpdate(options);
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
      planJsonPath: options.planJson,
      reviewEvidencePath: options.reviewEvidence,
      manifestBytes,
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
  CANDIDATE_EDGE_IDENTITIES,
  DeploymentControlError,
  EDGE_STATE_SUCCESSOR_RECOVERY_GATE_IDS,
  EDGE_STATE_SUCCESSOR_RECOVERY_MODE,
  EDGE_CANDIDATE_RESOURCE_ADDRESSES,
  EDGE_CANDIDATE_RECONCILIATION_RESOURCE_ADDRESSES,
  EDGE_REFRESH_ONLY_DRIFT_RESOURCE_ADDRESSES,
  MAX_RECOVERY_ATTEMPT,
  RECOVERY_GATE_IDS,
  RECOVERY_PREDECESSOR_STAGE_IDS,
  RECOVERY_RESUME_GATE_ID,
  REPOSITORY,
  RUNTIME_RESOURCE_ADDRESSES,
  SMOKE_BACKEND_PATH,
  SMOKE_PUBLIC_PATH,
  SUCCESSFUL_CONTINUATION_GATE_IDS,
  SUCCESSFUL_CONTINUATION_MODE,
  SUCCESSFUL_CONTINUATION_RESUME_GATE_ID,
  SUCCESSFUL_CONTINUATION_RESUME_OPERATION_ID,
  approvePlan,
  buildManifest,
  canonicalizeTerraformPath,
  currentSourceSha,
  expectedCandidateTag,
  loadReleaseContract,
  recordApply,
  recordVerification,
  registerPlan,
  reviewTerraformPlanJson,
  runCli,
  validateManifest,
  writeJsonAtomic,
});
