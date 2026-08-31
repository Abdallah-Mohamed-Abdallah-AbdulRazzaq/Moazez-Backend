'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { execFileSync } = require('node:child_process');
const { ACTIVE_TAP_OWNERS, classifyTestFile } = require('../ci/plan-ci.cjs');

const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..');
const BASE_SHA = 'c4f0c0175d09279a1e4b0fb7d0b3beab8d45faaa';
const ARTIFACT_DOMAIN = 'infra/gcp/frontend-artifact-identity';
const ARTIFACT_ROOT = `${ARTIFACT_DOMAIN}/environments/production`;
const ARTIFACT_MODULE = `${ARTIFACT_DOMAIN}/modules/frontend-artifact-identity-environment`;
const RUNTIME_DOMAIN = 'infra/gcp/frontend-runtime';
const RUNTIME_ROOT = `${RUNTIME_DOMAIN}/environments/production`;
const RUNTIME_MODULE = `${RUNTIME_DOMAIN}/modules/frontend-runtime-environment`;
const EDGE_ROOT = 'infra/gcp/edge/environments/production';
const EDGE_NONPROD_ROOT = 'infra/gcp/edge/environments/nonprod';
const EDGE_MODULE = 'infra/gcp/edge/modules/edge-environment';
const TEST_PATH =
  'scripts/tests/stage-30c1-production-frontend-edge-source.test.cjs';
const HISTORICAL_STAGE28_REMEDIATION_PATH =
  'scripts/tests/stage-28a-production-migration-job-source.test.cjs';
const HISTORICAL_STAGE29_REMEDIATION_PATH =
  'scripts/tests/stage-29a-production-runtime-source.test.cjs';
const PLAN_CI_PATH = 'scripts/ci/plan-ci.cjs';
const PLAN_CI_TEST_PATH = 'scripts/tests/plan-ci.test.cjs';
const DAY2_D1_HANDOFF_PATH =
  'docs/governance/day2-release-orchestration-devops-handoff.md';

const TERRAFORM_ROOT_FILES = Object.freeze([
  '.terraform.lock.hcl',
  'main.tf',
  'outputs.tf',
  'providers.tf',
  'versions.tf',
]);
const RUNTIME_ROOT_FILES = Object.freeze(
  [...TERRAFORM_ROOT_FILES, 'variables.tf'].sort(),
);
const MODULE_FILES = Object.freeze(['main.tf', 'outputs.tf', 'variables.tf']);
const TERRAFORM_IGNORE_POLICY = [
  '**/.terraform/',
  '**/*.tfstate',
  '**/*.tfstate.*',
  '**/*.tfplan',
  '**/crash.log',
  '**/crash.*.log',
  '',
].join('\n');

const PLATFORM_ADMIN_IMAGE_PATTERN =
  '^me-central2-docker[.]pkg[.]dev/moazez-production/moazez-production-containers/moazez-platform-admin@sha256:[a-f0-9]{64}$';
const SCHOOL_DASHBOARD_IMAGE_PATTERN =
  '^me-central2-docker[.]pkg[.]dev/moazez-production/moazez-production-containers/moazez-school-dashboard@sha256:[a-f0-9]{64}$';

const AUTHORIZED_STAGE30C1_PATHS = Object.freeze(
  [
    `${ARTIFACT_DOMAIN}/.gitignore`,
    `${ARTIFACT_DOMAIN}/README.md`,
    `${ARTIFACT_ROOT}/.terraform.lock.hcl`,
    `${ARTIFACT_ROOT}/main.tf`,
    `${ARTIFACT_ROOT}/outputs.tf`,
    `${ARTIFACT_ROOT}/providers.tf`,
    `${ARTIFACT_ROOT}/versions.tf`,
    `${ARTIFACT_MODULE}/main.tf`,
    `${ARTIFACT_MODULE}/outputs.tf`,
    `${ARTIFACT_MODULE}/variables.tf`,
    `${RUNTIME_DOMAIN}/.gitignore`,
    `${RUNTIME_DOMAIN}/README.md`,
    `${RUNTIME_ROOT}/.terraform.lock.hcl`,
    `${RUNTIME_ROOT}/main.tf`,
    `${RUNTIME_ROOT}/outputs.tf`,
    `${RUNTIME_ROOT}/providers.tf`,
    `${RUNTIME_ROOT}/variables.tf`,
    `${RUNTIME_ROOT}/versions.tf`,
    `${RUNTIME_MODULE}/main.tf`,
    `${RUNTIME_MODULE}/outputs.tf`,
    `${RUNTIME_MODULE}/variables.tf`,
    `${EDGE_ROOT}/.terraform.lock.hcl`,
    `${EDGE_ROOT}/main.tf`,
    `${EDGE_ROOT}/outputs.tf`,
    `${EDGE_ROOT}/providers.tf`,
    `${EDGE_ROOT}/versions.tf`,
    HISTORICAL_STAGE29_REMEDIATION_PATH,
    PLAN_CI_PATH,
    TEST_PATH,
  ].sort(),
);

