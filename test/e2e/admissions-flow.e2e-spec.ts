import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AdmissionApplicationStatus,
  AuditOutcome,
  PrismaClient,
} from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { StorageService } from '../../src/infrastructure/storage/storage.service';

const GLOBAL_PREFIX = '/api/v1';

const DEMO_ADMIN_EMAIL = 'admin@academy.moazez.dev';
const DEMO_ADMIN_PASSWORD = 'School123!';
const DEMO_SCHOOL_SLUG = 'moazez-academy';
const STUDENT_LIFECYCLE_TABLES = [
  'students',
  'guardians',
  'enrollments',
  'student_guardians',
] as const;

type StudentLifecycleTableName = (typeof STUDENT_LIFECYCLE_TABLES)[number];
type StoredObjectRef = { bucket: string; objectKey: string };
type StudentLifecycleSnapshot = {
  existingTables: StudentLifecycleTableName[];
  rowCounts: Partial<Record<StudentLifecycleTableName, number>>;
};

jest.setTimeout(30000);

describe('Admissions Sprint 2A closeout flow (e2e)', () => {
  let phoneSequence = 10_000_000;
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let storageService: StorageService;

  let demoAdminUserId: string;
  let demoSchoolId: string;
  let demoAcademicYearId: string;
  let demoAcademicYearName: string;
  let demoGradeId: string;
  let demoGradeName: string;

  const cleanupState = {
    leadIds: new Set<string>(),
    applicationIds: new Set<string>(),
    fileIds: new Set<string>(),
    documentIds: new Set<string>(),
    placementTestIds: new Set<string>(),
    interviewIds: new Set<string>(),
    decisionIds: new Set<string>(),
    storageObjects: [] as StoredObjectRef[],
  };

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const demoSchool = await prisma.school.findFirst({
      where: { slug: DEMO_SCHOOL_SLUG },
      select: { id: true },
    });
    if (!demoSchool) {
      throw new Error('Demo school not found - run `npm run seed` first.');
    }
    demoSchoolId = demoSchool.id;

    const [demoAdmin, academicYear, grade] = await Promise.all([
      prisma.user.findUnique({
        where: { email: DEMO_ADMIN_EMAIL },
        select: { id: true },
      }),
      prisma.academicYear.findFirst({
        where: {
          schoolId: demoSchoolId,
          isActive: true,
          deletedAt: null,
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true, nameEn: true },
      }),
      prisma.grade.findFirst({
        where: {
          schoolId: demoSchoolId,
          deletedAt: null,
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true, nameEn: true },
      }),
    ]);

    if (!demoAdmin) {
      throw new Error(
        'Demo school admin not found - run `npm run seed` first.',
      );
    }
    demoAdminUserId = demoAdmin.id;

    if (!academicYear) {
      throw new Error(
        'Demo academic year not found - run `npm run seed` first.',
      );
    }
    demoAcademicYearId = academicYear.id;
    demoAcademicYearName = academicYear.nameEn;

    if (!grade) {
      throw new Error('Demo grade not found - run `npm run seed` first.');
    }
    demoGradeId = grade.id;
    demoGradeName = grade.nameEn;

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(GLOBAL_PREFIX.replace(/^\//, ''));
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    storageService = app.get(StorageService);
  });

  afterAll(async () => {
    const decisionIds = [...cleanupState.decisionIds];
    const interviewIds = [...cleanupState.interviewIds];
    const placementTestIds = [...cleanupState.placementTestIds];
    const documentIds = [...cleanupState.documentIds];
    const fileIds = [...cleanupState.fileIds];
    const applicationIds = [...cleanupState.applicationIds];
    const leadIds = [...cleanupState.leadIds];

    if (decisionIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: {
          action: 'admissions.application.decision',
          resourceId: { in: decisionIds },
        },
      });
      await prisma.admissionDecision.deleteMany({
        where: { id: { in: decisionIds } },
      });
    }

    if (interviewIds.length > 0) {
      await prisma.interview.deleteMany({
        where: { id: { in: interviewIds } },
      });
    }

    if (placementTestIds.length > 0) {
      await prisma.placementTest.deleteMany({
        where: { id: { in: placementTestIds } },
      });
    }

    if (documentIds.length > 0) {
      await prisma.applicationDocument.deleteMany({
        where: { id: { in: documentIds } },
      });
    }

    if (fileIds.length > 0) {
      await prisma.file.deleteMany({ where: { id: { in: fileIds } } });
    }

    if (applicationIds.length > 0) {
      await prisma.application.deleteMany({
        where: { id: { in: applicationIds } },
      });
    }

    if (leadIds.length > 0) {
      await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
    }

    for (const object of cleanupState.storageObjects) {
      try {
        await storageService.deleteObject(object);
      } catch {
        // Cleanup is best-effort for local e2e runs.
      }
    }

    if (app) {
      await app.close();
    }

    if (prisma) {
      await prisma.$disconnect();
    }
  });

  async function login(): Promise<{ accessToken: string }> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email: DEMO_ADMIN_EMAIL, password: DEMO_ADMIN_PASSWORD })
      .expect(200);

    return { accessToken: response.body.accessToken };
  }

  function nextUniqueSuffix(): string {
    return randomUUID().split('-')[0];
  }

  function nextPhone(): string {
    phoneSequence += 1;
    return `+2010${String(phoneSequence).padStart(8, '0')}`;
  }

  async function registerStoredFile(fileId: string): Promise<{
    bucket: string;
    objectKey: string;
  }> {
    const storedFile = await prisma.file.findUnique({
      where: { id: fileId },
      select: { bucket: true, objectKey: true },
    });

    if (!storedFile) {
      throw new Error(`Uploaded file ${fileId} was not persisted.`);
    }

    cleanupState.fileIds.add(fileId);
    cleanupState.storageObjects.push({
      bucket: storedFile.bucket,
      objectKey: storedFile.objectKey,
    });

    return storedFile;
  }

  async function createLead(accessToken: string, label: string) {
    const suffix = nextUniqueSuffix();
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/admissions/leads`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        studentName: `${label} Student ${suffix}`,
        primaryContactName: `${label} Parent ${suffix}`,
        phone: nextPhone(),
        email: `${label.toLowerCase().replace(/\s+/g, '.')}.${suffix}@example.com`,
        channel: 'Referral',
        notes: `${label} notes`,
      })
      .expect(201);

    cleanupState.leadIds.add(response.body.id);
    return response.body;
  }

  async function createApplication(
    accessToken: string,
    params: {
      leadId: string;
      studentName: string;
    },
  ) {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/admissions/applications`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        leadId: params.leadId,
        studentName: params.studentName,
        requestedAcademicYearId: demoAcademicYearId,
        requestedGradeId: demoGradeId,
        source: 'referral',
      })
      .expect(201);

    cleanupState.applicationIds.add(response.body.id);
    return response.body;
  }

  async function uploadAdmissionsFile(accessToken: string, label: string) {
    const suffix = nextUniqueSuffix();
    const fileBody = `${label} admissions document ${suffix}`;
    const fileName = `${label.toLowerCase().replace(/\s+/g, '-')}-${suffix}.pdf`;

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/files`)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', Buffer.from(fileBody), {
        filename: fileName,
        contentType: 'application/pdf',
      })
      .expect(201);

    await registerStoredFile(response.body.id);

    return {
      ...response.body,
      originalName: fileName,
      mimeType: 'application/pdf',
      sizeBytes: String(Buffer.byteLength(fileBody)),
    };
  }

  async function attachDocument(
    accessToken: string,
    applicationId: string,
    fileId: string,
  ) {
    const response = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/admissions/applications/${applicationId}/documents`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        fileId,
        documentType: 'birth_certificate',
        notes: 'Uploaded by admissions admin',
      })
      .expect(201);

    cleanupState.documentIds.add(response.body.id);
    return response.body;
  }

  async function submitApplication(accessToken: string, applicationId: string) {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/admissions/applications/${applicationId}/submit`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    return response.body;
  }

  async function createSubmittedApplication(
    accessToken: string,
    label: string,
  ) {
    const lead = await createLead(accessToken, label);
    const application = await createApplication(accessToken, {
      leadId: lead.id,
      studentName: lead.studentName,
    });
    const uploadedFile = await uploadAdmissionsFile(accessToken, label);
    const document = await attachDocument(
      accessToken,
      application.id,
      uploadedFile.id,
    );
    const submittedApplication = await submitApplication(
      accessToken,
      application.id,
    );

    return {
      lead,
      application,
      uploadedFile,
      document,
      submittedApplication,
    };
  }

  async function createPlacementTest(
    accessToken: string,
    applicationId: string,
    scheduledAt: string,
  ) {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/admissions/tests`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        applicationId,
        type: 'Placement',
        scheduledAt,
      })
      .expect(201);

    cleanupState.placementTestIds.add(response.body.id);
    return response.body;
  }

  async function updatePlacementTest(
    accessToken: string,
    placementTestId: string,
    body: Record<string, unknown>,
  ) {
    const response = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/admissions/tests/${placementTestId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(body)
      .expect(200);

    return response.body;
  }

  async function createInterview(
    accessToken: string,
    applicationId: string,
    scheduledAt: string,
    notes: string,
  ) {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/admissions/interviews`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        applicationId,
        scheduledAt,
        interviewerUserId: demoAdminUserId,
        notes,
      })
      .expect(201);

    cleanupState.interviewIds.add(response.body.id);
    return response.body;
  }

  async function updateInterview(
    accessToken: string,
    interviewId: string,
    body: Record<string, unknown>,
  ) {
    const response = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/admissions/interviews/${interviewId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(body)
      .expect(200);

    return response.body;
  }

  async function createDecision(
    accessToken: string,
    applicationId: string,
    decision: 'accept' | 'waitlist' | 'reject',
    reason: string,
    expectedStatus = 201,
  ) {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/admissions/decisions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        applicationId,
        decision,
        reason,
      })
      .expect(expectedStatus);

    if (expectedStatus === 201) {
      cleanupState.decisionIds.add(response.body.id);
    }

    return response;
  }

  async function createDecisionReadyApplication(
    accessToken: string,
    label: string,
  ) {
    const intake = await createSubmittedApplication(accessToken, label);
    const placementTest = await createPlacementTest(
      accessToken,
      intake.submittedApplication.id,
      '2026-04-26T10:00:00.000Z',
    );
    const completedPlacementTest = await updatePlacementTest(
      accessToken,
      placementTest.id,
      {
        status: 'completed',
        score: 0,
        result: 'Completed with a zero score edge case',
      },
    );
    const interview = await createInterview(
      accessToken,
      intake.submittedApplication.id,
      '2026-04-27T11:00:00.000Z',
      'Initial parent meeting',
    );
    const completedInterview = await updateInterview(
      accessToken,
      interview.id,
      {
        status: 'completed',
        notes: 'Family interview completed successfully',
      },
    );

    return {
      ...intake,
      placementTest,
      completedPlacementTest,
      interview,
      completedInterview,
    };
  }

  async function getStudentLifecycleSnapshot(): Promise<StudentLifecycleSnapshot> {
    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('students', 'guardians', 'enrollments', 'student_guardians')
      ORDER BY table_name
    `;

    const existingTables = tables.map(
      (row) => row.table_name as StudentLifecycleTableName,
    );
    const rowCounts: Partial<Record<StudentLifecycleTableName, number>> = {};

    for (const table of existingTables) {
      let result: Array<{ count: number }>;

      switch (table) {
        case 'students':
          result = await prisma.$queryRaw<Array<{ count: number }>>`
            SELECT COUNT(*)::int AS count FROM public.students
          `;
          rowCounts.students = Number(result[0]?.count ?? 0);
          break;
        case 'guardians':
          result = await prisma.$queryRaw<Array<{ count: number }>>`
            SELECT COUNT(*)::int AS count FROM public.guardians
          `;
          rowCounts.guardians = Number(result[0]?.count ?? 0);
          break;
        case 'enrollments':
          result = await prisma.$queryRaw<Array<{ count: number }>>`
            SELECT COUNT(*)::int AS count FROM public.enrollments
          `;
          rowCounts.enrollments = Number(result[0]?.count ?? 0);
          break;
        case 'student_guardians':
          result = await prisma.$queryRaw<Array<{ count: number }>>`
            SELECT COUNT(*)::int AS count FROM public.student_guardians
          `;
          rowCounts.student_guardians = Number(result[0]?.count ?? 0);
          break;
      }
    }

    return { existingTables, rowCounts };
  }

  function expectNoStudentLifecycleSideEffects(
    before: StudentLifecycleSnapshot,
    after: StudentLifecycleSnapshot,
  ): void {
    expect(after.existingTables).toEqual(before.existingTables);
    expect(after.rowCounts).toEqual(before.rowCounts);
  }

  it('covers the admissions intake flow from login through application submission', async () => {
    const { accessToken } = await login();
    const lead = await createLead(accessToken, 'Sprint2A Intake');

    expect(lead).toEqual({
      id: expect.any(String),
      studentName: expect.stringContaining('Sprint2A Intake Student'),
      primaryContactName: expect.stringContaining('Sprint2A Intake Parent'),
      phone: expect.stringMatching(/^\+2010\d+$/),
      email: expect.stringContaining('@example.com'),
      channel: 'Referral',
      status: 'New',
      notes: 'Sprint2A Intake notes',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    const listedLeads = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/admissions/leads`)
      .query({ status: 'New', channel: 'Referral' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(listedLeads.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: lead.id,
          studentName: lead.studentName,
          primaryContactName: lead.primaryContactName,
          channel: 'Referral',
          status: 'New',
        }),
      ]),
    );

    const fetchedLead = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/admissions/leads/${lead.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(fetchedLead.body).toEqual(lead);

    const application = await createApplication(accessToken, {
      leadId: lead.id,
      studentName: lead.studentName,
    });

    expect(application).toEqual({
      id: expect.any(String),
      leadId: lead.id,
      studentName: lead.studentName,
      requestedAcademicYearId: demoAcademicYearId,
      requestedGradeId: demoGradeId,
      source: 'referral',
      status: 'documents_pending',
      submittedAt: null,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    const listedApplications = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/admissions/applications`)
      .query({ status: 'documents_pending' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(listedApplications.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: application.id,
          leadId: lead.id,
          studentName: lead.studentName,
          requestedAcademicYearId: demoAcademicYearId,
          requestedGradeId: demoGradeId,
          source: 'referral',
          status: 'documents_pending',
        }),
      ]),
    );

    const fetchedApplication = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/admissions/applications/${application.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(fetchedApplication.body).toEqual(application);

    const uploadedFile = await uploadAdmissionsFile(
      accessToken,
      'Sprint2A Intake',
    );
    const document = await attachDocument(
      accessToken,
      application.id,
      uploadedFile.id,
    );

    expect(document).toEqual({
      id: expect.any(String),
      applicationId: application.id,
      fileId: uploadedFile.id,
      documentType: 'birth_certificate',
      status: 'complete',
      notes: 'Uploaded by admissions admin',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      file: {
        id: uploadedFile.id,
        originalName: uploadedFile.originalName,
        mimeType: 'application/pdf',
        sizeBytes: uploadedFile.sizeBytes,
        visibility: 'PRIVATE',
      },
    });

    const listedDocuments = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/admissions/applications/${application.id}/documents`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(listedDocuments.body).toEqual([
      {
        id: document.id,
        applicationId: application.id,
        fileId: uploadedFile.id,
        documentType: 'birth_certificate',
        status: 'complete',
        notes: 'Uploaded by admissions admin',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        file: {
          id: uploadedFile.id,
          originalName: uploadedFile.originalName,
          mimeType: 'application/pdf',
          sizeBytes: uploadedFile.sizeBytes,
          visibility: 'PRIVATE',
        },
      },
    ]);

    const submittedApplication = await submitApplication(
      accessToken,
      application.id,
    );
    expect(submittedApplication).toEqual({
      id: application.id,
      leadId: lead.id,
      studentName: lead.studentName,
      requestedAcademicYearId: demoAcademicYearId,
      requestedGradeId: demoGradeId,
      source: 'referral',
      status: 'submitted',
      submittedAt: expect.any(String),
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  it('covers the admissions evaluation flow including prerequisite and duplicate decision failures', async () => {
    const { accessToken } = await login();

    const incompleteApplication = await createSubmittedApplication(
      accessToken,
      'Sprint2A Evaluation Prereq',
    );
    const prerequisiteDecisionResponse = await createDecision(
      accessToken,
      incompleteApplication.submittedApplication.id,
      'accept',
      'Should fail before tests and interviews',
      422,
    );

    expect(prerequisiteDecisionResponse.body?.error?.code).toBe(
      'admissions.decision.requires_all_steps',
    );

    const evaluationFlow = await createDecisionReadyApplication(
      accessToken,
      'Sprint2A Evaluation',
    );

    expect(evaluationFlow.placementTest).toEqual({
      id: expect.any(String),
      applicationId: evaluationFlow.submittedApplication.id,
      studentName: evaluationFlow.lead.studentName,
      subjectId: null,
      subjectName: null,
      type: 'Placement',
      scheduledAt: '2026-04-26T10:00:00.000Z',
      score: null,
      result: null,
      status: 'scheduled',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    const listedPlacementTests = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/admissions/tests`)
      .query({ search: evaluationFlow.lead.studentName })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(listedPlacementTests.body).toEqual({
      items: [
        expect.objectContaining({
          id: evaluationFlow.placementTest.id,
          applicationId: evaluationFlow.submittedApplication.id,
          studentName: evaluationFlow.lead.studentName,
          status: 'completed',
          score: 0,
        }),
      ],
      pagination: expect.objectContaining({
        page: 1,
        limit: 20,
        total: expect.any(Number),
      }),
    });

    expect(evaluationFlow.completedPlacementTest).toEqual({
      id: evaluationFlow.placementTest.id,
      applicationId: evaluationFlow.submittedApplication.id,
      studentName: evaluationFlow.lead.studentName,
      subjectId: null,
      subjectName: null,
      type: 'Placement',
      scheduledAt: '2026-04-26T10:00:00.000Z',
      score: 0,
      result: 'Completed with a zero score edge case',
      status: 'completed',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    const fetchedPlacementTest = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/admissions/tests/${evaluationFlow.placementTest.id}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(fetchedPlacementTest.body).toEqual(
      evaluationFlow.completedPlacementTest,
    );

    expect(evaluationFlow.interview).toEqual({
      id: expect.any(String),
      applicationId: evaluationFlow.submittedApplication.id,
      studentName: evaluationFlow.lead.studentName,
      scheduledAt: '2026-04-27T11:00:00.000Z',
      interviewerUserId: demoAdminUserId,
      interviewerName: expect.any(String),
      status: 'scheduled',
      notes: 'Initial parent meeting',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    const listedInterviews = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/admissions/interviews`)
      .query({ search: evaluationFlow.lead.studentName })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(listedInterviews.body).toEqual({
      items: [
        expect.objectContaining({
          id: evaluationFlow.interview.id,
          applicationId: evaluationFlow.submittedApplication.id,
          studentName: evaluationFlow.lead.studentName,
          status: 'completed',
        }),
      ],
      pagination: expect.objectContaining({
        page: 1,
        limit: 20,
        total: expect.any(Number),
      }),
    });

    expect(evaluationFlow.completedInterview).toEqual({
      id: evaluationFlow.interview.id,
      applicationId: evaluationFlow.submittedApplication.id,
      studentName: evaluationFlow.lead.studentName,
      scheduledAt: '2026-04-27T11:00:00.000Z',
      interviewerUserId: demoAdminUserId,
      interviewerName: expect.any(String),
      status: 'completed',
      notes: 'Family interview completed successfully',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    const fetchedInterview = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/admissions/interviews/${evaluationFlow.interview.id}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(fetchedInterview.body).toEqual(evaluationFlow.completedInterview);

    const decisionResponse = await createDecision(
      accessToken,
      evaluationFlow.submittedApplication.id,
      'accept',
      'Passed assessment and interview',
    );

    expect(decisionResponse.body).toEqual({
      id: expect.any(String),
      applicationId: evaluationFlow.submittedApplication.id,
      studentName: evaluationFlow.lead.studentName,
      decision: 'accept',
      reason: 'Passed assessment and interview',
      decidedByUserId: demoAdminUserId,
      decidedByName: expect.any(String),
      decidedAt: expect.any(String),
      applicationStatus: 'accepted',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    const listedDecisions = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/admissions/decisions`)
      .query({ search: evaluationFlow.lead.studentName })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(listedDecisions.body).toEqual({
      items: [
        expect.objectContaining({
          id: decisionResponse.body.id,
          applicationId: evaluationFlow.submittedApplication.id,
          studentName: evaluationFlow.lead.studentName,
          decision: 'accept',
          applicationStatus: 'accepted',
        }),
      ],
      pagination: expect.objectContaining({
        page: 1,
        limit: 20,
        total: expect.any(Number),
      }),
    });

    const getDecisionResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/admissions/decisions/${decisionResponse.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(getDecisionResponse.body).toEqual({
      id: decisionResponse.body.id,
      applicationId: evaluationFlow.submittedApplication.id,
      studentName: evaluationFlow.lead.studentName,
      decision: 'accept',
      reason: 'Passed assessment and interview',
      decidedByUserId: demoAdminUserId,
      decidedByName: expect.any(String),
      decidedAt: expect.any(String),
      applicationStatus: 'accepted',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    const duplicateDecisionResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/admissions/decisions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        applicationId: evaluationFlow.submittedApplication.id,
        decision: 'accept',
      })
      .expect(409);

    expect(duplicateDecisionResponse.body?.error?.code).toBe(
      'admissions.application.already_decided',
    );

    const persistedApplication = await prisma.application.findUnique({
      where: { id: evaluationFlow.submittedApplication.id },
      select: {
        id: true,
        status: true,
        submittedAt: true,
      },
    });

    expect(persistedApplication).toEqual({
      id: evaluationFlow.submittedApplication.id,
      status: AdmissionApplicationStatus.ACCEPTED,
      submittedAt: expect.any(Date),
    });

    const decisionAuditLog = await prisma.auditLog.findFirst({
      where: {
        action: 'admissions.application.decision',
        resourceId: decisionResponse.body.id,
      },
      select: {
        actorId: true,
        schoolId: true,
        module: true,
        action: true,
        resourceType: true,
        outcome: true,
      },
    });

    expect(decisionAuditLog).toEqual({
      actorId: demoAdminUserId,
      schoolId: expect.any(String),
      module: 'admissions',
      action: 'admissions.application.decision',
      resourceType: 'admission_decision',
      outcome: AuditOutcome.SUCCESS,
    });
  });

  it('covers the enroll handoff preview flow for accepted and non-accepted applications without student lifecycle side effects', async () => {
    const { accessToken } = await login();
    const beforeSnapshot = await getStudentLifecycleSnapshot();

    const acceptedFlow = await createDecisionReadyApplication(
      accessToken,
      'Sprint2A Handoff Accepted',
    );
    const acceptedDecision = await createDecision(
      accessToken,
      acceptedFlow.submittedApplication.id,
      'accept',
      'Accepted for enrollment handoff preview',
    );

    const acceptedHandoffResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/admissions/applications/${acceptedFlow.submittedApplication.id}/enroll`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(acceptedHandoffResponse.body).toEqual({
      applicationId: acceptedFlow.submittedApplication.id,
      eligible: true,
      handoff: {
        studentDraft: {
          fullName: acceptedFlow.lead.studentName,
        },
        guardianDrafts: [],
        enrollmentDraft: {
          requestedAcademicYearId: demoAcademicYearId,
          requestedAcademicYearName: demoAcademicYearName,
          requestedGradeId: demoGradeId,
          requestedGradeName: demoGradeName,
        },
      },
    });

    expect(acceptedDecision.body.applicationStatus).toBe('accepted');

    const nonAcceptedFlow = await createDecisionReadyApplication(
      accessToken,
      'Sprint2A Handoff Waitlist',
    );
    const waitlistDecision = await createDecision(
      accessToken,
      nonAcceptedFlow.submittedApplication.id,
      'waitlist',
      'Waiting list preview',
    );

    expect(waitlistDecision.body.applicationStatus).toBe('waitlisted');

    const rejectedHandoffResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/admissions/applications/${nonAcceptedFlow.submittedApplication.id}/enroll`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(409);

    expect(rejectedHandoffResponse.body?.error?.code).toBe(
      'admissions.application.not_accepted',
    );

    const afterSnapshot = await getStudentLifecycleSnapshot();
    expectNoStudentLifecycleSideEffects(beforeSnapshot, afterSnapshot);
  });
});
