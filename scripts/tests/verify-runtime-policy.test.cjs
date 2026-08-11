'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  NODE_ENGINE,
  NODE_IMAGE,
  NODE_VERSION,
  WORKFLOWS,
  verifyRuntimePolicy,
} = require('../verify-runtime-policy.cjs');

const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..');

test('the repository satisfies the supported runtime policy', () => {
  const result = verifyRuntimePolicy(REPOSITORY_ROOT);
  assert.equal(result.nodeVersion, NODE_VERSION);
  assert.equal(result.nodeImage, NODE_IMAGE);
  assert.equal(result.firebaseAdminVersion, '14.0.0');
});

test('drift in every governed runtime surface fails validation', async (t) => {
  const cases = [
    ['.nvmrc', '20.0.0\n', /\.nvmrc/u],
    [
      'package.json',
      packageManifest({ nodeEngine: '>=20', nodeTypes: '^22.20.1' }),
      /engines\.node/u,
    ],
    [
      'package.json',
      packageManifest({ nodeEngine: NODE_ENGINE, nodeTypes: '^24.0.0' }),
      /@types\/node/u,
    ],
    [
      'package.json',
      packageManifest({
        nodeEngine: NODE_ENGINE,
        nodeTypes: '^22.20.1',
        firebaseAdmin: '^15.0.0',
      }),
      /firebase-admin/u,
    ],
    [
      'Dockerfile',
      'ARG NODE_IMAGE=node:22.23.1-bookworm-slim\n',
      /NODE_IMAGE/u,
    ],
    [WORKFLOWS[0], workflow('22'), /setup-node version must equal 22\.23\.1/u],
  ];

  for (const [relativePath, content, expected] of cases) {
    await t.test(String(relativePath), () => {
      const fixture = createFixture();
      fs.writeFileSync(path.join(fixture, relativePath), content);
      assert.throws(() => verifyRuntimePolicy(fixture), expected);
    });
  }
});

test('an unsupported Firebase Node engine relationship fails validation', () => {
  const fixture = createFixture({
    firebaseEngine: '>=23',
  });
  assert.throws(
    () => verifyRuntimePolicy(fixture),
    /compatible with Node 22\.23\.1/u,
  );
});

test('a Firebase engine upper bound excluding Node 22 fails validation', () => {
  const fixture = createFixture({
    firebaseEngine: '>=18 <22',
  });
  assert.throws(
    () => verifyRuntimePolicy(fixture),
    /compatible with Node 22\.23\.1/u,
  );
});

function createFixture(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-policy-'));
  for (const directory of ['.github/workflows']) {
    fs.mkdirSync(path.join(root, directory), { recursive: true });
  }

  fs.writeFileSync(path.join(root, '.nvmrc'), `${NODE_VERSION}\n`);
  fs.writeFileSync(
    path.join(root, 'package.json'),
    packageManifest({
      nodeEngine: NODE_ENGINE,
      nodeTypes: '^22.20.1',
      firebaseAdmin: '^14.0.0',
    }),
  );
  fs.writeFileSync(
    path.join(root, 'package-lock.json'),
    JSON.stringify(
      {
        packages: {
          '': { engines: { node: NODE_ENGINE } },
          'node_modules/@types/node': { version: '22.20.1' },
          'node_modules/firebase-admin': {
            version: '14.0.0',
            engines: { node: options.firebaseEngine ?? '>=22' },
          },
        },
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    path.join(root, 'Dockerfile'),
    `ARG NODE_IMAGE=${NODE_IMAGE}\n`,
  );
  for (const workflowPath of WORKFLOWS) {
    fs.writeFileSync(path.join(root, workflowPath), workflow(NODE_VERSION));
  }
  return root;
}

function packageManifest({ nodeEngine, nodeTypes, firebaseAdmin = '^14.0.0' }) {
  return JSON.stringify(
    {
      engines: { node: nodeEngine },
      dependencies: { 'firebase-admin': firebaseAdmin },
      devDependencies: { '@types/node': nodeTypes },
    },
    null,
    2,
  );
}

function workflow(nodeVersion) {
  return `steps:\n  - uses: actions/setup-node@v4\n    with:\n      node-version: '${nodeVersion}'\n`;
}
