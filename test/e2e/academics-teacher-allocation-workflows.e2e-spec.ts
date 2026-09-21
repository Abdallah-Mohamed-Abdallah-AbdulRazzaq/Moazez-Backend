/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- Supertest response bodies are intentionally inspected as runtime JSON contracts. */
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AttendanceMode,
  AttendanceScopeType,
  AttendanceSessionStatus,
  CommunicationAnnouncementStatus,
  CommunicationConversationStatus,
  CommunicationConversationType,
  CommunicationMessageKind,
  CommunicationMessageStatus,
  CommunicationParticipantRole,
  CommunicationParticipantStatus,
  GradeAssessmentApprovalStatus,
  GradeAssessmentType,
  GradeScopeType,
  HomeworkAssignmentStatus,
  LessonPlanStatus,
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  ReinforcementSource,
  ReinforcementTaskStatus,
  SchoolStatus,
  StudentEnrollmentStatus,
  StudentStatus,
  TeacherEmploymentStatus,
  TeacherGender,
  TimetableConfigStatus,
  TimetableEntryStatus,
  TimetablePublicationStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { buildTeacherAnnouncementMetadata } from '../../src/modules/communication/domain/teacher-app-announcement-metadata';

const GLOBAL_PREFIX = '/api/v1';
const PASSWORD = 'Sprint22CTeacherAllocation123!';
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

type ExpressLayer = {
  route?: {
    path?: string | string[];
    methods?: Record<string, boolean>;
  };
  handle?: {
    stack?: ExpressLayer[];
  };
};

type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

type AcademicBase = {
  academicYearId: string;
  termId: string;
  closedTermId: string;
  stageId: string;
  gradeId: string;
  sectionAId: string;
  sectionBId: string;
  classroomAId: string;
  classroomBId: string;
};

jest.setTimeout(180000);

