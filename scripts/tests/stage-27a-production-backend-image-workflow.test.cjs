'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { execFileSync, spawnSync } = require('node:child_process');
const { classifyTestFile } = require('../ci/plan-ci.cjs');

const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..');
const BASE_SHA = 'eeac262acce930916b47c4d70f2c62e0d55af358';
const WORKFLOW_PATH = '.github/workflows/production-backend-image.yml';
const STAGING_WORKFLOW_PATH = '.github/workflows/staging-backend-image.yml';
const TEST_PATH =
  'scripts/tests/stage-27a-production-backend-image-workflow.test.cjs';
const PLAN_CI_PATH = 'scripts/ci/plan-ci.cjs';
const RUN_CI_SHARD_PATH = 'scripts/tests/run-ci-shard.test.cjs';
const PLAN_CI_TEST_PATH = 'scripts/tests/plan-ci.test.cjs';
const AUTHORIZED_CANDIDATE_PATHS = [TEST_PATH, WORKFLOW_PATH].sort();
const TEST_IMAGE_PACKAGE =
  'me-central2-docker.pkg.dev/moazez-production/moazez-production-containers/moazez-backend';
const TEST_EXPECTED_SHA = 'a'.repeat(40);
const TEST_VALID_DIGEST = `sha256:${'b'.repeat(64)}`;
const BUILD_AUTHORIZED_MARKER = 'BUILD_AUTHORIZED=YES';

function repositoryPath(relativePath) {
  return path.join(REPOSITORY_ROOT, ...relativePath.split('/'));
}

function normalizedSource(relativePath) {
  return fs
    .readFileSync(repositoryPath(relativePath), 'utf8')
    .replace(/\r\n/gu, '\n');
}

function topLevelBlockLines(source, key) {
  const lines = source.split('\n');
  const start = lines.findIndex((line) => line === `${key}:`);
  assert.notEqual(start, -1, `missing top-level ${key} block`);
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (lines[index] !== '' && /^\S/u.test(lines[index])) {
      end = index;
      break;
    }
  }
  return lines
    .slice(start + 1, end)
    .filter((line) => line.trim() !== '' && !line.trimStart().startsWith('#'))
    .map((line) => line.trim());
}

