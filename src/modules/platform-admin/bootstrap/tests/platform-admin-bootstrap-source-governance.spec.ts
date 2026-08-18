import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPOSITORY_ROOT = resolve(__dirname, '../../../../..');

describe('Platform Administrator bootstrap source governance', () => {
  it('keeps the operator path separate from historical and demo seeds', () => {
    const bootstrapDirectory = join(
      REPOSITORY_ROOT,
      'src/modules/platform-admin/bootstrap',
    );
    const bootstrapSources = [
      ...typescriptSources(bootstrapDirectory),
      join(REPOSITORY_ROOT, 'src/platform-admin-bootstrap.ts'),
    ];

    expect(bootstrapSources.length).toBeGreaterThan(1);
    for (const sourcePath of bootstrapSources) {
      expect(existsSync(sourcePath)).toBe(true);
    }

    const source = bootstrapSources.map(read).join('\n');
    const forbiddenReferences = [
      'seed' + 'PlatformAdmin',
      'seed' + 'DemoOrg',
      'seed' + 'DemoAcademics',
      '03-' + 'platform-admin.seed',
      '04-' + 'demo-org.seed',
      '05-' + 'demo-academics.seed',
      'prisma/seeds/' + 'index',
    ];

    for (const forbidden of forbiddenReferences) {
      expect(source).not.toContain(forbidden);
    }
  });

  it('exposes a dedicated operator command rather than a generic seed path', () => {
    const packageJson = JSON.parse(
      read(join(REPOSITORY_ROOT, 'package.json')),
    ) as { scripts?: Record<string, string> };
    const command = packageJson.scripts?.['bootstrap:platform-admin'];

    expect(command).toEqual(expect.any(String));
    expect(command).toContain('platform-admin-bootstrap');
    expect(command).not.toMatch(/prisma\s+db\s+seed/iu);
    expect(command).not.toMatch(/npm\s+run\s+seed/iu);
    expect(command).not.toContain('prisma/seeds/index');
  });

  it('preserves the G05 reference-bootstrap zero-user contract', () => {
    const inventory = JSON.parse(
      read(
        join(
          REPOSITORY_ROOT,
          'config/deployment/production-seed-inventory.json',
        ),
      ),
    ) as {
      approvedSeedSourceCount: number;
      mustNotCreateModels: string[];
    };
    const verifier = read(
      join(REPOSITORY_ROOT, 'scripts/ci/prd3-g05-clean-start.cjs'),
    );

    expect(inventory.approvedSeedSourceCount).toBe(2);
    expect(inventory.mustNotCreateModels).toContain('User');
    expect(verifier).toMatch(/assert\.equal\(userCount,\s*0\)/u);
    expect(verifier).toContain('platformAdminExecutions: 0');
    expect(verifier).toContain('demoSeedExecutions: 0');
    expect(verifier).toContain(
      "nonzeroApplicationTables: ['Permission', 'Role', 'RolePermission']",
    );
  });
});

function typescriptSources(directory: string): string[] {
  if (!existsSync(directory)) return [];

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'tests' ? [] : typescriptSources(entryPath);
    }
    return entry.isFile() && entry.name.endsWith('.ts') ? [entryPath] : [];
  });
}

function read(path: string): string {
  return readFileSync(path, 'utf8');
}
