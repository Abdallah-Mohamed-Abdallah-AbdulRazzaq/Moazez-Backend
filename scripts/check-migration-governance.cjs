'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const DEFAULT_BASE_REF = 'origin/main';
const MIGRATIONS_PATH = 'prisma/migrations';
const SCHEMA_PATH = 'prisma/schema.prisma';
const MIGRATION_DIRECTORY_PATTERN = /^\d{14}_[a-z0-9_]+$/;
const DATE_ONLY_MIGRATION_PATTERN = /^\d{8}_[a-z0-9_]+$/;
const APPROVED_REBASELINE_BASE_COMMIT =
  '905d67c09c1da3299316dcd37c8480a3a983efb1';
const APPROVED_REBASELINE_SAFETY_TAG =
  'migration-history-pre-rebaseline-20260710';
const APPROVED_REBASELINE_MIGRATION = '20260710135222_baseline_v1';
const EXECUTABLE_SCRIPT_EXTENSIONS = new Set([
  '.bat',
  '.cjs',
  '.cmd',
  '.js',
  '.mjs',
  '.ps1',
  '.sh',
  '.ts',
]);
const WORKFLOW_EXTENSIONS = new Set(['.yaml', '.yml']);
const COMMAND_SCAN_TOKEN = ['pri', 'sma'].join('');
const FORBIDDEN_MIGRATION_COMMAND_PATTERN = new RegExp(
  `\\b${COMMAND_SCAN_TOKEN}(?:\\.cmd)?\\b(?:\\s+[^\\s;&|]+){0,8}?\\s+` +
    '(?:db\\s+(?:execute|push)|migrate\\s+(?:resolve|reset))\\b',
  'gi',
);
const MAX_GIT_OUTPUT_BYTES = 16 * 1024 * 1024;

function issue(code, message) {
  return { code, message };
}

function toRepositoryPath(repositoryRoot, absolutePath) {
  return path.relative(repositoryRoot, absolutePath).split(path.sep).join('/');
}

function runGit(workingDirectory, args) {
  const result = spawnSync('git', args, {
    cwd: workingDirectory,
    encoding: 'utf8',
    shell: false,
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
  });

  return {
    status: result.status ?? -1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error,
  };
}

function findRepositoryRoot(startDirectory) {
  const result = runGit(startDirectory, ['rev-parse', '--show-toplevel']);

  if (result.status !== 0 || !result.stdout.trim()) {
    return {
      repositoryRoot: null,
      problem: issue(
        'GIT_REPOSITORY_REQUIRED',
        'The migration governance check must run inside a Git repository.',
      ),
    };
  }

  return {
    repositoryRoot: path.resolve(result.stdout.trim()),
    problem: null,
  };
}

function readDirectoryEntries(directoryPath) {
  return fs.readdirSync(directoryPath, { withFileTypes: true });
}

