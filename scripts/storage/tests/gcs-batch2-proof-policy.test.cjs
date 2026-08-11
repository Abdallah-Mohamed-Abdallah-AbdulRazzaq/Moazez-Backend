'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  LOCKED_ENVIRONMENTS,
  assertEvidenceSafe,
  executeGuardedObjectProof,
  findEvidenceSafetyRejection,
  readIamProofConfiguration,
  readObjectProofConfiguration,
  summarizeSignedUrl,
  validateRunId,
} = require('../gcs-batch2-proof-policy.cjs');

const repositoryRoot = path.resolve(__dirname, '..', '..', '..');

function nonprodEnvironment(overrides = {}) {
  return {
    STORAGE_PROVIDER: 'gcs',
    GCP_PROJECT_ID: 'moazez-nonprod-91001421934',
    STORAGE_BUCKET: 'moazez-nonprod-91001421934-private',
    STORAGE_PUBLIC_BUCKET: 'moazez-nonprod-91001421934-published',
    GCS_SIGNING_SERVICE_ACCOUNT:
      'moazez-gcs-signer@moazez-nonprod-91001421934.iam.gserviceaccount.com',
    ...overrides,
  };
}

test('locked projects, buckets, signer identities, and origins are exact', () => {
  assert.deepEqual(LOCKED_ENVIRONMENTS, {
    nonprod: {
      projectId: 'moazez-nonprod-91001421934',
      privateBucket: 'moazez-nonprod-91001421934-private',
      publishedBucket: 'moazez-nonprod-91001421934-published',
      signerServiceAccount:
        'moazez-gcs-signer@moazez-nonprod-91001421934.iam.gserviceaccount.com',
      origins: [
        'https://staging-schools.moazez.cloud',
        'https://staging-admin.moazez.cloud',
      ],
    },
    production: {
      projectId: 'moazez-production',
      privateBucket: 'moazez-production-91001421934-private',
      publishedBucket: 'moazez-production-91001421934-published',
      signerServiceAccount:
        'moazez-gcs-signer@moazez-production.iam.gserviceaccount.com',
      origins: ['https://schools.moazez.cloud', 'https://admin.moazez.cloud'],
    },
  });
});

test('nonprod API object proof resolves exact configuration and safe prefix', () => {
  const configuration = readObjectProofConfiguration({
    args: [
      '--environment',
      'nonprod',
      '--runtime-role',
      'api',
      '--run-id',
      'proof-run-0001',
    ],
    env: nonprodEnvironment(),
    repositoryRoot,
  });
  assert.equal(configuration.environmentName, 'nonprod');
  assert.equal(configuration.runtimeRole, 'api');
  assert.equal(configuration.prefix, '__phase5a-proof/proof-run-0001/');
  assert.equal(
    configuration.runtimeServiceAccount,
    'moazez-api-runtime@moazez-nonprod-91001421934.iam.gserviceaccount.com',
  );
});

test('Core and Media object proofs do not require signer configuration', () => {
  for (const runtimeRole of ['core-worker', 'media-worker']) {
    const configuration = readObjectProofConfiguration({
      args: [
        '--environment=nonprod',
        `--runtime-role=${runtimeRole}`,
        '--run-id=proof-run-0002',
      ],
      env: nonprodEnvironment({ GCS_SIGNING_SERVICE_ACCOUNT: undefined }),
      repositoryRoot,
    });
    assert.equal(configuration.runtimeRole, runtimeRole);
  }
});

test('production object mode fails before any provider client is created', async () => {
  let providerCreations = 0;
  let identityResolutions = 0;
  await assert.rejects(
    executeGuardedObjectProof({
      args: [
        '--environment=production',
        '--runtime-role=api',
        '--run-id=proof-run-0003',
      ],
      env: {},
      repositoryRoot,
      resolveRuntimeIdentity() {
        identityResolutions += 1;
        return { client_email: 'must-not-resolve@example.invalid' };
      },
      createProvider() {
        providerCreations += 1;
        return {};
      },
      execute() {
        throw new Error('must_not_execute');
      },
    }),
    /production_object_writes_prohibited/u,
  );
  assert.equal(identityResolutions, 0);
  assert.equal(providerCreations, 0);
});