function workflowStep(source, name) {
  const marker = `      - name: ${name}`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing workflow step: ${name}`);
  const next = source.indexOf('\n      - name: ', start + marker.length);
  return source.slice(start, next === -1 ? source.length : next);
}

function workflowRunBody(step) {
  const marker = '        run: |\n';
  const start = step.indexOf(marker);
  assert.notEqual(start, -1, 'missing workflow run body');
  return step
    .slice(start + marker.length)
    .split('\n')
    .map((line) => {
      if (line === '') return line;
      assert.ok(line.startsWith('          '), 'unexpected run-body indent');
      return line.slice(10);
    })
    .join('\n');
}

function bashExecutable() {
  const gitExecPath = execFileSync('git', ['--exec-path'], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
  const gitBash = path.resolve(
    gitExecPath,
    '..',
    '..',
    '..',
    'bin',
    process.platform === 'win32' ? 'bash.exe' : 'bash',
  );
  const candidates = [
    process.env.MOAZEZ_TEST_BASH,
    gitBash,
    'C:\\Program Files\\Git\\bin\\bash.exe',
    '/usr/bin/bash',
    '/bin/bash',
  ].filter(Boolean);
  const executable = candidates.find((candidate) => fs.existsSync(candidate));
  assert.ok(executable, 'Bash is required for the collision-step proof');
  return executable;
}

function runCollisionStep({
  emitNul = false,
  exitCode,
  stdout = '',
  stderr = '',
}) {
  const workflow = normalizedSource(WORKFLOW_PATH);
  const collisionBody = workflowRunBody(
    workflowStep(workflow, 'Reject an existing immutable source SHA tag'),
  );
  const fakeGcloud = [
    'gcloud() {',
    '  if [[ "$#" -ne 6 ]]; then',
    "    printf '%s\\n' 'unexpected fake gcloud argument count' >&2",
    '    return 97',
    '  fi',
    '  if [[ "$1" != "artifacts" || "$2" != "docker" ||',
    '    "$3" != "images" || "$4" != "describe" ||',
    '    "$5" != "${IMAGE_PACKAGE}:${EXPECTED_SHA}" ||',
    '    "$6" != "--format=value(image_summary.digest)" ]]; then',
    "    printf '%s\\n' 'unexpected fake gcloud invocation' >&2",
    '    return 97',
    '  fi',
    '  if [[ "$FAKE_GCLOUD_EMIT_NUL" == "YES" ]]; then',
    "    printf '%s\\0\\n' \"${FAKE_GCLOUD_STDOUT-}\"",
    '  else',
    "    printf '%s' \"${FAKE_GCLOUD_STDOUT-}\"",
    '  fi',
    "  printf '%s' \"${FAKE_GCLOUD_STDERR-}\" >&2",
    '  return "$FAKE_GCLOUD_EXIT_CODE"',
    '}',
  ].join('\n');
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'stage-27a-collision-'),
  );
  try {
    const result = spawnSync(
      bashExecutable(),
      [
        '--noprofile',
        '--norc',
        '-c',
        `${fakeGcloud}\n${collisionBody}\nprintf '%s\\n' '${BUILD_AUTHORIZED_MARKER}'`,
      ],
      {
        cwd: temporaryDirectory,
        encoding: 'utf8',
        env: {
          ...process.env,
          EXPECTED_SHA: TEST_EXPECTED_SHA,
          FAKE_GCLOUD_EMIT_NUL: emitNul ? 'YES' : 'NO',
          FAKE_GCLOUD_EXIT_CODE: String(exitCode),
          FAKE_GCLOUD_STDERR: stderr,
          FAKE_GCLOUD_STDOUT: stdout,
          IMAGE_PACKAGE: TEST_IMAGE_PACKAGE,
          TMPDIR: '.',
        },
        timeout: 10_000,
        windowsHide: true,
      },
    );
    assert.equal(result.error, undefined);
    assert.equal(result.signal, null);
    assert.deepEqual(
      fs.readdirSync(temporaryDirectory),
      [],
      'collision lookup temporary evidence was not cleaned',
    );
    return result;
  } finally {
    fs.rmSync(temporaryDirectory, { force: true, recursive: true });
  }
}

function assignmentCommandLines(source, variableName) {
  const pattern = new RegExp(
    `if ${variableName}="\\$\\(([\\s\\S]*?)\\n\\s*\\)"; then`,
    'u',
  );
  const match = source.match(pattern);
  assert.ok(match, `missing guarded ${variableName} command substitution`);
  return match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function shellAssignmentCount(source, variableName) {
  const evidenceFormat = new RegExp(`printf '${variableName}=%s\\\\n'`, 'gu');
  const assignment = new RegExp(`\\b${variableName}=`, 'gu');
  return (source.replace(evidenceFormat, '').match(assignment) ?? []).length;
}

function assertConditionHardFails(source, conditionLine) {
  const start = source.indexOf(conditionLine);
  assert.notEqual(
    start,
    -1,
    `missing hard-failure condition: ${conditionLine}`,
  );
  const branch = source.slice(start).match(/^[\s\S]*?^\s*fi\s*$/mu);
  assert.ok(branch, `unterminated hard-failure condition: ${conditionLine}`);
  assert.match(branch[0], /^\s*exit 1\s*$/mu, conditionLine);
}

function candidateFilesFromCommittedRange() {
  const base = process.env.CI_BASE_SHA || BASE_SHA;
  const candidate = process.env.CI_CANDIDATE_SHA || 'HEAD';
  return execFileSync('git', ['diff', '--name-only', base, candidate, '--'], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    windowsHide: true,
  })
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((file) => file.replace(/\\/gu, '/'))
    .sort();
}

function committedDiffFor(relativePath) {
  const base = process.env.CI_BASE_SHA || BASE_SHA;
  const candidate = process.env.CI_CANDIDATE_SHA || 'HEAD';
  return execFileSync(
    'git',
    ['diff', '--unified=0', base, candidate, '--', relativePath],
    {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
      windowsHide: true,
    },
  ).replace(/\r\n/gu, '\n');
}

function assertStage27CandidateScope(candidateFiles) {
  const normalized = [
    ...new Set(candidateFiles.map((file) => file.replace(/\\/gu, '/'))),
  ].sort();
  const active =
    normalized.includes(WORKFLOW_PATH) || normalized.includes(TEST_PATH);
  if (!active) return;

  assert.deepEqual(normalized, AUTHORIZED_CANDIDATE_PATHS);
  assert.equal(normalized.includes(STAGING_WORKFLOW_PATH), false);
}

test('Production backend image workflow exists at the canonical path', () => {
  assert.equal(fs.existsSync(repositoryPath(WORKFLOW_PATH)), true);
});

test('trigger, concurrency, and permissions are exact and minimal', () => {
  const workflow = normalizedSource(WORKFLOW_PATH);

  assert.deepEqual(topLevelBlockLines(workflow, 'on'), ['workflow_dispatch:']);
  assert.deepEqual(topLevelBlockLines(workflow, 'concurrency'), [
    'group: production-backend-image-${{ github.sha }}',
    'cancel-in-progress: false',
  ]);
  assert.deepEqual(topLevelBlockLines(workflow, 'permissions'), [
    'contents: read',
    'id-token: write',
  ]);
  assert.equal((workflow.match(/^\s*permissions:\s*$/gmu) ?? []).length, 1);
  assert.doesNotMatch(
    topLevelBlockLines(workflow, 'on').join('\n'),
    /push|pull_request|pull_request_target|schedule|workflow_call/u,
  );
  assert.doesNotMatch(workflow, /^\s+inputs:\s*$/mu);
  assert.doesNotMatch(
    workflow,
    /github[.]event[.]inputs|inputs[.]source_sha/iu,
  );
});

test('actions, checkout, and exact source guards are immutable and fail closed', () => {
  const workflow = normalizedSource(WORKFLOW_PATH);
  const actionReferences = [...workflow.matchAll(/^\s*uses:\s*(\S+)/gmu)].map(
    (match) => match[1],
  );

  assert.deepEqual(actionReferences, [
    'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
    'google-github-actions/auth@7c6bc770dae815cd3e89ee6cdf493a5fab2cc093',
    'google-github-actions/setup-gcloud@aa5489c8933f4cc7a4f7d45035b3b1440c9c10db',
  ]);
  for (const reference of actionReferences) {
    assert.match(reference, /@[0-9a-f]{40}$/u);
  }
  const stepNames = [...workflow.matchAll(/^\s{6}- name: (.+)$/gmu)].map(
    (match) => match[1],
  );
  assert.deepEqual(stepNames, [
    'Check out the exact image source',
    'Verify exact source and allowed ref',
    'Authenticate to Google Cloud with WIF',
    'Set up Google Cloud CLI',
    'Verify active authentication context',
    'Reject an existing immutable source SHA tag',
    'Configure the regional Artifact Registry credential helper',
    'Build the exact source SHA image',
    'Verify the local built artifact',
    'Push the exact source SHA image',
    'Resolve the authoritative remote digest',
  ]);
  assert.equal((workflow.match(/^\s{6}- /gmu) ?? []).length, stepNames.length);
  assert.equal((workflow.match(/^\s+run:\s+[|]$/gmu) ?? []).length, 8);
  assert.equal((workflow.match(/^\s+set -euo pipefail$/gmu) ?? []).length, 8);
  assert.match(
    workflow,
    /ref: \$\{\{ github[.]sha \}\}\n\s+fetch-depth: 1\n\s+persist-credentials: false/u,
  );

  const sourceGuard = workflowStep(
    workflow,
    'Verify exact source and allowed ref',
  );
  assert.match(sourceGuard, /EXPECTED_SHA: \$\{\{ github[.]sha \}\}/u);
  assert.match(sourceGuard, /"\$GITHUB_EVENT_NAME" != "workflow_dispatch"/u);
  assert.match(sourceGuard, /"\$GITHUB_REF" != "refs\/heads\/main"/u);
  assert.ok(sourceGuard.includes('^[a-f0-9]{40}$'));
  assert.ok(sourceGuard.includes("git rev-parse --verify 'HEAD^{commit}'"));
  assert.ok(
    sourceGuard.includes(
      `actual_sha="$(git rev-parse --verify 'HEAD^{commit}')"`,
    ),
  );
  assert.equal(shellAssignmentCount(sourceGuard, 'actual_sha'), 1);
  assert.match(sourceGuard, /"\$actual_sha" != "\$EXPECTED_SHA"/u);
  for (const condition of [
    'if [[ "$GITHUB_EVENT_NAME" != "workflow_dispatch" ]]; then',
    'if [[ "$GITHUB_REF" != "refs/heads/main" ]]; then',
    'if [[ ! "$EXPECTED_SHA" =~ ^[a-f0-9]{40}$ ]]; then',
    'if [[ "$actual_sha" != "$EXPECTED_SHA" ]]; then',
  ]) {
    assertConditionHardFails(sourceGuard, condition);
  }
});

test('Production WIF and active authentication context are exact', () => {
  const workflow = normalizedSource(WORKFLOW_PATH);
  const authStep = workflowStep(
    workflow,
    'Authenticate to Google Cloud with WIF',
  );
  const contextStep = workflowStep(
    workflow,
    'Verify active authentication context',
  );

  assert.match(authStep, /project_id: moazez-production/u);
  assert.match(
    authStep,
    /workload_identity_provider: projects\/91001421934\/locations\/global\/workloadIdentityPools\/moazez-github-production\/providers\/moazez-backend-main/u,
  );
  assert.match(
    authStep,
    /service_account: moazez-iac-deployer@moazez-production[.]iam[.]gserviceaccount[.]com/u,
  );
  assert.match(authStep, /create_credentials_file: true/u);
  assert.match(authStep, /cleanup_credentials: true/u);
  assert.match(authStep, /export_environment_variables: true/u);

  assert.match(contextStep, /gcloud auth list/u);
  assert.match(contextStep, /--filter='status:ACTIVE'/u);
  assert.match(contextStep, /--format='value\(account\)'/u);
  assert.deepEqual(assignmentCommandLines(contextStep, 'active_account'), [
    'gcloud auth list \\',
    "--filter='status:ACTIVE' \\",
    "--format='value(account)'",
  ]);
  assert.equal(shellAssignmentCount(contextStep, 'active_account'), 1);
  assert.match(
    contextStep,
    /"\$active_account" != "\$IAC_DEPLOYER_SERVICE_ACCOUNT"/u,
  );
  assert.match(contextStep, /gcloud config get-value project/u);
  assert.ok(
    contextStep.includes('active_project="$(gcloud config get-value project)"'),
  );
  assert.equal(shellAssignmentCount(contextStep, 'active_project'), 1);
  assert.match(contextStep, /"\$active_project" != "\$GCP_PROJECT_ID"/u);
  for (const condition of [
    'if active_account="$(',
    'if [[ "$active_account" != "$IAC_DEPLOYER_SERVICE_ACCOUNT" ]]; then',
    'if active_project="$(gcloud config get-value project)"; then',
    'if [[ "$active_project" != "$GCP_PROJECT_ID" ]]; then',
  ]) {
    assertConditionHardFails(contextStep, condition);
  }
  assert.doesNotMatch(
    workflow,
    /set -x|print-access-token|print-identity-token|gcloud auth print/u,
  );
});

test('Production Artifact Registry coordinates are exact', () => {
  const workflow = normalizedSource(WORKFLOW_PATH);

  assert.match(workflow, /^\s+GCP_PROJECT_ID: moazez-production$/mu);
  assert.match(workflow, /^\s+REGION: me-central2$/mu);
  assert.match(
    workflow,
    /^\s+ARTIFACT_REGISTRY_HOST: me-central2-docker[.]pkg[.]dev$/mu,
  );
  assert.match(
    workflow,
    /^\s+ARTIFACT_REGISTRY_REPOSITORY: moazez-production-containers$/mu,
  );
  assert.match(workflow, /^\s+ARTIFACT_REGISTRY_PACKAGE: moazez-backend$/mu);
  assert.match(
    workflow,
    /^\s+IAC_DEPLOYER_SERVICE_ACCOUNT: moazez-iac-deployer@moazez-production[.]iam[.]gserviceaccount[.]com$/mu,
  );
  assert.match(
    workflow,
    /^\s+IMAGE_PACKAGE: me-central2-docker[.]pkg[.]dev\/moazez-production\/moazez-production-containers\/moazez-backend$/mu,
  );
  for (const key of [
    'GCP_PROJECT_ID',
    'REGION',
    'ARTIFACT_REGISTRY_HOST',
    'ARTIFACT_REGISTRY_REPOSITORY',
    'ARTIFACT_REGISTRY_PACKAGE',
    'IAC_DEPLOYER_SERVICE_ACCOUNT',
    'IMAGE_PACKAGE',
  ]) {
    assert.equal(
      (workflow.match(new RegExp(`^\\s+${key}:`, 'gmu')) ?? []).length,
      1,
      key,
    );
    assert.doesNotMatch(
      workflow,
      new RegExp(`^\\s+(?:export\\s+)?${key}=`, 'mu'),
      key,
    );
  }

  const expectedShaDeclarations =
    workflow.match(/^\s+EXPECTED_SHA:.*$/gmu) ?? [];
  assert.equal(expectedShaDeclarations.length, 6);
  for (const declaration of expectedShaDeclarations) {
    assert.equal(declaration.trim(), 'EXPECTED_SHA: ${{ github.sha }}');
  }
  assert.doesNotMatch(workflow, /^\s+(?:export\s+)?EXPECTED_SHA=/mu);
  assert.doesNotMatch(workflow, /^\s+(?:working-directory|defaults|path):/mu);
});

test('tag collision detection describes the exact immutable Docker tag and fails closed', () => {
  const workflow = normalizedSource(WORKFLOW_PATH);
  const collisionStep = workflowStep(
    workflow,
    'Reject an existing immutable source SHA tag',
  );
  assert.match(
    collisionStep,
    /SOURCE_SHA_TAG="\$\{IMAGE_PACKAGE\}:\$\{EXPECTED_SHA\}"/u,
  );
  assert.match(
    collisionStep,
    /gcloud artifacts docker images describe \\\n+\s+"\$SOURCE_SHA_TAG" \\\n+\s+--format='value\(image_summary[.]digest\)' \\\n+\s+>"\$lookup_stdout_file" \\\n+\s+2>"\$lookup_stderr_file"/u,
  );
  assert.equal(
    (collisionStep.match(/gcloud artifacts docker images describe/gu) ?? [])
      .length,
    1,
  );
  assert.doesNotMatch(collisionStep, /gcloud artifacts packages list/u);
  assert.doesNotMatch(collisionStep, /gcloud artifacts tags list/u);
  assert.doesNotMatch(
    collisionStep,
    /EXPECTED_(?:PACKAGE|TAG)_RESOURCE|\/packages\/|\/tags\//u,
  );

  assert.equal((collisionStep.match(/\bmktemp\b/gu) ?? []).length, 2);
  assert.match(collisionStep, /trap cleanup_lookup_evidence EXIT/u);
  assert.match(collisionStep, /rm -f -- "\$lookup_stdout_file"/u);
  assert.match(collisionStep, /rm -f -- "\$lookup_stderr_file"/u);
  assert.match(collisionStep, /if \(\( lookup_exit_code == 0 \)\); then/u);
  assert.match(
    collisionStep,
    /if IFS= read -r -d '' lookup_stdout_prefix <"\$lookup_stdout_file"; then/u,
  );
  assert.match(collisionStep, /lookup_stdout_contains_nul != 0/u);
  assert.ok(collisionStep.includes('^sha256:[a-f0-9]{64}$'));
  assert.match(
    collisionStep,
    /\$\{#lookup_stdout_lines\[@\]\} != 1/u,
  );
  assert.match(
    collisionStep,
    /TAG_COLLISION="YES"[\s\S]*The immutable source SHA tag already exists; overwrite is forbidden[.]" >&2[\s\S]*exit 1/u,
  );

  assert.match(collisionStep, /\[\[ ! -s "\$lookup_stdout_file" \]\]/u);
  assert.match(
    collisionStep,
    /\$\{#lookup_stderr_lines\[@\]\} == 1/u,
  );
  assert.ok(
    collisionStep.includes(
      "not_found_error_pattern='^ERROR: [(]gcloud[.]artifacts[.]docker[.]images[.]describe[)] NOT_FOUND:([[:space:]].*)?$'",
    ),
  );
  assert.match(collisionStep, /TAG_COLLISION="NO"/u);
  assert.equal(
    (collisionStep.match(/TAG_LOOKUP_STATUS=UNEXPECTED_FAILURE/gu) ?? [])
      .length,
    2,
  );
  assert.match(
    collisionStep,
    /Artifact Registry exact source SHA tag lookup failed unexpectedly[.]" >&2\n\s+exit 1/u,
  );
  const collisionRun = collisionStep.replace(/^\s*run:\s*[|]$/mu, '');
  assert.doesNotMatch(collisionRun, /set \+e|<\s*<\s*\(|^\s*[^#\n]*\s[|]\s/mu);
  assert.doesNotMatch(collisionStep, /(?:cat|tee)\s+"?\$lookup_/u);
  assert.doesNotMatch(
    collisionStep,
    /gcloud artifacts[\s\S]*?\b(?:create|delete|update|move|add)\b/u,
  );
});

test('existing exact tag with one valid digest refuses overwrite', () => {
  const result = runCollisionStep({
    exitCode: 0,
    stdout: `${TEST_VALID_DIGEST}\n`,
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /TAG_COLLISION=YES/u);
  assert.doesNotMatch(result.stdout, new RegExp(BUILD_AUTHORIZED_MARKER, 'u'));
  assert.match(
    result.stderr,
    /The immutable source SHA tag already exists; overwrite is forbidden[.]/u,
  );
});

test('exact command-scoped NOT_FOUND is the only continuing absence state', () => {
  const result = runCollisionStep({
    exitCode: 1,
    stderr:
      'ERROR: (gcloud.artifacts.docker.images.describe) NOT_FOUND: requested tag was not found\n',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /TAG_COLLISION=NO/u);
  assert.match(result.stdout, new RegExp(BUILD_AUTHORIZED_MARKER, 'u'));
  assert.equal(result.stderr, '');
});

test('permission error fails the exact tag lookup closed', () => {
  const result = runCollisionStep({
    exitCode: 1,
    stderr:
      'ERROR: (gcloud.artifacts.docker.images.describe) PERMISSION_DENIED: denied\n',
  });

  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stdout, new RegExp(BUILD_AUTHORIZED_MARKER, 'u'));
  assert.match(result.stderr, /TAG_LOOKUP_STATUS=UNEXPECTED_FAILURE/u);
});

test('network or otherwise unexpected lookup failure fails closed', () => {
  const result = runCollisionStep({
    exitCode: 1,
    stderr: 'ERROR: (proxy.transport) NOT_FOUND: network path missing\n',
  });

  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stdout, new RegExp(BUILD_AUTHORIZED_MARKER, 'u'));
  assert.match(result.stderr, /TAG_LOOKUP_STATUS=UNEXPECTED_FAILURE/u);
});

test('malformed successful lookup output fails closed', () => {
  for (const behavior of [
    { exitCode: 0, stdout: 'garbage\n' },
    { emitNul: true, exitCode: 0, stdout: TEST_VALID_DIGEST },
  ]) {
    const result = runCollisionStep(behavior);

    assert.notEqual(result.status, 0);
    assert.doesNotMatch(
      result.stdout,
      new RegExp(BUILD_AUTHORIZED_MARKER, 'u'),
    );
    assert.doesNotMatch(result.stdout, /TAG_COLLISION=/u);
    assert.match(result.stderr, /TAG_LOOKUP_STATUS=UNEXPECTED_FAILURE/u);
    assert.match(result.stderr, /invalid success output/u);
  }
});

test('Docker auth, build, and SHA-only tag contract are exact', () => {
  const workflow = normalizedSource(WORKFLOW_PATH);
  const dockerAuthStep = workflowStep(
    workflow,
    'Configure the regional Artifact Registry credential helper',
  );
  const buildStep = workflowStep(workflow, 'Build the exact source SHA image');
  const smokeStep = workflowStep(workflow, 'Verify the local built artifact');
  const pushStep = workflowStep(workflow, 'Push the exact source SHA image');

  assert.match(
    dockerAuthStep,
    /gcloud auth configure-docker "\$ARTIFACT_REGISTRY_HOST" --quiet/u,
  );
  assert.equal(
    (workflow.match(/gcloud auth configure-docker/gmu) ?? []).length,
    1,
  );
  assert.match(
    buildStep,
    /image_tag="\$\{IMAGE_PACKAGE\}:\$\{EXPECTED_SHA\}"/u,
  );
  for (const step of [buildStep, smokeStep, pushStep]) {
    const imageTagAssignments = step.match(/^\s+image_tag=.*$/gmu) ?? [];
    assert.deepEqual(
      imageTagAssignments.map((line) => line.trim()),
      ['image_tag="${IMAGE_PACKAGE}:${EXPECTED_SHA}"'],
    );
  }
  assert.match(
    buildStep,
    /docker build \\\n+\s+--file Dockerfile \\\n+\s+--target final \\\n+\s+--tag "\$image_tag" \\\n+\s+[.]/u,
  );
  assert.doesNotMatch(
    buildStep,
    /--build-arg|--secret|DATABASE_URL|REDIS|SECRET_MANAGER/u,
  );
  assert.match(pushStep, /docker push "\$image_tag"/u);
  assert.equal(
    (workflow.match(/\bdocker\s+(?:build|buildx)\b/gu) ?? []).length,
    1,
  );
  assert.equal((workflow.match(/\bdocker\s+push\b/gu) ?? []).length, 1);
  assert.equal((workflow.match(/^\s+--tag\b/gmu) ?? []).length, 1);
  assert.deepEqual(
    workflow
      .split('\n')
      .filter((line) =>
        /\bdocker\s+(?:build|buildx|run|push|tag|image\s+(?:push|tag)|manifest)\b/u.test(
          line,
        ),
      )
      .map((line) => line.trim()),
    [
      'docker build \\',
      'if node_version="$(docker run --rm "$image_tag" node --version)"; then',
      'docker run --rm "$image_tag" node scripts/verify-media-runtime.cjs',
      'docker push "$image_tag"',
    ],
  );
  assert.doesNotMatch(workflow, /\bdocker tag\b/u);
  assert.doesNotMatch(workflow, /\bdocker (?:buildx|image push|manifest)\b/u);
  for (const alias of ['latest', 'production', 'stable', 'release', 'main']) {
    assert.doesNotMatch(
      workflow,
      new RegExp(`:(?:${alias})(?:["'\\s]|$)`, 'iu'),
      alias,
    );
  }
});

