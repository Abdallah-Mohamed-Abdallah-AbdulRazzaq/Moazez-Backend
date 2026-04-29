import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  PrismaClient,
  ReinforcementTaskStatus,
  StudentEnrollmentStatus,
  StudentStatus,
} from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';

const GLOBAL_PREFIX = '/api/v1';

const DEMO_ADMIN_EMAIL = 'admin@academy.moazez.dev';
const DEMO_ADMIN_PASSWORD = 'School123!';
const DEMO_SCHOOL_SLUG = 'moazez-academy';

jest.setTimeout(30000);

describe('Reinforcement Foundation closeout flow (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let demoSchoolId: string;
  let demoOrganizationId: string;

  const cleanupState = {
    templateIds: new Set<string>(),
    taskIds: new Set<string>(),
    submissionIds: new Set<string>(),
    reviewIds: new Set<string>(),
    xpPolicyIds: new Set<string>(),
    xpLedgerIds: new Set<string>(),
    enrollmentIds: new Set<string>(),
    studentIds: new Set<string>(),
    subjectIds: new Set<string>(),
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
    if (prisma) {
      const templateIds = [...cleanupState.templateIds];
      const taskIds = [...cleanupState.taskIds];
      const submissionIds = [...cleanupState.submissionIds];
      const reviewIds = [...cleanupState.reviewIds];
      const xpPolicyIds = [...cleanupState.xpPolicyIds];
      const xpLedgerIds = [...cleanupState.xpLedgerIds];
      const studentIds = [...cleanupState.studentIds];

      const auditResourceIds = [
        ...templateIds,
        ...taskIds,
        ...submissionIds,
        ...reviewIds,
        ...xpPolicyIds,
        ...xpLedgerIds,
      ];
      if (auditResourceIds.length > 0) {
        await prisma.auditLog.deleteMany({
          where: {
            resourceId: { in: auditResourceIds },
            action: {
              in: [
                'reinforcement.task.create',
                'reinforcement.task.duplicate',
                'reinforcement.task.cancel',
                'reinforcement.template.create',
                'reinforcement.submission.submit',
                'reinforcement.review.approve',
                'reinforcement.review.reject',
                'reinforcement.xp.policy.create',
                'reinforcement.xp.grant',
                'reinforcement.xp.manual_bonus',
              ],
            },
          },
        });
      }

      if (xpLedgerIds.length > 0 || studentIds.length > 0) {
        await prisma.xpLedger.deleteMany({
          where: {
            OR: [
              ...(xpLedgerIds.length > 0 ? [{ id: { in: xpLedgerIds } }] : []),
              ...(studentIds.length > 0
                ? [{ studentId: { in: studentIds } }]
                : []),
            ],
          },
        });
      }

      if (xpPolicyIds.length > 0) {
        await prisma.xpPolicy.deleteMany({
          where: { id: { in: xpPolicyIds } },
        });
      }

      if (submissionIds.length > 0 || taskIds.length > 0) {
        await prisma.reinforcementSubmission.updateMany({
          where: {
            OR: [
              ...(submissionIds.length > 0
                ? [{ id: { in: submissionIds } }]
                : []),
              ...(taskIds.length > 0 ? [{ taskId: { in: taskIds } }] : []),
            ],
          },
          data: { currentReviewId: null },
        });
      }

      if (reviewIds.length > 0 || taskIds.length > 0) {
        await prisma.reinforcementReview.deleteMany({
          where: {
            OR: [
              ...(reviewIds.length > 0 ? [{ id: { in: reviewIds } }] : []),
              ...(taskIds.length > 0 ? [{ taskId: { in: taskIds } }] : []),
            ],
          },
        });
      }

      if (submissionIds.length > 0 || taskIds.length > 0) {
        await prisma.reinforcementSubmission.deleteMany({
          where: {
            OR: [
              ...(submissionIds.length > 0
                ? [{ id: { in: submissionIds } }]
                : []),
              ...(taskIds.length > 0 ? [{ taskId: { in: taskIds } }] : []),
            ],
          },
        });
      }

      if (taskIds.length > 0 || studentIds.length > 0) {
        await prisma.reinforcementAssignment.deleteMany({
          where: {
            OR: [
              ...(taskIds.length > 0 ? [{ taskId: { in: taskIds } }] : []),
              ...(studentIds.length > 0
                ? [{ studentId: { in: studentIds } }]
                : []),
            ],
          },
        });
      }

      if (taskIds.length > 0) {
        await prisma.reinforcementTaskTarget.deleteMany({
          where: { taskId: { in: taskIds } },
        });
        await prisma.reinforcementTaskStage.deleteMany({
          where: { taskId: { in: taskIds } },
        });
        await prisma.reinforcementTask.deleteMany({
          where: { id: { in: taskIds } },
        });
      }

      if (templateIds.length > 0) {
        await prisma.reinforcementTaskTemplateStage.deleteMany({
          where: { templateId: { in: templateIds } },
        });
        await prisma.reinforcementTaskTemplate.deleteMany({
          where: { id: { in: templateIds } },
        });
      }

      if (cleanupState.enrollmentIds.size > 0) {
        await prisma.enrollment.deleteMany({
          where: { id: { in: [...cleanupState.enrollmentIds] } },
        });
      }

      if (studentIds.length > 0) {
        await prisma.student.deleteMany({
          where: { id: { in: studentIds } },
        });
      }

      if (cleanupState.subjectIds.size > 0) {
        await prisma.subject.deleteMany({
          where: { id: { in: [...cleanupState.subjectIds] } },
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

  async function createReinforcementPrerequisites(): Promise<{
    academicYearId: string;
    termId: string;
    dueDate: string;
    stageId: string;
    gradeId: string;
    sectionId: string;
    classroomId: string;
    subjectId: string;
    firstStudentId: string;
    secondStudentId: string;
    firstEnrollmentId: string;
    secondEnrollmentId: string;
  }> {
    const suffix = randomUUID().split('-')[0];
    let academicYear = await prisma.academicYear.findFirst({
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

    if (!academicYear) {
      academicYear = await prisma.academicYear.create({
        data: {
          schoolId: demoSchoolId,
          nameAr: `Sprint 5A Year ${suffix} AR`,
          nameEn: `Sprint 5A Year ${suffix}`,
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
      cleanupState.academicYearIds.add(academicYear.id);
    }

    let term = academicYear.terms[0];
    if (!term) {
      term = await prisma.term.create({
        data: {
          schoolId: demoSchoolId,
          academicYearId: academicYear.id,
          nameAr: `Sprint 5A Term ${suffix} AR`,
          nameEn: `Sprint 5A Term ${suffix}`,
          startDate: academicYear.startDate,
          endDate: academicYear.endDate,
          isActive: true,
        },
        select: {
          id: true,
          startDate: true,
          endDate: true,
        },
      });
      cleanupState.termIds.add(term.id);
    }

    const stage = await prisma.stage.create({
      data: {
        schoolId: demoSchoolId,
        nameAr: `Sprint 5A Stage ${suffix} AR`,
        nameEn: `Sprint 5A Stage ${suffix}`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    cleanupState.stageIds.add(stage.id);

    const grade = await prisma.grade.create({
      data: {
        schoolId: demoSchoolId,
        stageId: stage.id,
        nameAr: `Sprint 5A Grade ${suffix} AR`,
        nameEn: `Sprint 5A Grade ${suffix}`,
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
        nameAr: `Sprint 5A Section ${suffix} AR`,
        nameEn: `Sprint 5A Section ${suffix}`,
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
        nameAr: `Sprint 5A Classroom ${suffix} AR`,
        nameEn: `Sprint 5A Classroom ${suffix}`,
        sortOrder: 1,
        capacity: 24,
      },
      select: { id: true },
    });
    cleanupState.classroomIds.add(classroom.id);

    const subject = await prisma.subject.create({
      data: {
        schoolId: demoSchoolId,
        nameAr: `Sprint 5A Reinforcement ${suffix} AR`,
        nameEn: `Sprint 5A Reinforcement ${suffix}`,
        code: `S5A-${suffix}`,
        color: '#0f766e',
        isActive: true,
      },
      select: { id: true },
    });
    cleanupState.subjectIds.add(subject.id);

    const [firstStudent, secondStudent] = await Promise.all([
      prisma.student.create({
        data: {
          schoolId: demoSchoolId,
          organizationId: demoOrganizationId,
          firstName: `Sprint 5A First ${suffix}`,
          lastName: 'Student',
          status: StudentStatus.ACTIVE,
        },
        select: { id: true },
      }),
      prisma.student.create({
        data: {
          schoolId: demoSchoolId,
          organizationId: demoOrganizationId,
          firstName: `Sprint 5A Second ${suffix}`,
          lastName: 'Student',
          status: StudentStatus.ACTIVE,
        },
        select: { id: true },
      }),
    ]);
    cleanupState.studentIds.add(firstStudent.id);
    cleanupState.studentIds.add(secondStudent.id);

    const [firstEnrollment, secondEnrollment] = await Promise.all([
      prisma.enrollment.create({
        data: {
          schoolId: demoSchoolId,
          studentId: firstStudent.id,
          academicYearId: academicYear.id,
          termId: term.id,
          classroomId: classroom.id,
          status: StudentEnrollmentStatus.ACTIVE,
          enrolledAt: term.startDate,
        },
        select: { id: true },
      }),
      prisma.enrollment.create({
        data: {
          schoolId: demoSchoolId,
          studentId: secondStudent.id,
          academicYearId: academicYear.id,
          termId: term.id,
          classroomId: classroom.id,
          status: StudentEnrollmentStatus.ACTIVE,
          enrolledAt: term.startDate,
        },
        select: { id: true },
      }),
    ]);
    cleanupState.enrollmentIds.add(firstEnrollment.id);
    cleanupState.enrollmentIds.add(secondEnrollment.id);

    return {
      academicYearId: academicYear.id,
      termId: term.id,
      dueDate: formatDateOnly(addUtcDays(term.startDate, 20)),
      stageId: stage.id,
      gradeId: grade.id,
      sectionId: section.id,
      classroomId: classroom.id,
      subjectId: subject.id,
      firstStudentId: firstStudent.id,
      secondStudentId: secondStudent.id,
      firstEnrollmentId: firstEnrollment.id,
      secondEnrollmentId: secondEnrollment.id,
    };
  }

  async function loadAssignmentsForTask(taskId: string) {
    return prisma.reinforcementAssignment.findMany({
      where: { taskId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        studentId: true,
        enrollmentId: true,
        status: true,
        progress: true,
      },
    });
  }

  function rememberReviewIds(responseBody: Record<string, unknown>): void {
    const currentReview = responseBody.currentReview as
      | { id?: string }
      | null
      | undefined;
    if (currentReview?.id) {
      cleanupState.reviewIds.add(currentReview.id);
    }

    const reviewHistory = responseBody.reviewHistory as
      | Array<{ id?: string }>
      | undefined;
    for (const review of reviewHistory ?? []) {
      if (review.id) cleanupState.reviewIds.add(review.id);
    }
  }

  it('covers templates, tasks, submissions, reviews, XP, overview read models, cancellation, and audit', async () => {
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

    const fixture = await createReinforcementPrerequisites();
    const suffix = randomUUID().split('-')[0];

    const createTemplateResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/templates`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        nameEn: `Sprint 5A Template ${suffix}`,
        nameAr: `Sprint 5A Template ${suffix} AR`,
        descriptionEn: 'Sprint 5A closeout template',
        source: 'teacher',
        rewardType: 'xp',
        rewardValue: 25,
        rewardLabelEn: '25 XP',
        stages: [
          {
            titleEn: 'Template stage',
            titleAr: 'Template stage AR',
            proofType: 'none',
            requiresApproval: true,
          },
        ],
      })
      .expect(201);

    const templateId = createTemplateResponse.body.id as string;
    cleanupState.templateIds.add(templateId);

    expect(createTemplateResponse.body).toMatchObject({
      id: templateId,
      source: 'teacher',
      reward: {
        type: 'xp',
        value: 25,
        labelEn: '25 XP',
      },
    });
    expect(createTemplateResponse.body.stages).toEqual([
      expect.objectContaining({
        titleEn: 'Template stage',
        proofType: 'none',
        requiresApproval: true,
      }),
    ]);

    const templatesListResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/templates`)
      .query({ search: `Sprint 5A Template ${suffix}` })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(templatesListResponse.body.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: templateId })]),
    );

    const filterOptionsResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/filter-options`)
      .query({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(filterOptionsResponse.body.academicYears).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: fixture.academicYearId }),
      ]),
    );
    expect(filterOptionsResponse.body.terms).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: fixture.termId })]),
    );
    expect(filterOptionsResponse.body.classrooms).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: fixture.classroomId }),
      ]),
    );
    expect(filterOptionsResponse.body.students).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ studentId: fixture.firstStudentId }),
        expect.objectContaining({ studentId: fixture.secondStudentId }),
      ]),
    );
    expect(filterOptionsResponse.body.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: 'teacher' }),
      ]),
    );
    expect(filterOptionsResponse.body.rewardTypes).toEqual(
      expect.arrayContaining([expect.objectContaining({ value: 'xp' })]),
    );

    const taskTitle = `Sprint 5A Reinforcement Task ${suffix}`;
    const createTaskResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/tasks`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
        subjectId: fixture.subjectId,
        titleEn: taskTitle,
        titleAr: `${taskTitle} AR`,
        descriptionEn: 'Sprint 5A closeout task',
        source: 'teacher',
        rewardType: 'xp',
        rewardValue: 25,
        rewardLabelEn: '25 XP',
        dueDate: fixture.dueDate,
        assignedByName: 'Sprint 5A E2E',
        targets: [
          {
            scopeType: 'classroom',
            scopeId: fixture.classroomId,
          },
        ],
        stages: [
          {
            titleEn: 'Read the story',
            titleAr: 'Read the story AR',
            proofType: 'none',
            requiresApproval: true,
            sortOrder: 1,
          },
          {
            titleEn: 'Present the reflection',
            titleAr: 'Present the reflection AR',
            proofType: 'none',
            requiresApproval: true,
            sortOrder: 2,
          },
        ],
      })
      .expect(201);

    const taskId = createTaskResponse.body.id as string;
    cleanupState.taskIds.add(taskId);

    expect(createTaskResponse.body).toMatchObject({
      id: taskId,
      status: 'not_completed',
      source: 'teacher',
      reward: { type: 'xp', value: 25 },
      assignmentSummary: {
        total: 2,
        notCompleted: 2,
        inProgress: 0,
        underReview: 0,
        completed: 0,
        cancelled: 0,
      },
    });
    expect(createTaskResponse.body.targets).toEqual([
      expect.objectContaining({
        scopeType: 'classroom',
        classroomId: fixture.classroomId,
      }),
    ]);
    expect(createTaskResponse.body.stages).toHaveLength(2);

    const tasksListResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/tasks`)
      .query({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
        search: taskTitle,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(tasksListResponse.body.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: taskId })]),
    );

    const taskDetailResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/tasks/${taskId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(taskDetailResponse.body).toMatchObject({
      id: taskId,
      assignmentSummary: { total: 2 },
      targets: [
        expect.objectContaining({
          scopeType: 'classroom',
          classroomId: fixture.classroomId,
        }),
      ],
    });
    expect(taskDetailResponse.body.stages).toHaveLength(2);

    const duplicateResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/tasks/${taskId}/duplicate`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        titleEn: `Sprint 5A Duplicate ${suffix}`,
        titleAr: `Sprint 5A Duplicate ${suffix} AR`,
      })
      .expect(201);

    const duplicateTaskId = duplicateResponse.body.id as string;
    cleanupState.taskIds.add(duplicateTaskId);

    expect(duplicateTaskId).not.toBe(taskId);
    expect(duplicateResponse.body).toMatchObject({
      id: duplicateTaskId,
      status: 'not_completed',
      assignmentSummary: { total: 2, notCompleted: 2 },
    });

    const duplicateSubmissionCount =
      await prisma.reinforcementSubmission.count({
        where: { taskId: duplicateTaskId },
      });
    const duplicateReviewCount = await prisma.reinforcementReview.count({
      where: { taskId: duplicateTaskId },
    });
    expect(duplicateSubmissionCount).toBe(0);
    expect(duplicateReviewCount).toBe(0);

    // The task API exposes assignment summaries, so the closeout spec reads
    // the just-created assignment ids from the database without expanding the API.
    const assignments = await loadAssignmentsForTask(taskId);
    expect(assignments).toHaveLength(2);
    const primaryAssignment =
      assignments.find((item) => item.studentId === fixture.firstStudentId) ??
      assignments[0];
    const firstStage = taskDetailResponse.body.stages[0];
    const secondStage = taskDetailResponse.body.stages[1];

    const submittedResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/assignments/${primaryAssignment.id}/stages/${firstStage.id}/submit`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ proofText: 'Read aloud to the class.' })
      .expect(201);

    const rejectedSubmissionId = submittedResponse.body.id as string;
    cleanupState.submissionIds.add(rejectedSubmissionId);

    expect(submittedResponse.body).toMatchObject({
      id: rejectedSubmissionId,
      assignmentId: primaryAssignment.id,
      stageId: firstStage.id,
      studentId: primaryAssignment.studentId,
      status: 'submitted',
      assignment: {
        status: 'under_review',
      },
    });
    expect(submittedResponse.body.submittedAt).toEqual(expect.any(String));

    const reviewQueueResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/review-queue`)
      .query({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
        taskId,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(reviewQueueResponse.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: rejectedSubmissionId,
          status: 'submitted',
          taskId,
          assignmentId: primaryAssignment.id,
        }),
      ]),
    );

    const reviewDetailResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/review-queue/${rejectedSubmissionId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(reviewDetailResponse.body).toMatchObject({
      id: rejectedSubmissionId,
      task: expect.objectContaining({ id: taskId }),
      stage: expect.objectContaining({ id: firstStage.id }),
      student: expect.objectContaining({ id: primaryAssignment.studentId }),
      assignment: expect.objectContaining({ id: primaryAssignment.id }),
      proof: expect.objectContaining({ proofText: 'Read aloud to the class.' }),
    });

    const rejectWithoutNoteResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/review-queue/${rejectedSubmissionId}/reject`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(400);

    expect(rejectWithoutNoteResponse.body?.error?.code).toBe(
      'validation.failed',
    );

    const rejectResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/review-queue/${rejectedSubmissionId}/reject`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ note: 'Please add a clearer reflection.' })
      .expect(201);
    rememberReviewIds(rejectResponse.body);

    expect(rejectResponse.body).toMatchObject({
      id: rejectedSubmissionId,
      status: 'rejected',
      currentReview: expect.objectContaining({
        outcome: 'rejected',
        note: 'Please add a clearer reflection.',
      }),
      assignment: {
        status: 'in_progress',
      },
    });

    const resubmitResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/assignments/${primaryAssignment.id}/stages/${firstStage.id}/submit`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ proofText: 'Resubmitted with a clearer reflection.' })
      .expect(201);

    expect(resubmitResponse.body).toMatchObject({
      id: rejectedSubmissionId,
      status: 'submitted',
      proof: {
        proofText: 'Resubmitted with a clearer reflection.',
      },
    });

    const firstApproveResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/review-queue/${rejectedSubmissionId}/approve`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ note: 'Reflection approved.' })
      .expect(201);
    rememberReviewIds(firstApproveResponse.body);

    expect(firstApproveResponse.body).toMatchObject({
      id: rejectedSubmissionId,
      status: 'approved',
      currentReview: expect.objectContaining({ outcome: 'approved' }),
      assignment: {
        status: 'in_progress',
        progress: 50,
      },
    });

    const secondSubmittedResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/assignments/${primaryAssignment.id}/stages/${secondStage.id}/submit`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ proofText: 'Presented the reflection.' })
      .expect(201);

    const approvedSubmissionId = secondSubmittedResponse.body.id as string;
    cleanupState.submissionIds.add(approvedSubmissionId);

    expect(secondSubmittedResponse.body).toMatchObject({
      id: approvedSubmissionId,
      status: 'submitted',
      assignment: {
        status: 'under_review',
      },
    });

    const secondApproveResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/review-queue/${approvedSubmissionId}/approve`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ note: 'All stages approved.' })
      .expect(201);
    rememberReviewIds(secondApproveResponse.body);

    expect(secondApproveResponse.body).toMatchObject({
      id: approvedSubmissionId,
      status: 'approved',
      currentReview: expect.objectContaining({ outcome: 'approved' }),
      assignment: {
        status: 'completed',
        progress: 100,
      },
    });

    const xpPolicyResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/xp/policies`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
        scopeType: 'classroom',
        scopeId: fixture.classroomId,
        dailyCap: 1000,
        weeklyCap: 5000,
        cooldownMinutes: 0,
        isActive: true,
      })
      .expect(201);

    const xpPolicyId = xpPolicyResponse.body.id as string;
    cleanupState.xpPolicyIds.add(xpPolicyId);

    expect(xpPolicyResponse.body).toMatchObject({
      id: xpPolicyId,
      academicYearId: fixture.academicYearId,
      termId: fixture.termId,
      scopeType: 'classroom',
      scopeKey: fixture.classroomId,
      dailyCap: 1000,
      weeklyCap: 5000,
      cooldownMinutes: 0,
      isActive: true,
    });

    const xpPoliciesResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/xp/policies`)
      .query({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
        scopeType: 'classroom',
        scopeKey: fixture.classroomId,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(xpPoliciesResponse.body.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: xpPolicyId })]),
    );

    const effectivePolicyResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/xp/policies/effective`)
      .query({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
        classroomId: fixture.classroomId,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(effectivePolicyResponse.body).toMatchObject({
      id: xpPolicyId,
      scopeType: 'classroom',
      scopeKey: fixture.classroomId,
      isDefault: false,
    });

    const xpGrantResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/xp/grants/reinforcement-review/${approvedSubmissionId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reason: 'reinforcement_task' })
      .expect(201);

    const xpGrantId = xpGrantResponse.body.id as string;
    cleanupState.xpLedgerIds.add(xpGrantId);

    expect(xpGrantResponse.body).toMatchObject({
      id: xpGrantId,
      academicYearId: fixture.academicYearId,
      termId: fixture.termId,
      studentId: primaryAssignment.studentId,
      enrollmentId: primaryAssignment.enrollmentId,
      assignmentId: primaryAssignment.id,
      policyId: xpPolicyId,
      sourceType: 'reinforcement_task',
      sourceId: approvedSubmissionId,
      amount: 25,
    });

    const idempotentXpGrantResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/xp/grants/reinforcement-review/${approvedSubmissionId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reason: 'reinforcement_task' })
      .expect(201);

    expect(idempotentXpGrantResponse.body.id).toBe(xpGrantId);

    const reinforcementGrantCount = await prisma.xpLedger.count({
      where: {
        sourceType: 'REINFORCEMENT_TASK',
        sourceId: approvedSubmissionId,
        studentId: primaryAssignment.studentId,
      },
    });
    expect(reinforcementGrantCount).toBe(1);

    const manualDedupeKey = `sprint-5a-manual-${suffix}`;
    const manualXpResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/xp/grants/manual`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
        studentId: primaryAssignment.studentId,
        enrollmentId: primaryAssignment.enrollmentId,
        amount: 7,
        reason: 'closeout_bonus',
        dedupeKey: manualDedupeKey,
      })
      .expect(201);

    const manualXpId = manualXpResponse.body.id as string;
    cleanupState.xpLedgerIds.add(manualXpId);

    expect(manualXpResponse.body).toMatchObject({
      id: manualXpId,
      sourceType: 'manual_bonus',
      sourceId: manualDedupeKey,
      amount: 7,
      studentId: primaryAssignment.studentId,
    });

    const idempotentManualXpResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/xp/grants/manual`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
        studentId: primaryAssignment.studentId,
        enrollmentId: primaryAssignment.enrollmentId,
        amount: 7,
        reason: 'closeout_bonus',
        dedupeKey: manualDedupeKey,
      })
      .expect(201);

    expect(idempotentManualXpResponse.body.id).toBe(manualXpId);

    const manualGrantCount = await prisma.xpLedger.count({
      where: {
        sourceType: 'MANUAL_BONUS',
        sourceId: manualDedupeKey,
        studentId: primaryAssignment.studentId,
      },
    });
    expect(manualGrantCount).toBe(1);

    const xpLedgerResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/xp/ledger`)
      .query({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
        studentId: primaryAssignment.studentId,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(xpLedgerResponse.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: xpGrantId, amount: 25 }),
        expect.objectContaining({ id: manualXpId, amount: 7 }),
      ]),
    );

    const xpSummaryResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/xp/summary`)
      .query({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
        studentId: primaryAssignment.studentId,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(xpSummaryResponse.body).toMatchObject({
      totalXp: 32,
      studentsCount: 1,
    });
    expect(xpSummaryResponse.body.bySourceType).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceType: 'reinforcement_task',
          amount: 25,
        }),
        expect.objectContaining({
          sourceType: 'manual_bonus',
          amount: 7,
        }),
      ]),
    );

    const overviewResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/overview`)
      .query({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
        classroomId: fixture.classroomId,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(overviewResponse.body.scope).toMatchObject({
      academicYearId: fixture.academicYearId,
      termId: fixture.termId,
      classroomId: fixture.classroomId,
    });
    expect(overviewResponse.body.tasks.total).toBeGreaterThanOrEqual(2);
    expect(overviewResponse.body.assignments.total).toBeGreaterThanOrEqual(4);
    expect(overviewResponse.body.reviewQueue.approved).toBeGreaterThanOrEqual(2);
    expect(overviewResponse.body.xp.totalXp).toBeGreaterThanOrEqual(32);
    expect(overviewResponse.body.topStudents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          studentId: primaryAssignment.studentId,
          totalXp: 32,
        }),
      ]),
    );
    expect(overviewResponse.body.recentActivity.length).toBeGreaterThan(0);

    const studentProgressResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/reinforcement/students/${primaryAssignment.studentId}/progress`,
      )
      .query({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(studentProgressResponse.body).toMatchObject({
      student: {
        id: primaryAssignment.studentId,
        nameAr: null,
        code: null,
        admissionNo: null,
      },
      enrollment: {
        enrollmentId: primaryAssignment.enrollmentId,
        classroomId: fixture.classroomId,
      },
      xp: {
        totalXp: 32,
      },
    });
    expect(studentProgressResponse.body.assignments.completed).toBe(1);
    expect(studentProgressResponse.body.recentReviews).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ outcome: 'approved' }),
        expect.objectContaining({ outcome: 'rejected' }),
      ]),
    );

    const classroomSummaryResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/reinforcement/classrooms/${fixture.classroomId}/summary`,
      )
      .query({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(classroomSummaryResponse.body).toMatchObject({
      classroom: {
        classroomId: fixture.classroomId,
        sectionId: fixture.sectionId,
        gradeId: fixture.gradeId,
        stageId: fixture.stageId,
      },
      studentsCount: 2,
    });
    expect(classroomSummaryResponse.body.students).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          studentId: primaryAssignment.studentId,
          totalXp: 32,
          assignmentsCompleted: 1,
        }),
      ]),
    );
    expect(classroomSummaryResponse.body.xp.totalXp).toBeGreaterThanOrEqual(32);

    const cancelResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/tasks/${taskId}/cancel`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reason: 'Sprint 5A closeout cleanup cancellation' })
      .expect(201);

    expect(cancelResponse.body).toMatchObject({
      id: taskId,
      status: 'cancelled',
      cancellationReason: 'Sprint 5A closeout cleanup cancellation',
      assignmentSummary: {
        total: 2,
        completed: 1,
        cancelled: 1,
      },
    });

    const defaultAfterCancelResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/tasks`)
      .query({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
        search: taskTitle,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(
      defaultAfterCancelResponse.body.items.some(
        (item: { id: string }) => item.id === taskId,
      ),
    ).toBe(false);

    const includeCancelledResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/tasks`)
      .query({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
        search: taskTitle,
        includeCancelled: true,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(includeCancelledResponse.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: taskId,
          status: 'cancelled',
        }),
      ]),
    );

    const persistedAssignmentsAfterCancel = await loadAssignmentsForTask(taskId);
    expect(persistedAssignmentsAfterCancel).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: primaryAssignment.id,
          status: ReinforcementTaskStatus.COMPLETED,
          progress: 100,
        }),
        expect.objectContaining({
          status: ReinforcementTaskStatus.CANCELLED,
        }),
      ]),
    );

    const expectedAuditActions = [
      'reinforcement.task.create',
      'reinforcement.task.duplicate',
      'reinforcement.task.cancel',
      'reinforcement.template.create',
      'reinforcement.submission.submit',
      'reinforcement.review.approve',
      'reinforcement.review.reject',
      'reinforcement.xp.policy.create',
      'reinforcement.xp.grant',
      'reinforcement.xp.manual_bonus',
    ];
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        schoolId: demoSchoolId,
        action: { in: expectedAuditActions },
        resourceId: {
          in: [
            templateId,
            taskId,
            duplicateTaskId,
            rejectedSubmissionId,
            approvedSubmissionId,
            ...cleanupState.reviewIds,
            xpPolicyId,
            xpGrantId,
            manualXpId,
          ],
        },
      },
      select: { action: true, outcome: true },
    });
    const auditActions = auditLogs.map((log) => log.action);

    expect(auditActions).toEqual(expect.arrayContaining(expectedAuditActions));
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