function validateMigrationTree(repositoryRoot) {
  const problems = [];
  const migrationsDirectory = path.join(repositoryRoot, MIGRATIONS_PATH);
  const migrationRecords = [];

  if (!fs.existsSync(migrationsDirectory)) {
    problems.push(
      issue(
        'MIGRATION_ROOT_MISSING',
        `Migration root is missing: ${MIGRATIONS_PATH}.`,
      ),
    );
    return { problems, migrationRecords };
  }

  let rootEntries;
  try {
    rootEntries = readDirectoryEntries(migrationsDirectory);
  } catch (error) {
    problems.push(
      issue(
        'MIGRATION_ROOT_UNREADABLE',
        `Migration root cannot be read: ${error instanceof Error ? error.message : String(error)}.`,
      ),
    );
    return { problems, migrationRecords };
  }

  const lockEntry = rootEntries.find(
    (entry) => entry.name === 'migration_lock.toml',
  );

  if (!lockEntry || !lockEntry.isFile()) {
    problems.push(
      issue(
        'MIGRATION_LOCK_MISSING',
        `${MIGRATIONS_PATH}/migration_lock.toml must be a regular file.`,
      ),
    );
  } else {
    const lockPath = path.join(migrationsDirectory, lockEntry.name);
    const lockContents = fs.readFileSync(lockPath, 'utf8');
    if (!/^\s*provider\s*=\s*"postgresql"\s*$/m.test(lockContents)) {
      problems.push(
        issue(
          'MIGRATION_LOCK_INVALID',
          'migration_lock.toml must declare provider = "postgresql".',
        ),
      );
    }
  }

  for (const entry of rootEntries) {
    if (entry.name === 'migration_lock.toml') {
      continue;
    }

    if (!entry.isDirectory()) {
      problems.push(
        issue(
          'MIGRATION_ROOT_ENTRY_UNEXPECTED',
          `Unexpected entry in ${MIGRATIONS_PATH}: ${entry.name}.`,
        ),
      );
      continue;
    }

    const record = {
      name: entry.name,
      timestamp: null,
      sqlExists: false,
      sqlNonEmpty: false,
      valid: true,
    };
    const timestampMatch = /^(\d{14})_/.exec(entry.name);
    record.timestamp = timestampMatch ? timestampMatch[1] : null;

    if (!MIGRATION_DIRECTORY_PATTERN.test(entry.name)) {
      record.valid = false;
      if (DATE_ONLY_MIGRATION_PATTERN.test(entry.name)) {
        problems.push(
          issue(
            'MIGRATION_NAME_DATE_ONLY',
            `Migration directory uses a legacy date-only timestamp: ${entry.name}.`,
          ),
        );
      } else {
        problems.push(
          issue(
            'MIGRATION_NAME_INVALID',
            `Migration directory must match ^\\d{14}_[a-z0-9_]+$: ${entry.name}.`,
          ),
        );
      }
    }

    const migrationDirectory = path.join(migrationsDirectory, entry.name);
    let migrationEntries;
    try {
      migrationEntries = readDirectoryEntries(migrationDirectory);
    } catch (error) {
      record.valid = false;
      problems.push(
        issue(
          'MIGRATION_DIRECTORY_UNREADABLE',
          `Migration directory cannot be read (${entry.name}): ${
            error instanceof Error ? error.message : String(error)
          }.`,
        ),
      );
      migrationRecords.push(record);
      continue;
    }

    const sqlEntry = migrationEntries.find(
      (migrationEntry) => migrationEntry.name === 'migration.sql',
    );

    if (!sqlEntry) {
      record.valid = false;
      problems.push(
        issue(
          'MIGRATION_SQL_MISSING',
          `${entry.name} is missing migration.sql.`,
        ),
      );
    } else if (!sqlEntry.isFile()) {
      record.valid = false;
      problems.push(
        issue(
          'MIGRATION_SQL_NOT_FILE',
          `${entry.name}/migration.sql must be a regular file.`,
        ),
      );
    } else {
      const sqlPath = path.join(migrationDirectory, sqlEntry.name);
      record.sqlExists = true;
      try {
        if (!fs.readFileSync(sqlPath, 'utf8').trim()) {
          record.valid = false;
          problems.push(
            issue(
              'MIGRATION_SQL_EMPTY',
              `${entry.name}/migration.sql must not be empty.`,
            ),
          );
        } else {
          record.sqlNonEmpty = true;
        }
      } catch (error) {
        record.valid = false;
        problems.push(
          issue(
            'MIGRATION_SQL_UNREADABLE',
            `${entry.name}/migration.sql cannot be read: ${
              error instanceof Error ? error.message : String(error)
            }.`,
          ),
        );
      }
    }

    for (const migrationEntry of migrationEntries) {
      if (migrationEntry.name !== 'migration.sql') {
        record.valid = false;
        problems.push(
          issue(
            'MIGRATION_UNEXPECTED_ENTRY',
            `Unexpected entry in ${entry.name}: ${migrationEntry.name}.`,
          ),
        );
      }
    }

    migrationRecords.push(record);
  }

  if (migrationRecords.length === 0) {
    problems.push(
      issue(
        'MIGRATION_SET_EMPTY',
        'At least one active Prisma migration directory is required.',
      ),
    );
  }

  const recordsByTimestamp = new Map();
  for (const record of migrationRecords) {
    if (!record.timestamp) {
      continue;
    }
    const records = recordsByTimestamp.get(record.timestamp) ?? [];
    records.push(record);
    recordsByTimestamp.set(record.timestamp, records);
  }

  for (const [timestamp, records] of recordsByTimestamp.entries()) {
    if (records.length < 2) {
      continue;
    }
    for (const record of records) {
      record.valid = false;
    }
    problems.push(
      issue(
        'MIGRATION_TIMESTAMP_DUPLICATE',
        `Duplicate migration timestamp ${timestamp}: ${records
          .map((record) => record.name)
          .join(', ')}.`,
      ),
    );
  }

  migrationRecords.sort((left, right) => left.name.localeCompare(right.name));
  return { problems, migrationRecords };
}

