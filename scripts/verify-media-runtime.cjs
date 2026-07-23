'use strict';

const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const {
  MEDIA_RUNTIME_CONTRACT,
  runBounded,
  verifyRuntimeIdentity,
} = require('./media-runtime-contract.cjs');

async function verifyRuntime() {
  const ffprobePath =
    process.env.FFPROBE_PATH ?? MEDIA_RUNTIME_CONTRACT.executablePath;
  const timeoutMs = Number(
    process.env.FFPROBE_TIMEOUT_MS ?? MEDIA_RUNTIME_CONTRACT.timeoutMs,
  );
  const maxOutputBytes = Number(
    process.env.FFPROBE_MAX_OUTPUT_BYTES ??
      MEDIA_RUNTIME_CONTRACT.maximumTotalOutputBytes,
  );
  const verificationVersion =
    process.env.MEDIA_VERIFICATION_VERSION ??
    MEDIA_RUNTIME_CONTRACT.verificationVersion;
  const identity = await verifyRuntimeIdentity({
    executablePath: ffprobePath,
    verificationVersion,
    timeoutMs,
    maximumTotalOutputBytes: maxOutputBytes,
  });

  const timeout = await runBounded(
    process.execPath,
    ['-e', 'setInterval(()=>{},1000)'],
    {
      timeoutMs: 25,
      maximumStdoutBytes: 1024,
      maximumStderrBytes: 1024,
      maximumTotalOutputBytes: 1024,
    },
  );
  if (timeout.reason !== 'timeout') throw new Error('timeout_contract_failed');

  const overflow = await runBounded(
    process.execPath,
    ['-e', "process.stdout.write('x'.repeat(2048))"],
    {
      timeoutMs: 1000,
      maximumStdoutBytes: 1024,
      maximumStderrBytes: 1024,
      maximumTotalOutputBytes: 1024,
    },
  );
  if (overflow.reason !== 'output_limit_exceeded') {
    throw new Error('output_limit_contract_failed');
  }

  const network = await runBounded(
    ffprobePath,
    [
      '-v',
      'error',
      '-protocol_whitelist',
      'file,pipe,fd',
      '-i',
      'http://127.0.0.1:9/network-must-not-open',
      '-show_format',
      '-of',
      'json',
    ],
    { timeoutMs, maximumTotalOutputBytes: maxOutputBytes },
  );
  if (
    network.ok ||
    !network.stderr.toString('utf8').includes('not on whitelist')
  ) {
    throw new Error('network_protocol_forbidden');
  }

  const mediaSmoke = await verifyTinyMedia(
    ffprobePath,
    timeoutMs,
    maxOutputBytes,
  );

  return {
    ok: true,
    version: identity.firstLine,
    verificationVersion: identity.verificationVersion,
    timeout: 'timeout',
    outputLimit: 'output_limit_exceeded',
    network: 'network_protocol_forbidden',
    mediaSmoke,
  };
}

async function verifyTinyMedia(ffprobePath, timeoutMs, maxOutputBytes) {
  const directory = await mkdtemp(join(tmpdir(), 'moazez-runtime-media-'));
  try {
    const cases = [
      {
        name: 'mp4',
        path: join(directory, 'tiny.mp4'),
        args: [
          '-f',
          'lavfi',
          '-i',
          'color=c=black:s=320x180:d=0.2',
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
        ],
        codec: 'h264',
      },
      {
        name: 'webm',
        path: join(directory, 'tiny.webm'),
        args: [
          '-f',
          'lavfi',
          '-i',
          'color=c=black:s=320x180:d=0.2',
          '-c:v',
          'libvpx',
          '-pix_fmt',
          'yuv420p',
        ],
        codec: 'vp8',
      },
    ];
    const observed = [];
    for (const media of cases) {
      const generated = await runBounded(
        '/usr/bin/ffmpeg',
        ['-hide_banner', '-loglevel', 'error', '-y', ...media.args, media.path],
        { timeoutMs, maximumTotalOutputBytes: maxOutputBytes },
      );
      if (!generated.ok) throw new Error('media_generation_failed');
      const probed = await runBounded(
        ffprobePath,
        [
          '-v',
          'error',
          '-protocol_whitelist',
          'file,pipe,fd',
          '-show_streams',
          '-show_format',
          '-of',
          'json',
          media.path,
        ],
        { timeoutMs, maximumTotalOutputBytes: maxOutputBytes },
      );
      if (!probed.ok) throw new Error('media_probe_failed');
      let parsed;
      try {
        parsed = JSON.parse(probed.stdout.toString('utf8'));
      } catch {
        throw new Error('invalid_probe_output');
      }
      if (
        !parsed.streams?.some((stream) => stream.codec_name === media.codec)
      ) {
        throw new Error('media_codec_mismatch');
      }
      observed.push(media.name);
    }
    return observed.join(',');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

module.exports = { runBounded, verifyRuntime, verifyTinyMedia };

if (require.main === module) {
  verifyRuntime()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : 'verification_failed'}\n`,
      );
      process.exitCode = 1;
    });
}
