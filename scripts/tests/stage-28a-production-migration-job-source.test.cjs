'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { execFileSync } = require('node:child_process');
const { classifyTestFile } = require('../ci/plan-ci.cjs');

const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..');
const BASE_SHA = 'e4cf40c47ec95ec4eb231f0ac60c2f15c869d1e6';
const MODULE_ROOT =
  'infra/gcp/backend-runtime/modules/migration-job-environment';
const STAGING_ROOT = 'infra/gcp/backend-runtime/environments/nonprod/migration';
const PRODUCTION_ROOT =
  'infra/gcp/backend-runtime/environments/production/migration';
const TEST_PATH =
  'scripts/tests/stage-28a-production-migration-job-source.test.cjs';
const STAGE_29_TEST_PATH =
  'scripts/tests/stage-29a-production-runtime-source.test.cjs';
const STAGE_30C1_TEST_PATH =
  'scripts/tests/stage-30c1-production-frontend-edge-source.test.cjs';
const PLAN_CI_PATH = 'scripts/ci/plan-ci.cjs';
const PLAN_CI_TEST_PATH = 'scripts/tests/plan-ci.test.cjs';
const DAY2_D1_DEPLOYMENT_CONTROL_ROOT = 'scripts/deployment-control';
const DAY2_D1_HANDOFF_PATH =
  'docs/governance/day2-release-orchestration-devops-handoff.md';

const ROOT_FILES = Object.freeze([
  '.terraform.lock.hcl',
  'main.tf',
  'outputs.tf',
  'providers.tf',
  'variables.tf',
  'versions.tf',
]);

const AUTHORIZED_CANDIDATE_PATHS = Object.freeze(
  [
    `${MODULE_ROOT}/main.tf`,
    `${MODULE_ROOT}/variables.tf`,
    `${MODULE_ROOT}/outputs.tf`,
    `${STAGING_ROOT}/main.tf`,
    `${PRODUCTION_ROOT}/.terraform.lock.hcl`,
    `${PRODUCTION_ROOT}/main.tf`,
    `${PRODUCTION_ROOT}/outputs.tf`,
    `${PRODUCTION_ROOT}/providers.tf`,
    `${PRODUCTION_ROOT}/variables.tf`,
    `${PRODUCTION_ROOT}/versions.tf`,
    TEST_PATH,
    PLAN_CI_PATH,
  ].sort(),
);

const STAGING_IMAGE_PATTERN =
  '^me-central2-docker[.]pkg[.]dev/moazez-nonprod-91001421934/moazez-staging-containers/moazez-backend@sha256:[a-f0-9]{64}$';
const PRODUCTION_IMAGE_PATTERN =
  '^me-central2-docker[.]pkg[.]dev/moazez-production/moazez-production-containers/moazez-backend@sha256:[a-f0-9]{64}$';
const SECRET_VERSION_PATTERN = '^[1-9][0-9]*$';
const STAGE_27_IMAGE_DIGEST =
  'aa1f4099f35cd5d4e6961e925f32aa52fb604e832f230d6c02d5051c8f6fdb41';

const STAGING_TUPLE = Object.freeze({
  project_id: 'moazez-nonprod-91001421934',
  region: 'me-central2',
  network: 'moazez-staging-vpc',
  subnetwork: 'moazez-staging-runtime-me-central2',
  migration_job_name: 'moazez-staging-migration',
  migration_service_account:
    'moazez-migration-job@moazez-nonprod-91001421934.iam.gserviceaccount.com',
  migration_job_environment: 'staging',
  migration_database_secret_id: 'moazez-staging-migration-database-url',
  migration_database_secret_version: '2',
  image_reference: `me-central2-docker.pkg.dev/moazez-nonprod-91001421934/moazez-staging-containers/moazez-backend@sha256:${'a'.repeat(64)}`,
});

const PRODUCTION_TUPLE = Object.freeze({
  project_id: 'moazez-production',
  region: 'me-central2',
  network: 'moazez-production-vpc',
  subnetwork: 'moazez-production-runtime-me-central2',
  migration_job_name: 'moazez-production-migration',
  migration_service_account:
    'moazez-migration-job@moazez-production.iam.gserviceaccount.com',
  migration_job_environment: 'production',
  migration_database_secret_id: 'moazez-production-migration-database-url',
  migration_database_secret_version: '17',
  image_reference: `me-central2-docker.pkg.dev/moazez-production/moazez-production-containers/moazez-backend@sha256:${'b'.repeat(64)}`,
});

const PROTECTED_BLOBS = Object.freeze({
  'config/deployment/migration-job.contract.json':
    '2f4f601fe8b62423eb1b0894b339d37438b98d58',
  'scripts/migrations/run-governed-migration-job.cjs':
    '8b5718310297149950a047ddfa5204ea0a69cdb4',
});

const UNCHANGED_STAGING_BLOBS = Object.freeze({
  '.terraform.lock.hcl': 'e8b531ec2f26afb92d61f8cc1c44615c356a5ddb',
  'outputs.tf': '8735595e4727a73971bbe04c18dba08188d13f25',
  'providers.tf': '160ad13a5a8457b996889c630e437e1a6a0f8395',
  'variables.tf': 'ae5f7c76c084ddb06a069272594cba14fa8dc002',
  'versions.tf': '2cddb4ebac33546128f852742fc4c99fb219093e',
});

