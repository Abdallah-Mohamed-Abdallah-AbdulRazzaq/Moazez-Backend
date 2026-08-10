'use strict';

require('ts-node/register/transpile-only');

const fs = require('node:fs/promises');
const path = require('node:path');
const { Readable } = require('node:stream');
const { ConfigService } = require('@nestjs/config');
const { GoogleAuth } = require('google-auth-library');
const {
  assertEvidenceSafe,
  executeGuardedObjectProof,
  safeFailureCode,
  summarizeSignedUrl,
} = require('./gcs-batch2-proof-policy.cjs');

const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..');
const SYNTHETIC_CONTENT_TYPE = 'application/octet-stream';

async function main() {
  if (process.argv.includes('--help')) {
    process.stdout.write(
      'Usage: node scripts/storage/gcs-batch2-proof.cjs --environment nonprod --runtime-role api|core-worker|media-worker [--run-id ID]\n',
    );
    return;
  }

  await executeGuardedObjectProof({
    args: process.argv.slice(2),
    env: process.env,
    repositoryRoot: REPOSITORY_ROOT,
    resolveRuntimeIdentity: resolveActiveAdcIdentity,
    createProvider: createActualGcsAdapter,
    execute: runProof,
  });
}

async function resolveActiveAdcIdentity() {
  try {
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    return await auth.getCredentials();
  } catch {
    throw new Error('runtime_adc_identity_unavailable');
  }
}

function createActualGcsAdapter(configuration) {
  const {
    GcsAdapter,
  } = require('../../src/infrastructure/storage/gcs.adapter');
  const config = new ConfigService({
    GCP_PROJECT_ID: configuration.projectId,
    GCS_SIGNING_SERVICE_ACCOUNT:
      configuration.runtimeRole === 'api'
        ? configuration.signerServiceAccount
        : undefined,
  });
  return new GcsAdapter(config);
}

