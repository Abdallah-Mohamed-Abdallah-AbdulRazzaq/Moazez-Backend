const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { URL } = require('node:url');
const {
  Prisma,
  PrismaClient,
  StudentEnrollmentStatus,
} = require('@prisma/client');
const { Client: MinioClient } = require('minio');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000/api/v1';
const DEMO_EMAIL = process.env.DEMO_EMAIL || 'admin@academy.moazez.dev';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'School123!';
const DEMO_SCHOOL_SLUG = 'moazez-academy';
const ENV_PATH = path.join(process.cwd(), '.env');
const OUT_OF_SCOPE_TABLES = [
  'attendance_entries',
  'attendance_excuses',
  'attendance_sessions',
  'grade_assessments',
  'grade_items',
  'reinforcement_rewards',
  'reinforcement_reviews',
  'reinforcement_tasks',
  'reinforcement_xp_ledgers',
];

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

const prisma = new PrismaClient();

let phoneSequence = 20_000_000;
let originalAcademicYearId = null;
let originalAcademicYearWasActive = false;
let createdPromotionAcademicYearId = null;

const cleanupState = {
  studentIds: [],
  guardianIds: [],
  noteIds: [],
  medicalProfileIds: [],
  documentIds: [],
  fileIds: [],
  academicYearIds: [],
  stageIds: [],
  gradeIds: [],
  sectionIds: [],
  classroomIds: [],
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

function nextPhone() {
  phoneSequence += 1;
  return `+2010${String(phoneSequence).padStart(8, '0')}`;
}

function nextSuffix() {
  return randomUUID().split('-')[0];
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

async function getDemoSchoolContext() {
  const school = await prisma.school.findFirst({
    where: { slug: DEMO_SCHOOL_SLUG },
    select: {
      id: true,
      organizationId: true,
      academicYears: {
        where: {
          isActive: true,
          deletedAt: null,
        },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          nameEn: true,
          isActive: true,
        },
        take: 1,
      },
    },
  });

  if (!school || school.academicYears.length === 0) {
    fail('Demo academic baseline is missing. Run `npm run seed` first.');
  }

  return {
    schoolId: school.id,
    organizationId: school.organizationId,
    activeAcademicYearId: school.academicYears[0].id,
    activeAcademicYearName: school.academicYears[0].nameEn,
  };
}

async function registerStoredFile(fileId) {
  const file = await prisma.file.findUnique({
    where: { id: fileId },
    select: { id: true, bucket: true, objectKey: true },
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

async function getOutOfScopeDomainSnapshot() {
  const tables = await prisma.$queryRaw(
    Prisma.sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (${Prisma.join(OUT_OF_SCOPE_TABLES)})
      ORDER BY table_name
    `,
  );

  const snapshot = {};

  for (const row of tables) {
    switch (row.table_name) {
      case 'attendance_entries': {
        const result =
          await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM public.attendance_entries`;
        snapshot.attendance_entries = Number(result[0]?.count ?? 0);
        break;
      }
      case 'attendance_excuses': {
        const result =
          await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM public.attendance_excuses`;
        snapshot.attendance_excuses = Number(result[0]?.count ?? 0);
        break;
      }
      case 'attendance_sessions': {
        const result =
          await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM public.attendance_sessions`;
        snapshot.attendance_sessions = Number(result[0]?.count ?? 0);
        break;
      }
      case 'grade_assessments': {
        const result =
          await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM public.grade_assessments`;
        snapshot.grade_assessments = Number(result[0]?.count ?? 0);
        break;
      }
      case 'grade_items': {
        const result =
          await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM public.grade_items`;
        snapshot.grade_items = Number(result[0]?.count ?? 0);
        break;
      }
      case 'reinforcement_rewards': {
        const result =
          await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM public.reinforcement_rewards`;
        snapshot.reinforcement_rewards = Number(result[0]?.count ?? 0);
        break;
      }
      case 'reinforcement_reviews': {
        const result =
          await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM public.reinforcement_reviews`;
        snapshot.reinforcement_reviews = Number(result[0]?.count ?? 0);
        break;
      }
      case 'reinforcement_tasks': {
        const result =
          await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM public.reinforcement_tasks`;
        snapshot.reinforcement_tasks = Number(result[0]?.count ?? 0);
        break;
      }
      case 'reinforcement_xp_ledgers': {
        const result =
          await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM public.reinforcement_xp_ledgers`;
        snapshot.reinforcement_xp_ledgers = Number(result[0]?.count ?? 0);
        break;
      }
    }
  }

  return snapshot;
}

function expectEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(
      message,
      JSON.stringify(
        {
          actual,
          expected,
        },
        null,
        2,
      ),
    );
  }
}

