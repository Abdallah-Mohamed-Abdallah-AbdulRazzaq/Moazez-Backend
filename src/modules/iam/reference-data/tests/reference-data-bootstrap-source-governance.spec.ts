import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPOSITORY_ROOT = resolve(__dirname, '../../../../..');
const REFERENCE_DATA_ROOT = join(
  REPOSITORY_ROOT,
  'src/modules/iam/reference-data',
);

describe('authorization reference-data bootstrap source governance', () => {
  it('uses one canonical catalog with thin compatible development adapters', () => {
    const permissionCatalog = read(
      join(REFERENCE_DATA_ROOT, 'permission-catalog.ts'),
    );
    const systemRoleCatalog = read(
      join(REFERENCE_DATA_ROOT, 'system-role-catalog.ts'),
    );
    const permissionAdapter = read(
      join(REPOSITORY_ROOT, 'prisma/seeds/01-permissions.seed.ts'),
    );
    const systemRoleAdapter = read(
      join(REPOSITORY_ROOT, 'prisma/seeds/02-system-roles.seed.ts'),
    );

    expect(permissionCatalog).toContain("code: 'platform.overview.view'");
    expect(systemRoleCatalog).toContain("key: 'platform_super_admin'");
    expect(permissionAdapter).not.toMatch(/\bcode:\s*['"]/u);
    expect(systemRoleAdapter).not.toMatch(/\bkey:\s*['"]/u);
    expect(permissionAdapter).toMatch(/export async function seedPermissions/u);
    expect(systemRoleAdapter).toMatch(/export async function seedSystemRoles/u);

    const productionSource = productionTypeScriptSources(
      join(REPOSITORY_ROOT, 'src'),
    )
      .map(read)
      .join('\n');
    expect(
      productionSource.match(/\{\s*code:\s*'platform\.overview\.view'/gu),
    ).toHaveLength(1);
    expect(
      productionSource.match(/\{\s*key:\s*'platform_super_admin'/gu),
    ).toHaveLength(1);
  });

  it('limits canonical mutations to the approved authorization models', () => {
    const applySource = read(
      join(
        REFERENCE_DATA_ROOT,
        'infrastructure/authorization-reference-data.apply.ts',
      ),
    );
    const repositorySource = read(
      join(
        REFERENCE_DATA_ROOT,
        'infrastructure/authorization-reference-data.repository.ts',
      ),
    );
    const sources = `${applySource}\n${repositorySource}`;
    const mutations = [
      ...sources.matchAll(
        /(?:this\.)?prisma\.(\w+)\.(upsert|create|createMany|update|updateMany|delete|deleteMany)\b/gu,
      ),
    ].map((match) => `${match[1]}.${match[2]}`);

    expect(new Set(mutations)).toEqual(
      new Set([
        'permission.upsert',
        'role.update',
        'role.create',
        'rolePermission.deleteMany',
        'rolePermission.createMany',
      ]),
    );
    expect(sources).not.toMatch(/\.(?:user|membership|organization|school)\./u);
    expect(sources).not.toMatch(/\$(?:executeRaw|queryRaw)/u);
    expect(sources).not.toContain('$transaction');
  });

  it('keeps production operator imports separate from every forbidden seed path', () => {
    const operatorSources = [
      ...productionTypeScriptSources(REFERENCE_DATA_ROOT),
      join(REPOSITORY_ROOT, 'src/reference-data-bootstrap.ts'),
    ]
      .map(read)
      .join('\n');
    const forbiddenReferences = [
      'seed' + 'PlatformAdmin',
      'seed' + 'DemoOrg',
      'seed' + 'DemoAcademics',
      '03-' + 'platform-admin.seed',
      '04-' + 'demo-org.seed',
      '05-' + 'demo-academics.seed',
      'prisma/seeds/' + 'index',
      'prisma/seeds/01-' + 'permissions.seed',
      'prisma/seeds/02-' + 'system-roles.seed',
    ];

    for (const forbidden of forbiddenReferences) {
      expect(operatorSources).not.toContain(forbidden);
    }
    expect(operatorSources).not.toMatch(/@Controller|listen\(/u);
    expect(operatorSources).not.toMatch(/BullMQ|Scheduler|WebSocket/u);
  });

  it('exposes only the dedicated compiled command and preserves seed inventory', () => {
    const packageJson = JSON.parse(
      read(join(REPOSITORY_ROOT, 'package.json')),
    ) as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const inventory = JSON.parse(
      read(
        join(
          REPOSITORY_ROOT,
          'config/deployment/production-seed-inventory.json',
        ),
      ),
    ) as {
      approvedSeedSourceCount: number;
      approvedSeedSources: Array<{ path: string; export: string }>;
    };

    expect(packageJson.scripts?.['bootstrap:reference-data']).toBe(
      'node dist/reference-data-bootstrap.js',
    );
    expect(packageJson.scripts?.postbuild).toContain(
      "require('./dist/reference-data-bootstrap.js')",
    );
    expect(packageJson.scripts?.postbuild).toContain(
      "fs.existsSync('./dist/modules/iam/reference-data/reference-data-bootstrap.module.js')",
    );
    expect(packageJson.scripts?.postbuild).not.toContain('ts-node');
    expect(packageJson.dependencies?.['ts-node']).toBeUndefined();
    expect(packageJson.devDependencies?.['ts-node']).toBeDefined();
    expect(inventory.approvedSeedSourceCount).toBe(2);
    expect(
      inventory.approvedSeedSources.map(({ path, export: exportName }) => [
        path,
        exportName,
      ]),
    ).toEqual([
      ['prisma/seeds/01-permissions.seed.ts', 'seedPermissions'],
      ['prisma/seeds/02-system-roles.seed.ts', 'seedSystemRoles'],
    ]);

    const dockerfile = read(join(REPOSITORY_ROOT, 'Dockerfile'));
    expect(dockerfile).toMatch(/npm ci --omit=dev/u);
    expect(dockerfile).toContain(
      'COPY --chown=node:node --from=build /app/dist ./dist',
    );
  });

  it('keeps canonical apply logic silent and development logging adapter-owned', () => {
    const canonicalSources = productionTypeScriptSources(REFERENCE_DATA_ROOT)
      .map(read)
      .join('\n');
    const adapters = [
      'prisma/seeds/01-permissions.seed.ts',
      'prisma/seeds/02-system-roles.seed.ts',
    ]
      .map((path) => read(join(REPOSITORY_ROOT, path)))
      .join('\n');

    expect(canonicalSources).not.toMatch(/console\.(?:log|error|warn)/u);
    expect(adapters.match(/console\.log/gu)).toHaveLength(2);
  });

  it('preserves the existing Platform Administrator prerequisite unchanged', () => {
    const repository = read(
      join(
        REPOSITORY_ROOT,
        'src/modules/platform-admin/bootstrap/platform-admin-bootstrap.repository.ts',
      ),
    );

    expect(repository).toContain('take: 2');
    expect(repository).toMatch(/roles\.length !== 1/u);
    expect(repository).toMatch(/permissionCount === 0/u);
    expect(repository).toMatch(
      /roles\[0\]\._count\.rolePermissions !== permissionCount/u,
    );
    expect(repository.indexOf('permissionCount === 0')).toBeLessThan(
      repository.indexOf('transaction.user.create'),
    );
  });
});

function productionTypeScriptSources(directory: string): string[] {
  if (!existsSync(directory)) return [];

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'tests'
        ? []
        : productionTypeScriptSources(entryPath);
    }
    return entry.isFile() &&
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.spec.ts')
      ? [entryPath]
      : [];
  });
}

function read(path: string): string {
  return readFileSync(path, 'utf8');
}
