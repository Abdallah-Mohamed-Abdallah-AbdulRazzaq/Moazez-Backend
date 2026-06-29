import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AdmissionApplicationSource,
  AdmissionApplicationStatus,
  AdmissionDecisionType,
  AdmissionDocumentStatus,
  FileVisibility,
  InterviewStatus,
  LeadChannel,
  LeadStatus,
  PlacementTestStatus,
  PrismaClient,
  StudentDocumentStatus,
} from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';

const GLOBAL_PREFIX = '/api/v1';

const DEMO_ADMIN_EMAIL = 'admin@academy.moazez.dev';
const DEMO_ADMIN_PASSWORD = 'School123!';
const DEMO_SCHOOL_SLUG = 'moazez-academy';

jest.setTimeout(30000);

describe('Admissions document import to student document (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let demoSchoolId: string;
  let demoOrganizationId: string;
  let demoAdminUserId: string;

  const cleanupState = {
    leadIds: new Set<string>(),
    applicationIds: new Set<string>(),
    applicationDocumentIds: new Set<string>(),
    studentDocumentIds: new Set<string>(),
    fileIds: new Set<string>(),
    placementTestIds: new Set<string>(),
    interviewIds: new Set<string>(),
    decisionIds: new Set<string>(),
    studentIds: new Set<string>(),
    guardianIds: new Set<string>(),
    enrollmentIds: new Set<string>(),
    academicYearIds: new Set<string>(),
    stageIds: new Set<string>(),
    gradeIds: new Set<string>(),
    sectionIds: new Set<string>(),
    classroomIds: new Set<string>(),
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
      throw new Error('Demo school admin not found - run `npm run seed` first.');
    }
    demoAdminUserId = demoAdmin.id;
    await ensureSchoolAdminPermissions([
      'students.documents.manage',
      'admissions.documents.view',
    ]);

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
  });

  afterAll(async () => {
    const applicationIds = [...cleanupState.applicationIds];
    const studentIds = [...cleanupState.studentIds];
    const guardianIds = [...cleanupState.guardianIds];
    const enrollmentIds = [...cleanupState.enrollmentIds];

    if (prisma) {
      if (studentIds.length > 0) {
        await prisma.auditLog.deleteMany({
          where: {
            action: {
              in: [
                'students.document.import_from_admissions',
                'students.registration.create',
              ],
            },
            resourceId: { in: studentIds },
          },
        });
      }
      if (applicationIds.length > 0) {
        await prisma.auditLog.deleteMany({
          where: {
            action: 'admissions.application.register',
            resourceId: { in: applicationIds },
          },
        });
      }
      if (cleanupState.studentDocumentIds.size > 0) {
        await prisma.studentDocument.deleteMany({
          where: { id: { in: [...cleanupState.studentDocumentIds] } },
        });
      }
      if (cleanupState.applicationDocumentIds.size > 0) {
        await prisma.applicationDocument.deleteMany({
          where: { id: { in: [...cleanupState.applicationDocumentIds] } },
        });
      }
      if (cleanupState.fileIds.size > 0) {
        await prisma.file.deleteMany({
          where: { id: { in: [...cleanupState.fileIds] } },
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
      if (cleanupState.decisionIds.size > 0) {
        await prisma.admissionDecision.deleteMany({
          where: { id: { in: [...cleanupState.decisionIds] } },
        });
      }
      if (cleanupState.interviewIds.size > 0) {
        await prisma.interview.deleteMany({
          where: { id: { in: [...cleanupState.interviewIds] } },
        });
      }
      if (cleanupState.placementTestIds.size > 0) {
        await prisma.placementTest.deleteMany({
          where: { id: { in: [...cleanupState.placementTestIds] } },
        });
      }
      if (applicationIds.length > 0) {
        await prisma.application.deleteMany({
          where: { id: { in: applicationIds } },
        });
      }
      if (cleanupState.leadIds.size > 0) {
        await prisma.lead.deleteMany({
          where: { id: { in: [...cleanupState.leadIds] } },
        });
      }
      if (cleanupState.classroomIds.size > 0) {
        await prisma.classroom.deleteMany({
          where: { id: { in: [...cleanupState.classroomIds] } },
        });
      }
      if (cleanupState.sectionIds.size > 0) {
        await prisma.section.deleteMany({
          where: { id: { in: [...cleanupState.sectionIds] } },
        });
      }
      if (cleanupState.gradeIds.size > 0) {
        await prisma.grade.deleteMany({
          where: { id: { in: [...cleanupState.gradeIds] } },
        });
      }
      if (cleanupState.stageIds.size > 0) {
        await prisma.stage.deleteMany({
          where: { id: { in: [...cleanupState.stageIds] } },
        });
      }
      if (cleanupState.academicYearIds.size > 0) {
        await prisma.academicYear.deleteMany({
          where: { id: { in: [...cleanupState.academicYearIds] } },
        });
      }
    }

    if (app) {
      await app.close();
    }
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  async function login(): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email: DEMO_ADMIN_EMAIL, password: DEMO_ADMIN_PASSWORD })
      .expect(200);

    return response.body.accessToken;
  }

  async function ensureSchoolAdminPermissions(codes: string[]): Promise<void> {
    const role = await prisma.role.findFirst({
      where: { key: 'school_admin', schoolId: null, isSystem: true },
      select: { id: true },
    });
    if (!role) {
      throw new Error('school_admin system role not found - run `npm run seed` first.');
    }

    const permissions = await prisma.permission.findMany({
      where: { code: { in: codes } },
      select: { id: true, code: true },
    });
    const missingCodes = codes.filter(
      (code) => !permissions.some((permission) => permission.code === code),
    );
    if (missingCodes.length > 0) {
      throw new Error(`Missing permissions: ${missingCodes.join(', ')}`);
    }

    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({
        roleId: role.id,
        permissionId: permission.id,
      })),
      skipDuplicates: true,
    });
  }

  async function createAcademicPlacement(label: string): Promise<{
    academicYearId: string;
    gradeId: string;
    sectionId: string;
    classroomId: string;
  }> {
    const suffix = randomUUID().split('-')[0];
    const existingAcademicYear = await prisma.academicYear.findFirst({
      where: {
        schoolId: demoSchoolId,
        isActive: true,
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    const academicYear =
      existingAcademicYear ??
      (await prisma.academicYear.create({
        data: {
          schoolId: demoSchoolId,
          nameAr: `${label}-${suffix}-year-ar`,
          nameEn: `${label}-${suffix}-year`,
          startDate: new Date('2026-09-01T00:00:00.000Z'),
          endDate: new Date('2027-06-30T00:00:00.000Z'),
          isActive: true,
        },
        select: { id: true },
      }));

    if (!existingAcademicYear) {
      cleanupState.academicYearIds.add(academicYear.id);
    }

    const stage = await prisma.stage.create({
      data: {
        schoolId: demoSchoolId,
        nameAr: `${label}-${suffix}-stage-ar`,
        nameEn: `${label}-${suffix}-stage`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    cleanupState.stageIds.add(stage.id);

    const grade = await prisma.grade.create({
      data: {
        schoolId: demoSchoolId,
        stageId: stage.id,
        nameAr: `${label}-${suffix}-grade-ar`,
        nameEn: `${label}-${suffix}-grade`,
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
        nameAr: `${label}-${suffix}-section-ar`,
        nameEn: `${label}-${suffix}-section`,
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
        nameAr: `${label}-${suffix}-classroom-ar`,
        nameEn: `${label}-${suffix}-classroom`,
        sortOrder: 1,
        capacity: 24,
      },
      select: { id: true },
    });
    cleanupState.classroomIds.add(classroom.id);

    return {
      academicYearId: academicYear.id,
      gradeId: grade.id,
      sectionId: section.id,
      classroomId: classroom.id,
    };
  }

  async function createAcceptedApplication(): Promise<string> {
    const suffix = randomUUID().split('-')[0];
    const lead = await prisma.lead.create({
      data: {
        schoolId: demoSchoolId,
        organizationId: demoOrganizationId,
        studentName: `Document Import Student ${suffix}`,
        primaryContactName: `Document Import Parent ${suffix}`,
        phone: '+201009990001',
        email: `doc.import.${suffix}@example.com`,
        channel: LeadChannel.REFERRAL,
        status: LeadStatus.NEW,
      },
      select: { id: true, studentName: true },
    });
    cleanupState.leadIds.add(lead.id);

    const application = await prisma.application.create({
      data: {
        schoolId: demoSchoolId,
        organizationId: demoOrganizationId,
        leadId: lead.id,
        studentName: lead.studentName,
        source: AdmissionApplicationSource.REFERRAL,
        status: AdmissionApplicationStatus.ACCEPTED,
        submittedAt: new Date('2026-04-21T08:30:00.000Z'),
      },
      select: { id: true },
    });
    cleanupState.applicationIds.add(application.id);

    const placementTest = await prisma.placementTest.create({
      data: {
        schoolId: demoSchoolId,
        applicationId: application.id,
        type: 'Placement',
        scheduledAt: new Date('2026-04-22T10:00:00.000Z'),
        score: 90,
        result: 'Passed',
        status: PlacementTestStatus.COMPLETED,
      },
      select: { id: true },
    });
    cleanupState.placementTestIds.add(placementTest.id);

    const interview = await prisma.interview.create({
      data: {
        schoolId: demoSchoolId,
        applicationId: application.id,
        scheduledAt: new Date('2026-04-23T11:00:00.000Z'),
        interviewerUserId: demoAdminUserId,
        status: InterviewStatus.COMPLETED,
        notes: 'Completed interview',
      },
      select: { id: true },
    });
    cleanupState.interviewIds.add(interview.id);

    const decision = await prisma.admissionDecision.create({
      data: {
        schoolId: demoSchoolId,
        applicationId: application.id,
        decision: AdmissionDecisionType.ACCEPT,
        reason: 'Accepted for document import',
        decidedByUserId: demoAdminUserId,
        decidedAt: new Date('2026-04-24T09:00:00.000Z'),
      },
      select: { id: true },
    });
    cleanupState.decisionIds.add(decision.id);

    return application.id;
  }

  async function createApplicationDocument(
    applicationId: string,
  ): Promise<{ applicationDocumentId: string; fileId: string }> {
    const suffix = randomUUID();
    const file = await prisma.file.create({
      data: {
        organizationId: demoOrganizationId,
        schoolId: demoSchoolId,
        uploaderId: demoAdminUserId,
        bucket: 'adm-reg-doc-1b-test',
        objectKey: `admissions/${suffix}.pdf`,
        originalName: 'birth-certificate.pdf',
        mimeType: 'application/pdf',
        sizeBytes: BigInt(2048),
        checksumSha256: `checksum-${suffix}`,
        visibility: FileVisibility.PRIVATE,
      },
      select: { id: true },
    });
    cleanupState.fileIds.add(file.id);

    const applicationDocument = await prisma.applicationDocument.create({
      data: {
        schoolId: demoSchoolId,
        applicationId,
        fileId: file.id,
        documentType: 'Birth Certificate',
        status: AdmissionDocumentStatus.COMPLETE,
        notes: 'Reviewed by admissions',
      },
      select: { id: true },
    });
    cleanupState.applicationDocumentIds.add(applicationDocument.id);

    return {
      applicationDocumentId: applicationDocument.id,
      fileId: file.id,
    };
  }

  function validRegistrationPayload(placement: {
    academicYearId: string;
    gradeId: string;
    sectionId: string;
    classroomId: string;
  }): Record<string, unknown> {
    return {
      student: {
        full_name_en: 'Document Import Registered Student',
        dateOfBirth: '2017-03-10',
      },
      guardians: [
        {
          profile: {
            full_name: 'Document Import Guardian',
            relation: 'Mother',
            phone_primary: '+201009998877',
          },
          relationship: { is_primary: true },
        },
      ],
      enrollment: {
        academicYearId: placement.academicYearId,
        gradeId: placement.gradeId,
        sectionId: placement.sectionId,
        classroomId: placement.classroomId,
        enrollmentDate: '2026-09-01',
      },
    };
  }

  it('imports selected ApplicationDocument records after source-bound registration', async () => {
    const accessToken = await login();
    const placement = await createAcademicPlacement('admissions-doc-import');
    const applicationId = await createAcceptedApplication();
    const { applicationDocumentId, fileId } =
      await createApplicationDocument(applicationId);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/admissions/applications/${applicationId}/registration-handoff`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const registerResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/admissions/applications/${applicationId}/register`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(validRegistrationPayload(placement))
      .expect(200);

    const studentId = registerResponse.body.registration.student.id;
    cleanupState.studentIds.add(studentId);
    cleanupState.guardianIds.add(
      registerResponse.body.registration.guardians[0].guardianId,
    );
    cleanupState.enrollmentIds.add(
      registerResponse.body.registration.enrollment.enrollmentId,
    );

    await expect(
      prisma.studentDocument.count({
        where: { studentId, sourceApplicationId: applicationId },
      }),
    ).resolves.toBe(0);

    const importResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/students-guardians/students/${studentId}/documents/import-from-application`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        applicationId,
        applicationDocumentIds: [applicationDocumentId],
      })
      .expect(201);

    const studentDocumentId =
      importResponse.body.imported[0].studentDocument.id;
    cleanupState.studentDocumentIds.add(studentDocumentId);

    expect(importResponse.body).toEqual({
      studentId,
      applicationId,
      imported: [
        {
          applicationDocumentId,
          studentDocument: expect.objectContaining({
            id: studentDocumentId,
            studentId,
            fileId,
            type: 'Birth Certificate',
            name: 'birth-certificate.pdf',
            status: 'complete',
            url: `/api/v1/files/${fileId}/download`,
            fileType: 'pdf',
            notes: 'Reviewed by admissions',
          }),
          source: {
            sourceApplicationId: applicationId,
            sourceApplicationDocumentId: applicationDocumentId,
            sourceApplicantRequestDocumentId: null,
          },
        },
      ],
      skipped: [],
      warnings: [],
    });
    expect(JSON.stringify(importResponse.body)).not.toContain('schoolId');
    expect(JSON.stringify(importResponse.body)).not.toContain('organizationId');
    expect(JSON.stringify(importResponse.body)).not.toContain('bucket');
    expect(JSON.stringify(importResponse.body)).not.toContain('objectKey');
    expect(JSON.stringify(importResponse.body)).not.toContain('raw signed URL');

    const persistedStudentDocument =
      await prisma.studentDocument.findUniqueOrThrow({
        where: { id: studentDocumentId },
        select: {
          studentId: true,
          fileId: true,
          documentType: true,
          status: true,
          sourceApplicationId: true,
          sourceApplicationDocumentId: true,
          sourceApplicantRequestDocumentId: true,
          importedAt: true,
          importedBy: true,
          sourceDocumentType: true,
          sourceReviewStatus: true,
          sourceNotes: true,
          sourceFileId: true,
        },
      });
    expect(persistedStudentDocument).toEqual({
      studentId,
      fileId,
      documentType: 'Birth Certificate',
      status: StudentDocumentStatus.COMPLETE,
      sourceApplicationId: applicationId,
      sourceApplicationDocumentId: applicationDocumentId,
      sourceApplicantRequestDocumentId: null,
      importedAt: expect.any(Date),
      importedBy: demoAdminUserId,
      sourceDocumentType: 'Birth Certificate',
      sourceReviewStatus: 'complete',
      sourceNotes: 'Reviewed by admissions',
      sourceFileId: fileId,
    });

    const secondImportResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/students-guardians/students/${studentId}/documents/import-from-application`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        applicationId,
        applicationDocumentIds: [applicationDocumentId],
      })
      .expect(201);

    expect(secondImportResponse.body).toEqual({
      studentId,
      applicationId,
      imported: [],
      skipped: [
        {
          applicationDocumentId,
          reason: 'already_imported',
          studentDocumentId,
        },
      ],
      warnings: [],
    });
    await expect(
      prisma.studentDocument.count({
        where: {
          studentId,
          sourceApplicationDocumentId: applicationDocumentId,
        },
      }),
    ).resolves.toBe(1);

    const application = await prisma.application.findUniqueOrThrow({
      where: { id: applicationId },
      select: { status: true },
    });
    expect(application.status).toBe(AdmissionApplicationStatus.ACCEPTED);

    const detailResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/admissions/applications/${applicationId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(detailResponse.body.registrationState).toEqual(
      expect.objectContaining({
        registered: true,
        studentId,
        source: 'derived_from_student_application_id',
      }),
    );
  });
});
