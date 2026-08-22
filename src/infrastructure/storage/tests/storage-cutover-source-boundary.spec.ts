import { readdirSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const SOURCE_ROOT = resolve(__dirname, '../../..');

const PROVIDER_IMPLEMENTATION_ALLOWLIST = new Set([
  'infrastructure/storage/gcs.adapter.ts',
  'infrastructure/storage/minio.adapter.ts',
  'infrastructure/storage/storage.module.ts',
]);

const PROVIDER_CONFIG_ALLOWLIST = new Set([
  ...PROVIDER_IMPLEMENTATION_ALLOWLIST,
  'infrastructure/storage/storage-env.validation.ts',
]);

const GCP_PROJECT_ID_CONSUMER_ALLOWLIST = new Set([
  ...PROVIDER_CONFIG_ALLOWLIST,
  'infrastructure/push/firebase/firebase-admin.service.ts',
  'modules/platform-admin/bootstrap/platform-admin-bootstrap.environment.ts',
]);

const PROVIDER_LITERAL_ALLOWLIST = new Set([
  ...PROVIDER_IMPLEMENTATION_ALLOWLIST,
  'infrastructure/storage/provider-url.policy.ts',
]);

describe('storage cutover source boundary', () => {
  const productionSources = readProductionSources();

  it('keeps provider adapters and SDKs inside the explicit implementation allowlist', () => {
    const violations = collectProviderBoundaryViolations(productionSources);
    expect(violations).toEqual([]);
  });

  it('keeps provider credentials and endpoint consumption inside storage config', () => {
    const violations = collectCredentialBoundaryViolations(productionSources);
    expect(violations).toEqual([]);
  });

  it('prevents feature code from injecting ObjectStoragePort directly', () => {
    const violations = productionSources
      .filter(({ path, source }) => {
        return (
          path.startsWith('modules/') && /\bObjectStoragePort\b/.test(source)
        );
      })
      .map(({ path }) => path);
    expect(violations).toEqual([]);
  });

  it('keeps signed capability URLs transient rather than persistence inputs', () => {
    const violations = collectSignedUrlPersistenceViolations(productionSources);
    expect(violations).toEqual([]);
  });

  it('proves the gate detects representative provider and signed-URL bypasses', () => {
    const synthetic = [
      {
        path: 'modules/example/application/bypass.ts',
        source:
          "import { Storage } from '@google-cloud/storage';\nnew GcsAdapter(config);",
      },
    ];
    expect(collectProviderBoundaryViolations(synthetic)).toEqual([
      'modules/example/application/bypass.ts:direct-provider-reference',
    ]);

    const signedPersistence = [
      {
        path: 'modules/example/application/persist.ts',
        source:
          'const capability = await storage.createDownloadUrl(input);\nawait repository.update({ data: { url: capability.url } });',
      },
    ];
    expect(collectSignedUrlPersistenceViolations(signedPersistence)).toEqual([
      'modules/example/application/persist.ts:signed-url-persistence',
    ]);
  });

  it('allows the governed bootstrap project identity without exposing storage secrets', () => {
    const bootstrapEnvironmentPath =
      'modules/platform-admin/bootstrap/platform-admin-bootstrap.environment.ts';

    expect(
      collectCredentialBoundaryViolations([
        {
          path: bootstrapEnvironmentPath,
          source: 'const projectId = environment.GCP_PROJECT_ID;',
        },
      ]),
    ).toEqual([]);
    expect(
      collectCredentialBoundaryViolations([
        {
          path: bootstrapEnvironmentPath,
          source: 'const secret = environment.STORAGE_SECRET_KEY;',
        },
      ]),
    ).toEqual([`${bootstrapEnvironmentPath}:provider-config-reference`]);
    expect(
      collectCredentialBoundaryViolations([
        {
          path: 'modules/example/application/bypass.ts',
          source: 'const projectId = environment.GCP_PROJECT_ID;',
        },
      ]),
    ).toEqual([
      'modules/example/application/bypass.ts:provider-config-reference',
    ]);
  });

  it('allows Firebase Admin project identity without granting storage credential access', () => {
    const firebaseAdminPath =
      'infrastructure/push/firebase/firebase-admin.service.ts';

    expect(
      collectCredentialBoundaryViolations([
        {
          path: firebaseAdminPath,
          source: 'const projectId = environment.GCP_PROJECT_ID;',
        },
      ]),
    ).toEqual([]);

    for (const storageCredential of [
      'STORAGE_ENDPOINT',
      'STORAGE_ACCESS_KEY',
      'STORAGE_SECRET_KEY',
      'GCS_SIGNING_SERVICE_ACCOUNT',
    ]) {
      expect(
        collectCredentialBoundaryViolations([
          {
            path: firebaseAdminPath,
            source: `const credential = environment.${storageCredential};`,
          },
        ]),
      ).toEqual([`${firebaseAdminPath}:provider-config-reference`]);
    }
  });
});

type SourceFile = { path: string; source: string };

function collectProviderBoundaryViolations(files: SourceFile[]): string[] {
  const directProviderPattern =
    /\b(?:MinioAdapter|GcsAdapter)\b|from\s+['"]minio['"]|@google-cloud\/storage/;
  const providerLiteralPattern =
    /storage\.googleapis\.com|\.s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com|\b(?:gs|s3):\/\/|(?:localhost|127\.0\.0\.1):9000/i;

  return files.flatMap(({ path, source }) => {
    const violations: string[] = [];
    if (
      directProviderPattern.test(source) &&
      !PROVIDER_IMPLEMENTATION_ALLOWLIST.has(path)
    ) {
      violations.push(`${path}:direct-provider-reference`);
    }
    if (
      providerLiteralPattern.test(source) &&
      !PROVIDER_LITERAL_ALLOWLIST.has(path)
    ) {
      violations.push(`${path}:raw-provider-url-literal`);
    }
    return violations;
  });
}

function collectCredentialBoundaryViolations(files: SourceFile[]): string[] {
  const storageCredentialPattern =
    /\b(?:STORAGE_ENDPOINT|STORAGE_ACCESS_KEY|STORAGE_SECRET_KEY|GCS_SIGNING_SERVICE_ACCOUNT)\b/;
  const projectIdentityPattern = /\bGCP_PROJECT_ID\b/;
  return files
    .filter(
      ({ path, source }) =>
        (storageCredentialPattern.test(source) &&
          !PROVIDER_CONFIG_ALLOWLIST.has(path)) ||
        (projectIdentityPattern.test(source) &&
          !GCP_PROJECT_ID_CONSUMER_ALLOWLIST.has(path)),
    )
    .map(({ path }) => `${path}:provider-config-reference`);
}

function collectSignedUrlPersistenceViolations(files: SourceFile[]): string[] {
  return files.flatMap(({ path, source }) => {
    if (path.startsWith('infrastructure/storage/')) return [];
    const capabilityVariables = [
      ...source.matchAll(
        /(?:const|let|var)?\s*([A-Za-z_$][\w$]*)\s*(?::[^=;]+)?=\s*await\s+[\s\S]{0,160}?\.(?:createUploadUrl|createDownloadUrl|createSignedPutUrl|createSignedGetUrl|getSignedUrl)\s*\(/g,
      ),
    ].map((match) => match[1]);
    const persistenceCall =
      /\b(?:repository|prisma|store)\b[\s\S]{0,80}?\.(?:create|createMany|update|updateMany|upsert|save|persist)\s*\(/i;
    for (const variable of capabilityVariables) {
      const escaped = variable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (
        persistenceCall.test(source) &&
        new RegExp(`\\b${escaped}\\.url\\b`).test(source)
      ) {
        return [`${path}:signed-url-persistence`];
      }
    }
    return [];
  });
}

function readProductionSources(): SourceFile[] {
  return walk(SOURCE_ROOT)
    .filter(
      (path) =>
        path.endsWith('.ts') &&
        !path.endsWith('.spec.ts') &&
        !path.includes('/tests/'),
    )
    .map((path) => ({
      path: relative(SOURCE_ROOT, path).replace(/\\/g, '/'),
      source: readFileSync(path, 'utf8'),
    }));
}

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = resolve(directory, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}