function resolveBaseCommit(repositoryRoot, baseRef) {
  if (!baseRef || baseRef.startsWith('-')) {
    return {
      commit: null,
      problem: issue(
        'BASE_REF_INVALID',
        `MIGRATION_BASE_REF is invalid: ${baseRef || '(empty)'}.`,
      ),
    };
  }

  const result = runGit(repositoryRoot, [
    'rev-parse',
    '--verify',
    '--quiet',
    '--end-of-options',
    `${baseRef}^{commit}`,
  ]);
  const commit = result.stdout.trim();

  if (result.status !== 0 || !/^[0-9a-f]{40,64}$/i.test(commit)) {
    return {
      commit: null,
      problem: issue(
        'BASE_REF_INVALID',
        `MIGRATION_BASE_REF does not resolve to a commit: ${baseRef}.`,
      ),
    };
  }

  return { commit, problem: null };
}

function resolveSafetyTagCommit(repositoryRoot) {
  const result = runGit(repositoryRoot, [
    'rev-parse',
    '--verify',
    '--quiet',
    '--end-of-options',
    `refs/tags/${APPROVED_REBASELINE_SAFETY_TAG}^{commit}`,
  ]);
  const commit = result.stdout.trim();

  if (result.status !== 0 || !/^[0-9a-f]{40,64}$/i.test(commit)) {
    return null;
  }

  return commit;
}

function evaluateIncidentRebaselineAuthorization({
  baseCommit,
  safetyTagCommit,
  migrationRecords,
}) {
  const problems = [];

  if (baseCommit !== APPROVED_REBASELINE_BASE_COMMIT) {
    problems.push(
      issue(
        'REBASELINE_BASE_COMMIT_MISMATCH',
        `Incident approval requires base commit ${APPROVED_REBASELINE_BASE_COMMIT}.`,
      ),
    );
  }

  if (safetyTagCommit !== APPROVED_REBASELINE_BASE_COMMIT) {
    problems.push(
      issue(
        'REBASELINE_SAFETY_TAG_MISMATCH',
        `Incident approval requires ${APPROVED_REBASELINE_SAFETY_TAG} to resolve to ${APPROVED_REBASELINE_BASE_COMMIT}.`,
      ),
    );
  }

  if (migrationRecords.length !== 1) {
    problems.push(
      issue(
        'REBASELINE_ACTIVE_SET_MISMATCH',
        `Incident approval requires exactly one active migration directory: ${APPROVED_REBASELINE_MIGRATION}.`,
      ),
    );
  } else {
    const [baseline] = migrationRecords;
    if (baseline.name !== APPROVED_REBASELINE_MIGRATION) {
      problems.push(
        issue(
          'REBASELINE_BASELINE_NAME_MISMATCH',
          `Incident approval requires active migration ${APPROVED_REBASELINE_MIGRATION}.`,
        ),
      );
    }
    if (!baseline.sqlExists || !baseline.sqlNonEmpty) {
      problems.push(
        issue(
          'REBASELINE_BASELINE_SQL_INVALID',
          `Incident approval requires a non-empty ${APPROVED_REBASELINE_MIGRATION}/migration.sql.`,
        ),
      );
    }
  }

  return {
    approved: problems.length === 0,
    problems,
  };
}

