'use strict';

const fs = require('node:fs');
const path = require('node:path');

const NODE_VERSION = '22.23.1';
const NODE_ENGINE = '>=22.23.1 <23';
const NODE_IMAGE =
  'node:22.23.1-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3';
const WORKFLOWS = ['.github/workflows/ci.yml'];

function verifyRuntimePolicy(rootDirectory = path.resolve(__dirname, '..')) {
  const failures = [];
  const read = (relativePath) =>
    fs.readFileSync(path.join(rootDirectory, relativePath), 'utf8');
  const readJson = (relativePath) => JSON.parse(read(relativePath));

  const nvmrc = read('.nvmrc').trim();
  if (nvmrc !== NODE_VERSION) {
    failures.push(`.nvmrc must contain exactly ${NODE_VERSION}`);
  }

  const manifest = readJson('package.json');
  const lock = readJson('package-lock.json');
  const lockRoot = lock.packages && lock.packages[''];

  if (manifest.engines?.node !== NODE_ENGINE) {
    failures.push(`package.json engines.node must equal ${NODE_ENGINE}`);
  }
  if (lockRoot?.engines?.node !== NODE_ENGINE) {
    failures.push(
      `package-lock.json root engines.node must equal ${NODE_ENGINE}`,
    );
  }

  assertMajorLine(
    manifest.devDependencies?.['@types/node'],
    22,
    'package.json @types/node',
    failures,
  );
  assertMajorLine(
    lock.packages?.['node_modules/@types/node']?.version,
    22,
    'package-lock.json @types/node',
    failures,
  );

  assertMajorLine(
    manifest.dependencies?.['firebase-admin'],
    14,
    'package.json firebase-admin',
    failures,
  );
  const lockedFirebase = lock.packages?.['node_modules/firebase-admin'];
  assertMajorLine(
    lockedFirebase?.version,
    14,
    'package-lock.json firebase-admin',
    failures,
  );
  if (!nodeEngineSupportsApprovedRuntime(lockedFirebase?.engines?.node)) {
    failures.push(
      'firebase-admin must declare a Node engine compatible with Node 22.23.1',
    );
  }

  const dockerfile = read('Dockerfile');
  const nodeImageMatch = dockerfile.match(/^ARG NODE_IMAGE=(\S+)$/mu);
  if (!nodeImageMatch || nodeImageMatch[1] !== NODE_IMAGE) {
    failures.push(`Dockerfile NODE_IMAGE must equal ${NODE_IMAGE}`);
  }
  if (!nodeImageMatch?.[1].includes('@sha256:')) {
    failures.push('Dockerfile NODE_IMAGE must include a sha256 digest');
  }

  for (const workflow of WORKFLOWS) {
    const nodeVersions = parseSetupNodeVersions(read(workflow));
    if (nodeVersions.length === 0) {
      failures.push(`${workflow} must contain an actions/setup-node step`);
      continue;
    }
    for (const version of nodeVersions) {
      if (version !== NODE_VERSION) {
        failures.push(
          `${workflow} setup-node version must equal ${NODE_VERSION}`,
        );
      }
    }
  }

  if (failures.length > 0) {
    const error = new Error(
      `Runtime policy validation failed:\n- ${failures.join('\n- ')}`,
    );
    error.failures = failures;
    throw error;
  }

  return {
    nodeVersion: NODE_VERSION,
    nodeEngine: NODE_ENGINE,
    nodeImage: NODE_IMAGE,
    firebaseAdminVersion: lockedFirebase.version,
  };
}

function parseSetupNodeVersions(workflow) {
  const lines = workflow.split(/\r?\n/u);
  const versions = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (!/^\s*(?:-\s*)?uses:\s*actions\/setup-node@/u.test(lines[index])) {
      continue;
    }

    const stepIndent = lines[index].match(/^\s*/u)[0].length;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor];
      if (line.trim().length === 0) continue;
      const indent = line.match(/^\s*/u)[0].length;
      if (indent <= stepIndent && /^\s*-\s+(?:name|uses|run):/u.test(line)) {
        break;
      }
      const match = line.match(/^\s*node-version:\s*['"]?([^'"\s]+)['"]?\s*$/u);
      if (match) {
        versions.push(match[1]);
        break;
      }
    }
  }
  return versions;
}

function assertMajorLine(value, expectedMajor, label, failures) {
  const match = typeof value === 'string' && value.match(/(\d+)\./u);
  if (!match || Number(match[1]) !== expectedMajor) {
    failures.push(`${label} must remain on the ${expectedMajor}.x line`);
  }
}

function nodeEngineSupportsApprovedRuntime(engine) {
  if (typeof engine !== 'string') return false;
  const approved = [22, 23, 1];
  return engine.split('||').some((clause) => {
    const comparators = clause.trim().split(/\s+/u).filter(Boolean);
    return (
      comparators.length > 0 &&
      comparators.every((comparator) =>
        satisfiesComparator(approved, comparator),
      )
    );
  });
}

function satisfiesComparator(version, comparator) {
  const match = comparator.match(
    /^(>=|<=|>|<|=)?v?(\d+)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?$/u,
  );
  if (!match) return false;

  const operator = match[1] ?? '=';
  const expected = [
    Number(match[2]),
    toVersionPart(match[3]),
    toVersionPart(match[4]),
  ];
  const comparison = compareVersions(version, expected);

  switch (operator) {
    case '>=':
      return comparison >= 0;
    case '<=':
      return comparison <= 0;
    case '>':
      return comparison > 0;
    case '<':
      return comparison < 0;
    default:
      return version[0] === expected[0] &&
        (match[3] === undefined || match[3] === 'x' || match[3] === '*')
        ? true
        : comparison === 0;
  }
}

function toVersionPart(value) {
  return value === undefined || value === 'x' || value === '*'
    ? 0
    : Number(value);
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

if (require.main === module) {
  try {
    const result = verifyRuntimePolicy();
    process.stdout.write(
      `Runtime policy verified: Node ${result.nodeVersion}, Firebase Admin ${result.firebaseAdminVersion}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  NODE_ENGINE,
  NODE_IMAGE,
  NODE_VERSION,
  WORKFLOWS,
  parseSetupNodeVersions,
  verifyRuntimePolicy,
};
