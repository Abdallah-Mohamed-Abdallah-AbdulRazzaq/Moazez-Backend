'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { execFileSync } = require('node:child_process');
const {
  ACTIVE_TAP_OWNERS,
  classifyTestFile,
} = require('../ci/plan-ci.cjs');

const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..');
const BASE_SHA = 'd1939edc059b19c70ae6292ed64de3013ec3309c';
const MODULE_ROOT = 'infra/gcp/backend-runtime/modules/runtime-environment';
const STAGING_ROOT = 'infra/gcp/backend-runtime/environments/nonprod/runtime';
const PRODUCTION_ROOT =
  'infra/gcp/backend-runtime/environments/production/runtime';
const PRODUCTION_MIGRATION_ROOT =
  'infra/gcp/backend-runtime/environments/production/migration';
const TEST_PATH =
  'scripts/tests/stage-29a-production-runtime-source.test.cjs';
const STAGE_28_TEST_PATH =
  'scripts/tests/stage-28a-production-migration-job-source.test.cjs';
const STAGE_30C1_TEST_PATH =
  'scripts/tests/stage-30c1-production-frontend-edge-source.test.cjs';
const PT2_TEST_PATH =
  'scripts/tests/pt-2-backend-firebase-production-bootstrap.test.cjs';
const HISTORICAL_RUNTIME_POLICY_TEST_PATH =
  'scripts/tests/verify-runtime-policy.test.cjs';
const PLAN_CI_PATH = 'scripts/ci/plan-ci.cjs';
const PLAN_CI_TEST_PATH = 'scripts/tests/plan-ci.test.cjs';
const README_PATH = 'infra/gcp/backend-runtime/README.md';

const ROOT_FILES = Object.freeze([
  '.terraform.lock.hcl',
  'main.tf',
  'outputs.tf',
  'providers.tf',
  'variables.tf',
  'versions.tf',
]);

const AUTHORIZED_STAGE29A_PATHS = Object.freeze(
  [
    `${STAGING_ROOT}/main.tf`,
    `${PRODUCTION_ROOT}/.terraform.lock.hcl`,
    `${PRODUCTION_ROOT}/main.tf`,
    `${PRODUCTION_ROOT}/outputs.tf`,
    `${PRODUCTION_ROOT}/providers.tf`,
    `${PRODUCTION_ROOT}/variables.tf`,
    `${PRODUCTION_ROOT}/versions.tf`,
    `${MODULE_ROOT}/main.tf`,
    `${MODULE_ROOT}/variables.tf`,
    `${MODULE_ROOT}/outputs.tf`,
    README_PATH,
    PLAN_CI_PATH,
    HISTORICAL_RUNTIME_POLICY_TEST_PATH,
    TEST_PATH,
  ].sort(),
);
const PT2_STAGE29_DELEGATED_PATHS = Object.freeze(
  [
    `${STAGING_ROOT}/main.tf`,
    `${PRODUCTION_ROOT}/main.tf`,
    `${PRODUCTION_ROOT}/variables.tf`,
    `${MODULE_ROOT}/main.tf`,
    `${MODULE_ROOT}/variables.tf`,
    PLAN_CI_PATH,
    PLAN_CI_TEST_PATH,
    PT2_TEST_PATH,
    TEST_PATH,
  ].sort(),
);

const STAGING_IMAGE_PATTERN =
  '^me-central2-docker[.]pkg[.]dev/moazez-nonprod-91001421934/moazez-staging-containers/moazez-backend@sha256:[a-f0-9]{64}$';
const PRODUCTION_IMAGE_PATTERN =
  '^me-central2-docker[.]pkg[.]dev/moazez-production/moazez-production-containers/moazez-backend@sha256:[a-f0-9]{64}$';
const API_URL_PATTERN =
  '^https://[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?([.][A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*([:](6553[0-5]|655[0-2][0-9]|65[0-4][0-9]{2}|6[0-4][0-9]{3}|[1-5][0-9]{4}|[1-9][0-9]{0,3}))?/?$';
const KEY_ID_PATTERN = '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$';
const FCM_DELIVERY_MODES = Object.freeze([
  'disabled',
  'dry_run',
  'send_enabled',
]);
const STAGE_27_DIGEST =
  'aa1f4099f35cd5d4e6961e925f32aa52fb604e832f230d6c02d5051c8f6fdb41';

const ROOT_VARIABLES = Object.freeze([
  'image_reference',
  'fcm_delivery_mode',
  'queue_redis_host',
  'queue_redis_port',
  'queue_redis_ca_pem',
  'realtime_redis_host',
  'realtime_redis_port',
  'realtime_redis_ca_pem',
  'api_url',
  'settings_email_secret_encryption_active_key_id',
  'app_device_token_encryption_active_key_id',
]);

const MODULE_VARIABLES = Object.freeze([
  'environment',
  'fcm_delivery_mode',
  'image_reference',
  ...ROOT_VARIABLES.slice(2),
]);

const PRODUCTION_CONTRACT = Object.freeze({
  project_id: 'moazez-production',
  region: 'me-central2',
  network: 'moazez-production-vpc',
  subnetwork: 'moazez-production-runtime-me-central2',
  api_service_name: 'moazez-production-api',
  core_worker_pool_name: 'moazez-production-core-worker',
  media_worker_pool_name: 'moazez-production-media-worker',
  maintenance_scheduler_pool_name:
    'moazez-production-maintenance-scheduler',
  api_service_account:
    'moazez-api-runtime@moazez-production.iam.gserviceaccount.com',
  core_worker_service_account:
    'moazez-core-worker@moazez-production.iam.gserviceaccount.com',
  media_worker_service_account:
    'moazez-media-worker@moazez-production.iam.gserviceaccount.com',
  maintenance_service_account:
    'moazez-maintenance-scheduler@moazez-production.iam.gserviceaccount.com',
  node_environment: 'production',
  trusted_proxy_mode: 'none',
  cors_origins:
    'https://schools.moazez.cloud,https://admin.moazez.cloud',
  image_pattern: PRODUCTION_IMAGE_PATTERN,
  storage_private_bucket: 'moazez-production-91001421934-private',
  storage_published_bucket: 'moazez-production-91001421934-published',
  gcs_signing_service_account:
    'moazez-gcs-signer@moazez-production.iam.gserviceaccount.com',
});

const STAGING_CONTRACT = Object.freeze({
  project_id: 'moazez-nonprod-91001421934',
  region: 'me-central2',
  network: 'moazez-staging-vpc',
  subnetwork: 'moazez-staging-runtime-me-central2',
  api_service_name: 'moazez-staging-api',
  core_worker_pool_name: 'moazez-staging-core-worker',
  media_worker_pool_name: 'moazez-staging-media-worker',
  maintenance_scheduler_pool_name: 'moazez-staging-maintenance-scheduler',
  api_service_account:
    'moazez-api-runtime@moazez-nonprod-91001421934.iam.gserviceaccount.com',
  core_worker_service_account:
    'moazez-core-worker@moazez-nonprod-91001421934.iam.gserviceaccount.com',
  media_worker_service_account:
    'moazez-media-worker@moazez-nonprod-91001421934.iam.gserviceaccount.com',
  maintenance_service_account:
    'moazez-maintenance-scheduler@moazez-nonprod-91001421934.iam.gserviceaccount.com',
  node_environment: 'staging',
  trusted_proxy_mode: 'gcp_external_alb',
  cors_origins:
    'https://staging-schools.moazez.cloud,https://staging-admin.moazez.cloud',
  image_pattern: STAGING_IMAGE_PATTERN,
  storage_private_bucket: 'moazez-nonprod-91001421934-private',
  storage_published_bucket: 'moazez-nonprod-91001421934-published',
  gcs_signing_service_account:
    'moazez-gcs-signer@moazez-nonprod-91001421934.iam.gserviceaccount.com',
});

