import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AttendanceMode,
  AttendanceScopeType,
  AttendanceSessionStatus,
  AttendanceStatus,
  CommunicationNotificationPreferenceCategory,
  CommunicationNotificationSourceModule,
  CommunicationNotificationType,
  DailyComputationStrategy,
  MembershipStatus,
  PrismaClient,
  StudentEnrollmentStatus,
  TimetableConfigStatus,
  TimetablePeriodType,
  TimetableScopeType,
  UserStatus,
  UserType,
} from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';

const GLOBAL_PREFIX = '/api/v1';

const DEMO_ADMIN_EMAIL = 'admin@academy.moazez.dev';
const DEMO_ADMIN_PASSWORD = 'School123!';
const DEMO_SCHOOL_SLUG = 'moazez-academy';
const PARENT_PASSWORD = 'AttendanceParent123!';
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

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
    timetableConfigIds: new Set<string>(),
    timetablePeriodIds: new Set<string>(),
    notificationIds: new Set<string>(),
    notificationPreferenceIds: new Set<string>(),
    studentGuardianIds: new Set<string>(),
    guardianIds: new Set<string>(),
    membershipIds: new Set<string>(),
    userIds: new Set<string>(),
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

      const userIds = [...cleanupState.userIds];
      const notificationIds = new Set(cleanupState.notificationIds);
      if (userIds.length > 0) {
        const userNotifications =
          await prisma.communicationNotification.findMany({
            where: { recipientUserId: { in: userIds } },
            select: { id: true },
          });
        for (const notification of userNotifications) {
          notificationIds.add(notification.id);
        }
      }

      if (notificationIds.size > 0) {
        const ids = [...notificationIds];
        await prisma.communicationNotificationPushAttempt.deleteMany({
          where: {
            delivery: {
              notificationId: { in: ids },
            },
          },
        });
        await prisma.communicationNotificationDelivery.deleteMany({
          where: { notificationId: { in: ids } },
        });
        await prisma.communicationNotification.deleteMany({
          where: { id: { in: ids } },
        });
      }

      if (cleanupState.notificationPreferenceIds.size > 0) {
        await prisma.communicationNotificationPreference.deleteMany({
          where: { id: { in: [...cleanupState.notificationPreferenceIds] } },
        });
      }

      if (userIds.length > 0) {
        await prisma.communicationNotificationPreference.deleteMany({
          where: { userId: { in: userIds } },
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

      if (cleanupState.timetablePeriodIds.size > 0) {
        await prisma.timetablePeriod.deleteMany({
          where: { id: { in: [...cleanupState.timetablePeriodIds] } },
        });
      }

      if (cleanupState.timetableConfigIds.size > 0) {
        await prisma.timetableConfig.deleteMany({
          where: { id: { in: [...cleanupState.timetableConfigIds] } },
        });
      }

      if (cleanupState.enrollmentIds.size > 0) {
        await prisma.enrollment.deleteMany({
          where: { id: { in: [...cleanupState.enrollmentIds] } },
        });
      }

      if (cleanupState.studentGuardianIds.size > 0) {
        await prisma.studentGuardian.deleteMany({
          where: { id: { in: [...cleanupState.studentGuardianIds] } },
        });
      }

      if (cleanupState.guardianIds.size > 0) {
        await prisma.guardian.deleteMany({
          where: { id: { in: [...cleanupState.guardianIds] } },
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

      if (userIds.length > 0) {
        await prisma.session.deleteMany({
          where: { userId: { in: userIds } },
        });
      }

      if (cleanupState.membershipIds.size > 0) {
        await prisma.membership.deleteMany({
          where: { id: { in: [...cleanupState.membershipIds] } },
        });
      }

      if (userIds.length > 0) {
        await prisma.user.deleteMany({
          where: { id: { in: userIds } },
        });
      }

      await prisma.$disconnect();
    }
  });

  async function login(
    email = DEMO_ADMIN_EMAIL,
    password = DEMO_ADMIN_PASSWORD,
  ): Promise<{ accessToken: string }> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password })
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
    selectedPeriodIds: string[];
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

    const timetableConfig = await prisma.timetableConfig.create({
      data: {
        schoolId: demoSchoolId,
        academicYearId: activeYear.id,
        termId: activeTerm.id,
        name: `Sprint 3A Timetable ${suffix}`,
        weekStartDay: 0,
        activeDays: [0, 1, 2, 3, 4],
        scopeType: TimetableScopeType.CLASSROOM,
        scopeKey: `classroom:${classroom.id}`,
        gradeId: grade.id,
        sectionId: section.id,
        classroomId: classroom.id,
        status: TimetableConfigStatus.DRAFT,
      },
      select: { id: true },
    });
    cleanupState.timetableConfigIds.add(timetableConfig.id);

    const periods = await Promise.all(
      [
        ['08:00', '08:45'],
        ['08:50', '09:35'],
        ['09:40', '10:25'],
        ['10:30', '11:15'],
        ['11:20', '12:05'],
      ].map(([startTime, endTime], index) =>
        prisma.timetablePeriod.create({
          data: {
            schoolId: demoSchoolId,
            timetableConfigId: timetableConfig.id,
            periodIndex: index + 1,
            label: `Sprint 3A Period ${index + 1} ${suffix}`,
            startTime,
            endTime,
            type: TimetablePeriodType.CLASS,
            isInstructional: true,
          },
          select: { id: true },
        }),
      ),
    );
    for (const period of periods) {
      cleanupState.timetablePeriodIds.add(period.id);
    }

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
      selectedPeriodIds: periods.map((period) => period.id),
    };
  }

  async function createParentGuardianForStudent(
    studentId: string,
  ): Promise<{
    parentUserId: string;
    parentEmail: string;
    guardianId: string;
  }> {
    const suffix = randomUUID().split('-')[0];
    const parentRole = await prisma.role.findFirst({
      where: { key: 'parent', schoolId: null, isSystem: true },
      select: { id: true },
    });
    if (!parentRole) {
      throw new Error('parent system role not found - run `npm run seed`.');
    }

    const parentEmail = `attendance-parent-${suffix}@example.test`;
    const parentUser = await prisma.user.create({
      data: {
        email: parentEmail,
        passwordHash: await argon2.hash(PARENT_PASSWORD, ARGON2_OPTIONS),
        firstName: `Attendance Parent ${suffix}`,
        lastName: 'Guardian',
        userType: UserType.PARENT,
        status: UserStatus.ACTIVE,
      },
      select: { id: true },
    });
    cleanupState.userIds.add(parentUser.id);

    const membership = await prisma.membership.create({
      data: {
        userId: parentUser.id,
        organizationId: demoOrganizationId,
        schoolId: demoSchoolId,
        roleId: parentRole.id,
        userType: UserType.PARENT,
        status: MembershipStatus.ACTIVE,
      },
      select: { id: true },
    });
    cleanupState.membershipIds.add(membership.id);

    const guardian = await prisma.guardian.create({
      data: {
        schoolId: demoSchoolId,
        organizationId: demoOrganizationId,
        userId: parentUser.id,
        firstName: `Attendance Parent ${suffix}`,
        lastName: 'Guardian',
        phone: `+1555${suffix.padEnd(8, '0').slice(0, 8)}`,
        email: parentEmail,
        relation: 'parent',
        isPrimary: true,
      },
      select: { id: true },
    });
    cleanupState.guardianIds.add(guardian.id);

    const link = await prisma.studentGuardian.create({
      data: {
        schoolId: demoSchoolId,
        studentId,
        guardianId: guardian.id,
        isPrimary: true,
      },
      select: { id: true },
    });
    cleanupState.studentGuardianIds.add(link.id);

    return {
      parentUserId: parentUser.id,
      parentEmail,
      guardianId: guardian.id,
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
    const parentGuardian = await createParentGuardianForStudent(
      fixture.absentStudentId,
    );
    const policyNameSuffix = randomUUID().split('-')[0];
    const advancedPolicyFields = {
      dailyComputationStrategy: DailyComputationStrategy.DERIVED_FROM_PERIODS,
      selectedPeriodIds: fixture.selectedPeriodIds,
      lateThresholdMinutes: 10,
      earlyLeaveThresholdMinutes: 12,
      autoAbsentAfterMinutes: 45,
      absentIfMissedPeriodsCount: 2,
      requireExcuseReason: true,
      notifyTeachers: true,
      notifyStudents: true,
      notifyOnLate: true,
      notifyOnEarlyLeave: false,
    };

    const invalidPolicyResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/attendance/policies`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        yearId: fixture.academicYearId,
        termId: fixture.termId,
        nameAr: `Sprint 3A Invalid Policy ${policyNameSuffix} AR`,
        nameEn: `Sprint 3A Invalid Policy ${policyNameSuffix}`,
        scopeType: AttendanceScopeType.CLASSROOM,
        classroomId: fixture.classroomId,
        mode: AttendanceMode.DAILY,
        ...advancedPolicyFields,
        selectedPeriodIds: [randomUUID()],
        effectiveStartDate: fixture.termStartDate,
        effectiveEndDate: fixture.termEndDate,
        isActive: true,
      })
      .expect(400);

    expect(invalidPolicyResponse.body?.error?.code).toBe('validation.failed');

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
        ...advancedPolicyFields,
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
        ...advancedPolicyFields,
        isActive: true,
      }),
    );

    const listPoliciesResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/attendance/policies`)
      .query({
        yearId: fixture.academicYearId,
        termId: fixture.termId,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(listPoliciesResponse.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: createPolicyResponse.body.id,
          ...advancedPolicyFields,
        }),
      ]),
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
        ...advancedPolicyFields,
      }),
    );

    const invalidPatchResponse = await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/attendance/policies/${createPolicyResponse.body.id}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        selectedPeriodIds: [randomUUID()],
      })
      .expect(400);

    expect(invalidPatchResponse.body?.error?.code).toBe('validation.failed');

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

    const allowedPeriodKey = `att-pol-2b-allowed-${policyNameSuffix}`;
    const allowedPeriodId = fixture.selectedPeriodIds[0];
    const allowedPeriodResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/attendance/roll-call/session/resolve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        ...attendanceScopeQuery(fixture),
        mode: AttendanceMode.PERIOD,
        periodKey: allowedPeriodKey,
        periodId: ` ${allowedPeriodId} `,
        periodLabelEn: 'Period 1',
      })
      .expect(201);

    const allowedPeriodSessionId = allowedPeriodResponse.body.session.id;
    cleanupState.sessionIds.add(allowedPeriodSessionId);

    expect(allowedPeriodResponse.body.session).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        mode: AttendanceMode.PERIOD,
        periodId: allowedPeriodId,
        periodKey: allowedPeriodKey,
        policyId: createPolicyResponse.body.id,
      }),
    );

    const disallowedPeriodKey = `att-pol-2b-disallowed-${policyNameSuffix}`;
    const disallowedPeriodResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/attendance/roll-call/session/resolve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        ...attendanceScopeQuery(fixture),
        mode: AttendanceMode.PERIOD,
        periodKey: disallowedPeriodKey,
        periodId: 'period-not-selected',
      })
      .expect(400);

    expect(disallowedPeriodResponse.body?.error?.code).toBe(
      'validation.failed',
    );

    const disallowedSessionCount = await prisma.attendanceSession.count({
      where: {
        schoolId: demoSchoolId,
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
        date: new Date(fixture.attendanceDate),
        scopeType: AttendanceScopeType.CLASSROOM,
        scopeKey: `classroom:${fixture.classroomId}`,
        mode: AttendanceMode.PERIOD,
        periodKey: disallowedPeriodKey,
      },
    });
    expect(disallowedSessionCount).toBe(0);

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
    const absentEntry = saveEntriesResponse.body.entries.find(
      (entry: { studentId: string }) =>
        entry.studentId === fixture.absentStudentId,
    );

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

    const parentAuth = await login(parentGuardian.parentEmail, PARENT_PASSWORD);
    const parentNotificationsResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/notifications`)
      .set('Authorization', `Bearer ${parentAuth.accessToken}`)
      .expect(200);

    expect(parentNotificationsResponse.body.notifications).toHaveLength(1);
    const attendanceNotification =
      parentNotificationsResponse.body.notifications[0];
    cleanupState.notificationIds.add(attendanceNotification.notificationId);
    expect(attendanceNotification).toEqual(
      expect.objectContaining({
        type: 'attendance_absence',
        sourceModule: 'attendance',
        sourceId: null,
        title: 'Attendance absence recorded',
        priority: 'normal',
        status: 'unread',
        deepLink: null,
      }),
    );
    expect(attendanceNotification.body).toContain('was marked absent on');
    expect(JSON.stringify(attendanceNotification)).not.toContain(
      'idempotencyKey',
    );
    expect(JSON.stringify(attendanceNotification)).not.toContain(
      'idempotency_key',
    );
    expect(JSON.stringify(attendanceNotification)).not.toContain(sessionId);
    expect(JSON.stringify(attendanceNotification)).not.toContain(
      absentEntry.id,
    );
    expect(JSON.stringify(attendanceNotification)).not.toContain('schoolId');
    expect(JSON.stringify(attendanceNotification)).not.toContain(
      'organizationId',
    );
    expect(JSON.stringify(attendanceNotification)).not.toContain(
      parentGuardian.guardianId,
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

  it('skips guardian absence notifications when policy flag or ATTENDANCE preference disables them', async () => {
    const { accessToken } = await login();

    async function runDisabledNotificationScenario(params: {
      notifyGuardiansOnAbsence: boolean;
      disableAttendancePreference: boolean;
    }) {
      const fixture = await createAttendancePrerequisites();
      const parentGuardian = await createParentGuardianForStudent(
        fixture.absentStudentId,
      );
      if (params.disableAttendancePreference) {
        const preference =
          await prisma.communicationNotificationPreference.create({
            data: {
              schoolId: demoSchoolId,
              userId: parentGuardian.parentUserId,
              category: CommunicationNotificationPreferenceCategory.ATTENDANCE,
              inAppEnabled: false,
              pushEnabled: true,
            },
            select: { id: true },
          });
        cleanupState.notificationPreferenceIds.add(preference.id);
      }

      const suffix = randomUUID().split('-')[0];
      const createPolicyResponse = await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/attendance/policies`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          yearId: fixture.academicYearId,
          termId: fixture.termId,
          nameAr: `Sprint 2L Notification Policy ${suffix} AR`,
          nameEn: `Sprint 2L Notification Policy ${suffix}`,
          scopeType: AttendanceScopeType.CLASSROOM,
          classroomId: fixture.classroomId,
          mode: AttendanceMode.DAILY,
          notifyGuardiansOnAbsence: params.notifyGuardiansOnAbsence,
          effectiveStartDate: fixture.termStartDate,
          effectiveEndDate: fixture.termEndDate,
          isActive: true,
        })
        .expect(201);
      cleanupState.policyIds.add(createPolicyResponse.body.id);

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
              status: AttendanceStatus.ABSENT,
            },
          ],
        })
        .expect(200);
      for (const entry of saveEntriesResponse.body.entries) {
        cleanupState.entryIds.add(entry.id);
      }

      await request(app.getHttpServer())
        .post(
          `${GLOBAL_PREFIX}/attendance/roll-call/sessions/${sessionId}/submit`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);

      const parentAuth = await login(
        parentGuardian.parentEmail,
        PARENT_PASSWORD,
      );
      const notificationsResponse = await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/parent/notifications`)
        .set('Authorization', `Bearer ${parentAuth.accessToken}`)
        .expect(200);

      expect(notificationsResponse.body.notifications).toEqual([]);
      await expect(
        prisma.communicationNotification.count({
          where: {
            schoolId: demoSchoolId,
            recipientUserId: parentGuardian.parentUserId,
            sourceModule: CommunicationNotificationSourceModule.ATTENDANCE,
            type: CommunicationNotificationType.ATTENDANCE_ABSENCE,
          },
        }),
      ).resolves.toBe(0);
    }

    await runDisabledNotificationScenario({
      notifyGuardiansOnAbsence: false,
      disableAttendancePreference: false,
    });
    await runDisabledNotificationScenario({
      notifyGuardiansOnAbsence: true,
      disableAttendancePreference: true,
    });
  });

  it('reports derived daily absences from submitted selected period evidence only', async () => {
    const { accessToken } = await login();
    const fixture = await createAttendancePrerequisites();
    const policyNameSuffix = randomUUID().split('-')[0];

    const createPolicyResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/attendance/policies`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        yearId: fixture.academicYearId,
        termId: fixture.termId,
        nameAr: `Sprint 2H Derived Policy ${policyNameSuffix} AR`,
        nameEn: `Sprint 2H Derived Policy ${policyNameSuffix}`,
        scopeType: AttendanceScopeType.CLASSROOM,
        classroomId: fixture.classroomId,
        mode: AttendanceMode.DAILY,
        dailyComputationStrategy: DailyComputationStrategy.DERIVED_FROM_PERIODS,
        selectedPeriodIds: fixture.selectedPeriodIds,
        absentIfMissedPeriodsCount: 2,
        effectiveStartDate: fixture.termStartDate,
        effectiveEndDate: fixture.termEndDate,
        isActive: true,
      })
      .expect(201);

    cleanupState.policyIds.add(createPolicyResponse.body.id);

    const periodStatuses = [
      AttendanceStatus.PRESENT,
      AttendanceStatus.LATE,
      AttendanceStatus.EARLY_LEAVE,
      AttendanceStatus.EXCUSED,
      AttendanceStatus.UNMARKED,
    ];

    for (const [index, periodId] of fixture.selectedPeriodIds.entries()) {
      const resolvePeriodResponse = await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/attendance/roll-call/session/resolve`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          ...attendanceScopeQuery(fixture),
          mode: AttendanceMode.PERIOD,
          periodKey: `att-pol-2h-${policyNameSuffix}-${index + 1}`,
          periodId,
          periodLabelEn: `Derived Period ${index + 1}`,
        })
        .expect(201);

      const periodSessionId = resolvePeriodResponse.body.session.id;
      cleanupState.sessionIds.add(periodSessionId);

      const saveResponse = await request(app.getHttpServer())
        .put(
          `${GLOBAL_PREFIX}/attendance/roll-call/sessions/${periodSessionId}/entries`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          entries: [
            {
              studentId: fixture.absentStudentId,
              status:
                index < 2 ? AttendanceStatus.ABSENT : AttendanceStatus.PRESENT,
            },
            {
              studentId: fixture.presentStudentId,
              status: periodStatuses[index],
              lateMinutes:
                periodStatuses[index] === AttendanceStatus.LATE ? 6 : null,
              earlyLeaveMinutes:
                periodStatuses[index] === AttendanceStatus.EARLY_LEAVE
                  ? 6
                  : null,
            },
          ],
        })
        .expect(200);

      for (const entry of saveResponse.body.entries) {
        cleanupState.entryIds.add(entry.id);
      }

      await request(app.getHttpServer())
        .post(
          `${GLOBAL_PREFIX}/attendance/roll-call/sessions/${periodSessionId}/submit`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);
    }

    const reportResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/attendance/reports/derived-daily-absences`)
      .query(attendanceReadQuery(fixture))
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(reportResponse.body.items).toHaveLength(1);
    expect(reportResponse.body.items[0]).toEqual(
      expect.objectContaining({
        date: fixture.attendanceDate,
        studentId: fixture.absentStudentId,
        scopeType: AttendanceScopeType.CLASSROOM,
        scopeKey: `classroom:${fixture.classroomId}`,
        policyId: createPolicyResponse.body.id,
        missedPeriodCount: 2,
        requiredMissedPeriodsCount: 2,
        evidencePeriodCount: fixture.selectedPeriodIds.length,
        derivedStatus: AttendanceStatus.ABSENT,
        source: DailyComputationStrategy.DERIVED_FROM_PERIODS,
        reportOnly: true,
      }),
    );
    expect(reportResponse.body.items[0].missedPeriodIds).toEqual(
      expect.arrayContaining([
        fixture.selectedPeriodIds[0],
        fixture.selectedPeriodIds[1],
      ]),
    );
    expect(reportResponse.body.items[0].missedPeriodIds).toHaveLength(2);
    expect(reportResponse.body.items[0].sourcePeriodIds).toEqual(
      expect.arrayContaining(fixture.selectedPeriodIds),
    );
    expect(
      reportResponse.body.items.some(
        (item: { studentId: string }) =>
          item.studentId === fixture.presentStudentId,
      ),
    ).toBe(false);
    expect(JSON.stringify(reportResponse.body)).not.toContain('sessionId');
    expect(JSON.stringify(reportResponse.body)).not.toContain('schoolId');
    expect(JSON.stringify(reportResponse.body)).not.toContain(
      'organizationId',
    );

    const dailySessionCount = await prisma.attendanceSession.count({
      where: {
        schoolId: demoSchoolId,
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
        date: new Date(fixture.attendanceDate),
        scopeType: AttendanceScopeType.CLASSROOM,
        scopeKey: `classroom:${fixture.classroomId}`,
        mode: AttendanceMode.DAILY,
      },
    });
    expect(dailySessionCount).toBe(0);

    const reportsSummaryResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/attendance/reports/summary`)
      .query(attendanceReadQuery(fixture))
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(reportsSummaryResponse.body).toMatchObject({
      totalSessions: fixture.selectedPeriodIds.length,
      totalEntries: fixture.selectedPeriodIds.length * 2,
      absentCount: 2,
      lateCount: 1,
      earlyLeaveCount: 1,
      excusedCount: 1,
      unmarkedCount: 1,
      incidentCount: 5,
    });
  });

  it('normalizes draft PRESENT entries by linked policy thresholds without changing submit semantics', async () => {
    const { accessToken } = await login();
    const fixture = await createAttendancePrerequisites();
    const policyNameSuffix = randomUUID().split('-')[0];

    const createPolicyResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/attendance/policies`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        yearId: fixture.academicYearId,
        termId: fixture.termId,
        nameAr: `Sprint 2F Threshold Policy ${policyNameSuffix} AR`,
        nameEn: `Sprint 2F Threshold Policy ${policyNameSuffix}`,
        scopeType: AttendanceScopeType.CLASSROOM,
        classroomId: fixture.classroomId,
        mode: AttendanceMode.DAILY,
        lateThresholdMinutes: 10,
        earlyLeaveThresholdMinutes: 12,
        effectiveStartDate: fixture.termStartDate,
        effectiveEndDate: fixture.termEndDate,
        isActive: true,
      })
      .expect(201);

    cleanupState.policyIds.add(createPolicyResponse.body.id);

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
        policyId: createPolicyResponse.body.id,
        status: AttendanceSessionStatus.DRAFT,
      }),
    );

    const belowThresholdResponse = await request(app.getHttpServer())
      .put(
        `${GLOBAL_PREFIX}/attendance/roll-call/sessions/${sessionId}/entries/${fixture.presentStudentId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        status: AttendanceStatus.PRESENT,
        lateMinutes: 9,
      })
      .expect(200);

    cleanupState.entryIds.add(belowThresholdResponse.body.id);
    expect(belowThresholdResponse.body).toEqual(
      expect.objectContaining({
        sessionId,
        studentId: fixture.presentStudentId,
        status: AttendanceStatus.PRESENT,
        lateMinutes: 9,
      }),
    );

    const lateThresholdResponse = await request(app.getHttpServer())
      .put(
        `${GLOBAL_PREFIX}/attendance/roll-call/sessions/${sessionId}/entries/${fixture.presentStudentId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        status: AttendanceStatus.PRESENT,
        lateMinutes: 15,
        earlyLeaveMinutes: 3,
      })
      .expect(200);

    cleanupState.entryIds.add(lateThresholdResponse.body.id);
    expect(lateThresholdResponse.body).toEqual(
      expect.objectContaining({
        sessionId,
        studentId: fixture.presentStudentId,
        status: AttendanceStatus.LATE,
        lateMinutes: 15,
        earlyLeaveMinutes: null,
      }),
    );

    const earlyLeaveThresholdResponse = await request(app.getHttpServer())
      .put(
        `${GLOBAL_PREFIX}/attendance/roll-call/sessions/${sessionId}/entries/${fixture.absentStudentId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        status: AttendanceStatus.PRESENT,
        lateMinutes: 3,
        earlyLeaveMinutes: 14,
      })
      .expect(200);

    cleanupState.entryIds.add(earlyLeaveThresholdResponse.body.id);
    expect(earlyLeaveThresholdResponse.body).toEqual(
      expect.objectContaining({
        sessionId,
        studentId: fixture.absentStudentId,
        status: AttendanceStatus.EARLY_LEAVE,
        lateMinutes: null,
        earlyLeaveMinutes: 14,
      }),
    );

    const ambiguousThresholdResponse = await request(app.getHttpServer())
      .put(
        `${GLOBAL_PREFIX}/attendance/roll-call/sessions/${sessionId}/entries/${fixture.absentStudentId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        status: AttendanceStatus.PRESENT,
        lateMinutes: 15,
        earlyLeaveMinutes: 14,
      })
      .expect(400);

    expect(ambiguousThresholdResponse.body?.error?.code).toBe(
      'validation.failed',
    );
    expect(ambiguousThresholdResponse.body?.error?.details).toEqual(
      expect.objectContaining({
        field: 'status',
        studentId: fixture.absentStudentId,
        lateMinutes: 15,
        earlyLeaveMinutes: 14,
        lateThresholdMinutes: 10,
        earlyLeaveThresholdMinutes: 12,
        reason: 'ambiguous_threshold_match',
      }),
    );
    expect(JSON.stringify(ambiguousThresholdResponse.body)).not.toContain(
      'schoolId',
    );
    expect(JSON.stringify(ambiguousThresholdResponse.body)).not.toContain(
      'organizationId',
    );

    const submitResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/attendance/roll-call/sessions/${sessionId}/submit`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    expect(submitResponse.body.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          studentId: fixture.presentStudentId,
          status: AttendanceStatus.LATE,
          lateMinutes: 15,
        }),
        expect.objectContaining({
          studentId: fixture.absentStudentId,
          status: AttendanceStatus.EARLY_LEAVE,
          earlyLeaveMinutes: 14,
        }),
      ]),
    );

    const reportsSummaryResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/attendance/reports/summary`)
      .query(attendanceReadQuery(fixture))
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(reportsSummaryResponse.body).toMatchObject({
      totalSessions: 1,
      totalEntries: 2,
      presentCount: 0,
      absentCount: 0,
      lateCount: 1,
      earlyLeaveCount: 1,
      incidentCount: 2,
      affectedStudentsCount: 2,
    });
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
