'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { execFileSync } = require('node:child_process');
const { classifyTestFile } = require('../ci/plan-ci.cjs');

const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..');
const BASE_SHA = '30208271366422efeb8e7ed9dab81876972cce4c';
const TEST_PATH =
  'scripts/tests/pt-2-backend-firebase-production-bootstrap.test.cjs';
const STAGE26_TEST_PATH =
  'scripts/tests/stage-26c-production-foundation-source.test.cjs';
const STAGE29_TEST_PATH =
  'scripts/tests/stage-29a-production-runtime-source.test.cjs';
const PLAN_CI_PATH = 'scripts/ci/plan-ci.cjs';
const PLAN_CI_TEST_PATH = 'scripts/tests/plan-ci.test.cjs';

const FIREBASE_VALIDATION_PATH =
  'src/infrastructure/push/firebase/firebase-credential-env.validation.ts';
const FIREBASE_ADMIN_PATH =
  'src/infrastructure/push/firebase/firebase-admin.service.ts';
const FIREBASE_PUSH_PROVIDER_TEST_PATH =
  'src/infrastructure/push/firebase/tests/firebase-push.provider.spec.ts';
const STORAGE_CUTOVER_BOUNDARY_TEST_PATH =
  'src/infrastructure/storage/tests/storage-cutover-source-boundary.spec.ts';
const RUNTIME_MODULE_ROOT =
  'infra/gcp/backend-runtime/modules/runtime-environment';
const STAGING_RUNTIME_ROOT =
  'infra/gcp/backend-runtime/environments/nonprod/runtime';
const PRODUCTION_RUNTIME_ROOT =
  'infra/gcp/backend-runtime/environments/production/runtime';
const RUNTIME_IAM_PATH =
  'infra/gcp/runtime-iam/modules/runtime-iam-environment/main.tf';

const AUTHORIZED_PT2_PATHS = Object.freeze(
  [
    FIREBASE_VALIDATION_PATH,
    FIREBASE_ADMIN_PATH,
    'src/infrastructure/push/firebase/tests/firebase-admin.service.spec.ts',
    'src/infrastructure/push/firebase/tests/firebase-env.validation.spec.ts',
    FIREBASE_PUSH_PROVIDER_TEST_PATH,
    STORAGE_CUTOVER_BOUNDARY_TEST_PATH,
    'src/config/env.validation.ts',
    'src/runtime/runtime-env.validation.ts',
    'src/runtime/runtime-env.validation.spec.ts',
    `${RUNTIME_MODULE_ROOT}/main.tf`,
    `${RUNTIME_MODULE_ROOT}/variables.tf`,
    `${STAGING_RUNTIME_ROOT}/main.tf`,
    `${PRODUCTION_RUNTIME_ROOT}/main.tf`,
    `${PRODUCTION_RUNTIME_ROOT}/variables.tf`,
    RUNTIME_IAM_PATH,
    'src/platform-admin-bootstrap.ts',
    'src/platform-admin-bootstrap.spec.ts',
    'src/modules/platform-admin/bootstrap/platform-admin-bootstrap.constants.ts',
    'src/modules/platform-admin/bootstrap/platform-admin-bootstrap.environment.ts',
    'src/modules/platform-admin/bootstrap/bootstrap-initial-platform-administrator.use-case.ts',
    'src/modules/platform-admin/bootstrap/platform-admin-bootstrap.repository.ts',
    'src/modules/platform-admin/bootstrap/tests/platform-admin-bootstrap.environment.spec.ts',
    'test/integration/platform-admin-bootstrap.integration.spec.ts',
    TEST_PATH,
    STAGE26_TEST_PATH,
    STAGE29_TEST_PATH,
    PLAN_CI_PATH,
    PLAN_CI_TEST_PATH,
  ].sort(),
);

function repositoryPath(relativePath) {
  return path.join(REPOSITORY_ROOT, ...relativePath.split('/'));
}

function source(relativePath) {
  return fs.readFileSync(repositoryPath(relativePath), 'utf8').replace(/\r\n/gu, '\n');
}

function normalizedCandidateFiles(candidateFiles) {
  return [
    ...new Set(candidateFiles.map((file) => file.replace(/\\/gu, '/'))),
  ].sort();
}

