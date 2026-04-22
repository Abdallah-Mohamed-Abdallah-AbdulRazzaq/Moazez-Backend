const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { URL } = require('node:url');
const { PrismaClient } = require('@prisma/client');
const { Client: MinioClient } = require('minio');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000/api/v1';
const DEMO_EMAIL = process.env.DEMO_EMAIL || 'admin@academy.moazez.dev';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'School123!';
const DEMO_SCHOOL_SLUG = 'moazez-academy';
const STUDENT_LIFECYCLE_TABLES = [
  'students',
  'guardians',
  'enrollments',
  'student_guardians',
];
const ENV_PATH = path.join(process.cwd(), '.env');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

const prisma = new PrismaClient();
let phoneSequence = 10_000_000;
const cleanupState = {
  leadIds: [],
  applicationIds: [],
  fileIds: [],
  documentIds: [],
  placementTestIds: [],
  interviewIds: [],
  decisionIds: [],
  storageObjects: [],
};

function pass(message) {
  console.log(`${GREEN}OK${RESET} ${message}`);
}

function header(message) {
  console.log(`\n${BOLD}${message}${RESET}`);
}

function fail(message, details) {
  if (message) {
    console.error(`${RED}FAIL${RESET} ${message}`);
  }
  if (details) {
    console.error(details);
  }
  process.exitCode = 1;
  throw new Error(message);
}