function inspectIncidentRebaselineAuthorization({
  startDirectory = process.cwd(),
  environment = process.env,
} = {}) {
  const repositoryResult = findRepositoryRoot(startDirectory);
  if (repositoryResult.problem) {
    return {
      approved: false,
      problems: [repositoryResult.problem],
      summary: null,
    };
  }

  const repositoryRoot = repositoryResult.repositoryRoot;
  const baseRef = environment.MIGRATION_BASE_REF || DEFAULT_BASE_REF;
  const baseResult = resolveBaseCommit(repositoryRoot, baseRef);
  if (baseResult.problem) {
    return {
      approved: false,
      problems: [baseResult.problem],
      summary: {
        repositoryRoot,
        baseRef,
        baseCommit: null,
        safetyTagCommit: resolveSafetyTagCommit(repositoryRoot),
        activeMigrationCount: null,
      },
    };
  }

  const migrationTree = validateMigrationTree(repositoryRoot);
  const authorization = evaluateIncidentRebaselineAuthorization({
    baseCommit: baseResult.commit,
    safetyTagCommit: resolveSafetyTagCommit(repositoryRoot),
    migrationRecords: migrationTree.migrationRecords,
  });

  return {
    approved: authorization.approved,
    problems: authorization.problems,
    summary: {
      repositoryRoot,
      baseRef,
      baseCommit: baseResult.commit,
      safetyTagCommit: resolveSafetyTagCommit(repositoryRoot),
      activeMigrationCount: migrationTree.migrationRecords.length,
    },
  };
}

function readBaseMigrationDirectories(repositoryRoot, baseCommit) {
  const result = runGit(repositoryRoot, [
    'ls-tree',
    '-r',
    '--name-only',
    baseCommit,
    '--',
    MIGRATIONS_PATH,
  ]);

  if (result.status !== 0) {
    return {
      directories: new Set(),
      problem: issue(
        'BASE_MIGRATION_INVENTORY_FAILED',
        'Unable to read the migration inventory from MIGRATION_BASE_REF.',
      ),
    };
  }

  const directories = new Set();
  for (const filePath of result.stdout.split(/\r?\n/)) {
    const match = /^prisma\/migrations\/([^/]+)\//.exec(filePath);
    if (match) {
      directories.add(match[1]);
    }
  }

  return { directories, problem: null };
}

function migrationDirectoryFromRepositoryPath(filePath) {
  const match = /^prisma\/migrations\/([^/]+)\//.exec(filePath);
  return match ? match[1] : null;
}

