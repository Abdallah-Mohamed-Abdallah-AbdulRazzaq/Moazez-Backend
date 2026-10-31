'use strict';
// Manual, owned-fixture measurement. This is not a latency assertion in mandatory CI.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const options = new Map();
for (let i = 2; i < process.argv.length; i += 2)
  options.set(process.argv[i], process.argv[i + 1]);
assert.ok(
  options.has('--output'),
  'An explicit non-secret measurement output path is required',
);
assert.ok(
  [...options.keys()].every((key) =>
    ['--output', '--source-root', '--approved-source'].includes(key),
  ),
);
assert.equal(process.version, 'v22.23.1');
assert.equal(process.env.NODE_ENV, 'test');
// The reused fixture asserts the actual local disposable target before connecting or overriding providers.
const source = path.resolve(options.get('--source-root') || root);
const output = path.resolve(options.get('--output'));
assert.ok(
  !fs.existsSync(output),
  'Do not overwrite prior measurement evidence',
);
const git = (...args) =>
  cp
    .execFileSync('git', ['--no-optional-locks', '-C', source, ...args], {
      encoding: 'utf8',
      windowsHide: true,
    })
    .trim();
assert.equal(
  git('remote', 'get-url', 'origin'),
  'https://github.com/Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Backend.git',
);
const checkedOut = git('rev-parse', 'HEAD');
const tree = git('rev-parse', 'HEAD^{tree}');
assert.equal(
  git('status', '--porcelain=v1', '--untracked-files=all'),
  '',
  'Certification measurements require a clean, committed source checkout',
);
const patch = git('diff', 'HEAD', '--', 'src');
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
let sourceSha = patch ? null : checkedOut;
if (options.has('--approved-source')) {
  const approved = options.get('--approved-source');
  assert.match(approved, /^[0-9a-f]{40}$/u);
  assert.equal(patch, '', 'Approved baseline runtime must remain unchanged');
  assert.equal(
    tree,
    git('rev-parse', approved + '^{tree}'),
    'Baseline checkout must have the exact approved tree',
  );
  sourceSha = approved;
}
const helper = path.join(root, 'test/fixtures/st13-performance.ts');
const identity = {
  source_sha: sourceSha,
  checked_out_sha: checkedOut,
  source_tree: tree,
  runtime_patch_sha256: patch ? hash(patch) : null,
  measurement_helper_sha256: hash(fs.readFileSync(helper)),
  measured_at: new Date().toISOString(),
  process_heap_budget_mib: 4096,
  host: {
    platform: process.platform,
    arch: process.arch,
    logical_cpus: os.cpus().length,
    total_memory_bytes: os.totalmem(),
    available_memory_bytes: os.freemem(),
  },
};
const temporary = fs.mkdtempSync(
  path.join(os.tmpdir(), 'moazez-st13-performance-'),
);
const spec = path.join(temporary, 'st13-performance-run.test.cjs');
const config = path.join(temporary, 'jest.json');
try {
  fs.writeFileSync(
    config,
    JSON.stringify({
      rootDir: root,
      roots: [temporary],
      testEnvironment: 'node',
      testRegex: 'st13-performance-run\\.test\\.cjs$',
      moduleFileExtensions: ['js', 'cjs', 'json', 'ts'],
      transform: {
        '^.+\\.(t|j)s$': [
          require.resolve('ts-jest', { paths: [root] }),
          { tsconfig: path.join(root, 'tsconfig.json') },
        ],
      },
      cacheDirectory: path.join(temporary, 'cache'),
    }),
  );
  fs.writeFileSync(
    spec,
    `
const fs = require('node:fs');
const p = require(${JSON.stringify(helper)});
const actualFetch = global.fetch;
global.fetch = async (...args) => {
  const response = await actualFetch(...args);
  if (!response.ok) {
    const xml = await response.clone().text();
    const code = new RegExp('<Code>([A-Za-z0-9_]+)</Code>').exec(xml)?.[1] || 'unclassified';
    console.info('ST13_PROVIDER_RESPONSE=' + response.status + ':' + code);
  }
  return response;
};
const B = require(${JSON.stringify(path.join(source, 'test/fixtures/st12-grades.http.ts'))});
const P = require(${JSON.stringify(path.join(source, 'src/infrastructure/database/prisma.service.ts'))});
const O = require(${JSON.stringify(path.join(source, 'src/infrastructure/database/prisma-client-options.provider.ts'))});
const H = p.measuredSt13Harness(B.St12GradesHttp, P.PrismaService, O.PRISMA_CLIENT_OPTIONS, O.createPrismaClientOptions);
const h = new H();
beforeAll(async () => { await h.start(); await h.reset(); }, 90000);
afterAll(async () => { try { await h.disposeSt12Case(); } finally { await h.close(); } }, 90000);
test('ST13 bounded actual HTTP/SQL/private-byte performance measurements', async () => {
  const measurements = await p.runSt13Performance(h);
  fs.writeFileSync(${JSON.stringify(output)}, JSON.stringify({ ...${JSON.stringify(identity)}, ...measurements }, null, 2), { flag: 'wx' });
}, 360000);
`,
  );
  const result = cp.spawnSync(
    process.execPath,
    [
      '--max-old-space-size=4096',
      path.join(root, 'node_modules/jest/bin/jest.js'),
      '--config',
      config,
      '--runInBand',
      '--runTestsByPath',
      spec,
    ],
    {
      cwd: root,
      env: process.env,
      stdio: 'inherit',
      windowsHide: true,
      timeout: 480000,
    },
  );
  if (result.status !== 0) {
    process.exitCode = result.status || 1;
  } else {
    const evidence = JSON.parse(fs.readFileSync(output, 'utf8'));
    const requiredWorkloads = [
      'PERF-G-AUTHOR-200',
      'PERF-G-STUDENT-LIST',
      'PERF-G-STUDENT-DETAIL-200',
      'PERF-G-GROUP-DISPLAY-20',
      'PERF-G-QUESTION-ASSET-METADATA',
      'PERF-G-TEACHER-QUEUE',
      'PERF-G-TEACHER-PAGINATION',
      'PERF-G-TEACHER-DETAIL-200',
      'PERF-G-OBJECTIVE-EVALUATION',
      'PERF-G-CONCURRENT-MANUAL-REVIEW',
      'PERF-G-PARENT-RELEASED-200',
      'PERF-G-PRIVATE-BYTES',
      'PERF-G-EXPLICIT-SYNC',
      'PERF-G-ANSWER-ASSET-METADATA',
      'PERF-H-GROUPED-ELEVEN-TYPE-DETAIL',
    ];
    assert.deepEqual(
      evidence.workloads.map((row) => row.workload_id).sort(),
      requiredWorkloads.sort(),
    );
    assert.ok(
      evidence.workloads.every(
        (row) => row.sample_count === 20 && row.error_count === 0,
      ),
    );
    console.log(
      JSON.stringify({
        performanceMeasured: true,
        workloads: evidence.workloads.length,
        sourceSha: evidence.source_sha,
        helperSha256: identity.measurement_helper_sha256,
        slo: evidence.performance_slo_certification,
        outputSha256: hash(fs.readFileSync(output)),
      }),
    );
  }
} finally {
  const resolved = path.resolve(temporary);
  const ownedPrefix = path.join(
    path.resolve(os.tmpdir()),
    'moazez-st13-performance-',
  );
  assert.ok(resolved.startsWith(ownedPrefix));
  assert.equal(
    fs.realpathSync(resolved),
    resolved,
    'Do not remove a replaced temporary directory',
  );
  fs.rmSync(resolved, { recursive: true, force: true });
  assert.equal(fs.existsSync(resolved), false);
  console.log('ST13_OWNED_TEMPORARY_CLEANUP=PASS');
}
