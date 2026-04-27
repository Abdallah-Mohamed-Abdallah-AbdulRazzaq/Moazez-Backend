import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AttendanceMode,
  AttendanceScopeType,
  AttendanceStatus,
  PrismaClient,
  StudentEnrollmentStatus,
} from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';

const GLOBAL_PREFIX = '/api/v1';

const DEMO_ADMIN_EMAIL = 'admin@academy.moazez.dev';
const DEMO_ADMIN_PASSWORD = 'School123!';
const DEMO_SCHOOL_SLUG = 'moazez-academy';

jest.setTimeout(30000);

describe('Attendance Foundation closeout flow (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let demoSchoolId: string;
  let demoOrganizationId: string;

  const cleanupState = {
    policyIds: new Set<string>(),
    sessionIds: new Set<string>(),
    entryIds: new Set<string>(),
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
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }

    if (prisma) {
      const sessionIds = [...cleanupState.sessionIds];

      if (sessionIds.length > 0) {
        await prisma.auditLog.deleteMany({
          where: {
            action: {
              in: ['attendance.session.submit', 'attendance.session.unsubmit'],
            },
            resourceId: { in: sessionIds },
          },
        });
      }

      if (cleanupState.entryIds.size > 0) {
        await prisma.attendanceEntry.deleteMany({
          where: { id: { in: [...cleanupState.entryIds] } },
        });
      }

      if (sessionIds.length > 0) {
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
    presentStudentId: string;
    absentStudentId: string;
    presentEnrollmentId: string;
    absentEnrollmentId: string;
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
          nameAr: `Sprint 3A Year ${suffix} AR`,
          nameEn: `Sprint 3A Year ${suffix}`,
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
          nameAr: `Sprint 3A Term ${suffix} AR`,
          nameEn: `Sprint 3A Term ${suffix}`,
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

    const attendanceDate = addUtcDays(activeTerm.startDate, 5);

    const stage = await prisma.stage.create({
      data: {
        schoolId: demoSchoolId,
        nameAr: `Sprint 3A Stage ${suffix} AR`,
        nameEn: `Sprint 3A Stage ${suffix}`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    cleanupState.stageIds.add(stage.id);

    const grade = await prisma.grade.create({
      data: {
        schoolId: demoSchoolId,
        stageId: stage.id,
        nameAr: `Sprint 3A Grade ${suffix} AR`,
        nameEn: `Sprint 3A Grade ${suffix}`,
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
        nameAr: `Sprint 3A Section ${suffix} AR`,
        nameEn: `Sprint 3A Section ${suffix}`,
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
        nameAr: `Sprint 3A Classroom ${suffix} AR`,
        nameEn: `Sprint 3A Classroom ${suffix}`,
        sortOrder: 1,
        capacity: 24,
      },
      select: { id: true },
    });
    cleanupState.classroomIds.add(classroom.id);

    const [presentStudent, absentStudent] = await Promise.all([
      prisma.student.create({
        data: {
          schoolId: demoSchoolId,
          organizationId: demoOrganizationId,
          firstName: `Sprint 3A Present ${suffix}`,
          lastName: 'Student',
        },
        select: { id: true },
      }),
      prisma.student.create({
        data: {
          schoolId: demoSchoolId,
          organizationId: demoOrganizationId,
          firstName: `Sprint 3A Absent ${suffix}`,
          lastName: 'Student',
        },
        select: { id: true },
      }),
    ]);
    cleanupState.studentIds.add(presentStudent.id);
    cleanupState.studentIds.add(absentStudent.id);

    const [presentEnrollment, absentEnrollment] = await Promise.all([
      prisma.enrollment.create({
        data: {
          schoolId: demoSchoolId,
          studentId: presentStudent.id,
          academicYearId: activeYear.id,
          termId: activeTerm.id,
          classroomId: classroom.id,
          status: StudentEnrollmentStatus.ACTIVE,
          enrolledAt: activeYear.startDate,
        },
        select: { id: true },
      }),
      prisma.enrollment.create({
        data: {
          schoolId: demoSchoolId,
          studentId: absentStudent.id,
          academicYearId: activeYear.id,
          termId: activeTerm.id,
          classroomId: classroom.id,
          status: StudentEnrollmentStatus.ACTIVE,
          enrolledAt: activeYear.startDate,
        },
        select: { id: true },
      }),
    ]);
    cleanupState.enrollmentIds.add(presentEnrollment.id);
    cleanupState.enrollmentIds.add(absentEnrollment.id);

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
      presentStudentId: presentStudent.id,
      absentStudentId: absentStudent.id,
      presentEnrollmentId: presentEnrollment.id,
      absentEnrollmentId: absentEnrollment.id,
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

  it('covers policy resolution, draft roll-call, submit lock, submitted-only reads, and unsubmit rollback', async () => {
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
        nameAr: `Sprint 3A Policy ${policyNameSuffix} AR`,
        nameEn: `Sprint 3A Policy ${policyNameSuffix}`,
        scopeType: AttendanceScopeType.CLASSROOM,
        classroomId: fixture.classroomId,
        mode: AttendanceMode.DAILY,
        effectiveStartDate: fixture.termStartDate,
        effectiveEndDate: fixture.termEndDate,
        allowExcuses: true,
        requireAttachmentForExcuse: false,
        notifyGuardians: true,
        notifyOnAbsent: true,
        isActive: true,
      })
      .expect(201);

    cleanupState.policyIds.add(createPolicyResponse.body.id);

    expect(createPolicyResponse.body).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        yearId: fixture.academicYearId,
        termId: fixture.termId,
        scopeType: AttendanceScopeType.CLASSROOM,
        scopeKey: `classroom:${fixture.classroomId}`,
        mode: AttendanceMode.DAILY,
        isActive: true,
      }),
    );

    const effectivePolicyResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/attendance/policies/effective`)
      .query(attendanceScopeQuery(fixture))
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(effectivePolicyResponse.body.policy).toEqual(
      expect.objectContaining({
        id: createPolicyResponse.body.id,
        scopeKey: `classroom:${fixture.classroomId}`,
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

    expect(resolveSessionResponse.body.session).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        status: 'DRAFT',
        policyId: createPolicyResponse.body.id,
        periodKey: 'daily',
      }),
    );

    const rosterResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/attendance/roll-call/roster`)
      .query({
        ...attendanceScopeQuery(fixture),
        mode: AttendanceMode.DAILY,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(rosterResponse.body.session).toEqual(
      expect.objectContaining({
        id: sessionId,
        status: 'DRAFT',
      }),
    );
    expect(rosterResponse.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          studentId: fixture.presentStudentId,
          enrollmentId: fixture.presentEnrollmentId,
          currentStatus: null,
        }),
        expect.objectContaining({
          studentId: fixture.absentStudentId,
          enrollmentId: fixture.absentEnrollmentId,
          currentStatus: null,
        }),
      ]),
    );

    const saveEntriesResponse = await request(app.getHttpServer())
      .put(
        `${GLOBAL_PREFIX}/attendance/roll-call/sessions/${sessionId}/entries`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        entries: [
          {
            studentId: fixture.presentStudentId,
            status: AttendanceStatus.PRESENT,
          },
          {
            studentId: fixture.absentStudentId,
            status: AttendanceStatus.ABSENT,
            note: 'Sprint 3A closeout absence',
          },
        ],
      })
      .expect(200);

    for (const entry of saveEntriesResponse.body.entries) {
      cleanupState.entryIds.add(entry.id);
    }

    expect(saveEntriesResponse.body.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          studentId: fixture.presentStudentId,
          status: AttendanceStatus.PRESENT,
        }),
        expect.objectContaining({
          studentId: fixture.absentStudentId,
          status: AttendanceStatus.ABSENT,
        }),
      ]),
    );

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
        submittedAt: expect.any(String),
      }),
    );

    const submittedMutationResponse = await request(app.getHttpServer())
      .put(
        `${GLOBAL_PREFIX}/attendance/roll-call/sessions/${sessionId}/entries/${fixture.presentStudentId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        status: AttendanceStatus.LATE,
        lateMinutes: 3,
      })
      .expect(409);

    expect(submittedMutationResponse.body?.error?.code).toBe(
      'attendance.session.already_submitted',
    );

    const absencesResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/attendance/absences`)
      .query(attendanceReadQuery(fixture))
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(absencesResponse.body.items).toEqual([
      expect.objectContaining({
        sessionId,
        studentId: fixture.absentStudentId,
        status: AttendanceStatus.ABSENT,
      }),
    ]);
    expect(
      absencesResponse.body.items.some(
        (item: { studentId: string }) =>
          item.studentId === fixture.presentStudentId,
      ),
    ).toBe(false);

    const absenceSummaryResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/attendance/absences/summary`)
      .query(attendanceReadQuery(fixture))
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(absenceSummaryResponse.body).toMatchObject({
      totalIncidents: 1,
      absentCount: 1,
      lateCount: 0,
      affectedStudentsCount: 1,
    });

    const reportsSummaryResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/attendance/reports/summary`)
      .query(attendanceReadQuery(fixture))
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(reportsSummaryResponse.body).toMatchObject({
      totalSessions: 1,
      totalEntries: 2,
      presentCount: 1,
      absentCount: 1,
      incidentCount: 1,
      affectedStudentsCount: 1,
    });

    const dailyTrendResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/attendance/reports/daily-trend`)
      .query(attendanceReadQuery(fixture))
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(dailyTrendResponse.body.items).toEqual([
      expect.objectContaining({
        date: fixture.attendanceDate,
        totalEntries: 2,
        presentCount: 1,
        absentCount: 1,
        incidentCount: 1,
      }),
    ]);

    const scopeBreakdownResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/attendance/reports/scope-breakdown`)
      .query({
        ...attendanceReadQuery(fixture),
        groupBy: 'classroom',
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(scopeBreakdownResponse.body.items).toEqual([
      expect.objectContaining({
        scopeType: 'classroom',
        scopeId: fixture.classroomId,
        totalEntries: 2,
        presentCount: 1,
        absentCount: 1,
        incidentCount: 1,
      }),
    ]);

    const unsubmitResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/attendance/roll-call/sessions/${sessionId}/unsubmit`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    expect(unsubmitResponse.body.session).toEqual(
      expect.objectContaining({
        id: sessionId,
        status: 'DRAFT',
        submittedAt: null,
      }),
    );

    const editableDraftEntryResponse = await request(app.getHttpServer())
      .put(
        `${GLOBAL_PREFIX}/attendance/roll-call/sessions/${sessionId}/entries/${fixture.absentStudentId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        status: AttendanceStatus.LATE,
        lateMinutes: 7,
        note: 'Updated after unsubmit',
      })
      .expect(200);

    cleanupState.entryIds.add(editableDraftEntryResponse.body.id);
    expect(editableDraftEntryResponse.body).toEqual(
      expect.objectContaining({
        sessionId,
        studentId: fixture.absentStudentId,
        status: AttendanceStatus.LATE,
        lateMinutes: 7,
      }),
    );

    const hiddenAbsencesResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/attendance/absences`)
      .query(attendanceReadQuery(fixture))
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(hiddenAbsencesResponse.body.items).toEqual([]);

    const hiddenAbsenceSummaryResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/attendance/absences/summary`)
      .query(attendanceReadQuery(fixture))
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(hiddenAbsenceSummaryResponse.body).toMatchObject({
      totalIncidents: 0,
      absentCount: 0,
      lateCount: 0,
      affectedStudentsCount: 0,
    });

    const hiddenReportsSummaryResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/attendance/reports/summary`)
      .query(attendanceReadQuery(fixture))
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(hiddenReportsSummaryResponse.body).toMatchObject({
      totalSessions: 0,
      totalEntries: 0,
      presentCount: 0,
      absentCount: 0,
      lateCount: 0,
      incidentCount: 0,
      affectedStudentsCount: 0,
    });

    const hiddenDailyTrendResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/attendance/reports/daily-trend`)
      .query(attendanceReadQuery(fixture))
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(hiddenDailyTrendResponse.body.items).toEqual([]);

    const attendanceAuditLogs = await prisma.auditLog.findMany({
      where: {
        schoolId: demoSchoolId,
        resourceId: sessionId,
        action: {
          in: ['attendance.session.submit', 'attendance.session.unsubmit'],
        },
      },
      select: { action: true, outcome: true },
      orderBy: { createdAt: 'asc' },
    });

    expect(attendanceAuditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'attendance.session.submit' }),
        expect.objectContaining({ action: 'attendance.session.unsubmit' }),
      ]),
    );
  });
});

function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addUtcDays(value: Date, days: number): string {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateOnly(date);
}
