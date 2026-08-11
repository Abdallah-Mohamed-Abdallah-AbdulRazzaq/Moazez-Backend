'use strict';

const path = require('node:path');
const { randomUUID } = require('node:crypto');

const LOCKED_ENVIRONMENTS = Object.freeze({
  nonprod: Object.freeze({
    projectId: 'moazez-nonprod-91001421934',
    privateBucket: 'moazez-nonprod-91001421934-private',
    publishedBucket: 'moazez-nonprod-91001421934-published',
    signerServiceAccount:
      'moazez-gcs-signer@moazez-nonprod-91001421934.iam.gserviceaccount.com',
    origins: Object.freeze([
      'https://staging-schools.moazez.cloud',
      'https://staging-admin.moazez.cloud',
    ]),
  }),
  production: Object.freeze({
    projectId: 'moazez-production',
    privateBucket: 'moazez-production-91001421934-private',
    publishedBucket: 'moazez-production-91001421934-published',
    signerServiceAccount:
      'moazez-gcs-signer@moazez-production.iam.gserviceaccount.com',
    origins: Object.freeze([
      'https://schools.moazez.cloud',
      'https://admin.moazez.cloud',
    ]),
  }),
});

const RUNTIME_SERVICE_ACCOUNT_IDS = Object.freeze({
  api: 'moazez-api-runtime',
  'core-worker': 'moazez-core-worker',
  'media-worker': 'moazez-media-worker',
});

function parseArguments(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith('--')) {
      throw new Error('proof_argument_invalid');
    }
    const [inlineName, inlineValue] = argument.slice(2).split('=', 2);
    const name = inlineName;
    const value = inlineValue ?? args[++index];
    if (!value || value.startsWith('--') || Object.hasOwn(values, name)) {
      throw new Error('proof_argument_invalid');
    }
    if (
      !['environment', 'runtime-role', 'run-id', 'evidence-dir'].includes(name)
    ) {
      throw new Error('proof_argument_unknown');
    }
    values[name] = value;
  }
  return values;
}

function createRunId(now = new Date(), uuid = randomUUID()) {
  const timestamp = now.toISOString().replace(/[-:.]/gu, '').replace('Z', 'Z');
  return `${timestamp}-${uuid.slice(0, 12)}`;
}

function validateRunId(value) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/u.test(value)) {
    throw new Error('proof_run_id_invalid');
  }
  return value;
}

function expectedRuntimeServiceAccount(environment, runtimeRole) {
  const accountId = RUNTIME_SERVICE_ACCOUNT_IDS[runtimeRole];
  if (!accountId) throw new Error('proof_runtime_role_invalid');
  return `${accountId}@${environment.projectId}.iam.gserviceaccount.com`;
}

function readObjectProofConfiguration(options) {
  const values = parseArguments(options.args);
  const environmentName = values.environment;
  const environment = LOCKED_ENVIRONMENTS[environmentName];
  if (!environment) throw new Error('proof_environment_invalid');

  // This guard must execute before a provider module or client is created.
  if (environmentName === 'production') {
    throw new Error('production_object_writes_prohibited');
  }

  const runtimeRole = values['runtime-role'];
  if (!Object.hasOwn(RUNTIME_SERVICE_ACCOUNT_IDS, runtimeRole)) {
    throw new Error('proof_runtime_role_invalid');
  }
  const runId = validateRunId(values['run-id'] ?? createRunId());
  const expected = environment;
  requireExact(options.env.STORAGE_PROVIDER, 'gcs', 'storage_provider_invalid');
  requireExact(
    options.env.GCP_PROJECT_ID,
    expected.projectId,
    'gcp_project_id_invalid',
  );
  requireExact(
    options.env.STORAGE_BUCKET,
    expected.privateBucket,
    'private_bucket_invalid',
  );
  requireExact(
    options.env.STORAGE_PUBLIC_BUCKET,
    expected.publishedBucket,
    'published_bucket_invalid',
  );
  if (runtimeRole === 'api') {
    requireExact(
      options.env.GCS_SIGNING_SERVICE_ACCOUNT,
      expected.signerServiceAccount,
      'signer_service_account_invalid',
    );
  }

  const artifactRoot = path.resolve(
    options.repositoryRoot,
    'artifacts',
    'production-readiness',
    'phase-5a',
  );
  const evidenceDirectory = path.resolve(
    values['evidence-dir'] ?? artifactRoot,
  );
  if (
    evidenceDirectory !== artifactRoot &&
    !evidenceDirectory.startsWith(`${artifactRoot}${path.sep}`)
  ) {
    throw new Error('proof_evidence_directory_invalid');
  }

  return Object.freeze({
    environmentName,
    projectId: expected.projectId,
    privateBucket: expected.privateBucket,
    publishedBucket: expected.publishedBucket,
    signerServiceAccount: expected.signerServiceAccount,
    runtimeServiceAccount: expectedRuntimeServiceAccount(expected, runtimeRole),
    runtimeRole,
    origins: [...expected.origins],
    runId,
    prefix: `__phase5a-proof/${runId}/`,
    evidenceDirectory,
  });
}