const PRODUCTION_SECRETS = Object.freeze({
  api_secret_environment: Object.freeze({
    DATABASE_URL: 'moazez-production-api-database-url',
    JWT_ACCESS_SECRET: 'moazez-production-jwt-access-secret',
    JWT_REFRESH_SECRET: 'moazez-production-jwt-refresh-secret',
    SETTINGS_EMAIL_SECRET_ENCRYPTION_ACTIVE_KEY:
      'moazez-production-smtp-secret-encryption-key',
    APP_DEVICE_TOKEN_ENCRYPTION_ACTIVE_KEY:
      'moazez-production-app-device-token-encryption-key',
  }),
  core_worker_secret_environment: Object.freeze({
    DATABASE_URL: 'moazez-production-core-worker-database-url',
    SETTINGS_EMAIL_SECRET_ENCRYPTION_ACTIVE_KEY:
      'moazez-production-smtp-secret-encryption-key',
    APP_DEVICE_TOKEN_ENCRYPTION_ACTIVE_KEY:
      'moazez-production-app-device-token-encryption-key',
  }),
  media_worker_secret_environment: Object.freeze({
    DATABASE_URL: 'moazez-production-media-worker-database-url',
  }),
});

const STAGING_SECRETS = Object.freeze({
  api_secret_environment: Object.freeze({
    DATABASE_URL: 'moazez-staging-api-database-url',
    JWT_ACCESS_SECRET: 'moazez-staging-jwt-access-secret',
    JWT_REFRESH_SECRET: 'moazez-staging-jwt-refresh-secret',
    SETTINGS_EMAIL_SECRET_ENCRYPTION_ACTIVE_KEY:
      'moazez-staging-smtp-secret-encryption-key',
    APP_DEVICE_TOKEN_ENCRYPTION_ACTIVE_KEY:
      'moazez-staging-app-device-token-encryption-key',
  }),
  core_worker_secret_environment: Object.freeze({
    DATABASE_URL: 'moazez-staging-core-worker-database-url',
    SETTINGS_EMAIL_SECRET_ENCRYPTION_ACTIVE_KEY:
      'moazez-staging-smtp-secret-encryption-key',
    APP_DEVICE_TOKEN_ENCRYPTION_ACTIVE_KEY:
      'moazez-staging-app-device-token-encryption-key',
  }),
  media_worker_secret_environment: Object.freeze({
    DATABASE_URL: 'moazez-staging-media-worker-database-url',
  }),
});

const GOVERNED_TERRAFORM_PATHS = Object.freeze([
  `${MODULE_ROOT}/main.tf`,
  `${MODULE_ROOT}/variables.tf`,
  `${MODULE_ROOT}/outputs.tf`,
  ...ROOT_FILES.filter((file) => file.endsWith('.tf')).map(
    (file) => `${STAGING_ROOT}/${file}`,
  ),
  ...ROOT_FILES.filter((file) => file.endsWith('.tf')).map(
    (file) => `${PRODUCTION_ROOT}/${file}`,
  ),
]);

function repositoryPath(relativePath) {
  return path.join(REPOSITORY_ROOT, ...relativePath.split('/'));
}

function normalizedSource(relativePath) {
  return fs
    .readFileSync(repositoryPath(relativePath), 'utf8')
    .replace(/\r\n/gu, '\n');
}

function baseSource(relativePath) {
  return execFileSync('git', ['show', `${BASE_SHA}:${relativePath}`], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    windowsHide: true,
  }).replace(/\r\n/gu, '\n');
}

function withoutHclComments(source) {
  let output = '';
  let inString = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const nextCharacter = source[index + 1];
    if (lineComment) {
      if (character === '\n') {
        lineComment = false;
        output += character;
      }
      continue;
    }
    if (blockComment) {
      if (character === '*' && nextCharacter === '/') {
        blockComment = false;
        index += 1;
      } else if (character === '\n') {
        output += character;
      }
      continue;
    }
    if (inString) {
      output += character;
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
      output += character;
    } else if (character === '#') {
      lineComment = true;
    } else if (character === '/' && nextCharacter === '/') {
      lineComment = true;
      index += 1;
    } else if (character === '/' && nextCharacter === '*') {
      blockComment = true;
      index += 1;
    } else {
      output += character;
    }
  }
  return output;
}

function normalizedHclSource(relativePath) {
  return withoutHclComments(normalizedSource(relativePath));
}

function extractBlockAt(source, start, label) {
  const openingBrace = source.indexOf('{', start);
  assert.notEqual(openingBrace, -1, `Missing opening brace for ${label}.`);

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = openingBrace; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === '{') depth += 1;
    if (character === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(openingBrace + 1, index);
    }
  }
  assert.fail(`Unterminated block for ${label}.`);
}

function extractBlock(source, headerPattern, label) {
  const governedSource = withoutHclComments(source);
  const pattern = new RegExp(headerPattern.source, headerPattern.flags);
  const match = pattern.exec(governedSource);
  assert.ok(match, `Missing ${label}.`);
  return extractBlockAt(governedSource, match.index, label);
}

function extractBlocks(source, headerPattern, label) {
  const governedSource = withoutHclComments(source);
  const flags = headerPattern.flags.includes('g')
    ? headerPattern.flags
    : `${headerPattern.flags}g`;
  const pattern = new RegExp(headerPattern.source, flags);
  return [...governedSource.matchAll(pattern)].map((match, index) =>
    extractBlockAt(governedSource, match.index, `${label} ${index + 1}`),
  );
}

function assignmentExpression(block, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const match = new RegExp(
    `^\\s*${escapedName}\\s*=\\s*([^\\r\\n]+?)\\s*$`,
    'mu',
  ).exec(withoutHclComments(block));
  assert.ok(match, `Missing assignment for ${name}.`);
  return match[1];
}

function blockAssignmentExpressions(block) {
  return Object.fromEntries(
    [
      ...withoutHclComments(block).matchAll(
        /^\s*([A-Za-z][A-Za-z0-9_]*)\s*=\s*([^\r\n]+?)\s*$/gmu,
      ),
    ].map((match) => [match[1], match[2]]),
  );
}

function variableNames(source) {
  return [...source.matchAll(/^variable\s+"([^"]+)"\s*\{/gmu)].map(
    (match) => match[1],
  );
}

function outputNames(source) {
  return [...source.matchAll(/^output\s+"([^"]+)"\s*\{/gmu)].map(
    (match) => match[1],
  );
}

function validationPatterns(variableBlock) {
  return [...variableBlock.matchAll(/regex\(\s*"([^"]+)"/gu)].map(
    (match) => match[1],
  );
}

function variableBlock(source, name) {
  return extractBlock(
    source,
    new RegExp(`^variable\\s+"${name}"\\s*\\{`, 'mu'),
    `${name} variable`,
  );
}

function assertRequiredVariable(source, name, type) {
  const block = variableBlock(source, name);
  assert.equal(assignmentExpression(block, 'type'), type);
  assert.doesNotMatch(block, /^\s*default\s*=/mu);
  return block;
}

function environmentContractBlock(main, environment) {
  return extractBlock(
    main,
    new RegExp(`^\\s{4}${environment}\\s*=\\s*\\{`, 'mu'),
    `${environment} approved environment`,
  );
}

function assertContract(block, expected) {
  for (const [name, value] of Object.entries(expected)) {
    assert.equal(assignmentExpression(block, name), JSON.stringify(value), name);
  }
}

function secretMap(environmentBlock, mapName) {
  const map = extractBlock(
    environmentBlock,
    new RegExp(`^\\s*${mapName}\\s*=\\s*\\{`, 'mu'),
    mapName,
  );
  const names = [
    ...map.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*\{/gmu),
  ].map((match) => match[1]);
  return Object.fromEntries(
    names.map((name) => {
      const block = extractBlock(
        map,
        new RegExp(`^\\s*${name}\\s*=\\s*\\{`, 'mu'),
        `${mapName}.${name}`,
      );
      return [
        name,
        {
          secret: JSON.parse(assignmentExpression(block, 'secret')),
          version: JSON.parse(assignmentExpression(block, 'version')),
        },
      ];
    }),
  );
}

