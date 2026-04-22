import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AdmissionApplicationStatus,
  PrismaClient,
  StudentEnrollmentStatus,
} from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { StorageService } from '../../src/infrastructure/storage/storage.service';

const GLOBAL_PREFIX = '/api/v1';

const DEMO_ADMIN_EMAIL = 'admin@academy.moazez.dev';
const DEMO_ADMIN_PASSWORD = 'School123!';
const DEMO_SCHOOL_SLUG = 'moazez-academy';

jest.setTimeout(30000);

describe('Students + guardians core flow (e2e)', () => {
  let phoneSequence = 30_000_000;
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let storageService: StorageService;
  let demoSchoolId: string;
  let demoOrganizationId: string;
  let demoAdminUserId: string;

  const cleanupState = {
    studentIds: new Set<string>(),
    guardianIds: new Set<string>(),
    enrollmentIds: new Set<string>(),
    academicYearIds: new Set<string>(),
    stageIds: new Set<string>(),
    gradeIds: new Set<string>(),
    sectionIds: new Set<string>(),
    classroomIds: new Set<string>(),
    leadIds: new Set<string>(),
    applicationIds: new Set<string>(),
    fileIds: new Set<string>(),
    documentIds: new Set<string>(),
    placementTestIds: new Set<string>(),
    interviewIds: new Set<string>(),
    decisionIds: new Set<string>(),
    storageObjects: [] as Array<{ bucket: string; objectKey: string }>,
  };

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const demoSchool = await prisma.school.findFirst({
      where: { slug: DEMO_SCHOOL_SLUG },
      select: { id: true, organizationId: true },
    });

    if (!demoSchool) {
      throw new Error('Demo school not found - run `npm run seed` first.');
    }
    demoSchoolId = demoSchool.id;
    demoOrganizationId = demoSchool.organizationId;

    const demoAdmin = await prisma.user.findUnique({
      where: { email: DEMO_ADMIN_EMAIL },
      select: { id: true },
    });
    if (!demoAdmin) {
      throw new Error('Demo admin not found - run `npm run seed` first.');
    }
    demoAdminUserId = demoAdmin.id;

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
    const studentIds = [...cleanupState.studentIds];
    const guardianIds = [...cleanupState.guardianIds];
    const enrollmentIds = [...cleanupState.enrollmentIds];
    const decisionIds = [...cleanupState.decisionIds];
    const interviewIds = [...cleanupState.interviewIds];
    const placementTestIds = [...cleanupState.placementTestIds];
    const documentIds = [...cleanupState.documentIds];
    const fileIds = [...cleanupState.fileIds];
    const applicationIds = [...cleanupState.applicationIds];
    const leadIds = [...cleanupState.leadIds];
    const classroomIds = [...cleanupState.classroomIds];
    const sectionIds = [...cleanupState.sectionIds];
    const gradeIds = [...cleanupState.gradeIds];
    const stageIds = [...cleanupState.stageIds];
    const academicYearIds = [...cleanupState.academicYearIds];

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
      await prisma.file.deleteMany({
        where: { id: { in: fileIds } },
      });
    }

    if (applicationIds.length > 0) {
      await prisma.application.deleteMany({
        where: { id: { in: applicationIds } },
      });
    }

    if (leadIds.length > 0) {
      await prisma.lead.deleteMany({
        where: { id: { in: leadIds } },
      });
    }

    if (enrollmentIds.length > 0) {
      await prisma.enrollment.deleteMany({
        where: { id: { in: enrollmentIds } },
      });
    }

    if (studentIds.length > 0) {
      await prisma.studentGuardian.deleteMany({
        where: { studentId: { in: studentIds } },
      });
    }

    if (guardianIds.length > 0) {
      await prisma.guardian.deleteMany({
        where: { id: { in: guardianIds } },
      });
    }

    if (studentIds.length > 0) {
      await prisma.student.deleteMany({
        where: { id: { in: studentIds } },
      });
    }

    if (classroomIds.length > 0) {
      await prisma.classroom.deleteMany({
        where: { id: { in: classroomIds } },
      });
    }

    if (sectionIds.length > 0) {
      await prisma.section.deleteMany({
        where: { id: { in: sectionIds } },
      });
    }

    if (gradeIds.length > 0) {
      await prisma.grade.deleteMany({
        where: { id: { in: gradeIds } },
      });
    }

    if (stageIds.length > 0) {
      await prisma.stage.deleteMany({
        where: { id: { in: stageIds } },
      });
    }

    if (academicYearIds.length > 0) {
      await prisma.academicYear.deleteMany({
        where: { id: { in: academicYearIds } },
      });
    }

    for (const object of cleanupState.storageObjects) {
      try {
        await storageService.deleteObject(object);
      } catch {
        // Best-effort cleanup for local e2e runs.
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

  async function registerStoredFile(fileId: string): Promise<void> {
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
  }

  async function createAcademicPlacement(params: {
    label: string;
    isActiveYear: boolean;
  }): Promise<{
    academicYearId: string;
    academicYearName: string;
    gradeId: string;
    sectionId: string;
    classroomId: string;
  }> {
    const suffix = nextUniqueSuffix();

    const academicYear = params.isActiveYear
      ? await prisma.academicYear.findFirst({
          where: {
            schoolId: demoSchoolId,
            isActive: true,
            deletedAt: null,
          },
          orderBy: { createdAt: 'asc' },
          select: { id: true, nameEn: true },
        })
      : null;

    const ensuredAcademicYear =
      academicYear ??
      (await prisma.academicYear.create({
        data: {
          schoolId: demoSchoolId,
          nameAr: `${params.label}-${suffix}-year-ar`,
          nameEn: `${params.label}-${suffix}-year`,
          startDate: new Date('2026-09-01T00:00:00.000Z'),
          endDate: new Date('2027-06-30T00:00:00.000Z'),
          isActive: params.isActiveYear,
        },
        select: { id: true, nameEn: true },
      }));

    if (!academicYear) {
      cleanupState.academicYearIds.add(ensuredAcademicYear.id);
    }

    const stage = await prisma.stage.create({
      data: {
        schoolId: demoSchoolId,
        nameAr: `${params.label}-${suffix}-stage-ar`,
        nameEn: `${params.label}-${suffix}-stage`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    cleanupState.stageIds.add(stage.id);

    const grade = await prisma.grade.create({
      data: {
        schoolId: demoSchoolId,
        stageId: stage.id,
        nameAr: `${params.label}-${suffix}-grade-ar`,
        nameEn: `${params.label}-${suffix}-grade`,
        sortOrder: 1,
        capacity: 24,
      },
      select: { id: true },
    });
    cleanupState.gradeIds.add(grade.id);

    const section = await prisma.section.create({
      data: {
        schoolId: demoSchoolId,
        gradeId: grade.id,
        nameAr: `${params.label}-${suffix}-section-ar`,
        nameEn: `${params.label}-${suffix}-section`,
        sortOrder: 1,
        capacity: 24,
      },
      select: { id: true },
    });
    cleanupState.sectionIds.add(section.id);

    const classroom = await prisma.classroom.create({
      data: {
        schoolId: demoSchoolId,
        sectionId: section.id,
        nameAr: `${params.label}-${suffix}-classroom-ar`,
        nameEn: `${params.label}-${suffix}-classroom`,
        sortOrder: 1,
        capacity: 24,
      },
      select: { id: true },
    });
    cleanupState.classroomIds.add(classroom.id);

    return {
      academicYearId: ensuredAcademicYear.id,
      academicYearName: ensuredAcademicYear.nameEn,
      gradeId: grade.id,
      sectionId: section.id,
      classroomId: classroom.id,
    };
  }

  async function createStudent(
    accessToken: string,
    fullName: string,
  ): Promise<{ id: string }> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/students`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        full_name_en: fullName,
        dateOfBirth: '2015-05-10',
      })
      .expect(201);

    cleanupState.studentIds.add(response.body.id);
    return response.body;
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
      academicYearId: string;
      gradeId: string;
    },
  ) {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/admissions/applications`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        leadId: params.leadId,
        studentName: params.studentName,
        requestedAcademicYearId: params.academicYearId,
        requestedGradeId: params.gradeId,
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
      sizeBytes: String(Buffer.byteLength(fileBody)),
    };
  }

  async function attachDocument(
    accessToken: string,
    applicationId: string,
    fileId: string,
  ) {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/admissions/applications/${applicationId}/documents`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        fileId,
        documentType: 'birth_certificate',
        notes: 'Enrollment e2e document',
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

  async function createPlacementTest(
    accessToken: string,
    applicationId: string,
  ) {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/admissions/tests`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        applicationId,
        type: 'Placement',
        scheduledAt: '2026-04-26T10:00:00.000Z',
      })
      .expect(201);

    cleanupState.placementTestIds.add(response.body.id);
    return response.body;
  }

  async function updatePlacementTest(
    accessToken: string,
    placementTestId: string,
  ) {
    const response = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/admissions/tests/${placementTestId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        status: 'completed',
        score: 85,
        result: 'Ready for enrollment handoff',
      })
      .expect(200);

    return response.body;
  }

  async function createInterview(
    accessToken: string,
    applicationId: string,
  ) {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/admissions/interviews`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        applicationId,
        scheduledAt: '2026-04-27T11:00:00.000Z',
        interviewerUserId: demoAdminUserId,
        notes: 'Enrollment e2e interview',
      })
      .expect(201);

    cleanupState.interviewIds.add(response.body.id);
    return response.body;
  }

  async function updateInterview(accessToken: string, interviewId: string) {
    const response = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/admissions/interviews/${interviewId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        status: 'completed',
        notes: 'Interview completed successfully',
      })
      .expect(200);

    return response.body;
  }

  async function createDecision(
    accessToken: string,
    applicationId: string,
    decision: 'accept' | 'waitlist' | 'reject',
  ) {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/admissions/decisions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        applicationId,
        decision,
        reason: 'Enrollment e2e decision',
      })
      .expect(201);

    cleanupState.decisionIds.add(response.body.id);
    return response.body;
  }

  async function createAcceptedApplicationFlow(
    accessToken: string,
    params: {
      label: string;
      academicYearId: string;
      gradeId: string;
    },
  ) {
    const lead = await createLead(accessToken, params.label);
    const application = await createApplication(accessToken, {
      leadId: lead.id,
      studentName: lead.studentName,
      academicYearId: params.academicYearId,
      gradeId: params.gradeId,
    });
    const uploadedFile = await uploadAdmissionsFile(accessToken, params.label);
    await attachDocument(accessToken, application.id, uploadedFile.id);
    await submitApplication(accessToken, application.id);
    const placementTest = await createPlacementTest(accessToken, application.id);
    await updatePlacementTest(accessToken, placementTest.id);
    const interview = await createInterview(accessToken, application.id);
    await updateInterview(accessToken, interview.id);
    const decision = await createDecision(accessToken, application.id, 'accept');

    return {
      lead,
      application,
      decision,
    };
  }

  it('covers student creation, guardian linking, primary switching, and primary protection without enrollment side effects', async () => {
    const { accessToken } = await login();

    const createStudentResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/students`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        full_name_en: 'Phase Two Student',
        dateOfBirth: '2015-05-10',
      })
      .expect(201);

    const student = createStudentResponse.body;
    cleanupState.studentIds.add(student.id);

    expect(student).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: 'Phase Two Student',
        full_name_en: 'Phase Two Student',
        dateOfBirth: '2015-05-10',
        status: 'Active',
      }),
    );

    const createGuardianAResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/students/guardians`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        full_name: 'Guardian One',
        relation: 'father',
        phone_primary: '+201001110010',
        email: 'guardian.one@example.com',
      })
      .expect(201);

    const guardianA = createGuardianAResponse.body;
    cleanupState.guardianIds.add(guardianA.guardianId);

    const linkGuardianAResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/students/${student.id}/guardians`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        guardianId: guardianA.guardianId,
      })
      .expect(201);

    expect(linkGuardianAResponse.body).toEqual(
      expect.objectContaining({
        guardianId: guardianA.guardianId,
        is_primary: true,
      }),
    );

    const createGuardianBResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/students/guardians`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        full_name: 'Guardian Two',
        relation: 'mother',
        phone_primary: '+201001110011',
        email: 'guardian.two@example.com',
      })
      .expect(201);

    const guardianB = createGuardianBResponse.body;
    cleanupState.guardianIds.add(guardianB.guardianId);

    const linkGuardianBResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/students/${student.id}/guardians`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        guardianId: guardianB.guardianId,
        is_primary: false,
      })
      .expect(201);

    expect(linkGuardianBResponse.body).toEqual(
      expect.objectContaining({
        guardianId: guardianB.guardianId,
        is_primary: false,
      }),
    );

    const promoteGuardianBResponse = await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/students-guardians/students/${student.id}/guardians/${guardianB.guardianId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        is_primary: true,
      })
      .expect(200);

    expect(promoteGuardianBResponse.body).toEqual(
      expect.objectContaining({
        guardianId: guardianB.guardianId,
        is_primary: true,
      }),
    );

    const listedGuardiansResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/students-guardians/students/${student.id}/guardians`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(listedGuardiansResponse.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          guardianId: guardianA.guardianId,
          is_primary: false,
        }),
        expect.objectContaining({
          guardianId: guardianB.guardianId,
          is_primary: true,
        }),
      ]),
    );

    const primaryGuardiansResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/students-guardians/students/${student.id}/guardians/primary`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(primaryGuardiansResponse.body).toEqual([
      expect.objectContaining({
        guardianId: guardianB.guardianId,
        is_primary: true,
      }),
    ]);

    const guardianStudentsResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/students-guardians/students/guardians/${guardianB.guardianId}/students`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(guardianStudentsResponse.body).toEqual({
      guardian: expect.objectContaining({
        guardianId: guardianB.guardianId,
        is_primary: true,
      }),
      students: [
        expect.objectContaining({
          id: student.id,
          full_name_en: 'Phase Two Student',
          status: 'Active',
        }),
      ],
    });

    const primaryProtectionResponse = await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/students-guardians/students/${student.id}/guardians/${guardianB.guardianId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        is_primary: false,
      })
      .expect(422);

    expect(primaryProtectionResponse.body?.error?.code).toBe(
      'students.guardian.primary_required',
    );

    const enrollmentCount = await prisma.enrollment.count({
      where: { studentId: student.id },
    });

    expect(enrollmentCount).toBe(0);
  });

  it('covers enrollment create, handoff-backed create, conflict, inactive year validation, and no transfer side effects', async () => {
    const { accessToken } = await login();

    const activePlacement = await createAcademicPlacement({
      label: 'enrollment-active',
      isActiveYear: true,
    });
    const inactivePlacement = await createAcademicPlacement({
      label: 'enrollment-inactive',
      isActiveYear: false,
    });

    const directStudent = await createStudent(accessToken, 'Enrollment Direct Student');

    const validateDirectResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/enrollments/validate`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        studentId: directStudent.id,
        academicYearId: activePlacement.academicYearId,
        gradeId: activePlacement.gradeId,
        sectionId: activePlacement.sectionId,
        classroomId: activePlacement.classroomId,
        enrollmentDate: '2026-09-01',
      })
      .expect(200);

    expect(validateDirectResponse.body).toEqual({
      valid: true,
      errors: [],
    });

    const directEnrollmentResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/enrollments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        studentId: directStudent.id,
        academicYearId: activePlacement.academicYearId,
        gradeId: activePlacement.gradeId,
        sectionId: activePlacement.sectionId,
        classroomId: activePlacement.classroomId,
        enrollmentDate: '2026-09-01',
      })
      .expect(201);

    cleanupState.enrollmentIds.add(directEnrollmentResponse.body.enrollmentId);

    expect(directEnrollmentResponse.body).toEqual({
      enrollmentId: expect.any(String),
      studentId: directStudent.id,
      academicYear: activePlacement.academicYearName,
      academicYearId: activePlacement.academicYearId,
      grade: expect.stringContaining('enrollment-active'),
      section: expect.stringContaining('enrollment-active'),
      classroom: expect.stringContaining('enrollment-active'),
      gradeId: activePlacement.gradeId,
      sectionId: activePlacement.sectionId,
      classroomId: activePlacement.classroomId,
      enrollmentDate: '2026-09-01',
      status: 'active',
    });

    const persistedDirectEnrollment = await prisma.enrollment.findUnique({
      where: { id: directEnrollmentResponse.body.enrollmentId },
      select: {
        status: true,
        endedAt: true,
        exitReason: true,
      },
    });

    expect(persistedDirectEnrollment).toEqual({
      status: StudentEnrollmentStatus.ACTIVE,
      endedAt: null,
      exitReason: null,
    });

    const getCurrentEnrollmentResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/students-guardians/enrollments/current`)
      .query({ studentId: directStudent.id })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(getCurrentEnrollmentResponse.body).toEqual(
      directEnrollmentResponse.body,
    );

    const getEnrollmentHistoryResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/students-guardians/enrollments/history`)
      .query({ studentId: directStudent.id })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(getEnrollmentHistoryResponse.body).toEqual([
      directEnrollmentResponse.body,
    ]);

    const getEnrollmentByIdResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/students-guardians/enrollments/${directEnrollmentResponse.body.enrollmentId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(getEnrollmentByIdResponse.body).toEqual(directEnrollmentResponse.body);

    const conflictResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/enrollments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        studentId: directStudent.id,
        academicYearId: activePlacement.academicYearId,
        classroomId: activePlacement.classroomId,
        enrollmentDate: '2026-09-02',
      })
      .expect(409);

    expect(conflictResponse.body?.error?.code).toBe(
      'students.enrollment.placement_conflict',
    );

    const inactiveStudent = await createStudent(
      accessToken,
      'Enrollment Inactive Student',
    );

    const inactiveResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/enrollments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        studentId: inactiveStudent.id,
        academicYearId: inactivePlacement.academicYearId,
        classroomId: inactivePlacement.classroomId,
        enrollmentDate: '2026-09-01',
      })
      .expect(422);

    expect(inactiveResponse.body?.error?.code).toBe(
      'students.enrollment.inactive_year',
    );

    const handoffStudent = await createStudent(
      accessToken,
      'Enrollment Handoff Student',
    );

    const acceptedApplication = await createAcceptedApplicationFlow(accessToken, {
      label: 'Enrollment Handoff',
      academicYearId: activePlacement.academicYearId,
      gradeId: activePlacement.gradeId,
    });

    const persistedApplication = await prisma.application.findUnique({
      where: { id: acceptedApplication.application.id },
      select: { status: true },
    });
    expect(persistedApplication?.status).toBe(
      AdmissionApplicationStatus.ACCEPTED,
    );

    const handoffEnrollmentResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/students-guardians/enrollments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        studentId: handoffStudent.id,
        applicationId: acceptedApplication.application.id,
        sectionId: activePlacement.sectionId,
        classroomId: activePlacement.classroomId,
        enrollmentDate: '2026-09-03',
      })
      .expect(201);

    cleanupState.enrollmentIds.add(handoffEnrollmentResponse.body.enrollmentId);

    expect(handoffEnrollmentResponse.body).toEqual({
      enrollmentId: expect.any(String),
      studentId: handoffStudent.id,
      academicYear: activePlacement.academicYearName,
      academicYearId: activePlacement.academicYearId,
      grade: expect.stringContaining('enrollment-active'),
      section: expect.stringContaining('enrollment-active'),
      classroom: expect.stringContaining('enrollment-active'),
      gradeId: activePlacement.gradeId,
      sectionId: activePlacement.sectionId,
      classroomId: activePlacement.classroomId,
      enrollmentDate: '2026-09-03',
      status: 'active',
    });

    const persistedHandoffEnrollment = await prisma.enrollment.findUnique({
      where: { id: handoffEnrollmentResponse.body.enrollmentId },
      select: {
        status: true,
        endedAt: true,
        exitReason: true,
      },
    });

    expect(persistedHandoffEnrollment).toEqual({
      status: StudentEnrollmentStatus.ACTIVE,
      endedAt: null,
      exitReason: null,
    });

    const totalDirectStudentEnrollments = await prisma.enrollment.count({
      where: { studentId: directStudent.id },
    });
    const totalHandoffStudentEnrollments = await prisma.enrollment.count({
      where: { studentId: handoffStudent.id },
    });

    expect(totalDirectStudentEnrollments).toBe(1);
    expect(totalHandoffStudentEnrollments).toBe(1);
  });
});