function readMigrationHistoryProblems(
  repositoryRoot,
  baseCommit,
  baseMigrationDirectories,
  currentMigrationDirectories,
) {
  const result = runGit(repositoryRoot, [
    'diff',
    '--name-status',
    '--find-renames=50%',
    '--no-ext-diff',
    baseCommit,
    '--',
    MIGRATIONS_PATH,
  ]);

  if (result.status !== 0) {
    return [
      issue(
        'MIGRATION_HISTORY_DIFF_FAILED',
        'Unable to compare migration history with MIGRATION_BASE_REF.',
      ),
    ];
  }

  const problemsByKey = new Map();
  const affectedBaseDirectories = new Set();

  function addHistoryProblem(code, key, message, baseDirectory) {
    problemsByKey.set(`${code}:${key}`, issue(code, message));
    if (baseDirectory) {
      affectedBaseDirectories.add(baseDirectory);
    }
  }

  for (const line of result.stdout.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    const fields = line.split('\t');
    const status = fields[0];
    const statusType = status[0];

    if (statusType === 'R') {
      const oldPath = fields[1] ?? '';
      const newPath = fields[2] ?? '';
      const oldDirectory = migrationDirectoryFromRepositoryPath(oldPath);
      const newDirectory = migrationDirectoryFromRepositoryPath(newPath);
      if (oldDirectory && baseMigrationDirectories.has(oldDirectory)) {
        addHistoryProblem(
          'MIGRATION_IMMUTABLE_RENAMED',
          `${oldDirectory}:${newDirectory ?? newPath}`,
          `Existing migration was renamed: ${oldDirectory} -> ${
            newDirectory ?? newPath
          }.`,
          oldDirectory,
        );
      }
      continue;
    }

    const filePath = fields[1] ?? '';
    const migrationDirectory = migrationDirectoryFromRepositoryPath(filePath);
    if (
      !migrationDirectory ||
      !baseMigrationDirectories.has(migrationDirectory)
    ) {
      continue;
    }

    if (statusType === 'D') {
      addHistoryProblem(
        'MIGRATION_IMMUTABLE_DELETED',
        migrationDirectory,
        `Existing migration was deleted: ${migrationDirectory}.`,
        migrationDirectory,
      );
    } else if (statusType === 'T') {
      addHistoryProblem(
        'MIGRATION_IMMUTABLE_TYPE_CHANGED',
        migrationDirectory,
        `Existing migration changed filesystem type: ${migrationDirectory}.`,
        migrationDirectory,
      );
    } else if (statusType === 'M' || statusType === 'A') {
      addHistoryProblem(
        'MIGRATION_IMMUTABLE_MODIFIED',
        migrationDirectory,
        `Existing migration was modified: ${migrationDirectory}.`,
        migrationDirectory,
      );
    }
  }

  for (const baseDirectory of baseMigrationDirectories) {
    if (
      !currentMigrationDirectories.has(baseDirectory) &&
      !affectedBaseDirectories.has(baseDirectory)
    ) {
      addHistoryProblem(
        'MIGRATION_IMMUTABLE_DELETED',
        baseDirectory,
        `Existing migration was deleted: ${baseDirectory}.`,
        baseDirectory,
      );
    }
  }

  return [...problemsByKey.values()];
}

function readSchemaChangeState(repositoryRoot, baseCommit) {
  const schemaPath = path.join(repositoryRoot, SCHEMA_PATH);
  if (!fs.existsSync(schemaPath) || !fs.statSync(schemaPath).isFile()) {
    return {
      changed: null,
      problem: issue(
        'SCHEMA_MISSING',
        `${SCHEMA_PATH} must be a regular file.`,
      ),
    };
  }

  const result = runGit(repositoryRoot, [
    'diff',
    '--quiet',
    '--no-ext-diff',
    baseCommit,
    '--',
    SCHEMA_PATH,
  ]);

  if (result.status === 0) {
    return { changed: false, problem: null };
  }
  if (result.status === 1) {
    return { changed: true, problem: null };
  }

  return {
    changed: null,
    problem: issue(
      'SCHEMA_DIFF_FAILED',
      'Unable to compare schema.prisma with MIGRATION_BASE_REF.',
    ),
  };
}

function normalizeExecutableSource(source) {
  return source
    .replace(/\\\r?\n/g, ' ')
    .replace(/`\r?\n/g, ' ')
    .replace(/[\[\]{}(),"'`]/g, ' ')
    .replace(/\s+/g, ' ');
}

function findForbiddenCommand(source) {
  const normalizedSource = normalizeExecutableSource(source);
  FORBIDDEN_MIGRATION_COMMAND_PATTERN.lastIndex = 0;
  const match = FORBIDDEN_MIGRATION_COMMAND_PATTERN.exec(normalizedSource);
  return match ? match[0].replace(/\s+/g, ' ').trim() : null;
}

