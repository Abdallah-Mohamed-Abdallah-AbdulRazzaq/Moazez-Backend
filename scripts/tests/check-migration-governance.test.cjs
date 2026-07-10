'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { afterEach, test } = require('node:test');

const CHECKER_PATH = path.resolve(
  __dirname,
  '..',
  'check-migration-governance.cjs',
);
const BASE_MIGRATION = '20260101010101_initial';
const TEMPORARY_REPOSITORIES = new Set();

function run(command, args, workingDirectory) {
  const result = spawnSync(command, args, {
    cwd: workingDirectory,
    encoding: 'utf8',
    shell: false,
  });

  assert.equal(
    result.status,
    0,
    `${command} ${args.join(' ')} failed:\n${result.stdout ?? ''}${
      result.stderr ?? ''
    }`,
  );
  return result.stdout ?? '';
}

function runGit(repositoryRoot, ...args) {
  return run('git', args, repositoryRoot);
}

function writeFile(repositoryRoot, relativePath, contents) {
  const filePath = path.join(repositoryRoot, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, 'utf8');
  return filePath;
}

function writeMigration(repositoryRoot, name, sql = 'SELECT 1;\n') {
  return writeFile(
    repositoryRoot,
    path.join('prisma', 'migrations', name, 'migration.sql'),
    sql,
  );
}

function writePackageScripts(repositoryRoot, scripts) {
  writeFile(
    repositoryRoot,
    'package.json',
    `${JSON.stringify({ name: 'migration-governance-fixture', scripts }, null, 2)}\n`,
  );
}

function createFixtureRepository() {
  const repositoryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'moazez-migration-governance-'),
  );
  TEMPORARY_REPOSITORIES.add(repositoryRoot);

  run('git', ['init', '--initial-branch=main'], repositoryRoot);
  runGit(repositoryRoot, 'config', 'user.name', 'Migration Governance Test');
  runGit(
    repositoryRoot,
    'config',
    'user.email',
    'migration-governance@example.invalid',
  );
  runGit(repositoryRoot, 'config', 'core.autocrlf', 'false');

  writeFile(
    repositoryRoot,
    'prisma/schema.prisma',
    [
      'generator client {',
      '  provider = "prisma-client-js"',
      '}',
      '',
      'datasource db {',
      '  provider = "postgresql"',
      '  url      = env("DATABASE_URL")',
      '}',
      '',
    ].join('\n'),
  );
  writeFile(
    repositoryRoot,
    'prisma/migrations/migration_lock.toml',
    '# Managed by Prisma\nprovider = "postgresql"\n',
  );
  writeMigration(repositoryRoot, BASE_MIGRATION);
  writePackageScripts(repositoryRoot, {
    safe: ['prisma', 'migrate', 'deploy'].join(' '),
  });

  runGit(repositoryRoot, 'add', '.');
  runGit(repositoryRoot, 'commit', '-m', 'fixture baseline');
  runGit(repositoryRoot, 'update-ref', 'refs/remotes/origin/main', 'HEAD');

  return repositoryRoot;
}

function runChecker(repositoryRoot, environmentOverrides = {}) {
  const environment = { ...process.env };
  delete environment.MIGRATION_BASE_REF;
  delete environment.MIGRATION_REBASELINE_APPROVED;
  Object.assign(environment, environmentOverrides);

  const result = spawnSync(process.execPath, [CHECKER_PATH], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    shell: false,
    env: environment,
  });

  if (result.error) {
    throw result.error;
  }

  return {
    status: result.status,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  };
}

function assertPasses(result) {
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /Migration governance check passed:/);
}

function assertFailsWith(result, code) {
  assert.notEqual(result.status, 0, result.output);
  assert.match(result.output, new RegExp(`\\[${code}\\]`));
}

function replaceWithCanonicalBaseline(repositoryRoot, sql = 'SELECT 1;\n') {
  fs.rmSync(path.join(repositoryRoot, 'prisma', 'migrations', BASE_MIGRATION), {
    recursive: true,
    force: true,
  });
  writeMigration(repositoryRoot, '20261231235959_baseline_v1', sql);
}

afterEach(() => {
  for (const repositoryRoot of TEMPORARY_REPOSITORIES) {
    fs.rmSync(repositoryRoot, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 50,
    });
  }
  TEMPORARY_REPOSITORIES.clear();
});

test('passes a clean repository using origin/main by default', () => {
  const repositoryRoot = createFixtureRepository();
  const result = runChecker(repositoryRoot);

  assertPasses(result);
  assert.match(result.output, /base=origin\/main/);
  assert.match(result.output, /active=1, new=0/);
});

