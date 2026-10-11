'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { execFileSync } = require('node:child_process');
const { ACTIVE_TAP_OWNERS, classifyTestFile } = require('../ci/plan-ci.cjs');

const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..');
const BASE_SHA = 'c4f0c0175d09279a1e4b0fb7d0b3beab8d45faaa';
const NR11_T5A_BASE_SHA = 'e165842c1c993f0df643bbf7d2bb352012182c34';
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
const NR11_T3A_PATHS = Object.freeze([
  'infra/gcp/artifact-registry/README.md',
  'infra/gcp/artifact-registry/environments/production/teacher-web.tf',
  `${ARTIFACT_DOMAIN}/README.md`,
  `${ARTIFACT_ROOT}/teacher-web.tf`,
  'scripts/tests/stage-26c-production-foundation-source.test.cjs',
  TEST_PATH,
]);
const HISTORICAL_STAGE28_REMEDIATION_PATH =
  'scripts/tests/stage-28a-production-migration-job-source.test.cjs';
const HISTORICAL_STAGE29_REMEDIATION_PATH =
  'scripts/tests/stage-29a-production-runtime-source.test.cjs';
const PLAN_CI_PATH = 'scripts/ci/plan-ci.cjs';
const PLAN_CI_TEST_PATH = 'scripts/tests/plan-ci.test.cjs';
const DAY2_D1_HANDOFF_PATH =
  'docs/governance/day2-release-orchestration-devops-handoff.md';
const RUNTIME_CAPACITY_GOVERNANCE_PATH =
  'docs/governance/runtime-capacity-governance.md';

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
const EDGE_PRODUCTION_ROOT_FILES = Object.freeze(
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
const STUDENT_WEB_IMAGE_PATTERN =
  '^me-central2-docker[.]pkg[.]dev/moazez-production/moazez-production-containers/moazez-student-web@sha256:[a-f0-9]{64}$';
const TEACHER_WEB_IMAGE_PATTERN =
  '^me-central2-docker[.]pkg[.]dev/moazez-production/moazez-production-teacher-web/moazez-teacher-web@sha256:[a-f0-9]{64}$';
const APPROVED_TEACHER_WEB_IMAGE =
  'me-central2-docker.pkg.dev/moazez-production/moazez-production-teacher-web/moazez-teacher-web@sha256:cb15553977c1195ee15f7a0967487eb47f74ad763b66595e573b5a05a1a026da';

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
    `${EDGE_ROOT}/variables.tf`,
    `${EDGE_ROOT}/versions.tf`,
    'infra/gcp/edge/README.md',
    `${EDGE_MODULE}/main.tf`,
    `${EDGE_MODULE}/outputs.tf`,
    `${EDGE_MODULE}/variables.tf`,
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
    normalized.some((file) => file.startsWith(`${EDGE_ROOT}/`)) ||
    normalized.some((file) => file.startsWith(`${EDGE_MODULE}/`)) ||
    normalized.includes('infra/gcp/edge/README.md');
  if (!active) return false;
  assert.deepEqual(
    normalized.filter((file) => !AUTHORIZED_STAGE30C1_PATHS.includes(file)),
    [],
  );
  return true;
}

function assertCommittedStage30C1CandidateScope(candidateFiles) {
  if (
    candidateFiles.some((file) => file.endsWith('/production/teacher-web.tf'))
  ) {
    assert.deepEqual(
      candidateFiles.filter((file) => !NR11_T3A_PATHS.includes(file)),
      [],
    );
    return false;
  }

  // Connection-envelope math has its own capacity contracts. It does not
  // activate frontend release orchestration or reopen historical Stage 30C1.
  const capacityContractPaths = new Set([
    'scripts/deployment-control/runtime-capacity-control.cjs',
    'scripts/deployment-control/tests/runtime-capacity-control.test.cjs',
  ]);
  const day2D1Active = candidateFiles.some(
    (file) =>
      (file.startsWith('scripts/deployment-control/') &&
        !capacityContractPaths.has(file)) ||
      file.includes('/tests/candidate-route.tftest.hcl'),
  );
  if (day2D1Active) {
    assert.deepEqual(
      candidateFiles.filter((file) => !isDay2D1ReleaseOrchestrationPath(file)),
      [],
    );
    return false;
  }
  // A maintenance edit to this verifier alone is not a frontend source change.
  const sourceFiles = candidateFiles.filter((file) => file !== TEST_PATH);
  const stage30C1Active = sourceFiles.some(
    (file) =>
      file.startsWith(`${ARTIFACT_DOMAIN}/`) ||
      file.startsWith(`${RUNTIME_DOMAIN}/`) ||
      file.startsWith(`${EDGE_ROOT}/`) ||
      file.startsWith(`${EDGE_MODULE}/`) ||
      file === 'infra/gcp/edge/README.md',
  );
  if (!stage30C1Active) return false;
  return assertStage30C1CandidateScope(candidateFiles);
}

function isDay2D1ReleaseOrchestrationPath(file) {
  return (
    file.startsWith('infra/gcp/backend-runtime/') ||
    file.startsWith('infra/gcp/edge/') ||
    file.startsWith('scripts/deployment-control/') ||
    file === DAY2_D1_HANDOFF_PATH ||
    file === RUNTIME_CAPACITY_GOVERNANCE_PATH ||
    file === HISTORICAL_STAGE28_REMEDIATION_PATH ||
    file === HISTORICAL_STAGE29_REMEDIATION_PATH ||
    file === PLAN_CI_PATH ||
    file === PLAN_CI_TEST_PATH ||
    file === TEST_PATH
  );
}

test('Stage 30C1 domains have exactly the governed source structure and ignore policy', () => {
  assert.equal(AUTHORIZED_STAGE30C1_PATHS.length, 34);
  assert.deepEqual(
    filesInDirectory(ARTIFACT_ROOT),
    [...TERRAFORM_ROOT_FILES, 'teacher-web.tf'].sort(),
  );
  assert.deepEqual(filesInDirectory(ARTIFACT_MODULE), MODULE_FILES);
  assert.deepEqual(filesInDirectory(RUNTIME_ROOT), RUNTIME_ROOT_FILES);
  assert.deepEqual(filesInDirectory(RUNTIME_MODULE), MODULE_FILES);
  assert.deepEqual(filesInDirectory(EDGE_ROOT), EDGE_PRODUCTION_ROOT_FILES);
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
    '1391516333',
    'moazez-student-app-main',
    'Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Student-App',
    '1412551303',
    'moazez-teacher-app-main',
    'Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Teacher-App',
    'moazez-ui-artifact-builder',
    'me-central2',
    'moazez-production-containers',
  ]) {
    assert.ok(rootMain.includes(`"${value}"`), value);
  }
});

