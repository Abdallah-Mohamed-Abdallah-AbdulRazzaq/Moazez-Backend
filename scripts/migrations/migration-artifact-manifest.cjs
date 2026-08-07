'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const MANIFEST_VERSION = 1;
const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_MANIFEST_PATH = path.join(
  REPOSITORY_ROOT,
  'config',
  'deployment',
  'migration-artifact-manifest.json',
);
const PRISMA_SCHEMA_RELATIVE_PATH = 'prisma/schema.prisma';
const PRISMA_CONFIG_RELATIVE_PATH = 'prisma.config.ts';
const MIGRATIONS_RELATIVE_PATH = 'prisma/migrations';
const CANONICAL_MIGRATION_DIRECTORY = /^\d{14}_[a-z0-9_]+$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

class MigrationManifestError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MigrationManifestError';
    this.code = 'migration_manifest_mismatch';
  }
}

function toPortablePath(...segments) {
  return segments.join('/');
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function assertRegularFile(filePath, relativePath) {
  let stat;
  try {
    stat = fs.lstatSync(filePath);
  } catch {
    throw new MigrationManifestError(`required artifact is missing: ${relativePath}`);
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new MigrationManifestError(`artifact is not a regular file: ${relativePath}`);
  }
}

function inspectMigrationChain(repositoryRoot = REPOSITORY_ROOT) {
  const migrationsPath = path.join(repositoryRoot, ...MIGRATIONS_RELATIVE_PATH.split('/'));
  let rootEntries;
  try {
    rootEntries = fs.readdirSync(migrationsPath, { withFileTypes: true });
  } catch {
    throw new MigrationManifestError('migration directory is missing');
  }

  const migrationDirectories = [];
  for (const entry of rootEntries) {
    if (entry.name === 'migration_lock.toml') {
      const lockPath = path.join(migrationsPath, entry.name);
      assertRegularFile(lockPath, toPortablePath(MIGRATIONS_RELATIVE_PATH, entry.name));
      continue;
    }
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      throw new MigrationManifestError(`unexpected migration-root entry: ${entry.name}`);
    }
    if (!CANONICAL_MIGRATION_DIRECTORY.test(entry.name)) {
      throw new MigrationManifestError(`non-canonical migration directory: ${entry.name}`);
    }
    migrationDirectories.push(entry.name);
  }

  migrationDirectories.sort();
  if (migrationDirectories.length === 0) {
    throw new MigrationManifestError('migration chain is empty');
  }

  const migrations = migrationDirectories.map((directory) => {
    const directoryPath = path.join(migrationsPath, directory);
    const entries = fs.readdirSync(directoryPath, { withFileTypes: true });
    if (
      entries.length !== 1 ||
      entries[0].name !== 'migration.sql' ||
      !entries[0].isFile() ||
      entries[0].isSymbolicLink()
    ) {
      throw new MigrationManifestError(
        `migration directory must contain only migration.sql: ${directory}`,
      );
    }
    const relativePath = toPortablePath(
      MIGRATIONS_RELATIVE_PATH,
      directory,
      'migration.sql',
    );
    const filePath = path.join(directoryPath, 'migration.sql');
    assertRegularFile(filePath, relativePath);
    return Object.freeze({
      directory,
      path: relativePath,
      sha256: sha256File(filePath),
    });
  });

  return Object.freeze(migrations);
}

function aggregateMigrationChain(migrations) {
  const hash = crypto.createHash('sha256');
  for (const migration of migrations) {
    hash.update(migration.directory, 'utf8');
    hash.update('\0', 'utf8');
    hash.update(migration.path, 'utf8');
    hash.update('\0', 'utf8');
    hash.update(migration.sha256, 'utf8');
    hash.update('\n', 'utf8');
  }
  return hash.digest('hex');
}

function buildManifest(repositoryRoot = REPOSITORY_ROOT) {
  const schemaPath = path.join(
    repositoryRoot,
    ...PRISMA_SCHEMA_RELATIVE_PATH.split('/'),
  );
  const configPath = path.join(
    repositoryRoot,
    ...PRISMA_CONFIG_RELATIVE_PATH.split('/'),
  );
  assertRegularFile(schemaPath, PRISMA_SCHEMA_RELATIVE_PATH);
  assertRegularFile(configPath, PRISMA_CONFIG_RELATIVE_PATH);
  const migrations = inspectMigrationChain(repositoryRoot);

  return {
    manifestVersion: MANIFEST_VERSION,
    prismaSchema: {
      path: PRISMA_SCHEMA_RELATIVE_PATH,
      sha256: sha256File(schemaPath),
    },
    prismaConfig: {
      path: PRISMA_CONFIG_RELATIVE_PATH,
      sha256: sha256File(configPath),
    },
    migrationDirectories: migrations.map((migration) => migration.directory),
    migrations,
    aggregateMigrationChainSha256: aggregateMigrationChain(migrations),
  };
}

function serializeManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function writeManifest(manifestPath = DEFAULT_MANIFEST_PATH, repositoryRoot = REPOSITORY_ROOT) {
  const manifest = buildManifest(repositoryRoot);
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  const temporaryPath = `${manifestPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, serializeManifest(manifest), {
    encoding: 'utf8',
    flag: 'wx',
  });
  fs.renameSync(temporaryPath, manifestPath);
  return manifest;
}

function readManifest(manifestPath) {
  assertRegularFile(manifestPath, 'embedded migration manifest');
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    throw new MigrationManifestError('embedded migration manifest is invalid JSON');
  }
}

function assertManifestShape(manifest) {
  if (manifest?.manifestVersion !== MANIFEST_VERSION) {
    throw new MigrationManifestError('unsupported migration manifest version');
  }
  if (!Array.isArray(manifest.migrationDirectories) || !Array.isArray(manifest.migrations)) {
    throw new MigrationManifestError('migration manifest inventory is invalid');
  }
  for (const digest of [
    manifest.prismaSchema?.sha256,
    manifest.prismaConfig?.sha256,
    manifest.aggregateMigrationChainSha256,
    ...manifest.migrations.map((migration) => migration?.sha256),
  ]) {
    if (!SHA256.test(digest ?? '')) {
      throw new MigrationManifestError('migration manifest contains an invalid digest');
    }
  }
}

function verifyManifest(
  manifestPath = DEFAULT_MANIFEST_PATH,
  repositoryRoot = REPOSITORY_ROOT,
) {
  const embedded = readManifest(manifestPath);
  assertManifestShape(embedded);
  const recomputed = buildManifest(repositoryRoot);
  try {
    assert.deepEqual(embedded, recomputed);
  } catch {
    throw new MigrationManifestError('embedded migration manifest does not match runtime artifacts');
  }
  return recomputed;
}

function parseCliArguments(argv) {
  const [mode, flag, value, ...rest] = argv;
  if (rest.length > 0) throw new MigrationManifestError('unexpected manifest arguments');
  if (mode !== 'build' && mode !== 'verify') {
    throw new MigrationManifestError('manifest mode must be build or verify');
  }
  if (flag === undefined && value === undefined) {
    return { mode, manifestPath: DEFAULT_MANIFEST_PATH };
  }
  if (flag !== '--manifest' && flag !== '--output') {
    throw new MigrationManifestError('unexpected manifest argument');
  }
  if (!value) throw new MigrationManifestError('manifest path is required');
  if (mode === 'build' && flag !== '--output') {
    throw new MigrationManifestError('build mode requires --output');
  }
  if (mode === 'verify' && flag !== '--manifest') {
    throw new MigrationManifestError('verify mode requires --manifest');
  }
  return { mode, manifestPath: path.resolve(value) };
}

function main(argv = process.argv.slice(2)) {
  const { mode, manifestPath } = parseCliArguments(argv);
  const manifest =
    mode === 'build'
      ? writeManifest(manifestPath)
      : verifyManifest(manifestPath);
  process.stdout.write(
    `${JSON.stringify({
      event: 'migration.manifest',
      status: mode === 'build' ? 'built' : 'verified',
      migrationCount: manifest.migrations.length,
      aggregateMigrationChainSha256: manifest.aggregateMigrationChainSha256,
    })}\n`,
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        event: 'migration.manifest',
        status: 'failed',
        code: error.code ?? 'migration_manifest_mismatch',
      })}\n`,
    );
    process.exitCode = 1;
  }
}

module.exports = {
  CANONICAL_MIGRATION_DIRECTORY,
  DEFAULT_MANIFEST_PATH,
  MANIFEST_VERSION,
  MigrationManifestError,
  aggregateMigrationChain,
  buildManifest,
  inspectMigrationChain,
  parseCliArguments,
  serializeManifest,
  verifyManifest,
  writeManifest,
};
