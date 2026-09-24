'use strict';

const { createHash, randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const https = require('node:https');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { setTimeout: delay } = require('node:timers/promises');
const {
  BINARY_SHA256,
  IMAGE,
  LABELS,
  RELEASE_URL,
  validateImageInspect,
} = require('./minio-fixture.contract.cjs');

const MAX_BINARY_BYTES = 128 * 1024 * 1024;
const MIN_SAVED_IMAGE_BYTES = 1024 * 1024;
const MAX_SAVED_IMAGE_BYTES = 256 * 1024 * 1024;
const EXPECTED_BINARY_BYTES = 110989496;
const DOCKER_TIMEOUT_MS = 3 * 60_000;

function docker(args, timeout = DOCKER_TIMEOUT_MS) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    timeout,
    maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `MinIO fixture Docker command failed: ${args[0]} ${args[1] ?? ''}`,
    );
  }
  return result.stdout.trim();
}

function inspectFixture() {
  let raw;
  try {
    raw = docker(['image', 'inspect', IMAGE, '--format', '{{json .}}']);
  } catch {
    throw new Error('MinIO fixture image is absent locally');
  }
  let inspect;
  try {
    inspect = JSON.parse(raw);
  } catch {
    throw new Error('MinIO fixture inspect response is invalid');
  }
  return validateImageInspect(inspect);
}

function allowedReleaseUrl(url, redirect) {
  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    return false;
  }
  if (!redirect) return url.href === RELEASE_URL;
  return (
    url.hostname === 'release-assets.githubusercontent.com' &&
    /^\/github-production-release-asset(?:-2e65be)?\/29261473\//u.test(
      url.pathname,
    )
  );
}

async function downloadVerifiedBinary(target) {
  const signal = AbortSignal.timeout(15 * 60_000);
  const digest = createHash('sha256');
  let count = 0;
  let nextProgress = 32 * 1024 * 1024;
  let current = new URL(RELEASE_URL);
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    if (!allowedReleaseUrl(current, redirects > 0)) {
      throw new Error('MinIO release download redirect target is not approved');
    }
    const response = await new Promise((resolve, reject) => {
      const request = https.get(current, { timeout: 60_000, signal }, resolve);
      request.on('timeout', () =>
        request.destroy(new Error('MinIO release download timed out')),
      );
      request.on('error', reject);
    });
    if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
      const location = response.headers.location;
      response.resume();
      if (!location || redirects === 3) {
        throw new Error('MinIO release download redirect limit exceeded');
      }
      current = new URL(location, current);
      continue;
    }
    if (response.statusCode !== 200) {
      response.resume();
      throw new Error(
        `MinIO release download failed with HTTP ${response.statusCode}`,
      );
    }
    response.setTimeout(30_000, () =>
      response.destroy(new Error('MinIO release binary transfer stalled')),
    );
    const declared = Number(response.headers['content-length']);
    if (declared !== EXPECTED_BINARY_BYTES || declared > MAX_BINARY_BYTES) {
      response.destroy();
      throw new Error('MinIO release binary declared size is invalid');
    }
    process.stdout.write(`MINIO_RELEASE_DOWNLOAD=START bytes=${declared}\n`);
    const hasher = new Transform({
      transform(chunk, _encoding, callback) {
        count += chunk.length;
        if (count > MAX_BINARY_BYTES) {
          callback(new Error('MinIO release binary exceeds the size limit'));
          return;
        }
        digest.update(chunk);
        if (count >= nextProgress) {
          process.stdout.write(`MINIO_RELEASE_DOWNLOAD_PROGRESS=${count}\n`);
          nextProgress += 32 * 1024 * 1024;
        }
        callback(null, chunk);
      },
    });
    await pipeline(
      response,
      hasher,
      fs.createWriteStream(target, { flags: 'wx' }),
    );
    if (
      count !== EXPECTED_BINARY_BYTES ||
      digest.digest('hex') !== BINARY_SHA256
    ) {
      throw new Error('MinIO release binary size or SHA256 mismatch');
    }
    return;
  }
  throw new Error('MinIO release download redirect limit exceeded');
}

function smokeRequest(port) {
  return new Promise((resolve) => {
    const request = http.get(
      `http://127.0.0.1:${port}/minio/health/ready`,
      { timeout: 1000 },
      (response) => {
        response.resume();
        resolve(response.statusCode === 200);
      },
    );
    request.on('timeout', () => request.destroy());
    request.on('error', () => resolve(false));
  });
}