test('local image smoke gates precede the only push', () => {
  const workflow = normalizedSource(WORKFLOW_PATH);
  const smokeStep = workflowStep(workflow, 'Verify the local built artifact');
  const orderedMarkers = [
    'docker build \\',
    'docker run --rm "$image_tag" node --version',
    'docker run --rm "$image_tag" node scripts/verify-media-runtime.cjs',
    'docker push "$image_tag"',
    'gcloud artifacts docker images describe',
  ];
  let previousIndex = -1;
  for (const marker of orderedMarkers) {
    const currentIndex = workflow.indexOf(marker, previousIndex + 1);
    assert.ok(currentIndex > previousIndex, marker);
    previousIndex = currentIndex;
  }

  assert.match(smokeStep, /docker run --rm "\$image_tag" node --version/u);
  assert.match(smokeStep, /"\$node_version" != "v22[.]23[.]1"/u);
  assert.equal(shellAssignmentCount(smokeStep, 'node_version'), 1);
  assertConditionHardFails(smokeStep, 'if node_version="$(');
  assertConditionHardFails(
    smokeStep,
    'if [[ "$node_version" != "v22.23.1" ]]; then',
  );
  assert.match(
    smokeStep,
    /docker run --rm "\$image_tag" node scripts\/verify-media-runtime[.]cjs/u,
  );
});