function parseEnvFile(fileContent) {
  return fileContent.split(/\r?\n/).reduce((values, rawLine) => {
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

function nextPhone() {
  phoneSequence += 1;
  return `+2010${String(phoneSequence).padStart(8, '0')}`;
}

function nextSuffix() {
  return randomUUID().split('-')[0];
}

async function getDemoAcademicContext() {
  const school = await prisma.school.findFirst({
    where: { slug: DEMO_SCHOOL_SLUG },
    select: { id: true },
  });
  if (!school) {
    fail('Demo school baseline is missing. Run `npm run seed` first.');
  }

  const [academicYear, grade] = await Promise.all([
    prisma.academicYear.findFirst({
      where: {
        schoolId: school.id,
        isActive: true,
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, nameEn: true },
    }),
    prisma.grade.findFirst({
      where: {
        schoolId: school.id,
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, nameEn: true },
    }),
  ]);

  if (!academicYear || !grade) {
    fail('Demo academic baseline is missing. Run `npm run seed` first.');
  }

  return {
    academicYearId: academicYear.id,
    academicYearName: academicYear.nameEn,
    gradeId: grade.id,
    gradeName: grade.nameEn,
  };
}

async function registerStoredFile(fileId) {
  const file = await prisma.file.findUnique({
    where: { id: fileId },
    select: {
      id: true,
      bucket: true,
      objectKey: true,
    },
  });

  if (!file) {
    fail(`Uploaded file ${fileId} was not persisted.`);
  }

  cleanupState.fileIds.push(file.id);
  cleanupState.storageObjects.push({
    bucket: file.bucket,
    objectKey: file.objectKey,
  });
}

async function getStudentLifecycleSnapshot() {
  const tables = await prisma.$queryRaw`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('students', 'guardians', 'enrollments', 'student_guardians')
    ORDER BY table_name
  `;

  const existingTables = tables.map((row) => row.table_name);
  const rowCounts = {};

  for (const table of existingTables) {
    let result;

    switch (table) {
      case 'students':
        result =
          await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM public.students`;
        rowCounts.students = Number(result[0]?.count ?? 0);
        break;
      case 'guardians':
        result =
          await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM public.guardians`;
        rowCounts.guardians = Number(result[0]?.count ?? 0);
        break;
      case 'enrollments':
        result =
          await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM public.enrollments`;
        rowCounts.enrollments = Number(result[0]?.count ?? 0);
        break;
      case 'student_guardians':
        result =
          await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM public.student_guardians`;
        rowCounts.student_guardians = Number(result[0]?.count ?? 0);
        break;
    }
  }

  return { existingTables, rowCounts };
}

function expectNoStudentLifecycleSideEffects(before, after) {
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    fail(
      'Student lifecycle side effects were detected.',
      JSON.stringify({ before, after }, null, 2),
    );
  }
}

async function main() {
  header('Sprint 2A admissions demo');

  const healthResponse = await fetch(`${BASE_URL}/health`);
  if (healthResponse.status !== 200) {
    fail('Health endpoint did not return 200.');
  }
  pass(`Health check passed at ${BASE_URL}/health`);

  const accessToken = await login();
  const academicContext = await getDemoAcademicContext();
  const beforeSnapshot = await getStudentLifecycleSnapshot();

  const suffix = nextSuffix();
  const studentName = `Sprint2A Demo Student ${suffix}`;

  header('Admissions intake');

  const { response: leadResponse, body: leadBody } = await requestJson(
    `${BASE_URL}/admissions/leads`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        studentName,
        primaryContactName: `Sprint2A Demo Parent ${suffix}`,
        phone: nextPhone(),
        email: `sprint2a.demo.${suffix}@example.com`,
        channel: 'Referral',
        notes: 'Sprint 2A demo intake lead',
      }),
    },
  );

  if (leadResponse.status !== 201 || !leadBody?.id) {
    fail('Lead creation failed.', JSON.stringify(leadBody, null, 2));
  }

  cleanupState.leadIds.push(leadBody.id);
  pass(`Created lead ${leadBody.id}`);

  const { response: applicationResponse, body: applicationBody } =
    await requestJson(`${BASE_URL}/admissions/applications`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        leadId: leadBody.id,
        studentName,
        requestedAcademicYearId: academicContext.academicYearId,
        requestedGradeId: academicContext.gradeId,
        source: 'referral',
      }),
    });

  if (applicationResponse.status !== 201 || !applicationBody?.id) {
    fail(
      'Application creation failed.',
      JSON.stringify(applicationBody, null, 2),
    );
  }

  cleanupState.applicationIds.push(applicationBody.id);
  pass(`Created application ${applicationBody.id}`);

  const form = new FormData();
  const fileBody = `Sprint 2A admissions demo document ${suffix}`;
  const fileName = `sprint2a-demo-${suffix}.pdf`;
  form.append(
    'file',
    new Blob([fileBody], { type: 'application/pdf' }),
    fileName,
  );

  const { response: uploadResponse, body: uploadBody } = await requestJson(
    `${BASE_URL}/files`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    },
  );

  if (uploadResponse.status !== 201 || !uploadBody?.id) {
    fail('File upload failed.', JSON.stringify(uploadBody, null, 2));
  }

  await registerStoredFile(uploadBody.id);
  pass(`Uploaded document file ${uploadBody.id}`);

  const { response: documentResponse, body: documentBody } = await requestJson(
    `${BASE_URL}/admissions/applications/${applicationBody.id}/documents`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileId: uploadBody.id,
        documentType: 'birth_certificate',
        notes: 'Sprint 2A demo document',
      }),
    },
  );

  if (documentResponse.status !== 201 || !documentBody?.id) {
    fail(
      'Application document link failed.',
      JSON.stringify(documentBody, null, 2),
    );
  }

  cleanupState.documentIds.push(documentBody.id);
  pass(`Linked application document ${documentBody.id}`);

  const { response: submitResponse, body: submittedApplication } =
    await requestJson(
      `${BASE_URL}/admissions/applications/${applicationBody.id}/submit`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

  if (
    submitResponse.status !== 200 ||
    submittedApplication?.status !== 'submitted'
  ) {
    fail(
      'Application submit failed.',
      JSON.stringify(submittedApplication, null, 2),
    );
  }

  pass(`Submitted application ${submittedApplication.id}`);

  header('Admissions evaluation');

  const { response: placementResponse, body: placementBody } =
    await requestJson(`${BASE_URL}/admissions/tests`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        applicationId: submittedApplication.id,
        type: 'Placement',
        scheduledAt: '2026-04-26T10:00:00.000Z',
      }),
    });

  if (placementResponse.status !== 201 || !placementBody?.id) {
    fail(
      'Placement test creation failed.',
      JSON.stringify(placementBody, null, 2),
    );
  }

  cleanupState.placementTestIds.push(placementBody.id);
  pass(`Created placement test ${placementBody.id}`);

  const { response: placementUpdateResponse, body: placementUpdateBody } =
    await requestJson(`${BASE_URL}/admissions/tests/${placementBody.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: 'completed',
        score: 0,
        result: 'Completed with zero score edge case',
      }),
    });

  if (
    placementUpdateResponse.status !== 200 ||
    placementUpdateBody?.status !== 'completed' ||
    placementUpdateBody?.score !== 0
  ) {
    fail(
      'Placement test completion failed.',
      JSON.stringify(placementUpdateBody, null, 2),
    );
  }

  pass(`Completed placement test ${placementBody.id}`);

  const { response: interviewResponse, body: interviewBody } =
    await requestJson(`${BASE_URL}/admissions/interviews`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        applicationId: submittedApplication.id,
        scheduledAt: '2026-04-27T11:00:00.000Z',
        notes: 'Sprint 2A demo interview',
      }),
    });

  if (interviewResponse.status !== 201 || !interviewBody?.id) {
    fail('Interview creation failed.', JSON.stringify(interviewBody, null, 2));
  }

  cleanupState.interviewIds.push(interviewBody.id);
  pass(`Created interview ${interviewBody.id}`);

  const { response: interviewUpdateResponse, body: interviewUpdateBody } =
    await requestJson(`${BASE_URL}/admissions/interviews/${interviewBody.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: 'completed',
        notes: 'Sprint 2A demo interview completed',
      }),
    });

  if (
    interviewUpdateResponse.status !== 200 ||
    interviewUpdateBody?.status !== 'completed'
  ) {
    fail(
      'Interview completion failed.',
      JSON.stringify(interviewUpdateBody, null, 2),
    );
  }

  pass(`Completed interview ${interviewBody.id}`);

  const { response: decisionResponse, body: decisionBody } = await requestJson(
    `${BASE_URL}/admissions/decisions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        applicationId: submittedApplication.id,
        decision: 'accept',
        reason: 'Sprint 2A demo acceptance',
      }),
    },
  );

  if (decisionResponse.status !== 201 || !decisionBody?.id) {
    fail('Decision creation failed.', JSON.stringify(decisionBody, null, 2));
  }

  cleanupState.decisionIds.push(decisionBody.id);
  pass(`Created accepted decision ${decisionBody.id}`);

  header('Enroll handoff preview');

  const { response: handoffResponse, body: handoffBody } = await requestJson(
    `${BASE_URL}/admissions/applications/${submittedApplication.id}/enroll`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (
    handoffResponse.status !== 200 ||
    handoffBody?.applicationId !== submittedApplication.id ||
    handoffBody?.eligible !== true
  ) {
    fail(
      'Enroll handoff preview failed.',
      JSON.stringify(handoffBody, null, 2),
    );
  }

  if (
    handoffBody?.handoff?.studentDraft?.fullName !== studentName ||
    handoffBody?.handoff?.guardianDrafts?.length !== 0 ||
    handoffBody?.handoff?.enrollmentDraft?.requestedAcademicYearId !==
      academicContext.academicYearId ||
    handoffBody?.handoff?.enrollmentDraft?.requestedGradeId !==
      academicContext.gradeId
  ) {
    fail(
      'Enroll handoff preview was not bounded as expected.',
      JSON.stringify(handoffBody, null, 2),
    );
  }

  pass('Accepted application returned a bounded handoff preview.');

  const afterSnapshot = await getStudentLifecycleSnapshot();
  expectNoStudentLifecycleSideEffects(beforeSnapshot, afterSnapshot);
  pass(
    `No student lifecycle side effects detected across tables: ${STUDENT_LIFECYCLE_TABLES.join(', ')}`,
  );

  console.log('');
  pass('Sprint 2A admissions demo checks passed.');
}

async function cleanup() {
  const minio = createMinioClient();

  if (cleanupState.decisionIds.length > 0) {
    await prisma.auditLog.deleteMany({
      where: {
        action: 'admissions.application.decision',
        resourceId: { in: [...new Set(cleanupState.decisionIds)] },
      },
    });
    await prisma.admissionDecision.deleteMany({
      where: { id: { in: [...new Set(cleanupState.decisionIds)] } },
    });
  }

  if (cleanupState.interviewIds.length > 0) {
    await prisma.interview.deleteMany({
      where: { id: { in: [...new Set(cleanupState.interviewIds)] } },
    });
  }

  if (cleanupState.placementTestIds.length > 0) {
    await prisma.placementTest.deleteMany({
      where: { id: { in: [...new Set(cleanupState.placementTestIds)] } },
    });
  }

  if (cleanupState.documentIds.length > 0) {
    await prisma.applicationDocument.deleteMany({
      where: { id: { in: [...new Set(cleanupState.documentIds)] } },
    });
  }

  if (cleanupState.fileIds.length > 0) {
    await prisma.file.deleteMany({
      where: { id: { in: [...new Set(cleanupState.fileIds)] } },
    });
  }

  if (cleanupState.applicationIds.length > 0) {
    await prisma.application.deleteMany({
      where: { id: { in: [...new Set(cleanupState.applicationIds)] } },
    });
  }

  if (cleanupState.leadIds.length > 0) {
    await prisma.lead.deleteMany({
      where: { id: { in: [...new Set(cleanupState.leadIds)] } },
    });
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