function candidateFilesFromCommittedRange() {
  const base = process.env.CI_BASE_SHA || BASE_SHA;
  const candidate = process.env.CI_CANDIDATE_SHA || 'HEAD';
  return normalizedCandidateFiles(
    execFileSync('git', ['diff', '--name-only', base, candidate, '--'], {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
      windowsHide: true,
    })
      .split(/\r?\n/u)
      .filter(Boolean),
  );
}

function assertPt2CandidateScope(candidateFiles) {
  const normalized = normalizedCandidateFiles(candidateFiles);
  if (!normalized.includes(TEST_PATH)) return false;

  assert.deepEqual(
    normalized.filter((file) => !AUTHORIZED_PT2_PATHS.includes(file)),
    [],
  );
  assert.deepEqual(
    normalized.filter(
      (file) =>
        /^(?:Moazez-Platform-Admin|Moazez-School-Dashboard|frontend)\//u.test(
          file,
        ) ||
        /^prisma\/(?:schema[.]prisma|migrations)\//u.test(file) ||
        /^\.github\/workflows\//u.test(file),
    ),
    [],
  );
  return true;
}

function extractBlock(text, startPattern, label) {
  const match = startPattern.exec(text);
  assert.ok(match, `Missing ${label}.`);
  const openIndex = text.indexOf('{', match.index);
  assert.notEqual(openIndex, -1, `Missing opening brace for ${label}.`);
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = openIndex; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(openIndex, index + 1);
    }
  }
  assert.fail(`Unclosed ${label}.`);
}

function treeSource(relativeRoot) {
  const files = [];
  const visit = (absoluteRoot) => {
    for (const entry of fs.readdirSync(absoluteRoot, { withFileTypes: true })) {
      const absolutePath = path.join(absoluteRoot, entry.name);
      if (entry.isDirectory()) visit(absolutePath);
      else if (entry.isFile() && /[.](?:tf|ts)$/u.test(entry.name)) {
        files.push(fs.readFileSync(absolutePath, 'utf8'));
      }
    }
  };
  visit(repositoryPath(relativeRoot));
  return files.join('\n').replace(/\r\n/gu, '\n');
}

test('PT-2 TAP owns exactly the authorized maximum and rejects every unrelated domain', () => {
  assert.equal(AUTHORIZED_PT2_PATHS.length, 28);
  assert.equal(assertPt2CandidateScope(AUTHORIZED_PT2_PATHS), true);
  assert.equal(assertPt2CandidateScope(['src/example-future-change.ts']), false);
  for (const forbiddenPath of [
    'src/example-unrelated-change.ts',
    'prisma/schema.prisma',
    'prisma/migrations/20260822000000_forbidden/migration.sql',
    '.github/workflows/forbidden.yml',
    'Moazez-Platform-Admin/src/forbidden.ts',
    'infra/gcp/backend-runtime/README.md',
    'firebase-admin.json',
  ]) {
    assert.throws(
      () => assertPt2CandidateScope([TEST_PATH, forbiddenPath]),
      { code: 'ERR_ASSERTION' },
      forbiddenPath,
    );
  }
  assert.throws(
    () =>
      assertPt2CandidateScope([
        ...AUTHORIZED_PT2_PATHS,
        'src/infrastructure/push/firebase/tests/unrelated-remediation.spec.ts',
      ]),
    { code: 'ERR_ASSERTION' },
    'unrelated Jest test must remain unauthorized',
  );
});

test('Committed PT-2 range is fully owned by the canonical TAP when active', () => {
  assertPt2CandidateScope(candidateFilesFromCommittedRange());
});

test('PT-2 TAP has the exact canonical pull-request CI ownership', () => {
  assert.deepEqual(classifyTestFile(TEST_PATH), {
    file: TEST_PATH,
    kind: 'node-tap',
    owner: 'pre-launch-pt2-backend-governance',
    category: 'invariant',
    profile: 'runtime-governance',
    execution: 'pull-request',
  });
});