test('remote digest and immutable Production reference are authoritative', () => {
  const workflow = normalizedSource(WORKFLOW_PATH);
  const resolveStep = workflowStep(
    workflow,
    'Resolve the authoritative remote digest',
  );

  assert.match(
    resolveStep,
    /SOURCE_SHA_TAG="\$\{IMAGE_PACKAGE\}:\$\{EXPECTED_SHA\}"/u,
  );
  assert.match(
    resolveStep,
    /gcloud artifacts docker images describe \\\n+\s+"\$SOURCE_SHA_TAG" \\\n+\s+--format='value\(image_summary[.]digest\)'/u,
  );
  assert.deepEqual(assignmentCommandLines(resolveStep, 'RESOLVED_DIGEST'), [
    'gcloud artifacts docker images describe \\',
    '"$SOURCE_SHA_TAG" \\',
    "--format='value(image_summary.digest)'",
  ]);
  assert.equal(shellAssignmentCount(resolveStep, 'RESOLVED_DIGEST'), 1);
  assert.equal(shellAssignmentCount(resolveStep, 'SOURCE_SHA_TAG'), 1);
  assert.ok(resolveStep.includes('^sha256:[a-f0-9]{64}$'));
  assert.match(
    resolveStep,
    /IMMUTABLE_IMAGE_REFERENCE="\$\{IMAGE_PACKAGE\}@\$\{RESOLVED_DIGEST\}"/u,
  );
  assert.equal(
    shellAssignmentCount(resolveStep, 'IMMUTABLE_IMAGE_REFERENCE'),
    1,
  );
  assert.ok(
    resolveStep.includes(
      '^me-central2-docker[.]pkg[.]dev/moazez-production/moazez-production-containers/moazez-backend@sha256:[a-f0-9]{64}$',
    ),
  );
  assert.match(
    resolveStep,
    /Authoritative remote digest resolution failed[.]" >&2\n\s+exit 1/u,
  );
  assertConditionHardFails(resolveStep, 'if RESOLVED_DIGEST="$(');
  assertConditionHardFails(
    resolveStep,
    'if [[ ! "$RESOLVED_DIGEST" =~ ^sha256:[a-f0-9]{64}$ ]]; then',
  );
  assertConditionHardFails(
    resolveStep,
    'if [[ ! "$IMMUTABLE_IMAGE_REFERENCE" =~ ^me-central2-docker[.]pkg[.]dev/moazez-production/moazez-production-containers/moazez-backend@sha256:[a-f0-9]{64}$ ]]; then',
  );

  const evidenceFields = [
    ...resolveStep.matchAll(/printf '([A-Z_]+)=%s\\n'/gu),
  ].map((match) => match[1]);
  assert.deepEqual(evidenceFields, [
    'SOURCE_SHA',
    'IMAGE_PACKAGE',
    'SOURCE_SHA_TAG',
    'RESOLVED_DIGEST',
    'IMMUTABLE_IMAGE_REFERENCE',
  ]);
  const workflowEvidenceFields = [
    ...workflow.matchAll(/printf '([A-Z_]+)=%s\\n'/gu),
  ].map((match) => match[1]);
  assert.deepEqual(workflowEvidenceFields, [
    'SOURCE_SHA_TAG',
    'TAG_COLLISION',
    'TAG_COLLISION',
    ...evidenceFields,
  ]);
  assert.doesNotMatch(
    workflow,
    /(?:echo|printf)[^\n]*(?:TOKEN|CREDENTIAL|SECRET|PASSWORD|DATABASE_URL|REDIS)/iu,
  );
});

