import { readdirSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import * as ts from 'typescript';

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

  it('keeps signed and resumable capability URLs transient rather than persistence inputs', () => {
    const violations =
      collectCapabilityPersistenceViolations(productionSources);
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
    expect(collectCapabilityPersistenceViolations(signedPersistence)).toEqual([
      'modules/example/application/persist.ts:signed-url-persistence',
    ]);

    const resumablePersistence = [
      {
        path: 'modules/example/application/resumable.ts',
        source:
          'const capability = await storage.createResumableUploadSession(input);\nawait repository.create({ data: { sessionUrl: capability.sessionUrl } });',
      },
    ];
    expect(
      collectCapabilityPersistenceViolations(resumablePersistence),
    ).toEqual([
      'modules/example/application/resumable.ts:resumable-capability-persistence',
    ]);

    expect(
      collectCapabilityPersistenceViolations([
        {
          path: 'modules/example/application/alias.ts',
          source:
            'const { sessionUrl: uploadUrl } = await storage.createResumableUploadSession(input);\nawait prisma.file.create({ data: { url: uploadUrl } });',
        },
      ]),
    ).toEqual([
      'modules/example/application/alias.ts:resumable-capability-persistence',
    ]);

    expect(
      collectCapabilityPersistenceViolations([
        {
          path: 'modules/example/controllers/upload.controller.ts',
          source:
            'const capability = await storage.createResumableUploadSession(input);\nawait repository.update({ data: { status: "ready" } });\nreturn { sessionUrl: capability.sessionUrl };',
        },
      ]),
    ).toEqual([]);
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

function collectCapabilityPersistenceViolations(files: SourceFile[]): string[] {
  return files.flatMap(({ path, source }) => {
    if (path.startsWith('infrastructure/storage/')) return [];
    const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
    const capabilityVariables = new Map<
      string,
      {
        kind: 'signed' | 'resumable';
        direct: boolean;
      }
    >();

    walkNode(ast, (node) => {
      if (!ts.isVariableDeclaration(node) || !node.initializer) return;
      const initializer = ts.isAwaitExpression(node.initializer)
        ? node.initializer.expression
        : node.initializer;
      if (!ts.isCallExpression(initializer)) return;
      const operation = initializer.expression;
      if (!ts.isPropertyAccessExpression(operation)) return;
      const kind =
        operation.name.text === 'createResumableUploadSession'
          ? 'resumable'
          : /^(?:createUploadUrl|createDownloadUrl|createSignedPutUrl|createSignedGetUrl|getSignedUrl)$/u.test(
                operation.name.text,
              )
            ? 'signed'
            : null;
      if (!kind) return;
      if (ts.isIdentifier(node.name)) {
        capabilityVariables.set(node.name.text, { kind, direct: false });
      } else if (ts.isObjectBindingPattern(node.name)) {
        for (const element of node.name.elements) {
          if (!ts.isIdentifier(element.name)) continue;
          const field = element.propertyName?.getText(ast) ?? element.name.text;
          if (
            (kind === 'resumable' &&
              /^(?:sessionUrl|uploadUrl|url)$/u.test(field)) ||
            (kind === 'signed' && field === 'url')
          ) {
            capabilityVariables.set(element.name.text, { kind, direct: true });
          }
        }
      }
    });

    walkNode(ast, (node) => {
      if (
        !ts.isVariableDeclaration(node) ||
        !ts.isIdentifier(node.name) ||
        !node.initializer
      )
        return;
      if (
        !ts.isPropertyAccessExpression(node.initializer) ||
        !ts.isIdentifier(node.initializer.expression)
      )
        return;
      const sourceCapability = capabilityVariables.get(
        node.initializer.expression.text,
      );
      if (!sourceCapability) return;
      const field = node.initializer.name.text;
      if (
        (sourceCapability.kind === 'resumable' &&
          /^(?:sessionUrl|uploadUrl|url)$/u.test(field)) ||
        (sourceCapability.kind === 'signed' && field === 'url')
      ) {
        capabilityVariables.set(node.name.text, {
          kind: sourceCapability.kind,
          direct: true,
        });
      }
    });

    const violations = new Set<string>();
    walkNode(ast, (node) => {
      if (
        !ts.isCallExpression(node) ||
        !isPersistenceCall(node.expression, ast)
      )
        return;
      for (const argument of node.arguments) {
        walkNode(argument, (child) => {
          if (ts.isIdentifier(child)) {
            const capability = capabilityVariables.get(child.text);
            if (capability?.direct) {
              violations.add(
                `${path}:${capability.kind === 'resumable' ? 'resumable-capability' : 'signed-url'}-persistence`,
              );
            }
          }
          if (
            ts.isPropertyAccessExpression(child) &&
            ts.isIdentifier(child.expression)
          ) {
            const capability = capabilityVariables.get(child.expression.text);
            if (!capability || capability.direct) return;
            const field = child.name.text;
            if (
              (capability.kind === 'resumable' &&
                /^(?:sessionUrl|uploadUrl|url)$/u.test(field)) ||
              (capability.kind === 'signed' && field === 'url')
            ) {
              violations.add(
                `${path}:${capability.kind === 'resumable' ? 'resumable-capability' : 'signed-url'}-persistence`,
              );
            }
          }
        });
      }
    });
    return [...violations];
  });
}

function isPersistenceCall(
  expression: ts.LeftHandSideExpression,
  ast: ts.SourceFile,
): boolean {
  if (ts.isIdentifier(expression))
    return /^(?:store|persist)$/u.test(expression.text);
  if (!ts.isPropertyAccessExpression(expression)) return false;
  const method = expression.name.text;
  if (
    !/^(?:create|createMany|update|updateMany|upsert|save|persist|store)$/u.test(
      method,
    )
  )
    return false;
  return /(?:repository|prisma|store)/iu.test(
    expression.expression.getText(ast),
  );
}

function walkNode(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (child) => walkNode(child, visit));
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