function resourceBlock(main, type, name) {
  return extractBlock(
    main,
    new RegExp(`^resource\\s+"${type}"\\s+"${name}"\\s*\\{`, 'mu'),
    `${type}.${name}`,
  );
}

function resourceContainer(resource, label) {
  const template = extractBlock(resource, /^\s*template\s*\{/mu, `${label} template`);
  return extractBlock(
    template,
    /^\s*containers\s*\{/mu,
    `${label} container`,
  );
}

function fixedEnvironmentNames(container) {
  return extractBlocks(container, /^\s*env\s*\{/gmu, 'fixed env')
    .map((block) => assignmentExpression(block, 'name'))
    .filter((value) => value.startsWith('"'))
    .map((value) => JSON.parse(value));
}

function candidateFilesFromCommittedRange() {
  const base = process.env.CI_BASE_SHA || BASE_SHA;
  const candidate = process.env.CI_CANDIDATE_SHA || 'HEAD';
  return [
    ...new Set(
      execFileSync('git', ['diff', '--name-only', base, candidate, '--'], {
        cwd: REPOSITORY_ROOT,
        encoding: 'utf8',
        windowsHide: true,
      })
        .split(/\r?\n/u)
        .filter(Boolean)
        .map((file) => file.replace(/\\/gu, '/')),
    ),
  ].sort();
}

function candidateFilesFromMaintenanceRange() {
  const candidate = process.env.CI_CANDIDATE_SHA || 'HEAD';
  const workingTreeFiles = execFileSync(
    'git',
    ['diff', '--name-only', candidate, '--'],
    {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
      windowsHide: true,
    },
  )
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((file) => file.replace(/\\/gu, '/'));
  if (workingTreeFiles.length > 0) {
    return [...new Set(workingTreeFiles)].sort();
  }
  return [
    ...new Set(
      execFileSync(
        'git',
        ['diff', '--name-only', `${candidate}^`, candidate, '--'],
        {
          cwd: REPOSITORY_ROOT,
          encoding: 'utf8',
          windowsHide: true,
        },
      )
        .split(/\r?\n/u)
        .filter(Boolean)
        .map((file) => file.replace(/\\/gu, '/')),
    ),
  ].sort();
}

function assertStage29CandidateScope(candidateFiles) {
  const normalized = [
    ...new Set(candidateFiles.map((file) => file.replace(/\\/gu, '/'))),
  ].sort();
  const active =
    normalized.includes(TEST_PATH) ||
    normalized.some((file) => file.startsWith(`${PRODUCTION_ROOT}/`));
  if (!active) return false;
  const unauthorized = normalized.filter(
    (file) => !AUTHORIZED_STAGE29A_PATHS.includes(file),
  );
  assert.deepEqual(unauthorized, []);
  return true;
}

function isStage29OperationalPath(file) {
  return (
    file.startsWith(`${MODULE_ROOT}/`) ||
    file.startsWith(`${STAGING_ROOT}/`) ||
    file.startsWith(`${PRODUCTION_ROOT}/`) ||
    file.startsWith(`${PRODUCTION_MIGRATION_ROOT}/`) ||
    file === README_PATH ||
    file === PLAN_CI_PATH ||
    file === PLAN_CI_TEST_PATH ||
    file === HISTORICAL_RUNTIME_POLICY_TEST_PATH
  );
}

function assertCommittedStage29CandidateScope(
  candidateFiles,
  maintenanceFiles,
) {
  const committedCandidates = candidateFiles ?? candidateFilesFromCommittedRange();
  const normalized = [
    ...new Set(committedCandidates.map((file) => file.replace(/\\/gu, '/'))),
  ].sort();
  const normalizedMaintenance = [
    ...new Set(
      (maintenanceFiles ??
        (candidateFiles === undefined
          ? candidateFilesFromMaintenanceRange()
          : committedCandidates)
      ).map((file) => file.replace(/\\/gu, '/')),
    ),
  ].sort();
  const maintenanceScopeActive =
    candidateFiles === undefined || maintenanceFiles !== undefined;
  const verifierRetouched =
    maintenanceScopeActive &&
    normalizedMaintenance.some(
      (file) => file === TEST_PATH || file === STAGE_28_TEST_PATH,
    );
  if (verifierRetouched) {
    const stage29MaintenancePaths = normalizedMaintenance.filter(
      (file) =>
        isStage29OperationalPath(file) ||
        file === TEST_PATH ||
        file === STAGE_28_TEST_PATH,
    );
    assert.deepEqual(
      stage29MaintenancePaths,
      [STAGE_28_TEST_PATH, TEST_PATH].sort(),
    );
  }

  const historicalVerifierPairPresent =
    normalized.includes(TEST_PATH) && normalized.includes(STAGE_28_TEST_PATH);
  if (historicalVerifierPairPresent) {
    const stage29OwnedPaths = normalized.filter(
      (file) =>
        isStage29OperationalPath(file) ||
        file === TEST_PATH ||
        file === STAGE_28_TEST_PATH,
    );
    assert.deepEqual(stage29OwnedPaths, [STAGE_28_TEST_PATH, TEST_PATH].sort());
    return false;
  }

  const pt2DelegationActive =
    normalized.includes(TEST_PATH) && normalized.includes(PT2_TEST_PATH);
  if (pt2DelegationActive) {
    const stage29OwnedPaths = normalized.filter(
      (file) =>
        file.startsWith('infra/gcp/backend-runtime/') ||
        file === PLAN_CI_PATH ||
        file === PLAN_CI_TEST_PATH ||
        file === TEST_PATH ||
        file === PT2_TEST_PATH,
    );
    assert.deepEqual(
      stage29OwnedPaths.filter(
        (file) => !PT2_STAGE29_DELEGATED_PATHS.includes(file),
      ),
      [],
    );
    return false;
  }

  const stage29ProductionSourceActive = normalized.some((file) =>
    file.startsWith(`${PRODUCTION_ROOT}/`),
  );
  const stage30HistoricalRemediationActive =
    !stage29ProductionSourceActive &&
    normalized.includes(TEST_PATH) &&
    normalized.includes(STAGE_30C1_TEST_PATH);
  return assertStage29CandidateScope(
    stage30HistoricalRemediationActive
      ? normalized.filter((file) => file !== TEST_PATH)
      : normalized,
  );
}

test('Production runtime root has exactly the six governed source files', () => {
  assert.equal(fs.existsSync(repositoryPath(PRODUCTION_ROOT)), true);
  const files = fs
    .readdirSync(repositoryPath(PRODUCTION_ROOT), { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(files, ROOT_FILES);
});

test('Production backend, provider, versions, and lock selection are exact', () => {
  const versions = normalizedHclSource(`${PRODUCTION_ROOT}/versions.tf`);
  const providers = normalizedHclSource(`${PRODUCTION_ROOT}/providers.tf`);
  const provider = extractBlock(
    providers,
    /^provider\s+"google"\s*\{/mu,
    'Production google provider',
  );
  assert.deepEqual(blockAssignmentExpressions(provider), {
    project: '"moazez-production"',
    region: '"me-central2"',
  });
  assert.match(versions, /required_version\s*=\s*">= 1[.]6[.]0, < 2[.]0[.]0"/u);
  assert.match(versions, /bucket\s*=\s*"moazez-production-91001421934-tfstate"/u);
  assert.match(versions, /prefix\s*=\s*"backend-runtime\/production\/runtime"/u);
  assert.match(versions, /source\s*=\s*"hashicorp\/google"/u);
  assert.match(versions, /version\s*=\s*">= 7[.]40[.]0, < 8[.]0[.]0"/u);

  const productionLock = normalizedSource(`${PRODUCTION_ROOT}/.terraform.lock.hcl`);
  const stagingLock = normalizedSource(`${STAGING_ROOT}/.terraform.lock.hcl`);
  assert.equal(productionLock, stagingLock);
  assert.match(productionLock, /version\s*=\s*"7[.]44[.]0"/u);
});

test('Production root contains one shared-module caller and no direct resource or data blocks', () => {
  const main = normalizedHclSource(`${PRODUCTION_ROOT}/main.tf`);
  assert.equal((main.match(/^module\s+"/gmu) ?? []).length, 1);
  assert.equal((main.match(/^resource\s+"/gmu) ?? []).length, 0);
  assert.equal((main.match(/^data\s+"/gmu) ?? []).length, 0);
  const module = extractBlock(
    main,
    /^module\s+"runtime_environment"\s*\{/mu,
    'Production runtime module',
  );
  assert.deepEqual(blockAssignmentExpressions(module), {
    source: '"../../../modules/runtime-environment"',
    environment: '"production"',
    fcm_delivery_mode: 'var.fcm_delivery_mode',
    image_reference: 'var.image_reference',
    queue_redis_host: 'var.queue_redis_host',
    queue_redis_port: 'var.queue_redis_port',
    queue_redis_ca_pem: 'var.queue_redis_ca_pem',
    realtime_redis_host: 'var.realtime_redis_host',
    realtime_redis_port: 'var.realtime_redis_port',
    realtime_redis_ca_pem: 'var.realtime_redis_ca_pem',
    api_url: 'var.api_url',
    settings_email_secret_encryption_active_key_id:
      'var.settings_email_secret_encryption_active_key_id',
    app_device_token_encryption_active_key_id:
      'var.app_device_token_encryption_active_key_id',
  });
  assert.doesNotMatch(main, /https:\/\//u);
});

test('Production root requires exactly eleven release and runtime variables with no defaults', () => {
  const variables = normalizedHclSource(`${PRODUCTION_ROOT}/variables.tf`);
  assert.deepEqual(variableNames(variables), ROOT_VARIABLES);
  for (const name of ROOT_VARIABLES) {
    assertRequiredVariable(
      variables,
      name,
      name.endsWith('_port') ? 'number' : 'string',
    );
  }
  for (const name of ['queue_redis_ca_pem', 'realtime_redis_ca_pem']) {
    assert.equal(assignmentExpression(variableBlock(variables, name), 'sensitive'), 'true');
  }
});

test('Production FCM delivery mode is required and accepts exactly the governed selector values', () => {
  const variables = normalizedHclSource(`${PRODUCTION_ROOT}/variables.tf`);
  const deliveryMode = assertRequiredVariable(
    variables,
    'fcm_delivery_mode',
    'string',
  );
  assert.match(
    deliveryMode.replace(/\s+/gu, ''),
    /condition=contains\(\["disabled","dry_run","send_enabled"\],var[.]fcm_delivery_mode\)/u,
  );
  assert.doesNotMatch(deliveryMode, /^\s*default\s*=/mu);
  for (const rejected of ['', 'enabled', 'send', 'DRY_RUN', 'production']) {
    assert.equal(FCM_DELIVERY_MODES.includes(rejected), false);
  }
});

test('Production immutable image validation accepts only its exact digest package', () => {
  const variables = normalizedHclSource(`${PRODUCTION_ROOT}/variables.tf`);
  const image = assertRequiredVariable(variables, 'image_reference', 'string');
  assert.deepEqual(validationPatterns(image), [PRODUCTION_IMAGE_PATTERN]);
  const policy = new RegExp(PRODUCTION_IMAGE_PATTERN, 'u');
  const approved = `me-central2-docker.pkg.dev/moazez-production/moazez-production-containers/moazez-backend@sha256:${'a'.repeat(64)}`;
  const staging = `me-central2-docker.pkg.dev/moazez-nonprod-91001421934/moazez-staging-containers/moazez-backend@sha256:${'b'.repeat(64)}`;
  assert.equal(policy.test(approved), true);
  for (const rejected of [
    'me-central2-docker.pkg.dev/moazez-production/moazez-production-containers/moazez-backend:latest',
    'me-central2-docker.pkg.dev/moazez-production/moazez-production-containers/moazez-backend:main',
    staging,
    `${approved.slice(0, -64)}${'A'.repeat(64)}`,
    `${approved}extra`,
  ]) {
    assert.equal(policy.test(rejected), false, rejected);
  }
});

test('Production API URL is required and accepts only a canonical HTTPS origin', () => {
  const variables = normalizedHclSource(`${PRODUCTION_ROOT}/variables.tf`);
  const apiUrl = assertRequiredVariable(variables, 'api_url', 'string');
  assert.deepEqual(validationPatterns(apiUrl), [API_URL_PATTERN]);
  const policy = new RegExp(API_URL_PATTERN, 'u');
  for (const accepted of [
    'https://example.com',
    'https://api.example.com/',
    'https://api.example.com:8443',
  ]) {
    assert.equal(policy.test(accepted), true, accepted);
  }
  for (const rejected of [
    'http://api.example.com',
    'https://user:password@api.example.com',
    'https://api.example.com/application',
    'https://api.example.com?query=1',
    'https://api.example.com/#fragment',
    'https://api.example.com:65536',
  ]) {
    assert.equal(policy.test(rejected), false, rejected);
  }
  assert.equal(normalizedSource(`${PRODUCTION_ROOT}/main.tf`).includes('api.moazez.cloud'), false);
});

test('Production encryption key IDs are required and use the exact governed regex', () => {
  const variables = normalizedHclSource(`${PRODUCTION_ROOT}/variables.tf`);
  for (const name of [
    'settings_email_secret_encryption_active_key_id',
    'app_device_token_encryption_active_key_id',
  ]) {
    const block = assertRequiredVariable(variables, name, 'string');
    assert.deepEqual(validationPatterns(block), [KEY_ID_PATTERN]);
  }
  const policy = new RegExp(KEY_ID_PATTERN, 'u');
  for (const accepted of ['a', 'A1._-', 'production-key.2026']) {
    assert.equal(policy.test(accepted), true, accepted);
  }
  for (const rejected of ['', '-leading', '_leading', 'a'.repeat(65), 'a/b']) {
    assert.equal(policy.test(rejected), false, rejected);
  }
});

test('Shared module exposes only the closed selector and approved dynamic inputs', () => {
  const variables = normalizedHclSource(`${MODULE_ROOT}/variables.tf`);
  assert.deepEqual(variableNames(variables), MODULE_VARIABLES);
  for (const name of MODULE_VARIABLES) {
    assert.doesNotMatch(variableBlock(variables, name), /^\s*default\s*=/mu);
  }
  const environment = assertRequiredVariable(variables, 'environment', 'string');
  assert.match(
    environment.replace(/\s+/gu, ''),
    /condition=contains\(\["staging","production"\],var[.]environment\)/u,
  );
  for (const candidate of ['development', 'qa', 'prod', '', 'STAGING']) {
    assert.equal(['staging', 'production'].includes(candidate), false);
  }
  const deliveryMode = assertRequiredVariable(
    variables,
    'fcm_delivery_mode',
    'string',
  );
  assert.match(
    deliveryMode.replace(/\s+/gu, ''),
    /condition=contains\(\["disabled","dry_run","send_enabled"\],var[.]fcm_delivery_mode\)/u,
  );
  assert.deepEqual(validationPatterns(variableBlock(variables, 'image_reference')), [
    STAGING_IMAGE_PATTERN,
    PRODUCTION_IMAGE_PATTERN,
  ]);
});

test('Closed environment map contains the exact governed Production infrastructure contract', () => {
  const main = normalizedHclSource(`${MODULE_ROOT}/main.tf`);
  const production = environmentContractBlock(main, 'production');
  assertContract(production, PRODUCTION_CONTRACT);
  assert.equal(assignmentExpression(main, 'selected'), 'local.approved_environment[var.environment]');
});

test('Closed environment map preserves the exact governed Staging infrastructure contract', () => {
  const main = normalizedHclSource(`${MODULE_ROOT}/main.tf`);
  const staging = environmentContractBlock(main, 'staging');
  assertContract(staging, STAGING_CONTRACT);
});

test('FCM delivery selector derives the exact disabled, dry-run, and send-enabled matrix', () => {
  const main = normalizedHclSource(`${MODULE_ROOT}/main.tf`);
  const contracts = extractBlock(
    main,
    /^\s*fcm_delivery_contracts\s*=\s*\{/mu,
    'FCM delivery contracts',
  );
  assert.deepEqual(
    blockAssignmentExpressions(
      extractBlock(contracts, /^\s*disabled\s*=\s*\{/mu, 'disabled FCM mode'),
    ),
    { enabled: '"false"', dry_run: '"true"' },
  );
  assert.deepEqual(
    blockAssignmentExpressions(
      extractBlock(contracts, /^\s*dry_run\s*=\s*\{/mu, 'dry-run FCM mode'),
    ),
    { enabled: '"true"', dry_run: '"true"' },
  );
  assert.deepEqual(
    blockAssignmentExpressions(
      extractBlock(
        contracts,
        /^\s*send_enabled\s*=\s*\{/mu,
        'send-enabled FCM mode',
      ),
    ),
    { enabled: '"true"', dry_run: '"false"' },
  );
  assert.equal(
    assignmentExpression(main, 'selected_fcm_delivery_contract'),
    'local.fcm_delivery_contracts[var.fcm_delivery_mode]',
  );
});

test('Production and Staging secret maps are exact and every version is numeric one', () => {
  const main = normalizedHclSource(`${MODULE_ROOT}/main.tf`);
  for (const [environment, expectedMaps] of [
    ['production', PRODUCTION_SECRETS],
    ['staging', STAGING_SECRETS],
  ]) {
    const environmentBlock = environmentContractBlock(main, environment);
    for (const [mapName, expected] of Object.entries(expectedMaps)) {
      const actual = secretMap(environmentBlock, mapName);
      assert.deepEqual(Object.keys(actual), Object.keys(expected));
      for (const [name, secret] of Object.entries(expected)) {
        assert.deepEqual(actual[name], { secret, version: '1' });
      }
    }
  }
  assert.doesNotMatch(main, /\blatest\b/iu);
  assert.doesNotMatch(main, /google_secret_manager_secret_version|secret_data|secret_payload/iu);
});

test('Shared module owns exactly one API service and three governed worker pools', () => {
  const main = normalizedHclSource(`${MODULE_ROOT}/main.tf`);
  const resources = [
    ...main.matchAll(/^resource\s+"([^"]+)"\s+"([^"]+)"\s*\{/gmu),
  ].map((match) => match.slice(1));
  assert.deepEqual(resources, [
    ['google_cloud_run_v2_service', 'api'],
    ['google_cloud_run_v2_worker_pool', 'core'],
    ['google_cloud_run_v2_worker_pool', 'media'],
    ['google_cloud_run_v2_worker_pool', 'maintenance_scheduler'],
  ]);
  assert.equal((main.match(/^data\s+"/gmu) ?? []).length, 0);
  assert.doesNotMatch(main, /google_cloud_run_v2_job|resource\s+"[^"]*migration/iu);
});

test('Every runtime resource binds the selected environment to its matching image package', () => {
  const main = normalizedHclSource(`${MODULE_ROOT}/main.tf`);
  assert.equal(
    assignmentExpression(main, 'image_matches_environment'),
    'can(regex(local.selected.image_pattern, var.image_reference))',
  );
  for (const [type, name] of [
    ['google_cloud_run_v2_service', 'api'],
    ['google_cloud_run_v2_worker_pool', 'core'],
    ['google_cloud_run_v2_worker_pool', 'media'],
    ['google_cloud_run_v2_worker_pool', 'maintenance_scheduler'],
  ]) {
    const resource = resourceBlock(main, type, name);
    const lifecycle = extractBlock(resource, /^\s*lifecycle\s*\{/mu, `${name} lifecycle`);
    assert.equal(assignmentExpression(lifecycle, 'prevent_destroy'), 'true');
    const precondition = extractBlock(
      lifecycle,
      /^\s*precondition\s*\{/mu,
      `${name} image precondition`,
    );
    assert.equal(assignmentExpression(precondition, 'condition'), 'local.image_matches_environment');
  }
  const stagingPolicy = new RegExp(STAGING_IMAGE_PATTERN, 'u');
  const productionPolicy = new RegExp(PRODUCTION_IMAGE_PATTERN, 'u');
  const stagingImage = `me-central2-docker.pkg.dev/moazez-nonprod-91001421934/moazez-staging-containers/moazez-backend@sha256:${'a'.repeat(64)}`;
  const productionImage = `me-central2-docker.pkg.dev/moazez-production/moazez-production-containers/moazez-backend@sha256:${'b'.repeat(64)}`;
  assert.equal(stagingPolicy.test(stagingImage), true);
  assert.equal(stagingPolicy.test(productionImage), false);
  assert.equal(productionPolicy.test(productionImage), true);
  assert.equal(productionPolicy.test(stagingImage), false);
});

test('Redis endpoints remain separate host-port inputs and Terraform constructs both rediss URLs', () => {
  const main = normalizedHclSource(`${MODULE_ROOT}/main.tf`);
  assert.equal(
    assignmentExpression(main, 'queue_redis_url'),
    'format("rediss://%s:%d", var.queue_redis_host, var.queue_redis_port)',
  );
  assert.equal(
    assignmentExpression(main, 'realtime_redis_url'),
    'format("rediss://%s:%d", var.realtime_redis_host, var.realtime_redis_port)',
  );
  const rootVariables = normalizedHclSource(`${PRODUCTION_ROOT}/variables.tf`);
  assert.equal(variableNames(rootVariables).includes('queue_redis_url'), false);
  assert.equal(variableNames(rootVariables).includes('realtime_redis_url'), false);
  const terraform = GOVERNED_TERRAFORM_PATHS.map(normalizedHclSource).join('\n');
  assert.doesNotMatch(terraform, /\b(?:[0-9]{1,3}[.]){3}[0-9]{1,3}\b/u);
  assert.doesNotMatch(terraform, /-----BEGIN (?:CERTIFICATE|PUBLIC KEY)-----/u);
});

test('API and Core receive Queue plus Realtime Redis while Media and Maintenance receive Queue only', () => {
  const main = normalizedHclSource(`${MODULE_ROOT}/main.tf`);
  const environments = {
    api: extractBlock(main, /^\s*api_environment\s*=\s*merge\([^\{]+\{/mu, 'API environment'),
    core: extractBlock(main, /^\s*core_worker_environment\s*=\s*merge\([^\{]+\{/mu, 'Core environment'),
    media: extractBlock(main, /^\s*media_worker_environment\s*=\s*merge\([^\{]+\{/mu, 'Media environment'),
    maintenance: extractBlock(main, /^\s*maintenance_scheduler_environment\s*=\s*merge\([^\{]+\{/mu, 'Maintenance environment'),
  };
  for (const name of ['api', 'core']) {
    assert.equal(assignmentExpression(environments[name], 'QUEUE_REDIS_URL'), 'local.queue_redis_url');
    assert.equal(assignmentExpression(environments[name], 'REALTIME_REDIS_URL'), 'local.realtime_redis_url');
  }
  for (const name of ['media', 'maintenance']) {
    assert.equal(assignmentExpression(environments[name], 'QUEUE_REDIS_URL'), 'local.queue_redis_url');
    assert.doesNotMatch(environments[name], /REALTIME_REDIS/u);
  }

  const resources = {
    api: resourceBlock(main, 'google_cloud_run_v2_service', 'api'),
    core: resourceBlock(main, 'google_cloud_run_v2_worker_pool', 'core'),
    media: resourceBlock(main, 'google_cloud_run_v2_worker_pool', 'media'),
    maintenance: resourceBlock(main, 'google_cloud_run_v2_worker_pool', 'maintenance_scheduler'),
  };
  assert.deepEqual(fixedEnvironmentNames(resourceContainer(resources.api, 'api')), [
    'QUEUE_REDIS_TLS_CA_PEM',
    'REALTIME_REDIS_TLS_CA_PEM',
  ]);
  assert.deepEqual(fixedEnvironmentNames(resourceContainer(resources.core, 'core')), [
    'QUEUE_REDIS_TLS_CA_PEM',
    'REALTIME_REDIS_TLS_CA_PEM',
  ]);
  assert.deepEqual(fixedEnvironmentNames(resourceContainer(resources.media, 'media')), [
    'QUEUE_REDIS_TLS_CA_PEM',
  ]);
  assert.deepEqual(fixedEnvironmentNames(resourceContainer(resources.maintenance, 'maintenance')), [
    'QUEUE_REDIS_TLS_CA_PEM',
  ]);
});

test('Common and role-specific application environment contracts remain exact', () => {
  const main = normalizedHclSource(`${MODULE_ROOT}/main.tf`);
  const common = extractBlock(main, /^\s*common_environment\s*=\s*\{/mu, 'common environment');
  assert.deepEqual(blockAssignmentExpressions(common), {
    NODE_ENV: 'local.selected.node_environment',
    APP_SHUTDOWN_TIMEOUT_MS: '"15000"',
    LOG_LEVEL: '"info"',
  });

  const api = extractBlock(main, /^\s*api_environment\s*=\s*merge\([^\{]+\{/mu, 'API environment');
  assert.deepEqual(blockAssignmentExpressions(api), {
    APP_PORT: '"3000"',
    APP_PROBE_PORT: '"9090"',
    APP_URL: 'var.api_url',
    APP_TRUSTED_PROXY_MODE: 'local.selected.trusted_proxy_mode',
    APP_CORS_ORIGINS: 'local.selected.cors_origins',
    STORAGE_CORS_ORIGINS: 'local.selected.cors_origins',
    SWAGGER_ENABLED: '"false"',
    SEED_DEMO_DATA: '"false"',
    DATABASE_RUNTIME_ROLE: '"api"',
    DATABASE_CONNECTION_LIMIT: '"5"',
    DATABASE_POOL_TIMEOUT_SECONDS: '"5"',
    DATABASE_CONNECT_TIMEOUT_SECONDS: '"5"',
    JWT_ACCESS_TTL: '"15m"',
    JWT_REFRESH_TTL: '"7d"',
    SETTINGS_EMAIL_SECRET_ENCRYPTION_ACTIVE_KEY_ID:
      'var.settings_email_secret_encryption_active_key_id',
    APP_DEVICE_TOKEN_ENCRYPTION_ACTIVE_KEY_ID:
      'var.app_device_token_encryption_active_key_id',
    QUEUE_REDIS_URL: 'local.queue_redis_url',
    REALTIME_REDIS_URL: 'local.realtime_redis_url',
    STORAGE_PROVIDER: '"gcs"',
    GCP_PROJECT_ID: 'local.selected.project_id',
    STORAGE_BUCKET: 'local.selected.storage_private_bucket',
    STORAGE_PUBLIC_BUCKET: 'local.selected.storage_published_bucket',
    GCS_SIGNING_SERVICE_ACCOUNT: 'local.selected.gcs_signing_service_account',
  });

  const core = extractBlock(main, /^\s*core_worker_environment\s*=\s*merge\([^\{]+\{/mu, 'Core environment');
  const media = extractBlock(main, /^\s*media_worker_environment\s*=\s*merge\([^\{]+\{/mu, 'Media environment');
  const maintenance = extractBlock(main, /^\s*maintenance_scheduler_environment\s*=\s*merge\([^\{]+\{/mu, 'Maintenance environment');
  assert.deepEqual(blockAssignmentExpressions(core), {
    APP_PROBE_PORT: '"9090"',
    APP_URL: 'var.api_url',
    DATABASE_RUNTIME_ROLE: '"core-worker"',
    DATABASE_CONNECTION_LIMIT: '"6"',
    DATABASE_POOL_TIMEOUT_SECONDS: '"10"',
    DATABASE_CONNECT_TIMEOUT_SECONDS: '"5"',
    SETTINGS_EMAIL_SECRET_ENCRYPTION_ACTIVE_KEY_ID:
      'var.settings_email_secret_encryption_active_key_id',
    APP_DEVICE_TOKEN_ENCRYPTION_ACTIVE_KEY_ID:
      'var.app_device_token_encryption_active_key_id',
    FIREBASE_CREDENTIAL_MODE: '"application_default"',
    FCM_ENABLED: 'local.selected_fcm_delivery_contract.enabled',
    FCM_DRY_RUN: 'local.selected_fcm_delivery_contract.dry_run',
    QUEUE_REDIS_URL: 'local.queue_redis_url',
    REALTIME_REDIS_URL: 'local.realtime_redis_url',
    STORAGE_PROVIDER: '"gcs"',
    GCP_PROJECT_ID: 'local.selected.project_id',
    STORAGE_BUCKET: 'local.selected.storage_private_bucket',
    STORAGE_PUBLIC_BUCKET: 'local.selected.storage_published_bucket',
  });
  assert.deepEqual(blockAssignmentExpressions(media), {
    APP_PROBE_PORT: '"9090"',
    DATABASE_RUNTIME_ROLE: '"media-worker"',
    DATABASE_CONNECTION_LIMIT: '"3"',
    DATABASE_POOL_TIMEOUT_SECONDS: '"10"',
    DATABASE_CONNECT_TIMEOUT_SECONDS: '"5"',
    QUEUE_REDIS_URL: 'local.queue_redis_url',
    STORAGE_PROVIDER: '"gcs"',
    GCP_PROJECT_ID: 'local.selected.project_id',
    STORAGE_BUCKET: 'local.selected.storage_private_bucket',
    STORAGE_PUBLIC_BUCKET: 'local.selected.storage_published_bucket',
  });
  assert.deepEqual(blockAssignmentExpressions(maintenance), {
    APP_PROBE_PORT: '"9090"',
    QUEUE_REDIS_URL: 'local.queue_redis_url',
  });
  for (const [name, environment] of [
    ['api', api],
    ['media', media],
    ['maintenance', maintenance],
  ]) {
    assert.doesNotMatch(environment, /\b(?:FIREBASE_|FCM_)/u, name);
  }
  assert.equal((main.match(/GCS_SIGNING_SERVICE_ACCOUNT\s*=/gu) ?? []).length, 1);
});

test('Cloud Run commands, scaling, probes, Direct VPC, and deletion protection remain governed', () => {
  const main = normalizedHclSource(`${MODULE_ROOT}/main.tf`);
  const api = resourceBlock(main, 'google_cloud_run_v2_service', 'api');
  assert.equal(assignmentExpression(api, 'project'), 'local.selected.project_id');
  assert.equal(assignmentExpression(api, 'location'), 'local.selected.region');
  assert.equal(assignmentExpression(api, 'name'), 'local.selected.api_service_name');
  assert.equal(assignmentExpression(api, 'deletion_protection'), 'true');
  const apiScaling = extractBlock(api, /^\s*scaling\s*\{/mu, 'API scaling');
  assert.deepEqual(blockAssignmentExpressions(apiScaling), {
    min_instance_count: '1',
    max_instance_count: '4',
  });
  const apiTemplate = extractBlock(api, /^\s*template\s*\{/mu, 'API template');
  assert.equal(assignmentExpression(apiTemplate, 'max_instance_request_concurrency'), '40');
  const apiContainer = resourceContainer(api, 'api');
  assert.equal(assignmentExpression(extractBlock(apiContainer, /^\s*ports\s*\{/mu, 'API port'), 'container_port'), '3000');
  for (const [kind, expectedPath] of [
    ['startup_probe', '/internal/probes/api/startup'],
    ['liveness_probe', '/internal/probes/api/liveness'],
    ['readiness_probe', '/internal/probes/api/readiness'],
  ]) {
    const probe = extractBlock(apiContainer, new RegExp(`^\\s*${kind}\\s*\\{`, 'mu'), kind);
    const httpGet = extractBlock(probe, /^\s*http_get\s*\{/mu, `${kind} http_get`);
    assert.equal(assignmentExpression(httpGet, 'path'), JSON.stringify(expectedPath));
    assert.equal(assignmentExpression(httpGet, 'port'), '9090');
  }

  for (const [name, command, probeRole] of [
    ['core', '["node", "dist/core-worker"]', 'core-worker'],
    ['media', '["node", "dist/media-worker"]', 'media-worker'],
    ['maintenance_scheduler', '["node", "dist/maintenance-scheduler"]', 'maintenance-scheduler'],
  ]) {
    const resource = resourceBlock(main, 'google_cloud_run_v2_worker_pool', name);
    assert.equal(assignmentExpression(resource, 'deletion_protection'), 'true');
    const scaling = extractBlock(resource, /^\s*scaling\s*\{/mu, `${name} scaling`);
    assert.deepEqual(blockAssignmentExpressions(scaling), {
      scaling_mode: '"MANUAL"',
      manual_instance_count: '1',
    });
    const container = resourceContainer(resource, name);
    assert.equal(assignmentExpression(container, 'command'), command);
    for (const kind of ['startup', 'liveness']) {
      const probe = extractBlock(container, new RegExp(`^\\s*${kind}_probe\\s*\\{`, 'mu'), `${name} ${kind}`);
      const httpGet = extractBlock(probe, /^\s*http_get\s*\{/mu, `${name} ${kind} http_get`);
      assert.equal(assignmentExpression(httpGet, 'path'), JSON.stringify(`/internal/probes/${probeRole}/${kind}`));
      assert.equal(assignmentExpression(httpGet, 'port'), '9090');
    }
  }

  assert.equal((main.match(/egress\s*=\s*"PRIVATE_RANGES_ONLY"/gu) ?? []).length, 4);
  assert.equal((main.match(/network\s*=\s*local[.]selected[.]network/gu) ?? []).length, 4);
  assert.equal((main.match(/subnetwork\s*=\s*local[.]selected[.]subnetwork/gu) ?? []).length, 4);
});

test('Production API remains Dark and no Stage 30 edge or public IAM resource exists', () => {
  const terraform = GOVERNED_TERRAFORM_PATHS.map(normalizedHclSource).join('\n');
  const main = normalizedHclSource(`${MODULE_ROOT}/main.tf`);
  const api = resourceBlock(main, 'google_cloud_run_v2_service', 'api');
  assert.equal(assignmentExpression(api, 'ingress'), '"INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"');
  assert.equal(assignmentExpression(api, 'default_uri_disabled'), 'true');
  assert.equal(assignmentExpression(api, 'invoker_iam_disabled'), 'true');
  assert.equal(assignmentExpression(environmentContractBlock(main, 'production'), 'trusted_proxy_mode'), '"none"');
  assert.equal(assignmentExpression(environmentContractBlock(main, 'staging'), 'trusted_proxy_mode'), '"gcp_external_alb"');
  assert.doesNotMatch(terraform, /allUsers|google_cloud_run_v2_service_iam_/u);
  assert.doesNotMatch(
    terraform,
    /google_(?:compute_(?:backend_service|url_map|target_https_proxy|global_forwarding_rule|security_policy|managed_ssl_certificate)|dns_|certificate_manager_)/u,
  );
});

test('Production outputs expose only non-sensitive runtime identities and the image reference', () => {
  const outputs = normalizedHclSource(`${PRODUCTION_ROOT}/outputs.tf`);
  const expected = {
    api_service_name: 'module.runtime_environment.api_service_name',
    api_service_uri: 'module.runtime_environment.api_service_uri',
    core_worker_pool_name: 'module.runtime_environment.core_worker_pool_name',
    media_worker_pool_name: 'module.runtime_environment.media_worker_pool_name',
    maintenance_scheduler_pool_name:
      'module.runtime_environment.maintenance_scheduler_pool_name',
    image_reference: 'module.runtime_environment.image_reference',
  };
  assert.deepEqual(outputNames(outputs), Object.keys(expected));
  for (const [name, value] of Object.entries(expected)) {
    assert.equal(assignmentExpression(variableOrOutputBlock(outputs, 'output', name), 'value'), value);
  }
  assert.doesNotMatch(outputs, /redis|ca_pem|secret|api_url|encryption_active_key/iu);
  const moduleOutputs = normalizedHclSource(`${MODULE_ROOT}/outputs.tf`);
  assert.doesNotMatch(moduleOutputs, /\bstaging\b|\bproduction\b/iu);
});

function variableOrOutputBlock(source, kind, name) {
  return extractBlock(
    source,
    new RegExp(`^${kind}\\s+"${name}"\\s*\\{`, 'mu'),
    `${kind} ${name}`,
  );
}

test('Staging caller preserves its existing effective non-secret and dynamic input contract', () => {
  const main = normalizedHclSource(`${STAGING_ROOT}/main.tf`);
  const module = extractBlock(main, /^module\s+"runtime_environment"\s*\{/mu, 'Staging runtime module');
  assert.deepEqual(blockAssignmentExpressions(module), {
    source: '"../../../modules/runtime-environment"',
    environment: '"staging"',
    fcm_delivery_mode: '"dry_run"',
    image_reference: 'var.image_reference',
    queue_redis_host: 'var.queue_redis_host',
    queue_redis_port: 'var.queue_redis_port',
    queue_redis_ca_pem: 'var.queue_redis_ca_pem',
    realtime_redis_host: 'var.realtime_redis_host',
    realtime_redis_port: 'var.realtime_redis_port',
    realtime_redis_ca_pem: 'var.realtime_redis_ca_pem',
    api_url: '"https://staging-api.moazez.cloud"',
    settings_email_secret_encryption_active_key_id:
      '"staging-email-20260815"',
    app_device_token_encryption_active_key_id: '"staging-device-20260815"',
  });
  for (const file of ROOT_FILES.filter((file) => file !== 'main.tf')) {
    assert.equal(
      normalizedSource(`${STAGING_ROOT}/${file}`),
      baseSource(`${STAGING_ROOT}/${file}`),
      `${file} changed from the governed Staging baseline`,
    );
  }
  const stagingVariables = normalizedHclSource(`${STAGING_ROOT}/variables.tf`);
  assert.deepEqual(validationPatterns(variableBlock(stagingVariables, 'image_reference')), [STAGING_IMAGE_PATTERN]);
});

test('Production migration root remains byte-for-byte unchanged', () => {
  const protectedFiles = execFileSync(
    'git',
    ['ls-tree', '-r', '--name-only', BASE_SHA, '--', PRODUCTION_MIGRATION_ROOT],
    { cwd: REPOSITORY_ROOT, encoding: 'utf8', windowsHide: true },
  )
    .split(/\r?\n/u)
    .filter(Boolean);
  assert.ok(protectedFiles.length > 0);
  for (const file of protectedFiles) {
    assert.equal(normalizedSource(file), baseSource(file), `${file} changed`);
  }
});

test('Terraform source contains no release digest, secret payload, live Redis address, or forbidden output', () => {
  const terraform = GOVERNED_TERRAFORM_PATHS.map(normalizedHclSource).join('\n');
  assert.equal(terraform.includes(STAGE_27_DIGEST), false);
  assert.doesNotMatch(terraform, /-----BEGIN (?:CERTIFICATE|PRIVATE KEY|PUBLIC KEY)-----/u);
  assert.doesNotMatch(terraform, /google_secret_manager_secret_version|secret_data|secret_payload/iu);
  assert.doesNotMatch(terraform, /postgres(?:ql)?:\/\//iu);
  assert.doesNotMatch(terraform, /\b(?:[0-9]{1,3}[.]){3}[0-9]{1,3}\b/u);
});

test('README documents both environments, independent state, DevOps inputs, and Dark Production', () => {
  const readme = normalizedSource(README_PATH);
  for (const required of [
    'environments/nonprod/runtime',
    'environments/production/runtime',
    'backend-runtime/staging/migration',
    'backend-runtime/staging/runtime',
    'backend-runtime/production/migration',
    'backend-runtime/production/runtime',
    'Development source preparation and local validation are not',
    'immutable image',
    'CA payloads',
    'api_url',
    'encryption key ID',
    'Production API remains Dark',
    'Stage 30',
  ]) {
    assert.ok(readme.includes(required), required);
  }
  assert.match(readme, /Production runtime state is intentionally independent from Production\s+migration state/u);
  assert.match(readme, /invoker_iam_disabled=true.*must\s+not be described as IAM-authenticated protection/su);
});

test('Stage 29A TAP has exactly one canonical pull-request ownership assignment', () => {
  assert.equal(Object.keys(ACTIVE_TAP_OWNERS).filter((file) => file === TEST_PATH).length, 1);
  assert.deepEqual(classifyTestFile(TEST_PATH), {
    file: TEST_PATH,
    kind: 'node-tap',
    owner: 'production-runtime-source-governance',
    category: 'invariant',
    profile: 'runtime-governance',
    execution: 'pull-request',
  });
});

test('Committed Stage 29A candidate scope contains only authorized paths when active', () => {
  assertCommittedStage29CandidateScope();
});

test('Committed scope preserves Stage 29 activation and bounded verifier, Stage 30C1, or PT-2 delegation', () => {
  assert.equal(assertCommittedStage29CandidateScope([TEST_PATH]), true);
  assert.throws(
    () =>
      assertCommittedStage29CandidateScope([
        TEST_PATH,
        'src/example-unrelated-change.ts',
      ]),
    { code: 'ERR_ASSERTION' },
  );
  assert.equal(
    assertCommittedStage29CandidateScope([
      STAGE_28_TEST_PATH,
      TEST_PATH,
      'src/example-future-change.ts',
    ]),
    false,
  );
  assert.throws(
    () =>
      assertCommittedStage29CandidateScope([
        STAGE_28_TEST_PATH,
        TEST_PATH,
        `${PRODUCTION_ROOT}/main.tf`,
      ]),
    { code: 'ERR_ASSERTION' },
  );
  assert.throws(
    () =>
      assertCommittedStage29CandidateScope([
        STAGE_28_TEST_PATH,
        TEST_PATH,
        `${PRODUCTION_MIGRATION_ROOT}/main.tf`,
      ]),
    { code: 'ERR_ASSERTION' },
  );
  assert.equal(
    assertCommittedStage29CandidateScope([TEST_PATH, STAGE_30C1_TEST_PATH]),
    false,
  );
  assert.equal(
    assertCommittedStage29CandidateScope(PT2_STAGE29_DELEGATED_PATHS),
    false,
  );
  assert.throws(
    () =>
      assertCommittedStage29CandidateScope([
        ...PT2_STAGE29_DELEGATED_PATHS,
        `${PRODUCTION_MIGRATION_ROOT}/main.tf`,
      ]),
    { code: 'ERR_ASSERTION' },
  );
  assert.throws(
    () =>
      assertStage29CandidateScope([
        `${PRODUCTION_ROOT}/main.tf`,
        PT2_TEST_PATH,
      ]),
    { code: 'ERR_ASSERTION' },
  );
  for (const candidate of [
    [`${PRODUCTION_ROOT}/main.tf`, STAGE_30C1_TEST_PATH],
    [`${PRODUCTION_ROOT}/main.tf`, 'src/example-unrelated-change.ts'],
    [`${PRODUCTION_ROOT}/main.tf`, `${PRODUCTION_MIGRATION_ROOT}/main.tf`],
  ]) {
    assert.throws(() => assertCommittedStage29CandidateScope(candidate), {
      code: 'ERR_ASSERTION',
    });
  }
  assert.equal(
    assertCommittedStage29CandidateScope(AUTHORIZED_STAGE29A_PATHS),
    true,
  );
  assert.equal(
    assertCommittedStage29CandidateScope(['src/example-future-change.ts']),
    false,
  );
});

test('Committed Stage 29 verifier delegation persists across later product commits and fails closed on re-touch', () => {
  const historicalFullRange = [
    STAGE_28_TEST_PATH,
    TEST_PATH,
    'prisma/schema.prisma',
    'src/infrastructure/database/school-scope.extension.ts',
    'src/modules/students/registration/application/create-student-bulk-registration.use-case.ts',
    'test/security/tenancy.student-bulk-registration.spec.ts',
  ];

  assert.equal(
    assertCommittedStage29CandidateScope(historicalFullRange, [
      'src/modules/students/registration/application/create-student-bulk-registration.use-case.ts',
      'test/security/tenancy.student-bulk-registration.spec.ts',
    ]),
    false,
  );
  assert.equal(
    assertCommittedStage29CandidateScope(
      [...historicalFullRange, 'src/modules/students/future-stage4.use-case.ts'],
      ['src/modules/students/future-stage4.use-case.ts'],
    ),
    false,
  );
  assert.throws(
    () =>
      assertCommittedStage29CandidateScope(
        [...historicalFullRange, `${PRODUCTION_ROOT}/main.tf`],
        ['src/modules/students/future-stage4.use-case.ts'],
      ),
    { code: 'ERR_ASSERTION' },
  );
  assert.throws(
    () =>
      assertCommittedStage29CandidateScope(
        [...historicalFullRange, `${PRODUCTION_MIGRATION_ROOT}/main.tf`],
        ['src/modules/students/future-stage4.use-case.ts'],
      ),
    { code: 'ERR_ASSERTION' },
  );
  assert.throws(
    () =>
      assertCommittedStage29CandidateScope(historicalFullRange, [
        STAGE_28_TEST_PATH,
      ]),
    { code: 'ERR_ASSERTION' },
  );
  assert.throws(
    () =>
      assertCommittedStage29CandidateScope(historicalFullRange, [TEST_PATH]),
    { code: 'ERR_ASSERTION' },
  );
  assert.equal(
    assertCommittedStage29CandidateScope(historicalFullRange, [
      STAGE_28_TEST_PATH,
      TEST_PATH,
    ]),
    false,
  );
  assert.throws(
    () =>
      assertCommittedStage29CandidateScope(
        [...historicalFullRange, `${PRODUCTION_ROOT}/main.tf`],
        [STAGE_28_TEST_PATH, TEST_PATH, `${PRODUCTION_ROOT}/main.tf`],
      ),
    { code: 'ERR_ASSERTION' },
  );
});

test('Candidate scope ignores unrelated PRs and rejects every mixed Stage 29A candidate', () => {
  assert.equal(assertStage29CandidateScope(['src/example-future-change.ts']), false);
  assert.equal(assertStage29CandidateScope([STAGE_30C1_TEST_PATH]), false);
  assert.equal(assertStage29CandidateScope([PT2_TEST_PATH]), false);
  assert.equal(
    assertCommittedStage29CandidateScope([TEST_PATH, STAGE_30C1_TEST_PATH]),
    false,
  );
  assert.equal(
    assertStage29CandidateScope([
      `${MODULE_ROOT}/main.tf`,
      `${STAGING_ROOT}/main.tf`,
      PLAN_CI_PATH,
    ]),
    false,
  );
  assert.equal(assertStage29CandidateScope([`${PRODUCTION_ROOT}/variables.tf`]), true);
  assert.equal(
    assertStage29CandidateScope([
      `${PRODUCTION_ROOT}/main.tf`,
      HISTORICAL_RUNTIME_POLICY_TEST_PATH,
    ]),
    true,
  );
  assert.equal(assertStage29CandidateScope(AUTHORIZED_STAGE29A_PATHS), true);
  for (const candidate of [
    [...AUTHORIZED_STAGE29A_PATHS, 'src/example-unrelated-change.ts'],
    [`${PRODUCTION_ROOT}/main.tf`, 'src/example-unrelated-change.ts'],
    [`${PRODUCTION_ROOT}/main.tf`, `${PRODUCTION_MIGRATION_ROOT}/main.tf`],
    [`${PRODUCTION_ROOT}/main.tf`, STAGE_28_TEST_PATH],
    [`${PRODUCTION_ROOT}/main.tf`, STAGE_30C1_TEST_PATH],
  ]) {
    assert.throws(() => assertStage29CandidateScope(candidate), {
      code: 'ERR_ASSERTION',
    });
  }
});