describe('Academics teacher allocation workflows (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let organizationId = '';
  let schoolId = '';
  let adminEmail = '';
  let teacherEmail = '';
  let targetTeacherEmail = '';
  let teacherUserId = '';
  let targetTeacherUserId = '';
  let academic: AcademicBase;
  let mathSubjectId = '';
  let scienceSubjectId = '';
  let missingMatrixSubjectId = '';
  let closedTermAllocationId = '';
  let adminAuth: AuthTokens;

  const suffix = randomUUID().split('-')[0];
  const marker = `s22c-e2e-${suffix}`;
  const createdOrganizationIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];
  const createdPermissionIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const [teacherRole, viewPermission, managePermission] = await Promise.all([
      findSystemRole('teacher'),
      findOrCreatePermission({
        code: 'academics.structure.view',
        resource: 'structure',
        action: 'view',
        description: 'View academic structure.',
      }),
      findOrCreatePermission({
        code: 'academics.structure.manage',
        resource: 'structure',
        action: 'manage',
        description: 'Manage academic structure.',
      }),
    ]);

    organizationId = await createOrganization();
    schoolId = await createSchool(organizationId);
    academic = await createAcademicBase(schoolId);
    mathSubjectId = await createSubject('math', 'Mathematics', '#2563eb');
    scienceSubjectId = await createSubject('science', 'Science', '#16a34a');
    missingMatrixSubjectId = await createSubject(
      'history',
      'History',
      '#9333ea',
    );
    await createSubjectAllocation({
      termId: academic.termId,
      subjectId: mathSubjectId,
      weeklyHours: 5,
    });
    await createSubjectAllocation({
      termId: academic.termId,
      subjectId: scienceSubjectId,
      weeklyHours: 3,
    });
    await createSubjectAllocation({
      termId: academic.closedTermId,
      subjectId: mathSubjectId,
      weeklyHours: 5,
    });

    const adminRoleId = await createCustomRole({
      key: `${marker}-allocation-admin`,
      name: `Sprint 22C Allocation Admin ${suffix}`,
      permissionIds: [viewPermission.id, managePermission.id],
    });
    adminEmail = `${marker}-admin@example.test`;
    await createUserWithMembership({
      email: adminEmail,
      firstName: 'Sprint22C',
      lastName: 'Admin',
      userType: UserType.SCHOOL_USER,
      roleId: adminRoleId,
    });
    teacherEmail = `${marker}-teacher@example.test`;
    teacherUserId = await createUserWithMembership({
      email: teacherEmail,
      firstName: 'Mariam',
      lastName: 'Ali',
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
    });
    targetTeacherEmail = `${marker}-target-teacher@example.test`;
    targetTeacherUserId = await createUserWithMembership({
      email: targetTeacherEmail,
      firstName: 'Nour',
      lastName: 'Hassan',
      userType: UserType.TEACHER,
      roleId: teacherRole.id,
    });
    await Promise.all([
      prisma.teacherProfile.create({
        data: {
          schoolId,
          userId: teacherUserId,
          teacherCode: `T-${suffix.toUpperCase()}-1`,
          firstNameAr: 'مريم',
          lastNameAr: 'علي',
          firstNameEn: 'Mariam',
          lastNameEn: 'Ali',
          gender: TeacherGender.FEMALE,
          employmentStatus: TeacherEmploymentStatus.ACTIVE,
        },
      }),
      prisma.teacherProfile.create({
        data: {
          schoolId,
          userId: targetTeacherUserId,
          teacherCode: `T-${suffix.toUpperCase()}-2`,
          firstNameAr: 'نور',
          lastNameAr: 'حسن',
          firstNameEn: 'Nour',
          lastNameEn: 'Hassan',
          gender: TeacherGender.FEMALE,
          employmentStatus: TeacherEmploymentStatus.ACTIVE,
        },
      }),
    ]);
    closedTermAllocationId = await createTeacherAllocationDirect({
      termId: academic.closedTermId,
      subjectId: mathSubjectId,
      classroomId: academic.classroomAId,
    });

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    );
    await app.init();

    adminAuth = await login(adminEmail);
  });

  afterAll(async () => {
    try {
      if (app) await app.close();
      await cleanupE2eData();
    } finally {
      if (prisma) await prisma.$disconnect();
    }
  });

  it('registers existing and new allocation routes without changing teacher schedule routes', () => {
    const routes = listRegisteredRoutes();

    expect(routes).toEqual(
      expect.arrayContaining([
        'GET /api/v1/academics/allocations',
        'POST /api/v1/academics/allocations',
        'DELETE /api/v1/academics/allocations/:id',
        'PUT /api/v1/academics/allocations/bulk',
        'POST /api/v1/academics/allocations/apply-to-grade',
        'POST /api/v1/academics/allocations/clear-subject',
        'GET /api/v1/academics/allocations/validation',
        'GET /api/v1/academics/allocations/teacher-loads',
        'POST /api/v1/academics/allocations/:allocationId/reassignment-preview',
        'POST /api/v1/academics/allocations/:allocationId/reassign',
        'GET /api/v1/teacher/schedule',
        'GET /api/v1/teacher/schedule/week',
      ]),
    );
  });

  it('preserves existing list, create, and delete allocation routes', async () => {
    const created = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/allocations`)
      .set('Authorization', bearer(adminAuth))
      .send({
        teacherUserId,
        subjectId: mathSubjectId,
        classroomId: academic.classroomAId,
        termId: academic.termId,
      })
      .expect(201);

    expect(created.body).toMatchObject({
      teacher: { id: teacherUserId, fullName: 'Mariam Ali' },
      subject: { id: mathSubjectId, code: `${marker}-MATH` },
      classroom: { id: academic.classroomAId },
      term: { id: academic.termId, status: 'open' },
    });
    expectSafeAllocationPayload(created.body);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/allocations`)
      .query({ termId: academic.termId })
      .set('Authorization', bearer(adminAuth))
      .expect(200)
      .expect((response) => {
        expect(
          response.body.items.map((item: { id: string }) => item.id),
        ).toContain(created.body.id);
      });

    await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/academics/allocations/${created.body.id}`)
      .set('Authorization', bearer(adminAuth))
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual({ ok: true });
      });
  });

  it('previews a ready reassignment without mutating allocation ownership', async () => {
    const allocationId = await createTeacherAllocationDirect({
      termId: academic.termId,
      subjectId: mathSubjectId,
      classroomId: academic.classroomAId,
    });
    const before = await prisma.teacherSubjectAllocation.findUniqueOrThrow({
      where: { id: allocationId },
      select: { teacherUserId: true, updatedAt: true },
    });

    try {
      await request(app.getHttpServer())
        .post(
          `${GLOBAL_PREFIX}/academics/allocations/${allocationId}/reassignment-preview`,
        )
        .set('Authorization', bearer(adminAuth))
        .send({ newTeacherUserId: targetTeacherUserId })
        .expect(200)
        .expect((response) => {
          const body = response.body as unknown as {
            impactFingerprint: string;
            impact: unknown;
          };
          expect(body).toMatchObject({
            allocation: {
              id: allocationId,
              subjectId: mathSubjectId,
              classroomId: academic.classroomAId,
              termId: academic.termId,
            },
            currentTeacher: {
              userId: teacherUserId,
              fullName: 'Mariam Ali',
            },
            targetTeacher: {
              userId: targetTeacherUserId,
              fullName: 'Nour Hassan',
            },
            decision: 'ready',
            canReassign: true,
            blockers: [],
            automaticActions: [],
            historicalRecords: [],
          });
          expect(body.impactFingerprint).toMatch(/^[a-f0-9]{64}$/u);
          expect(body.impact).toMatchObject({
            assessments: { policy: 'contextual_access_no_rewrite' },
            curriculum: { policy: 'no_mutation' },
            attendance: { policy: 'historical_preserve' },
            messages: { policy: 'no_history_rewrite' },
          });
          expectSafeAllocationPayload(body);
        });

      const after = await prisma.teacherSubjectAllocation.findUniqueOrThrow({
        where: { id: allocationId },
        select: { teacherUserId: true, updatedAt: true },
      });
      expect(after).toEqual(before);
    } finally {
      await prisma.teacherSubjectAllocation.delete({
        where: { id: allocationId },
      });
    }
  });

  it('reassigns the same allocation in place and writes exactly one safe success audit', async () => {
    const allocationId = await createTeacherAllocationDirect({
      termId: academic.termId,
      subjectId: mathSubjectId,
      classroomId: academic.classroomAId,
    });

    try {
      const preview = await request(app.getHttpServer())
        .post(
          `${GLOBAL_PREFIX}/academics/allocations/${allocationId}/reassignment-preview`,
        )
        .set('Authorization', bearer(adminAuth))
        .send({ newTeacherUserId: targetTeacherUserId })
        .expect(200);

      await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/academics/allocations/${allocationId}/reassign`)
        .set('Authorization', bearer(adminAuth))
        .send({
          newTeacherUserId: targetTeacherUserId,
          impactFingerprint: preview.body.impactFingerprint,
          reasonCode: 'teacher_replacement',
        })
        .expect(200)
        .expect((response) => {
          expect(response.body).toEqual({
            allocation: {
              id: allocationId,
              teacherUserId: targetTeacherUserId,
            },
            previousTeacherUserId: teacherUserId,
            newTeacherUserId: targetTeacherUserId,
            transferred: {
              timetableEntries: 0,
              lessonPlans: 0,
              homeworkAssignments: 0,
            },
            preservedHistorical: {
              cancelledTimetableEntries: 0,
              archivedLessonPlans: 0,
              cancelledOrArchivedHomeworkAssignments: 0,
              completedOrCancelledReinforcementTasks: 0,
              publishedArchivedOrCancelledAnnouncements: 0,
            },
          });
          expectSafeAllocationPayload(response.body);
        });

      const [allocation, audits] = await Promise.all([
        prisma.teacherSubjectAllocation.findUniqueOrThrow({
          where: { id: allocationId },
          select: {
            id: true,
            teacherUserId: true,
            subjectId: true,
            classroomId: true,
            termId: true,
          },
        }),
        prisma.auditLog.findMany({
          where: {
            action: 'academics.allocation.reassign',
            resourceId: allocationId,
            outcome: 'SUCCESS',
          },
          select: { before: true, after: true },
        }),
      ]);
      expect(allocation).toEqual({
        id: allocationId,
        teacherUserId: targetTeacherUserId,
        subjectId: mathSubjectId,
        classroomId: academic.classroomAId,
        termId: academic.termId,
      });
      expect(audits).toEqual([
        {
          before: { teacherUserId },
          after: {
            teacherUserId: targetTeacherUserId,
            reasonCode: 'teacher_replacement',
            transferred: {
              timetableEntries: 0,
              lessonPlans: 0,
              homeworkAssignments: 0,
            },
            blockersVerified: { reinforcement: 0, announcements: 0 },
          },
        },
      ]);

      const [sourceTeacherAuth, targetTeacherAuth] = await Promise.all([
        login(teacherEmail),
        login(targetTeacherEmail),
      ]);
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/teacher/my-classes/${allocationId}`)
        .set('Authorization', bearer(sourceTeacherAuth))
        .expect(404);
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/teacher/my-classes/${allocationId}`)
        .set('Authorization', bearer(targetTeacherAuth))
        .expect(200)
        .expect((response) => {
          expect(response.body.class).toMatchObject({
            id: allocationId,
            classId: allocationId,
          });
        });
    } finally {
      await prisma.auditLog.deleteMany({ where: { resourceId: allocationId } });
      await prisma.teacherSubjectAllocation.deleteMany({
        where: { id: allocationId },
      });
    }
  });

  it('hands off all operational dependencies while preserving history, provenance, and publication state', async () => {
    const allocationId = await createTeacherAllocationDirect({
      termId: academic.termId,
      subjectId: mathSubjectId,
      classroomId: academic.classroomAId,
    });
    const config = await prisma.timetableConfig.create({
      data: {
        schoolId,
        academicYearId: academic.academicYearId,
        termId: academic.termId,
        name: `${marker}-reassignment-config`,
        activeDays: [1, 2, 3],
        scopeKey: academic.termId,
        status: TimetableConfigStatus.ACTIVE,
      },
    });
    const periods = await Promise.all(
      [
        ['08:00', '09:00'],
        ['09:00', '10:00'],
        ['10:00', '11:00'],
      ].map(([startTime, endTime], index) =>
        prisma.timetablePeriod.create({
          data: {
            schoolId,
            timetableConfigId: config.id,
            periodIndex: index + 1,
            label: `P${index + 1}`,
            startTime,
            endTime,
          },
        }),
      ),
    );
    const timetableEntries = await Promise.all(
      Object.values(TimetableEntryStatus).map((status, index) =>
        prisma.timetableEntry.create({
          data: {
            schoolId,
            academicYearId: academic.academicYearId,
            termId: academic.termId,
            timetableConfigId: config.id,
            periodId: periods[index].id,
            dayOfWeek: index + 1,
            gradeId: academic.gradeId,
            sectionId: academic.sectionAId,
            classroomId: academic.classroomAId,
            subjectId: mathSubjectId,
            teacherUserId,
            teacherSubjectAllocationId: allocationId,
            status,
          },
        }),
      ),
    );
    const publication = await prisma.timetablePublication.create({
      data: {
        schoolId,
        academicYearId: academic.academicYearId,
        termId: academic.termId,
        timetableConfigId: config.id,
        status: TimetablePublicationStatus.PUBLISHED,
        revision: 7,
        publishedAt: new Date('2026-09-10T00:00:00.000Z'),
        publishedByUserId: teacherUserId,
      },
    });
    const curriculum = await prisma.curriculum.create({
      data: {
        schoolId,
        academicYearId: academic.academicYearId,
        termId: academic.termId,
        gradeId: academic.gradeId,
        subjectId: mathSubjectId,
        title: `${marker}-reassignment-curriculum`,
        createdByUserId: teacherUserId,
      },
    });
    const lessonPlans = await Promise.all(
      Object.values(LessonPlanStatus).map((status, index) =>
        prisma.lessonPlan.create({
          data: {
            schoolId,
            academicYearId: academic.academicYearId,
            termId: academic.termId,
            teacherSubjectAllocationId: allocationId,
            teacherUserId,
            classroomId: academic.classroomAId,
            subjectId: mathSubjectId,
            curriculumId: curriculum.id,
            title: `${marker}-plan-${status}`,
            status,
            weekStartDate: new Date(
              `2026-09-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
            ),
            weekEndDate: new Date(
              `2026-09-${String(index + 2).padStart(2, '0')}T00:00:00.000Z`,
            ),
            createdByUserId: teacherUserId,
          },
        }),
      ),
    );
    const homework = await Promise.all(
      Object.values(HomeworkAssignmentStatus).map((status, index) =>
        prisma.homeworkAssignment.create({
          data: {
            schoolId,
            academicYearId: academic.academicYearId,
            termId: academic.termId,
            classroomId: academic.classroomAId,
            subjectId: mathSubjectId,
            teacherUserId,
            teacherSubjectAllocationId: allocationId,
            title: `${marker}-homework-${status}`,
            status,
            dueAt: new Date(
              `2026-10-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`,
            ),
            createdByUserId: teacherUserId,
            publishedByUserId:
              status === HomeworkAssignmentStatus.DRAFT ? null : teacherUserId,
          },
        }),
      ),
    );
    const [studentRole, parentRole] = await Promise.all([
      findSystemRole('student'),
      findSystemRole('parent'),
    ]);
    const studentEmail = `${marker}-continuity-student@example.test`;
    const parentEmail = `${marker}-continuity-parent@example.test`;
    const [studentUserId, parentUserId] = await Promise.all([
      createUserWithMembership({
        email: studentEmail,
        firstName: 'Historical',
        lastName: 'Student',
        userType: UserType.STUDENT,
        roleId: studentRole.id,
      }),
      createUserWithMembership({
        email: parentEmail,
        firstName: 'Historical',
        lastName: 'Parent',
        userType: UserType.PARENT,
        roleId: parentRole.id,
      }),
    ]);
    const student = await prisma.student.create({
      data: {
        schoolId,
        organizationId,
        userId: studentUserId,
        firstName: 'Historical',
        lastName: 'Student',
        status: StudentStatus.ACTIVE,
      },
    });
    const guardian = await prisma.guardian.create({
      data: {
        schoolId,
        organizationId,
        userId: parentUserId,
        firstName: 'Historical',
        lastName: 'Parent',
        phone: `+2010${suffix.replace(/\D/gu, '').padEnd(8, '0').slice(0, 8)}`,
        relation: 'parent',
        isPrimary: true,
      },
    });
    await prisma.studentGuardian.create({
      data: {
        schoolId,
        studentId: student.id,
        guardianId: guardian.id,
        isPrimary: true,
      },
    });
    const enrollment = await prisma.enrollment.create({
      data: {
        schoolId,
        studentId: student.id,
        academicYearId: academic.academicYearId,
        termId: academic.termId,
        classroomId: academic.classroomAId,
        status: StudentEnrollmentStatus.ACTIVE,
        enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
      },
    });
    const reinforcementTasks = await Promise.all(
      [
        ReinforcementTaskStatus.COMPLETED,
        ReinforcementTaskStatus.CANCELLED,
      ].map(async (status) => {
        const task = await prisma.reinforcementTask.create({
          data: {
            schoolId,
            academicYearId: academic.academicYearId,
            termId: academic.termId,
            subjectId: mathSubjectId,
            titleEn: `${marker}-reinforcement-${status}`,
            source: ReinforcementSource.TEACHER,
            status,
            assignedById: teacherUserId,
            assignedByName: 'Mariam Ali',
            createdById: teacherUserId,
            cancelledById:
              status === ReinforcementTaskStatus.CANCELLED
                ? teacherUserId
                : null,
            cancelledAt:
              status === ReinforcementTaskStatus.CANCELLED
                ? new Date('2026-09-12T00:00:00.000Z')
                : null,
            cancellationReason:
              status === ReinforcementTaskStatus.CANCELLED
                ? 'historical_fixture'
                : null,
          },
        });
        const assignment = await prisma.reinforcementAssignment.create({
          data: {
            schoolId,
            taskId: task.id,
            academicYearId: academic.academicYearId,
            termId: academic.termId,
            studentId: student.id,
            enrollmentId: enrollment.id,
            status,
            progress: status === ReinforcementTaskStatus.COMPLETED ? 100 : 0,
            completedAt:
              status === ReinforcementTaskStatus.COMPLETED
                ? new Date('2026-09-11T00:00:00.000Z')
                : null,
            cancelledAt:
              status === ReinforcementTaskStatus.CANCELLED
                ? new Date('2026-09-12T00:00:00.000Z')
                : null,
          },
        });
        return { task, assignment };
      }),
    );
    const announcements = await Promise.all(
      [
        CommunicationAnnouncementStatus.PUBLISHED,
        CommunicationAnnouncementStatus.ARCHIVED,
        CommunicationAnnouncementStatus.CANCELLED,
      ].map((status) =>
        prisma.communicationAnnouncement.create({
          data: {
            schoolId,
            title: `${marker}-${status}`,
            body: 'Historical body must not be returned or changed.',
            status,
            createdById: teacherUserId,
            publishedById: teacherUserId,
            archivedById:
              status === CommunicationAnnouncementStatus.ARCHIVED
                ? teacherUserId
                : null,
            metadata: buildTeacherAnnouncementMetadata({
              target: {
                type: 'classroom',
                classId: allocationId,
                classroomId: academic.classroomAId,
                label: 'Class A',
              },
              audience: 'students',
            }),
          },
        }),
      ),
    );
    const assessment = await prisma.gradeAssessment.create({
      data: {
        schoolId,
        academicYearId: academic.academicYearId,
        termId: academic.termId,
        subjectId: mathSubjectId,
        scopeType: GradeScopeType.CLASSROOM,
        scopeKey: academic.classroomAId,
        classroomId: academic.classroomAId,
        titleEn: `${marker}-historical-assessment`,
        type: GradeAssessmentType.QUIZ,
        date: new Date('2026-09-15T00:00:00.000Z'),
        weight: 10,
        maxScore: 20,
        approvalStatus: GradeAssessmentApprovalStatus.APPROVED,
        publishedAt: new Date('2026-09-13T00:00:00.000Z'),
        publishedById: teacherUserId,
        approvedAt: new Date('2026-09-14T00:00:00.000Z'),
        approvedById: teacherUserId,
        lockedAt: new Date('2026-09-15T00:00:00.000Z'),
        lockedById: teacherUserId,
        createdById: teacherUserId,
      },
    });
    const attendanceSession = await prisma.attendanceSession.create({
      data: {
        schoolId,
        academicYearId: academic.academicYearId,
        termId: academic.termId,
        date: new Date('2026-09-16T00:00:00.000Z'),
        scopeType: AttendanceScopeType.CLASSROOM,
        scopeKey: academic.classroomAId,
        classroomId: academic.classroomAId,
        mode: AttendanceMode.DAILY,
        periodKey: `${marker}-historical-attendance`,
        status: AttendanceSessionStatus.SUBMITTED,
        submittedAt: new Date('2026-09-16T08:00:00.000Z'),
        submittedById: teacherUserId,
      },
    });
    const conversation = await prisma.communicationConversation.create({
      data: {
        schoolId,
        type: CommunicationConversationType.GROUP,
        status: CommunicationConversationStatus.ACTIVE,
        titleEn: `${marker}-historical-conversation`,
        classroomId: academic.classroomAId,
        subjectId: mathSubjectId,
        createdById: teacherUserId,
      },
    });
    await prisma.communicationConversationParticipant.createMany({
      data: [
        {
          schoolId,
          conversationId: conversation.id,
          userId: teacherUserId,
          role: CommunicationParticipantRole.OWNER,
          status: CommunicationParticipantStatus.ACTIVE,
        },
        {
          schoolId,
          conversationId: conversation.id,
          userId: targetTeacherUserId,
          role: CommunicationParticipantRole.MEMBER,
          status: CommunicationParticipantStatus.ACTIVE,
        },
      ],
    });
    const message = await prisma.communicationMessage.create({
      data: {
        schoolId,
        conversationId: conversation.id,
        senderUserId: teacherUserId,
        kind: CommunicationMessageKind.TEXT,
        status: CommunicationMessageStatus.SENT,
        body: 'Historical conversation content must remain unchanged.',
        clientMessageId: `${marker}-historical-message`,
      },
    });
    const [conversationBefore, participantsBefore, messageBefore] =
      await Promise.all([
        prisma.communicationConversation.findUniqueOrThrow({
          where: { id: conversation.id },
        }),
        prisma.communicationConversationParticipant.findMany({
          where: { conversationId: conversation.id },
          orderBy: { id: 'asc' },
        }),
        prisma.communicationMessage.findUniqueOrThrow({
          where: { id: message.id },
        }),
      ]);

    try {
      const preview = await request(app.getHttpServer())
        .post(
          `${GLOBAL_PREFIX}/academics/allocations/${allocationId}/reassignment-preview`,
        )
        .set('Authorization', bearer(adminAuth))
        .send({ newTeacherUserId: targetTeacherUserId })
        .expect(200);

      await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/academics/allocations/${allocationId}/reassign`)
        .set('Authorization', bearer(adminAuth))
        .send({
          newTeacherUserId: targetTeacherUserId,
          impactFingerprint: preview.body.impactFingerprint,
        })
        .expect(200)
        .expect((response) => {
          expect(response.body.transferred).toEqual({
            timetableEntries: 2,
            lessonPlans: 2,
            homeworkAssignments: 3,
          });
          expect(response.body.preservedHistorical).toMatchObject({
            cancelledTimetableEntries: 1,
            archivedLessonPlans: 1,
            cancelledOrArchivedHomeworkAssignments: 2,
            completedOrCancelledReinforcementTasks: 2,
            publishedArchivedOrCancelledAnnouncements: 3,
          });
        });

      const [
        persistedEntries,
        persistedPlans,
        persistedHomework,
        persistedConfig,
        persistedPublication,
        persistedAnnouncements,
        persistedReinforcementTasks,
        persistedCurriculum,
        persistedAssessment,
        persistedAttendance,
        persistedConversation,
        persistedParticipants,
        persistedMessage,
      ] = await Promise.all([
        prisma.timetableEntry.findMany({
          where: { id: { in: timetableEntries.map(({ id }) => id) } },
          select: { status: true, teacherUserId: true },
        }),
        prisma.lessonPlan.findMany({
          where: { id: { in: lessonPlans.map(({ id }) => id) } },
          select: {
            status: true,
            teacherUserId: true,
            createdByUserId: true,
          },
        }),
        prisma.homeworkAssignment.findMany({
          where: { id: { in: homework.map(({ id }) => id) } },
          select: {
            status: true,
            teacherUserId: true,
            createdByUserId: true,
            publishedByUserId: true,
          },
        }),
        prisma.timetableConfig.findUniqueOrThrow({ where: { id: config.id } }),
        prisma.timetablePublication.findUniqueOrThrow({
          where: { id: publication.id },
        }),
        prisma.communicationAnnouncement.findMany({
          where: { id: { in: announcements.map(({ id }) => id) } },
          select: {
            createdById: true,
            publishedById: true,
            archivedById: true,
          },
        }),
        prisma.reinforcementTask.findMany({
          where: {
            id: { in: reinforcementTasks.map(({ task }) => task.id) },
          },
          orderBy: { id: 'asc' },
          select: {
            id: true,
            status: true,
            assignedById: true,
            createdById: true,
            cancelledById: true,
          },
        }),
        prisma.curriculum.findUniqueOrThrow({ where: { id: curriculum.id } }),
        prisma.gradeAssessment.findUniqueOrThrow({
          where: { id: assessment.id },
          select: {
            createdById: true,
            publishedById: true,
            approvedById: true,
            lockedById: true,
          },
        }),
        prisma.attendanceSession.findUniqueOrThrow({
          where: { id: attendanceSession.id },
          select: { submittedById: true },
        }),
        prisma.communicationConversation.findUniqueOrThrow({
          where: { id: conversation.id },
        }),
        prisma.communicationConversationParticipant.findMany({
          where: { conversationId: conversation.id },
          orderBy: { id: 'asc' },
        }),
        prisma.communicationMessage.findUniqueOrThrow({
          where: { id: message.id },
        }),
      ]);
      for (const entry of persistedEntries) {
        expect(entry.teacherUserId).toBe(
          entry.status === TimetableEntryStatus.CANCELLED
            ? teacherUserId
            : targetTeacherUserId,
        );
      }
      for (const plan of persistedPlans) {
        expect(plan.teacherUserId).toBe(
          plan.status === LessonPlanStatus.ARCHIVED
            ? teacherUserId
            : targetTeacherUserId,
        );
        expect(plan.createdByUserId).toBe(teacherUserId);
      }
      for (const assignment of persistedHomework) {
        expect(assignment.teacherUserId).toBe(
          assignment.status === HomeworkAssignmentStatus.CANCELLED ||
            assignment.status === HomeworkAssignmentStatus.ARCHIVED
            ? teacherUserId
            : targetTeacherUserId,
        );
        expect(assignment.createdByUserId).toBe(teacherUserId);
        if (assignment.publishedByUserId) {
          expect(assignment.publishedByUserId).toBe(teacherUserId);
        }
      }
      expect(persistedConfig.status).toBe(TimetableConfigStatus.ACTIVE);
      expect(persistedPublication).toMatchObject({
        status: TimetablePublicationStatus.PUBLISHED,
        revision: 7,
        publishedByUserId: teacherUserId,
      });
      for (const announcement of persistedAnnouncements) {
        expect(announcement.createdById).toBe(teacherUserId);
        expect(announcement.publishedById).toBe(teacherUserId);
      }
      expect(persistedReinforcementTasks).toHaveLength(2);
      for (const task of persistedReinforcementTasks) {
        expect(task.assignedById).toBe(teacherUserId);
        expect(task.createdById).toBe(teacherUserId);
        if (task.status === ReinforcementTaskStatus.CANCELLED) {
          expect(task.cancelledById).toBe(teacherUserId);
        }
      }
      expect(persistedCurriculum.createdByUserId).toBe(teacherUserId);
      expect(persistedAssessment).toEqual({
        createdById: teacherUserId,
        publishedById: teacherUserId,
        approvedById: teacherUserId,
        lockedById: teacherUserId,
      });
      expect(persistedAttendance.submittedById).toBe(teacherUserId);
      expect(persistedConversation).toEqual(conversationBefore);
      expect(persistedParticipants).toEqual(participantsBefore);
      expect(persistedMessage).toEqual(messageBefore);

      const closedHomework = homework.find(
        ({ status }) => status === HomeworkAssignmentStatus.CLOSED,
      );
      const activeEntry = timetableEntries.find(
        ({ status }) => status === TimetableEntryStatus.ACTIVE,
      );
      if (!closedHomework || !activeEntry) {
        throw new Error('Expected operational reassignment fixtures');
      }
      const [sourceTeacherAuth, targetTeacherAuth, studentAuth, parentAuth] =
        await Promise.all([
          login(teacherEmail),
          login(targetTeacherEmail),
          login(studentEmail),
          login(parentEmail),
        ]);
      await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/teacher/homeworks/classes/${allocationId}/assignments/${closedHomework.id}`,
        )
        .set('Authorization', bearer(sourceTeacherAuth))
        .expect(404);
      await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/teacher/homeworks/classes/${allocationId}/assignments/${closedHomework.id}`,
        )
        .set('Authorization', bearer(targetTeacherAuth))
        .expect(200)
        .expect((response) => {
          expect(response.body).toMatchObject({ id: closedHomework.id });
        });
      const sourceSchedule = await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/teacher/schedule/week`)
        .query({ date: '2026-09-08' })
        .set('Authorization', bearer(sourceTeacherAuth))
        .expect(200);
      const targetSchedule = await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/teacher/schedule/week`)
        .query({ date: '2026-09-08' })
        .set('Authorization', bearer(targetTeacherAuth))
        .expect(200);
      expect(JSON.stringify(sourceSchedule.body)).not.toContain(activeEntry.id);
      expect(JSON.stringify(targetSchedule.body)).toContain(activeEntry.id);

      const studentSchedule = await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/student/schedule/week`)
        .query({ date: '2026-09-21' })
        .set('Authorization', bearer(studentAuth))
        .expect(200);
      expect(JSON.stringify(studentSchedule.body)).toContain(activeEntry.id);

      const parentSchedule = await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/parent/children/${student.id}/schedule/weekly`)
        .set('Authorization', bearer(parentAuth))
        .expect(200);
      expect(JSON.stringify(parentSchedule.body)).toContain(activeEntry.id);

      for (const role of ['student', 'parent']) {
        const sourceContacts = await request(app.getHttpServer())
          .get(`${GLOBAL_PREFIX}/teacher/messages/contacts`)
          .query({ role })
          .set('Authorization', bearer(sourceTeacherAuth))
          .expect(200);
        const targetContacts = await request(app.getHttpServer())
          .get(`${GLOBAL_PREFIX}/teacher/messages/contacts`)
          .query({ role })
          .set('Authorization', bearer(targetTeacherAuth))
          .expect(200);
        const expectedContactId =
          role === 'student'
            ? `student:${student.id}`
            : `guardian:${guardian.id}`;
        // Contacts are classroom-scoped. The source teacher retains another
        // allocation in this classroom, while the target gains this one.
        expect(JSON.stringify(sourceContacts.body)).toContain(
          expectedContactId,
        );
        expect(JSON.stringify(targetContacts.body)).toContain(
          expectedContactId,
        );
      }

      await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/teacher/classroom/${allocationId}/grades/assessments`,
        )
        .set('Authorization', bearer(sourceTeacherAuth))
        .expect(404);
      await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/teacher/classroom/${allocationId}/grades/assessments`,
        )
        .set('Authorization', bearer(targetTeacherAuth))
        .expect(200)
        .expect((response) => {
          expect(JSON.stringify(response.body)).toContain(assessment.id);
        });

      await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/teacher/classroom/${allocationId}/attendance/roster`,
        )
        .query({ date: '2026-09-16' })
        .set('Authorization', bearer(sourceTeacherAuth))
        .expect(404);
      await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/teacher/classroom/${allocationId}/attendance/roster`,
        )
        .query({ date: '2026-09-16' })
        .set('Authorization', bearer(targetTeacherAuth))
        .expect(200)
        .expect((response) => {
          expect(JSON.stringify(response.body)).toContain(student.id);
        });
    } finally {
      await prisma.auditLog.deleteMany({ where: { resourceId: allocationId } });
      await prisma.communicationMessage.deleteMany({
        where: { id: message.id },
      });
      await prisma.communicationConversationParticipant.deleteMany({
        where: { conversationId: conversation.id },
      });
      await prisma.communicationConversation.deleteMany({
        where: { id: conversation.id },
      });
      await prisma.attendanceSession.deleteMany({
        where: { id: attendanceSession.id },
      });
      await prisma.gradeAssessment.deleteMany({
        where: { id: assessment.id },
      });
      await prisma.communicationAnnouncement.deleteMany({
        where: { id: { in: announcements.map(({ id }) => id) } },
      });
      await prisma.reinforcementAssignment.deleteMany({
        where: {
          id: {
            in: reinforcementTasks.map(({ assignment }) => assignment.id),
          },
        },
      });
      await prisma.reinforcementTask.deleteMany({
        where: { id: { in: reinforcementTasks.map(({ task }) => task.id) } },
      });
      await prisma.homeworkAssignment.deleteMany({
        where: { id: { in: homework.map(({ id }) => id) } },
      });
      await prisma.lessonPlan.deleteMany({
        where: { id: { in: lessonPlans.map(({ id }) => id) } },
      });
      await prisma.curriculum.deleteMany({ where: { id: curriculum.id } });
      await prisma.studentGuardian.deleteMany({
        where: { studentId: student.id },
      });
      await prisma.guardian.deleteMany({ where: { id: guardian.id } });
      await prisma.enrollment.deleteMany({ where: { id: enrollment.id } });
      await prisma.student.deleteMany({ where: { id: student.id } });
      await prisma.timetablePublication.deleteMany({
        where: { id: publication.id },
      });
      await prisma.timetableEntry.deleteMany({
        where: { id: { in: timetableEntries.map(({ id }) => id) } },
      });
      await prisma.timetablePeriod.deleteMany({
        where: { id: { in: periods.map(({ id }) => id) } },
      });
      await prisma.timetableConfig.deleteMany({ where: { id: config.id } });
      await prisma.teacherSubjectAllocation.deleteMany({
        where: { id: allocationId },
      });
    }
  });

  it('rejects a stale fingerprint before any ownership handoff', async () => {
    const allocationId = await createTeacherAllocationDirect({
      termId: academic.termId,
      subjectId: scienceSubjectId,
      classroomId: academic.classroomBId,
    });
    let duplicateId: string | undefined;

    try {
      const preview = await request(app.getHttpServer())
        .post(
          `${GLOBAL_PREFIX}/academics/allocations/${allocationId}/reassignment-preview`,
        )
        .set('Authorization', bearer(adminAuth))
        .send({ newTeacherUserId: targetTeacherUserId })
        .expect(200);
      duplicateId = (
        await prisma.teacherSubjectAllocation.create({
          data: {
            schoolId,
            teacherUserId: targetTeacherUserId,
            subjectId: scienceSubjectId,
            classroomId: academic.classroomBId,
            termId: academic.termId,
          },
          select: { id: true },
        })
      ).id;

      await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/academics/allocations/${allocationId}/reassign`)
        .set('Authorization', bearer(adminAuth))
        .send({
          newTeacherUserId: targetTeacherUserId,
          impactFingerprint: preview.body.impactFingerprint,
        })
        .expect(409)
        .expect((response) => {
          expect(response.body.error?.code).toBe(
            'academics.allocation.reassignment_stale_preview',
          );
        });

      await expect(
        prisma.teacherSubjectAllocation.findUniqueOrThrow({
          where: { id: allocationId },
          select: { teacherUserId: true },
        }),
      ).resolves.toEqual({ teacherUserId });
      await expect(
        prisma.auditLog.count({
          where: {
            action: 'academics.allocation.reassign',
            resourceId: allocationId,
            outcome: 'SUCCESS',
          },
        }),
      ).resolves.toBe(0);
    } finally {
      await prisma.teacherSubjectAllocation.deleteMany({
        where: {
          id: { in: [allocationId, ...(duplicateId ? [duplicateId] : [])] },
        },
      });
    }
  });

  it('validates execute fingerprint and reason code narrowly', async () => {
    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/academics/allocations/${closedTermAllocationId}/reassign`,
      )
      .set('Authorization', bearer(adminAuth))
      .send({
        newTeacherUserId: targetTeacherUserId,
        impactFingerprint: 'A'.repeat(64),
        reasonCode: 'contains spaces',
      })
      .expect(400);
  });

  it('bulk saves allocations using the subject allocation matrix', async () => {
    const response = await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/academics/allocations/bulk`)
      .set('Authorization', bearer(adminAuth))
      .send({
        termId: academic.termId,
        items: [
          {
            teacherUserId,
            subjectId: mathSubjectId,
            classroomId: academic.classroomAId,
          },
          {
            teacherUserId,
            subjectId: mathSubjectId,
            classroomId: academic.classroomBId,
          },
        ],
      })
      .expect(200);

    expect(response.body.items).toHaveLength(2);
    expect(response.body.summary).toEqual({
      requestedCount: 2,
      createdCount: 2,
      existingCount: 0,
    });
    expectSafeAllocationPayload(response.body);
  });

  it('rejects duplicate pairs and missing subject allocation matrix rows for writes', async () => {
    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/academics/allocations/bulk`)
      .set('Authorization', bearer(adminAuth))
      .send({
        termId: academic.termId,
        items: [
          {
            teacherUserId,
            subjectId: mathSubjectId,
            classroomId: academic.classroomAId,
          },
          {
            teacherUserId,
            subjectId: mathSubjectId,
            classroomId: academic.classroomAId,
          },
        ],
      })
      .expect(422)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.allocation.duplicate_pair',
        );
      });

    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/academics/allocations/bulk`)
      .set('Authorization', bearer(adminAuth))
      .send({
        termId: academic.termId,
        items: [
          {
            teacherUserId,
            subjectId: missingMatrixSubjectId,
            classroomId: academic.classroomAId,
          },
        ],
      })
      .expect(422)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.allocation.missing_subject_allocation',
        );
      });
  });

  it('applies a teacher and subject to all classrooms in a grade', async () => {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/allocations/apply-to-grade`)
      .set('Authorization', bearer(adminAuth))
      .send({
        termId: academic.termId,
        gradeId: academic.gradeId,
        subjectId: scienceSubjectId,
        teacherUserId,
      })
      .expect(201);

    expect(response.body.items).toHaveLength(2);
    expect(response.body.summary).toEqual({
      requestedClassrooms: 2,
      createdCount: 2,
      existingCount: 0,
    });
    expect(
      response.body.items.map(
        (item: { classroom: { id: string } }) => item.classroom.id,
      ),
    ).toEqual(
      expect.arrayContaining([academic.classroomAId, academic.classroomBId]),
    );
  });

  it('clear-subject removes only intended allocations and validation reports incomplete then complete states', async () => {
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/allocations/clear-subject`)
      .set('Authorization', bearer(adminAuth))
      .send({
        termId: academic.termId,
        gradeId: academic.gradeId,
        subjectId: mathSubjectId,
      })
      .expect(201)
      .expect((response) => {
        expect(response.body).toEqual({ ok: true, deletedCount: 2 });
      });

    const incomplete = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/allocations/validation`)
      .query({
        termId: academic.termId,
        gradeId: academic.gradeId,
        subjectId: mathSubjectId,
      })
      .set('Authorization', bearer(adminAuth))
      .expect(200);
    expect(incomplete.body.items[0]).toMatchObject({
      status: 'incomplete',
      missingClassroomCount: 2,
    });
    expect(incomplete.body.summary.missingTeacherAssignments).toBe(2);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/allocations/apply-to-grade`)
      .set('Authorization', bearer(adminAuth))
      .send({
        termId: academic.termId,
        gradeId: academic.gradeId,
        subjectId: mathSubjectId,
        teacherUserId,
      })
      .expect(201);

    const complete = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/allocations/validation`)
      .query({
        termId: academic.termId,
        gradeId: academic.gradeId,
        subjectId: mathSubjectId,
      })
      .set('Authorization', bearer(adminAuth))
      .expect(200);
    expect(complete.body.items[0]).toMatchObject({
      status: 'complete',
      missingClassroomCount: 0,
    });
    expect(complete.body.summary.missingTeacherAssignments).toBe(0);
    expectSafeAllocationPayload(complete.body);
  });

  it('teacher-loads sums weekly hours from the subject allocation matrix', async () => {
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/academics/allocations/teacher-loads`)
      .query({ termId: academic.termId, teacherUserId })
      .set('Authorization', bearer(adminAuth))
      .expect(200);

    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0]).toMatchObject({
      teacherUserId,
      allocationCount: 4,
      totalWeeklyHours: 16,
      classroomsCount: 2,
      subjectsCount: 2,
      warnings: [],
    });
    expect(response.body.items[0].teacher).toEqual({
      id: teacherUserId,
      firstName: 'Mariam',
      lastName: 'Ali',
    });
    expectSafeAllocationPayload(response.body);
    expect(JSON.stringify(response.body)).not.toContain(
      `${marker}-teacher@example.test`,
    );
  });

  it('returns bounded dependency conflicts and commits none of a blocked curriculum request', async () => {
    const where = { schoolId, termId: academic.termId };
    const before = await prisma.subjectAllocation.findMany({
      where,
      orderBy: { id: 'asc' },
    });
    const response = await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/academics/subject-allocations/bulk`)
      .set('Authorization', bearer(adminAuth))
      .send({
        termId: academic.termId,
        items: [
          {
            gradeId: academic.gradeId,
            subjectId: scienceSubjectId,
            weeklyHours: 4,
          },
          {
            gradeId: academic.gradeId,
            subjectId: mathSubjectId,
            weeklyHours: 0,
          },
        ],
      })
      .expect(409);
    expect(response.body.error.code).toBe(
      'academics.subject_allocation.dependency_conflict',
    );
    expect(response.body.error.details).toEqual({
      termId: academic.termId,
      gradeId: academic.gradeId,
      subjectId: mathSubjectId,
      mutation: 'DEACTIVATE',
      previousWeeklyHours: 5,
      proposedWeeklyHours: 0,
      teacherAllocationCount: 2,
      draftTimetableEntryCount: 0,
      publishedTimetableEntryCount: 0,
      publishedTimetableConfigCount: 0,
    });
    expect(
      await prisma.subjectAllocation.findMany({
        where,
        orderBy: { id: 'asc' },
      }),
    ).toEqual(before);
  });

  it('rejects zero-hour teaching writes and surfaces stale assignments without workload or missing-teacher debt', async () => {
    const where = {
      schoolId,
      termId: academic.termId,
      gradeId: academic.gradeId,
      subjectId: mathSubjectId,
    };
    await prisma.subjectAllocation.updateMany({
      where,
      data: { weeklyHours: 0 },
    });
    const before = await prisma.teacherSubjectAllocation.findMany({
      where: { schoolId },
      orderBy: { id: 'asc' },
    });
    try {
      const item = {
        classroomId: academic.classroomAId,
        teacherUserId,
        subjectId: mathSubjectId,
      };
      const writes = [
        () =>
          request(app.getHttpServer())
            .post(`${GLOBAL_PREFIX}/academics/allocations`)
            .send({ termId: academic.termId, ...item }),
        () =>
          request(app.getHttpServer())
            .put(`${GLOBAL_PREFIX}/academics/allocations/bulk`)
            .send({ termId: academic.termId, items: [item] }),
        () =>
          request(app.getHttpServer())
            .post(`${GLOBAL_PREFIX}/academics/allocations/apply-to-grade`)
            .send({
              termId: academic.termId,
              gradeId: academic.gradeId,
              teacherUserId,
              subjectId: mathSubjectId,
            }),
      ];
      for (const write of writes) {
        const response = await write()
          .set('Authorization', bearer(adminAuth))
          .expect(422);
        expect(response.body.error.code).toBe(
          'academics.subject_allocation.subject_not_taught',
        );
        expect(response.body.error.details).toEqual({
          termId: academic.termId,
          gradeId: academic.gradeId,
          subjectId: mathSubjectId,
        });
      }
      const validation = await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/academics/allocations/validation`)
        .query({
          termId: academic.termId,
          gradeId: academic.gradeId,
          subjectId: mathSubjectId,
        })
        .set('Authorization', bearer(adminAuth))
        .expect(200);
      expect(validation.body.summary.missingTeacherAssignments).toBe(0);
      expect(validation.body.items[0]).toMatchObject({
        status: 'incomplete',
        missingClassroomCount: 0,
        allocatedClassroomCount: 0,
        issues: [{ code: 'subject_not_taught' }],
      });
      const load = await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/academics/allocations/teacher-loads`)
        .query({ termId: academic.termId, teacherUserId })
        .set('Authorization', bearer(adminAuth))
        .expect(200);
      expect(load.body.items[0].totalWeeklyHours).toBe(6);
      expect(load.body.items[0].warnings).toHaveLength(2);
      expect(
        load.body.items[0].warnings.every(
          (warning: { code: string }) => warning.code === 'subject_not_taught',
        ),
      ).toBe(true);
      expect(
        await prisma.teacherSubjectAllocation.findMany({
          where: { schoolId },
          orderBy: { id: 'asc' },
        }),
      ).toEqual(before);
    } finally {
      await prisma.subjectAllocation.updateMany({
        where,
        data: { weeklyHours: 5 },
      });
    }
  });

  it('denies closed-term preview, create, delete, bulk, apply, and clear operations', async () => {
    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/academics/allocations/${closedTermAllocationId}/reassignment-preview`,
      )
      .set('Authorization', bearer(adminAuth))
      .send({ newTeacherUserId: targetTeacherUserId })
      .expect(409)
      .expect((response) => {
        const body = response.body as unknown as {
          error?: { code?: string };
        };
        expect(body.error?.code).toBe('academics.allocation.closed_term');
      });

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/allocations`)
      .set('Authorization', bearer(adminAuth))
      .send({
        teacherUserId,
        subjectId: mathSubjectId,
        classroomId: academic.classroomAId,
        termId: academic.closedTermId,
      })
      .expect(409)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.allocation.closed_term',
        );
      });

    await request(app.getHttpServer())
      .delete(
        `${GLOBAL_PREFIX}/academics/allocations/${closedTermAllocationId}`,
      )
      .set('Authorization', bearer(adminAuth))
      .expect(409)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'academics.allocation.closed_term',
        );
      });

    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/academics/allocations/bulk`)
      .set('Authorization', bearer(adminAuth))
      .send({
        termId: academic.closedTermId,
        items: [
          {
            teacherUserId,
            subjectId: mathSubjectId,
            classroomId: academic.classroomAId,
          },
        ],
      })
      .expect(409);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/allocations/apply-to-grade`)
      .set('Authorization', bearer(adminAuth))
      .send({
        termId: academic.closedTermId,
        gradeId: academic.gradeId,
        subjectId: mathSubjectId,
        teacherUserId,
      })
      .expect(409);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/academics/allocations/clear-subject`)
      .set('Authorization', bearer(adminAuth))
      .send({
        termId: academic.closedTermId,
        gradeId: academic.gradeId,
        subjectId: mathSubjectId,
      })
      .expect(409);
  });

  async function findSystemRole(key: string): Promise<{ id: string }> {
    const role = await prisma.role.findFirst({
      where: { key, schoolId: null, isSystem: true, deletedAt: null },
      select: { id: true },
    });
    if (!role) throw new Error(`Missing system role: ${key}`);
    return role;
  }

  async function findOrCreatePermission(params: {
    code: string;
    resource: string;
    action: string;
    description: string;
  }): Promise<{ id: string }> {
    const permission = await prisma.permission.findUnique({
      where: { code: params.code },
      select: { id: true },
    });
    if (permission) return permission;

    const created = await prisma.permission.create({
      data: {
        code: params.code,
        module: 'academics',
        resource: params.resource,
        action: params.action,
        description: params.description,
      },
      select: { id: true },
    });
    createdPermissionIds.push(created.id);
    return created;
  }

  async function createOrganization(): Promise<string> {
    const organization = await prisma.organization.create({
      data: {
        slug: `${marker}-org`,
        name: `Sprint 22C Allocation Org ${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);
    return organization.id;
  }

  async function createSchool(inputOrganizationId: string): Promise<string> {
    const school = await prisma.school.create({
      data: {
        organizationId: inputOrganizationId,
        slug: `${marker}-school`,
        name: `Sprint 22C Allocation School ${suffix}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdSchoolIds.push(school.id);
    return school.id;
  }

  async function createCustomRole(params: {
    key: string;
    name: string;
    permissionIds: string[];
  }): Promise<string> {
    const role = await prisma.role.create({
      data: {
        schoolId,
        key: params.key,
        name: params.name,
        description: 'Teacher allocation workflow e2e test role',
        isSystem: false,
      },
      select: { id: true },
    });
    createdRoleIds.push(role.id);

    await prisma.rolePermission.createMany({
      data: params.permissionIds.map((permissionId) => ({
        roleId: role.id,
        permissionId,
      })),
    });

    return role.id;
  }

  async function createUserWithMembership(params: {
    email: string;
    firstName: string;
    lastName: string;
    userType: UserType;
    roleId: string;
  }): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: params.email,
        firstName: params.firstName,
        lastName: params.lastName,
        userType: params.userType,
        status: UserStatus.ACTIVE,
        passwordHash: await argon2.hash(PASSWORD, ARGON2_OPTIONS),
      },
      select: { id: true },
    });
    createdUserIds.push(user.id);

    await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId,
        schoolId,
        roleId: params.roleId,
        userType: params.userType,
        status: MembershipStatus.ACTIVE,
      },
    });

    return user.id;
  }

  async function createAcademicBase(
    inputSchoolId: string,
  ): Promise<AcademicBase> {
    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId: inputSchoolId,
        nameAr: `${marker}-year-ar`,
        nameEn: `${marker}-year`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-06-30T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    const term = await prisma.term.create({
      data: {
        schoolId: inputSchoolId,
        academicYearId: academicYear.id,
        nameAr: `${marker}-term-ar`,
        nameEn: `${marker}-term`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    const closedTerm = await prisma.term.create({
      data: {
        schoolId: inputSchoolId,
        academicYearId: academicYear.id,
        nameAr: `${marker}-closed-term-ar`,
        nameEn: `${marker}-closed-term`,
        startDate: new Date('2027-01-01T00:00:00.000Z'),
        endDate: new Date('2027-03-31T00:00:00.000Z'),
        isActive: false,
      },
      select: { id: true },
    });
    const stage = await prisma.stage.create({
      data: {
        schoolId: inputSchoolId,
        nameAr: `${marker}-stage-ar`,
        nameEn: `${marker}-stage`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const grade = await prisma.grade.create({
      data: {
        schoolId: inputSchoolId,
        stageId: stage.id,
        nameAr: `${marker}-grade-ar`,
        nameEn: `${marker}-grade`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const sectionA = await prisma.section.create({
      data: {
        schoolId: inputSchoolId,
        gradeId: grade.id,
        nameAr: `${marker}-section-a-ar`,
        nameEn: `${marker}-section-a`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const sectionB = await prisma.section.create({
      data: {
        schoolId: inputSchoolId,
        gradeId: grade.id,
        nameAr: `${marker}-section-b-ar`,
        nameEn: `${marker}-section-b`,
        sortOrder: 2,
      },
      select: { id: true },
    });
    const classroomA = await prisma.classroom.create({
      data: {
        schoolId: inputSchoolId,
        sectionId: sectionA.id,
        nameAr: `${marker}-classroom-a-ar`,
        nameEn: `${marker}-classroom-a`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    const classroomB = await prisma.classroom.create({
      data: {
        schoolId: inputSchoolId,
        sectionId: sectionB.id,
        nameAr: `${marker}-classroom-b-ar`,
        nameEn: `${marker}-classroom-b`,
        sortOrder: 2,
      },
      select: { id: true },
    });

    return {
      academicYearId: academicYear.id,
      termId: term.id,
      closedTermId: closedTerm.id,
      stageId: stage.id,
      gradeId: grade.id,
      sectionAId: sectionA.id,
      sectionBId: sectionB.id,
      classroomAId: classroomA.id,
      classroomBId: classroomB.id,
    };
  }

  async function createSubject(
    label: string,
    nameEn: string,
    color: string,
  ): Promise<string> {
    const subject = await prisma.subject.create({
      data: {
        schoolId,
        nameAr: `${marker}-${label}-ar`,
        nameEn,
        code: `${marker}-${label.toUpperCase()}`,
        color,
        isActive: true,
      },
      select: { id: true },
    });

    return subject.id;
  }

  async function createSubjectAllocation(params: {
    termId: string;
    subjectId: string;
    weeklyHours: number;
  }): Promise<string> {
    const allocation = await prisma.subjectAllocation.create({
      data: {
        schoolId,
        academicYearId: academic.academicYearId,
        termId: params.termId,
        gradeId: academic.gradeId,
        subjectId: params.subjectId,
        weeklyHours: params.weeklyHours,
      },
      select: { id: true },
    });

    return allocation.id;
  }

  async function createTeacherAllocationDirect(params: {
    termId: string;
    subjectId: string;
    classroomId: string;
  }): Promise<string> {
    const allocation = await prisma.teacherSubjectAllocation.create({
      data: {
        schoolId,
        teacherUserId,
        subjectId: params.subjectId,
        classroomId: params.classroomId,
        termId: params.termId,
      },
      select: { id: true },
    });

    return allocation.id;
  }

  async function login(email: string): Promise<AuthTokens> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password: PASSWORD })
      .expect(200);

    return {
      accessToken: response.body.accessToken,
      refreshToken: response.body.refreshToken,
    };
  }

  function listRegisteredRoutes(): string[] {
    const expressApp = app.getHttpAdapter().getInstance() as {
      _router?: { stack?: ExpressLayer[] };
      router?: { stack?: ExpressLayer[] };
    };
    const stack = expressApp._router?.stack ?? expressApp.router?.stack ?? [];
    const routes: string[] = [];

    collectRoutes(stack, routes);

    return routes.sort();
  }

  function collectRoutes(layers: ExpressLayer[], routes: string[]): void {
    for (const layer of layers) {
      if (layer.route?.path && layer.route.methods) {
        const paths = Array.isArray(layer.route.path)
          ? layer.route.path
          : [layer.route.path];
        const methods = Object.entries(layer.route.methods)
          .filter(([, enabled]) => enabled)
          .map(([method]) => method.toUpperCase());

        for (const path of paths) {
          for (const method of methods) {
            routes.push(`${method} ${normalizeRoutePath(path)}`);
          }
        }
      }

      if (layer.handle?.stack) {
        collectRoutes(layer.handle.stack, routes);
      }
    }
  }

  function normalizeRoutePath(path: string): string {
    return `/${path}`.replace(/\/{2,}/g, '/');
  }

  function bearer(tokens: AuthTokens): string {
    return `Bearer ${tokens.accessToken}`;
  }

  function expectSafeAllocationPayload(value: unknown): void {
    for (const forbiddenKey of [
      'schoolId',
      'organizationId',
      'membershipId',
      'roleId',
      'passwordHash',
    ]) {
      expectNoObjectKey(value, forbiddenKey);
    }
  }

  function expectNoObjectKey(value: unknown, forbiddenKey: string): void {
    if (!value || typeof value !== 'object') return;

    if (Array.isArray(value)) {
      for (const item of value) expectNoObjectKey(item, forbiddenKey);
      return;
    }

    for (const [key, nested] of Object.entries(value)) {
      expect(key).not.toBe(forbiddenKey);
      expectNoObjectKey(nested, forbiddenKey);
    }
  }

  async function cleanupE2eData(): Promise<void> {
    if (!prisma) return;

    await prisma.session.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { actorId: { in: createdUserIds } },
          { schoolId: { in: createdSchoolIds } },
          { organizationId: { in: createdOrganizationIds } },
        ],
      },
    });
    await prisma.teacherProfile.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.teacherSubjectAllocation.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.subjectAllocation.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.subject.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.classroom.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.section.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.grade.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.stage.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.term.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.academicYear.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.membership.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: createdUserIds } },
    });
    await prisma.rolePermission.deleteMany({
      where: { roleId: { in: createdRoleIds } },
    });
    await prisma.role.deleteMany({
      where: { id: { in: createdRoleIds } },
    });
    await prisma.permission.deleteMany({
      where: { id: { in: createdPermissionIds } },
    });
    await prisma.school.deleteMany({
      where: { id: { in: createdSchoolIds } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: createdOrganizationIds } },
    });
  }
});