test('honors a custom migration base reference', () => {
  const repositoryRoot = createFixtureRepository();
  runGit(repositoryRoot, 'tag', 'comparison-base');
  runGit(repositoryRoot, 'update-ref', '-d', 'refs/remotes/origin/main');

  const result = runChecker(repositoryRoot, {
    MIGRATION_BASE_REF: 'comparison-base',
  });

  assertPasses(result);
  assert.match(result.output, /base=comparison-base/);
});

test('fails when the migration base reference cannot be resolved', () => {
  const repositoryRoot = createFixtureRepository();
  const result = runChecker(repositoryRoot, {
    MIGRATION_BASE_REF: 'missing-comparison-ref',
  });

  assertFailsWith(result, 'BASE_REF_INVALID');
});

test('can run from a repository subdirectory', () => {
  const repositoryRoot = createFixtureRepository();
  const nestedDirectory = path.join(repositoryRoot, 'nested', 'directory');
  fs.mkdirSync(nestedDirectory, { recursive: true });

  const result = runChecker(nestedDirectory);

  assertPasses(result);
});

test('rejects date-only and otherwise malformed directory names', () => {
  const repositoryRoot = createFixtureRepository();
  writeMigration(repositoryRoot, '20260102_legacy');
  writeMigration(repositoryRoot, '20260102030405_Invalid_Name');

  const result = runChecker(repositoryRoot);

  assertFailsWith(result, 'MIGRATION_NAME_DATE_ONLY');
  assert.match(result.output, /\[MIGRATION_NAME_INVALID\]/);
});

test('rejects a migration directory without migration.sql', () => {
  const repositoryRoot = createFixtureRepository();
  fs.mkdirSync(
    path.join(
      repositoryRoot,
      'prisma',
      'migrations',
      '20260102030405_missing_sql',
    ),
    { recursive: true },
  );

  const result = runChecker(repositoryRoot);

  assertFailsWith(result, 'MIGRATION_SQL_MISSING');
});

test('rejects an empty migration.sql', () => {
  const repositoryRoot = createFixtureRepository();
  writeMigration(repositoryRoot, '20260102030405_empty', ' \r\n\t');

  const result = runChecker(repositoryRoot);

  assertFailsWith(result, 'MIGRATION_SQL_EMPTY');
});

test('rejects a migration.sql that is not a regular file', () => {
  const repositoryRoot = createFixtureRepository();
  const sqlDirectory = path.join(
    repositoryRoot,
    'prisma',
    'migrations',
    '20260102030405_sql_directory',
    'migration.sql',
  );
  fs.mkdirSync(sqlDirectory, { recursive: true });

  const result = runChecker(repositoryRoot);

  assertFailsWith(result, 'MIGRATION_SQL_NOT_FILE');
});

test('rejects duplicate fourteen-digit timestamps', () => {
  const repositoryRoot = createFixtureRepository();
  writeMigration(repositoryRoot, '20260101010101_duplicate');

  const result = runChecker(repositoryRoot);

  assertFailsWith(result, 'MIGRATION_TIMESTAMP_DUPLICATE');
});

test('rejects unexpected files and nested directories inside a migration', () => {
  const repositoryRoot = createFixtureRepository();
  const migrationDirectory = path.join(
    repositoryRoot,
    'prisma',
    'migrations',
    '20260102030405_extra_entries',
  );
  writeMigration(repositoryRoot, '20260102030405_extra_entries');
  writeFile(
    repositoryRoot,
    'prisma/migrations/20260102030405_extra_entries/README.md',
    'unexpected\n',
  );
  fs.mkdirSync(path.join(migrationDirectory, 'nested'), { recursive: true });

  const result = runChecker(repositoryRoot);

  assertFailsWith(result, 'MIGRATION_UNEXPECTED_ENTRY');
});

test('rejects unexpected files at the migration root', () => {
  const repositoryRoot = createFixtureRepository();
  writeFile(repositoryRoot, 'prisma/migrations/README.md', 'unexpected\n');

  const result = runChecker(repositoryRoot);

  assertFailsWith(result, 'MIGRATION_ROOT_ENTRY_UNEXPECTED');
});

test('requires the PostgreSQL migration lock file', () => {
  const repositoryRoot = createFixtureRepository();
  fs.rmSync(
    path.join(repositoryRoot, 'prisma', 'migrations', 'migration_lock.toml'),
  );

  const result = runChecker(repositoryRoot);

  assertFailsWith(result, 'MIGRATION_LOCK_MISSING');
});

