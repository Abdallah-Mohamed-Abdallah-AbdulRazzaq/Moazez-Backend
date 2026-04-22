const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { URL } = require('node:url');
const { PrismaClient } = require('@prisma/client');
const { Client: MinioClient } = require('minio');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000/api/v1';
const DEMO_EMAIL = process.env.DEMO_EMAIL || 'admin@academy.moazez.dev';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'School123!';
const ENV_PATH = path.join(process.cwd(), '.env');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

const prisma = new PrismaClient();
const cleanupState = {
  fileIds: [],
  importJobIds: [],
  storageObjects: [],
};

function pass(message) {
  console.log(`${GREEN}✓${RESET} ${message}`);
}

function header(message) {
  console.log(`\n${BOLD}${message}${RESET}`);
}

function fail(message, details) {
  if (message) {
    console.error(`${RED}✗${RESET} ${message}`);
  }
  if (details) {
    console.error(details);
  }
  process.exitCode = 1;
  throw new Error(message);
}

function parseEnvFile(fileContent) {
  return fileContent
    .split(/\r?\n/)
    .reduce((values, rawLine) => {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) {
        return values;
      }

      const separatorIndex = line.indexOf('=');
      if (separatorIndex === -1) {
        return values;
      }

      const key = line.slice(0, separatorIndex).trim();
      let value = line.slice(separatorIndex + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      values[key] = value;
      return values;
    }, {});
}

function loadEnv() {
  const fileValues = fs.existsSync(ENV_PATH)
    ? parseEnvFile(fs.readFileSync(ENV_PATH, 'utf8'))
    : {};

  return {
    ...fileValues,
    ...process.env,
  };
}

function createMinioClient() {
  const env = loadEnv();
  const endpoint = new URL(env.STORAGE_ENDPOINT);

  return new MinioClient({
    endPoint: endpoint.hostname,
    port: endpoint.port
      ? Number(endpoint.port)
      : endpoint.protocol === 'https:'
        ? 443
        : 80,
    useSSL: endpoint.protocol === 'https:',
    accessKey: env.STORAGE_ACCESS_KEY,
    secretKey: env.STORAGE_SECRET_KEY,
  });
}

async function requestJson(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  return { response, body };
}

async function login() {
  const { response, body } = await requestJson(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    }),
  });

  if (!response.ok || !body?.accessToken) {
    fail('Login failed.', JSON.stringify(body, null, 2));
  }

  pass(`Logged in as ${DEMO_EMAIL}`);
  return body.accessToken;
}