async function runProof(configuration, adapter) {
  const startedAt = new Date();
  const objectKeys = [
    `${configuration.prefix}buffer.bin`,
    `${configuration.prefix}stream.bin`,
    `${configuration.prefix}page.bin`,
  ];
  const evidence = {
    schemaVersion: 1,
    proof: 'PRD5A-G03_NONPROD_GCS_OBJECT_CONTRACT',
    status: 'IN_PROGRESS',
    timestamp: startedAt.toISOString(),
    environment: configuration.environmentName,
    project: configuration.projectId,
    bucket: configuration.privateBucket,
    bucketClassification: 'private',
    runtimeRole: configuration.runtimeRole,
    runtimeServiceAccount: configuration.runtimeServiceAccount,
    testPrefix: configuration.prefix,
    operations: [],
    cleanup: [],
  };
  let proofError = null;

  try {
    await assertAvailable(adapter, configuration, evidence);
    const firstBytes = Buffer.from('moazez-batch2-buffer-proof-v1', 'utf8');
    const secondBytes = Buffer.from('moazez-batch2-stream-proof-v1', 'utf8');
    const pageBytes = Buffer.from('moazez-batch2-page-proof-v1', 'utf8');

    const firstPut = await adapter.putObject({
      bucket: configuration.privateBucket,
      objectKey: objectKeys[0],
      body: firstBytes,
      contentType: SYNTHETIC_CONTENT_TYPE,
      metadata: { proof: 'phase5a', runtime: configuration.runtimeRole },
    });
    requireGeneration(firstPut.generation);
    evidence.operations.push(
      operation('put_buffer', {
        generation: firstPut.generation,
        size: firstBytes.byteLength,
      }),
    );

    const streamPut = await adapter.putObject({
      bucket: configuration.privateBucket,
      objectKey: objectKeys[1],
      body: Readable.from([
        secondBytes.subarray(0, 7),
        secondBytes.subarray(7),
      ]),
      sizeBytes: secondBytes.byteLength,
      contentType: SYNTHETIC_CONTENT_TYPE,
      metadata: { proof: 'phase5a-stream' },
    });
    requireGeneration(streamPut.generation);
    evidence.operations.push(
      operation('put_readable', {
        generation: streamPut.generation,
        size: secondBytes.byteLength,
      }),
    );

    await adapter.putObject({
      bucket: configuration.privateBucket,
      objectKey: objectKeys[2],
      body: pageBytes,
      contentType: SYNTHETIC_CONTENT_TYPE,
    });

    const stat = await adapter.statObject({
      bucket: configuration.privateBucket,
      objectKey: objectKeys[0],
    });
    assertEqual(stat.size, firstBytes.byteLength, 'stat_size_mismatch');
    assertEqual(
      stat.contentType,
      SYNTHETIC_CONTENT_TYPE,
      'stat_content_type_mismatch',
    );
    assertEqual(stat.metadata.proof, 'phase5a', 'stat_metadata_mismatch');
    requireGeneration(stat.generation);
    evidence.operations.push(
      operation('stat_normalized', {
        contentType: stat.contentType,
        generation: stat.generation,
        metadata: { proof: stat.metadata.proof },
        size: stat.size,
      }),
    );

    const downloaded = await readAll(
      await adapter.getObject({
        bucket: configuration.privateBucket,
        objectKey: objectKeys[0],
      }),
    );
    assertBytes(downloaded, firstBytes, 'stream_integrity_mismatch');
    assertEqual(
      await adapter.objectExists({
        bucket: configuration.privateBucket,
        objectKey: objectKeys[0],
      }),
      true,
      'object_exists_false',
    );
    evidence.operations.push(
      operation('get_stream_integrity', {
        size: downloaded.byteLength,
      }),
    );

    const firstPage = await adapter.listObjectsPage({
      bucket: configuration.privateBucket,
      prefix: configuration.prefix,
      limit: 2,
    });
    if (!firstPage.nextCursor) throw new Error('opaque_cursor_missing');
    const secondPage = await adapter.listObjectsPage({
      bucket: configuration.privateBucket,
      prefix: configuration.prefix,
      cursor: firstPage.nextCursor,
      limit: 2,
    });
    const listed = [...firstPage.objects, ...secondPage.objects];
    if (listed.length < 3) throw new Error('pagination_second_page_missing');
    evidence.operations.push(
      operation('paginated_list', {
        firstPageCount: firstPage.objects.length,
        opaqueCursorUsed: true,
        secondPageCount: secondPage.objects.length,
      }),
    );

    const replacement = Buffer.from('moazez-batch2-buffer-proof-v2', 'utf8');
    const overwritten = await adapter.putObject({
      bucket: configuration.privateBucket,
      objectKey: objectKeys[0],
      body: replacement,
      contentType: SYNTHETIC_CONTENT_TYPE,
      metadata: { proof: 'phase5a-overwrite' },
    });
    requireGeneration(overwritten.generation);
    if (overwritten.generation === firstPut.generation) {
      throw new Error('generation_did_not_change');
    }
    evidence.operations.push(
      operation('generation_overwrite', {
        before: firstPut.generation,
        after: overwritten.generation,
        changed: true,
      }),
    );

    if (configuration.runtimeRole === 'api') {
      await runSignedAndCorsProof(
        configuration,
        adapter,
        objectKeys,
        replacement,
        evidence,
      );
    }

    await deleteAndProveAbsence(
      adapter,
      configuration,
      objectKeys[0],
      evidence,
    );
    objectKeys.shift();
    evidence.status = 'PASS';
  } catch (error) {
    proofError = error;
    evidence.status = 'FAIL';
    evidence.failureCode = safeFailureCode(error);
    throw error;
  } finally {
    let cleanupFailed = false;
    for (const objectKey of objectKeys) {
      try {
        await adapter.deleteObject({
          bucket: configuration.privateBucket,
          objectKey,
        });
        evidence.cleanup.push({ objectKey, liveObjectRemoved: true });
      } catch (error) {
        cleanupFailed = true;
        evidence.cleanup.push({
          objectKey,
          liveObjectRemoved: false,
          failureCode: safeFailureCode(error),
        });
      }
    }
    if (cleanupFailed && !proofError) {
      evidence.status = 'FAIL';
      evidence.failureCode = 'proof_live_cleanup_failed';
    }
    evidence.completedAt = new Date().toISOString();
    evidence.noncurrentAndSoftDeletedHistoryMayRemain = true;
    await writeEvidence(configuration, evidence);
    if (cleanupFailed && !proofError) {
      throw new Error('proof_live_cleanup_failed');
    }
  }
}