test('workflow contains no Stage 28, Stage 29, or forbidden mutation behavior', () => {
  const workflow = normalizedSource(WORKFLOW_PATH);
  const forbiddenPatterns = [
    /\bterraform\b/iu,
    /\bprisma\b|\bmigrate\b|\bmigration\b/iu,
    /\bgcloud(?:\s+(?:alpha|beta))?\s+(?:run|iam|secrets?)\b/iu,
    /\bgcloud\s+projects\s+(?:add-iam-policy-binding|remove-iam-policy-binding|set-iam-policy)\b/iu,
    /\bgcloud\s+artifacts\s+(?:repositories|packages|tags|versions)\s+(?:create|delete|update|move|add-iam-policy-binding|remove-iam-policy-binding|set-iam-policy)\b/iu,
    /\bgcloud\s+artifacts\s+docker\s+tags\s+(?:add|delete)\b/iu,
    /\b(?:npm|yarn|pnpm)\b/iu,
    /\b(?:canary|soak|sbom|cosign)\b/iu,
    /\b(?:deploy|promote)\s+(?:cloud run|staging)\b/iu,
    /\bgcloud\s+auth\s+print\b/iu,
    /^\s+(?:env|printenv)(?:\s|$)/imu,
    /\bcat\b[^\n]*(?:credential|GOOGLE_APPLICATION_CREDENTIALS)/iu,
    /\bset\s+-x\b/u,
  ];

  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(workflow, pattern, String(pattern));
  }
  assert.deepEqual(
    workflow
      .split('\n')
      .filter((line) => line.includes('gcloud '))
      .map((line) => line.trim()),
    [
      'gcloud auth list \\',
      'if active_project="$(gcloud config get-value project)"; then',
      'if gcloud artifacts docker images describe \\',
      'gcloud auth configure-docker "$ARTIFACT_REGISTRY_HOST" --quiet',
      'gcloud artifacts docker images describe \\',
    ],
  );
});