async function createLifecycleStructure(context, suffix) {
  originalAcademicYearId = context.activeAcademicYearId;
  originalAcademicYearWasActive = true;

  const promotionAcademicYear = await prisma.academicYear.create({
    data: {
      schoolId: context.schoolId,
      nameAr: `Sprint 2B ${suffix} 2027/2028 AR`,
      nameEn: `Sprint 2B ${suffix} 2027/2028`,
      startDate: new Date('2027-09-01T00:00:00.000Z'),
      endDate: new Date('2028-06-30T00:00:00.000Z'),
      isActive: false,
    },
    select: { id: true, nameEn: true },
  });
  createdPromotionAcademicYearId = promotionAcademicYear.id;
  cleanupState.academicYearIds.push(promotionAcademicYear.id);

  const stage = await prisma.stage.create({
    data: {
      schoolId: context.schoolId,
      nameAr: `Sprint 2B Stage ${suffix} AR`,
      nameEn: `Sprint 2B Stage ${suffix}`,
      sortOrder: 1,
    },
    select: { id: true },
  });
  cleanupState.stageIds.push(stage.id);

  const [gradeOne, gradeTwo] = await Promise.all([
    prisma.grade.create({
      data: {
        schoolId: context.schoolId,
        stageId: stage.id,
        nameAr: `Sprint 2B Grade 1 ${suffix} AR`,
        nameEn: `Sprint 2B Grade 1 ${suffix}`,
        sortOrder: 1,
        capacity: 30,
      },
      select: { id: true, nameEn: true },
    }),
    prisma.grade.create({
      data: {
        schoolId: context.schoolId,
        stageId: stage.id,
        nameAr: `Sprint 2B Grade 2 ${suffix} AR`,
        nameEn: `Sprint 2B Grade 2 ${suffix}`,
        sortOrder: 2,
        capacity: 30,
      },
      select: { id: true, nameEn: true },
    }),
  ]);
  cleanupState.gradeIds.push(gradeOne.id, gradeTwo.id);

  const [sectionA, sectionB, promotedSection] = await Promise.all([
    prisma.section.create({
      data: {
        schoolId: context.schoolId,
        gradeId: gradeOne.id,
        nameAr: `Sprint 2B Section A ${suffix} AR`,
        nameEn: `Sprint 2B Section A ${suffix}`,
        sortOrder: 1,
        capacity: 30,
      },
      select: { id: true, nameEn: true },
    }),
    prisma.section.create({
      data: {
        schoolId: context.schoolId,
        gradeId: gradeOne.id,
        nameAr: `Sprint 2B Section B ${suffix} AR`,
        nameEn: `Sprint 2B Section B ${suffix}`,
        sortOrder: 2,
        capacity: 30,
      },
      select: { id: true, nameEn: true },
    }),
    prisma.section.create({
      data: {
        schoolId: context.schoolId,
        gradeId: gradeTwo.id,
        nameAr: `Sprint 2B Section Grade 2 ${suffix} AR`,
        nameEn: `Sprint 2B Section Grade 2 ${suffix}`,
        sortOrder: 1,
        capacity: 30,
      },
      select: { id: true, nameEn: true },
    }),
  ]);
  cleanupState.sectionIds.push(sectionA.id, sectionB.id, promotedSection.id);

  const [classroomA, classroomB, promotedClassroom] = await Promise.all([
    prisma.classroom.create({
      data: {
        schoolId: context.schoolId,
        sectionId: sectionA.id,
        nameAr: `Sprint 2B Classroom A ${suffix} AR`,
        nameEn: `Sprint 2B Classroom A ${suffix}`,
        sortOrder: 1,
        capacity: 30,
      },
      select: { id: true, nameEn: true },
    }),
    prisma.classroom.create({
      data: {
        schoolId: context.schoolId,
        sectionId: sectionB.id,
        nameAr: `Sprint 2B Classroom B ${suffix} AR`,
        nameEn: `Sprint 2B Classroom B ${suffix}`,
        sortOrder: 1,
        capacity: 30,
      },
      select: { id: true, nameEn: true },
    }),
    prisma.classroom.create({
      data: {
        schoolId: context.schoolId,
        sectionId: promotedSection.id,
        nameAr: `Sprint 2B Classroom Grade 2 ${suffix} AR`,
        nameEn: `Sprint 2B Classroom Grade 2 ${suffix}`,
        sortOrder: 1,
        capacity: 30,
      },
      select: { id: true, nameEn: true },
    }),
  ]);
  cleanupState.classroomIds.push(
    classroomA.id,
    classroomB.id,
    promotedClassroom.id,
  );

  return {
    yearOne: {
      id: context.activeAcademicYearId,
      nameEn: context.activeAcademicYearName,
    },
    yearTwo: promotionAcademicYear,
    gradeOne,
    gradeTwo,
    sectionA,
    sectionB,
    promotedSection,
    classroomA,
    classroomB,
    promotedClassroom,
  };
}