const EXECUTION_SCOPED_ENVIRONMENT_NAMES = Object.freeze([
  'MIGRATION_JOB_EXECUTION_ID',
  'MIGRATION_JOB_ARTIFACT_DIGEST',
  'MIGRATION_JOB_APPROVAL_REF',
  'MIGRATION_JOB_BACKUP_CHECKPOINT',
  'MIGRATION_JOB_DATA_AUTHORITY',
]);

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

function gitBlobHash(source) {
  const content = Buffer.from(source, 'utf8');
  return crypto
    .createHash('sha1')
    .update(`blob ${content.length}\0`, 'utf8')
    .update(content)
    .digest('hex');
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
  const governedBlock = withoutHclComments(block);
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const match = new RegExp(
    `^\\s*${escapedName}\\s*=\\s*([^\\r\\n]+?)\\s*$`,
    'mu',
  ).exec(governedBlock);
  assert.ok(match, `Missing assignment for ${name}.`);
  return match[1];
}

function blockAssignmentExpressions(block) {
  const governedBlock = withoutHclComments(block);
  return Object.fromEntries(
    [
      ...governedBlock.matchAll(
        /^\s*([a-z][a-z0-9_]*)\s*=\s*([^\r\n]+?)\s*$/gmu,
      ),
    ].map((match) => [match[1], match[2]]),
  );
}

function variableNames(source) {
  const governedSource = withoutHclComments(source);
  return [...governedSource.matchAll(/^variable\s+"([^"]+)"\s*\{/gmu)].map(
    (match) => match[1],
  );
}

function outputNames(source) {
  const governedSource = withoutHclComments(source);
  return [...governedSource.matchAll(/^output\s+"([^"]+)"\s*\{/gmu)].map(
    (match) => match[1],
  );
}

function validationPatterns(variableBlock) {
  const governedBlock = withoutHclComments(variableBlock);
  return [...governedBlock.matchAll(/regex\(\s*"([^"]+)"/gu)].map(
    (match) => match[1],
  );
}

function validationCondition(variableBlock, variableName) {
  const governedBlock = withoutHclComments(variableBlock);
  const validations = extractBlocks(
    governedBlock,
    /^\s*validation\s*\{/gmu,
    `${variableName} validation block`,
  );
  assert.equal(validations.length, 1, `${variableName} validation count`);
  assert.equal(
    (validations[0].match(/^[ \t]*condition[ \t]*=/gmu) ?? []).length,
    1,
    `${variableName} condition assignment count`,
  );
  const match =
    /^[ \t]*condition[ \t]*=\s*([\s\S]*?)^[ \t]*error_message[ \t]*=/mu.exec(
      validations[0],
    );
  assert.ok(match, `Missing validation condition for ${variableName}.`);
  return canonicalHcl(match[1]);
}

function assertRequiredStringVariable(source, name) {
  const block = extractBlock(
    source,
    new RegExp(`^variable\\s+"${name}"\\s*\\{`, 'mu'),
    `${name} variable`,
  );
  assert.equal(assignmentExpression(block, 'type'), 'string');
  assert.doesNotMatch(block, /^\s*default\s*=/mu);
  return block;
}

function canonicalHcl(source) {
  return source.replace(/\s+/gu, '').replace(/,([)\]])/gu, '$1');
}

function tupleBranch(tuple, secretVersionExpression, imagePattern) {
  const identityEntries = Object.entries(tuple).filter(
    ([name]) =>
      name !== 'migration_database_secret_version' &&
      name !== 'image_reference',
  );
  return `(${identityEntries
    .map(([name, value]) => `var.${name}==${JSON.stringify(value)}`)
    .join('&&')}&&${secretVersionExpression}&&can(regex(${JSON.stringify(
    imagePattern,
  )},var.image_reference)))`;
}

