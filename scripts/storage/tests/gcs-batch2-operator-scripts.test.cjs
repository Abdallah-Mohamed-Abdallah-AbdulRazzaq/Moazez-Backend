'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const {
  assertPermissionContract,
  bucketPermissionUrl,
  checkOperatorImpersonationPrerequisites,
  projectPermissionUrl,
  runIamProof,
  serviceAccountPermissionUrl,
  testPermissions,
} = require('../gcs-batch2-iam-proof.cjs');
const { assertEvidenceSafe } = require('../gcs-batch2-proof-policy.cjs');
const {
  assertAvailable,
  executeProofStage,
} = require('../gcs-batch2-proof.cjs');

const repositoryRoot = path.resolve(__dirname, '..', '..', '..');
const preflight = read('scripts/storage/gcs-batch2-preflight.ps1');
const readOnlyProof = read('scripts/storage/gcs-batch2-readonly-proof.ps1');
const objectProof = read('scripts/storage/gcs-batch2-proof.cjs');
const iamProof = read('scripts/storage/gcs-batch2-iam-proof.cjs');
const runbook = read(
  'docs/production-readiness/phase-5a/01-gcs-iac-and-real-proof-runbook.md',
);

test('preflight is read-only, fail-closed, and distinguishes visibility failures', () => {
  for (const required of [
    'activeGcloudAccount',
    'lifecycleState',
    'billingEnabled',
    'projectNumber',
    'requiredApis',
    'buckets',
    'relevantServiceAccounts',
    'NONPROD_PROJECT_ACCESS',
    'READY_FOR_NONPROD_TERRAFORM_PLAN',
    'ACCESS_DENIED',
    'NOT_FOUND',
    'UNRESOLVED',
    'EXISTING_TARGET_RESOURCES',
    'REVIEW_REQUIRED',
    'BOOTSTRAP_REQUIRED_API',
    'TERRAFORM_MANAGED_APIS',
  ]) {
    assert.match(preflight, new RegExp(required, 'u'));
  }
  assert.match(preflight, /if \(-not \$ready\) \{ exit 3 \}/u);
  assert.match(preflight, /Get-Command gcloud\.cmd -CommandType Application/u);
  assert.doesNotMatch(preflight, /&\s+gcloud\b|Get-Command gcloud\s/u);
  assert.doesNotMatch(
    preflight,
    /projects['", ]+create|services['", ]+enable|add-iam-policy-binding|set-iam-policy|storage['", ]+buckets['", ]+create|billing['", ]+(?:enable|link)|print-access-token/iu,
  );
});

test('preflight classifies ambiguous project access as unresolved', () => {
  assert.equal(
    classifyPreflightError(
      'The caller does not have permission to access project X (or it may not exist).',
    ),
    'UNRESOLVED',
  );
  assert.equal(
    classifyPreflightError(
      'PERMISSION_DENIED: Permission resourcemanager.projects.get denied.',
    ),
    'ACCESS_DENIED',
  );
  assert.equal(
    classifyPreflightError('NOT_FOUND: Project X was not found.'),
    'NOT_FOUND',
  );
  assert.equal(
    classifyPreflightError('UNAUTHENTICATED: login required.'),
    'UNRESOLVED',
  );
  assert.equal(
    classifyPreflightError(
      'Reauthentication failed: invalid_grant; cannot refresh auth tokens.',
    ),
    'AUTHENTICATION_FAILED',
  );
});

test('Windows-safe gcloud capture preserves success output and expected nonzero errors', () => {
  const fixture = createGcloudFixture();
  try {
    const success = captureGcloudFixture(fixture.commandPath, 'success');
    assert.equal(success.result.status, 0, success.result.stderr);
    assert.equal(success.capture.ExitCode, 0);
    assert.match(success.capture.Stdout, /fixture-success-stdout/u);
    assert.match(success.capture.Stderr, /fixture-success-stderr/u);
    assert.doesNotMatch(success.result.stderr, /NativeCommandError/u);

    const notFound = captureGcloudFixture(fixture.commandPath, 'not-found');
    assert.equal(notFound.result.status, 0, notFound.result.stderr);
    assert.equal(notFound.capture.ExitCode, 7);
    assert.match(
      notFound.capture.Stderr,
      /moazezStorageBucketMetadataReader.*was not found/su,
    );
    assert.equal(classifyPreflightError(notFound.capture.Stderr), 'NOT_FOUND');
    assert.equal(classifyCustomRoleError(notFound.capture.Stderr), 'ABSENT');
    assert.doesNotMatch(notFound.result.stderr, /NativeCommandError/u);
  } finally {
    fixture.remove();
  }
});

test('captured authentication failure is fail-closed and never resource absence', () => {
  const fixture = createGcloudFixture();
  try {
    const authenticationFailure = captureGcloudFixture(
      fixture.commandPath,
      'authentication-failure',
    );
    assert.equal(
      authenticationFailure.result.status,
      0,
      authenticationFailure.result.stderr,
    );
    assert.equal(authenticationFailure.capture.ExitCode, 8);
    assert.equal(
      classifyPreflightError(authenticationFailure.capture.Stderr),
      'AUTHENTICATION_FAILED',
    );
    assert.equal(
      classifyCustomRoleError(authenticationFailure.capture.Stderr),
      'AUTHENTICATION_FAILED',
    );
    assert.notEqual(
      classifyCustomRoleError(authenticationFailure.capture.Stderr),
      'ABSENT',
    );
    assert.doesNotMatch(
      authenticationFailure.result.stderr,
      /NativeCommandError/u,
    );
  } finally {
    fixture.remove();
  }
});

test('preflight separates Service Usage bootstrap and approved target collisions', () => {
  assert.match(preflight, /serviceusage\.googleapis\.com/u);
  for (const api of [
    'storage.googleapis.com',
    'iam.googleapis.com',
    'iamcredentials.googleapis.com',
    'cloudresourcemanager.googleapis.com',
  ]) {
    assert.match(preflight, new RegExp(escapeRegex(api), 'u'));
  }
  for (const target of [
    'moazez-production-91001421934-private',
    'moazez-production-91001421934-published',
    'moazez-nonprod-91001421934-private',
    'moazez-nonprod-91001421934-published',
    'moazez-api-runtime',
    'moazez-core-worker',
    'moazez-media-worker',
    'moazez-gcs-signer',
    'moazez-iac-deployer',
  ]) {
    assert.match(preflight, new RegExp(escapeRegex(target), 'u'));
  }
  assert.match(
    preflight,
    /\$nonprodServiceUsage\.enabled -eq \$true[\s\S]*\$nonprod\.EXISTING_TARGET_RESOURCES -eq 'NONE'/u,
  );
});

test('production configuration proof is read-only and checks three object states', () => {
  assert.match(readOnlyProof, /--all-versions/u);
  assert.match(readOnlyProof, /--soft-deleted/u);
  assert.match(readOnlyProof, /--exhaustive/u);
  assert.match(readOnlyProof, /LIVE_OBJECTS/u);
  assert.match(readOnlyProof, /NONCURRENT_OBJECTS/u);
  assert.match(readOnlyProof, /SOFT_DELETED_OBJECTS/u);
  assert.match(readOnlyProof, /productionObjectWritesProhibited = \$true/u);
  assert.doesNotMatch(
    readOnlyProof,
    /storage['", ]+(?:cp|mv|rm)|buckets['", ]+(?:create|delete|update)|add-iam-policy-binding|set-iam-policy/iu,
  );
});

test('regional endpoint diagnostic is temporary, read-only, and non-blocking', () => {
  assert.match(
    readOnlyProof,
    /https:\/\/storage\.me-central2\.rep\.googleapis\.com\//u,
  );
  assert.match(readOnlyProof, /NON_BLOCKING_FAILURE/u);
  assert.match(
    readOnlyProof,
    /Remove-Item Env:CLOUDSDK_API_ENDPOINT_OVERRIDES_STORAGE/u,
  );
  assert.doesNotMatch(objectProof, /rep\.googleapis\.com/u);
});

test('IAM proof uses read-only permission tests and no destructive probe', () => {
  assert.match(iamProof, /iam\/testPermissions/u);
  assert.match(iamProof, /:testIamPermissions/u);
  for (const permission of [
    'storage.buckets.create',
    'storage.buckets.delete',
    'storage.buckets.update',
    'storage.buckets.getIamPolicy',
    'storage.buckets.setIamPolicy',
    'storage.objects.delete',
    'iam.serviceAccounts.signBlob',
    'iam.serviceAccounts.getAccessToken',
    'resourcemanager.projects.setIamPolicy',
  ]) {
    assert.match(iamProof, new RegExp(escapeRegex(permission), 'u'));
  }
  assert.doesNotMatch(
    iamProof,
    /\.(?:delete|deleteObject|createBucket|setIamPolicy)\s*\(/u,
  );
  assert.match(iamProof, /operator_impersonation_permission_missing/u);
  assert.ok(
    iamProof.indexOf(
      'await dependencies.checkOperatorImpersonationPrerequisites',
    ) <
      iamProof.indexOf(
        'dependencies.createIdentityClient(sourceClient, principal)',
      ),
  );
  assert.doesNotMatch(iamProof, /projects\/-\/serviceAccounts/u);
  assert.doesNotMatch(iamProof, /params:\s*\{\s*permissions\s*\}/u);
});

test('bucket testIamPermissions serializes six ordered repeated query entries with no body', async () => {
  const permissions = [
    'storage.buckets.get',
    'storage.objects.create',
    'storage.objects.delete',
    'storage.objects.get',
    'storage.objects.list',
    'storage.objects.update',
  ];
  let request;
  const granted = await testPermissions(
    {
      async request(input) {
        request = input;
        return { data: { permissions: [...permissions] } };
      },
    },
    bucketPermissionUrl('moazez-nonprod-91001421934-private'),
    permissions,
    'GET',
  );

  assert.deepEqual(granted, permissions);
  assert.equal(request.method, 'GET');
  assert.equal(Object.hasOwn(request, 'data'), false);
  assert.equal(Object.hasOwn(request, 'body'), false);
  assert.equal(Object.hasOwn(request, 'params'), false);
  const url = new URL(request.url);
  assert.deepEqual(url.searchParams.getAll('permissions'), permissions);
  assert.equal(url.searchParams.getAll('permissions').length, 6);
  assert.equal(
    url.search.slice(1),
    permissions
      .map((permission) => `permissions=${encodeURIComponent(permission)}`)
      .join('&'),
  );
  assert.equal(
    (request.url.match(/[?&]permissions=/gu) ?? []).length,
    permissions.length,
  );
  assert.doesNotMatch(request.url, /permissions=[^&]*(?:,|%2C)/iu);
});

test('project and service-account testIamPermissions preserve POST JSON bodies', async () => {
  const cases = [
    {
      resource: projectPermissionUrl('moazez-nonprod-91001421934'),
      permissions: [
        'storage.buckets.create',
        'resourcemanager.projects.setIamPolicy',
      ],
    },
    {
      resource: serviceAccountPermissionUrl(
        'moazez-nonprod-91001421934',
        'moazez-gcs-signer@moazez-nonprod-91001421934.iam.gserviceaccount.com',
      ),
      permissions: [
        'iam.serviceAccounts.getAccessToken',
        'iam.serviceAccounts.signBlob',
      ],
    },
  ];

  for (const testCase of cases) {
    let request;
    await testPermissions(
      {
        async request(input) {
          request = input;
          return { data: { permissions: [] } };
        },
      },
      testCase.resource,
      testCase.permissions,
      'POST',
    );
    assert.deepEqual(request, {
      url: testCase.resource,
      method: 'POST',
      data: { permissions: testCase.permissions },
    });
    assert.equal(new URL(request.url).search, '');
  }
});

test('IAM permission probes enforce bucket, project, and service-account resource scope', async () => {
  let called = false;
  for (const permission of ['storage.buckets.create', 'storage.buckets.list']) {
    await assert.rejects(
      assertPermissionContract({
        auth: {},
        resourceKind: 'bucket',
        bucket: 'moazez-nonprod-91001421934-private',
        expected: [],
        prohibited: [permission],
        name: 'invalid_bucket_project_permission_scope',
        async testPermissions() {
          called = true;
          return [];
        },
      }),
      /iam_permission_resource_scope_mismatch/u,
    );
  }
  assert.equal(called, false);

  const { configuration, dependencies, requests } = createPassingIamProof();
  const evidence = await runIamProof(configuration, dependencies);
  assert.equal(evidence.status, 'PASS');
  assert.equal(evidence.identities.length, 4);
  assert.equal(
    evidence.identities[0].checks[3].expectedGranted[0],
    'iam.serviceAccounts.getAccessToken',
  );
  assert.doesNotThrow(() => assertEvidenceSafe(evidence));

  const bucketRequests = requests.filter(({ url }) =>
    url.startsWith('https://storage.googleapis.com/storage/v1/b/'),
  );
  assert.ok(bucketRequests.length > 0);
  assert.ok(bucketRequests.every(({ method }) => method === 'GET'));
  assert.ok(
    bucketRequests.every(
      ({ permissions }) => !permissions.includes('storage.buckets.create'),
    ),
  );

  const projectRequests = requests.filter(({ url }) =>
    url.startsWith(
      'https://cloudresourcemanager.googleapis.com/v3/projects/moazez-nonprod-91001421934:testIamPermissions',
    ),
  );
  assert.equal(projectRequests.length, 4);
  assert.ok(projectRequests.every(({ method }) => method === 'POST'));
  assert.ok(
    projectRequests.every(({ permissions }) =>
      permissions.includes('storage.buckets.create'),
    ),
  );

  const signerRequests = requests.filter(({ url }) =>
    url.startsWith(
      'https://iam.googleapis.com/v1/projects/moazez-nonprod-91001421934/serviceAccounts/',
    ),
  );
  assert.equal(signerRequests.length, 4);
  assert.ok(signerRequests.every(({ method }) => method === 'POST'));
  assert.ok(
    signerRequests.every(({ url }) =>
      decodeURIComponent(url).includes(
        '/serviceAccounts/moazez-gcs-signer@moazez-nonprod-91001421934.iam.gserviceaccount.com:testIamPermissions',
      ),
    ),
  );
  assert.ok(
    signerRequests.every(({ permissions }) =>
      [
        'iam.serviceAccounts.getAccessToken',
        'iam.serviceAccounts.signBlob',
      ].every((permission) => permissions.includes(permission)),
    ),
  );

  const apiSignerRequest = signerRequests.find(({ principal }) =>
    principal.startsWith('moazez-api-runtime@'),
  );
  const coreSignerRequest = signerRequests.find(({ principal }) =>
    principal.startsWith('moazez-core-worker@'),
  );
  const mediaSignerRequest = signerRequests.find(({ principal }) =>
    principal.startsWith('moazez-media-worker@'),
  );
  assert.deepEqual(apiSignerRequest.granted.sort(), [
    'iam.serviceAccounts.getAccessToken',
    'iam.serviceAccounts.signBlob',
  ]);
  assert.deepEqual(coreSignerRequest.granted, []);
  assert.deepEqual(mediaSignerRequest.granted, []);

  const signerIdentity = evidence.identities.find(
    ({ runtimeRole }) => runtimeRole === 'gcs-signer',
  );
  const signerAdministrationCheck = signerIdentity.checks.find(
    ({ name }) => name === 'signer_service_account_administration_denied',
  );
  assert.equal(signerAdministrationCheck.resourceKind, 'service_account');
  assert.ok(
    signerAdministrationCheck.expectedDenied.includes(
      'iam.serviceAccounts.delete',
    ),
  );
});

test('IAM proof records sanitized stage metadata for an early Google API exception', async () => {
  const configuration = iamProofConfiguration();
  const unsafeError = new Error(
    'Authorization: Bearer ya29.secret-token; signedUrl=https://example.test/?X-Goog-Signature=secret',
  );
  unsafeError.response = {
    status: 403,
    data: {
      error: {
        status: 'PERMISSION_DENIED',
        message: 'raw sensitive response body with credentials',
      },
    },
    headers: { authorization: 'Bearer ya29.secret-token' },
  };
  const evidence = await runIamProof(configuration, {
    async createSourceClient() {
      return { principal: 'operator' };
    },
    createIdentityClient(_sourceClient, principal) {
      return { principal };
    },
    async checkOperatorImpersonationPrerequisites() {
      return operatorPrerequisitesPass();
    },
    async testPermissions() {
      throw unsafeError;
    },
  });

  assert.equal(evidence.status, 'FAIL');
  assert.deepEqual(evidence.identities, []);
  assert.equal(evidence.failureCode, 'iam_permission_probe_failed');
  assert.equal(evidence.failureStage, 'permission_probe');
  assert.equal(evidence.failureIdentity, 'api');
  assert.equal(evidence.failureProbe, 'private_bucket_runtime_permissions');
  assert.equal(evidence.resourceKind, 'bucket');
  assert.equal(evidence.httpStatus, 403);
  assert.equal(evidence.googleErrorStatus, 'PERMISSION_DENIED');
  assert.doesNotThrow(() => assertEvidenceSafe(evidence));
  assert.doesNotMatch(
    JSON.stringify(evidence),
    /Authorization|Bearer|ya29|X-Goog-Signature|signedUrl|secret-token|raw sensitive|credentials|response body/iu,
  );
});

test('IAM proof keeps genuine contract mismatches as FAIL', async () => {
  const { configuration, dependencies } = createPassingIamProof({
    omitPermission: 'storage.objects.delete',
  });
  const evidence = await runIamProof(configuration, dependencies);
  assert.equal(evidence.status, 'FAIL');
  assert.equal(evidence.failureCode, 'iam_permission_contract_mismatch');
  assert.equal(evidence.failureStage, 'permission_probe');
  assert.equal(evidence.failureIdentity, 'api');
  assert.equal(evidence.failureProbe, 'private_bucket_runtime_permissions');
  assert.equal(evidence.resourceKind, 'bucket');
  assert.deepEqual(evidence.identities, []);
});

test('operator impersonation prerequisite reports only safe PASS or FAIL conclusions', async () => {
  const configuration = {
    projectId: 'moazez-nonprod-91001421934',
    signerServiceAccount:
      'moazez-gcs-signer@moazez-nonprod-91001421934.iam.gserviceaccount.com',
  };
  const granted = await checkOperatorImpersonationPrerequisites(
    {
      async request() {
        return {
          data: { permissions: ['iam.serviceAccounts.getAccessToken'] },
        };
      },
    },
    configuration,
  );
  assert.deepEqual(granted, {
    api: 'PASS',
    core: 'PASS',
    media: 'PASS',
    signer: 'PASS',
  });

  let requestCount = 0;
  const oneDenied = await checkOperatorImpersonationPrerequisites(
    {
      async request() {
        requestCount += 1;
        return {
          data: {
            permissions:
              requestCount === 2 ? [] : ['iam.serviceAccounts.getAccessToken'],
          },
        };
      },
    },
    configuration,
  );
  assert.deepEqual(oneDenied, {
    api: 'PASS',
    core: 'FAIL',
    media: 'PASS',
    signer: 'PASS',
  });
  assert.doesNotMatch(JSON.stringify(oneDenied), /ya29\.|Bearer|tokenValue/u);
});

test('object proof never persists or prints full signed capabilities', () => {
  assert.match(objectProof, /summarizeSignedUrl/u);
  assert.match(objectProof, /assertEvidenceSafe/u);
  assert.match(objectProof, /proof_live_cleanup_failed/u);
  assert.match(objectProof, /anonymous_access_denied/u);
  for (const evidenceField of [
    'accessControlAllowOrigin',
    'accessControlAllowMethods',
    'accessControlAllowHeaders',
    'accessControlMaxAge',
    'accessControlExposeHeaders',
    'emittedAndExposedHeaders',
  ]) {
    assert.match(objectProof, new RegExp(evidenceField, 'u'));
  }
  for (const exposedHeader of [
    'Content-Type',
    'Content-Disposition',
    'Content-Range',
    'ETag',
  ]) {
    assert.match(objectProof, new RegExp(`'${exposedHeader}'`, 'u'));
  }
  assert.doesNotMatch(
    objectProof,
    /console\.log|process\.stdout\.write\([^)]*(?:Capability\.url|X-Goog-Signature)/su,
  );
  assert.doesNotMatch(objectProof, /student|school data|business data/iu);
});

test('object proof readiness records exact sanitized bucket stages', async () => {
  const configuration = {
    privateBucket: 'approved-private',
    publishedBucket: 'approved-published',
  };
  const providerError = Object.assign(
    new Error('Authorization: Bearer synthetic-provider-value'),
    { kind: 'transient' },
  );

  const privateCalls = [];
  const privateEvidence = { operations: [] };
  await assert.rejects(
    assertAvailable(
      {
        async isBucketAvailable(bucket) {
          privateCalls.push(bucket);
          throw providerError;
        },
      },
      configuration,
      privateEvidence,
    ),
    (error) => error === providerError,
  );
  assert.deepEqual(privateCalls, ['approved-private']);
  assert.deepEqual(privateEvidence, {
    operations: [],
    failureStage: 'readiness_private',
    failureCode: 'object_storage_transient',
  });
  assert.doesNotThrow(() => assertEvidenceSafe(privateEvidence));
  assert.doesNotMatch(JSON.stringify(privateEvidence), /Bearer|Authorization/u);

  const publishedCalls = [];
  const publishedEvidence = { operations: [] };
  await assert.rejects(
    assertAvailable(
      {
        async isBucketAvailable(bucket) {
          publishedCalls.push(bucket);
          if (bucket === 'approved-private') return true;
          throw providerError;
        },
      },
      configuration,
      publishedEvidence,
    ),
    (error) => error === providerError,
  );
  assert.deepEqual(publishedCalls, ['approved-private', 'approved-published']);
  assert.deepEqual(publishedEvidence, {
    operations: [],
    failureStage: 'readiness_published',
    failureCode: 'object_storage_transient',
  });
  assert.doesNotThrow(() => assertEvidenceSafe(publishedEvidence));
});

test('object proof preserves one successful readiness operation', async () => {
  const calls = [];
  const evidence = { operations: [] };

  await assertAvailable(
    {
      async isBucketAvailable(bucket) {
        calls.push(bucket);
        return true;
      },
    },
    {
      privateBucket: 'approved-private',
      publishedBucket: 'approved-published',
    },
    evidence,
  );

  assert.deepEqual(calls, ['approved-private', 'approved-published']);
  assert.deepEqual(evidence, {
    operations: [
      {
        name: 'readiness',
        status: 'PASS',
        privateBucket: true,
        publishedBucket: true,
      },
    ],
  });
});

test('object proof records exact sanitized signed-flow failure stages', async () => {
  const stages = [
    'signed_put_create',
    'signed_put_request',
    'signed_get_create',
    'signed_get_request',
    'signed_get_range',
    'cors_positive',
    'cors_negative',
  ];
  const providerError = Object.assign(
    new Error(
      'Authorization: Bearer synthetic-provider-value X-Goog-Signature=synthetic',
    ),
    { kind: 'permission_denied' },
  );

  for (const stage of stages) {
    const evidence = { operations: [] };
    await assert.rejects(
      executeProofStage(evidence, stage, async () => {
        throw providerError;
      }),
      (error) => error === providerError,
    );
    assert.deepEqual(evidence, {
      operations: [],
      failureStage: stage,
      failureCode: 'object_storage_permission_denied',
    });
    assert.doesNotThrow(() => assertEvidenceSafe(evidence));
    assert.doesNotMatch(
      JSON.stringify(evidence),
      /Bearer|Authorization|X-Goog-Signature|synthetic-provider-value/u,
    );
    assert.match(
      objectProof,
      new RegExp(`executeProofStage\\(\\s*evidence,\\s*'${stage}'`, 'u'),
    );
  }

  const successfulEvidence = { operations: [] };
  await assert.doesNotReject(async () => {
    assert.equal(
      await executeProofStage(
        successfulEvidence,
        'signed_put_create',
        async () => 'completed',
      ),
      'completed',
    );
  });
  assert.deepEqual(successfulEvidence, { operations: [] });
});

test('runbook preserves promotion order and production write prohibition', () => {
  const headings = [
    '## A. Read-only project preflight',
    '## B. Nonprod Terraform plan',
    '## C. Owner-reviewed nonprod apply',
    '## D. Nonprod real GCS proof',
    '## E. Nonprod IAM negative proof',
    '## F. Nonprod cleanup of live proof objects',
    '## G. Production Terraform plan',
    '## H. Owner-reviewed production apply',
    '## I. Production read-only configuration and IAM proof',
    '## J. Production zero-object proof',
  ];
  let previous = -1;
  for (const heading of headings) {
    const index = runbook.indexOf(heading);
    assert.ok(index > previous, `${heading} is missing or out of order`);
    previous = index;
  }
  assert.match(
    runbook,
    /Never write a proof object to either production bucket/u,
  );
  assert.match(runbook, /REAL_OBJECT_PROOF_ENVIRONMENT=NONPROD_ONLY/u);
  assert.match(runbook, /REAL_DATA_ALLOWED=NO/u);
  assert.match(runbook, /PRODUCTION_TRAFFIC_ALLOWED=NO/u);
  const prerequisites = [
    'A1. Read-only project preflight',
    'A2. Confirm Service Usage API bootstrap prerequisite',
    'A3. Stop on ambiguous nonprod access',
    'A4. Stop on approved target-resource collision',
    'A5. Terraform format, initialization, and validation',
    'A6. Nonprod Terraform plan',
    'D0. Verify operator impersonation prerequisites',
    'D1. Establish ADC for one runtime identity',
    'D2. Harness verifies runtime ADC identity',
    'D3. Execute nonprod object proof',
  ];
  let prerequisitePrevious = -1;
  for (const prerequisite of prerequisites) {
    const index = runbook.indexOf(prerequisite);
    assert.ok(
      index > prerequisitePrevious,
      `${prerequisite} is missing or out of order`,
    );
    prerequisitePrevious = index;
  }
  assert.match(runbook, /BATCH_2_READY_FOR_OPERATOR_EXECUTION=NO/u);
});

test('generated proof artifacts and local Terraform state are ignored', () => {
  const rootIgnore = read('.gitignore');
  const terraformIgnore = read('infra/gcp/storage/.gitignore');
  assert.match(rootIgnore, /artifacts\/production-readiness\/phase-5a/u);
  for (const ignored of [
    '.terraform/',
    '*.tfstate',
    '*.tfstate.*',
    '*.tfplan',
    'crash.log',
    'crash.*.log',
  ]) {
    assert.ok(terraformIgnore.includes(ignored));
  }
});

test('read-only evidence directory cannot escape by sharing the path prefix', () => {
  assert.match(readOnlyProof, /DirectorySeparatorChar/u);
  assert.match(readOnlyProof, /\.Equals\(\$artifactRoot/u);
  assert.match(readOnlyProof, /\.StartsWith\(\$artifactPrefix/u);
});

function iamProofConfiguration() {
  return {
    environmentName: 'nonprod',
    projectId: 'moazez-nonprod-91001421934',
    privateBucket: 'moazez-nonprod-91001421934-private',
    publishedBucket: 'moazez-nonprod-91001421934-published',
    signerServiceAccount:
      'moazez-gcs-signer@moazez-nonprod-91001421934.iam.gserviceaccount.com',
  };
}

function operatorPrerequisitesPass() {
  return {
    api: 'PASS',
    core: 'PASS',
    media: 'PASS',
    signer: 'PASS',
  };
}

function createPassingIamProof(options = {}) {
  const configuration = iamProofConfiguration();
  const requests = [];
  const dependencies = {
    async createSourceClient() {
      return { principal: 'operator' };
    },
    createIdentityClient(_sourceClient, principal) {
      return { principal };
    },
    async checkOperatorImpersonationPrerequisites() {
      return operatorPrerequisitesPass();
    },
    async testPermissions(auth, url, permissions, method) {
      const allowed = allowedIamPermissions(auth.principal, url, configuration);
      const granted = permissions.filter(
        (permission) =>
          allowed.has(permission) && permission !== options.omitPermission,
      );
      requests.push({
        granted: [...granted],
        method,
        permissions: [...permissions],
        principal: auth.principal,
        url,
      });
      return granted;
    },
  };
  return { configuration, dependencies, requests };
}

function allowedIamPermissions(principal, url, configuration) {
  if (url.startsWith('https://storage.googleapis.com/storage/v1/b/')) {
    const privateBucket = url.includes(
      `/b/${encodeURIComponent(configuration.privateBucket)}/`,
    );
    if (principal === configuration.signerServiceAccount) {
      return new Set(
        privateBucket
          ? [
              'storage.objects.create',
              'storage.objects.get',
              'storage.objects.list',
            ]
          : ['storage.objects.get', 'storage.objects.list'],
      );
    }
    return new Set(
      privateBucket
        ? [
            'storage.buckets.get',
            'storage.objects.create',
            'storage.objects.delete',
            'storage.objects.get',
            'storage.objects.list',
            'storage.objects.update',
          ]
        : ['storage.buckets.get'],
    );
  }
  if (url.startsWith('https://iam.googleapis.com/')) {
    return new Set(
      principal.startsWith('moazez-api-runtime@')
        ? ['iam.serviceAccounts.getAccessToken', 'iam.serviceAccounts.signBlob']
        : [],
    );
  }
  return new Set();
}

function read(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function classifyPreflightError(value) {
  return runPreflightMode('-ClassifyErrorText', value);
}

function classifyCustomRoleError(value) {
  return runPreflightMode('-ClassifyCustomRoleErrorText', value);
}

function runPreflightMode(parameterName, value) {
  const executable = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
  const result = spawnSync(
    executable,
    [
      '-NoProfile',
      '-File',
      path.join(
        repositoryRoot,
        'scripts',
        'storage',
        'gcs-batch2-preflight.ps1',
      ),
      parameterName,
      value,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function captureGcloudFixture(commandPath, scenario) {
  const executable = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
  const result = spawnSync(
    executable,
    [
      '-NoProfile',
      '-File',
      path.join(
        repositoryRoot,
        'scripts',
        'storage',
        'gcs-batch2-preflight.ps1',
      ),
      '-CaptureFixtureCommandPath',
      commandPath,
      '-CaptureFixtureArguments',
      scenario,
    ],
    { encoding: 'utf8' },
  );
  const capture = result.stdout.trim()
    ? JSON.parse(result.stdout.trim())
    : null;
  return { capture, result };
}

function createGcloudFixture() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'moazez-gcloud-capture-'),
  );
  const windows = process.platform === 'win32';
  const commandPath = path.join(
    directory,
    windows ? 'fake-gcloud.cmd' : 'fake-gcloud',
  );
  const content = windows
    ? [
        '@echo off',
        'if "%~1"=="success" goto success',
        'if "%~1"=="not-found" goto not_found',
        'if "%~1"=="authentication-failure" goto authentication_failure',
        'exit /b 9',
        ':success',
        'echo fixture-success-stdout',
        'echo fixture-success-stderr 1>&2',
        'exit /b 0',
        ':not_found',
        'echo ERROR: (gcloud.iam.roles.describe) NOT_FOUND: The role named projects/moazez-production/roles/moazezStorageBucketMetadataReader was not found. 1>&2',
        'exit /b 7',
        ':authentication_failure',
        'echo ERROR: Reauthentication failed: invalid_grant; cannot refresh auth tokens. 1>&2',
        'exit /b 8',
        '',
      ].join('\r\n')
    : [
        '#!/bin/sh',
        'case "$1" in',
        '  success)',
        "    printf '%s\\n' 'fixture-success-stdout'",
        "    printf '%s\\n' 'fixture-success-stderr' >&2",
        '    exit 0',
        '    ;;',
        '  not-found)',
        "    printf '%s\\n' 'ERROR: (gcloud.iam.roles.describe) NOT_FOUND: The role named projects/moazez-production/roles/moazezStorageBucketMetadataReader was not found.' >&2",
        '    exit 7',
        '    ;;',
        '  authentication-failure)',
        "    printf '%s\\n' 'ERROR: Reauthentication failed: invalid_grant; cannot refresh auth tokens.' >&2",
        '    exit 8',
        '    ;;',
        'esac',
        'exit 9',
        '',
      ].join('\n');
  fs.writeFileSync(commandPath, content, 'utf8');
  if (!windows) fs.chmodSync(commandPath, 0o755);
  return {
    commandPath,
    remove() {
      fs.rmSync(directory, { force: true, recursive: true });
    },
  };
}