async function createStudent(accessToken, fullName) {
  const { response, body } = await requestJson(
    `${BASE_URL}/students-guardians/students`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        full_name_en: fullName,
        dateOfBirth: '2015-05-10',
      }),
    },
  );

  if (response.status !== 201 || !body?.id) {
    fail('Student creation failed.', JSON.stringify(body, null, 2));
  }

  cleanupState.studentIds.push(body.id);
  return body;
}

async function createGuardian(accessToken, input) {
  const { response, body } = await requestJson(
    `${BASE_URL}/students-guardians/students/guardians`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
  );

  if (response.status !== 201 || !body?.guardianId) {
    fail('Guardian creation failed.', JSON.stringify(body, null, 2));
  }

  cleanupState.guardianIds.push(body.guardianId);
  return body;
}

async function createEnrollment(accessToken, payload) {
  const { response, body } = await requestJson(
    `${BASE_URL}/students-guardians/enrollments`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  );

  if (response.status !== 201 || !body?.enrollmentId) {
    fail('Enrollment creation failed.', JSON.stringify(body, null, 2));
  }

  return body;
}

async function getCurrentEnrollment(accessToken, studentId) {
  const { response, body } = await requestJson(
    `${BASE_URL}/students-guardians/enrollments/current?studentId=${studentId}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (response.status !== 200) {
    fail('Current enrollment lookup failed.', JSON.stringify(body, null, 2));
  }

  return body;
}

async function getEnrollmentHistory(accessToken, studentId) {
  const { response, body } = await requestJson(
    `${BASE_URL}/students-guardians/enrollments/history?studentId=${studentId}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (response.status !== 200 || !Array.isArray(body)) {
    fail('Enrollment history lookup failed.', JSON.stringify(body, null, 2));
  }

  return body;
}

async function activatePromotionYear(yearOneId, yearTwoId) {
  await prisma.$transaction([
    prisma.academicYear.update({
      where: { id: yearOneId },
      data: { isActive: false },
    }),
    prisma.academicYear.update({
      where: { id: yearTwoId },
      data: { isActive: true },
    }),
  ]);
}

async function main() {
  header('Sprint 2B students demo');

  const healthResponse = await fetch(`${BASE_URL}/health`);
  if (healthResponse.status !== 200) {
    fail('Health endpoint did not return 200.');
  }
  pass(`Health check passed at ${BASE_URL}/health`);

  const accessToken = await login();
  const demoContext = await getDemoSchoolContext();
  const outOfScopeDomainSnapshotBefore = await getOutOfScopeDomainSnapshot();
  const suffix = nextSuffix();
  const structure = await createLifecycleStructure(demoContext, suffix);

  header('Identity and enrollment baseline');

  const primaryStudent = await createStudent(
    accessToken,
    `Sprint 2B Primary Student ${suffix}`,
  );
  expectEqual(
    primaryStudent.status,
    'Active',
    'Student status should default to Active.',
  );
  pass(`Created student ${primaryStudent.id}`);

  const guardianA = await createGuardian(accessToken, {
    full_name: `Sprint 2B Guardian One ${suffix}`,
    relation: 'father',
    phone_primary: nextPhone(),
    email: `sprint2b.guardian.one.${suffix}@example.com`,
  });
  const guardianB = await createGuardian(accessToken, {
    full_name: `Sprint 2B Guardian Two ${suffix}`,
    relation: 'mother',
    phone_primary: nextPhone(),
    email: `sprint2b.guardian.two.${suffix}@example.com`,
  });
  pass(`Created guardians ${guardianA.guardianId} and ${guardianB.guardianId}`);

  const { response: linkGuardianAResponse, body: linkedGuardianA } =
    await requestJson(
      `${BASE_URL}/students-guardians/students/${primaryStudent.id}/guardians`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ guardianId: guardianA.guardianId }),
      },
    );

  if (
    linkGuardianAResponse.status !== 201 ||
    linkedGuardianA?.is_primary !== true
  ) {
    fail(
      'Primary guardian link failed.',
      JSON.stringify(linkedGuardianA, null, 2),
    );
  }

  const { response: linkGuardianBResponse, body: linkedGuardianB } =
    await requestJson(
      `${BASE_URL}/students-guardians/students/${primaryStudent.id}/guardians`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          guardianId: guardianB.guardianId,
          is_primary: false,
        }),
      },
    );

  if (
    linkGuardianBResponse.status !== 201 ||
    linkedGuardianB?.is_primary !== false
  ) {
    fail(
      'Secondary guardian link failed.',
      JSON.stringify(linkedGuardianB, null, 2),
    );
  }

  const { response: promoteGuardianResponse, body: promotedGuardian } =
    await requestJson(
      `${BASE_URL}/students-guardians/students/${primaryStudent.id}/guardians/${guardianB.guardianId}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ is_primary: true }),
      },
    );

  if (
    promoteGuardianResponse.status !== 200 ||
    promotedGuardian?.is_primary !== true
  ) {
    fail(
      'Primary guardian switch failed.',
      JSON.stringify(promotedGuardian, null, 2),
    );
  }

  const { response: primaryGuardiansResponse, body: primaryGuardians } =
    await requestJson(
      `${BASE_URL}/students-guardians/students/${primaryStudent.id}/guardians/primary`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

  if (
    primaryGuardiansResponse.status !== 200 ||
    !Array.isArray(primaryGuardians) ||
    primaryGuardians.length !== 1 ||
    primaryGuardians[0]?.guardianId !== guardianB.guardianId
  ) {
    fail(
      'Primary guardians lookup failed.',
      JSON.stringify(primaryGuardians, null, 2),
    );
  }
  pass('Primary guardian linking and switching succeeded.');

  const primaryProtectionResponse = await fetch(
    `${BASE_URL}/students-guardians/students/${primaryStudent.id}/guardians/${guardianB.guardianId}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ is_primary: false }),
    },
  );
  const primaryProtectionBody = await primaryProtectionResponse.json();

  if (
    primaryProtectionResponse.status !== 422 ||
    primaryProtectionBody?.error?.code !== 'students.guardian.primary_required'
  ) {
    fail(
      'Primary guardian protection did not hold.',
      JSON.stringify(primaryProtectionBody, null, 2),
    );
  }
  pass('Primary guardian protection returned 422 as expected.');

  const primaryEnrollment = await createEnrollment(accessToken, {
    studentId: primaryStudent.id,
    academicYearId: structure.yearOne.id,
    classroomId: structure.classroomA.id,
    enrollmentDate: '2026-09-01',
  });

  if (
    primaryEnrollment.academicYearId !== structure.yearOne.id ||
    primaryEnrollment.classroomId !== structure.classroomA.id ||
    primaryEnrollment.status !== 'active'
  ) {
    fail(
      'Primary enrollment payload was not bounded as expected.',
      JSON.stringify(primaryEnrollment, null, 2),
    );
  }
  pass(`Created enrollment ${primaryEnrollment.enrollmentId}`);

  const primaryCurrentEnrollment = await getCurrentEnrollment(
    accessToken,
    primaryStudent.id,
  );
  if (
    primaryCurrentEnrollment?.enrollmentId !== primaryEnrollment.enrollmentId
  ) {
    fail(
      'Current enrollment did not match the created baseline.',
      JSON.stringify(primaryCurrentEnrollment, null, 2),
    );
  }

  const primaryEnrollmentHistory = await getEnrollmentHistory(
    accessToken,
    primaryStudent.id,
  );
  if (
    primaryEnrollmentHistory.length !== 1 ||
    primaryEnrollmentHistory[0]?.enrollmentId !== primaryEnrollment.enrollmentId
  ) {
    fail(
      'Enrollment history did not include the baseline enrollment.',
      JSON.stringify(primaryEnrollmentHistory, null, 2),
    );
  }
  pass('Enrollment current/history reads are correct.');

  header('Student operations');

  const fileBody = `Sprint 2B student document ${suffix}`;
  const form = new FormData();
  form.append(
    'file',
    new Blob([fileBody], { type: 'application/pdf' }),
    `sprint2b-student-${suffix}.pdf`,
  );

  const uploadResponse = await fetch(`${BASE_URL}/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  const uploadedFile = await uploadResponse.json();

  if (uploadResponse.status !== 201 || !uploadedFile?.id) {
    fail(
      'Student document upload failed.',
      JSON.stringify(uploadedFile, null, 2),
    );
  }

  await registerStoredFile(uploadedFile.id);
  pass(`Uploaded file ${uploadedFile.id}`);

  const { response: documentResponse, body: documentBody } = await requestJson(
    `${BASE_URL}/students-guardians/students/${primaryStudent.id}/documents`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'Birth Certificate',
        fileId: uploadedFile.id,
        notes: 'Sprint 2B demo document',
      }),
    },
  );

  if (
    documentResponse.status !== 201 ||
    documentBody?.studentId !== primaryStudent.id ||
    documentBody?.url !== `/api/v1/files/${uploadedFile.id}/download`
  ) {
    fail(
      'Student document link failed.',
      JSON.stringify(documentBody, null, 2),
    );
  }
  cleanupState.documentIds.push(documentBody.id);
  pass(`Linked student document ${documentBody.id}`);

  const { response: createMedicalResponse, body: createdMedicalProfile } =
    await requestJson(
      `${BASE_URL}/students-guardians/students/${primaryStudent.id}/medical-profile`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bloodType: 'O+',
          allergies: 'Dust',
          notes: 'Carries inhaler',
          conditions: ['Asthma'],
          medications: ['Inhaler'],
        }),
      },
    );

  if (createMedicalResponse.status !== 200 || !createdMedicalProfile?.id) {
    fail(
      'Medical profile creation failed.',
      JSON.stringify(createdMedicalProfile, null, 2),
    );
  }
  cleanupState.medicalProfileIds.push(createdMedicalProfile.id);

  const { response: updateMedicalResponse, body: updatedMedicalProfile } =
    await requestJson(
      `${BASE_URL}/students-guardians/students/${primaryStudent.id}/medical-profile`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          allergies: 'Pollen',
          notes: 'Updated emergency plan',
        }),
      },
    );

  if (
    updateMedicalResponse.status !== 200 ||
    updatedMedicalProfile?.allergies !== 'Pollen'
  ) {
    fail(
      'Medical profile update failed.',
      JSON.stringify(updatedMedicalProfile, null, 2),
    );
  }
  pass('Medical profile create/update succeeded.');

  const { response: createNoteResponse, body: createdNote } = await requestJson(
    `${BASE_URL}/students-guardians/students/${primaryStudent.id}/notes`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        category: 'general',
        note: 'Sprint 2B first note',
        visibility: 'internal',
      }),
    },
  );

  if (createNoteResponse.status !== 201 || !createdNote?.id) {
    fail('Student note creation failed.', JSON.stringify(createdNote, null, 2));
  }
  cleanupState.noteIds.push(createdNote.id);

  const { response: updateNoteResponse, body: updatedNote } = await requestJson(
    `${BASE_URL}/students-guardians/students/${primaryStudent.id}/notes/${createdNote.id}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        category: 'academic',
        note: 'Sprint 2B updated note',
      }),
    },
  );

  if (
    updateNoteResponse.status !== 200 ||
    updatedNote?.note !== 'Sprint 2B updated note' ||
    updatedNote?.category !== 'academic'
  ) {
    fail('Student note update failed.', JSON.stringify(updatedNote, null, 2));
  }
  pass('Student note create/update succeeded.');

  const { response: timelineResponse, body: timelineBody } = await requestJson(
    `${BASE_URL}/students-guardians/students/${primaryStudent.id}/timeline`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  const allowedTimelineEventTypes = new Set([
    'student_created',
    'guardian_linked',
    'enrollment_created',
    'document_linked',
    'medical_profile_created',
    'medical_profile_updated',
    'note_added',
  ]);

  if (
    timelineResponse.status !== 200 ||
    !Array.isArray(timelineBody) ||
    !timelineBody.every((event) => allowedTimelineEventTypes.has(event.type))
  ) {
    fail(
      'Timeline response was not bounded as expected.',
      JSON.stringify(timelineBody, null, 2),
    );
  }
  pass(`Fetched bounded timeline with ${timelineBody.length} events.`);

  const downloadResponse = await fetch(
    `${BASE_URL}/files/${uploadedFile.id}/download`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      redirect: 'manual',
    },
  );

  if (
    downloadResponse.status !== 307 ||
    !/^https?:\/\//.test(downloadResponse.headers.get('location') || '')
  ) {
    fail('Secure file download flow failed.');
  }
  pass('Secure file download returned a signed redirect.');

  header('Lifecycle transitions');

  const transferResponse = await fetch(
    `${BASE_URL}/students-guardians/enrollments/transfer`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        studentId: primaryStudent.id,
        targetSectionId: structure.sectionB.id,
        targetClassroomId: structure.classroomB.id,
        effectiveDate: '2026-10-01',
        reason: 'Capacity balancing',
        notes: 'Sprint 2B transfer demo',
      }),
    },
  );
  const transferredEnrollment = await transferResponse.json();

  if (
    transferResponse.status !== 200 ||
    transferredEnrollment?.actionType !== 'transferred_internal' ||
    transferredEnrollment?.toClassroomId !== structure.classroomB.id
  ) {
    fail(
      'Transfer flow failed.',
      JSON.stringify(transferredEnrollment, null, 2),
    );
  }

  const currentAfterTransfer = await getCurrentEnrollment(
    accessToken,
    primaryStudent.id,
  );
  if (currentAfterTransfer?.classroomId !== structure.classroomB.id) {
    fail(
      'Transferred enrollment did not persist.',
      JSON.stringify(currentAfterTransfer, null, 2),
    );
  }
  pass('Transfer flow persisted correctly.');

  const withdrawalStudent = await createStudent(
    accessToken,
    `Sprint 2B Withdrawal Student ${suffix}`,
  );
  const withdrawalEnrollment = await createEnrollment(accessToken, {
    studentId: withdrawalStudent.id,
    academicYearId: structure.yearOne.id,
    classroomId: structure.classroomA.id,
    enrollmentDate: '2026-09-01',
  });

  const withdrawResponse = await fetch(
    `${BASE_URL}/students-guardians/enrollments/withdraw`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        studentId: withdrawalStudent.id,
        effectiveDate: '2026-11-01',
        reason: 'Family relocation',
        notes: 'Sprint 2B withdrawal demo',
        actionType: 'withdrawn',
      }),
    },
  );
  const withdrawnEnrollment = await withdrawResponse.json();

  if (
    withdrawResponse.status !== 200 ||
    withdrawnEnrollment?.actionType !== 'withdrawn' ||
    withdrawnEnrollment?.id !== withdrawalEnrollment.enrollmentId
  ) {
    fail(
      'Withdrawal flow failed.',
      JSON.stringify(withdrawnEnrollment, null, 2),
    );
  }

  const currentAfterWithdrawal = await getCurrentEnrollment(
    accessToken,
    withdrawalStudent.id,
  );
  if (currentAfterWithdrawal !== null) {
    fail(
      'Withdrawn student still has an active enrollment.',
      JSON.stringify(currentAfterWithdrawal, null, 2),
    );
  }

  const persistedWithdrawal = await prisma.enrollment.findUnique({
    where: { id: withdrawalEnrollment.enrollmentId },
    select: { status: true, endedAt: true },
  });

  if (
    persistedWithdrawal?.status !== StudentEnrollmentStatus.WITHDRAWN ||
    !persistedWithdrawal?.endedAt
  ) {
    fail(
      'Withdrawal persistence check failed.',
      JSON.stringify(persistedWithdrawal, null, 2),
    );
  }
  pass('Withdrawal flow persisted correctly.');

  const promotionStudent = await createStudent(
    accessToken,
    `Sprint 2B Promotion Student ${suffix}`,
  );
  await createEnrollment(accessToken, {
    studentId: promotionStudent.id,
    academicYearId: structure.yearOne.id,
    classroomId: structure.classroomA.id,
    enrollmentDate: '2026-09-01',
  });

  await activatePromotionYear(structure.yearOne.id, structure.yearTwo.id);

  const promoteResponse = await fetch(
    `${BASE_URL}/students-guardians/enrollments/promote`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        studentId: promotionStudent.id,
        targetAcademicYear: structure.yearTwo.nameEn,
        effectiveDate: '2027-09-01',
        notes: 'Sprint 2B promotion demo',
      }),
    },
  );
  const promotedEnrollment = await promoteResponse.json();

  if (
    promoteResponse.status !== 200 ||
    promotedEnrollment?.actionType !== 'promoted' ||
    promotedEnrollment?.academicYear !== structure.yearTwo.nameEn ||
    promotedEnrollment?.toClassroomId !== structure.promotedClassroom.id
  ) {
    fail('Promotion flow failed.', JSON.stringify(promotedEnrollment, null, 2));
  }

  const currentAfterPromotion = await getCurrentEnrollment(
    accessToken,
    promotionStudent.id,
  );
  if (
    currentAfterPromotion?.academicYearId !== structure.yearTwo.id ||
    currentAfterPromotion?.classroomId !== structure.promotedClassroom.id
  ) {
    fail(
      'Promotion persistence check failed.',
      JSON.stringify(currentAfterPromotion, null, 2),
    );
  }
  pass('Promotion flow persisted correctly.');

  const lifecycleAuditLogs = await prisma.auditLog.findMany({
    where: {
      schoolId: demoContext.schoolId,
      action: {
        in: [
          'students.enrollment.create',
          'students.enrollment.transfer',
          'students.enrollment.withdraw',
          'students.enrollment.promote',
        ],
      },
      resourceId: {
        in: [
          primaryEnrollment.enrollmentId,
          transferredEnrollment.id,
          withdrawalEnrollment.enrollmentId,
          promotedEnrollment.id,
        ],
      },
    },
    select: { action: true, resourceId: true },
  });

  const lifecycleAuditActions = new Set(
    lifecycleAuditLogs.map((auditLog) => auditLog.action),
  );
  if (
    !lifecycleAuditActions.has('students.enrollment.create') ||
    !lifecycleAuditActions.has('students.enrollment.transfer') ||
    !lifecycleAuditActions.has('students.enrollment.withdraw') ||
    !lifecycleAuditActions.has('students.enrollment.promote')
  ) {
    fail(
      'Expected lifecycle audit logs were not written.',
      JSON.stringify(lifecycleAuditLogs, null, 2),
    );
  }
  pass('Lifecycle audit entries were recorded.');

  const outOfScopeDomainSnapshotAfter = await getOutOfScopeDomainSnapshot();
  expectEqual(
    outOfScopeDomainSnapshotAfter,
    outOfScopeDomainSnapshotBefore,
    'Attendance/grades/reinforcement side effects were detected.',
  );
  pass(
    `No attendance/grades/reinforcement side effects detected across ${Math.max(
      OUT_OF_SCOPE_TABLES.length,
      1,
    )} monitored tables.`,
  );

  console.log('');
  pass('Sprint 2B students demo checks passed.');
}

