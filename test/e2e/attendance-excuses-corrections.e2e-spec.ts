import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AttendanceExcuseStatus,
  AttendanceExcuseType,
  AttendanceMode,
  AttendanceScopeType,
  AttendanceStatus,
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
const DAILY_PERIOD_KEY = 'daily';

jest.setTimeout(30000);

describe('Attendance excuses and corrections closeout flow (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let storageService: StorageService;
  let demoSchoolId: string;
  let demoOrganizationId: string;

  const cleanupState = {
    policyIds: new Set<string>(),
    sessionIds: new Set<string>(),
    entryIds: new Set<string>(),
    excuseRequestIds: new Set<string>(),
    attachmentIds: new Set<string>(),
    fileIds: new Set<string>(),
    storageObjects: [] as Array<{ bucket: string; objectKey: string }>,
    enrollmentIds: new Set<string>(),
    studentIds: new Set<string>(),
    classroomIds: new Set<string>(),
    sectionIds: new Set<string>(),
    gradeIds: new Set<string>(),
    stageIds: new Set<string>(),
    termIds: new Set<string>(),
    academicYearIds: new Set<string>(),
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
    if (prisma) {
      const sessionIds = [...cleanupState.sessionIds];
      const entryIds = [...cleanupState.entryIds];
      const excuseRequestIds = [...cleanupState.excuseRequestIds];
      const attachmentIds = [...cleanupState.attachmentIds];
      const fileIds = [...cleanupState.fileIds];

      const auditResourceIds = [
        ...sessionIds,
        ...entryIds,
        ...excuseRequestIds,
      ];

      if (auditResourceIds.length > 0) {
        await prisma.auditLog.deleteMany({
          where: {
            resourceId: { in: auditResourceIds },
            action: {
              in: [
                'attendance.session.submit',
                'attendance.excuse_request.create',
                'attendance.excuse_request.update',
                'attendance.excuse_request.cancel',
                'attendance.excuse.attachment.add',
                'attendance.excuse.attachment.remove',
                'attendance.excuse.approve',
                'attendance.excuse.reject',
                'attendance.entry.correct',
              ],
            },
          },
        });
      }

      if (attachmentIds.length > 0 || excuseRequestIds.length > 0) {
        await prisma.attachment.deleteMany({
          where: {
            OR: [
              ...(attachmentIds.length > 0
                ? [{ id: { in: attachmentIds } }]
                : []),
              ...(excuseRequestIds.length > 0
                ? [
                    {
                      resourceType: 'attendance.excuse_request',
                      resourceId: { in: excuseRequestIds },
                    },
                  ]
                : []),
            ],
          },
        });
      }

      if (excuseRequestIds.length > 0) {
        await prisma.attendanceExcuseRequestSession.deleteMany({
          where: { attendanceExcuseRequestId: { in: excuseRequestIds } },
        });
        await prisma.attendanceExcuseRequest.deleteMany({
          where: { id: { in: excuseRequestIds } },
        });
      }

      if (sessionIds.length > 0) {
        await prisma.attendanceEntry.deleteMany({
          where: { sessionId: { in: sessionIds } },
        });
        await prisma.attendanceSession.deleteMany({
          where: { id: { in: sessionIds } },
        });
      }

      if (cleanupState.policyIds.size > 0) {
        await prisma.attendancePolicy.deleteMany({
          where: { id: { in: [...cleanupState.policyIds] } },
        });
      }

      if (cleanupState.enrollmentIds.size > 0) {
        await prisma.enrollment.deleteMany({
          where: { id: { in: [...cleanupState.enrollmentIds] } },
        });
      }

      if (cleanupState.studentIds.size > 0) {
        await prisma.student.deleteMany({
          where: { id: { in: [...cleanupState.studentIds] } },
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

      if (cleanupState.termIds.size > 0) {
        await prisma.term.deleteMany({
          where: { id: { in: [...cleanupState.termIds] } },
        });
      }

      if (cleanupState.academicYearIds.size > 0) {
        await prisma.academicYear.deleteMany({
          where: { id: { in: [...cleanupState.academicYearIds] } },
        });
      }

      if (fileIds.length > 0) {
        await prisma.file.deleteMany({
          where: { id: { in: fileIds } },
        });
      }
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

  async function registerStoredFile(fileId: string): Promise<void> {
    const storedFile = await prisma.file.findUnique({
      where: { id: fileId },
      select: { bucket: true, objectKey: true },
    });

    if (!storedFile) {
      throw new Error(`Uploaded file ${fileId} was not persisted.`);
    }

    cleanupState.fileIds.add(fileId);
    cleanupState.storageObjects.push(storedFile);
  }

  async function createAttendancePrerequisites(): Promise<{
    academicYearId: string;
    termId: string;
    termStartDate: string;
    termEndDate: string;
    attendanceDate: string;
    stageId: string;
    gradeId: string;
    sectionId: string;
    classroomId: string;
    absentStudentId: string;
    lateStudentId: string;
    absentEnrollmentId: string;
    lateEnrollmentId: string;
  }> {
    const suffix = randomUUID().split('-')[0];
    let activeYear = await prisma.academicYear.findFirst({
      where: {
        schoolId: demoSchoolId,
        isActive: true,
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        terms: {
          where: {
            isActive: true,
            deletedAt: null,
          },
          orderBy: { startDate: 'asc' },
          select: {
            id: true,
            startDate: true,
            endDate: true,
          },
          take: 1,
        },
      },
    });

    if (!activeYear) {
      activeYear = await prisma.academicYear.create({
        data: {
          schoolId: demoSchoolId,
          nameAr: `Sprint 3B Year ${suffix} AR`,
          nameEn: `Sprint 3B Year ${suffix}`,
          startDate: new Date('2026-09-01T00:00:00.000Z'),
          endDate: new Date('2027-06-30T00:00:00.000Z'),
          isActive: true,
        },
        select: {
          id: true,
          startDate: true,
          endDate: true,
          terms: {
            where: {
              isActive: true,
              deletedAt: null,
            },
            orderBy: { startDate: 'asc' },
            select: {
              id: true,
              startDate: true,
              endDate: true,
            },
            take: 1,
          },
        },
      });
      cleanupState.academicYearIds.add(activeYear.id);
    }

    let activeTerm = activeYear.terms[0];
    if (!activeTerm) {
      activeTerm = await prisma.term.create({
        data: {
          schoolId: demoSchoolId,
          academicYearId: activeYear.id,
          nameAr: `Sprint 3B Term ${suffix} AR`,
          nameEn: `Sprint 3B Term ${suffix}`,
          startDate: activeYear.startDate,
          endDate: activeYear.endDate,
          isActive: true,
        },
        select: {
          id: true,
          startDate: true,
          endDate: true,
        },
      });
      cleanupState.termIds.add(activeTerm.id);
    }

    const attendanceDate = selectDateWithinTerm(
      activeTerm.startDate,
      activeTerm.endDate,
      7,
    );

    const stage = await prisma.stage.create({
      data: {
        schoolId: demoSchoolId,
        nameAr: `Sprint 3B Stage ${suffix} AR`,
        nameEn: `Sprint 3B Stage ${suffix}`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    cleanupState.stageIds.add(stage.id);

    const grade = await prisma.grade.create({
      data: {
        schoolId: demoSchoolId,
        stageId: stage.id,
        nameAr: `Sprint 3B Grade ${suffix} AR`,
        nameEn: `Sprint 3B Grade ${suffix}`,
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
        nameAr: `Sprint 3B Section ${suffix} AR`,
        nameEn: `Sprint 3B Section ${suffix}`,
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
        nameAr: `Sprint 3B Classroom ${suffix} AR`,
        nameEn: `Sprint 3B Classroom ${suffix}`,
        sortOrder: 1,
        capacity: 24,
      },
      select: { id: true },
    });
    cleanupState.classroomIds.add(classroom.id);

    const [absentStudent, lateStudent] = await Promise.all([
      prisma.student.create({
        data: {
          schoolId: demoSchoolId,
          organizationId: demoOrganizationId,
          firstName: `Sprint 3B Absent ${suffix}`,
          lastName: 'Student',
        },
        select: { id: true },
      }),
      prisma.student.create({
        data: {
          schoolId: demoSchoolId,
          organizationId: demoOrganizationId,
          firstName: `Sprint 3B Late ${suffix}`,
          lastName: 'Student',
        },
        select: { id: true },
      }),
    ]);
    cleanupState.studentIds.add(absentStudent.id);
    cleanupState.studentIds.add(lateStudent.id);

    const [absentEnrollment, lateEnrollment] = await Promise.all([
      prisma.enrollment.create({
        data: {
          schoolId: demoSchoolId,
          studentId: absentStudent.id,
          academicYearId: activeYear.id,
          termId: activeTerm.id,
          classroomId: classroom.id,
          status: StudentEnrollmentStatus.ACTIVE,
          enrolledAt: activeTerm.startDate,
        },
        select: { id: true },
      }),
      prisma.enrollment.create({
        data: {
          schoolId: demoSchoolId,
          studentId: lateStudent.id,
          academicYearId: activeYear.id,
          termId: activeTerm.id,
          classroomId: classroom.id,
          status: StudentEnrollmentStatus.ACTIVE,
          enrolledAt: activeTerm.startDate,
        },
        select: { id: true },
      }),
    ]);
    cleanupState.enrollmentIds.add(absentEnrollment.id);
    cleanupState.enrollmentIds.add(lateEnrollment.id);

    return {
      academicYearId: activeYear.id,
      termId: activeTerm.id,
      termStartDate: formatDateOnly(activeTerm.startDate),
      termEndDate: formatDateOnly(activeTerm.endDate),
      attendanceDate,
      stageId: stage.id,
      gradeId: grade.id,
      sectionId: section.id,
      classroomId: classroom.id,
      absentStudentId: absentStudent.id,
      lateStudentId: lateStudent.id,
      absentEnrollmentId: absentEnrollment.id,
      lateEnrollmentId: lateEnrollment.id,
    };
  }

  function attendanceScopeQuery(fixture: {
    academicYearId: string;
    termId: string;
    attendanceDate: string;
    classroomId: string;
  }) {
    return {
      yearId: fixture.academicYearId,
      termId: fixture.termId,
      date: fixture.attendanceDate,
      scopeType: AttendanceScopeType.CLASSROOM,
      classroomId: fixture.classroomId,
    };
  }

  function attendanceReadQuery(fixture: {
    academicYearId: string;
    termId: string;
    attendanceDate: string;
    classroomId: string;
  }) {
    return {
      yearId: fixture.academicYearId,
      termId: fixture.termId,
      dateFrom: fixture.attendanceDate,
      dateTo: fixture.attendanceDate,
      scopeType: AttendanceScopeType.CLASSROOM,
      classroomId: fixture.classroomId,
    };
  }

  async function createExcuseRequest(
    accessToken: string,
    params: {
      fixture: {
        academicYearId: string;
        termId: string;
        attendanceDate: string;
      };
      studentId: string;
      type: AttendanceExcuseType;
      selectedPeriodKeys?: string[];
      lateMinutes?: number;
      reasonEn: string;
    },
  ) {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/attendance/excuse-requests`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        yearId: params.fixture.academicYearId,
        termId: params.fixture.termId,
        studentId: params.studentId,
        type: params.type,
        dateFrom: params.fixture.attendanceDate,
        dateTo: params.fixture.attendanceDate,
        selectedPeriodKeys: params.selectedPeriodKeys ?? [],
        lateMinutes: params.lateMinutes,
        reasonEn: params.reasonEn,
      })
      .expect(201);

    cleanupState.excuseRequestIds.add(response.body.id);
    return response.body;
  }

  it('covers excuse CRUD, attachments, approval application, rejection, and submitted-session correction', async () => {
    const { accessToken } = await login();

    const meResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/auth/me`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(meResponse.body.activeMembership).toEqual(
      expect.objectContaining({
        schoolId: demoSchoolId,
        organizationId: demoOrganizationId,
      }),
    );

    const fixture = await createAttendancePrerequisites();
    const policyNameSuffix = randomUUID().split('-')[0];

    const createPolicyResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/attendance/policies`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        yearId: fixture.academicYearId,
        termId: fixture.termId,
        nameAr: `Sprint 3B Policy ${policyNameSuffix} AR`,
        nameEn: `Sprint 3B Policy ${policyNameSuffix}`,
        scopeType: AttendanceScopeType.CLASSROOM,
        classroomId: fixture.classroomId,
        mode: AttendanceMode.DAILY,
        effectiveStartDate: fixture.termStartDate,
        effectiveEndDate: fixture.termEndDate,
        allowExcuses: true,
        requireAttachmentForExcuse: true,
        notifyGuardians: true,
        notifyOnAbsent: true,
        isActive: true,
      })
      .expect(201);

    cleanupState.policyIds.add(createPolicyResponse.body.id);

    expect(createPolicyResponse.body).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        scopeKey: `classroom:${fixture.classroomId}`,
        requireAttachmentForExcuse: true,
      }),
    );

    const resolveSessionResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/attendance/roll-call/session/resolve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        ...attendanceScopeQuery(fixture),
        mode: AttendanceMode.DAILY,
      })
      .expect(201);

    const sessionId = resolveSessionResponse.body.session.id;
    cleanupState.sessionIds.add(sessionId);

    const saveEntriesResponse = await request(app.getHttpServer())
      .put(
        `${GLOBAL_PREFIX}/attendance/roll-call/sessions/${sessionId}/entries`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        entries: [
          {
            studentId: fixture.absentStudentId,
            enrollmentId: fixture.absentEnrollmentId,
            status: AttendanceStatus.ABSENT,
            note: 'Sprint 3B closeout absence',
          },
          {
            studentId: fixture.lateStudentId,
            enrollmentId: fixture.lateEnrollmentId,
            status: AttendanceStatus.LATE,
            lateMinutes: 9,
            note: 'Sprint 3B closeout late arrival',
          },
        ],
      })
      .expect(200);

    for (const entry of saveEntriesResponse.body.entries) {
      cleanupState.entryIds.add(entry.id);
    }

    const submitResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/attendance/roll-call/sessions/${sessionId}/submit`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    expect(submitResponse.body.session).toEqual(
      expect.objectContaining({
        id: sessionId,
        status: 'SUBMITTED',
      }),
    );

    const uploadedFileResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/files`)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', Buffer.from('Sprint 3B medical note'), {
        filename: `sprint-3b-${policyNameSuffix}.txt`,
        contentType: 'text/plain',
      })
      .expect(201);

    const uploadedFileId = uploadedFileResponse.body.id;
    await registerStoredFile(uploadedFileId);

    const crudRequest = await createExcuseRequest(accessToken, {
      fixture,
      studentId: fixture.absentStudentId,
      type: AttendanceExcuseType.ABSENCE,
      reasonEn: 'Initial closeout CRUD reason',
    });

    const updateCrudResponse = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/attendance/excuse-requests/${crudRequest.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        reasonEn: 'Updated closeout CRUD reason',
      })
      .expect(200);

    expect(updateCrudResponse.body).toEqual(
      expect.objectContaining({
        id: crudRequest.id,
        status: AttendanceExcuseStatus.PENDING,
        reasonEn: 'Updated closeout CRUD reason',
      }),
    );

    const crudDetailResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/attendance/excuse-requests/${crudRequest.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(crudDetailResponse.body).toEqual(
      expect.objectContaining({
        id: crudRequest.id,
        studentId: fixture.absentStudentId,
        status: AttendanceExcuseStatus.PENDING,
      }),
    );

    const listCrudResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/attendance/excuse-requests`)
      .query({
        yearId: fixture.academicYearId,
        termId: fixture.termId,
        dateFrom: fixture.attendanceDate,
        dateTo: fixture.attendanceDate,
        status: AttendanceExcuseStatus.PENDING,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(listCrudResponse.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: crudRequest.id,
          status: AttendanceExcuseStatus.PENDING,
        }),
      ]),
    );

    const linkCrudAttachmentResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/attendance/excuse-requests/${crudRequest.id}/attachments`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fileIds: [uploadedFileId] })
      .expect(201);

    const crudAttachmentId = linkCrudAttachmentResponse.body.items[0].id;
    cleanupState.attachmentIds.add(crudAttachmentId);

    expect(linkCrudAttachmentResponse.body.items).toEqual([
      expect.objectContaining({
        id: expect.any(String),
        fileId: uploadedFileId,
        downloadUrl: `${GLOBAL_PREFIX}/files/${uploadedFileId}/download`,
      }),
    ]);

    const unlinkCrudAttachmentResponse = await request(app.getHttpServer())
      .delete(
        `${GLOBAL_PREFIX}/attendance/excuse-requests/${crudRequest.id}/attachments/${crudAttachmentId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(unlinkCrudAttachmentResponse.body).toEqual({ ok: true });

    const listUnlinkedCrudAttachmentsResponse = await request(
      app.getHttpServer(),
    )
      .get(
        `${GLOBAL_PREFIX}/attendance/excuse-requests/${crudRequest.id}/attachments`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(listUnlinkedCrudAttachmentsResponse.body.items).toEqual([]);

    const deleteCrudResponse = await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/attendance/excuse-requests/${crudRequest.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(deleteCrudResponse.body).toEqual({ ok: true });

    const approvalRequest = await createExcuseRequest(accessToken, {
      fixture,
      studentId: fixture.absentStudentId,
      type: AttendanceExcuseType.ABSENCE,
      reasonEn: 'Medical appointment with document',
    });

    const approveWithoutAttachmentResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/attendance/excuse-requests/${approvalRequest.id}/approve`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ decisionNote: 'Document is required by policy' })
      .expect(422);

    expect(approveWithoutAttachmentResponse.body?.error?.code).toBe(
      'attendance.entry.requires_excuse_attachment',
    );

    const linkApprovalAttachmentResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/attendance/excuse-requests/${approvalRequest.id}/attachments`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fileIds: [uploadedFileId] })
      .expect(201);

    const approvalAttachmentId =
      linkApprovalAttachmentResponse.body.items[0].id;
    cleanupState.attachmentIds.add(approvalAttachmentId);

    const approvalAttachmentsResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/attendance/excuse-requests/${approvalRequest.id}/attachments`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(approvalAttachmentsResponse.body.items).toEqual([
      expect.objectContaining({
        id: approvalAttachmentId,
        fileId: uploadedFileId,
      }),
    ]);

    const approveResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/attendance/excuse-requests/${approvalRequest.id}/approve`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ decisionNote: 'Approved with medical note' })
      .expect(201);

    expect(approveResponse.body).toEqual(
      expect.objectContaining({
        id: approvalRequest.id,
        status: AttendanceExcuseStatus.APPROVED,
        linkedSessionIds: [sessionId],
        attachmentCount: 1,
      }),
    );

    const sessionAfterApproveResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/attendance/roll-call/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(sessionAfterApproveResponse.body.session).toEqual(
      expect.objectContaining({
        id: sessionId,
        status: 'SUBMITTED',
      }),
    );
    expect(sessionAfterApproveResponse.body.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          studentId: fixture.absentStudentId,
          status: AttendanceStatus.EXCUSED,
        }),
        expect.objectContaining({
          studentId: fixture.lateStudentId,
          status: AttendanceStatus.LATE,
        }),
      ]),
    );

    const absencesAfterApproveResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/attendance/absences`)
      .query(attendanceReadQuery(fixture))
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(absencesAfterApproveResponse.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sessionId,
          studentId: fixture.absentStudentId,
          status: AttendanceStatus.EXCUSED,
        }),
      ]),
    );
    expect(
      absencesAfterApproveResponse.body.items.some(
        (item: { studentId: string; status: AttendanceStatus }) =>
          item.studentId === fixture.absentStudentId &&
          item.status === AttendanceStatus.ABSENT,
      ),
    ).toBe(false);

    const reportsAfterApproveResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/attendance/reports/summary`)
      .query(attendanceReadQuery(fixture))
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(reportsAfterApproveResponse.body).toMatchObject({
      totalSessions: 1,
      totalEntries: 2,
      absentCount: 0,
      lateCount: 1,
      excusedCount: 1,
      incidentCount: 2,
    });

    const rejectRequest = await createExcuseRequest(accessToken, {
      fixture,
      studentId: fixture.lateStudentId,
      type: AttendanceExcuseType.LATE,
      selectedPeriodKeys: [DAILY_PERIOD_KEY],
      lateMinutes: 9,
      reasonEn: 'Late excuse without approval',
    });

    const rejectResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/attendance/excuse-requests/${rejectRequest.id}/reject`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ decisionNote: 'Rejected during closeout verification' })
      .expect(201);

    expect(rejectResponse.body).toEqual(
      expect.objectContaining({
        id: rejectRequest.id,
        status: AttendanceExcuseStatus.REJECTED,
        linkedSessionIds: [],
      }),
    );

    const sessionAfterRejectResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/attendance/roll-call/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(sessionAfterRejectResponse.body.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          studentId: fixture.lateStudentId,
          status: AttendanceStatus.LATE,
          lateMinutes: 9,
        }),
      ]),
    );

    const correctionResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/attendance/roll-call/sessions/${sessionId}/entries/${fixture.lateStudentId}/correct`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        status: AttendanceStatus.PRESENT,
        correctionReason: 'Attendance officer verified the submitted sheet',
        note: 'Corrected during Sprint 3B closeout',
      })
      .expect(201);

    cleanupState.entryIds.add(correctionResponse.body.id);

    expect(correctionResponse.body).toEqual(
      expect.objectContaining({
        sessionId,
        studentId: fixture.lateStudentId,
        status: AttendanceStatus.PRESENT,
        lateMinutes: null,
      }),
    );

    const sessionAfterCorrectionResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/attendance/roll-call/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(sessionAfterCorrectionResponse.body.session).toEqual(
      expect.objectContaining({
        id: sessionId,
        status: 'SUBMITTED',
      }),
    );
    expect(sessionAfterCorrectionResponse.body.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          studentId: fixture.lateStudentId,
          status: AttendanceStatus.PRESENT,
        }),
      ]),
    );

    const submittedMutationResponse = await request(app.getHttpServer())
      .put(
        `${GLOBAL_PREFIX}/attendance/roll-call/sessions/${sessionId}/entries/${fixture.lateStudentId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        status: AttendanceStatus.ABSENT,
        note: 'Regular roll-call edits must stay locked after correction',
      })
      .expect(409);

    expect(submittedMutationResponse.body?.error?.code).toBe(
      'attendance.session.already_submitted',
    );

    const absencesAfterCorrectionResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/attendance/absences`)
      .query(attendanceReadQuery(fixture))
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(absencesAfterCorrectionResponse.body.items).toEqual([
      expect.objectContaining({
        sessionId,
        studentId: fixture.absentStudentId,
        status: AttendanceStatus.EXCUSED,
      }),
    ]);
    expect(
      absencesAfterCorrectionResponse.body.items.some(
        (item: { studentId: string }) =>
          item.studentId === fixture.lateStudentId,
      ),
    ).toBe(false);

    const reportsAfterCorrectionResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/attendance/reports/summary`)
      .query(attendanceReadQuery(fixture))
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(reportsAfterCorrectionResponse.body).toMatchObject({
      totalSessions: 1,
      totalEntries: 2,
      presentCount: 1,
      absentCount: 0,
      lateCount: 0,
      excusedCount: 1,
      incidentCount: 1,
      affectedStudentsCount: 1,
    });
  });
});

function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addUtcDays(value: Date, days: number): Date {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

function selectDateWithinTerm(
  startDate: Date,
  endDate: Date,
  offsetDays: number,
) {
  const candidate = addUtcDays(startDate, offsetDays);
  if (candidate <= endDate) {
    return formatDateOnly(candidate);
  }

  return formatDateOnly(startDate);
}
