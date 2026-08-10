'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { GoogleAuth, Impersonated } = require('google-auth-library');
const {
  RUNTIME_SERVICE_ACCOUNT_IDS,
  assertEvidenceSafe,
  readIamProofConfiguration,
  safeFailureCode,
} = require('./gcs-batch2-proof-policy.cjs');

const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..');
const CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const SIGNER_DELEGATION_PERMISSIONS = Object.freeze([
  'iam.serviceAccounts.getAccessToken',
  'iam.serviceAccounts.signBlob',
]);
const SERVICE_ACCOUNT_ADMIN_PERMISSIONS = Object.freeze([
  'iam.serviceAccounts.delete',
  'iam.serviceAccounts.setIamPolicy',
  'iam.serviceAccounts.update',
]);
const FAILURE_IDENTITY_BY_RUNTIME_ROLE = Object.freeze({
  api: 'api',
  'core-worker': 'core',
  'media-worker': 'media',
});

async function main() {
  if (process.argv.includes('--help')) {
    process.stdout.write(
      'Usage: node scripts/storage/gcs-batch2-iam-proof.cjs --environment nonprod|production [--run-id ID]\n',
    );
    return;
  }

  const configuration = readIamProofConfiguration({
    args: process.argv.slice(2),
    env: process.env,
    repositoryRoot: REPOSITORY_ROOT,
  });
  const evidence = await runIamProof(configuration);
  await writeEvidence(configuration, evidence);
  if (evidence.status !== 'PASS') {
    throw new Error(evidence.failureCode ?? 'iam_proof_failed');
  }
}

async function runIamProof(configuration, dependencyOverrides = {}) {
  const evidence = {
    schemaVersion: 1,
    proof: 'PRD5A-G03_IAM_ALLOW_DENY',
    status: 'IN_PROGRESS',
    timestamp: new Date().toISOString(),
    environment: configuration.environmentName,
    project: configuration.projectId,
    buckets: {
      private: configuration.privateBucket,
      published: configuration.publishedBucket,
    },
    identities: [],
  };
  const dependencies = createProofDependencies(dependencyOverrides);
  let failureContext = {
    failureStage: 'source_authentication',
    failureIdentity: 'operator',
    failureProbe: 'source_adc_client',
  };

  try {
    const sourceClient = await dependencies.createSourceClient();
    failureContext = {
      failureStage: 'operator_impersonation_prerequisite',
      failureIdentity: 'operator',
      failureProbe: 'service_account_get_access_token',
      resourceKind: 'service_account',
    };
    evidence.operatorImpersonationPrerequisite =
      await dependencies.checkOperatorImpersonationPrerequisites(
        sourceClient,
        configuration,
      );
    if (
      Object.values(evidence.operatorImpersonationPrerequisite).some(
        (status) => status !== 'PASS',
      )
    ) {
      throw new Error('operator_impersonation_permission_missing');
    }
    for (const [runtimeRole, accountId] of Object.entries(
      RUNTIME_SERVICE_ACCOUNT_IDS,
    )) {
      const principal = `${accountId}@${configuration.projectId}.iam.gserviceaccount.com`;
      const failureIdentity = FAILURE_IDENTITY_BY_RUNTIME_ROLE[runtimeRole];
      failureContext = {
        failureStage: 'identity_client_creation',
        failureIdentity,
        failureProbe: 'runtime_impersonated_client',
        resourceKind: 'service_account',
      };
      const auth = dependencies.createIdentityClient(sourceClient, principal);
      const record = {
        runtimeRole,
        principal,
        checks: [],
      };
      for (const probe of runtimePermissionProbes(configuration, runtimeRole)) {
        failureContext = permissionFailureContext(failureIdentity, probe);
        record.checks.push(
          await assertPermissionContract({
            ...probe,
            auth,
            testPermissions: dependencies.testPermissions,
          }),
        );
      }
      evidence.identities.push(record);
    }

    failureContext = {
      failureStage: 'identity_client_creation',
      failureIdentity: 'signer',
      failureProbe: 'signer_impersonated_client',
      resourceKind: 'service_account',
    };
    const signerAuth = dependencies.createIdentityClient(
      sourceClient,
      configuration.signerServiceAccount,
    );
    const signerRecord = {
      runtimeRole: 'gcs-signer',
      principal: configuration.signerServiceAccount,
      checks: [],
    };
    for (const probe of signerPermissionProbes(configuration)) {
      failureContext = permissionFailureContext('signer', probe);
      signerRecord.checks.push(
        await assertPermissionContract({
          ...probe,
          auth: signerAuth,
          testPermissions: dependencies.testPermissions,
        }),
      );
    }
    evidence.identities.push(signerRecord);

    evidence.status = 'PASS';
  } catch (error) {
    evidence.status = 'FAIL';
    recordSanitizedFailure(evidence, error, failureContext);
  } finally {
    evidence.completedAt = new Date().toISOString();
  }
  return evidence;
}