async function cleanup() {
  if (createdPromotionAcademicYearId && originalAcademicYearId) {
    await prisma.academicYear.updateMany({
      where: { id: createdPromotionAcademicYearId },
      data: { isActive: false },
    });
    await prisma.academicYear.updateMany({
      where: { id: originalAcademicYearId },
      data: { isActive: originalAcademicYearWasActive },
    });
  }

  const studentIds = [...new Set(cleanupState.studentIds)];

  if (studentIds.length > 0) {
    const enrollmentIds = (
      await prisma.enrollment.findMany({
        where: { studentId: { in: studentIds } },
        select: { id: true },
      })
    ).map((enrollment) => enrollment.id);

    if (enrollmentIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: {
          action: {
            in: [
              'students.enrollment.create',
              'students.enrollment.transfer',
              'students.enrollment.withdraw',
              'students.enrollment.promote',
            ],
          },
          resourceId: { in: enrollmentIds },
        },
      });
    }
  }

  if (cleanupState.noteIds.length > 0) {
    await prisma.studentNote.deleteMany({
      where: { id: { in: [...new Set(cleanupState.noteIds)] } },
    });
  }

  if (cleanupState.medicalProfileIds.length > 0) {
    await prisma.studentMedicalProfile.deleteMany({
      where: { id: { in: [...new Set(cleanupState.medicalProfileIds)] } },
    });
  }

  if (cleanupState.documentIds.length > 0) {
    await prisma.studentDocument.deleteMany({
      where: { id: { in: [...new Set(cleanupState.documentIds)] } },
    });
  }

  if (studentIds.length > 0 || cleanupState.guardianIds.length > 0) {
    await prisma.studentGuardian.deleteMany({
      where: {
        OR: [
          ...(studentIds.length > 0 ? [{ studentId: { in: studentIds } }] : []),
          ...(cleanupState.guardianIds.length > 0
            ? [{ guardianId: { in: [...new Set(cleanupState.guardianIds)] } }]
            : []),
        ],
      },
    });
  }

  if (studentIds.length > 0) {
    await prisma.enrollment.deleteMany({
      where: { studentId: { in: studentIds } },
    });
  }

  if (cleanupState.guardianIds.length > 0) {
    await prisma.guardian.deleteMany({
      where: { id: { in: [...new Set(cleanupState.guardianIds)] } },
    });
  }

  if (studentIds.length > 0) {
    await prisma.student.deleteMany({
      where: { id: { in: studentIds } },
    });
  }

  if (cleanupState.fileIds.length > 0) {
    await prisma.file.deleteMany({
      where: { id: { in: [...new Set(cleanupState.fileIds)] } },
    });
  }

  if (cleanupState.classroomIds.length > 0) {
    await prisma.classroom.deleteMany({
      where: { id: { in: [...new Set(cleanupState.classroomIds)] } },
    });
  }

  if (cleanupState.sectionIds.length > 0) {
    await prisma.section.deleteMany({
      where: { id: { in: [...new Set(cleanupState.sectionIds)] } },
    });
  }

  if (cleanupState.gradeIds.length > 0) {
    await prisma.grade.deleteMany({
      where: { id: { in: [...new Set(cleanupState.gradeIds)] } },
    });
  }

  if (cleanupState.stageIds.length > 0) {
    await prisma.stage.deleteMany({
      where: { id: { in: [...new Set(cleanupState.stageIds)] } },
    });
  }

  if (cleanupState.academicYearIds.length > 0) {
    await prisma.academicYear.deleteMany({
      where: { id: { in: [...new Set(cleanupState.academicYearIds)] } },
    });
  }

  const minio = createMinioClient();
  for (const object of cleanupState.storageObjects) {
    try {
      await minio.removeObject(object.bucket, object.objectKey);
    } catch {
      // Best-effort cleanup for local demo runs.
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