test('Firebase credential mode is one shared explicit closed contract', () => {
  const validation = source(FIREBASE_VALIDATION_PATH);
  const configValidation = source('src/config/env.validation.ts');
  const runtimeValidation = source('src/runtime/runtime-env.validation.ts');
  assert.match(
    validation.replace(/\s+/gu, ''),
    /FIREBASE_CREDENTIAL_MODES=\[['"]application_default['"],['"]google_application_credentials['"],['"]service_account_env['"],?\]asconst/u,
  );
  assert.match(validation, /firebaseCredentialEnvironmentShape/u);
  assert.match(validation, /refineFirebaseCredentialEnvironment/u);
  assert.match(validation, /collectFirebaseCredentialEnvironmentIssues/u);
  assert.match(validation, /FIREBASE_CREDENTIAL_CONFIGURATION_ERROR/u);
  assert.match(validation, /FIREBASE_CREDENTIAL_MODE is required when FCM_ENABLED=true/u);
  assert.match(validation, /providedServiceAccountFieldCount/u);
  assert.match(validation, /hasCredentialsFile && hasAnyServiceAccountField/u);
  for (const consumer of [configValidation, runtimeValidation]) {
    assert.match(
      consumer,
      /firebase-credential-env[.]validation/u,
    );
    assert.match(consumer, /[.][.]firebaseCredentialEnvironmentShape/u);
    assert.match(consumer, /refineFirebaseCredentialEnvironment\(/u);
  }
});

test('Firebase Admin switches explicitly, binds ambient ADC to GCP project context, and initializes before dry-run readiness', () => {
  const admin = source(FIREBASE_ADMIN_PATH);
  assert.match(admin, /switch \(env[.]FIREBASE_CREDENTIAL_MODE\)/u);
  assert.match(admin, /case 'application_default'/u);
  assert.match(admin, /credential: applicationDefault\(\)/u);
  assert.match(admin, /readOptionalString\('GCP_PROJECT_ID'\)/u);
  assert.match(admin, /projectId/u);
  assert.match(admin, /case 'google_application_credentials'/u);
  assert.match(admin, /case 'service_account_env'/u);
  assert.match(admin, /credential: cert\(\{/u);
  assert.match(admin, /normalizeFirebasePrivateKey/u);
  const readinessStart = admin.indexOf('checkReadiness()');
  const readinessEnd = admin.indexOf('getMessaging():', readinessStart);
  assert.notEqual(readinessStart, -1);
  assert.notEqual(readinessEnd, -1);
  const readiness = admin.slice(readinessStart, readinessEnd);
  assert.ok(
    readiness.indexOf('this.getOrInitializeApp()') <
      readiness.indexOf('this.isDryRun()'),
  );
  assert.ok(
    readiness.indexOf("return { mode: 'disabled' }") <
      readiness.indexOf('this.getOrInitializeApp()'),
  );
  assert.match(admin, /if \(this[.]app\) return this[.]app/u);
  assert.match(admin, /const existingApp = getApps\(\)\[0\]/u);
  assert.equal((admin.match(/initializeApp\(/gu) ?? []).length, 1);
  assert.match(admin, /assertFirebaseCredentialEnvironment/u);
});

test('Firebase runtime ownership remains Core Worker-only and readiness still includes Firebase', () => {
  const consumers = source(
    'src/runtime/core-worker/core-worker-consumers.module.ts',
  );
  const probeModule = source('src/modules/health/operational-probe.module.ts');
  const manifests = source('src/modules/health/operational-probe.manifests.ts');
  assert.match(consumers, /imports:\s*\[\s*FirebaseAdminModule,/u);
  assert.match(
    probeModule,
    /if \(role === 'core-worker'\)\s*\{\s*imports[.]push\(FirebaseAdminModule,/u,
  );
  const coreManifest = extractBlock(
    manifests,
    /'core-worker':\s*Object[.]freeze\(\{/u,
    'Core Worker readiness manifest',
  );
  assert.match(coreManifest, /'firebase'/u);
  const nonCoreRuntimeSources = [
    ['api', `${source('src/app.module.ts')}\n${source('src/modules/health/health.module.ts')}`],
    ['media-worker', treeSource('src/runtime/media-worker')],
    [
      'maintenance-scheduler',
      treeSource('src/runtime/maintenance-scheduler'),
    ],
  ];
  for (const [role, runtimeSource] of nonCoreRuntimeSources) {
    assert.doesNotMatch(
      runtimeSource,
      /FirebaseAdminModule|firebase-admin/u,
      role,
    );
  }
});

test('Terraform exposes one closed FCM selector and derives the exact boolean matrix', () => {
  const moduleVariables = source(`${RUNTIME_MODULE_ROOT}/variables.tf`);
  const moduleMain = source(`${RUNTIME_MODULE_ROOT}/main.tf`);
  const stagingMain = source(`${STAGING_RUNTIME_ROOT}/main.tf`);
  const productionMain = source(`${PRODUCTION_RUNTIME_ROOT}/main.tf`);
  const productionVariables = source(`${PRODUCTION_RUNTIME_ROOT}/variables.tf`);
  for (const variables of [moduleVariables, productionVariables]) {
    const selector = extractBlock(
      variables,
      /variable "fcm_delivery_mode"\s*\{/u,
      'fcm_delivery_mode variable',
    );
    assert.match(
      selector.replace(/\s+/gu, ''),
      /contains\(\["disabled","dry_run","send_enabled"\],var[.]fcm_delivery_mode\)/u,
    );
    assert.doesNotMatch(selector, /^\s*default\s*=/mu);
  }
  assert.match(stagingMain, /fcm_delivery_mode\s*=\s*"dry_run"/u);
  assert.match(productionMain, /fcm_delivery_mode\s*=\s*var[.]fcm_delivery_mode/u);
  const contracts = extractBlock(
    moduleMain,
    /fcm_delivery_contracts\s*=\s*\{/u,
    'FCM delivery contracts',
  ).replace(/\s+/gu, '');
  assert.match(contracts, /disabled=\{enabled="false"dry_run="true"\}/u);
  assert.match(contracts, /dry_run=\{enabled="true"dry_run="true"\}/u);
  assert.match(contracts, /send_enabled=\{enabled="true"dry_run="false"\}/u);
  assert.match(
    moduleMain,
    /selected_fcm_delivery_contract\s*=\s*local[.]fcm_delivery_contracts\[var[.]fcm_delivery_mode\]/u,
  );
});

test('Only Core Worker receives Firebase runtime environment and no credential material is injected', () => {
  const main = source(`${RUNTIME_MODULE_ROOT}/main.tf`);
  const environments = {
    api: extractBlock(main, /api_environment\s*=\s*merge\([^\{]+\{/u, 'API environment'),
    core: extractBlock(main, /core_worker_environment\s*=\s*merge\([^\{]+\{/u, 'Core environment'),
    media: extractBlock(main, /media_worker_environment\s*=\s*merge\([^\{]+\{/u, 'Media environment'),
    maintenance: extractBlock(main, /maintenance_scheduler_environment\s*=\s*merge\([^\{]+\{/u, 'Maintenance environment'),
  };
  assert.match(
    environments.core,
    /FIREBASE_CREDENTIAL_MODE\s*=\s*"application_default"/u,
  );
  assert.match(
    environments.core,
    /FCM_ENABLED\s*=\s*local[.]selected_fcm_delivery_contract[.]enabled/u,
  );
  assert.match(
    environments.core,
    /FCM_DRY_RUN\s*=\s*local[.]selected_fcm_delivery_contract[.]dry_run/u,
  );
  for (const [role, environment] of Object.entries(environments)) {
    if (role === 'core') continue;
    assert.doesNotMatch(environment, /\b(?:FIREBASE_|FCM_)/u, role);
  }
  assert.doesNotMatch(
    main,
    /FIREBASE_(?:PROJECT_ID|CLIENT_EMAIL|PRIVATE_KEY)|GOOGLE_APPLICATION_CREDENTIALS/u,
  );
});

test('Runtime IAM adds exactly one additive Core Worker Firebase Messaging member', () => {
  const iam = source(RUNTIME_IAM_PATH);
  const allRuntimeIam = treeSource('infra/gcp/runtime-iam');
  assert.equal(
    (iam.match(/resource "google_project_iam_member"/gu) ?? []).length,
    1,
  );
  const firebaseMember = extractBlock(
    iam,
    /resource "google_project_iam_member" "core_worker_firebase_cloud_messaging"\s*\{/u,
    'Core Worker Firebase Messaging IAM member',
  );
  assert.match(
    firebaseMember,
    /role\s*=\s*"roles\/firebasecloudmessaging[.]admin"/u,
  );
  assert.match(
    firebaseMember,
    /member\s*=\s*local[.]existing_runtime_service_account_members\["core_worker"\]/u,
  );
  assert.doesNotMatch(
    allRuntimeIam,
    /google_project_iam_(?:policy|binding)|google_service_account_key/u,
  );
  assert.doesNotMatch(
    allRuntimeIam,
    /resource "google_secret_manager_secret"|FIREBASE_PRIVATE_KEY|Firebase JSON/iu,
  );
  const stagingContract = extractBlock(
    iam,
    /staging_contract\s*=\s*\{/u,
    'Runtime IAM staging contract',
  );
  const productionContract = extractBlock(
    iam,
    /production_contract\s*=\s*\{/u,
    'Runtime IAM production contract',
  );
  const effectiveMember = (contract) => {
    const projectId = /project_id\s*=\s*"([^"]+)"/u.exec(contract)?.[1];
    const coreWorkerId = /core_worker\s*=\s*"([^"]+)"/u.exec(contract)?.[1];
    assert.ok(projectId);
    assert.ok(coreWorkerId);
    return `serviceAccount:${coreWorkerId}@${projectId}.iam.gserviceaccount.com`;
  };
  assert.deepEqual(
    [effectiveMember(stagingContract), effectiveMember(productionContract)],
    [
      'serviceAccount:moazez-core-worker@moazez-nonprod-91001421934.iam.gserviceaccount.com',
      'serviceAccount:moazez-core-worker@moazez-production.iam.gserviceaccount.com',
    ],
  );
});

test('Bootstrap supports exactly staging and production with fail-closed fixed tuples', () => {
  const constants = source(
    'src/modules/platform-admin/bootstrap/platform-admin-bootstrap.constants.ts',
  );
  const environment = source(
    'src/modules/platform-admin/bootstrap/platform-admin-bootstrap.environment.ts',
  );
  assert.match(
    constants.replace(/\s+/gu, ''),
    /PLATFORM_ADMIN_BOOTSTRAP_ENVIRONMENTS=\['staging','production',?\]asconst/u,
  );
  for (const required of [
    "NODE_ENV: 'staging'",
    "APP_URL: 'https://staging-api.moazez.cloud'",
    "GCP_PROJECT_ID: 'moazez-nonprod-91001421934'",
    "NODE_ENV: 'production'",
    "APP_URL: 'https://api.moazez.cloud'",
    "GCP_PROJECT_ID: 'moazez-production'",
    "createDatabaseRuntimeEnvironmentShape('api')",
    "const APPROVED_DATABASE_USER = 'moazez_api'",
  ]) {
    assert.ok(environment.includes(required), required);
  }
  assert.match(environment, /environmentSchemas\[requestedEnvironment\]/u);
  assert.doesNotMatch(environment, /\b(?:development|qa|prod)\s*:/u);
});

test('Bootstrap CLI keeps password and argument safeguards and carries only the validated environment', () => {
  const cli = source('src/platform-admin-bootstrap.ts');
  assert.match(cli, /argument === '--execute'/u);
  assert.match(cli, /PASSWORD_ARGUMENT_FORBIDDEN/u);
  assert.match(cli, /stdin[.]isTTY === true/u);
  assert.match(cli, /MAX_BOOTSTRAP_PASSWORD_BYTES = 1_024/u);
  assert.match(cli, /PASSWORD_INPUT_MULTILINE/u);
  assert.match(
    cli,
    /\^\(--environment\|--email\|--first-name\|--last-name\)=/u,
  );
  assert.doesNotMatch(
    cli,
    /--(?:database-url|project-id|api-url|reset|update|takeover)/u,
  );
  assert.match(
    cli,
    /assertEnvironment\(\s*argumentsValue[.]environment,/u,
  );
  assert.match(
    cli,
    /useCase[.]execute\(\{\s*environment: argumentsValue[.]environment,/u,
  );
});

test('Bootstrap audit records the governed command environment while replay and reference guards remain unchanged', () => {
  const useCase = source(
    'src/modules/platform-admin/bootstrap/bootstrap-initial-platform-administrator.use-case.ts',
  );
  const repository = source(
    'src/modules/platform-admin/bootstrap/platform-admin-bootstrap.repository.ts',
  );
  assert.match(useCase, /environment: PlatformAdminBootstrapEnvironment/u);
  assert.match(useCase, /environment: input[.]environment/u);
  assert.match(repository, /environment: PlatformAdminBootstrapEnvironment/u);
  assert.match(repository, /environment: input[.]environment/u);
  const replay = extractBlock(
    repository,
    /priorSuccessfulBootstrap\s*=\s*await transaction[.]auditLog[.]findFirst\(\{/u,
    'bootstrap replay query',
  );
  assert.match(replay, /outcome: AuditOutcome[.]SUCCESS/u);
  assert.doesNotMatch(replay, /environment/u);
  assert.match(repository, /REFERENCE_DATA_INVALID/u);
  assert.match(repository, /TransactionIsolationLevel[.]Serializable/u);
  assert.match(repository, /ALREADY_INITIALIZED/u);
  assert.match(repository, /EMAIL_IN_USE/u);
  assert.doesNotMatch(
    repository,
    /transaction[.]user[.](?:update|delete)|reset|takeover/u,
  );
});

test('Historical Stage26 and Stage29 direct scopes remain fail-closed with narrow PT-2 delegation', () => {
  const stage26 = source(STAGE26_TEST_PATH);
  const stage29 = source(STAGE29_TEST_PATH);
  for (const historical of [stage26, stage29]) {
    assert.match(historical, /PT2_TEST_PATH/u);
    assert.match(historical, /assertStage\d+CandidateScope/u);
    assert.match(historical, /assertCommittedStage\d+CandidateScope/u);
    assert.match(historical, /PT2_TEST_PATH/u);
  }
  assert.match(stage26, /PT2_STAGE26_DELEGATED_PATHS/u);
  assert.match(stage29, /PT2_STAGE29_DELEGATED_PATHS/u);
  assert.match(stage26, /production-foundation-source-governance/u);
  assert.match(stage29, /production-runtime-source-governance/u);
});

test('PT-2 source contains no key resource, Firebase credential secret, workflow, schema, or migration mutation', () => {
  const terraform = [
    treeSource('infra/gcp/backend-runtime'),
    treeSource('infra/gcp/runtime-iam'),
  ].join('\n');
  assert.doesNotMatch(terraform, /resource "google_service_account_key"/u);
  assert.doesNotMatch(terraform, /google_project_iam_(?:policy|binding)/u);
  assert.doesNotMatch(
    terraform,
    /resource "google_secret_manager_secret"[^\n]*(?:firebase|fcm)|FIREBASE_PRIVATE_KEY\s*=|FIREBASE_CLIENT_EMAIL\s*=|GOOGLE_APPLICATION_CREDENTIALS\s*=/iu,
  );
  assert.deepEqual(
    AUTHORIZED_PT2_PATHS.filter(
      (file) =>
        /^\.github\/workflows\//u.test(file) ||
        /^prisma\/(?:schema[.]prisma|migrations)\//u.test(file) ||
        /[.]json$/u.test(file),
    ),
    [],
  );

  const privateKeyBoundary = new RegExp(
    ['-{5}', 'BEGIN ', '(?:RSA |EC |OPENSSH )?', 'PRIVATE KEY', '-{5}'].join(''),
    'u',
  );
  const firebaseServiceAccountJsonField = new RegExp(
    `['\"](?:${[
      ['private', 'key'].join('_'),
      ['private', 'key', 'id'].join('_'),
      ['client', 'email'].join('_'),
      ['client', 'id'].join('_'),
    ].join('|')})['\"]\\s*:`,
    'iu',
  );
  const serviceAccountJsonType = new RegExp(
    `['\"]${'type'}['\"]\\s*:\\s*['\"]${['service', 'account'].join('_')}['\"]`,
    'iu',
  );
  const longEmbeddedBase64Literal = new RegExp(
    `['\"][A-Za-z0-9+/]{${160},}={0,2}['\"]`,
    'u',
  );

  for (const file of AUTHORIZED_PT2_PATHS) {
    const contents = source(file);
    assert.doesNotMatch(
      contents,
      privateKeyBoundary,
      `${file} contains a private-key boundary`,
    );
    assert.doesNotMatch(
      contents,
      firebaseServiceAccountJsonField,
      `${file} contains a Firebase service-account JSON field`,
    );
    assert.doesNotMatch(
      contents,
      serviceAccountJsonType,
      `${file} contains a Firebase service-account JSON type`,
    );
    assert.doesNotMatch(
      contents,
      longEmbeddedBase64Literal,
      `${file} contains a long embedded base64 payload`,
    );
  }
});