test('wrong or unavailable runtime ADC fails before provider creation', async () => {
  for (const [credentials, expectedError] of [
    [
      {
        client_email:
          'different-runtime@moazez-nonprod-91001421934.iam.gserviceaccount.com',
      },
      /runtime_adc_identity_mismatch/u,
    ],
    [{}, /runtime_adc_identity_unavailable/u],
  ]) {
    let providerCreations = 0;
    await assert.rejects(
      executeGuardedObjectProof({
        args: [
          '--environment=nonprod',
          '--runtime-role=api',
          '--run-id=proof-run-adc-reject',
        ],
        env: nonprodEnvironment(),
        repositoryRoot,
        async resolveRuntimeIdentity() {
          return credentials;
        },
        createProvider() {
          providerCreations += 1;
          return {};
        },
        execute() {
          throw new Error('must_not_execute');
        },
      }),
      expectedError,
    );
    assert.equal(providerCreations, 0);
  }
});

test('matching runtime ADC permits provider creation', async () => {
  let providerCreations = 0;
  const result = await executeGuardedObjectProof({
    args: [
      '--environment=nonprod',
      '--runtime-role=api',
      '--run-id=proof-run-adc-accept',
    ],
    env: nonprodEnvironment(),
    repositoryRoot,
    async resolveRuntimeIdentity() {
      return {
        client_email:
          'moazez-api-runtime@moazez-nonprod-91001421934.iam.gserviceaccount.com',
      };
    },
    createProvider() {
      providerCreations += 1;
      return { kind: 'mock-gcs' };
    },
    execute(configuration, provider) {
      return { configuration, provider };
    },
  });
  assert.equal(providerCreations, 1);
  assert.equal(result.provider.kind, 'mock-gcs');
});

test('production IAM mode remains read-only and accepts the locked project only', () => {
  const configuration = readIamProofConfiguration({
    args: ['--environment=production', '--run-id=proof-run-0004'],
    env: { GCP_PROJECT_ID: 'moazez-production' },
    repositoryRoot,
  });
  assert.equal(configuration.environmentName, 'production');
  assert.equal(configuration.projectId, 'moazez-production');
});

test('configuration rejects provider, project, bucket, and signer drift', () => {
  for (const drift of [
    { STORAGE_PROVIDER: 'minio' },
    { GCP_PROJECT_ID: 'other-project' },
    { STORAGE_BUCKET: 'other-private' },
    { STORAGE_PUBLIC_BUCKET: 'other-published' },
    { GCS_SIGNING_SERVICE_ACCOUNT: 'other@example.invalid' },
  ]) {
    assert.throws(() =>
      readObjectProofConfiguration({
        args: [
          '--environment=nonprod',
          '--runtime-role=api',
          '--run-id=proof-run-0005',
        ],
        env: nonprodEnvironment(drift),
        repositoryRoot,
      }),
    );
  }
});

test('proof run IDs cannot escape or replace the reserved prefix', () => {
  for (const value of ['short', '../escape', 'bad/value', 'contains space']) {
    assert.throws(() => validateRunId(value), /proof_run_id_invalid/u);
  }
  assert.equal(validateRunId('proof_run-1234'), 'proof_run-1234');
});

test('signed URL evidence records signer identity but never the query', () => {
  const summary = summarizeSignedUrl(
    'https://storage.googleapis.com/bucket/object?X-Goog-Credential=moazez-gcs-signer%40moazez-nonprod-91001421934.iam.gserviceaccount.com%2F20260810%2Fme-central2%2Fstorage%2Fgoog4_request&X-Goog-Signature=secret',
  );
  assert.equal(
    summary.signerPrincipal,
    'moazez-gcs-signer@moazez-nonprod-91001421934.iam.gserviceaccount.com',
  );
  assert.equal(summary.queryRedacted, true);
  assert.doesNotMatch(JSON.stringify(summary), /Signature|Credential=|secret/u);
  assert.doesNotThrow(() => assertEvidenceSafe(summary));
});

test('canonical IAM permission identifiers are safe only in permission evidence arrays', () => {
  const evidence = {
    status: 'PASS',
    identities: [
      {
        identity: 'api',
        checks: [
          {},
          {},
          {},
          {
            expectedGranted: [
              'iam.serviceAccounts.getAccessToken',
              'iam.serviceAccounts.signBlob',
            ],
            expectedDenied: ['iam.serviceAccounts.delete'],
          },
        ],
      },
    ],
  };

  assert.equal(findEvidenceSafetyRejection(evidence), null);
  assert.doesNotThrow(() => assertEvidenceSafe(evidence));
  assert.equal(evidence.status, 'PASS');

  assert.deepEqual(
    findEvidenceSafetyRejection({
      note: 'iam.serviceAccounts.getAccessToken',
    }),
    {
      rejectionPath: 'note',
      rejectionRule: 'access_token_marker',
      rejectionClassification: 'sensitive_value',
    },
  );
});