async function assertAvailable(adapter, configuration, evidence) {
  await requireBucketAvailable(
    adapter,
    configuration.privateBucket,
    'readiness_private',
    evidence,
  );
  await requireBucketAvailable(
    adapter,
    configuration.publishedBucket,
    'readiness_published',
    evidence,
  );
  evidence.operations.push(
    operation('readiness', {
      privateBucket: true,
      publishedBucket: true,
    }),
  );
}

async function requireBucketAvailable(adapter, bucket, failureStage, evidence) {
  try {
    const available = await adapter.isBucketAvailable(bucket);
    if (!available) throw new Error('readiness_bucket_unavailable');
  } catch (error) {
    evidence.failureStage = failureStage;
    evidence.failureCode = safeFailureCode(error);
    throw error;
  }
}

async function executeProofStage(evidence, failureStage, execute) {
  try {
    return await execute();
  } catch (error) {
    evidence.failureStage = failureStage;
    evidence.failureCode = safeFailureCode(error);
    throw error;
  }
}

async function runSignedAndCorsProof(
  configuration,
  adapter,
  objectKeys,
  downloadBytes,
  evidence,
) {
  const signedPutKey = `${configuration.prefix}signed-put.bin`;
  objectKeys.push(signedPutKey);
  const signedPutBytes = Buffer.from('moazez-batch2-signed-put-proof', 'utf8');
  const { putCapability, putSummary } = await executeProofStage(
    evidence,
    'signed_put_create',
    async () => {
      const capability = await adapter.createSignedPutUrl({
        bucket: configuration.privateBucket,
        objectKey: signedPutKey,
        expiresInSeconds: 3600,
      });
      assertCapabilityTtl(capability.expiresAt, 3600);
      const summary = summarizeSignedUrl(capability.url);
      assertEqual(
        summary.signerPrincipal,
        configuration.signerServiceAccount,
        'signed_put_principal_mismatch',
      );
      return { putCapability: capability, putSummary: summary };
    },
  );

  const signedPutStat = await executeProofStage(
    evidence,
    'signed_put_request',
    async () => {
      const putResponse = await fetch(putCapability.url, {
        method: 'PUT',
        headers: {
          'Content-Type': SYNTHETIC_CONTENT_TYPE,
          Origin: configuration.origins[0],
        },
        body: signedPutBytes,
      });
      assertEqual(putResponse.status, 200, 'signed_put_http_status_invalid');
      const stat = await adapter.statObject({
        bucket: configuration.privateBucket,
        objectKey: signedPutKey,
      });
      assertEqual(
        stat.size,
        signedPutBytes.byteLength,
        'signed_put_size_mismatch',
      );
      return stat;
    },
  );
  evidence.operations.push(
    operation('signed_put', {
      action: 'write',
      bucketClassification: 'private',
      contentType: signedPutStat.contentType,
      signerPrincipal: putSummary.signerPrincipal,
      ttlSeconds: 3600,
    }),
  );
  await proveAnonymousAccess(configuration, signedPutKey, evidence);

  const { getCapability, getSummary } = await executeProofStage(
    evidence,
    'signed_get_create',
    async () => {
      const capability = await adapter.createSignedGetUrl({
        bucket: configuration.privateBucket,
        objectKey: objectKeys[0],
        expiresInSeconds: 300,
        overrides: {
          contentType: SYNTHETIC_CONTENT_TYPE,
          contentDisposition: 'attachment; filename="phase5a-proof.bin"',
        },
      });
      assertCapabilityTtl(capability.expiresAt, 300);
      const summary = summarizeSignedUrl(capability.url);
      assertEqual(
        summary.signerPrincipal,
        configuration.signerServiceAccount,
        'signed_get_principal_mismatch',
      );
      return { getCapability: capability, getSummary: summary };
    },
  );
  const { fullResponse, fullCorsExposure } = await executeProofStage(
    evidence,
    'signed_get_request',
    async () => {
      const response = await fetch(getCapability.url, {
        headers: { Origin: configuration.origins[0] },
      });
      assertEqual(response.status, 200, 'signed_get_http_status_invalid');
      assertBytes(
        Buffer.from(await response.arrayBuffer()),
        downloadBytes,
        'signed_get_integrity_mismatch',
      );
      assertHeaderStartsWith(
        response,
        'content-type',
        SYNTHETIC_CONTENT_TYPE,
        'signed_get_content_type_invalid',
      );
      assertHeaderStartsWith(
        response,
        'content-disposition',
        'attachment;',
        'signed_get_content_disposition_invalid',
      );
      const corsExposure = assertActualCorsResponse(
        response,
        configuration.origins[0],
        ['Content-Type', 'Content-Disposition', 'ETag'],
        'signed_get_cors',
      );
      return { fullResponse: response, fullCorsExposure: corsExposure };
    },
  );

  const { rangeResponse, rangeCorsExposure } = await executeProofStage(
    evidence,
    'signed_get_range',
    async () => {
      const response = await fetch(getCapability.url, {
        headers: {
          Origin: configuration.origins[0],
          Range: 'bytes=0-3',
        },
      });
      assertEqual(response.status, 206, 'signed_get_range_status_invalid');
      assertHeaderStartsWith(
        response,
        'content-range',
        'bytes 0-3/',
        'signed_get_content_range_missing',
      );
      assertBytes(
        Buffer.from(await response.arrayBuffer()),
        downloadBytes.subarray(0, 4),
        'signed_get_range_integrity_mismatch',
      );
      const corsExposure = assertActualCorsResponse(
        response,
        configuration.origins[0],
        ['Content-Type', 'Content-Disposition', 'Content-Range', 'ETag'],
        'signed_get_range_cors',
      );
      return { rangeResponse: response, rangeCorsExposure: corsExposure };
    },
  );
  evidence.operations.push(
    operation('signed_get_and_range', {
      action: 'read',
      bucketClassification: 'private',
      fullStatus: fullResponse.status,
      rangeStatus: rangeResponse.status,
      signerPrincipal: getSummary.signerPrincipal,
      ttlSeconds: 300,
      corsResponseExposure: {
        fullGet: fullCorsExposure,
        range: rangeCorsExposure,
      },
    }),
  );

  await proveCors(
    configuration,
    putCapability.url,
    getCapability.url,
    evidence,
  );
}