function walkFiles(directoryPath, shouldInclude, shouldSkipDirectory) {
  if (!fs.existsSync(directoryPath)) {
    return [];
  }

  const files = [];
  const pendingDirectories = [directoryPath];
  while (pendingDirectories.length > 0) {
    const currentDirectory = pendingDirectories.pop();
    for (const entry of readDirectoryEntries(currentDirectory)) {
      const entryPath = path.join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        if (!shouldSkipDirectory(entryPath)) {
          pendingDirectories.push(entryPath);
        }
      } else if (entry.isFile() && shouldInclude(entryPath)) {
        files.push(entryPath);
      }
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function scanForbiddenMigrationCommands(repositoryRoot) {
  const problems = [];
  const packagePath = path.join(repositoryRoot, 'package.json');

  if (fs.existsSync(packagePath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      const scripts = packageJson.scripts ?? {};
      for (const [scriptName, command] of Object.entries(scripts)) {
        if (typeof command !== 'string') {
          continue;
        }
        const forbiddenCommand = findForbiddenCommand(command);
        if (forbiddenCommand) {
          problems.push(
            issue(
              'FORBIDDEN_MIGRATION_COMMAND',
              `package.json script "${scriptName}" contains a forbidden Prisma migration command: ${forbiddenCommand}.`,
            ),
          );
        }
      }
    } catch (error) {
      problems.push(
        issue(
          'PACKAGE_JSON_INVALID',
          `package.json cannot be parsed: ${
            error instanceof Error ? error.message : String(error)
          }.`,
        ),
      );
    }
  }

  const scriptsDirectory = path.join(repositoryRoot, 'scripts');
  const scriptsTestsDirectory = path.join(scriptsDirectory, 'tests');
  const scriptFiles = walkFiles(
    scriptsDirectory,
    (filePath) =>
      EXECUTABLE_SCRIPT_EXTENSIONS.has(path.extname(filePath).toLowerCase()),
    (directoryPath) =>
      path.resolve(directoryPath) === path.resolve(scriptsTestsDirectory),
  );

  const workflowsDirectory = path.join(repositoryRoot, '.github', 'workflows');
  const workflowFiles = walkFiles(
    workflowsDirectory,
    (filePath) => WORKFLOW_EXTENSIONS.has(path.extname(filePath).toLowerCase()),
    () => false,
  );

  for (const filePath of [...scriptFiles, ...workflowFiles]) {
    const forbiddenCommand = findForbiddenCommand(
      fs.readFileSync(filePath, 'utf8'),
    );
    if (forbiddenCommand) {
      problems.push(
        issue(
          'FORBIDDEN_MIGRATION_COMMAND',
          `${toRepositoryPath(
            repositoryRoot,
            filePath,
          )} contains a forbidden Prisma migration command: ${forbiddenCommand}.`,
        ),
      );
    }
  }

  return problems;
}

function runGovernanceCheck({
  startDirectory = process.cwd(),
  environment = process.env,
} = {}) {
  const problems = [];
  const warnings = [];
  const repositoryResult = findRepositoryRoot(startDirectory);
  if (repositoryResult.problem) {
    return {
      passed: false,
      problems: [repositoryResult.problem],
      warnings,
      summary: null,
    };
  }

  const repositoryRoot = repositoryResult.repositoryRoot;
  const migrationTree = validateMigrationTree(repositoryRoot);
  problems.push(...migrationTree.problems);
  problems.push(...scanForbiddenMigrationCommands(repositoryRoot));

  const approvalValue = environment.MIGRATION_REBASELINE_APPROVED;
  const rebaselineApproved = approvalValue === '1';
  if (
    approvalValue !== undefined &&
    approvalValue !== '' &&
    !rebaselineApproved
  ) {
    problems.push(
      issue(
        'REBASELINE_APPROVAL_INVALID',
        'MIGRATION_REBASELINE_APPROVED enables recovery mode only when its exact value is 1.',
      ),
    );
  }

  const baseRef = environment.MIGRATION_BASE_REF || DEFAULT_BASE_REF;
  const baseResult = resolveBaseCommit(repositoryRoot, baseRef);
  if (baseResult.problem) {
    problems.push(baseResult.problem);
    return {
      passed: false,
      problems,
      warnings,
      summary: {
        repositoryRoot,
        baseRef,
        baseCommit: null,
        activeMigrationCount: migrationTree.migrationRecords.length,
        newMigrationCount: null,
        rebaselineApproved,
      },
    };
  }

  const baseInventory = readBaseMigrationDirectories(
    repositoryRoot,
    baseResult.commit,
  );
  if (baseInventory.problem) {
    problems.push(baseInventory.problem);
  }

  const currentMigrationDirectories = new Set(
    migrationTree.migrationRecords.map((record) => record.name),
  );
  const newValidMigrations = migrationTree.migrationRecords.filter(
    (record) => record.valid && !baseInventory.directories.has(record.name),
  );

  const historyProblems = baseInventory.problem
    ? []
    : readMigrationHistoryProblems(
        repositoryRoot,
        baseResult.commit,
        baseInventory.directories,
        currentMigrationDirectories,
      );

  const schemaState = readSchemaChangeState(repositoryRoot, baseResult.commit);
  if (schemaState.problem) {
    problems.push(schemaState.problem);
  } else if (schemaState.changed && newValidMigrations.length === 0) {
    problems.push(
      issue(
        'SCHEMA_WITHOUT_NEW_MIGRATION',
        'schema.prisma changed without a new valid migration directory.',
      ),
    );
  }

  if (rebaselineApproved) {
    const incidentAuthorization = evaluateIncidentRebaselineAuthorization({
      baseCommit: baseResult.commit,
      safetyTagCommit: resolveSafetyTagCommit(repositoryRoot),
      migrationRecords: migrationTree.migrationRecords,
    });

    if (!baseInventory.problem && incidentAuthorization.approved) {
      for (const historyProblem of historyProblems) {
        warnings.push(
          issue(
            `WAIVED_${historyProblem.code}`,
            `${historyProblem.message} Waived by explicit full-rebaseline approval.`,
          ),
        );
      }
      warnings.push(
        issue(
          'REBASELINE_APPROVED',
          `Explicit MIGRATION-RECOVERY-0A approval replaced ${APPROVED_REBASELINE_BASE_COMMIT} with ${APPROVED_REBASELINE_MIGRATION}.`,
        ),
      );
    } else {
      problems.push(
        issue(
          'REBASELINE_INCIDENT_NOT_AUTHORIZED',
          'MIGRATION_REBASELINE_APPROVED is valid only for the exact MIGRATION-RECOVERY-0A base, safety tag, and canonical baseline.',
        ),
      );
      problems.push(...incidentAuthorization.problems);
      problems.push(...historyProblems);
    }
  } else {
    problems.push(...historyProblems);
  }

  const summary = {
    repositoryRoot,
    baseRef,
    baseCommit: baseResult.commit,
    activeMigrationCount: migrationTree.migrationRecords.length,
    newMigrationCount: newValidMigrations.length,
    rebaselineApproved,
  };

  return {
    passed: problems.length === 0,
    problems,
    warnings,
    summary,
  };
}

function printResult(result) {
  for (const warning of result.warnings) {
    console.warn(`[${warning.code}] ${warning.message}`);
  }

  if (!result.passed) {
    console.error(
      `Migration governance check failed with ${result.problems.length} issue(s):`,
    );
    for (const problem of result.problems) {
      console.error(`- [${problem.code}] ${problem.message}`);
    }
    return;
  }

  const summary = result.summary;
  console.log(
    `Migration governance check passed: base=${summary.baseRef} (${summary.baseCommit.slice(
      0,
      12,
    )}), active=${summary.activeMigrationCount}, new=${
      summary.newMigrationCount
    }, rebaseline=${summary.rebaselineApproved ? 'approved' : 'off'}.`,
  );
}

function main() {
  try {
    const result = runGovernanceCheck();
    printResult(result);
    if (!result.passed) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(
      `[GOVERNANCE_CHECK_INTERNAL_ERROR] ${
        error instanceof Error ? error.stack || error.message : String(error)
      }`,
    );
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  APPROVED_REBASELINE_BASE_COMMIT,
  APPROVED_REBASELINE_MIGRATION,
  APPROVED_REBASELINE_SAFETY_TAG,
  DEFAULT_BASE_REF,
  MIGRATION_DIRECTORY_PATTERN,
  evaluateIncidentRebaselineAuthorization,
  findForbiddenCommand,
  inspectIncidentRebaselineAuthorization,
  runGovernanceCheck,
};