test('Stage 27A committed candidate scope is exact when Stage 27A is active', () => {
  assertStage27CandidateScope(candidateFilesFromCommittedRange());
});

test('candidate scope ignores future unrelated work and rejects mixed candidates', () => {
  assert.doesNotThrow(() =>
    assertStage27CandidateScope(['src/example-future-change.ts']),
  );
  assert.doesNotThrow(() =>
    assertStage27CandidateScope([PLAN_CI_PATH, RUN_CI_SHARD_PATH]),
  );
  assert.throws(
    () =>
      assertStage27CandidateScope([
        WORKFLOW_PATH,
        TEST_PATH,
        PLAN_CI_PATH,
        RUN_CI_SHARD_PATH,
      ]),
    { code: 'ERR_ASSERTION' },
  );
  assert.throws(() => assertStage27CandidateScope([WORKFLOW_PATH]), {
    code: 'ERR_ASSERTION',
  });
  assert.throws(() => assertStage27CandidateScope([TEST_PATH]), {
    code: 'ERR_ASSERTION',
  });
  assert.throws(
    () =>
      assertStage27CandidateScope([
        WORKFLOW_PATH,
        'src/example-unrelated-change.ts',
      ]),
    { code: 'ERR_ASSERTION' },
  );
  assert.throws(
    () => assertStage27CandidateScope([TEST_PATH, PLAN_CI_TEST_PATH]),
    { code: 'ERR_ASSERTION' },
  );
  assert.throws(
    () => assertStage27CandidateScope([WORKFLOW_PATH, STAGING_WORKFLOW_PATH]),
    { code: 'ERR_ASSERTION' },
  );
});