async function proveCors(configuration, putUrl, getUrl, evidence) {
  const observations = await executeProofStage(
    evidence,
    'cors_positive',
    async () => {
      const results = [];
      for (const origin of configuration.origins) {
        results.push(
          await assertPreflight(putUrl, origin, 'PUT', ['Content-Type']),
          await assertPreflight(getUrl, origin, 'GET', ['Range']),
        );
      }
      return results;
    },
  );
  const negative = await executeProofStage(
    evidence,
    'cors_negative',
    async () => {
      const response = await preflight(
        putUrl,
        'https://invalid.example',
        'PUT',
        ['Content-Type'],
      );
      if (response.headers.get('access-control-allow-origin')) {
        throw new Error('cors_negative_origin_allowed');
      }
      return response;
    },
  );
  evidence.operations.push(
    operation('cors', {
      allowedOrigins: [...configuration.origins],
      methods: ['GET', 'PUT'],
      negativeOriginAllowed: false,
      negativeStatus: negative.status,
      observations,
    }),
  );
}

async function assertPreflight(url, origin, method, requestedHeaders) {
  const response = await preflight(url, origin, method, requestedHeaders);
  const allowOrigin = response.headers.get('access-control-allow-origin');
  const allowMethods = response.headers.get('access-control-allow-methods');
  const allowHeaders = response.headers.get('access-control-allow-headers');
  const maxAge = response.headers.get('access-control-max-age');
  assertEqual(allowOrigin, origin, 'cors_allow_origin_invalid');
  assertHeaderListContains(
    response,
    'access-control-allow-methods',
    [method],
    'cors_allow_methods_invalid',
  );
  assertHeaderListContains(
    response,
    'access-control-allow-headers',
    requestedHeaders,
    'cors_allow_headers_invalid',
  );
  assertEqual(maxAge, '3600', 'cors_max_age_invalid');
  return {
    origin,
    requestMethod: method,
    status: response.status,
    accessControlAllowOrigin: allowOrigin,
    accessControlAllowMethods: allowMethods,
    accessControlAllowHeaders: allowHeaders,
    accessControlMaxAge: maxAge,
  };
}

function preflight(url, origin, method, requestedHeaders) {
  return fetch(url, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': method,
      'Access-Control-Request-Headers': requestedHeaders.join(', '),
    },
  });
}