function repositoryPath(relativePath) {
  return path.join(REPOSITORY_ROOT, ...relativePath.split('/'));
}

function normalizedSource(relativePath) {
  return fs
    .readFileSync(repositoryPath(relativePath), 'utf8')
    .replace(/\r\n/gu, '\n');
}

function git(...args) {
  return execFileSync('git', args, {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    windowsHide: true,
  }).replace(/\r\n/gu, '\n');
}

function baseSource(relativePath) {
  return git('show', `${BASE_SHA}:${relativePath}`);
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

function assignmentExpression(block, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const match = new RegExp(
    `^\\s*${escapedName}\\s*=\\s*([^\\r\\n]+?)\\s*$`,
    'mu',
  ).exec(withoutHclComments(block));
  assert.ok(match, `Missing assignment for ${name}.`);
  return match[1];
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

function variableBlock(source, name) {
  return extractBlock(
    source,
    new RegExp(`^variable\\s+"${name}"\\s*\\{`, 'mu'),
    `${name} variable`,
  );
}

function validationPatterns(block) {
  return [...block.matchAll(/regex\(\s*"([^"]+)"/gu)].map((match) => match[1]);
}

function resourceBlock(source, type, name) {
  return extractBlock(
    source,
    new RegExp(`^resource\\s+"${type}"\\s+"${name}"\\s*\\{`, 'mu'),
    `${type}.${name}`,
  );
}

function resourceAddresses(source) {
  return [
    ...withoutHclComments(source).matchAll(
      /^resource\s+"([^"]+)"\s+"([^"]+)"\s*\{/gmu,
    ),
  ]
    .map((match) => `${match[1]}.${match[2]}`)
    .sort();
}

function filesInDirectory(relativePath) {
  return fs
    .readdirSync(repositoryPath(relativePath), { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
}

function assertRootContract(root, statePrefix, includeRegion) {
  const versions = normalizedHclSource(`${root}/versions.tf`);
  const providers = normalizedHclSource(`${root}/providers.tf`);
  const lock = normalizedSource(`${root}/.terraform.lock.hcl`);

  assert.match(versions, /required_version\s*=\s*">= 1[.]6[.]0, < 2[.]0[.]0"/u);
  assert.match(
    versions,
    /bucket\s*=\s*"moazez-production-91001421934-tfstate"/u,
  );
  assert.match(versions, new RegExp(`prefix\\s*=\\s*"${statePrefix}"`, 'u'));
  assert.match(versions, /source\s*=\s*"hashicorp\/google"/u);
  assert.match(versions, /version\s*=\s*">= 7[.]40[.]0, < 8[.]0[.]0"/u);
  assert.match(providers, /project\s*=\s*"moazez-production"/u);
  if (includeRegion) assert.match(providers, /region\s*=\s*"me-central2"/u);
  assert.equal(
    (
      lock.match(/provider "registry[.]terraform[.]io\/hashicorp\/google"/gu) ??
      []
    ).length,
    1,
  );
  assert.match(lock, /version\s*=\s*"7[.]44[.]0"/u);
  assert.match(lock, /constraints\s*=\s*">= 7[.]40[.]0, < 8[.]0[.]0"/u);
}

function trackedFilesAtRevision(revision, relativePath) {
  return git('ls-tree', '-r', '--name-only', revision, '--', relativePath)
    .split('\n')
    .filter(Boolean)
    .sort();
}

function assertTreeUnchanged(relativePath) {
  const baselineFiles = trackedFilesAtRevision(BASE_SHA, relativePath);
  const currentFiles = git('ls-files', '--', relativePath)
    .split('\n')
    .filter(Boolean)
    .sort();
  assert.deepEqual(
    currentFiles,
    baselineFiles,
    `${relativePath} file set changed`,
  );
  for (const file of baselineFiles) {
    assert.equal(normalizedSource(file), baseSource(file), `${file} changed`);
  }
}

function candidateFilesFromCommittedRange() {
  const base = process.env.CI_BASE_SHA || BASE_SHA;
  const candidate = process.env.CI_CANDIDATE_SHA || 'HEAD';
  return [
    ...new Set(
      git('diff', '--name-only', base, candidate, '--')
        .split('\n')
        .filter(Boolean)
        .map((file) => file.replace(/\\/gu, '/')),
    ),
  ].sort();
}

function assertStage30C1CandidateScope(candidateFiles) {
  const normalized = [
    ...new Set(candidateFiles.map((file) => file.replace(/\\/gu, '/'))),
  ].sort();
  const active =
    normalized.includes(TEST_PATH) ||
    normalized.some((file) => file.startsWith(`${ARTIFACT_DOMAIN}/`)) ||
    normalized.some((file) => file.startsWith(`${RUNTIME_DOMAIN}/`)) ||
    normalized.some((file) => file.startsWith(`${EDGE_ROOT}/`));
  if (!active) return false;
  assert.deepEqual(
    normalized.filter((file) => !AUTHORIZED_STAGE30C1_PATHS.includes(file)),
    [],
  );
  return true;
}

function isDay2D1ReleaseOrchestrationPath(file) {
  return (
    file.startsWith('infra/gcp/backend-runtime/') ||
    file.startsWith('infra/gcp/edge/') ||
    file.startsWith('scripts/deployment-control/') ||
    file === DAY2_D1_HANDOFF_PATH ||
    file === HISTORICAL_STAGE28_REMEDIATION_PATH ||
    file === HISTORICAL_STAGE29_REMEDIATION_PATH ||
    file === PLAN_CI_PATH ||
    file === PLAN_CI_TEST_PATH ||
    file === TEST_PATH
  );
}

test('Stage 30C1 domains have exactly the governed source structure and ignore policy', () => {
  assert.equal(AUTHORIZED_STAGE30C1_PATHS.length, 29);
  assert.deepEqual(filesInDirectory(ARTIFACT_ROOT), TERRAFORM_ROOT_FILES);
  assert.deepEqual(filesInDirectory(ARTIFACT_MODULE), MODULE_FILES);
  assert.deepEqual(filesInDirectory(RUNTIME_ROOT), RUNTIME_ROOT_FILES);
  assert.deepEqual(filesInDirectory(RUNTIME_MODULE), MODULE_FILES);
  assert.deepEqual(filesInDirectory(EDGE_ROOT), TERRAFORM_ROOT_FILES);
  assert.equal(
    normalizedSource(`${ARTIFACT_DOMAIN}/.gitignore`),
    TERRAFORM_IGNORE_POLICY,
  );
  assert.equal(
    normalizedSource(`${RUNTIME_DOMAIN}/.gitignore`),
    TERRAFORM_IGNORE_POLICY,
  );
});

test('Artifact identity root locks the exact Production backend and provider', () => {
  assertRootContract(
    ARTIFACT_ROOT,
    'frontend-artifact-identity/production',
    false,
  );
  const rootMain = normalizedHclSource(`${ARTIFACT_ROOT}/main.tf`);
  assert.equal(resourceAddresses(rootMain).length, 0);
  assert.equal((rootMain.match(/^module\s+"/gmu) ?? []).length, 1);
  for (const value of [
    'moazez-production',
    '91001421934',
    'production',
    '127324203',
    'refs/heads/main',
    'moazez-github-production',
    '1335685284',
    'moazez-platform-admin-main',
    '1335686453',
    'moazez-school-dashboard-main',
    'moazez-ui-artifact-builder',
    'me-central2',
    'moazez-production-containers',
  ]) {
    assert.ok(rootMain.includes(`"${value}"`), value);
  }
});

test('Artifact identity references the existing pool and owns exactly two independent frontend providers', () => {
  const main = normalizedHclSource(`${ARTIFACT_MODULE}/main.tf`);
  assert.deepEqual(resourceAddresses(main), [
    'google_artifact_registry_repository_iam_member.artifact_writer',
    'google_iam_workload_identity_pool_provider.platform_admin',
    'google_iam_workload_identity_pool_provider.school_dashboard',
    'google_service_account.artifact_builder',
    'google_service_account_iam_member.platform_admin_workload_identity_user',
    'google_service_account_iam_member.school_dashboard_workload_identity_user',
  ]);
  assert.doesNotMatch(main, /resource\s+"google_iam_workload_identity_pool"/u);
  for (const providerName of ['platform_admin', 'school_dashboard']) {
    const provider = resourceBlock(
      main,
      'google_iam_workload_identity_pool_provider',
      providerName,
    );
    assert.equal(
      assignmentExpression(provider, 'workload_identity_pool_id'),
      'var.workload_identity_pool_id',
    );
  }
  assert.equal(
    (
      main.match(
        /issuer_uri\s*=\s*"https:\/\/token[.]actions[.]githubusercontent[.]com"/gu,
      ) ?? []
    ).length,
    2,
  );
  for (const mapping of [
    '"google.subject"                = "assertion.sub"',
    '"attribute.repository"          = "assertion.repository"',
    '"attribute.repository_id"       = "assertion.repository_id"',
    '"attribute.repository_owner"    = "assertion.repository_owner"',
    '"attribute.repository_owner_id" = "assertion.repository_owner_id"',
    '"attribute.ref"                 = "assertion.ref"',
  ]) {
    assert.equal(main.split(mapping).length - 1, 2, mapping);
  }
  assert.match(
    main,
    /platform_admin_attribute_condition\s*=\s*format\([\s\S]*?var[.]platform_admin_repository_id,[\s\S]*?var[.]github_owner_id,[\s\S]*?var[.]github_allowed_ref,/u,
  );
  assert.match(
    main,
    /school_dashboard_attribute_condition\s*=\s*format\([\s\S]*?var[.]school_dashboard_repository_id,[\s\S]*?var[.]github_owner_id,[\s\S]*?var[.]github_allowed_ref,/u,
  );
  assert.doesNotMatch(main, /\|\||pull_request|repository\s*==|[*]/u);
});

test('Frontend WIF provider display names are exact literals within the 32-character limit', () => {
  const main = normalizedHclSource(`${ARTIFACT_MODULE}/main.tf`);
  for (const [providerName, expectedName, expectedLength] of [
    ['platform_admin', 'MOAZEZ Platform Admin main', 26],
    ['school_dashboard', 'MOAZEZ School Dashboard main', 28],
  ]) {
    const provider = resourceBlock(
      main,
      'google_iam_workload_identity_pool_provider',
      providerName,
    );
    const displayNameExpression = assignmentExpression(
      provider,
      'display_name',
    );
    assert.equal(displayNameExpression, JSON.stringify(expectedName));
    const displayName = JSON.parse(displayNameExpression);
    assert.equal(typeof displayName, 'string');
    assert.equal(displayName, expectedName);
    assert.equal(displayName.length, expectedLength);
    assert.ok(displayName.length <= 32);
  }
});

test('Artifact builder is protected and has only two exact WIF grants plus repository writer', () => {
  const main = normalizedHclSource(`${ARTIFACT_MODULE}/main.tf`);
  const builder = resourceBlock(
    main,
    'google_service_account',
    'artifact_builder',
  );
  assert.equal(
    assignmentExpression(builder, 'account_id'),
    'var.artifact_builder_service_account_id',
  );
  assert.equal(
    assignmentExpression(builder, 'display_name'),
    '"Moazez UI Artifact Builder"',
  );
  assert.equal(assignmentExpression(builder, 'deletion_policy'), '"PREVENT"');
  assert.match(builder, /prevent_destroy\s*=\s*true/u);

  const grants = [
    [
      'platform_admin_workload_identity_user',
      'platform_admin',
      'platform_admin_repository_id',
    ],
    [
      'school_dashboard_workload_identity_user',
      'school_dashboard',
      'school_dashboard_repository_id',
    ],
  ];
  for (const [name, provider, repositoryId] of grants) {
    const grant = resourceBlock(
      main,
      'google_service_account_iam_member',
      name,
    );
    assert.equal(
      assignmentExpression(grant, 'role'),
      '"roles/iam.workloadIdentityUser"',
    );
    assert.equal(
      assignmentExpression(grant, 'service_account_id'),
      'google_service_account.artifact_builder.name',
    );
    assert.match(
      grant,
      /principalSet:\/\/iam[.]googleapis[.]com\/projects\/%s\/locations\/global\/workloadIdentityPools\/%s\/attribute[.]repository_id\/%s/u,
    );
    assert.ok(grant.includes(`var.${repositoryId}`));
    assert.match(
      grant,
      new RegExp(
        `depends_on\\s*=\\s*\\[google_iam_workload_identity_pool_provider[.]${provider}\\]`,
        'u',
      ),
    );
  }

  const writer = resourceBlock(
    main,
    'google_artifact_registry_repository_iam_member',
    'artifact_writer',
  );
  assert.equal(
    assignmentExpression(writer, 'project'),
    'var.artifact_registry_project_id',
  );
  assert.equal(
    assignmentExpression(writer, 'location'),
    'var.artifact_registry_location',
  );
  assert.equal(
    assignmentExpression(writer, 'repository'),
    'var.artifact_registry_repository_id',
  );
  assert.equal(
    assignmentExpression(writer, 'role'),
    '"roles/artifactregistry.writer"',
  );
  assert.equal(
    assignmentExpression(writer, 'member'),
    'google_service_account.artifact_builder.member',
  );
});

test('Artifact identity denies broad roles, keys, secrets, runtime actAs, and unsafe outputs', () => {
  const terraform = [
    `${ARTIFACT_ROOT}/main.tf`,
    `${ARTIFACT_ROOT}/outputs.tf`,
    `${ARTIFACT_ROOT}/providers.tf`,
    `${ARTIFACT_ROOT}/versions.tf`,
    `${ARTIFACT_MODULE}/main.tf`,
    `${ARTIFACT_MODULE}/outputs.tf`,
    `${ARTIFACT_MODULE}/variables.tf`,
  ]
    .map(normalizedHclSource)
    .join('\n');
  assert.doesNotMatch(
    terraform,
    /google_project_iam|google_service_account_key/u,
  );
  assert.doesNotMatch(
    terraform,
    /roles\/(?:run[.]|storage[.]|secretmanager[.]|cloudsql[.]|redis[.]|iam[.]serviceAccountTokenCreator|iam[.]serviceAccountUser)/u,
  );
  assert.doesNotMatch(terraform, /moazez-iac-deployer/u);
  assert.deepEqual(
    outputNames(normalizedHclSource(`${ARTIFACT_ROOT}/outputs.tf`)).sort(),
    [
      'builder_service_account_email',
      'platform_admin_wif_provider_name',
      'school_dashboard_wif_provider_name',
    ].sort(),
  );
  assert.deepEqual(
    outputNames(normalizedHclSource(`${ARTIFACT_MODULE}/outputs.tf`)).sort(),
    [
      'builder_service_account_email',
      'platform_admin_wif_provider_name',
      'school_dashboard_wif_provider_name',
    ].sort(),
  );
});

test('Artifact identity is fail-closed to the exact Production tuple and Backend WIF remains unchanged', () => {
  const main = normalizedHclSource(`${ARTIFACT_MODULE}/main.tf`);
  const variables = normalizedHclSource(`${ARTIFACT_MODULE}/variables.tf`);
  assert.match(
    main,
    /governed_contract\s*=\s*local[.]current_contract\s*==\s*local[.]production_contract/u,
  );
  for (const value of [
    'moazez-production',
    '91001421934',
    'production',
    'moazez-github-production',
    'moazez-platform-admin-main',
    'moazez-school-dashboard-main',
    '1335685284',
    '1335686453',
    '127324203',
    'refs/heads/main',
    'moazez-ui-artifact-builder',
    'me-central2',
    'moazez-production-containers',
  ]) {
    assert.ok(main.includes(`"${value}"`), value);
    assert.ok(variables.includes(`"${value}"`), value);
  }
  assertTreeUnchanged('infra/gcp/deployment-identity/environments/production');
  assertTreeUnchanged(
    'infra/gcp/deployment-identity/modules/deployment-identity-environment',
  );
});

test('Frontend runtime root has only two required immutable Production image inputs', () => {
  assertRootContract(RUNTIME_ROOT, 'frontend-runtime/production', true);
  const variables = normalizedHclSource(`${RUNTIME_ROOT}/variables.tf`);
  assert.deepEqual(variableNames(variables), [
    'platform_admin_image',
    'school_dashboard_image',
  ]);
  const expectations = [
    ['platform_admin_image', PLATFORM_ADMIN_IMAGE_PATTERN],
    ['school_dashboard_image', SCHOOL_DASHBOARD_IMAGE_PATTERN],
  ];
  for (const [name, pattern] of expectations) {
    const block = variableBlock(variables, name);
    assert.equal(assignmentExpression(block, 'type'), 'string');
    assert.doesNotMatch(block, /^\s*default\s*=/mu);
    assert.deepEqual(validationPatterns(block), [pattern]);
  }
});

test('Frontend image patterns accept only exact lowercase digest references', () => {
  const validDigest = 'a'.repeat(64);
  const cases = [
    [
      new RegExp(PLATFORM_ADMIN_IMAGE_PATTERN, 'u'),
      `me-central2-docker.pkg.dev/moazez-production/moazez-production-containers/moazez-platform-admin@sha256:${validDigest}`,
    ],
    [
      new RegExp(SCHOOL_DASHBOARD_IMAGE_PATTERN, 'u'),
      `me-central2-docker.pkg.dev/moazez-production/moazez-production-containers/moazez-school-dashboard@sha256:${validDigest}`,
    ],
  ];
  for (const [pattern, valid] of cases) {
    assert.equal(pattern.test(valid), true);
    for (const invalid of [
      valid.replace(/@sha256:.+$/u, ':latest'),
      valid.replace(/@sha256:.+$/u, ':source-sha'),
      valid.replace('moazez-production/', 'moazez-nonprod-91001421934/'),
      valid.replace(
        'moazez-production-containers',
        'moazez-staging-containers',
      ),
      valid.replace(/a$/u, 'A'),
      valid.slice(0, -1),
      valid.replace(
        /moazez-(?:platform-admin|school-dashboard)/u,
        'wrong-package',
      ),
    ]) {
      assert.equal(pattern.test(invalid), false, invalid);
    }
  }
});

test('Frontend runtime is closed to exact Production identities, services, and deployer', () => {
  const rootMain = normalizedHclSource(`${RUNTIME_ROOT}/main.tf`);
  const moduleMain = normalizedHclSource(`${RUNTIME_MODULE}/main.tf`);
  assert.equal(resourceAddresses(rootMain).length, 0);
  assert.equal((rootMain.match(/^module\s+"/gmu) ?? []).length, 1);
  for (const value of [
    'moazez-production',
    'me-central2',
    'production',
    'moazez-iac-deployer@moazez-production.iam.gserviceaccount.com',
    'moazez-platform-admin-runtime',
    'moazez-school-ui-runtime',
    'moazez-production-platform-admin',
    'moazez-production-school-dashboard',
  ]) {
    assert.ok(rootMain.includes(`"${value}"`), value);
    assert.ok(moduleMain.includes(`"${value}"`), value);
  }
  assert.match(
    moduleMain,
    /governed_contract\s*=\s*local[.]current_contract\s*==\s*local[.]production_contract/u,
  );
  assert.deepEqual(resourceAddresses(moduleMain), [
    'google_cloud_run_v2_service.platform_admin',
    'google_cloud_run_v2_service.school_dashboard',
    'google_service_account.platform_admin_runtime',
    'google_service_account.school_dashboard_runtime',
    'google_service_account_iam_member.platform_admin_iac_deployer_act_as',
    'google_service_account_iam_member.school_dashboard_iac_deployer_act_as',
  ]);
});

test('Frontend runtime identities are protected and deployer actAs is resource-level only', () => {
  const main = normalizedHclSource(`${RUNTIME_MODULE}/main.tf`);
  for (const [name, accountVariable, displayName] of [
    [
      'platform_admin_runtime',
      'var.platform_admin_runtime_service_account_id',
      'Moazez Platform Admin Runtime',
    ],
    [
      'school_dashboard_runtime',
      'var.school_dashboard_runtime_service_account_id',
      'Moazez School Dashboard Runtime',
    ],
  ]) {
    const serviceAccount = resourceBlock(main, 'google_service_account', name);
    assert.equal(
      assignmentExpression(serviceAccount, 'account_id'),
      accountVariable,
    );
    assert.equal(
      assignmentExpression(serviceAccount, 'display_name'),
      JSON.stringify(displayName),
    );
    assert.equal(
      assignmentExpression(serviceAccount, 'deletion_policy'),
      '"PREVENT"',
    );
    assert.match(serviceAccount, /prevent_destroy\s*=\s*true/u);
  }
  for (const [name, serviceAccount] of [
    ['platform_admin_iac_deployer_act_as', 'platform_admin_runtime'],
    ['school_dashboard_iac_deployer_act_as', 'school_dashboard_runtime'],
  ]) {
    const grant = resourceBlock(
      main,
      'google_service_account_iam_member',
      name,
    );
    assert.equal(
      assignmentExpression(grant, 'role'),
      '"roles/iam.serviceAccountUser"',
    );
    assert.equal(
      assignmentExpression(grant, 'member'),
      'local.iac_deployer_member',
    );
    assert.equal(
      assignmentExpression(grant, 'service_account_id'),
      `google_service_account.${serviceAccount}.name`,
    );
  }
  assert.doesNotMatch(main, /google_project_iam/u);
  assert.equal(
    (main.match(/roles\/iam[.]serviceAccountUser/gu) ?? []).length,
    2,
  );
  assert.doesNotMatch(
    main,
    /roles\/(?:secretmanager|cloudsql|redis|storage|artifactregistry)[.]/u,
  );
});

function assertFrontendService(main, options) {
  const service = resourceBlock(
    main,
    'google_cloud_run_v2_service',
    options.resourceName,
  );
  assert.equal(assignmentExpression(service, 'name'), options.serviceName);
  assert.equal(assignmentExpression(service, 'project'), 'var.project_id');
  assert.equal(assignmentExpression(service, 'location'), 'var.region');
  assert.equal(
    assignmentExpression(service, 'ingress'),
    '"INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"',
  );
  assert.equal(assignmentExpression(service, 'default_uri_disabled'), 'true');
  assert.equal(assignmentExpression(service, 'invoker_iam_disabled'), 'true');
  assert.equal(assignmentExpression(service, 'deletion_protection'), 'true');

  const scaling = extractBlock(service, /^\s*scaling\s*\{/mu, 'scaling');
  assert.equal(assignmentExpression(scaling, 'max_instance_count'), '100');
  assert.doesNotMatch(scaling, /min_instance_count/u);
  const template = extractBlock(service, /^\s*template\s*\{/mu, 'template');
  assert.equal(
    assignmentExpression(template, 'service_account'),
    options.identity,
  );
  const container = extractBlock(
    template,
    /^\s*containers\s*\{/mu,
    'container',
  );
  assert.equal(assignmentExpression(container, 'image'), options.image);
  const ports = extractBlock(container, /^\s*ports\s*\{/mu, 'ports');
  assert.equal(assignmentExpression(ports, 'container_port'), '8080');
  assert.equal(
    assignmentExpression(service, 'depends_on'),
    `[google_service_account_iam_member.${options.dependency}]`,
  );
  const lifecycle = extractBlock(service, /^\s*lifecycle\s*\{/mu, 'lifecycle');
  assert.equal(assignmentExpression(lifecycle, 'prevent_destroy'), 'true');
}

test('Both frontend Cloud Run services have exact Dark runtime settings and actAs dependencies', () => {
  const main = normalizedHclSource(`${RUNTIME_MODULE}/main.tf`);
  assertFrontendService(main, {
    resourceName: 'platform_admin',
    serviceName: 'var.platform_admin_service_name',
    identity: 'google_service_account.platform_admin_runtime.email',
    image: 'var.platform_admin_image',
    dependency: 'platform_admin_iac_deployer_act_as',
  });
  assertFrontendService(main, {
    resourceName: 'school_dashboard',
    serviceName: 'var.school_dashboard_service_name',
    identity: 'google_service_account.school_dashboard_runtime.email',
    image: 'var.school_dashboard_image',
    dependency: 'school_dashboard_iac_deployer_act_as',
  });
  assert.doesNotMatch(main, /min_instance_count/u);
});

test('Frontend runtime creates no public IAM, secret, data credential, VPC, or NEXT_PUBLIC configuration', () => {
  const terraform = [
    `${RUNTIME_ROOT}/main.tf`,
    `${RUNTIME_ROOT}/outputs.tf`,
    `${RUNTIME_ROOT}/providers.tf`,
    `${RUNTIME_ROOT}/variables.tf`,
    `${RUNTIME_ROOT}/versions.tf`,
    `${RUNTIME_MODULE}/main.tf`,
    `${RUNTIME_MODULE}/outputs.tf`,
    `${RUNTIME_MODULE}/variables.tf`,
  ]
    .map(normalizedHclSource)
    .join('\n');
  const moduleMain = normalizedHclSource(`${RUNTIME_MODULE}/main.tf`);
  assert.doesNotMatch(terraform, /allUsers|allAuthenticatedUsers/u);
  assert.doesNotMatch(terraform, /google_cloud_run_v2_service_iam_/u);
  assert.doesNotMatch(terraform, /google_secret|secret_key_ref|DATABASE_URL/u);
  assert.doesNotMatch(terraform, /REDIS|STORAGE_|GCS_SIGNING|vpc_access/u);
  assert.doesNotMatch(moduleMain, /NEXT_PUBLIC_/u);
  assert.doesNotMatch(moduleMain, /^\s*(?:dynamic\s+)?"?env"?\s*\{/gmu);
  assert.doesNotMatch(
    moduleMain,
    /\b(?:cpu|memory|max_instance_request_concurrency)\b/u,
  );
});

test('Frontend runtime exposes only the six safe service and identity outputs', () => {
  const expected = [
    'platform_admin_runtime_service_account_email',
    'school_dashboard_runtime_service_account_email',
    'platform_admin_service_name',
    'platform_admin_service_uri',
    'school_dashboard_service_name',
    'school_dashboard_service_uri',
  ].sort();
  assert.deepEqual(
    outputNames(normalizedHclSource(`${RUNTIME_ROOT}/outputs.tf`)).sort(),
    expected,
  );
  assert.deepEqual(
    outputNames(normalizedHclSource(`${RUNTIME_MODULE}/outputs.tf`)).sort(),
    expected,
  );
});

test('Production Edge root is the exact governed shared-module caller', () => {
  assertRootContract(EDGE_ROOT, 'edge/production', true);
  const main = normalizedHclSource(`${EDGE_ROOT}/main.tf`);
  assert.equal(resourceAddresses(main).length, 0);
  assert.equal(
    (main.match(/^module\s+"edge_environment"\s*\{/gmu) ?? []).length,
    1,
  );
  for (const assignment of [
    ['source', '"../../modules/edge-environment"'],
    ['project_id', '"moazez-production"'],
    ['region', '"me-central2"'],
    ['environment', '"production"'],
    ['api_hostname', '"api.moazez.cloud"'],
    ['platform_admin_hostname', '"admin.moazez.cloud"'],
    ['school_dashboard_hostname', '"schools.moazez.cloud"'],
    ['api_service_name', '"moazez-production-api"'],
    ['platform_admin_service_name', '"moazez-production-platform-admin"'],
    ['school_dashboard_service_name', '"moazez-production-school-dashboard"'],
  ]) {
    assert.equal(assignmentExpression(main, assignment[0]), assignment[1]);
  }
  assert.doesNotMatch(
    main,
    /google_dns_|google_project_service|certificatemanager[.]googleapis[.]com/u,
  );
});

test('Production Edge remains default-disabled while staging gains only the tagged candidate path', () => {
  assert.deepEqual(filesInDirectory(EDGE_MODULE), MODULE_FILES);
  assert.deepEqual(
    filesInDirectory(EDGE_NONPROD_ROOT),
    [...TERRAFORM_ROOT_FILES, 'variables.tf'].sort(),
  );
  for (const file of ['.terraform.lock.hcl', 'providers.tf', 'versions.tf']) {
    assert.equal(
      normalizedSource(`${EDGE_NONPROD_ROOT}/${file}`),
      baseSource(`${EDGE_NONPROD_ROOT}/${file}`),
      `${file} changed from the governed nonprod edge baseline`,
    );
  }

  const productionMain = normalizedHclSource(`${EDGE_ROOT}/main.tf`);
  assert.equal(
    assignmentExpression(productionMain, 'candidate_edge_enabled'),
    'false',
  );
  assert.equal(
    assignmentExpression(productionMain, 'candidate_api_tag'),
    'null',
  );

  const nonprodMain = normalizedHclSource(`${EDGE_NONPROD_ROOT}/main.tf`);
  assert.equal(
    assignmentExpression(nonprodMain, 'candidate_edge_enabled'),
    'var.candidate_edge_enabled',
  );
  assert.equal(
    assignmentExpression(nonprodMain, 'candidate_api_tag'),
    'var.candidate_api_tag',
  );

  const moduleMain = normalizedHclSource(`${EDGE_MODULE}/main.tf`);
  assert.match(
    moduleMain,
    /resource\s+"google_project_service"\s+"certificate_manager"/u,
  );
  const normalNeg = resourceBlock(
    moduleMain,
    'google_compute_region_network_endpoint_group',
    'service',
  );
  assert.doesNotMatch(normalNeg, /^\s*tag\s*=/mu);
  const candidateNeg = resourceBlock(
    moduleMain,
    'google_compute_region_network_endpoint_group',
    'api_candidate',
  );
  assert.equal(
    assignmentExpression(candidateNeg, 'count'),
    'var.candidate_edge_enabled ? 1 : 0',
  );
  assert.equal(
    assignmentExpression(candidateNeg, 'tag'),
    'var.candidate_api_tag',
  );
  const candidateBackend = resourceBlock(
    moduleMain,
    'google_compute_backend_service',
    'api_candidate',
  );
  assert.equal(
    assignmentExpression(candidateBackend, 'security_policy'),
    'google_compute_security_policy.edge.self_link',
  );
  assert.match(
    moduleMain,
    /candidate_smoke_public_path\s*=\s*"\/\.well-known\/moazez\/candidate-readiness"/u,
  );
  assert.match(
    moduleMain,
    /candidate_smoke_backend_path\s*=\s*"\/api\/v1\/auth\/me"/u,
  );
  assert.equal(
    (moduleMain.match(/^resource\s+"google_compute_global_address"/gmu) ?? [])
      .length,
    1,
  );
  assert.equal(
    (
      moduleMain.match(/^resource\s+"google_compute_target_https_proxy"/gmu) ??
      []
    ).length,
    1,
  );
  assert.equal(
    (
      moduleMain.match(
        /^resource\s+"google_certificate_manager_certificate"/gmu,
      ) ?? []
    ).length,
    1,
  );
  assert.doesNotMatch(moduleMain, /resource\s+"google_dns_/u);
});

test('READMEs preserve source-only, build-time, and Dark pre-DNS boundaries', () => {
  const artifactReadme = normalizedSource(`${ARTIFACT_DOMAIN}/README.md`);
  const runtimeReadme = normalizedSource(`${RUNTIME_DOMAIN}/README.md`);
  for (const required of [
    'source-only',
    'moazez-github-production',
    'moazez-backend-main',
    'moazez-ui-artifact-builder',
    'repository-ID-scoped',
    'frontend-artifact-identity/production',
  ]) {
    assert.ok(artifactReadme.includes(required), required);
  }
  for (const required of [
    'NEXT_PUBLIC_*',
    'immutable frontend image build',
    'frontend-runtime/production',
    'Dark boundary',
    'invoker_iam_disabled=true',
    'creates no public IAM',
  ]) {
    assert.ok(runtimeReadme.includes(required), required);
  }
});

test('Stage 30C1 TAP has exactly one canonical pull-request ownership assignment', () => {
  assert.equal(
    Object.keys(ACTIVE_TAP_OWNERS).filter((file) => file === TEST_PATH).length,
    1,
  );
  assert.deepEqual(classifyTestFile(TEST_PATH), {
    file: TEST_PATH,
    kind: 'node-tap',
    owner: 'production-frontend-edge-source-governance',
    profile: 'runtime-governance',
    category: 'invariant',
    execution: 'pull-request',
  });
});

test('Committed Stage 30C1 scope remains bounded or delegates to Day-2 D1 orchestration', () => {
  const candidateFiles = candidateFilesFromCommittedRange();
  const day2D1Active = candidateFiles.some(
    (file) =>
      file.startsWith('scripts/deployment-control/') ||
      file.includes('/tests/candidate-route.tftest.hcl'),
  );
  if (day2D1Active) {
    assert.deepEqual(
      candidateFiles.filter((file) => !isDay2D1ReleaseOrchestrationPath(file)),
      [],
    );
    return;
  }
  assertStage30C1CandidateScope(candidateFiles);
});

test('Candidate scope activation accepts each domain and rejects mixed or later-stage source', () => {
  assert.equal(
    assertStage30C1CandidateScope(['src/example-future-change.ts']),
    false,
  );
  assert.equal(
    assertStage30C1CandidateScope([HISTORICAL_STAGE29_REMEDIATION_PATH]),
    false,
  );
  assert.equal(
    assertStage30C1CandidateScope([`${RUNTIME_ROOT}/variables.tf`]),
    true,
  );
  assert.equal(
    assertStage30C1CandidateScope([
      `${RUNTIME_ROOT}/variables.tf`,
      HISTORICAL_STAGE29_REMEDIATION_PATH,
    ]),
    true,
  );
  assert.equal(
    assertStage30C1CandidateScope([`${ARTIFACT_MODULE}/main.tf`]),
    true,
  );
  assert.equal(assertStage30C1CandidateScope([`${EDGE_ROOT}/main.tf`]), true);
  assert.equal(assertStage30C1CandidateScope(AUTHORIZED_STAGE30C1_PATHS), true);
  for (const candidate of [
    [`${RUNTIME_ROOT}/main.tf`, 'src/example-unrelated-change.ts'],
    [TEST_PATH, '.github/workflows/production-platform-admin-image.yml'],
    [
      `${ARTIFACT_ROOT}/main.tf`,
      'infra/gcp/frontend-release/environments/production/main.tf',
    ],
  ]) {
    assert.throws(() => assertStage30C1CandidateScope(candidate), {
      code: 'ERR_ASSERTION',
    });
  }
});