function createProofDependencies(overrides) {
  const permissionTester = overrides.testPermissions ?? testPermissions;
  return {
    createSourceClient:
      overrides.createSourceClient ??
      (async () => {
        const sourceAuth = new GoogleAuth({
          scopes: [CLOUD_PLATFORM_SCOPE],
        });
        return sourceAuth.getClient();
      }),
    createIdentityClient:
      overrides.createIdentityClient ?? createImpersonatedClient,
    checkOperatorImpersonationPrerequisites:
      overrides.checkOperatorImpersonationPrerequisites ??
      ((sourceClient, configuration) =>
        checkOperatorImpersonationPrerequisites(
          sourceClient,
          configuration,
          permissionTester,
        )),
    testPermissions: permissionTester,
  };
}

function runtimePermissionProbes(configuration, runtimeRole) {
  const apiRuntime = runtimeRole === 'api';
  return [
    {
      resourceKind: 'bucket',
      bucket: configuration.privateBucket,
      expected: [
        'storage.buckets.get',
        'storage.objects.create',
        'storage.objects.delete',
        'storage.objects.get',
        'storage.objects.list',
        'storage.objects.update',
      ],
      prohibited: [
        'storage.buckets.delete',
        'storage.buckets.getIamPolicy',
        'storage.buckets.setIamPolicy',
        'storage.buckets.update',
      ],
      name: 'private_bucket_runtime_permissions',
    },
    {
      resourceKind: 'bucket',
      bucket: configuration.publishedBucket,
      expected: ['storage.buckets.get'],
      prohibited: [
        'storage.objects.create',
        'storage.objects.delete',
        'storage.objects.get',
        'storage.objects.list',
        'storage.objects.update',
        'storage.buckets.delete',
        'storage.buckets.getIamPolicy',
        'storage.buckets.setIamPolicy',
        'storage.buckets.update',
      ],
      name: 'published_bucket_readiness_only',
    },
    {
      resourceKind: 'project',
      projectId: configuration.projectId,
      expected: [],
      prohibited: [
        'storage.buckets.create',
        'resourcemanager.projects.setIamPolicy',
      ],
      name: 'project_administration_denied',
    },
    {
      resourceKind: 'service_account',
      projectId: configuration.projectId,
      serviceAccount: configuration.signerServiceAccount,
      expected: apiRuntime ? [...SIGNER_DELEGATION_PERMISSIONS] : [],
      prohibited: apiRuntime
        ? [...SERVICE_ACCOUNT_ADMIN_PERMISSIONS]
        : [
            ...SIGNER_DELEGATION_PERMISSIONS,
            ...SERVICE_ACCOUNT_ADMIN_PERMISSIONS,
          ],
      name: 'dedicated_signer_permission',
    },
  ];
}