test('Artifact identity references the existing pool and owns exactly four independent frontend providers', () => {
  const main = normalizedHclSource(`${ARTIFACT_MODULE}/main.tf`);
  assert.deepEqual(resourceAddresses(main), [
    'google_artifact_registry_repository_iam_member.artifact_writer',
    'google_iam_workload_identity_pool_provider.platform_admin',
    'google_iam_workload_identity_pool_provider.school_dashboard',
    'google_iam_workload_identity_pool_provider.student',
    'google_iam_workload_identity_pool_provider.teacher',
    'google_service_account.artifact_builder',
    'google_service_account_iam_member.platform_admin_workload_identity_user',
    'google_service_account_iam_member.school_dashboard_workload_identity_user',
    'google_service_account_iam_member.student_workload_identity_user',
    'google_service_account_iam_member.teacher_workload_identity_user',
  ]);
  assert.doesNotMatch(main, /resource\s+"google_iam_workload_identity_pool"/u);
  for (const providerName of [
    'platform_admin',
    'school_dashboard',
    'student',
    'teacher',
  ]) {
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
    4,
  );
  for (const mapping of [
    '"google.subject"                = "assertion.sub"',
    '"attribute.repository"          = "assertion.repository"',
    '"attribute.repository_id"       = "assertion.repository_id"',
    '"attribute.repository_owner"    = "assertion.repository_owner"',
    '"attribute.repository_owner_id" = "assertion.repository_owner_id"',
    '"attribute.ref"                 = "assertion.ref"',
  ]) {
    assert.equal(main.split(mapping).length - 1, 4, mapping);
  }
  assert.match(
    main,
    /platform_admin_attribute_condition\s*=\s*format\([\s\S]*?var[.]platform_admin_repository_id,[\s\S]*?var[.]github_owner_id,[\s\S]*?var[.]github_allowed_ref,/u,
  );
  assert.match(
    main,
    /school_dashboard_attribute_condition\s*=\s*format\([\s\S]*?var[.]school_dashboard_repository_id,[\s\S]*?var[.]github_owner_id,[\s\S]*?var[.]github_allowed_ref,/u,
  );
  assert.match(
    main,
    /student_attribute_condition\s*=\s*format\([\s\S]*?var[.]student_repository_id,[\s\S]*?var[.]github_owner_id,[\s\S]*?var[.]github_allowed_ref,/u,
  );
  assert.match(
    main,
    /teacher_attribute_condition\s*=\s*format\([\s\S]*?var[.]teacher_repository_id,[\s\S]*?var[.]github_owner_id,[\s\S]*?var[.]github_allowed_ref,/u,
  );
  assert.doesNotMatch(main, /\|\||pull_request|repository\s*==|[*]/u);
});

test('Teacher writer root adds exactly one repository member for the existing shared builder', () => {
  const rootSource = filesInDirectory(ARTIFACT_ROOT)
    .filter((file) => file.endsWith('.tf'))
    .map((file) => normalizedHclSource(`${ARTIFACT_ROOT}/${file}`))
    .join('\n');
  assert.deepEqual(resourceAddresses(rootSource), [
    'google_artifact_registry_repository_iam_member.teacher_web_artifact_writer',
  ]);
  const teacherSource = normalizedHclSource(`${ARTIFACT_ROOT}/teacher-web.tf`);
  const writer = resourceBlock(
    teacherSource,
    'google_artifact_registry_repository_iam_member',
    'teacher_web_artifact_writer',
  );
  for (const [key, value] of Object.entries({
    project: '"moazez-production"',
    location: '"me-central2"',
    repository: '"moazez-production-teacher-web"',
    role: '"roles/artifactregistry.writer"',
    member:
      '"serviceAccount:${module.frontend_artifact_identity_environment.builder_service_account_email}"',
  })) {
    assert.equal(assignmentExpression(writer, key), value);
  }
  assert.equal((writer.match(/^\s*[a-z_]+\s*=/gmu) ?? []).length, 5);
  assert.doesNotMatch(teacherSource, /^\s*(?:module|data|import|moved)\s/mu);
  assert.doesNotMatch(
    rootSource,
    /terraform_remote_state|roles\/iam[.]serviceAccountTokenCreator|roles\/(?:owner|editor)/u,
  );
  const moduleMain = normalizedHclSource(`${ARTIFACT_MODULE}/main.tf`);
  assert.equal(
    resourceAddresses(`${rootSource}\n${moduleMain}`).filter((address) =>
      address.startsWith('google_artifact_registry_repository_iam_member.'),
    ).length,
    2,
  );
});

test('Frontend WIF provider display names are exact literals within the 32-character limit', () => {
  const main = normalizedHclSource(`${ARTIFACT_MODULE}/main.tf`);
  for (const [providerName, expectedName, expectedLength] of [
    ['platform_admin', 'MOAZEZ Platform Admin main', 26],
    ['school_dashboard', 'MOAZEZ School Dashboard main', 28],
    ['student', 'MOAZEZ Student App main', 23],
    ['teacher', 'MOAZEZ Teacher App main', 23],
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

test('Artifact identity module preserves the protected builder, four exact WIF grants, and shared repository writer', () => {
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
    ['student_workload_identity_user', 'student', 'student_repository_id'],
    ['teacher_workload_identity_user', 'teacher', 'teacher_repository_id'],
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
      'student_wif_provider_name',
      'teacher_wif_provider_name',
    ].sort(),
  );
  assert.deepEqual(
    outputNames(normalizedHclSource(`${ARTIFACT_MODULE}/outputs.tf`)).sort(),
    [
      'builder_service_account_email',
      'platform_admin_wif_provider_name',
      'school_dashboard_wif_provider_name',
      'student_wif_provider_name',
      'teacher_wif_provider_name',
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
    'moazez-student-app-main',
    '1335685284',
    '1335686453',
    '1391516333',
    'Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Student-App',
    'moazez-teacher-app-main',
    '1412551303',
    'Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Teacher-App',
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

function assertArtifactRepositoryIdentity(
  surface,
  repository,
  repositoryId,
  providerId,
) {
  const root = normalizedHclSource(`${ARTIFACT_ROOT}/main.tf`);
  const main = normalizedHclSource(`${ARTIFACT_MODULE}/main.tf`);
  const variables = normalizedHclSource(`${ARTIFACT_MODULE}/variables.tf`);
  for (const [name, value] of [
    [
      `${surface}_repository`,
      `Abdallah-Mohamed-Abdallah-AbdulRazzaq/${repository}`,
    ],
    [`${surface}_repository_id`, repositoryId],
    [`${surface}_wif_provider_id`, providerId],
  ]) {
    assert.equal(assignmentExpression(root, name), JSON.stringify(value));
    assert.equal(
      assignmentExpression(variableBlock(variables, name), 'condition'),
      `var.${name} == ${JSON.stringify(value)}`,
    );
    assert.equal(
      assignmentExpression(
        extractBlock(
          main,
          /^\s*production_contract\s*=\s*\{/mu,
          'Production contract',
        ),
        name,
      ),
      JSON.stringify(value),
    );
    assert.equal(
      assignmentExpression(
        extractBlock(
          main,
          /^\s*current_contract\s*=\s*\{/mu,
          'Current contract',
        ),
        name,
      ),
      `var.${name}`,
    );
  }
  const provider = resourceBlock(
    main,
    'google_iam_workload_identity_pool_provider',
    surface,
  );
  assert.equal(
    assignmentExpression(provider, 'workload_identity_pool_provider_id'),
    `var.${surface}_wif_provider_id`,
  );
  assert.equal(
    assignmentExpression(provider, 'attribute_condition'),
    `local.${surface}_attribute_condition`,
  );
  assert.match(
    provider,
    /issuer_uri\s*=\s*"https:\/\/token[.]actions[.]githubusercontent[.]com"/u,
  );
  assert.match(provider, /condition\s*=\s*local[.]governed_contract/u);
  const condition = assignmentExpression(
    main,
    `${surface}_attribute_condition`,
  );
  assert.equal(condition, 'format(');
  assert.ok(
    main.includes(
      [
        `  ${surface}_attribute_condition = format(`,
        '    "assertion.repository_id == \\"%s\\" && assertion.repository_owner_id == \\"%s\\" && assertion.ref == \\"%s\\"",',
        `    var.${surface}_repository_id,`,
        '    var.github_owner_id,',
        '    var.github_allowed_ref,',
        '  )',
      ].join('\n'),
    ),
  );
  assert.equal(
    (main.match(/^resource\s+"google_service_account"\s+/gmu) ?? []).length,
    1,
  );
  assert.equal(
    (
      main.match(
        /^resource\s+"google_artifact_registry_repository_iam_member"\s+/gmu,
      ) ?? []
    ).length,
    1,
  );
  assert.doesNotMatch(
    main,
    /^resource\s+"google_iam_workload_identity_pool"\s+/mu,
  );
}

for (const [surface, repository, repositoryId, providerId] of [
  ['student', 'Moazez-Student-App', '1391516333', 'moazez-student-app-main'],
  ['teacher', 'Moazez-Teacher-App', '1412551303', 'moazez-teacher-app-main'],
]) {
  test(`${repository} WIF uses the exact repository-ID condition and shared builder principal`, () => {
    assertArtifactRepositoryIdentity(
      surface,
      repository,
      repositoryId,
      providerId,
    );
  });
}

test('Frontend runtime root has only four required immutable Production image inputs', () => {
  assertRootContract(RUNTIME_ROOT, 'frontend-runtime/production', true);
  const variables = normalizedHclSource(`${RUNTIME_ROOT}/variables.tf`);
  assert.deepEqual(variableNames(variables), [
    'platform_admin_image',
    'school_dashboard_image',
    'student_web_image',
    'teacher_web_image',
  ]);
  const expectations = [
    ['platform_admin_image', PLATFORM_ADMIN_IMAGE_PATTERN],
    ['school_dashboard_image', SCHOOL_DASHBOARD_IMAGE_PATTERN],
    ['student_web_image', STUDENT_WEB_IMAGE_PATTERN],
    ['teacher_web_image', TEACHER_WEB_IMAGE_PATTERN],
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
    [
      new RegExp(STUDENT_WEB_IMAGE_PATTERN, 'u'),
      `me-central2-docker.pkg.dev/moazez-production/moazez-production-containers/moazez-student-web@sha256:${validDigest}`,
    ],
    [
      new RegExp(TEACHER_WEB_IMAGE_PATTERN, 'u'),
      `me-central2-docker.pkg.dev/moazez-production/moazez-production-teacher-web/moazez-teacher-web@sha256:${validDigest}`,
    ],
  ];
  for (const [pattern, valid] of cases) {
    assert.equal(pattern.test(valid), true);
    for (const invalid of [
      valid.replace(/@sha256:.+$/u, ':latest'),
      valid.replace(/@sha256:.+$/u, ':source-sha'),
      valid.replace('moazez-production/', 'moazez-nonprod-91001421934/'),
      valid.replace(
        /\/moazez-production-(?:containers|teacher-web)\//u,
        '/moazez-staging-containers/',
      ),
      valid.replace(/a$/u, 'A'),
      valid.slice(0, -1),
      valid.replace(
        /\/moazez-(?:platform-admin|school-dashboard|student-web|teacher-web)@/u,
        '/wrong-package@',
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
    'moazez-student-web-runtime',
    'moazez-teacher-web-runtime',
    'moazez-production-platform-admin',
    'moazez-production-school-dashboard',
    'moazez-production-student-web',
    'moazez-production-teacher-web',
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
    'google_cloud_run_v2_service.student_web',
    'google_cloud_run_v2_service.teacher_web',
    'google_service_account.platform_admin_runtime',
    'google_service_account.school_dashboard_runtime',
    'google_service_account.student_web_runtime',
    'google_service_account.teacher_web_runtime',
    'google_service_account_iam_member.platform_admin_iac_deployer_act_as',
    'google_service_account_iam_member.school_dashboard_iac_deployer_act_as',
    'google_service_account_iam_member.student_web_iac_deployer_act_as',
    'google_service_account_iam_member.teacher_web_iac_deployer_act_as',
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
    [
      'student_web_runtime',
      'var.student_web_runtime_service_account_id',
      'Moazez Student Web Runtime',
    ],
    [
      'teacher_web_runtime',
      'var.teacher_web_runtime_service_account_id',
      'Moazez Teacher Web Runtime',
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
    ['student_web_iac_deployer_act_as', 'student_web_runtime'],
    ['teacher_web_iac_deployer_act_as', 'teacher_web_runtime'],
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
    4,
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

test('All four frontend Cloud Run services have exact Dark runtime settings and actAs dependencies', () => {
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
  assertFrontendService(main, {
    resourceName: 'student_web',
    serviceName: 'var.student_web_service_name',
    identity: 'google_service_account.student_web_runtime.email',
    image: 'var.student_web_image',
    dependency: 'student_web_iac_deployer_act_as',
  });
  assertFrontendService(main, {
    resourceName: 'teacher_web',
    serviceName: 'var.teacher_web_service_name',
    identity: 'google_service_account.teacher_web_runtime.email',
    image: 'var.teacher_web_image',
    dependency: 'teacher_web_iac_deployer_act_as',
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

test('Frontend runtime exposes only the twelve safe service and identity outputs', () => {
  const expected = [
    'platform_admin_runtime_service_account_email',
    'school_dashboard_runtime_service_account_email',
    'platform_admin_service_name',
    'platform_admin_service_uri',
    'school_dashboard_service_name',
    'school_dashboard_service_uri',
    'student_web_runtime_service_account_email',
    'student_web_service_name',
    'student_web_service_uri',
    'teacher_web_runtime_service_account_email',
    'teacher_web_service_name',
    'teacher_web_service_uri',
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

test('Student runtime inputs and governed tuple bind the exact service and immutable package', () => {
  const root = normalizedHclSource(`${RUNTIME_ROOT}/main.tf`);
  const main = normalizedHclSource(`${RUNTIME_MODULE}/main.tf`);
  const variables = normalizedHclSource(`${RUNTIME_MODULE}/variables.tf`);
  for (const [name, value] of [
    ['student_web_runtime_service_account_id', 'moazez-student-web-runtime'],
    ['student_web_service_name', 'moazez-production-student-web'],
  ]) {
    assert.equal(assignmentExpression(root, name), JSON.stringify(value));
    assert.equal(
      assignmentExpression(variableBlock(variables, name), 'condition'),
      `var.${name} == ${JSON.stringify(value)}`,
    );
    assert.equal(
      assignmentExpression(
        extractBlock(
          main,
          /^\s*current_contract\s*=\s*\{/mu,
          'Current contract',
        ),
        name,
      ),
      `var.${name}`,
    );
    assert.equal(
      assignmentExpression(
        extractBlock(
          main,
          /^\s*production_contract\s*=\s*\{/mu,
          'Production contract',
        ),
        name,
      ),
      JSON.stringify(value),
    );
  }
  assert.equal(
    assignmentExpression(root, 'student_web_image'),
    'var.student_web_image',
  );
  assert.deepEqual(
    validationPatterns(variableBlock(variables, 'student_web_image')),
    [STUDENT_WEB_IMAGE_PATTERN],
  );
  assert.match(main, /student_web_image_matches\s*=\s*can\(regex\(/u);
  assert.match(
    resourceBlock(main, 'google_cloud_run_v2_service', 'student_web'),
    /condition\s*=\s*local[.]student_web_image_matches/u,
  );
  assert.doesNotMatch(
    extractBlock(
      main,
      /^\s*production_contract\s*=\s*\{/mu,
      'Production contract',
    ),
    /student_web_image/u,
  );
});

test('Teacher runtime binds the dedicated repository, approved digest, and complete Production tuple', () => {
  const root = normalizedHclSource(`${RUNTIME_ROOT}/main.tf`);
  const main = normalizedHclSource(`${RUNTIME_MODULE}/main.tf`);
  const variables = normalizedHclSource(`${RUNTIME_MODULE}/variables.tf`);
  for (const [name, value] of [
    ['teacher_web_runtime_service_account_id', 'moazez-teacher-web-runtime'],
    ['teacher_web_service_name', 'moazez-production-teacher-web'],
  ]) {
    assert.equal(assignmentExpression(root, name), JSON.stringify(value));
    assert.equal(
      assignmentExpression(variableBlock(variables, name), 'condition'),
      `var.${name} == ${JSON.stringify(value)}`,
    );
    for (const [contract, expression] of [
      ['current_contract', `var.${name}`],
      ['production_contract', JSON.stringify(value)],
    ]) {
      assert.equal(
        assignmentExpression(
          extractBlock(
            main,
            new RegExp(`^\\s*${contract}\\s*=\\s*\\{`, 'mu'),
            contract,
          ),
          name,
        ),
        expression,
      );
    }
  }
  assert.equal(
    assignmentExpression(root, 'teacher_web_image'),
    'var.teacher_web_image',
  );
  for (const source of [
    normalizedHclSource(`${RUNTIME_ROOT}/variables.tf`),
    variables,
  ]) {
    const block = variableBlock(source, 'teacher_web_image');
    assert.equal(assignmentExpression(block, 'type'), 'string');
    assert.doesNotMatch(block, /^\s*default\s*=/mu);
    assert.deepEqual(validationPatterns(block), [TEACHER_WEB_IMAGE_PATTERN]);
    const approvedPins = [
      ...block.matchAll(
        /condition\s*=\s*var[.]teacher_web_image\s*==\s*"([^"]+)"/gu,
      ),
    ].map((match) => match[1]);
    assert.deepEqual(approvedPins, [APPROVED_TEACHER_WEB_IMAGE]);
  }
  const imagePattern = new RegExp(TEACHER_WEB_IMAGE_PATTERN, 'u');
  assert.equal(imagePattern.test(APPROVED_TEACHER_WEB_IMAGE), true);
  for (const invalid of [
    APPROVED_TEACHER_WEB_IMAGE.replace(
      '/moazez-production-teacher-web/',
      '/moazez-production-containers/',
    ),
    APPROVED_TEACHER_WEB_IMAGE.replace(
      'me-central2-docker',
      'us-central1-docker',
    ),
    APPROVED_TEACHER_WEB_IMAGE.replace(
      '/moazez-teacher-web@',
      '/moazez-student-web@',
    ),
    `${APPROVED_TEACHER_WEB_IMAGE}:latest`,
  ])
    assert.equal(imagePattern.test(invalid), false, invalid);
  assert.match(main, /teacher_web_image_matches\s*=\s*can\(regex\(/u);
  assert.ok(main.includes(`"${TEACHER_WEB_IMAGE_PATTERN}"`));
  for (const [type, name] of [
    ['google_service_account', 'teacher_web_runtime'],
    ['google_service_account_iam_member', 'teacher_web_iac_deployer_act_as'],
    ['google_cloud_run_v2_service', 'teacher_web'],
  ]) {
    assert.match(
      resourceBlock(main, type, name),
      /condition\s*=\s*local[.]governed_contract/u,
    );
  }
  assert.match(
    resourceBlock(main, 'google_cloud_run_v2_service', 'teacher_web'),
    /condition\s*=\s*local[.]teacher_web_image_matches/u,
  );
  for (const [name, value] of [
    [
      'teacher_web_runtime_service_account_email',
      'google_service_account.teacher_web_runtime.email',
    ],
    [
      'teacher_web_service_name',
      'google_cloud_run_v2_service.teacher_web.name',
    ],
    ['teacher_web_service_uri', 'google_cloud_run_v2_service.teacher_web.uri'],
  ]) {
    for (const [sourcePath, expectedValue] of [
      [`${RUNTIME_MODULE}/outputs.tf`, value],
      [
        `${RUNTIME_ROOT}/outputs.tf`,
        `module.frontend_runtime_environment.${name}`,
      ],
    ]) {
      assert.equal(
        assignmentExpression(
          extractBlock(
            normalizedHclSource(sourcePath),
            new RegExp(`^output "${name}"\\s*\\{`, 'mu'),
            name,
          ),
          'value',
        ),
        expectedValue,
      );
    }
  }
});

test('NR11-T5A source adds exactly three Teacher resources and preserves existing frontend source', () => {
  const baseline = (file) => git('show', `${NR11_T5A_BASE_SHA}:${file}`);
  const baselineMain = baseline(`${RUNTIME_MODULE}/main.tf`);
  const main = normalizedHclSource(`${RUNTIME_MODULE}/main.tf`);
  const existingAddresses = resourceAddresses(baselineMain);
  assert.equal(existingAddresses.length, 9);
  assert.deepEqual(
    resourceAddresses(main),
    [
      ...existingAddresses,
      'google_service_account.teacher_web_runtime',
      'google_service_account_iam_member.teacher_web_iac_deployer_act_as',
      'google_cloud_run_v2_service.teacher_web',
    ].sort(),
  );
  for (const address of existingAddresses) {
    const [type, name] = address.split('.');
    assert.equal(
      resourceBlock(main, type, name),
      resourceBlock(baselineMain, type, name),
      address,
    );
  }
  for (const sourcePath of [
    `${RUNTIME_ROOT}/variables.tf`,
    `${RUNTIME_MODULE}/variables.tf`,
    `${RUNTIME_ROOT}/outputs.tf`,
    `${RUNTIME_MODULE}/outputs.tf`,
  ]) {
    const previous = baseline(sourcePath);
    const current = normalizedHclSource(sourcePath);
    const blockType = sourcePath.endsWith('/variables.tf')
      ? 'variable'
      : 'output';
    const names =
      blockType === 'variable'
        ? variableNames(previous)
        : outputNames(previous);
    for (const name of names) {
      const header = new RegExp(`^${blockType} "${name}"\\s*\\{`, 'mu');
      assert.equal(
        extractBlock(current, header, name),
        extractBlock(previous, header, name),
        `${sourcePath}: ${name}`,
      );
    }
  }
  const rootPath = `${RUNTIME_ROOT}/main.tf`;
  const previousRoot = baseline(rootPath);
  const currentRoot = normalizedHclSource(rootPath);
  for (const match of previousRoot.matchAll(
    /^\s*(\w+)\s*=\s*([^\r\n]+)\s*$/gmu,
  )) {
    assert.equal(
      assignmentExpression(currentRoot, match[1]),
      match[2].trim(),
      match[1],
    );
  }
  for (const sourcePath of [
    `${RUNTIME_DOMAIN}/.gitignore`,
    `${RUNTIME_ROOT}/versions.tf`,
    `${RUNTIME_ROOT}/providers.tf`,
    `${RUNTIME_ROOT}/.terraform.lock.hcl`,
  ])
    assert.equal(
      normalizedSource(sourcePath),
      baseline(sourcePath),
      sourcePath,
    );
  assert.doesNotMatch(main, /^\s*(?:data|import|moved|removed)\s+\b/mu);
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
    ['student_hostname', '"student.moazez.cloud"'],
    ['api_service_name', '"moazez-production-api"'],
    ['platform_admin_service_name', '"moazez-production-platform-admin"'],
    ['school_dashboard_service_name', '"moazez-production-school-dashboard"'],
    ['student_service_name', '"moazez-production-student-web"'],
  ]) {
    assert.equal(assignmentExpression(main, assignment[0]), assignment[1]);
  }
  assert.doesNotMatch(
    main,
    /google_dns_|google_project_service|certificatemanager[.]googleapis[.]com/u,
  );
});

test('Production Edge defaults disabled and supports only governed explicit Candidate inputs', () => {
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
    'var.candidate_edge_enabled',
  );
  assert.equal(
    assignmentExpression(productionMain, 'candidate_smoke_route_enabled'),
    'var.candidate_smoke_route_enabled',
  );
  assert.equal(
    assignmentExpression(productionMain, 'candidate_api_tag'),
    'var.candidate_api_tag',
  );

  const productionVariables = normalizedHclSource(`${EDGE_ROOT}/variables.tf`);
  assert.deepEqual(variableNames(productionVariables).sort(), [
    'candidate_api_tag',
    'candidate_edge_enabled',
    'candidate_smoke_route_enabled',
  ]);
  const productionCandidateEnabled = variableBlock(
    productionVariables,
    'candidate_edge_enabled',
  );
  assert.equal(
    assignmentExpression(productionCandidateEnabled, 'type'),
    'bool',
  );
  assert.equal(
    assignmentExpression(productionCandidateEnabled, 'default'),
    'false',
  );
  const productionCandidateSmokeRoute = variableBlock(
    productionVariables,
    'candidate_smoke_route_enabled',
  );
  assert.equal(
    assignmentExpression(productionCandidateSmokeRoute, 'type'),
    'bool',
  );
  assert.equal(
    assignmentExpression(productionCandidateSmokeRoute, 'default'),
    'null',
  );
  assert.equal(
    assignmentExpression(productionCandidateSmokeRoute, 'nullable'),
    'true',
  );
  const productionCandidateTag = variableBlock(
    productionVariables,
    'candidate_api_tag',
  );
  assert.equal(assignmentExpression(productionCandidateTag, 'type'), 'string');
  assert.equal(assignmentExpression(productionCandidateTag, 'default'), 'null');
  assert.equal(
    assignmentExpression(productionCandidateTag, 'nullable'),
    'true',
  );
  assert.deepEqual(validationPatterns(productionCandidateTag), [
    '^candidate-[a-f0-9]{12}(-r[1-9][0-9]{0,14})?$',
  ]);

  const nonprodMain = normalizedHclSource(`${EDGE_NONPROD_ROOT}/main.tf`);
  assert.equal(
    assignmentExpression(nonprodMain, 'candidate_edge_enabled'),
    'var.candidate_edge_enabled',
  );
  assert.equal(
    assignmentExpression(nonprodMain, 'candidate_smoke_route_enabled'),
    'var.candidate_smoke_route_enabled',
  );
  assert.equal(
    assignmentExpression(nonprodMain, 'candidate_api_tag'),
    'var.candidate_api_tag',
  );
  const nonprodVariables = normalizedHclSource(
    `${EDGE_NONPROD_ROOT}/variables.tf`,
  );
  assert.deepEqual(variableNames(nonprodVariables).sort(), [
    'candidate_api_tag',
    'candidate_edge_enabled',
    'candidate_smoke_route_enabled',
  ]);
  const nonprodCandidateSmokeRoute = variableBlock(
    nonprodVariables,
    'candidate_smoke_route_enabled',
  );
  assert.equal(
    assignmentExpression(nonprodCandidateSmokeRoute, 'type'),
    'bool',
  );
  assert.equal(
    assignmentExpression(nonprodCandidateSmokeRoute, 'default'),
    'null',
  );
  assert.equal(
    assignmentExpression(nonprodCandidateSmokeRoute, 'nullable'),
    'true',
  );

  const moduleMain = normalizedHclSource(`${EDGE_MODULE}/main.tf`);
  const moduleVariables = normalizedHclSource(`${EDGE_MODULE}/variables.tf`);
  const moduleOutputs = normalizedHclSource(`${EDGE_MODULE}/outputs.tf`);
  assert.match(
    moduleMain,
    /resource\s+"google_project_service"\s+"certificate_manager"/u,
  );
  assert.match(
    moduleMain,
    /governed_candidate_environments\s*=\s*\["staging", "production"\]/u,
  );
  assert.match(
    moduleMain,
    /contains\(local[.]governed_candidate_environments, var[.]environment\)/u,
  );
  assert.match(
    moduleMain,
    /effective_candidate_smoke_route_enabled\s*=\s*\(\s*var[.]candidate_smoke_route_enabled\s*==\s*null\s*\?\s*var[.]candidate_edge_enabled\s*:\s*var[.]candidate_smoke_route_enabled\s*\)/u,
  );
  assert.match(
    moduleMain,
    /candidate_resource_contract_valid\s*=\s*var[.]candidate_edge_enabled\s*\?\s*\([\s\S]*?var[.]candidate_api_tag\s*!=\s*null[\s\S]*?regex\("\^candidate-\[a-f0-9\]\{12\}\(-r\[1-9\]\[0-9\]\{0,14\}\)\?\$"[\s\S]*?\)\s*:\s*var[.]candidate_api_tag\s*==\s*null/u,
  );
  assert.match(
    moduleMain,
    /candidate_smoke_route_contract_valid\s*=\s*\(\s*!local[.]effective_candidate_smoke_route_enabled\s*\|\|\s*var[.]candidate_edge_enabled\s*\)/u,
  );
  assert.match(
    moduleMain,
    /candidate_smoke_route_render_enabled\s*=\s*\(\s*local[.]effective_candidate_smoke_route_enabled\s*&&\s*var[.]candidate_edge_enabled\s*\)/u,
  );
  assert.match(
    moduleMain,
    /candidate_edge_contract_valid\s*=\s*\(\s*local[.]candidate_resource_contract_valid\s*&&\s*local[.]candidate_smoke_route_contract_valid\s*\)/u,
  );
  assert.equal(
    (
      moduleMain.match(
        /^\s*candidate_neg_name\s*=\s*"\$\{local[.]name_prefix\}-api-/gmu,
      ) ?? []
    ).length,
    1,
  );
  assert.match(
    moduleMain,
    /candidate_neg_name_valid\s*=\s*\([\s\S]*?length\(local[.]candidate_neg_name\)\s*>=\s*1[\s\S]*?length\(local[.]candidate_neg_name\)\s*<=\s*63[\s\S]*?\^\[a-z\]\(\?:\[-a-z0-9\]\{0,61\}\[a-z0-9\]\)\?\$/u,
  );
  const moduleCandidateTag = variableBlock(
    moduleVariables,
    'candidate_api_tag',
  );
  const moduleCandidateSmokeRoute = variableBlock(
    moduleVariables,
    'candidate_smoke_route_enabled',
  );
  assert.equal(assignmentExpression(moduleCandidateSmokeRoute, 'type'), 'bool');
  assert.equal(
    assignmentExpression(moduleCandidateSmokeRoute, 'default'),
    'null',
  );
  assert.equal(
    assignmentExpression(moduleCandidateSmokeRoute, 'nullable'),
    'true',
  );
  assert.deepEqual(validationPatterns(moduleCandidateTag), [
    '^candidate-[a-f0-9]{12}(-r[1-9][0-9]{0,14})?$',
  ]);
  assert.doesNotMatch(moduleVariables, /staging-only|staging candidate/iu);
  assert.doesNotMatch(moduleOutputs, /staging-only|staging candidate/iu);
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
  assert.equal(
    assignmentExpression(candidateNeg, 'name'),
    'local.candidate_neg_name',
  );
  const candidateNegLifecycle = extractBlock(
    candidateNeg,
    /^\s*lifecycle\s*\{/mu,
    'Candidate NEG lifecycle',
  );
  assert.equal(
    assignmentExpression(candidateNegLifecycle, 'create_before_destroy'),
    'true',
  );
  assert.match(candidateNegLifecycle, /precondition\s*\{/u);
  assert.match(candidateNegLifecycle, /var[.]candidate_api_tag\s*!=\s*null/u);
  assert.match(candidateNegLifecycle, /local[.]candidate_neg_name_valid/u);
  const candidateBackend = resourceBlock(
    moduleMain,
    'google_compute_backend_service',
    'api_candidate',
  );
  assert.equal(
    assignmentExpression(candidateBackend, 'security_policy'),
    'google_compute_security_policy.edge.self_link',
  );
  assert.equal(
    assignmentExpression(candidateBackend, 'count'),
    'var.candidate_edge_enabled ? 1 : 0',
  );
  assert.equal(
    assignmentExpression(candidateBackend, 'name'),
    '"${local.name_prefix}-api-candidate-backend"',
  );
  assert.equal(
    assignmentExpression(candidateBackend, 'group'),
    'google_compute_region_network_endpoint_group.api_candidate[0].id',
  );
  assert.equal(assignmentExpression(candidateBackend, 'protocol'), '"HTTP"');
  assert.equal(
    assignmentExpression(candidateBackend, 'load_balancing_scheme'),
    '"EXTERNAL_MANAGED"',
  );
  assert.match(
    candidateBackend,
    /custom_request_headers\s*=\s*\[[\s\S]*?"X-Moazez-Client-IP:\{client_ip_address\}"/u,
  );
  assert.match(
    moduleMain,
    /candidate_smoke_public_path\s*=\s*"\/\.well-known\/moazez\/candidate-readiness"/u,
  );
  assert.match(
    moduleMain,
    /candidate_smoke_backend_path\s*=\s*"\/api\/v1\/auth\/me"/u,
  );
  const urlMap = resourceBlock(moduleMain, 'google_compute_url_map', 'edge');
  assert.match(
    urlMap,
    /for_each\s*=\s*local[.]candidate_smoke_route_render_enabled\s*\?\s*\[local[.]candidate_smoke_public_path\]\s*:\s*\[\]/u,
  );
  assert.match(
    urlMap,
    /paths\s*=\s*\[path_rule[.]value\][\s\S]*?service\s*=\s*google_compute_backend_service[.]api_candidate\[0\][.]id[\s\S]*?path_prefix_rewrite\s*=\s*local[.]candidate_smoke_backend_path/u,
  );
  const candidateSmokePublicPathOutput = extractBlock(
    moduleOutputs,
    /^output\s+"candidate_smoke_public_path"\s*\{/mu,
    'candidate_smoke_public_path output',
  );
  const candidateSmokeBackendPathOutput = extractBlock(
    moduleOutputs,
    /^output\s+"candidate_smoke_backend_path"\s*\{/mu,
    'candidate_smoke_backend_path output',
  );
  assert.equal(
    assignmentExpression(candidateSmokePublicPathOutput, 'value'),
    'local.candidate_smoke_route_render_enabled ? local.candidate_smoke_public_path : null',
  );
  assert.equal(
    assignmentExpression(candidateSmokeBackendPathOutput, 'value'),
    'local.candidate_smoke_route_render_enabled ? local.candidate_smoke_backend_path : null',
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
    2,
  );
  assert.doesNotMatch(moduleMain, /resource\s+"google_dns_/u);
  assert.deepEqual(
    resourceAddresses(moduleMain),
    [
      'google_certificate_manager_certificate.edge',
      'google_certificate_manager_certificate.student',
      'google_certificate_manager_certificate_map.edge',
      'google_certificate_manager_certificate_map_entry.host',
      'google_certificate_manager_certificate_map_entry.student',
      'google_compute_backend_service.api_candidate',
      'google_compute_backend_service.service',
      'google_compute_global_address.edge',
      'google_compute_global_forwarding_rule.https',
      'google_compute_region_network_endpoint_group.api_candidate',
      'google_compute_region_network_endpoint_group.service',
      'google_compute_security_policy.edge',
      'google_compute_target_https_proxy.edge',
      'google_compute_url_map.edge',
      'google_project_service.certificate_manager',
    ].sort(),
  );
});

test('Student Edge is Production-only and reuses the governed backend and route', () => {
  const main = normalizedHclSource(`${EDGE_MODULE}/main.tf`);
  const variables = normalizedHclSource(`${EDGE_MODULE}/variables.tf`);
  const production = normalizedHclSource(`${EDGE_ROOT}/main.tf`);
  const nonprod = normalizedHclSource(`${EDGE_NONPROD_ROOT}/main.tf`);
  const outputs = normalizedHclSource(`${EDGE_MODULE}/outputs.tf`);
  const rootOutputs = normalizedHclSource(`${EDGE_ROOT}/outputs.tf`);
  for (const name of ['student_hostname', 'student_service_name']) {
    const input = variableBlock(variables, name);
    assert.equal(assignmentExpression(input, 'type'), 'string');
    assert.equal(assignmentExpression(input, 'default'), 'null');
    assert.equal(assignmentExpression(input, 'nullable'), 'true');
    assert.doesNotMatch(nonprod, new RegExp(`^\\s*${name}\\s*=`, 'mu'));
  }
  assert.equal(
    assignmentExpression(production, 'student_hostname'),
    '"student.moazez.cloud"',
  );
  assert.equal(
    assignmentExpression(production, 'student_service_name'),
    '"moazez-production-student-web"',
  );
  assert.doesNotMatch(
    nonprod,
    /student[.]moazez[.]cloud|staging-student|student_service_name/u,
  );
  for (const expected of [
    /student_inputs_are_null\s*=\s*\(\s*var[.]student_hostname\s*==\s*null\s*&&\s*var[.]student_service_name\s*==\s*null/u,
    /student_inputs_are_exact\s*=\s*\(\s*var[.]student_hostname\s*==\s*"student[.]moazez[.]cloud"\s*&&\s*var[.]student_service_name\s*==\s*"moazez-production-student-web"/u,
    /student_contract_valid\s*=\s*\(\s*var[.]environment\s*==\s*"production"\s*\?\s*local[.]student_inputs_are_exact\s*:\s*local[.]student_inputs_are_null/u,
    /student_edge_enabled\s*=\s*\(\s*var[.]environment\s*==\s*"production"\s*&&\s*local[.]student_inputs_are_exact/u,
  ])
    assert.match(main, expected);
  const urlMap = resourceBlock(main, 'google_compute_url_map', 'edge');
  assert.match(urlMap, /condition\s*=\s*local[.]student_contract_valid/u);
  const hostnames = extractBlock(
    main,
    /^\s*hostnames\s*=\s*\{/mu,
    'existing hostnames',
  );
  assert.deepEqual(
    [...hostnames.matchAll(/^\s*(api|admin|schools)\s*=\s*var[.]\w+/gmu)].map(
      (match) => match[1],
    ),
    ['api', 'admin', 'schools'],
  );
  assert.doesNotMatch(hostnames, /student/u);
  assert.match(
    main,
    /cloud_run_services\s*=\s*merge\(\{[\s\S]*?student_edge_enabled\s*\?\s*\{\s*student\s*=\s*var[.]student_service_name\s*\}\s*:\s*\{\}/u,
  );
  const neg = resourceBlock(
    main,
    'google_compute_region_network_endpoint_group',
    'service',
  );
  const backend = resourceBlock(
    main,
    'google_compute_backend_service',
    'service',
  );
  assert.equal(
    assignmentExpression(neg, 'for_each'),
    'local.cloud_run_services',
  );
  assert.equal(
    assignmentExpression(neg, 'name'),
    '"${local.name_prefix}-${each.key}-neg"',
  );
  assert.equal(
    assignmentExpression(backend, 'for_each'),
    'local.cloud_run_services',
  );
  assert.equal(
    assignmentExpression(backend, 'name'),
    '"${local.name_prefix}-${each.key}-backend"',
  );
  assert.equal(assignmentExpression(backend, 'protocol'), '"HTTP"');
  assert.equal(
    assignmentExpression(backend, 'load_balancing_scheme'),
    '"EXTERNAL_MANAGED"',
  );
  assert.equal(
    assignmentExpression(backend, 'security_policy'),
    'google_compute_security_policy.edge.self_link',
  );
  assert.match(
    backend,
    /custom_request_headers\s*=\s*each[.]key\s*==\s*"api"\s*\?[\s\S]*?\]\s*:\s*\[\]/u,
  );
  for (const [hostname, matcher] of [
    ['api_hostname', 'api'],
    ['platform_admin_hostname', 'admin'],
    ['school_dashboard_hostname', 'schools'],
  ]) {
    assert.match(
      urlMap,
      new RegExp(
        `hosts\\s*=\\s*\\[var[.]${hostname}\\]\\s*path_matcher\\s*=\\s*"${matcher}"`,
        'u',
      ),
    );
    assert.match(
      urlMap,
      new RegExp(
        `name\\s*=\\s*"${matcher}"\\s*default_service\\s*=\\s*google_compute_backend_service[.]service\\["${matcher}"\\][.]id`,
        'u',
      ),
    );
  }
  assert.match(
    urlMap,
    /dynamic\s+"host_rule"\s*\{\s*for_each\s*=\s*local[.]student_edge_enabled\s*\?\s*\[var[.]student_hostname\]\s*:\s*\[\]/u,
  );
  assert.match(
    urlMap,
    /hosts\s*=\s*\[host_rule[.]value\]\s*path_matcher\s*=\s*"student"/u,
  );
  assert.match(
    urlMap,
    /dynamic\s+"path_matcher"\s*\{\s*for_each\s*=\s*local[.]student_edge_enabled\s*\?\s*\["student"\]\s*:\s*\[\]/u,
  );
  assert.match(
    urlMap,
    /default_service\s*=\s*google_compute_backend_service[.]service\["student"\][.]id/u,
  );
  assert.equal(
    assignmentExpression(main, 'name_prefix'),
    '"moazez-${var.environment}"',
  );
  assert.equal(assignmentExpression(production, 'environment'), '"production"');
  for (const name of ['serverless_neg_names', 'backend_service_names']) {
    assert.match(outputs, new RegExp(`^output "${name}"`, 'mu'));
    assert.match(rootOutputs, new RegExp(`^output "${name}"`, 'mu'));
  }
});

test('Student TLS uses a separate conditional certificate and existing map', () => {
  const main = normalizedHclSource(`${EDGE_MODULE}/main.tf`);
  const outputs = normalizedHclSource(`${EDGE_MODULE}/outputs.tf`);
  const rootOutputs = normalizedHclSource(`${EDGE_ROOT}/outputs.tf`);
  const edgeCertificate = resourceBlock(
    main,
    'google_certificate_manager_certificate',
    'edge',
  );
  assert.equal(
    assignmentExpression(edgeCertificate, 'name'),
    '"${local.name_prefix}-edge-cert"',
  );
  assert.equal(
    assignmentExpression(edgeCertificate, 'domains'),
    'values(local.hostnames)',
  );
  const studentCertificate = resourceBlock(
    main,
    'google_certificate_manager_certificate',
    'student',
  );
  assert.equal(
    assignmentExpression(studentCertificate, 'count'),
    'local.student_edge_enabled ? 1 : 0',
  );
  assert.equal(
    assignmentExpression(studentCertificate, 'name'),
    '"${local.name_prefix}-student-cert"',
  );
  assert.equal(
    assignmentExpression(studentCertificate, 'location'),
    '"global"',
  );
  assert.equal(
    assignmentExpression(studentCertificate, 'domains'),
    '[var.student_hostname]',
  );
  assert.match(
    studentCertificate,
    /google_project_service[.]certificate_manager/u,
  );
  const oldEntry = resourceBlock(
    main,
    'google_certificate_manager_certificate_map_entry',
    'host',
  );
  assert.equal(assignmentExpression(oldEntry, 'for_each'), 'local.hostnames');
  assert.equal(
    assignmentExpression(oldEntry, 'certificates'),
    '[google_certificate_manager_certificate.edge.id]',
  );
  const studentEntry = resourceBlock(
    main,
    'google_certificate_manager_certificate_map_entry',
    'student',
  );
  assert.equal(
    assignmentExpression(studentEntry, 'count'),
    'local.student_edge_enabled ? 1 : 0',
  );
  assert.equal(
    assignmentExpression(studentEntry, 'map'),
    'google_certificate_manager_certificate_map.edge.name',
  );
  assert.equal(
    assignmentExpression(studentEntry, 'hostname'),
    'var.student_hostname',
  );
  assert.equal(
    assignmentExpression(studentEntry, 'certificates'),
    '[google_certificate_manager_certificate.student[0].id]',
  );
  const proxy = resourceBlock(
    main,
    'google_compute_target_https_proxy',
    'edge',
  );
  assert.match(
    proxy,
    /google_certificate_manager_certificate_map_entry[.]host/u,
  );
  assert.match(
    proxy,
    /google_certificate_manager_certificate_map_entry[.]student/u,
  );
  for (const type of [
    'google_compute_global_address',
    'google_compute_security_policy',
    'google_compute_url_map',
    'google_compute_target_https_proxy',
    'google_compute_global_forwarding_rule',
    'google_certificate_manager_certificate_map',
  ]) {
    assert.equal(
      (main.match(new RegExp(`^resource "${type}"`, 'gmu')) ?? []).length,
      1,
      type,
    );
  }
  assert.equal(
    (
      main.match(/^resource "google_certificate_manager_certificate"\s+/gmu) ??
      []
    ).length,
    2,
  );
  assert.equal(
    assignmentExpression(
      extractBlock(
        outputs,
        /^output "certificate_name"\s*\{/mu,
        'old certificate output',
      ),
      'value',
    ),
    'google_certificate_manager_certificate.edge.name',
  );
  assert.equal(
    assignmentExpression(
      extractBlock(
        outputs,
        /^output "student_certificate_name"\s*\{/mu,
        'student certificate output',
      ),
      'value',
    ),
    'local.student_edge_enabled ? google_certificate_manager_certificate.student[0].name : null',
  );
  assert.equal(
    assignmentExpression(
      extractBlock(
        rootOutputs,
        /^output "student_certificate_name"\s*\{/mu,
        'root student certificate output',
      ),
      'value',
    ),
    'module.edge_environment.student_certificate_name',
  );
});

test('READMEs preserve source-only, build-time, and Dark pre-DNS boundaries', () => {
  const artifactReadme = normalizedSource(`${ARTIFACT_DOMAIN}/README.md`);
  const runtimeReadme = normalizedSource(`${RUNTIME_DOMAIN}/README.md`);
  const edgeReadme = normalizedSource('infra/gcp/edge/README.md');
  for (const required of [
    'source-only',
    'moazez-github-production',
    'moazez-backend-main',
    'moazez-ui-artifact-builder',
    'repository-ID-scoped',
    'frontend-artifact-identity/production',
    'moazez-student-app-main',
    '1391516333',
    'moazez-teacher-app-main',
    '1412551303',
    'Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Teacher-App',
    'moazez-production-teacher-web',
    'does not enforce per-repository publisher',
    'All four already-approved',
    'zero existing',
    'not evidence of a real Terraform Plan',
    'never apply either automatically',
    'service-91001421934@serverless-robot-prod.iam.gserviceaccount.com',
    'roles/artifactregistry.reader',
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
    'moazez-student-web',
    'four protected runtime identities',
    'moazez-production-teacher-web',
    APPROVED_TEACHER_WEB_IMAGE,
    '3 add, 0 change, 0 destroy',
    'not evidence of a real Terraform plan',
  ]) {
    assert.ok(runtimeReadme.includes(required), required);
  }
  for (const required of [
    'moazez-production-student-cert',
    'student.moazez.cloud',
    'moazez-production-edge-cert',
    'existing certificate map',
    'absent in staging',
  ])
    assert.ok(edgeReadme.includes(required), required);
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
  assertCommittedStage30C1CandidateScope(candidateFilesFromCommittedRange());
});

test('capacity contract maintenance does not activate frontend scope and source changes remain bounded', () => {
  const capacityMaintenance = [
    'scripts/deployment-control/runtime-capacity-control.cjs',
    'scripts/deployment-control/tests/runtime-capacity-control.test.cjs',
    RUNTIME_CAPACITY_GOVERNANCE_PATH,
    'src/modules/academics/academic-content/example.ts',
    TEST_PATH,
  ];
  assert.equal(
    assertCommittedStage30C1CandidateScope(capacityMaintenance),
    false,
  );
  for (const sourcePath of [
    `${ARTIFACT_MODULE}/main.tf`,
    `${RUNTIME_ROOT}/variables.tf`,
    `${EDGE_MODULE}/main.tf`,
    'infra/gcp/edge/README.md',
    'scripts/deployment-control/runtime-release-control.cjs',
    `${EDGE_ROOT}/tests/candidate-route.tftest.hcl`,
  ]) {
    assert.throws(
      () =>
        assertCommittedStage30C1CandidateScope([
          ...capacityMaintenance,
          sourcePath,
        ]),
      { code: 'ERR_ASSERTION' },
    );
  }
  assert.equal(
    assertCommittedStage30C1CandidateScope(AUTHORIZED_STAGE30C1_PATHS),
    true,
  );
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
  for (const file of [
    'infra/gcp/edge/README.md',
    `${EDGE_MODULE}/main.tf`,
    `${EDGE_MODULE}/outputs.tf`,
    `${EDGE_MODULE}/variables.tf`,
  ])
    assert.equal(assertStage30C1CandidateScope([file]), true);
  assert.equal(
    assertStage30C1CandidateScope([`${EDGE_ROOT}/variables.tf`]),
    true,
  );
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

test('NR11-T3A scope rejects changes to existing identity, registry, and runtime resources', () => {
  assert.equal(assertCommittedStage30C1CandidateScope(NR11_T3A_PATHS), false);
  for (const forbidden of [
    `${ARTIFACT_ROOT}/main.tf`,
    `${ARTIFACT_MODULE}/main.tf`,
    'infra/gcp/artifact-registry/modules/artifact-registry-environment/main.tf',
    `${RUNTIME_ROOT}/main.tf`,
    `${EDGE_ROOT}/main.tf`,
  ]) {
    assert.throws(
      () =>
        assertCommittedStage30C1CandidateScope([...NR11_T3A_PATHS, forbidden]),
      { code: 'ERR_ASSERTION' },
    );
  }
});