test('rejects an empty active migration set', () => {
  const repositoryRoot = createFixtureRepository();
  fs.rmSync(path.join(repositoryRoot, 'prisma', 'migrations', BASE_MIGRATION), {
    recursive: true,
    force: true,
  });

  const result = runChecker(repositoryRoot);

  assertFailsWith(result, 'MIGRATION_SET_EMPTY');
});

test('rejects schema changes without a new migration', () => {
  const repositoryRoot = createFixtureRepository();
  fs.appendFileSync(
    path.join(repositoryRoot, 'prisma', 'schema.prisma'),
    '// schema change\n',
  );

  const result = runChecker(repositoryRoot);

  assertFailsWith(result, 'SCHEMA_WITHOUT_NEW_MIGRATION');
});

test('accepts a schema change with an untracked valid migration', () => {
  const repositoryRoot = createFixtureRepository();
  fs.appendFileSync(
    path.join(repositoryRoot, 'prisma', 'schema.prisma'),
    '// schema change\n',
  );
  writeMigration(repositoryRoot, '20260102030405_schema_change');

  const result = runChecker(repositoryRoot);

  assertPasses(result);
  assert.match(result.output, /new=1/);
});

test('accepts a committed schema change with a new migration', () => {
  const repositoryRoot = createFixtureRepository();
  fs.appendFileSync(
    path.join(repositoryRoot, 'prisma', 'schema.prisma'),
    '// committed schema change\n',
  );
  writeMigration(repositoryRoot, '20260102030405_committed_change');
  runGit(repositoryRoot, 'add', '.');
  runGit(repositoryRoot, 'commit', '-m', 'schema change with migration');

  const result = runChecker(repositoryRoot);

  assertPasses(result);
  assert.match(result.output, /new=1/);
});

test('rejects modification of an existing migration', () => {
  const repositoryRoot = createFixtureRepository();
  fs.appendFileSync(
    path.join(
      repositoryRoot,
      'prisma',
      'migrations',
      BASE_MIGRATION,
      'migration.sql',
    ),
    'SELECT 2;\n',
  );

  const result = runChecker(repositoryRoot);

  assertFailsWith(result, 'MIGRATION_IMMUTABLE_MODIFIED');
});

test('rejects deletion of an existing migration', () => {
  const repositoryRoot = createFixtureRepository();
  fs.rmSync(path.join(repositoryRoot, 'prisma', 'migrations', BASE_MIGRATION), {
    recursive: true,
    force: true,
  });
  writeMigration(repositoryRoot, '20260102030405_replacement');

  const result = runChecker(repositoryRoot);

  assertFailsWith(result, 'MIGRATION_IMMUTABLE_DELETED');
});

test('rejects renaming an existing migration', () => {
  const repositoryRoot = createFixtureRepository();
  fs.renameSync(
    path.join(repositoryRoot, 'prisma', 'migrations', BASE_MIGRATION),
    path.join(repositoryRoot, 'prisma', 'migrations', '20260102030405_renamed'),
  );
  runGit(repositoryRoot, 'add', '-A');

  const result = runChecker(repositoryRoot);

  assertFailsWith(result, 'MIGRATION_IMMUTABLE_RENAMED');
});

for (const [label, commandParts] of [
  ['database execution', ['prisma', 'db', 'execute', '--file', 'change.sql']],
  ['database push', ['prisma', 'db', 'push']],
  ['migration resolution', ['prisma', 'migrate', 'resolve', '--applied', 'x']],
  ['migration reset', ['prisma', 'migrate', 'reset', '--force']],
]) {
  test(`rejects the forbidden ${label} package script`, () => {
    const repositoryRoot = createFixtureRepository();
    writePackageScripts(repositoryRoot, {
      unsafe: commandParts.join(' '),
    });

    const result = runChecker(repositoryRoot);

    assertFailsWith(result, 'FORBIDDEN_MIGRATION_COMMAND');
  });
}

test('rejects a forbidden command assembled in an executable helper', () => {
  const repositoryRoot = createFixtureRepository();
  writeFile(
    repositoryRoot,
    'scripts/unsafe.cjs',
    [
      "const { spawnSync } = require('node:child_process');",
      `spawnSync('${['pri', 'sma'].join('')}', ['db', 'push']);`,
      '',
    ].join('\n'),
  );

  const result = runChecker(repositoryRoot);

  assertFailsWith(result, 'FORBIDDEN_MIGRATION_COMMAND');
  assert.match(result.output, /scripts\/unsafe\.cjs/);
});

