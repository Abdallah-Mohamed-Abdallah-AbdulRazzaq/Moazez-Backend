'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { REPOSITORY_ROOT } = require('../../tests/helpers/staging-retirement-source-policy.cjs');
const policy = require('../../storage/gcs-batch2-proof-policy.cjs');
const object = require('../../storage/gcs-batch2-proof.cjs');
const iam = require('../../storage/gcs-batch2-iam-proof.cjs');
const migration = require('../../migrations/run-governed-migration-job.cjs');
const badSelectors = ['staging', 'nonprod', undefined, null, '', ' ', 'production ', 'PRODUCTION', 'Production', 'unknown', 'preview', 'constructor', '__proto__', 'toString'];
const legacyPath = path.join(REPOSITORY_ROOT, 'scripts/storage/gcs-batch2-readonly-proof.ps1');
const preflightPath = path.join(REPOSITORY_ROOT, 'scripts/storage/gcs-batch2-preflight.ps1');
const psHost = process.platform === 'win32'
  ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  : (process.env.PATH || '').split(path.delimiter).map((directory) => path.join(directory, 'pwsh')).find((file) => fs.existsSync(file));
assert.ok(psHost, 'PowerShell host is a required verification prerequisite');
function psQuote(value) { return "'" + value.replace(/'/gu, "''") + "'"; }
function runPs(body, env = {}) {
  return spawnSync(psHost, ['-NoProfile', '-NonInteractive', '-Command', '& {\n' + body + '\n}'], { encoding: 'utf8', windowsHide: true, timeout: 20000, input: '', env: { ...process.env, ...env } });
}
function assertPs(result) { assert.equal(result.status, 0, result.stderr || result.error?.message); return result.stdout.trim(); }
function ownedScratch(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'moazez-retirement-test-'));
  t.after(() => {
    const resolved = path.resolve(root);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep + 'moazez-retirement-test-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  return root;
}
function guardedLoader(file, ledger, cache = new Map()) {
  if (cache.has(file)) return cache.get(file).exports;
  const filename = path.join(REPOSITORY_ROOT, file);
  const code = fs.readFileSync(filename, 'utf8');
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const requireDependency = Module.createRequire(filename);
  const sink = new Proxy({}, { get(_target, name) { return () => { ledger.push(String(name)); throw new Error('unexpected_external_effect'); }; } });
  loaded.require = (specifier) => {
    if (['node:fs', 'node:fs/promises', 'node:child_process'].includes(specifier)) return sink;
    if (specifier.startsWith('.')) return guardedLoader(path.relative(REPOSITORY_ROOT, path.resolve(path.dirname(filename), specifier)).replace(/\\/gu, '/'), ledger, cache);
    return requireDependency(specifier);
  };
  cache.set(file, loaded);
  loaded._compile(code, filename);
  return loaded.exports;
}
test('Release exported operational actions and CLI retire before every file or subprocess sink', () => {
  const ledger = [];
  const release = guardedLoader('scripts/deployment-control/runtime-release-control.cjs', ledger);
  for (const name of ['runCli', 'buildManifest', 'buildCapacityAwareReleaseManifestV6', 'buildPostEdgeSourceContinuationManifestV6', 'validateManifest', 'registerPlan', 'approvePlan', 'recordApply', 'recordVerification', 'writeJsonAtomic']) {
    assert.throws(() => release[name]('/inaccessible', { environment: 'production' }), { code: 'STAGING_ENVIRONMENT_RETIRED' }, name);
  }
  for (const command of ['create-spec', 'validate-spec', 'review-plan', 'register-plan', 'approve-plan', 'record-apply', 'record-verification']) {
    assert.throws(() => release.runCli([command, '--input', '/inaccessible']), { code: 'STAGING_ENVIRONMENT_RETIRED' });
  }
  assert.deepEqual(ledger, []);
  assert.equal(typeof release.reviewTerraformPlanJson, 'function');
  assert.equal(typeof release.reviewV6RuntimePlanJson, 'function');
});
test('Capacity retired/unknown/forged authority rejects before Git, evidence reads and writers', () => {
  const ledger = [];
  const capacity = guardedLoader('scripts/deployment-control/runtime-capacity-control.cjs', ledger);
  for (const environment of badSelectors) {
    const code = ['staging', 'nonprod'].includes(environment) ? 'CAPACITY_ENVIRONMENT_RETIRED' : 'CAPACITY_ENVIRONMENT_UNSUPPORTED';
    assert.throws(() => capacity.environmentAuthority(environment), { code });
    assert.throws(() => capacity.buildCapacityExecution({ environment }), { code });
    assert.throws(() => capacity.validateCapacityExecution({ environment }), { code });
    assert.throws(() => capacity.loadPromotionStabilityEvidence({ path: '/poison' }, environment), { code });
    assert.throws(() => capacity.writeJsonAtomic('/poison', { environment }), { code });
  }
  const forged = { environment: 'production', environmentAuthority: { ...capacity.CAPACITY_ENVIRONMENTS.staging } };
  assert.throws(() => capacity.validateCapacityExecution(forged), { code: 'CAPACITY_ENVIRONMENT_IDENTITY_MISMATCH' });
  assert.throws(() => capacity.writeJsonAtomic('/poison', forged), { code: 'CAPACITY_ENVIRONMENT_IDENTITY_MISMATCH' });
  assert.deepEqual(ledger, []);
  assert.deepEqual(capacity.environmentAuthority('production'), capacity.CAPACITY_ENVIRONMENTS.production);
  assert.equal(capacity.BASELINE_CAPACITY_SPECS.production.api.serviceMaxInstances, 10);
});
test('all current object operational APIs reject before adapter, ADC and evidence effects', async () => {
  let effects = 0;
  const adapter = new Proxy({}, { get() { effects += 1; throw new Error('adapter_effect'); } });
  for (const environmentName of [...badSelectors, 'production']) {
    const configuration = { environmentName };
    const message = environmentName === 'production' ? 'production_object_writes_prohibited' : ['staging', 'nonprod'].includes(environmentName) ? 'retired_staging_environment' : 'proof_environment_invalid';
    assert.throws(() => object.createActualGcsAdapter(configuration), { message });
    await assert.rejects(object.resolveActiveAdcIdentity(configuration), { message });
    await assert.rejects(object.runProof(configuration, adapter), { message });
    await assert.rejects(object.assertAvailable(adapter, configuration, {}), { message });
    const args = environmentName == null ? [] : ['--environment', environmentName];
    await assert.rejects(policy.executeGuardedObjectProof({ args, env: {}, repositoryRoot: REPOSITORY_ROOT, resolveRuntimeIdentity() { effects += 1; }, createProvider() { effects += 1; }, execute() { effects += 1; } }));
  }
  assert.equal(effects, 0);
});
test('IAM exported operational APIs refuse retired and forged targets before injected clients', async () => {
  let effects = 0;
  const callback = () => { effects += 1; throw new Error('cloud_effect'); };
  const sourceClient = { request: callback };
  for (const environmentName of badSelectors) {
    await assert.rejects(iam.runIamProof({ environmentName }, { createSourceClient: callback, createIdentityClient: callback, testPermissions: callback }));
    await assert.rejects(iam.checkOperatorImpersonationPrerequisites(sourceClient, { environmentName }, callback));
  }
  for (const url of ['https://storage.googleapis.com/storage/v1/b/moazez-nonprod-91001421934-private/iam/testPermissions', iam.projectPermissionUrl('foreign'), iam.serviceAccountPermissionUrl('moazez-production', 'foreign@moazez-production.iam.gserviceaccount.com'), iam.bucketPermissionUrl('moazez-production-91001421934-private') + '?unsafe=1']) {
    await assert.rejects(iam.testPermissions(sourceClient, url, ['storage.buckets.get']), /iam_production_target_invalid/u);
  }
  await assert.rejects(iam.assertPermissionContract({ resourceKind: 'bucket', bucket: 'foreign', expected: ['storage.buckets.get'], prohibited: [], auth: sourceClient, testPermissions: callback }), /iam_production_target_invalid/u);
  assert.equal(effects, 0);
});
test('Production IAM read-only GET repeated queries and POST JSON bodies stay current', async () => {
  const requests = [];
  const auth = { async request(request) { requests.push(request); return { data: { permissions: ['storage.buckets.get'] } }; } };
  const permissions = ['storage.buckets.get', 'storage.objects.list'];
  const bucket = iam.bucketPermissionUrl('moazez-production-91001421934-private');
  await iam.testPermissions(auth, bucket, permissions);
  const get = requests.pop();
  assert.equal(get.method, 'GET');
  assert.deepEqual(new URL(get.url).searchParams.getAll('permissions'), permissions);
  assert.equal(Object.hasOwn(get, 'data'), false);
  for (const url of [iam.projectPermissionUrl('moazez-production'), iam.serviceAccountPermissionUrl('moazez-production', 'moazez-api-runtime@moazez-production.iam.gserviceaccount.com')]) {
    await iam.testPermissions(auth, url, permissions, 'POST');
    assert.deepEqual(requests.pop(), { url, method: 'POST', data: { permissions } });
  }
});
test('migration runner and exported executor refuse retired selectors before manifest, spawn or DB', async () => {
  let effects = 0;
  const callback = () => { effects += 1; throw new Error('migration_effect'); };
  const environmentBase = { DATABASE_URL: 'postgresql://moazez_migration:synthetic@127.0.0.1:1/test?connection_limit=2&schema=public', MIGRATION_JOB_EXECUTION_ID: 'retirement-test', MIGRATION_JOB_ARTIFACT_DIGEST: 'sha256:' + 'a'.repeat(64), MIGRATION_JOB_APPROVAL_REF: 'APPROVED:retirement-test:synthetic', MIGRATION_JOB_BACKUP_CHECKPOINT: 'BACKUP:retirement-test:synthetic', MIGRATION_JOB_DATA_AUTHORITY: 'DATA_AUTHORITY:retirement-test:synthetic' };
  for (const environmentName of badSelectors) {
    const environment = { ...environmentBase, MIGRATION_JOB_ENVIRONMENT: environmentName };
    await assert.rejects(migration.runGovernedMigrationJob({ environment, logger() {}, verifyManifest: callback, executePrisma: callback }), { code: 'migration_environment_contract_invalid' });
    const execute = migration.createPrismaExecutor({ spawnProcess: callback });
    await assert.rejects(execute(['validate'], 1000, environment), { code: 'migration_environment_contract_invalid' });
  }
  assert.equal(effects, 0);
});
test('B001-C02 normal execution refuses all selector forms without prompt or evidence', (t) => {
  const root = ownedScratch(t);
  const marker = path.join(root, 'unexpected-cloud-marker');
  const markerCode = "require('node:fs').writeFileSync(process.env.B001_MARKER,'unexpected')";
  const fakeGcloud = process.platform === 'win32'
    ? '@echo off\r\n' + JSON.stringify(process.execPath) + ' -e ' + JSON.stringify(markerCode) + '\r\n'
    : '#!' + process.execPath + '\n' + markerCode + ';\n';
  fs.writeFileSync(path.join(root, 'gcloud.cmd'), fakeGcloud, { mode: 0o700 });
  const env = { GOOGLE_APPLICATION_CREDENTIALS: path.join(root, 'absent-adc.json'), CLOUDSDK_CONFIG: root, B001_MARKER: marker, PATH: root };
  const vectors = [[], ['-Environment', 'production'], ['-Environment', 'staging'], ['-Environment', 'nonprod'], ['-Environment', 'unknown'], ['-Environment', 'preview'], ['-Environment', ''], ['-Environment', ' '], ['-Environment', 'PRODUCTION'], ['-Environment', 'Production'], ['-Environment'], ['-UnknownSelector', 'production']];
  for (const args of vectors) {
    const result = spawnSync(psHost, ['-NoProfile', '-NonInteractive', '-File', legacyPath, ...args], { encoding: 'utf8', windowsHide: true, timeout: 20000, input: '', env: { ...process.env, ...env } });
    assert.equal(result.error, undefined, result.error?.message);
    assert.notEqual(result.status, 0, JSON.stringify(args));
    assert.match(result.stderr, /LEGACY_STORAGE_PROOF_RETIRED/u);
    assert.doesNotMatch(result.stderr, /Supply values|mandatory parameters|ValidateSet/iu);
    assert.equal(result.stdout.trim(), '');
    assert.equal(fs.existsSync(marker), false);
  }
});
test('B001-C03 dot-source and call operator install no functions or runtime coordinates', () => {
  const body = String.raw`$names = @('Invoke-GcloudCapture','Invoke-GcloudJson','Get-NestedValue','Assert-Exact','Assert-SetEqual','Get-BindingMembers','Assert-ManagedBindingContract','Get-BucketEvidence','Assert-IamContract','Get-ProductionObjectCounts','Get-RegionalEndpointDiagnostic')
$targets = @('production','staging','nonprod','unknown','preview','',' ','PRODUCTION','Production',$null,@('production','staging'),@{ target = 'production' })
foreach ($target in $targets) {
  foreach ($mode in @('call','dot')) {
    $message = ''
    try { if ($mode -eq 'dot') { . __LEGACY__ -Environment $target } else { & __LEGACY__ -Environment $target } } catch { $message = $_.Exception.Message }
    if ($message -cne 'LEGACY_STORAGE_PROOF_RETIRED') { throw 'wrong_retirement_error' }
    foreach ($name in $names) { if (Test-Path ('Function:\\' + $name)) { throw ('exposed_function_' + $name) } }
    foreach ($name in @('Locked','Selected','RuntimeEmails','ExpectedServiceAccounts')) { if (Test-Path ('Variable:\\' + $name)) { throw ('exposed_coordinate_' + $name) } }
  }
}
'BOUNDARIES_PASS'`.replaceAll('__LEGACY__', psQuote(legacyPath));
  assert.equal(assertPs(runPs(body)), 'BOUNDARIES_PASS');
});
test('B001-C04 all command/auth/bucket/write tripwires remain zero and unmodified', (t) => {
  const root = ownedScratch(t);
  const marker = path.join(root, 'unexpected-effect');
  const body = String.raw`$global:RetirementEffects = 0
$names = @('Get-Command','gcloud','Invoke-GcloudCapture','Invoke-GcloudJson','Resolve-GcloudCommandPath','Get-ProjectReport','Get-BucketEvidence','Get-ProductionObjectCounts','Get-RegionalEndpointDiagnostic','Assert-IamContract','Invoke-WebRequest','Invoke-RestMethod','New-Item','Set-Content','Out-File','Add-Content')
$definitions = @{}
foreach ($name in $names) {
  Set-Item ('Function:\\global:' + $name) { $global:RetirementEffects += 1; throw 'unexpected_effect_tripwire' }
  $definitions[$name] = (Get-Item ('Function:\\' + $name)).Definition
}
foreach ($target in @('production','staging','nonprod','unknown',$null,'',' ','PRODUCTION')) {
  foreach ($mode in @('call','dot')) {
    $message = ''
    try { if ($mode -eq 'dot') { . __LEGACY__ -Environment $target } else { & __LEGACY__ -Environment $target } } catch { $message = $_.Exception.Message }
    if ($message -cne 'LEGACY_STORAGE_PROOF_RETIRED') { throw 'wrong_retirement_error' }
    if ($global:RetirementEffects -ne 0) { throw 'tripwire_was_invoked' }
    foreach ($name in $names) { if ((Get-Item ('Function:\\' + $name)).Definition -cne $definitions[$name]) { throw 'tripwire_was_overwritten' } }
  }
}
'TRIPWIRES_PASS'`.replaceAll('__LEGACY__', psQuote(legacyPath));
  assert.equal(assertPs(runPs(body, { GOOGLE_APPLICATION_CREDENTIALS: path.join(root, 'absent.json'), CLOUDSDK_CONFIG: root, B001_MARKER: marker })), 'TRIPWIRES_PASS');
  assert.equal(fs.existsSync(marker), false);
});
test('B001-C05 preflight rejects non-Production before command lookup and legacy Production still refuses', () => {
  for (const target of ['staging', 'nonprod', 'unknown', 'preview', '', ' ', 'PRODUCTION', 'Production']) {
    const body = "$global:effects = 0; function Get-Command { $global:effects += 1; throw 'lookup_effect' }; $message = ''; try { & " + psQuote(preflightPath) + ' -Environment ' + psQuote(target) + " } catch { $message = $_.Exception.Message }; if ($message -cne 'PREFLIGHT_ENVIRONMENT_INVALID' -or $global:effects -ne 0) { throw 'preflight_not_closed' }; 'PREFLIGHT_CLOSED'";
    assert.equal(assertPs(runPs(body)), 'PREFLIGHT_CLOSED');
  }
  const missing = "$global:effects = 0; function Get-Command { $global:effects += 1; throw 'lookup_effect' }; $message = ''; try { & " + psQuote(preflightPath) + " } catch { $message = $_.Exception.Message }; if ($message -cne 'PREFLIGHT_ENVIRONMENT_INVALID' -or $global:effects -ne 0) { throw 'preflight_not_closed' }; 'PREFLIGHT_CLOSED'";
  assert.equal(assertPs(runPs(missing)), 'PREFLIGHT_CLOSED');
});

test('B001-C05 explicit Production preflight preserves limited read-only reporting through a synthetic executable', (t) => {
 const root = ownedScratch(t);
 const fakePath = path.join(root, 'synthetic-gcloud.cjs');
 const captureLog = path.join(root, 'captured-arguments.jsonl');
 fs.writeFileSync(fakePath, "const fs = require('node:fs');\nconst args = process.argv.slice(2);\nfs.appendFileSync(process.env.RETIREMENT_CAPTURE_LOG, JSON.stringify(args) + '\\n');\nif (args[0] === 'auth') { process.stdout.write('synthetic-operator@example.test'); }\nelse if (args[0] === 'projects') { console.log(JSON.stringify({ lifecycleState: 'ACTIVE', projectNumber: '91001421934' })); }\nelse if (args[0] === 'billing') { console.log(JSON.stringify({ billingEnabled: true })); }\nelse if (args[0] === 'services') { console.log(JSON.stringify(['serviceusage.googleapis.com','storage.googleapis.com','iam.googleapis.com','iamcredentials.googleapis.com','cloudresourcemanager.googleapis.com'].map(name => ({ config: { name } })))); }\nelse if (args[0] === 'storage') { console.log(JSON.stringify(['private','published'].map(suffix => ({ name: 'moazez-production-91001421934-' + suffix, location: 'ME-CENTRAL2', storageClass: 'STANDARD' })))); }\nelse if (args[1] === 'service-accounts') { console.log(JSON.stringify(['moazez-api-runtime','moazez-core-worker','moazez-media-worker','moazez-gcs-signer','moazez-iac-deployer'].map(id => ({ email: id + '@moazez-production.iam.gserviceaccount.com' })))); }\nelse if (args[1] === 'roles') { console.log(JSON.stringify({ name: 'projects/moazez-production/roles/moazezStorageBucketMetadataReader', stage: 'GA' })); }\nelse { throw new Error('unapproved_fake_invocation'); }\n");
 const shim = process.platform === 'win32'
   ? '@echo off\r\n' + JSON.stringify(process.execPath) + ' ' + JSON.stringify(fakePath) + ' %*\r\n'
   : '#!' + process.execPath + '\nrequire(' + JSON.stringify(fakePath) + ');\n';
 fs.writeFileSync(path.join(root, 'gcloud.cmd'), shim, { mode: 0o700 });
 const result = spawnSync(psHost, ['-NoProfile', '-NonInteractive', '-File', preflightPath, '-Environment', 'production'], { encoding: 'utf8', timeout: 30000, input: '', windowsHide: true, env: { ...process.env, PATH: root, RETIREMENT_CAPTURE_LOG: captureLog, CLOUDSDK_CONFIG: root, GOOGLE_APPLICATION_CREDENTIALS: path.join(root, 'absent.json') } });
 assert.equal(result.status, 0, result.stderr || result.error?.message);
 const report = JSON.parse(result.stdout);
 assert.equal(report.schemaVersion, 2);
 assert.equal(report.environment, 'production');
 assert.equal(report.AUTHENTICATION_STATUS, 'PASS');
 assert.equal(report.INSPECTION_STATUS, 'PASS');
 assert.equal(report.READY_FOR_NONPROD_TERRAFORM_PLAN, 'NO');
 assert.equal(report.production.projectId, 'moazez-production');
 assert.equal(report.production.projectNumber, '91001421934');
 assert.equal(report.production.EXISTING_TARGET_RESOURCES, 'REVIEW_REQUIRED');
 assert.deepEqual(report.production.targetResources.buckets.map(item => item.state), ['EXISTS', 'EXISTS']);
 const calls = fs.readFileSync(captureLog, 'utf8').trim().split('\n').map(line => JSON.parse(line));
 assert.equal(calls.length, 7);
 for (const args of calls) {
   assert.doesNotMatch(args.join(' '), /nonprod|staging|activate|login|set-iam-policy|update|create|delete|terraform/iu);
   assert.ok(args[0] === 'auth' || args.includes('moazez-production') || args.includes('--project=moazez-production'));
 }
});