async function proveAnonymousAccess(configuration, objectKey, evidence) {
  const objectPath = objectKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const unsignedUrl = `https://storage.googleapis.com/${encodeURIComponent(configuration.privateBucket)}/${objectPath}`;
  const response = await fetch(unsignedUrl, { redirect: 'manual' });
  if (response.status === 200 || response.status === 206) {
    throw new Error('anonymous_object_access_allowed');
  }
  await response.body?.cancel();
  evidence.operations.push(
    operation('anonymous_access_denied', {
      bucketClassification: 'private',
      httpStatus: response.status,
      unsignedReadAllowed: false,
    }),
  );
}

async function deleteAndProveAbsence(
  adapter,
  configuration,
  objectKey,
  evidence,
) {
  await adapter.deleteObject({
    bucket: configuration.privateBucket,
    objectKey,
  });
  assertEqual(
    await adapter.objectExists({
      bucket: configuration.privateBucket,
      objectKey,
    }),
    false,
    'post_delete_exists',
  );
  try {
    await adapter.statObject({
      bucket: configuration.privateBucket,
      objectKey,
    });
    throw new Error('post_delete_stat_succeeded');
  } catch (error) {
    if (!error || typeof error !== 'object' || error.kind !== 'not_found') {
      throw error;
    }
  }
  evidence.operations.push(
    operation('delete_and_not_found', {
      exists: false,
      normalizedKind: 'not_found',
    }),
  );
}

async function writeEvidence(configuration, evidence) {
  assertEvidenceSafe(evidence);
  await fs.mkdir(configuration.evidenceDirectory, { recursive: true });
  const fileName = `gcs-batch2-object-${configuration.runtimeRole}-${configuration.runId}.json`;
  const evidencePath = path.join(configuration.evidenceDirectory, fileName);
  await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  process.stdout.write(
    `${JSON.stringify({ status: evidence.status, evidencePath })}\n`,
  );
}

async function readAll(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function operation(name, details) {
  return { name, status: 'PASS', ...details };
}

function requireGeneration(value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('generation_missing');
  }
}

function assertCapabilityTtl(expiresAt, expectedSeconds) {
  if (!(expiresAt instanceof Date) || Number.isNaN(expiresAt.getTime())) {
    throw new Error('signed_capability_expiry_invalid');
  }
  const remainingSeconds = (expiresAt.getTime() - Date.now()) / 1_000;
  if (
    remainingSeconds < expectedSeconds - 30 ||
    remainingSeconds > expectedSeconds + 5
  ) {
    throw new Error('signed_capability_ttl_mismatch');
  }
}

function assertEqual(actual, expected, errorCode) {
  if (actual !== expected) throw new Error(errorCode);
}

function assertBytes(actual, expected, errorCode) {
  if (!actual.equals(expected)) throw new Error(errorCode);
}

function assertHeaderStartsWith(response, header, expected, errorCode) {
  const value = response.headers.get(header);
  if (!value || !value.toLowerCase().startsWith(expected.toLowerCase())) {
    throw new Error(errorCode);
  }
}

function assertHeaderListContains(response, header, expected, errorCode) {
  const actual = new Set(
    (response.headers.get(header) ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  if (!expected.every((value) => actual.has(value.toLowerCase()))) {
    throw new Error(errorCode);
  }
}

function assertActualCorsResponse(
  response,
  expectedOrigin,
  requiredExposedHeaders,
  errorPrefix,
) {
  const allowOrigin = response.headers.get('access-control-allow-origin');
  const exposeHeaders = response.headers.get('access-control-expose-headers');
  assertEqual(
    allowOrigin,
    expectedOrigin,
    `${errorPrefix}_allow_origin_invalid`,
  );
  assertHeaderListContains(
    response,
    'access-control-expose-headers',
    requiredExposedHeaders,
    `${errorPrefix}_expose_headers_invalid`,
  );
  for (const header of requiredExposedHeaders) {
    if (!response.headers.has(header)) {
      throw new Error(`${errorPrefix}_response_header_missing`);
    }
  }
  return {
    accessControlAllowOrigin: allowOrigin,
    accessControlExposeHeaders: exposeHeaders,
    emittedAndExposedHeaders: [...requiredExposedHeaders],
  };
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({ status: 'FAIL', code: safeFailureCode(error) })}\n`,
    );
    process.exitCode = 1;
  });
}

module.exports = {
  assertAvailable,
  createActualGcsAdapter,
  executeProofStage,
  main,
  resolveActiveAdcIdentity,
  runProof,
};
