'use strict';

const { spawn } = require('node:child_process');
const { access } = require('node:fs/promises');
const { constants } = require('node:fs');

const MEDIA_RUNTIME_CONTRACT = Object.freeze({
  executablePath: '/usr/bin/ffprobe',
  expectedFirstVersionLine:
    'ffprobe version 5.1.9-0+deb12u1 Copyright (c) 2007-2026 the FFmpeg developers',
  verificationVersion: 'ffprobe-5.1.9-debian12-learning-media-v1',
  timeoutMs: 15_000,
  maximumStdoutBytes: 786_432,
  maximumStderrBytes: 262_144,
  maximumTotalOutputBytes: 1_048_576,
  protocolWhitelist: 'file,pipe,fd',
});

function runBounded(executable, args, options = {}) {
  const timeoutMs = options.timeoutMs ?? MEDIA_RUNTIME_CONTRACT.timeoutMs;
  const maximumStdoutBytes =
    options.maximumStdoutBytes ?? MEDIA_RUNTIME_CONTRACT.maximumStdoutBytes;
  const maximumStderrBytes =
    options.maximumStderrBytes ?? MEDIA_RUNTIME_CONTRACT.maximumStderrBytes;
  const maximumTotalOutputBytes =
    options.maximumTotalOutputBytes ??
    MEDIA_RUNTIME_CONTRACT.maximumTotalOutputBytes;

  return new Promise((resolve) => {
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let reason = null;
    let settled = false;
    let timer;
    const child = spawn(executable, args, {
      shell: false,
      cwd: options.cwd ?? '/',
      env: options.env ?? { PATH: '/usr/bin:/bin' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };
    const overflow = () => {
      reason = 'output_limit_exceeded';
      child.kill('SIGKILL');
    };
    child.stdout.on('data', (chunk) => {
      if (
        stdout.byteLength + chunk.byteLength > maximumStdoutBytes ||
        stdout.byteLength + stderr.byteLength + chunk.byteLength >
          maximumTotalOutputBytes
      ) {
        overflow();
        return;
      }
      stdout = Buffer.concat([stdout, chunk]);
    });
    child.stderr.on('data', (chunk) => {
      if (
        stderr.byteLength + chunk.byteLength > maximumStderrBytes ||
        stdout.byteLength + stderr.byteLength + chunk.byteLength >
          maximumTotalOutputBytes
      ) {
        overflow();
        return;
      }
      stderr = Buffer.concat([stderr, chunk]);
    });
    child.on('error', () =>
      finish({ ok: false, reason: 'binary_unavailable' }),
    );
    child.on('close', (code, signal) =>
      finish({
        ok: code === 0 && reason === null,
        reason: reason ?? (code === 0 ? null : 'probe_failed'),
        code,
        signal,
        stdout,
        stderr,
      }),
    );
    timer = setTimeout(() => {
      reason = 'timeout';
      child.kill('SIGKILL');
    }, timeoutMs);
  });
}

async function verifyRuntimeIdentity(input) {
  if (
    input.executablePath !== MEDIA_RUNTIME_CONTRACT.executablePath ||
    input.verificationVersion !== MEDIA_RUNTIME_CONTRACT.verificationVersion ||
    input.timeoutMs !== MEDIA_RUNTIME_CONTRACT.timeoutMs ||
    input.maximumTotalOutputBytes !==
      MEDIA_RUNTIME_CONTRACT.maximumTotalOutputBytes
  ) {
    throw new Error('version_mismatch');
  }
  try {
    await access(input.executablePath, constants.X_OK);
  } catch {
    throw new Error('binary_unavailable');
  }
  const result = await runBounded(input.executablePath, ['-version'], input);
  const firstLine = result.stdout?.toString('utf8').split(/\r?\n/u, 1)[0] ?? '';
  if (
    !result.ok ||
    firstLine !== MEDIA_RUNTIME_CONTRACT.expectedFirstVersionLine
  ) {
    throw new Error('version_mismatch');
  }
  return { firstLine, verificationVersion: input.verificationVersion };
}

module.exports = {
  MEDIA_RUNTIME_CONTRACT,
  runBounded,
  verifyRuntimeIdentity,
};