async function smokeFixture(imageId) {
  const name = `moazez-ci-minio-smoke-${randomUUID().replaceAll('-', '')}`;
  let started = false;
  try {
    docker([
      'run',
      '--detach',
      '--pull',
      'never',
      '--rm',
      '--name',
      name,
      '--publish',
      '127.0.0.1::9000',
      '--tmpfs',
      '/data:rw,noexec,nosuid,size=134217728',
      '--env',
      'MINIO_ROOT_USER=ci-smoke-access',
      '--env',
      'MINIO_ROOT_PASSWORD=ci-smoke-secret-12345',
      imageId,
      'server',
      '/data',
      '--console-address',
      ':9001',
    ]);
    started = true;
    const portLine = docker(['port', name, '9000/tcp']);
    const match = portLine.match(
      /(?:127\.0\.0\.1|0\.0\.0\.0|\[::\]):([0-9]+)$/u,
    );
    if (!match) throw new Error('MinIO smoke port mapping is invalid');
    const port = Number(match[1]);
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (await smokeRequest(port)) return;
      await delay(1000);
    }
    throw new Error('MinIO smoke readiness did not become healthy');
  } finally {
    if (started) docker(['rm', '--force', name]);
  }
}

function parseArgs(args) {
  if (args.length === 1 && args[0] === '--verify-only')
    return { verifyOnly: true };
  if (args.length === 0) return {};
  if (args.length === 2 && args[0] === '--output' && args[1]) {
    return { output: path.resolve(args[1]) };
  }
  throw new Error(
    'Usage: build-minio-fixture.cjs [--output <new-tar-path> | --verify-only]',
  );
}

function assertSavedImageSize(bytes) {
  if (
    !Number.isSafeInteger(bytes) ||
    bytes < MIN_SAVED_IMAGE_BYTES ||
    bytes > MAX_SAVED_IMAGE_BYTES
  ) {
    throw new Error('MinIO fixture saved artifact size is out of bounds');
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.verifyOnly) {
    const imageId = inspectFixture();
    process.stdout.write(
      `MINIO_FIXTURE_PROVENANCE=PASS image=${IMAGE} id=${imageId}\n`,
    );
    return;
  }
  if (options.output && fs.existsSync(options.output)) {
    throw new Error('MinIO fixture output already exists');
  }
  const tempRoot = fs.realpathSync(os.tmpdir());
  const context = fs.mkdtempSync(path.join(tempRoot, 'moazez-minio-fixture-'));
  try {
    await downloadVerifiedBinary(path.join(context, 'minio'));
    process.stdout.write('MINIO_BINARY_SHA256=PASS\n');
    const dockerfile = [
      'FROM scratch',
      ...Object.entries(LABELS).map(
        ([key, value]) => `LABEL ${key}=${JSON.stringify(value)}`,
      ),
      'COPY --chmod=0755 minio /minio',
      'ENTRYPOINT ["/minio"]',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(context, 'Dockerfile'), dockerfile, {
      flag: 'wx',
    });
    docker(
      ['build', '--pull=false', '--network=none', '--tag', IMAGE, context],
      10 * 60_000,
    );
    const imageId = inspectFixture();
    process.stdout.write(
      `MINIO_SCRATCH_BUILD=PASS image=${IMAGE} id=${imageId}\n`,
    );
    await smokeFixture(imageId);
    process.stdout.write('MINIO_SMOKE=PASS\n');
    if (options.output) {
      fs.mkdirSync(path.dirname(options.output), { recursive: true });
      docker(['save', '--output', options.output, IMAGE], 10 * 60_000);
      assertSavedImageSize(fs.statSync(options.output).size);
      process.stdout.write(`MINIO_IMAGE_SAVE=PASS path=${options.output}\n`);
    }
  } finally {
    const resolved = path.resolve(context);
    if (
      path.dirname(resolved) !== tempRoot ||
      !path.basename(resolved).startsWith('moazez-minio-fixture-')
    ) {
      throw new Error(
        'MinIO fixture temporary context cleanup boundary failed',
      );
    }
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  allowedReleaseUrl,
  assertSavedImageSize,
  downloadVerifiedBinary,
  inspectFixture,
  parseArgs,
};