test('evidence validation rejects secret material with sanitized path and rule metadata', () => {
  const unsafeFixtures = [
    [
      { url: 'https://storage.invalid/o?X-Goog-Signature=synthetic' },
      'url',
      'gcs_signed_query',
    ],
    [
      { diagnostic: 'Authorization: Bearer synthetic-token-value' },
      'diagnostic',
      'authorization_bearer',
    ],
    [
      { diagnostic: 'ya29.synthetic-token-value' },
      'diagnostic',
      'oauth_access_token',
    ],
    [
      {
        diagnostic:
          '-----BEGIN PRIVATE KEY-----\nsynthetic\n-----END PRIVATE KEY-----',
      },
      'diagnostic',
      'private_key_material',
    ],
  ];

  for (const [unsafe, rejectionPath, rejectionRule] of unsafeFixtures) {
    const rejection = findEvidenceSafetyRejection(unsafe);
    assert.deepEqual(rejection, {
      rejectionPath,
      rejectionRule,
      rejectionClassification: 'sensitive_value',
    });
    assert.throws(
      () => assertEvidenceSafe(unsafe),
      (error) => {
        assert.equal(error.message, 'proof_evidence_contains_sensitive_value');
        assert.equal(error.rejectionPath, rejectionPath);
        assert.equal(error.rejectionRule, rejectionRule);
        assert.equal(error.rejectionClassification, 'sensitive_value');
        assert.doesNotMatch(
          JSON.stringify({
            rejectionPath: error.rejectionPath,
            rejectionRule: error.rejectionRule,
            rejectionClassification: error.rejectionClassification,
          }),
          /synthetic|Bearer|ya29|PRIVATE KEY|X-Goog-Signature/u,
        );
        return true;
      },
    );
  }
});

test('evidence validation rejects credential-like keys and never mutates evidence', () => {
  const unsafeKeys = [
    'authorization',
    'access_token',
    'refreshToken',
    'client_secret',
    'private_key',
    'secret_access_key',
    'password',
    'credentials',
  ];

  for (const key of unsafeKeys) {
    assert.throws(
      () => assertEvidenceSafe({ [key]: 'synthetic-fixture' }),
      /proof_evidence_contains_sensitive_value/u,
    );
  }

  const unsafeEvidence = {
    status: 'IN_PROGRESS',
    identities: [],
    diagnostic: { access_token: 'synthetic-fixture' },
  };
  const beforeValidation = JSON.parse(JSON.stringify(unsafeEvidence));
  assert.throws(
    () => assertEvidenceSafe(unsafeEvidence),
    /proof_evidence_contains_sensitive_value/u,
  );
  assert.deepEqual(unsafeEvidence, beforeValidation);
  assert.equal(unsafeEvidence.status, 'IN_PROGRESS');
});

test('object harness loads and constructs the actual Batch 1 GcsAdapter only behind the guard', () => {
  const source = fs.readFileSync(
    path.join(repositoryRoot, 'scripts', 'storage', 'gcs-batch2-proof.cjs'),
    'utf8',
  );
  const policySource = fs.readFileSync(
    path.join(
      repositoryRoot,
      'scripts',
      'storage',
      'gcs-batch2-proof-policy.cjs',
    ),
    'utf8',
  );
  assert.match(
    source,
    /require\('\.\.\/\.\.\/src\/infrastructure\/storage\/gcs\.adapter'\)/u,
  );
  assert.match(source, /new GcsAdapter\(config\)/u);
  assert.match(source, /new GoogleAuth/u);
  assert.match(source, /auth\.getCredentials\(\)/u);
  assert.match(source, /resolveRuntimeIdentity: resolveActiveAdcIdentity/u);
  assert.ok(
    source.indexOf('executeGuardedObjectProof') <
      source.indexOf("require('../../src/infrastructure/storage/gcs.adapter')"),
  );
  assert.ok(
    policySource.indexOf('await options.resolveRuntimeIdentity') <
      policySource.indexOf('options.createProvider(configuration)'),
  );
  assert.doesNotMatch(source, /dotenv|readFile[^\n]*\.env/iu);
});
