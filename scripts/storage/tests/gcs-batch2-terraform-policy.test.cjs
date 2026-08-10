'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.resolve(__dirname, '..', '..', '..');
const terraformRoot = path.join(repositoryRoot, 'infra', 'gcp', 'storage');
const terraformFiles = walk(terraformRoot).filter((file) =>
  file.endsWith('.tf'),
);
const terraform = terraformFiles
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('\n');
const moduleMain = read(
  'infra/gcp/storage/modules/storage-environment/main.tf',
);
const nonprodMain = read('infra/gcp/storage/environments/nonprod/main.tf');
const productionMain = read(
  'infra/gcp/storage/environments/production/main.tf',
);
const preflight = read('scripts/storage/gcs-batch2-preflight.ps1');
const runbook = read(
  'docs/production-readiness/phase-5a/01-gcs-iac-and-real-proof-runbook.md',
);

test('Terraform uses two independent roots and one storage-only module', () => {
  assert.deepEqual(
    terraformFiles
      .filter((file) => file.endsWith(`${path.sep}main.tf`))
      .map((file) => path.relative(repositoryRoot, file).replaceAll('\\', '/'))
      .sort(),
    [
      'infra/gcp/storage/environments/nonprod/main.tf',
      'infra/gcp/storage/environments/production/main.tf',
      'infra/gcp/storage/modules/storage-environment/main.tf',
    ],
  );
  assert.match(nonprodMain, /environment\s*=\s*"nonprod"/u);
  assert.match(productionMain, /environment\s*=\s*"production"/u);
  assert.doesNotMatch(terraform, /\bbackend\s+"/u);
});

test('provider and Terraform constraints are explicit and bounded', () => {
  assert.match(terraform, /required_version\s*=\s*">= 1\.6\.0, < 2\.0\.0"/u);
  assert.match(terraform, /version\s*=\s*">= 7\.40\.0, < 8\.0\.0"/u);
  assert.doesNotMatch(terraform, /google-beta/u);
});

test('exactly four approved bucket names exist in the locked topology', () => {
  const discovered = [
    ...terraform.matchAll(
      /"(moazez-(?:production-91001421934|nonprod-91001421934)-(?:private|published))"/gu,
    ),
  ].map((match) => match[1]);
  assert.deepEqual([...new Set(discovered)].sort(), [
    'moazez-nonprod-91001421934-private',
    'moazez-nonprod-91001421934-published',
    'moazez-production-91001421934-private',
    'moazez-production-91001421934-published',
  ]);
  assert.doesNotMatch(terraform, /learning-media.*bucket/iu);
});

test('bucket safety contract is exact and contains no lifecycle or retention rule', () => {
  for (const expected of [
    /location\s*=\s*"ME-CENTRAL2"/u,
    /storage_class\s*=\s*"STANDARD"/u,
    /uniform_bucket_level_access\s*=\s*true/u,
    /public_access_prevention\s*=\s*"enforced"/u,
    /force_destroy\s*=\s*false/u,
    /versioning\s*\{\s*enabled\s*=\s*true\s*\}/su,
    /soft_delete_policy\s*\{\s*retention_duration_seconds\s*=\s*604800\s*\}/su,
    /prevent_destroy\s*=\s*true/u,
  ]) {
    assert.match(moduleMain, expected);
  }
  assert.doesNotMatch(terraform, /force_destroy\s*=\s*true/u);
  assert.doesNotMatch(terraform, /\blifecycle_rule\s*\{/u);
  assert.doesNotMatch(terraform, /\bretention_policy\s*\{/u);
  assert.doesNotMatch(terraform, /is_locked|Bucket Lock/iu);
});

test('CORS is explicit and separated by environment', () => {
  for (const origin of [
    'https://staging-schools.moazez.cloud',
    'https://staging-admin.moazez.cloud',
    'https://schools.moazez.cloud',
    'https://admin.moazez.cloud',
  ]) {
    assert.match(moduleMain, new RegExp(escapeRegex(origin), 'u'));
  }
  assert.match(
    moduleMain,
    /method\s*=\s*\[\s*"GET",\s*"HEAD",\s*"PUT",\s*\]/su,
  );
  assert.doesNotMatch(moduleMain, /"POST"|"DELETE"|"\*"/u);
  for (const header of [
    'Content-Type',
    'Content-Disposition',
    'Range',
    'Content-Range',
    'ETag',
    'x-goog-generation',
  ]) {
    assert.match(moduleMain, new RegExp(`"${header}"`, 'u'));
  }
  assert.match(moduleMain, /max_age_seconds\s*=\s*3600/u);
});

test('service accounts and least-privilege IAM match the locked boundary', () => {
  for (const accountId of [
    'moazez-api-runtime',
    'moazez-core-worker',
    'moazez-media-worker',
    'moazez-gcs-signer',
    'moazez-iac-deployer',
  ]) {
    assert.match(
      moduleMain,
      new RegExp(`account_id\\s*=\\s*"${accountId}"`, 'u'),
    );
  }
  assert.match(moduleMain, /roles\/storage\.objectUser/u);
  assert.match(moduleMain, /permissions\s*=\s*\["storage\.buckets\.get"\]/u);
  assert.match(moduleMain, /roles\/storage\.objectViewer/u);
  assert.match(moduleMain, /roles\/storage\.objectCreator/u);
  assert.match(moduleMain, /roles\/iam\.serviceAccountTokenCreator/u);
  const signerBinding = extractResourceBlock(
    moduleMain,
    'google_service_account_iam_member',
    'api_runtime_signer',
  );
  assert.match(signerBinding, /roles\/iam\.serviceAccountTokenCreator/u);
  assert.match(signerBinding, /\["api_runtime"\]\.member/u);
  assert.doesNotMatch(signerBinding, /\["core_worker"\]\.member/u);
  assert.doesNotMatch(signerBinding, /\["media_worker"\]\.member/u);
  assert.doesNotMatch(moduleMain, /\["iac_deployer"\]\.member/su);
});

test('IAM and resource definitions contain no dangerous/public authority', () => {
  for (const forbidden of [
    /allUsers/u,
    /allAuthenticatedUsers/u,
    /resource\s+"google_project"\s/u,
    /google_service_account_key/u,
    /google_storage_bucket_iam_policy/u,
    /google_storage_bucket_acl/u,
    /google_storage_object_acl/u,
    /predefined_acl/u,
    /default_object_acl/u,
    /roles\/storage\.admin/u,
    /roles\/storage\.objectAdmin/u,
    /roles\/owner/u,
    /roles\/editor/u,
    /roles\/resourcemanager\.projectIamAdmin/u,
    /roles\/iam\.serviceAccountAdmin/u,
  ]) {
    assert.doesNotMatch(terraform, forbidden);
  }
});

test('signer and runtime IAM references remain within each module project', () => {
  assert.match(
    moduleMain,
    /condition\s*=\s*var\.project_id\s*==\s*local\.selected\.project_id/u,
  );
  assert.doesNotMatch(moduleMain, /member\s*=\s*"serviceAccount:/u);
  for (const root of [nonprodMain, productionMain]) {
    assert.match(root, /project_id\s*=\s*var\.project_id/u);
    assert.doesNotMatch(root, /signer|serviceAccount:/u);
  }
});

test('only the four storage-critical APIs are Terraform-managed', () => {
  const projectService = extractResourceBlock(
    moduleMain,
    'google_project_service',
    'approved',
  );
  const managedApis = [
    ...projectService.matchAll(/"([a-z]+\.googleapis\.com)"/gu),
  ].map((match) => match[1]);
  assert.deepEqual([...new Set(managedApis)].sort(), [
    'cloudresourcemanager.googleapis.com',
    'iam.googleapis.com',
    'iamcredentials.googleapis.com',
    'storage.googleapis.com',
  ]);
  assert.match(projectService, /disable_on_destroy\s*=\s*false/u);
  assert.match(projectService, /disable_dependent_services\s*=\s*false/u);
  assert.doesNotMatch(projectService, /serviceusage\.googleapis\.com/u);
  assert.doesNotMatch(terraform, /secretmanager\.googleapis\.com/u);
});

test('Service Usage is an external bootstrap prerequisite, not self-bootstrapped', () => {
  assert.doesNotMatch(terraform, /serviceusage\.googleapis\.com/u);
  assert.match(
    preflight,
    /\$BootstrapRequiredApi = 'serviceusage\.googleapis\.com'/u,
  );
  assert.match(runbook, /SERVICE_USAGE_API_ENABLED/u);
  assert.match(runbook, /BOOTSTRAP_REQUIRED/u);
});

test('API-dependent resources explicitly wait for service activation', () => {
  for (const [type, name] of [
    ['google_service_account', 'storage_critical'],
    ['google_project_iam_custom_role', 'bucket_metadata_reader'],
    ['google_storage_bucket', 'application'],
  ]) {
    assert.match(
      extractResourceBlock(moduleMain, type, name),
      /depends_on\s*=\s*\[google_project_service\.approved\]/u,
    );
  }
  assert.doesNotMatch(terraform, /time_sleep|retry|sleep/iu);
});

test('outputs contain identifiers only', () => {
  const outputs = terraformFiles
    .filter((file) => file.endsWith(`${path.sep}outputs.tf`))
    .map((file) => fs.readFileSync(file, 'utf8'))
    .join('\n');
  assert.doesNotMatch(outputs, /token|credential|private_key|signed_url/iu);
  for (const name of [
    'project_id',
    'private_bucket_name',
    'published_bucket_name',
    'api_runtime_service_account_email',
    'core_worker_service_account_email',
    'media_worker_service_account_email',
    'gcs_signer_service_account_email',
    'iac_deployer_service_account_email',
  ]) {
    assert.match(outputs, new RegExp(`output "${name}"`, 'u'));
  }
});

function read(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function extractResourceBlock(source, type, name) {
  const declaration = `resource "${type}" "${name}"`;
  const start = source.indexOf(declaration);
  assert.notEqual(start, -1, `${declaration} is missing`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`${declaration} is not closed`);
}