function signerPermissionProbes(configuration) {
  return [
    {
      resourceKind: 'bucket',
      bucket: configuration.privateBucket,
      expected: [
        'storage.objects.create',
        'storage.objects.get',
        'storage.objects.list',
      ],
      prohibited: [
        'storage.objects.delete',
        'storage.buckets.delete',
        'storage.buckets.getIamPolicy',
        'storage.buckets.setIamPolicy',
        'storage.buckets.update',
      ],
      name: 'private_bucket_signer_permissions',
    },
    {
      resourceKind: 'bucket',
      bucket: configuration.publishedBucket,
      expected: ['storage.objects.get', 'storage.objects.list'],
      prohibited: [
        'storage.objects.create',
        'storage.objects.delete',
        'storage.buckets.delete',
        'storage.buckets.getIamPolicy',
        'storage.buckets.setIamPolicy',
        'storage.buckets.update',
      ],
      name: 'published_bucket_signer_permissions',
    },
    {
      resourceKind: 'project',
      projectId: configuration.projectId,
      expected: [],
      prohibited: [
        'storage.buckets.create',
        'resourcemanager.projects.setIamPolicy',
      ],
      name: 'signer_project_administration_denied',
    },
    {
      resourceKind: 'service_account',
      projectId: configuration.projectId,
      serviceAccount: configuration.signerServiceAccount,
      expected: [],
      prohibited: [
        ...SIGNER_DELEGATION_PERMISSIONS,
        ...SERVICE_ACCOUNT_ADMIN_PERMISSIONS,
      ],
      name: 'signer_service_account_administration_denied',
    },
  ];
}

function permissionFailureContext(failureIdentity, probe) {
  return {
    failureStage: 'permission_probe',
    failureIdentity,
    failureProbe: probe.name,
    resourceKind: probe.resourceKind,
  };
}

function recordSanitizedFailure(evidence, error, context) {
  const safeCode = safeFailureCode(error);
  evidence.failureCode =
    safeCode === 'proof_failed' && context.failureStage === 'permission_probe'
      ? 'iam_permission_probe_failed'
      : safeCode;
  evidence.failureStage = context.failureStage;
  evidence.failureIdentity = context.failureIdentity;
  evidence.failureProbe = context.failureProbe;
  if (context.resourceKind) evidence.resourceKind = context.resourceKind;

  const httpStatus = safeHttpStatus(error);
  if (httpStatus !== null) evidence.httpStatus = httpStatus;
  const googleErrorStatus = safeGoogleErrorStatus(error);
  if (googleErrorStatus !== null) {
    evidence.googleErrorStatus = googleErrorStatus;
  }
}

function safeHttpStatus(error) {
  for (const candidate of [
    error?.response?.status,
    error?.status,
    error?.code,
  ]) {
    const value = Number(candidate);
    if (Number.isInteger(value) && value >= 100 && value <= 599) return value;
  }
  return null;
}

function safeGoogleErrorStatus(error) {
  for (const candidate of [
    error?.response?.data?.error?.status,
    error?.status,
  ]) {
    if (
      typeof candidate === 'string' &&
      /^[A-Z][A-Z0-9_]{2,63}$/u.test(candidate)
    ) {
      return candidate;
    }
  }
  return null;
}

async function checkOperatorImpersonationPrerequisites(
  sourceClient,
  configuration,
  permissionTester = testPermissions,
) {
  const targets = {
    api: `moazez-api-runtime@${configuration.projectId}.iam.gserviceaccount.com`,
    core: `moazez-core-worker@${configuration.projectId}.iam.gserviceaccount.com`,
    media: `moazez-media-worker@${configuration.projectId}.iam.gserviceaccount.com`,
    signer: configuration.signerServiceAccount,
  };
  const results = {};
  for (const [name, principal] of Object.entries(targets)) {
    try {
      const granted = await permissionTester(
        sourceClient,
        serviceAccountPermissionUrl(configuration.projectId, principal),
        ['iam.serviceAccounts.getAccessToken'],
        'POST',
      );
      results[name] = granted.includes('iam.serviceAccounts.getAccessToken')
        ? 'PASS'
        : 'FAIL';
    } catch {
      results[name] = 'FAIL';
    }
  }
  return results;
}

function createImpersonatedClient(sourceClient, targetPrincipal) {
  if (!sourceClient) throw new Error('iam_source_credential_unavailable');
  return new Impersonated({
    sourceClient,
    targetPrincipal,
    targetScopes: [CLOUD_PLATFORM_SCOPE],
    lifetime: 600,
  });
}