test('workflow inventory update preserves existing runner governance checks', () => {
  const source = normalizedSource(RUN_CI_SHARD_PATH);
  const inventoryStart = source.indexOf('assert.deepEqual(files.sort(), [');
  const inventoryEnd = source.indexOf(']);', inventoryStart);
  assert.notEqual(inventoryStart, -1);
  assert.notEqual(inventoryEnd, -1);
  const inventory = [
    ...source
      .slice(inventoryStart, inventoryEnd)
      .matchAll(/'([^']+[.]ya?ml)'/gu),
  ].map((match) => match[1]);

  assert.ok(inventory.includes('production-backend-image.yml'));
  assert.deepEqual(inventory, [...inventory].sort());
  assert.ok(source.includes('assert.match(reference, /@[0-9a-f]{40}$/u);'));
  assert.ok(
    source.includes(
      'assert.equal(disabledCredentialCount, checkoutCount, file);',
    ),
  );
  assert.ok(
    source.includes(
      'assert.match(historical, /^\\s*workflow_dispatch:\\s*$/mu);',
    ),
  );
  assert.ok(
    source.includes(
      'assert.doesNotMatch(historical, /^\\s*(?:pull_request|push):/mu);',
    ),
  );

  const candidateFiles = candidateFilesFromCommittedRange();
  const stage27Active =
    candidateFiles.includes(WORKFLOW_PATH) ||
    candidateFiles.includes(TEST_PATH);
  if (stage27Active && candidateFiles.includes(RUN_CI_SHARD_PATH)) {
    const changedLines = committedDiffFor(RUN_CI_SHARD_PATH)
      .split('\n')
      .filter(
        (line) =>
          /^[+-]/u.test(line) &&
          !line.startsWith('---') &&
          !line.startsWith('+++'),
      );
    assert.deepEqual(changedLines, ["+    'production-backend-image.yml',"]);
  }
});

test('Stage 27A and run-ci-shard TAPs retain exact CI ownership', () => {
  assert.deepEqual(classifyTestFile(TEST_PATH), {
    file: TEST_PATH,
    kind: 'node-tap',
    owner: 'production-artifact-governance',
    category: 'invariant',
    profile: 'runtime-governance',
    execution: 'pull-request',
  });
  assert.deepEqual(classifyTestFile(RUN_CI_SHARD_PATH), {
    file: RUN_CI_SHARD_PATH,
    kind: 'node-tap',
    owner: 'ci-orchestrator',
    category: 'invariant',
    profile: 'orchestrator',
    execution: 'pull-request',
  });
});