function governedTupleAccepted(candidate) {
  const expectedNames = Object.keys(STAGING_TUPLE);
  if (
    Object.keys(candidate).length !== expectedNames.length ||
    !expectedNames.every((name) => Object.hasOwn(candidate, name))
  ) {
    return false;
  }
  const identityMatches = (expected) =>
    expectedNames
      .filter(
        (name) =>
          name !== 'migration_database_secret_version' &&
          name !== 'image_reference',
      )
      .every((name) => candidate[name] === expected[name]);
  const stagingAccepted =
    identityMatches(STAGING_TUPLE) &&
    candidate.migration_database_secret_version === '2' &&
    new RegExp(STAGING_IMAGE_PATTERN, 'u').test(candidate.image_reference);
  const productionAccepted =
    identityMatches(PRODUCTION_TUPLE) &&
    new RegExp(SECRET_VERSION_PATTERN, 'u').test(
      candidate.migration_database_secret_version,
    ) &&
    new RegExp(PRODUCTION_IMAGE_PATTERN, 'u').test(candidate.image_reference);
  return stagingAccepted || productionAccepted;
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

function assertStage28CandidateScope(candidateFiles) {
  const normalized = [
    ...new Set(candidateFiles.map((file) => file.replace(/\\/gu, '/'))),
  ].sort();
  const active =
    normalized.includes(TEST_PATH) ||
    normalized.some((file) => file.startsWith(`${PRODUCTION_ROOT}/`));
  if (!active) return false;
  const unauthorized = normalized.filter(
    (file) => !AUTHORIZED_CANDIDATE_PATHS.includes(file),
  );
  assert.deepEqual(unauthorized, []);
  return true;
}

function isStage28OperationalPath(file) {
  return (
    file.startsWith(`${MODULE_ROOT}/`) ||
    file.startsWith(`${STAGING_ROOT}/`) ||
    file.startsWith(`${PRODUCTION_ROOT}/`) ||
    file === PLAN_CI_PATH
  );
}

function isDay2D1ReleaseOrchestrationPath(file) {
  return (
    file.startsWith('infra/gcp/backend-runtime/') ||
    file.startsWith('infra/gcp/edge/') ||
    file.startsWith(`${DAY2_D1_DEPLOYMENT_CONTROL_ROOT}/`) ||
    file === DAY2_D1_HANDOFF_PATH ||
    file === PLAN_CI_PATH ||
    file === PLAN_CI_TEST_PATH ||
    file === TEST_PATH ||
    file === STAGE_29_TEST_PATH ||
    file === STAGE_30C1_TEST_PATH
  );
}

function assertCommittedStage28CandidateScope(
  candidateFiles,
  maintenanceFiles,
) {
  const committedCandidates =
    candidateFiles ?? candidateFilesFromCommittedRange();
  const normalized = [
    ...new Set(committedCandidates.map((file) => file.replace(/\\/gu, '/'))),
  ].sort();
  const normalizedMaintenance = [
    ...new Set(
      (
        maintenanceFiles ??
        (candidateFiles === undefined
          ? candidateFilesFromMaintenanceRange()
          : committedCandidates)
      ).map((file) => file.replace(/\\/gu, '/')),
    ),
  ].sort();
  const maintenanceScopeActive =
    candidateFiles === undefined || maintenanceFiles !== undefined;
  const day2D1MaintenanceActive =
    maintenanceScopeActive &&
    normalizedMaintenance.includes(STAGE_29_TEST_PATH) &&
    normalizedMaintenance.some(
      (file) =>
        file.startsWith(
          'infra/gcp/backend-runtime/modules/runtime-environment/',
        ) ||
        file.startsWith(
          'infra/gcp/backend-runtime/environments/nonprod/runtime/',
        ) ||
        file.startsWith(
          'infra/gcp/backend-runtime/environments/production/runtime/',
        ) ||
        file.startsWith('infra/gcp/edge/') ||
        file.startsWith(`${DAY2_D1_DEPLOYMENT_CONTROL_ROOT}/`),
    );
  if (day2D1MaintenanceActive) {
    assert.deepEqual(
      normalizedMaintenance.filter(
        (file) => !isDay2D1ReleaseOrchestrationPath(file),
      ),
      [],
    );
    return false;
  }
  const verifierRetouched =
    maintenanceScopeActive &&
    normalizedMaintenance.some(
      (file) => file === TEST_PATH || file === STAGE_29_TEST_PATH,
    );
  if (verifierRetouched) {
    const stage28MaintenancePaths = normalizedMaintenance.filter(
      (file) =>
        isStage28OperationalPath(file) ||
        file === TEST_PATH ||
        file === STAGE_29_TEST_PATH,
    );
    assert.deepEqual(
      stage28MaintenancePaths,
      [STAGE_29_TEST_PATH, TEST_PATH].sort(),
    );
  }

  const historicalVerifierPairPresent =
    normalized.includes(TEST_PATH) && normalized.includes(STAGE_29_TEST_PATH);
  if (historicalVerifierPairPresent) {
    const stage28OwnedPaths = normalized.filter(
      (file) =>
        isStage28OperationalPath(file) ||
        file === TEST_PATH ||
        file === STAGE_29_TEST_PATH,
    );
    assert.deepEqual(stage28OwnedPaths, [STAGE_29_TEST_PATH, TEST_PATH].sort());
    return false;
  }

  return assertStage28CandidateScope(normalized);
}

test('Production migration root has exactly the six governed source files', () => {
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
  const providerBlock = extractBlock(
    providers,
    /^provider\s+"google"\s*\{/mu,
    'Production google provider',
  );
  assert.deepEqual(blockAssignmentExpressions(providerBlock), {
    project: '"moazez-production"',
    region: '"me-central2"',
  });
  assert.match(versions, /required_version\s*=\s*">= 1[.]6[.]0, < 2[.]0[.]0"/u);
  assert.match(
    versions,
    /bucket\s*=\s*"moazez-production-91001421934-tfstate"/u,
  );
  assert.match(
    versions,
    /prefix\s*=\s*"backend-runtime\/production\/migration"/u,
  );
  assert.match(versions, /source\s*=\s*"hashicorp\/google"/u);
  assert.match(versions, /version\s*=\s*">= 7[.]40[.]0, < 8[.]0[.]0"/u);

  const productionLock = normalizedSource(
    `${PRODUCTION_ROOT}/.terraform.lock.hcl`,
  );
  const stagingLock = normalizedSource(`${STAGING_ROOT}/.terraform.lock.hcl`);
  assert.equal(productionLock, stagingLock);
  assert.equal(
    gitBlobHash(productionLock),
    UNCHANGED_STAGING_BLOBS['.terraform.lock.hcl'],
  );
  assert.match(productionLock, /version\s*=\s*"7[.]44[.]0"/u);
});

test('Production root passes the exact governed tuple to one shared module', () => {
  const main = normalizedHclSource(`${PRODUCTION_ROOT}/main.tf`);
  assert.equal((main.match(/^module\s+"/gmu) ?? []).length, 1);
  assert.equal((main.match(/^resource\s+"/gmu) ?? []).length, 0);
  assert.equal((main.match(/^data\s+"/gmu) ?? []).length, 0);
  const moduleBlock = extractBlock(
    main,
    /^module\s+"migration_job_environment"\s*\{/mu,
    'Production migration module',
  );
  assert.deepEqual(blockAssignmentExpressions(moduleBlock), {
    source: '"../../../modules/migration-job-environment"',
    project_id: '"moazez-production"',
    region: '"me-central2"',
    network: '"moazez-production-vpc"',
    subnetwork: '"moazez-production-runtime-me-central2"',
    migration_job_name: '"moazez-production-migration"',
    migration_service_account:
      '"moazez-migration-job@moazez-production.iam.gserviceaccount.com"',
    migration_job_environment: '"production"',
    migration_database_secret_id: '"moazez-production-migration-database-url"',
    migration_database_secret_version: 'var.migration_database_secret_version',
    image_reference: 'var.image_reference',
  });
});

test('Production variables require a canonical secret version and immutable image digest', () => {
  const variables = normalizedHclSource(`${PRODUCTION_ROOT}/variables.tf`);
  assert.deepEqual(variableNames(variables), [
    'image_reference',
    'migration_database_secret_version',
  ]);
  const imageBlock = assertRequiredStringVariable(variables, 'image_reference');
  const versionBlock = assertRequiredStringVariable(
    variables,
    'migration_database_secret_version',
  );
  assert.deepEqual(validationPatterns(imageBlock), [PRODUCTION_IMAGE_PATTERN]);
  assert.deepEqual(validationPatterns(versionBlock), [SECRET_VERSION_PATTERN]);
  assert.equal(
    validationCondition(imageBlock, 'image_reference'),
    `can(regex("${PRODUCTION_IMAGE_PATTERN}",var.image_reference))`,
  );
  assert.equal(
    validationCondition(versionBlock, 'migration_database_secret_version'),
    `can(regex("${SECRET_VERSION_PATTERN}",var.migration_database_secret_version))`,
  );

  const imagePolicy = new RegExp(PRODUCTION_IMAGE_PATTERN, 'u');
  const versionPolicy = new RegExp(SECRET_VERSION_PATTERN, 'u');
  assert.equal(imagePolicy.test(PRODUCTION_TUPLE.image_reference), true);
  for (const rejected of [
    'me-central2-docker.pkg.dev/moazez-production/moazez-production-containers/moazez-backend:latest',
    'me-central2-docker.pkg.dev/moazez-production/moazez-production-containers/moazez-backend:production',
    'me-central2-docker.pkg.dev/moazez-production/moazez-production-containers/moazez-backend:main',
    'me-central2-docker.pkg.dev/moazez-production/moazez-production-containers/moazez-backend:stable',
    'me-central2-docker.pkg.dev/moazez-production/moazez-production-containers/moazez-backend:release',
    STAGING_TUPLE.image_reference,
    `me-central2-docker.pkg.dev/moazez-production/other/moazez-backend@sha256:${'a'.repeat(64)}`,
    `me-central2-docker.pkg.dev/moazez-production/moazez-production-containers/moazez-backend@sha256:${'A'.repeat(64)}`,
  ]) {
    assert.equal(imagePolicy.test(rejected), false, rejected);
  }
  for (const accepted of ['1', '2', '17']) {
    assert.equal(versionPolicy.test(accepted), true, accepted);
  }
  for (const rejected of ['latest', 'enabled', '0', '-1', '01', '', '1.0']) {
    assert.equal(versionPolicy.test(rejected), false, rejected);
  }
});

test('Production outputs expose only the four non-sensitive governance values', () => {
  const outputs = normalizedHclSource(`${PRODUCTION_ROOT}/outputs.tf`);
  const expected = {
    migration_job_name: 'module.migration_job_environment.migration_job_name',
    migration_job_location:
      'module.migration_job_environment.migration_job_location',
    migration_job_service_account:
      'module.migration_job_environment.migration_job_service_account',
    image_reference: 'module.migration_job_environment.image_reference',
  };
  assert.deepEqual(outputNames(outputs), Object.keys(expected));
  for (const [name, value] of Object.entries(expected)) {
    const block = extractBlock(
      outputs,
      new RegExp(`^output\\s+"${name}"\\s*\\{`, 'mu'),
      `${name} output`,
    );
    assert.equal(assignmentExpression(block, 'value'), value);
  }
  assert.doesNotMatch(
    outputs,
    /database_url|secret(?:_version)?|credential|password|approval|backup|data_authority/iu,
  );
});

test('Shared module input surface is explicit, required, and environment-neutral', () => {
  const variables = normalizedHclSource(`${MODULE_ROOT}/variables.tf`);
  const expectedVariables = [
    'project_id',
    'region',
    'network',
    'subnetwork',
    'migration_job_name',
    'migration_service_account',
    'migration_job_environment',
    'migration_database_secret_id',
    'migration_database_secret_version',
    'image_reference',
  ];
  assert.deepEqual(variableNames(variables), expectedVariables);
  for (const name of expectedVariables) {
    assertRequiredStringVariable(variables, name);
  }
  const versionBlock = assertRequiredStringVariable(
    variables,
    'migration_database_secret_version',
  );
  assert.deepEqual(validationPatterns(versionBlock), [SECRET_VERSION_PATTERN]);
  assert.equal(
    validationCondition(versionBlock, 'migration_database_secret_version'),
    `can(regex("${SECRET_VERSION_PATTERN}",var.migration_database_secret_version))`,
  );
  const imageBlock = assertRequiredStringVariable(variables, 'image_reference');
  assert.deepEqual(validationPatterns(imageBlock), [
    STAGING_IMAGE_PATTERN,
    PRODUCTION_IMAGE_PATTERN,
  ]);
  assert.equal(
    validationCondition(imageBlock, 'image_reference'),
    `(can(regex("${STAGING_IMAGE_PATTERN}",var.image_reference))||can(regex("${PRODUCTION_IMAGE_PATTERN}",var.image_reference)))`,
  );

  const outputs = normalizedHclSource(`${MODULE_ROOT}/outputs.tf`);
  assert.deepEqual(outputNames(outputs), [
    'migration_job_name',
    'migration_job_location',
    'migration_job_service_account',
    'image_reference',
  ]);
  assert.doesNotMatch(outputs, /\bstaging\b|\bproduction\b/iu);
  assert.match(outputs, /value\s*=\s*var[.]migration_service_account/u);
});

test('Lifecycle precondition encodes exactly the complete Staging or Production tuple', () => {
  const main = normalizedHclSource(`${MODULE_ROOT}/main.tf`);
  const resource = extractBlock(
    main,
    /^resource\s+"google_cloud_run_v2_job"\s+"migration"\s*\{/mu,
    'Migration Job resource',
  );
  const lifecycleBlocks = extractBlocks(
    resource,
    /^\s*lifecycle\s*\{/gmu,
    'lifecycle block',
  );
  assert.equal(lifecycleBlocks.length, 1);
  assert.equal(
    assignmentExpression(lifecycleBlocks[0], 'prevent_destroy'),
    'true',
  );
  const preconditions = extractBlocks(
    lifecycleBlocks[0],
    /^\s*precondition\s*\{/gmu,
    'precondition block',
  );
  assert.equal(preconditions.length, 1);
  const conditionMatch =
    /condition\s*=\s*([\s\S]*?)\n\s*error_message\s*=/u.exec(preconditions[0]);
  assert.ok(conditionMatch, 'Missing tuple precondition expression.');
  const expectedCondition = `(${tupleBranch(
    STAGING_TUPLE,
    'var.migration_database_secret_version=="2"',
    STAGING_IMAGE_PATTERN,
  )}||${tupleBranch(
    PRODUCTION_TUPLE,
    `can(regex("${SECRET_VERSION_PATTERN}",var.migration_database_secret_version))`,
    PRODUCTION_IMAGE_PATTERN,
  )})`;
  assert.equal(canonicalHcl(conditionMatch[1]), expectedCondition);
  assert.match(
    preconditions[0],
    /complete governed staging or production environment tuple/iu,
  );
});

test('Tuple policy accepts both exact environments and rejects every mixed or third tuple', () => {
  assert.equal(governedTupleAccepted(STAGING_TUPLE), true);
  for (const version of ['1', '2', '17']) {
    assert.equal(
      governedTupleAccepted({
        ...PRODUCTION_TUPLE,
        migration_database_secret_version: version,
      }),
      true,
      version,
    );
  }
  const rejected = [
    { ...PRODUCTION_TUPLE, network: STAGING_TUPLE.network },
    {
      ...PRODUCTION_TUPLE,
      migration_database_secret_id: STAGING_TUPLE.migration_database_secret_id,
    },
    { ...PRODUCTION_TUPLE, image_reference: STAGING_TUPLE.image_reference },
    {
      ...STAGING_TUPLE,
      migration_service_account: PRODUCTION_TUPLE.migration_service_account,
    },
    { ...STAGING_TUPLE, migration_database_secret_version: '3' },
    { ...PRODUCTION_TUPLE, migration_job_environment: 'qa' },
    {
      ...PRODUCTION_TUPLE,
      image_reference: `me-central2-docker.pkg.dev/moazez-production/arbitrary/moazez-backend@sha256:${'c'.repeat(64)}`,
    },
    { ...PRODUCTION_TUPLE, migration_database_secret_version: 'latest' },
    { ...PRODUCTION_TUPLE, migration_database_secret_version: '0' },
    { ...PRODUCTION_TUPLE, migration_database_secret_version: '01' },
  ];
  for (const candidate of rejected) {
    assert.equal(governedTupleAccepted(candidate), false);
  }
});

test('Staging root passes the unchanged effective environment tuple', () => {
  const main = normalizedHclSource(`${STAGING_ROOT}/main.tf`);
  const moduleBlock = extractBlock(
    main,
    /^module\s+"migration_job_environment"\s*\{/mu,
    'Staging migration module',
  );
  assert.deepEqual(blockAssignmentExpressions(moduleBlock), {
    source: '"../../../modules/migration-job-environment"',
    project_id: '"moazez-nonprod-91001421934"',
    region: '"me-central2"',
    network: '"moazez-staging-vpc"',
    subnetwork: '"moazez-staging-runtime-me-central2"',
    migration_job_name: '"moazez-staging-migration"',
    migration_service_account:
      '"moazez-migration-job@moazez-nonprod-91001421934.iam.gserviceaccount.com"',
    migration_job_environment: '"staging"',
    migration_database_secret_id: '"moazez-staging-migration-database-url"',
    migration_database_secret_version: '"2"',
    image_reference: 'var.image_reference',
  });

  for (const [file, expectedBlob] of Object.entries(UNCHANGED_STAGING_BLOBS)) {
    assert.equal(
      gitBlobHash(normalizedSource(`${STAGING_ROOT}/${file}`)),
      expectedBlob,
      `${file} changed from the governed Staging baseline.`,
    );
  }
  const variables = normalizedHclSource(`${STAGING_ROOT}/variables.tf`);
  const imageBlock = assertRequiredStringVariable(variables, 'image_reference');
  assert.deepEqual(validationPatterns(imageBlock), [STAGING_IMAGE_PATTERN]);
  assert.equal(
    validationCondition(imageBlock, 'image_reference'),
    `can(regex("${STAGING_IMAGE_PATTERN}",var.image_reference))`,
  );
  const providers = normalizedHclSource(`${STAGING_ROOT}/providers.tf`);
  assert.match(providers, /project\s*=\s*"moazez-nonprod-91001421934"/u);
  assert.match(providers, /region\s*=\s*"me-central2"/u);
  const versions = normalizedHclSource(`${STAGING_ROOT}/versions.tf`);
  assert.match(versions, /bucket\s*=\s*"moazez-nonprod-91001421934-tfstate"/u);
  assert.match(versions, /prefix\s*=\s*"backend-runtime\/staging\/migration"/u);
});

test('Shared module retains the sole governed Cloud Run Job resource and runtime shape', () => {
  const main = normalizedHclSource(`${MODULE_ROOT}/main.tf`);
  const allTerraformSource =
    GOVERNED_TERRAFORM_PATHS.map(normalizedHclSource).join('\n');
  const resources = [
    ...allTerraformSource.matchAll(
      /^[ \t]*resource\s+"([^"]+)"\s+"([^"]+)"\s*\{/gmu,
    ),
  ];
  assert.equal(resources.length, 1);
  assert.deepEqual(resources[0].slice(1), [
    'google_cloud_run_v2_job',
    'migration',
  ]);
  assert.equal(
    (allTerraformSource.match(/^[ \t]*data\s+"/gmu) ?? []).length,
    0,
  );
  const resource = extractBlock(
    main,
    /^resource\s+"google_cloud_run_v2_job"\s+"migration"\s*\{/mu,
    'Migration Job resource',
  );
  assert.equal(assignmentExpression(resource, 'project'), 'var.project_id');
  assert.equal(assignmentExpression(resource, 'location'), 'var.region');
  assert.equal(
    assignmentExpression(resource, 'name'),
    'var.migration_job_name',
  );
  assert.equal(assignmentExpression(resource, 'deletion_protection'), 'true');

  const outerTemplate = extractBlock(
    resource,
    /^\s*template\s*\{/mu,
    'outer task template',
  );
  assert.equal(assignmentExpression(outerTemplate, 'task_count'), '1');
  assert.equal(assignmentExpression(outerTemplate, 'parallelism'), '1');
  const taskTemplate = extractBlock(
    outerTemplate,
    /^\s*template\s*\{/mu,
    'task template',
  );
  assert.equal(
    assignmentExpression(taskTemplate, 'service_account'),
    'var.migration_service_account',
  );
  assert.equal(assignmentExpression(taskTemplate, 'max_retries'), '0');
  assert.equal(assignmentExpression(taskTemplate, 'timeout'), '"1200s"');

  const container = extractBlock(
    taskTemplate,
    /^\s*containers\s*\{/mu,
    'Migration Job container',
  );
  assert.equal(assignmentExpression(container, 'image'), 'var.image_reference');
  assert.equal(
    assignmentExpression(container, 'command'),
    '["node", "scripts/migrations/run-governed-migration-job.cjs"]',
  );
  const environments = extractBlocks(
    container,
    /^\s*env\s*\{/gmu,
    'container environment block',
  );
  assert.equal(environments.length, 2);
  const stableEnvironment = environments.find(
    (block) =>
      assignmentExpression(block, 'name') === '"MIGRATION_JOB_ENVIRONMENT"',
  );
  const databaseEnvironment = environments.find(
    (block) => assignmentExpression(block, 'name') === '"DATABASE_URL"',
  );
  assert.ok(stableEnvironment);
  assert.ok(databaseEnvironment);
  assert.equal(
    assignmentExpression(stableEnvironment, 'value'),
    'var.migration_job_environment',
  );
  assert.doesNotMatch(databaseEnvironment, /^\s*value\s*=/mu);
  const valueSource = extractBlock(
    databaseEnvironment,
    /^\s*value_source\s*\{/mu,
    'DATABASE_URL value_source',
  );
  const secretReference = extractBlock(
    valueSource,
    /^\s*secret_key_ref\s*\{/mu,
    'DATABASE_URL secret_key_ref',
  );
  assert.equal(
    assignmentExpression(secretReference, 'secret'),
    'var.migration_database_secret_id',
  );
  assert.equal(
    assignmentExpression(secretReference, 'version'),
    'var.migration_database_secret_version',
  );

  const vpcAccess = extractBlock(
    taskTemplate,
    /^\s*vpc_access\s*\{/mu,
    'VPC access',
  );
  assert.equal(
    assignmentExpression(vpcAccess, 'egress'),
    '"PRIVATE_RANGES_ONLY"',
  );
  const networkInterface = extractBlock(
    vpcAccess,
    /^\s*network_interfaces\s*\{/mu,
    'VPC network interface',
  );
  assert.equal(
    assignmentExpression(networkInterface, 'network'),
    'var.network',
  );
  assert.equal(
    assignmentExpression(networkInterface, 'subnetwork'),
    'var.subnetwork',
  );
});

test('Terraform contains no execution hooks, fixed execution metadata, or secret payloads', () => {
  const source = GOVERNED_TERRAFORM_PATHS.map(normalizedHclSource).join('\n');
  assert.doesNotMatch(
    source,
    /null_resource|terraform_data|local-exec|remote-exec|provisioner\s+"|\bgcloud\b|prisma\s+migrate|run-governed-migration-job[.]cjs\s+[^"\]]/iu,
  );
  assert.doesNotMatch(
    source,
    /secret_data|secret_payload|google_secret_manager_secret_version|postgres(?:ql)?:\/\//iu,
  );
  for (const name of EXECUTION_SCOPED_ENVIRONMENT_NAMES) {
    assert.equal(source.includes(name), false, name);
  }
  assert.equal(source.includes(STAGE_27_IMAGE_DIGEST), false);
  assert.doesNotMatch(
    source,
    /google_cloud_run_v2_service|moazez-production-(?:api|core-worker|media-worker|maintenance-scheduler)|stage[-_ ]?29/iu,
  );

  const contract = JSON.parse(
    normalizedSource('config/deployment/migration-job.contract.json'),
  );
  assert.deepEqual(contract.command, [
    'node',
    'scripts/migrations/run-governed-migration-job.cjs',
  ]);
  assert.equal(contract.tasks, 1);
  assert.equal(contract.parallelism, 1);
  assert.equal(contract.maxRetries, 0);
  assert.equal(contract.timeoutSeconds, 1200);
});

test('Existing Migration contract and runner remain unchanged', () => {
  for (const [file, expectedBlob] of Object.entries(PROTECTED_BLOBS)) {
    assert.equal(
      gitBlobHash(normalizedSource(file)),
      expectedBlob,
      `${file} changed from the authoritative Stage 28A base.`,
    );
  }
});

test('Stage 28A and PRD3-G04 retain exact independent CI ownership', () => {
  assert.deepEqual(classifyTestFile(TEST_PATH), {
    file: TEST_PATH,
    kind: 'node-tap',
    owner: 'production-migration-source-governance',
    category: 'invariant',
    profile: 'runtime-governance',
    execution: 'pull-request',
  });
  const g04Path = 'scripts/tests/prd3-g04-governed-migration-job.test.cjs';
  assert.deepEqual(classifyTestFile(g04Path), {
    file: g04Path,
    kind: 'node-tap',
    owner: 'prd3-g04',
    category: 'invariant',
    profile: 'prd3-g04',
    execution: 'pull-request',
  });
});

test('Committed Stage 28A candidate scope contains only authorized paths when active', () => {
  assertCommittedStage28CandidateScope();
});

test('Committed scope preserves Stage 28 activation and delegates bounded verifier or Day-2 D1 maintenance', () => {
  assert.equal(
    assertCommittedStage28CandidateScope(['src/example-future-change.ts']),
    false,
  );
  assert.equal(
    assertCommittedStage28CandidateScope([`${PRODUCTION_ROOT}/variables.tf`]),
    true,
  );
  assert.throws(
    () =>
      assertCommittedStage28CandidateScope([
        `${PRODUCTION_ROOT}/main.tf`,
        'src/example-unrelated-change.ts',
      ]),
    { code: 'ERR_ASSERTION' },
  );
  assert.equal(
    assertCommittedStage28CandidateScope([
      TEST_PATH,
      STAGE_29_TEST_PATH,
      'src/example-future-change.ts',
    ]),
    false,
  );
  assert.throws(
    () =>
      assertCommittedStage28CandidateScope([
        TEST_PATH,
        STAGE_29_TEST_PATH,
        `${PRODUCTION_ROOT}/main.tf`,
      ]),
    { code: 'ERR_ASSERTION' },
  );
  const day2D1Scope = [
    TEST_PATH,
    STAGE_29_TEST_PATH,
    STAGE_30C1_TEST_PATH,
    PLAN_CI_PATH,
    PLAN_CI_TEST_PATH,
    'infra/gcp/backend-runtime/modules/runtime-environment/main.tf',
    'infra/gcp/edge/modules/edge-environment/main.tf',
    `${DAY2_D1_DEPLOYMENT_CONTROL_ROOT}/runtime-release-control.cjs`,
    DAY2_D1_HANDOFF_PATH,
  ];
  assert.equal(
    assertCommittedStage28CandidateScope(day2D1Scope, day2D1Scope),
    false,
  );
  assert.throws(
    () =>
      assertCommittedStage28CandidateScope(
        [...day2D1Scope, 'src/example-unrelated-change.ts'],
        [...day2D1Scope, 'src/example-unrelated-change.ts'],
      ),
    { code: 'ERR_ASSERTION' },
  );
});

test('Committed Stage 28 verifier delegation persists across later product commits and fails closed on re-touch', () => {
  const historicalFullRange = [
    TEST_PATH,
    STAGE_29_TEST_PATH,
    'prisma/schema.prisma',
    'src/infrastructure/database/school-scope.extension.ts',
    'src/modules/students/registration/application/create-student-bulk-registration.use-case.ts',
    'test/e2e/student-bulk-registration-intake.e2e-spec.ts',
  ];

  assert.equal(
    assertCommittedStage28CandidateScope(historicalFullRange, [
      'src/modules/students/registration/application/create-student-bulk-registration.use-case.ts',
      'test/e2e/student-bulk-registration-intake.e2e-spec.ts',
    ]),
    false,
  );
  assert.equal(
    assertCommittedStage28CandidateScope(
      [
        ...historicalFullRange,
        'src/modules/students/future-stage4.use-case.ts',
      ],
      ['src/modules/students/future-stage4.use-case.ts'],
    ),
    false,
  );
  assert.throws(
    () =>
      assertCommittedStage28CandidateScope(
        [...historicalFullRange, `${PRODUCTION_ROOT}/main.tf`],
        ['src/modules/students/future-stage4.use-case.ts'],
      ),
    { code: 'ERR_ASSERTION' },
  );
  assert.throws(
    () =>
      assertCommittedStage28CandidateScope(historicalFullRange, [TEST_PATH]),
    { code: 'ERR_ASSERTION' },
  );
  assert.throws(
    () =>
      assertCommittedStage28CandidateScope(historicalFullRange, [
        STAGE_29_TEST_PATH,
      ]),
    { code: 'ERR_ASSERTION' },
  );
  assert.equal(
    assertCommittedStage28CandidateScope(historicalFullRange, [
      TEST_PATH,
      STAGE_29_TEST_PATH,
    ]),
    false,
  );
  assert.throws(
    () =>
      assertCommittedStage28CandidateScope(
        [...historicalFullRange, `${PRODUCTION_ROOT}/main.tf`],
        [TEST_PATH, STAGE_29_TEST_PATH, `${PRODUCTION_ROOT}/main.tf`],
      ),
    { code: 'ERR_ASSERTION' },
  );
});

test('Candidate scope ignores unrelated PRs and rejects every mixed Stage 28A candidate', () => {
  assert.equal(
    assertStage28CandidateScope(['src/example-future-change.ts']),
    false,
  );
  assert.equal(
    assertStage28CandidateScope([
      `${MODULE_ROOT}/main.tf`,
      `${STAGING_ROOT}/main.tf`,
      PLAN_CI_PATH,
    ]),
    false,
  );
  assert.equal(
    assertStage28CandidateScope([`${PRODUCTION_ROOT}/variables.tf`]),
    true,
  );
  assert.equal(
    assertStage28CandidateScope([
      `${MODULE_ROOT}/main.tf`,
      `${PRODUCTION_ROOT}/main.tf`,
    ]),
    true,
  );
  assert.equal(assertStage28CandidateScope(AUTHORIZED_CANDIDATE_PATHS), true);
  assert.throws(
    () =>
      assertStage28CandidateScope([
        ...AUTHORIZED_CANDIDATE_PATHS,
        'src/example-unrelated-change.ts',
      ]),
    { code: 'ERR_ASSERTION' },
  );
  assert.throws(
    () =>
      assertStage28CandidateScope([
        `${PRODUCTION_ROOT}/main.tf`,
        'src/example-unrelated-change.ts',
      ]),
    { code: 'ERR_ASSERTION' },
  );
  assert.throws(
    () =>
      assertStage28CandidateScope([
        TEST_PATH,
        'scripts/tests/stage-29-production-migration-execution.test.cjs',
      ]),
    { code: 'ERR_ASSERTION' },
  );
});