test('rejects a forbidden command in a workflow', () => {
  const repositoryRoot = createFixtureRepository();
  const unsafeCommand = ['prisma', 'migrate', 'resolve', '--applied', 'x'].join(
    ' ',
  );
  writeFile(
    repositoryRoot,
    '.github/workflows/unsafe.yml',
    `name: unsafe\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npx ${unsafeCommand}\n`,
  );

  const result = runChecker(repositoryRoot);

  assertFailsWith(result, 'FORBIDDEN_MIGRATION_COMMAND');
  assert.match(result.output, /\.github\/workflows\/unsafe\.yml/);
});

test('rejects a generic future baseline replacement even with the approval variable', () => {
  const repositoryRoot = createFixtureRepository();
  replaceWithCanonicalBaseline(repositoryRoot);

  const unapprovedResult = runChecker(repositoryRoot);
  assertFailsWith(unapprovedResult, 'MIGRATION_IMMUTABLE_DELETED');

  const attemptedBypass = runChecker(repositoryRoot, {
    MIGRATION_REBASELINE_APPROVED: '1',
  });
  assertFailsWith(attemptedBypass, 'REBASELINE_INCIDENT_NOT_AUTHORIZED');
  assert.match(attemptedBypass.output, /\[REBASELINE_BASE_COMMIT_MISMATCH\]/);
  assert.match(attemptedBypass.output, /\[REBASELINE_SAFETY_TAG_MISMATCH\]/);
  assert.match(attemptedBypass.output, /\[MIGRATION_IMMUTABLE_DELETED\]/);
});

test('does not accept a truthy but inexact approval value', () => {
  const repositoryRoot = createFixtureRepository();
  replaceWithCanonicalBaseline(repositoryRoot);

  const result = runChecker(repositoryRoot, {
    MIGRATION_REBASELINE_APPROVED: 'true',
  });

  assertFailsWith(result, 'REBASELINE_APPROVAL_INVALID');
  assert.match(result.output, /\[MIGRATION_IMMUTABLE_DELETED\]/);
});

test('does not waive a one-off existing migration modification', () => {
  const repositoryRoot = createFixtureRepository();
  fs.appendFileSync(
    path.join(
      repositoryRoot,
      'prisma',
      'migrations',
      BASE_MIGRATION,
      'migration.sql',
    ),
    'SELECT 2;\n',
  );

  const result = runChecker(repositoryRoot, {
    MIGRATION_REBASELINE_APPROVED: '1',
  });

  assertFailsWith(result, 'REBASELINE_INCIDENT_NOT_AUTHORIZED');
  assert.match(result.output, /\[REBASELINE_BASE_COMMIT_MISMATCH\]/);
  assert.match(result.output, /\[MIGRATION_IMMUTABLE_MODIFIED\]/);
});

test('does not waive an invalid baseline migration', () => {
  const repositoryRoot = createFixtureRepository();
  replaceWithCanonicalBaseline(repositoryRoot, ' \n');

  const result = runChecker(repositoryRoot, {
    MIGRATION_REBASELINE_APPROVED: '1',
  });

  assertFailsWith(result, 'MIGRATION_SQL_EMPTY');
  assert.match(result.output, /\[REBASELINE_INCIDENT_NOT_AUTHORIZED\]/);
  assert.match(result.output, /\[REBASELINE_BASELINE_SQL_INVALID\]/);
  assert.match(result.output, /\[MIGRATION_IMMUTABLE_DELETED\]/);
});

test('keeps forbidden-command enforcement active during rebaseline', () => {
  const repositoryRoot = createFixtureRepository();
  replaceWithCanonicalBaseline(repositoryRoot);
  writePackageScripts(repositoryRoot, {
    unsafe: ['prisma', 'db', 'push'].join(' '),
  });

  const result = runChecker(repositoryRoot, {
    MIGRATION_REBASELINE_APPROVED: '1',
  });

  assertFailsWith(result, 'FORBIDDEN_MIGRATION_COMMAND');
  assert.match(result.output, /\[REBASELINE_INCIDENT_NOT_AUTHORIZED\]/);
  assert.match(result.output, /\[MIGRATION_IMMUTABLE_DELETED\]/);
  assert.doesNotMatch(result.output, /\[REBASELINE_APPROVED\]/);
});