async function assertPermissionContract(input) {
  const requested = [...new Set([...input.expected, ...input.prohibited])];
  assertPermissionResourceScope(input.resourceKind, requested);
  const request = permissionRequestForResource(input);
  const granted = new Set(
    await (input.testPermissions ?? testPermissions)(
      input.auth,
      request.url,
      requested,
      request.method,
    ),
  );
  const missing = input.expected.filter(
    (permission) => !granted.has(permission),
  );
  const unexpected = input.prohibited.filter((permission) =>
    granted.has(permission),
  );
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error('iam_permission_contract_mismatch');
  }
  return {
    name: input.name,
    status: 'PASS',
    resourceKind: input.resourceKind,
    expectedGranted: [...input.expected],
    expectedDenied: [...input.prohibited],
  };
}

function assertPermissionResourceScope(resourceKind, permissions) {
  for (const permission of permissions) {
    if (permissionResourceKind(permission) !== resourceKind) {
      throw new Error('iam_permission_resource_scope_mismatch');
    }
  }
}

function permissionResourceKind(permission) {
  if (
    permission === 'storage.buckets.create' ||
    permission === 'storage.buckets.list' ||
    permission.startsWith('resourcemanager.projects.')
  ) {
    return 'project';
  }
  if (permission.startsWith('iam.serviceAccounts.')) {
    return 'service_account';
  }
  if (
    permission.startsWith('storage.objects.') ||
    permission.startsWith('storage.buckets.')
  ) {
    return 'bucket';
  }
  throw new Error('iam_permission_resource_scope_unknown');
}

function permissionRequestForResource(input) {
  switch (input.resourceKind) {
    case 'bucket':
      return {
        method: 'GET',
        url: bucketPermissionUrl(input.bucket),
      };
    case 'project':
      return {
        method: 'POST',
        url: projectPermissionUrl(input.projectId),
      };
    case 'service_account':
      return {
        method: 'POST',
        url: serviceAccountPermissionUrl(input.projectId, input.serviceAccount),
      };
    default:
      throw new Error('iam_permission_resource_kind_invalid');
  }
}

async function testPermissions(auth, resource, permissions, method = 'GET') {
  const response = await auth.request(
    buildTestPermissionsRequest(resource, permissions, method),
  );
  const granted = response.data?.permissions;
  if (!Array.isArray(granted)) return [];
  return granted.filter((permission) => typeof permission === 'string');
}

function buildTestPermissionsRequest(resource, permissions, method = 'GET') {
  if (method === 'GET') {
    const url = new URL(resource);
    for (const permission of permissions) {
      url.searchParams.append('permissions', permission);
    }
    return {
      url: url.toString(),
      method: 'GET',
    };
  }
  if (method === 'POST') {
    return {
      url: resource,
      method: 'POST',
      data: { permissions: [...permissions] },
    };
  }
  throw new Error('iam_permission_request_method_invalid');
}

function bucketPermissionUrl(bucket) {
  return `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/iam/testPermissions`;
}

function projectPermissionUrl(projectId) {
  return `https://cloudresourcemanager.googleapis.com/v3/projects/${encodeURIComponent(projectId)}:testIamPermissions`;
}

function serviceAccountPermissionUrl(projectId, email) {
  return `https://iam.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/serviceAccounts/${encodeURIComponent(email)}:testIamPermissions`;
}

async function writeEvidence(configuration, evidence) {
  assertEvidenceSafe(evidence);
  await fs.mkdir(configuration.evidenceDirectory, { recursive: true });
  const evidencePath = path.join(
    configuration.evidenceDirectory,
    `gcs-batch2-iam-${configuration.environmentName}-${configuration.runId}.json`,
  );
  await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  process.stdout.write(
    `${JSON.stringify({ status: evidence.status, evidencePath })}\n`,
  );
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({ status: 'FAIL', code: safeFailureCode(error) })}\n`,
    );
    process.exitCode = 1;
  });
}

module.exports = {
  assertPermissionContract,
  bucketPermissionUrl,
  buildTestPermissionsRequest,
  checkOperatorImpersonationPrerequisites,
  main,
  permissionResourceKind,
  permissionRequestForResource,
  projectPermissionUrl,
  recordSanitizedFailure,
  runIamProof,
  serviceAccountPermissionUrl,
  testPermissions,
};