function readIamProofConfiguration(options) {
  const values = parseArguments(options.args);
  const environmentName = values.environment;
  const environment = LOCKED_ENVIRONMENTS[environmentName];
  if (!environment) throw new Error('proof_environment_invalid');
  if (values['runtime-role']) throw new Error('proof_argument_invalid');
  const runId = validateRunId(values['run-id'] ?? createRunId());
  requireExact(
    options.env.GCP_PROJECT_ID,
    environment.projectId,
    'gcp_project_id_invalid',
  );

  const artifactRoot = path.resolve(
    options.repositoryRoot,
    'artifacts',
    'production-readiness',
    'phase-5a',
  );
  const evidenceDirectory = path.resolve(
    values['evidence-dir'] ?? artifactRoot,
  );
  if (
    evidenceDirectory !== artifactRoot &&
    !evidenceDirectory.startsWith(`${artifactRoot}${path.sep}`)
  ) {
    throw new Error('proof_evidence_directory_invalid');
  }

  return Object.freeze({
    environmentName,
    ...environment,
    runId,
    evidenceDirectory,
  });
}

async function executeGuardedObjectProof(options) {
  const configuration = readObjectProofConfiguration(options);
  if (typeof options.resolveRuntimeIdentity !== 'function') {
    throw new Error('runtime_adc_identity_unavailable');
  }
  let credentials;
  try {
    credentials = await options.resolveRuntimeIdentity(configuration);
  } catch (error) {
    if (
      error instanceof Error &&
      [
        'runtime_adc_identity_unavailable',
        'runtime_adc_identity_mismatch',
      ].includes(error.message)
    ) {
      throw error;
    }
    throw new Error('runtime_adc_identity_unavailable');
  }
  assertRuntimeAdcIdentity(credentials, configuration.runtimeServiceAccount);
  const provider = options.createProvider(configuration);
  return options.execute(configuration, provider);
}

function assertRuntimeAdcIdentity(credentials, expectedServiceAccount) {
  const clientEmail = credentials?.client_email;
  if (typeof clientEmail !== 'string' || clientEmail.trim().length === 0) {
    throw new Error('runtime_adc_identity_unavailable');
  }
  if (clientEmail !== expectedServiceAccount) {
    throw new Error('runtime_adc_identity_mismatch');
  }
  return clientEmail;
}

function summarizeSignedUrl(value) {
  const url = new URL(value);
  const credential = url.searchParams.get('X-Goog-Credential');
  const signerPrincipal = credential?.split('/', 1)[0] ?? '';
  if (!signerPrincipal.endsWith('.iam.gserviceaccount.com')) {
    throw new Error('signed_url_signer_unavailable');
  }
  return Object.freeze({
    scheme: url.protocol,
    host: url.host,
    path: url.pathname,
    signerPrincipal,
    queryRedacted: true,
  });
}

const EVIDENCE_SENSITIVE_KEY_RULES = Object.freeze([
  ['authorization_key', /^authorization$/iu],
  ['access_token_key', /^access[_-]?token$/iu],
  ['refresh_token_key', /^refresh[_-]?token$/iu],
  ['client_secret_key', /^client[_-]?secret$/iu],
  ['private_key_key', /^private[_-]?key(?:[_-]?id)?$/iu],
  [
    'secret_access_key_key',
    /^(?:aws[_-]?)?secret[_-]?access[_-]?key$/iu,
  ],
  ['password_key', /^password$/iu],
  ['credentials_key', /^credentials?$/iu],
]);

