'use strict';

const RELEASE = 'RELEASE.2025-09-07T16-13-09Z';
const UPSTREAM_COMMIT = '07c3a429bfed433e49018cb0f78a52145d4bedeb';
const BINARY_SHA256 =
  '7c5bd8512c6e966455b1d198209358b2d191c77a83ab377c4073281065fb855f';
const BINARY_NAME = `minio.linux-amd64.${RELEASE}`;
const RELEASE_URL = `https://github.com/minio/minio/releases/download/${RELEASE}/${BINARY_NAME}`;
const IMAGE = `moazez-ci/minio:${RELEASE}`;
const LABELS = Object.freeze({
  'org.opencontainers.image.source': 'https://github.com/minio/minio',
  'org.opencontainers.image.version': RELEASE,
  'org.opencontainers.image.revision': UPSTREAM_COMMIT,
  'com.moazez.ci.minio.upstream': 'minio/minio',
  'com.moazez.ci.minio.binary.sha256': BINARY_SHA256,
});

function validateImageInspect(inspect) {
  if (!inspect || !/^sha256:[a-f0-9]{64}$/u.test(inspect.Id ?? '')) {
    throw new Error('MinIO fixture image identity is invalid');
  }
  if (inspect.Os !== 'linux' || inspect.Architecture !== 'amd64') {
    throw new Error('MinIO fixture platform is invalid');
  }
  const config = inspect.Config ?? {};
  if (JSON.stringify(config.Entrypoint) !== JSON.stringify(['/minio'])) {
    throw new Error('MinIO fixture entrypoint is invalid');
  }
  for (const [key, value] of Object.entries(LABELS)) {
    if (config.Labels?.[key] !== value) {
      throw new Error(`MinIO fixture provenance label mismatch: ${key}`);
    }
  }
  return inspect.Id;
}

module.exports = {
  BINARY_NAME,
  BINARY_SHA256,
  IMAGE,
  LABELS,
  RELEASE,
  RELEASE_URL,
  UPSTREAM_COMMIT,
  validateImageInspect,
};