async function uploadFile(accessToken, fileName, contentType, bodyText) {
  const form = new FormData();
  form.append('file', new Blob([bodyText], { type: contentType }), fileName);

  const { response, body } = await requestJson(`${BASE_URL}/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });

  if (response.status !== 201 || !body?.id) {
    fail('File upload failed.', JSON.stringify(body, null, 2));
  }

  const persistedFile = await prisma.file.findUnique({
    where: { id: body.id },
    select: {
      id: true,
      bucket: true,
      objectKey: true,
      originalName: true,
      mimeType: true,
      sizeBytes: true,
    },
  });

  if (!persistedFile) {
    fail('Uploaded file metadata was not persisted.');
  }

  cleanupState.fileIds.push(persistedFile.id);
  cleanupState.storageObjects.push({
    bucket: persistedFile.bucket,
    objectKey: persistedFile.objectKey,
  });

  pass(`Uploaded ${fileName} and persisted metadata.`);
  return {
    fileId: body.id,
    originalName: persistedFile.originalName,
    mimeType: persistedFile.mimeType,
    sizeBytes: persistedFile.sizeBytes.toString(),
  };
}

async function secureDownload(accessToken, fileId, expectedBody) {
  const response = await fetch(`${BASE_URL}/files/${fileId}/download`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    redirect: 'manual',
  });

  if (response.status !== 307) {
    const body = await response.text();
    fail('Secure download did not return a redirect.', body);
  }

  const signedUrl = response.headers.get('location');
  if (!signedUrl || !signedUrl.includes('X-Amz-Expires=')) {
    fail('Signed download URL was missing or malformed.');
  }

  const signedResponse = await fetch(signedUrl);
  const downloadedBody = await signedResponse.text();
  if (signedResponse.status !== 200 || downloadedBody !== expectedBody) {
    fail('Signed download URL did not return the expected file body.');
  }

  pass(`Secure download succeeded for file ${fileId}.`);
}

async function runAttachmentsFlow(accessToken, fileId, fileBody) {
  header('Attachments preview flow');

  const resourceId = randomUUID();
  const { response: linkResponse, body: linkBody } = await requestJson(
    `${BASE_URL}/files/attachments`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileId,
        resourceType: 'admissions.application',
        resourceId,
      }),
    },
  );

  if (linkResponse.status !== 201 || !linkBody?.id) {
    fail('Attachment link creation failed.', JSON.stringify(linkBody, null, 2));
  }

  const attachmentId = linkBody.id;
  pass(`Linked file ${fileId} to admissions preview target ${resourceId}.`);

  const listResponse = await fetch(
    `${BASE_URL}/files/attachments?resourceType=admissions.application&resourceId=${resourceId}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  const listBody = await listResponse.json();
  if (listResponse.status !== 200 || !Array.isArray(listBody) || listBody.length !== 1) {
    fail('Attachment list did not return the expected single link.', JSON.stringify(listBody, null, 2));
  }

  pass('Listed the admissions preview attachment.');

  const deleteResponse = await fetch(
    `${BASE_URL}/files/attachments/${attachmentId}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  const deleteBody = await deleteResponse.json();
  if (deleteResponse.status !== 200 || deleteBody?.ok !== true) {
    fail('Attachment delete failed.', JSON.stringify(deleteBody, null, 2));
  }

  const persistedFile = await prisma.file.findUnique({
    where: { id: fileId },
    select: { id: true },
  });
  if (!persistedFile) {
    fail('Deleting the attachment link removed the underlying file record.');
  }

  pass('Deleted the attachment link without deleting the file record.');

  await secureDownload(accessToken, fileId, fileBody);
  pass('Underlying file remained downloadable after attachment delete.');
}

async function waitForImportCompletion(accessToken, importJobId) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { response, body } = await requestJson(
      `${BASE_URL}/files/imports/${importJobId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (response.status !== 200) {
      fail('Import status check failed.', JSON.stringify(body, null, 2));
    }

    if (body.status === 'COMPLETED' || body.status === 'FAILED') {
      return body;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  fail(`Timed out waiting for import job ${importJobId} to finish.`);
}

async function runImportsFlow(accessToken) {
  header('Imports skeleton flow');

  const attachmentCountBefore = await prisma.attachment.count();
  const form = new FormData();
  const csvBody = 'student_id,name\nSTD-1,Alice\nSTD-2,Bob\n';
  form.append('type', 'students_basic');
  form.append(
    'file',
    new Blob([csvBody], { type: 'text/csv' }),
    'demo-sprint1c-import.csv',
  );

  const { response: createResponse, body: createBody } = await requestJson(
    `${BASE_URL}/files/imports`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    },
  );

  if (createResponse.status !== 201 || !createBody?.id || !createBody?.uploadedFileId) {
    fail('Import job creation failed.', JSON.stringify(createBody, null, 2));
  }

  cleanupState.importJobIds.push(createBody.id);
  cleanupState.fileIds.push(createBody.uploadedFileId);

  const persistedImportJob = await prisma.importJob.findUnique({
    where: { id: createBody.id },
    select: {
      id: true,
      uploadedFileId: true,
      type: true,
      status: true,
    },
  });

  if (!persistedImportJob) {
    fail('Import job metadata was not persisted.');
  }

  const persistedImportFile = await prisma.file.findUnique({
    where: { id: createBody.uploadedFileId },
    select: {
      id: true,
      bucket: true,
      objectKey: true,
    },
  });

  if (persistedImportFile) {
    cleanupState.storageObjects.push({
      bucket: persistedImportFile.bucket,
      objectKey: persistedImportFile.objectKey,
    });
  }

  pass(`Created import job ${createBody.id} with students_basic.`);

  const statusBody = await waitForImportCompletion(accessToken, createBody.id);
  if (statusBody.status !== 'COMPLETED') {
    fail('Import job did not complete successfully.', JSON.stringify(statusBody, null, 2));
  }

  pass(`Import job ${createBody.id} completed.`);

  const { response: reportResponse, body: reportBody } = await requestJson(
    `${BASE_URL}/files/imports/${createBody.id}/report`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (reportResponse.status !== 200) {
    fail('Import report fetch failed.', JSON.stringify(reportBody, null, 2));
  }

  if (
    reportBody.status !== 'COMPLETED' ||
    !Array.isArray(reportBody.warnings) ||
    !reportBody.warnings.includes('Stub validation only. No domain rows were created.')
  ) {
    fail('Import report skeleton was not returned as expected.', JSON.stringify(reportBody, null, 2));
  }

  const attachmentCountAfter = await prisma.attachment.count();
  if (attachmentCountAfter !== attachmentCountBefore) {
    fail('Import skeleton created unexpected attachment links.');
  }

  pass('Import report was returned and no attachment-side effects were introduced.');
}

async function cleanup() {
  const minio = createMinioClient();

  for (const importJobId of [...new Set(cleanupState.importJobIds)]) {
    await prisma.importJob.deleteMany({ where: { id: importJobId } });
  }

  for (const fileId of [...new Set(cleanupState.fileIds)]) {
    await prisma.file.deleteMany({ where: { id: fileId } });
  }

  for (const object of cleanupState.storageObjects) {
    try {
      await minio.removeObject(object.bucket, object.objectKey);
    } catch {
      // Cleanup is best-effort for local demo runs.
    }
  }

  await prisma.$disconnect();
}

async function main() {
  header('Sprint 1C demo readiness check');

  const healthResponse = await fetch(`${BASE_URL}/health`);
  if (healthResponse.status !== 200) {
    fail('Health endpoint did not return 200.');
  }
  pass(`Health check passed at ${BASE_URL}/health`);

  const accessToken = await login();

  header('Files core flow');
  const fileBody = 'demo sprint 1c secure file body';
  const uploadedFile = await uploadFile(
    accessToken,
    'demo-sprint1c-file.txt',
    'text/plain',
    fileBody,
  );
  await secureDownload(accessToken, uploadedFile.fileId, fileBody);

  await runAttachmentsFlow(accessToken, uploadedFile.fileId, fileBody);
  await runImportsFlow(accessToken);

  console.log('');
  pass('Sprint 1C demo checks passed.');
}

main()
  .catch((error) => {
    if (!(error instanceof Error)) {
      console.error(error);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
  });