const EVIDENCE_SENSITIVE_VALUE_RULES = Object.freeze([
  ['gcs_signed_query', /X-Goog-Signature(?:=|%3D)/iu],
  ['gcs_signed_credential', /X-Goog-Credential(?:=|%3D)/iu],
  ['s3_signed_query', /X-Amz-Signature(?:=|%3D)/iu],
  ['authorization_bearer', /Bearer\s+[A-Za-z0-9._~-]+/iu],
  ['oauth_access_token', /ya29\.[A-Za-z0-9._~-]+/iu],
  ['private_key_material', /private[_-]?key|-----BEGIN [A-Z ]*PRIVATE KEY-----/iu],
  ['access_token_marker', /access[_-]?token/iu],
  ['refresh_token_marker', /refresh[_-]?token/iu],
  ['client_secret_marker', /client[_-]?secret/iu],
  ['secret_access_key_marker', /secret[_-]?access[_-]?key/iu],
  ['password_marker', /password\s*[:=]/iu],
]);

const IAM_PERMISSION_EVIDENCE_PATH =
  /^identities\[\d+\]\.checks\[\d+\]\.(?:expectedGranted|expectedDenied)\[\d+\]$/u;
const CANONICAL_IAM_PERMISSION_IDENTIFIER =
  /^(?:storage\.(?:buckets|objects)|iam\.serviceAccounts|resourcemanager\.projects)\.[A-Za-z][A-Za-z0-9]*$/u;

function assertEvidenceSafe(value) {
  const rejection = findEvidenceSafetyRejection(value);
  if (rejection) {
    const error = new Error('proof_evidence_contains_sensitive_value');
    error.rejectionPath = rejection.rejectionPath;
    error.rejectionRule = rejection.rejectionRule;
    error.rejectionClassification = rejection.rejectionClassification;
    throw error;
  }
  return value;
}

function findEvidenceSafetyRejection(value) {
  return visitEvidenceValue(value, '');
}

function visitEvidenceValue(value, path) {
  if (typeof value === 'string') {
    for (const [rule, pattern] of EVIDENCE_SENSITIVE_VALUE_RULES) {
      if (!pattern.test(value)) continue;
      if (
        rule === 'access_token_marker' &&
        IAM_PERMISSION_EVIDENCE_PATH.test(path) &&
        CANONICAL_IAM_PERMISSION_IDENTIFIER.test(value)
      ) {
        continue;
      }
      return {
        rejectionPath: path,
        rejectionRule: rule,
        rejectionClassification: 'sensitive_value',
      };
    }
    return null;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const rejection = visitEvidenceValue(value[index], `${path}[${index}]`);
      if (rejection) return rejection;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const childPath = appendEvidencePath(path, key);
      for (const [rule, pattern] of EVIDENCE_SENSITIVE_KEY_RULES) {
        if (pattern.test(key)) {
          return {
            rejectionPath: childPath,
            rejectionRule: rule,
            rejectionClassification: 'sensitive_key',
          };
        }
      }
      const rejection = visitEvidenceValue(child, childPath);
      if (rejection) return rejection;
    }
  }
  return null;
}

function appendEvidencePath(parent, key) {
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(key)) {
    return parent ? `${parent}.${key}` : key;
  }
  return `${parent}[${JSON.stringify(key)}]`;
}

function safeFailureCode(error) {
  if (
    error &&
    typeof error === 'object' &&
    typeof error.kind === 'string' &&
    /^[a-z_]+$/u.test(error.kind)
  ) {
    return `object_storage_${error.kind}`;
  }
  if (error instanceof Error && /^[a-z][a-z0-9_]{2,80}$/u.test(error.message)) {
    return error.message;
  }
  return 'proof_failed';
}

function requireExact(actual, expected, errorCode) {
  if (actual !== expected) throw new Error(errorCode);
}

module.exports = {
  LOCKED_ENVIRONMENTS,
  RUNTIME_SERVICE_ACCOUNT_IDS,
  assertEvidenceSafe,
  assertRuntimeAdcIdentity,
  createRunId,
  executeGuardedObjectProof,
  expectedRuntimeServiceAccount,
  findEvidenceSafetyRejection,
  parseArguments,
  readIamProofConfiguration,
  readObjectProofConfiguration,
  safeFailureCode,
  summarizeSignedUrl,
  validateRunId,
};
