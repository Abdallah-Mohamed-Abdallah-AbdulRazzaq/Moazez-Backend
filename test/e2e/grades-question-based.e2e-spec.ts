import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  PrismaClient,
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

describe('Question-based Grades closeout flow (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let demoSchoolId: string;
  let demoOrganizationId: string;

  const cleanupState = {
    assessmentIds: new Set<string>(),
    questionIds: new Set<string>(),
    optionIds: new Set<string>(),
    submissionIds: new Set<string>(),
    answerIds: new Set<string>(),
    itemIds: new Set<string>(),
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
      const assessmentIds = [...cleanupState.assessmentIds];
      const questionIds = [...cleanupState.questionIds];
      const submissionIds = [...cleanupState.submissionIds];
      let answerIds = [...cleanupState.answerIds];
      const itemIds = [...cleanupState.itemIds];
      const studentIds = [...cleanupState.studentIds];

      if (submissionIds.length > 0) {
        const persistedAnswers = await prisma.gradeSubmissionAnswer.findMany({
          where: { submissionId: { in: submissionIds } },
          select: { id: true },
        });
        answerIds = [
          ...new Set([
            ...answerIds,
            ...persistedAnswers.map((answer) => answer.id),
          ]),
        ];
      }

      const auditResourceIds = [
        ...assessmentIds,
        ...questionIds,
        ...submissionIds,
        ...answerIds,
        ...itemIds,
      ];
      if (auditResourceIds.length > 0) {
        await prisma.auditLog.deleteMany({
          where: {
            resourceId: { in: auditResourceIds },
            action: {
              in: [
                'grades.assessment.create',
                'grades.assessment.publish',
                'grades.assessment.approve',
                'grades.question.create',
                'grades.question.update',
                'grades.question.delete',
                'grades.question.reorder',
                'grades.question.points.bulk_update',
                'grades.submission.create',
                'grades.submission.answer.save',
                'grades.submission.answers.bulk_save',
                'grades.submission.submit',
                'grades.submission.answer.review',
                'grades.submission.answers.bulk_review',
                'grades.submission.review.finalize',
                'grades.submission.grade_item.sync',
              ],
            },
          },
        });
      }

      if (answerIds.length > 0 || submissionIds.length > 0) {
        await prisma.gradeSubmissionAnswerOption.deleteMany({
          where: { answerId: { in: answerIds } },
        });
        await prisma.gradeSubmissionAnswer.deleteMany({
          where: {
            OR: [
              ...(answerIds.length > 0 ? [{ id: { in: answerIds } }] : []),
              ...(submissionIds.length > 0
                ? [{ submissionId: { in: submissionIds } }]
                : []),
            ],
          },
        });
      }

      if (submissionIds.length > 0) {
        await prisma.gradeSubmission.deleteMany({
          where: { id: { in: submissionIds } },
        });
      }

      if (
        itemIds.length > 0 ||
        assessmentIds.length > 0 ||
        studentIds.length > 0
      ) {
        await prisma.gradeItem.deleteMany({
          where: {
            OR: [
              ...(itemIds.length > 0 ? [{ id: { in: itemIds } }] : []),
              ...(assessmentIds.length > 0
                ? [{ assessmentId: { in: assessmentIds } }]
                : []),
              ...(studentIds.length > 0
                ? [{ studentId: { in: studentIds } }]
                : []),
            ],
          },
        });
      }

      if (assessmentIds.length > 0 || questionIds.length > 0) {
        await prisma.gradeAssessmentQuestionOption.deleteMany({
          where: {
            OR: [
              ...(assessmentIds.length > 0
                ? [{ assessmentId: { in: assessmentIds } }]
                : []),
              ...(questionIds.length > 0
                ? [{ questionId: { in: questionIds } }]
                : []),
            ],
          },
        });
        await prisma.gradeAssessmentQuestion.deleteMany({
          where: {
            OR: [
              ...(assessmentIds.length > 0
                ? [{ assessmentId: { in: assessmentIds } }]
                : []),
              ...(questionIds.length > 0 ? [{ id: { in: questionIds } }] : []),
            ],
          },
        });
      }

      if (assessmentIds.length > 0) {
        await prisma.gradeAssessment.deleteMany({
          where: { id: { in: assessmentIds } },
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

  async function createQuestionBasedPrerequisites(): Promise<{
    academicYearId: string;
    termId: string;
    assessmentDate: string;
    stageId: string;
    gradeId: string;
    sectionId: string;
    classroomId: string;
    subjectId: string;
    submittingStudentId: string;
    submittingEnrollmentId: string;
    unsyncedStudentId: string;
    unsyncedEnrollmentId: string;
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
      },
    });

    if (!academicYear) {
      academicYear = await prisma.academicYear.create({
        data: {
          schoolId: demoSchoolId,
          nameAr: `Sprint 4B Year ${suffix} AR`,
          nameEn: `Sprint 4B Year ${suffix}`,
          startDate: new Date('2026-09-01T00:00:00.000Z'),
          endDate: new Date('2027-06-30T00:00:00.000Z'),
          isActive: true,
        },
        select: {
          id: true,
          startDate: true,
          endDate: true,
        },
      });
      cleanupState.academicYearIds.add(academicYear.id);
    }

    const termStartDate = academicYear.startDate;
    const termEndDate = selectEndDateWithinAcademicYear({
      startDate: academicYear.startDate,
      endDate: academicYear.endDate,
      offsetDays: 90,
    });

    const term = await prisma.term.create({
      data: {
        schoolId: demoSchoolId,
        academicYearId: academicYear.id,
        nameAr: `Sprint 4B Term ${suffix} AR`,
        nameEn: `Sprint 4B Term ${suffix}`,
        startDate: termStartDate,
        endDate: termEndDate,
        isActive: true,
      },
      select: { id: true },
    });
    cleanupState.termIds.add(term.id);

    const stage = await prisma.stage.create({
      data: {
        schoolId: demoSchoolId,
        nameAr: `Sprint 4B Stage ${suffix} AR`,
        nameEn: `Sprint 4B Stage ${suffix}`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    cleanupState.stageIds.add(stage.id);

    const grade = await prisma.grade.create({
      data: {
        schoolId: demoSchoolId,
        stageId: stage.id,
        nameAr: `Sprint 4B Grade ${suffix} AR`,
        nameEn: `Sprint 4B Grade ${suffix}`,
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
        nameAr: `Sprint 4B Section ${suffix} AR`,
        nameEn: `Sprint 4B Section ${suffix}`,
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
        nameAr: `Sprint 4B Classroom ${suffix} AR`,
        nameEn: `Sprint 4B Classroom ${suffix}`,
        sortOrder: 1,
        capacity: 24,
      },
      select: { id: true },
    });
    cleanupState.classroomIds.add(classroom.id);

    const subject = await prisma.subject.create({
      data: {
        schoolId: demoSchoolId,
        nameAr: `Sprint 4B Science ${suffix} AR`,
        nameEn: `Sprint 4B Science ${suffix}`,
        code: `S4B-${suffix}`,
        color: '#16a34a',
        isActive: true,
      },
      select: { id: true },
    });
    cleanupState.subjectIds.add(subject.id);

    const [submittingStudent, unsyncedStudent] = await Promise.all([
      prisma.student.create({
        data: {
          schoolId: demoSchoolId,
          organizationId: demoOrganizationId,
          firstName: `Sprint 4B Submitted ${suffix}`,
          lastName: 'Student',
          status: StudentStatus.ACTIVE,
        },
        select: { id: true },
      }),
      prisma.student.create({
        data: {
          schoolId: demoSchoolId,
          organizationId: demoOrganizationId,
          firstName: `Sprint 4B Unsynced ${suffix}`,
          lastName: 'Student',
          status: StudentStatus.ACTIVE,
        },
        select: { id: true },
      }),
    ]);
    cleanupState.studentIds.add(submittingStudent.id);
    cleanupState.studentIds.add(unsyncedStudent.id);

    const [submittingEnrollment, unsyncedEnrollment] = await Promise.all([
      prisma.enrollment.create({
        data: {
          schoolId: demoSchoolId,
          studentId: submittingStudent.id,
          academicYearId: academicYear.id,
          termId: term.id,
          classroomId: classroom.id,
          status: StudentEnrollmentStatus.ACTIVE,
          enrolledAt: termStartDate,
        },
        select: { id: true },
      }),
      prisma.enrollment.create({
        data: {
          schoolId: demoSchoolId,
          studentId: unsyncedStudent.id,
          academicYearId: academicYear.id,
          termId: term.id,
          classroomId: classroom.id,
          status: StudentEnrollmentStatus.ACTIVE,
          enrolledAt: termStartDate,
        },
        select: { id: true },
      }),
    ]);
    cleanupState.enrollmentIds.add(submittingEnrollment.id);
    cleanupState.enrollmentIds.add(unsyncedEnrollment.id);

    return {
      academicYearId: academicYear.id,
      termId: term.id,
      assessmentDate: selectDateWithinTerm(termStartDate, termEndDate, 20),
      stageId: stage.id,
      gradeId: grade.id,
      sectionId: section.id,
      classroomId: classroom.id,
      subjectId: subject.id,
      submittingStudentId: submittingStudent.id,
      submittingEnrollmentId: submittingEnrollment.id,
      unsyncedStudentId: unsyncedStudent.id,
      unsyncedEnrollmentId: unsyncedEnrollment.id,
    };
  }

  function gradesScopeQuery(fixture: {
    academicYearId: string;
    termId: string;
    subjectId: string;
    classroomId: string;
  }) {
    return {
      academicYearId: fixture.academicYearId,
      termId: fixture.termId,
      subjectId: fixture.subjectId,
      scopeType: 'classroom',
      scopeId: fixture.classroomId,
      classroomId: fixture.classroomId,
    };
  }

  async function createQuestion(
    accessToken: string,
    assessmentId: string,
    payload: Record<string, unknown>,
  ) {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/grades/assessments/${assessmentId}/questions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(payload)
      .expect(201);

    cleanupState.questionIds.add(response.body.id);
    for (const option of response.body.options ?? []) {
      cleanupState.optionIds.add(option.id);
    }

    return response.body;
  }

  it('covers question-based assessment authoring, submission, correction, GradeItem sync, read models, and audit', async () => {
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

    const fixture = await createQuestionBasedPrerequisites();

    const createAssessmentResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/grades/assessments/question-based`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        ...gradesScopeQuery(fixture),
        titleEn: `Sprint 4B Question Assessment ${randomUUID().split('-')[0]}`,
        titleAr: 'Sprint 4B Question Assessment AR',
        type: 'QUIZ',
        date: fixture.assessmentDate,
        weight: 25,
        maxScore: 10,
        expectedTimeMinutes: 40,
      })
      .expect(201);

    const assessmentId = createAssessmentResponse.body.id as string;
    cleanupState.assessmentIds.add(assessmentId);

    expect(createAssessmentResponse.body).toMatchObject({
      id: assessmentId,
      deliveryMode: 'question_based',
      approvalStatus: 'draft',
      maxScore: 10,
      isLocked: false,
    });

    const emptyQuestionsResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/assessments/${assessmentId}/questions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(emptyQuestionsResponse.body).toMatchObject({
      assessmentId,
      totalQuestions: 0,
      totalPoints: 0,
      questions: [],
    });

    const gradeItemsAfterCreate = await prisma.gradeItem.count({
      where: { assessmentId },
    });
    expect(gradeItemsAfterCreate).toBe(0);

    const publishWithoutQuestionsResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/grades/assessments/${assessmentId}/publish`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(400);

    expect(publishWithoutQuestionsResponse.body?.error?.code).toBe(
      'validation.failed',
    );

    const mcqQuestion = await createQuestion(accessToken, assessmentId, {
      type: 'MCQ_SINGLE',
      prompt: 'Which planet is known as the red planet?',
      promptAr: 'Red planet question AR',
      points: 5,
      sortOrder: 1,
      required: true,
      options: [
        {
          label: 'Mars',
          labelAr: 'Mars AR',
          value: 'mars',
          isCorrect: true,
          sortOrder: 1,
        },
        {
          label: 'Venus',
          labelAr: 'Venus AR',
          value: 'venus',
          isCorrect: false,
          sortOrder: 2,
        },
      ],
    });
    const correctOptionId = mcqQuestion.options[0].id as string;

    const shortQuestion = await createQuestion(accessToken, assessmentId, {
      type: 'SHORT_ANSWER',
      prompt: 'Name one state of matter.',
      promptAr: 'State of matter question AR',
      points: 4,
      sortOrder: 2,
      required: true,
    });

    const trueFalseQuestion = await createQuestion(accessToken, assessmentId, {
      type: 'TRUE_FALSE',
      prompt: 'Water boils at room temperature.',
      promptAr: 'Boiling point statement AR',
      points: 1,
      sortOrder: 3,
      required: false,
      options: [
        {
          label: 'True',
          value: 'true',
          isCorrect: false,
          sortOrder: 1,
        },
        {
          label: 'False',
          value: 'false',
          isCorrect: true,
          sortOrder: 2,
        },
      ],
    });

    const updateQuestionResponse = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/grades/questions/${mcqQuestion.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ explanation: 'Mars has iron oxide dust on its surface.' })
      .expect(200);

    expect(updateQuestionResponse.body).toMatchObject({
      id: mcqQuestion.id,
      explanation: 'Mars has iron oxide dust on its surface.',
    });

    const listedQuestionsResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/assessments/${assessmentId}/questions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(
      listedQuestionsResponse.body.questions.map((q: { id: string }) => q.id),
    ).toEqual([mcqQuestion.id, shortQuestion.id, trueFalseQuestion.id]);
    expect(listedQuestionsResponse.body.questions[0].options).toEqual([
      expect.objectContaining({
        id: correctOptionId,
        label: 'Mars',
        isCorrect: true,
        sortOrder: 1,
      }),
      expect.objectContaining({
        label: 'Venus',
        isCorrect: false,
        sortOrder: 2,
      }),
    ]);

    const reorderedQuestionsResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/grades/assessments/${assessmentId}/questions/reorder`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        questionIds: [shortQuestion.id, mcqQuestion.id, trueFalseQuestion.id],
      })
      .expect(201);

    expect(
      reorderedQuestionsResponse.body.questions.map(
        (q: { id: string }) => q.id,
      ),
    ).toEqual([shortQuestion.id, mcqQuestion.id, trueFalseQuestion.id]);

    await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/grades/questions/${trueFalseQuestion.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({ ok: true });
      });

    const pointsResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/grades/assessments/${assessmentId}/questions/points/bulk`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        updates: [
          { questionId: shortQuestion.id, points: 4 },
          { questionId: mcqQuestion.id, points: 6 },
        ],
      })
      .expect(201);

    expect(pointsResponse.body).toMatchObject({
      assessmentId,
      totalQuestions: 2,
      totalPoints: 10,
      pointsMatchMaxScore: true,
    });

    const publishResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/grades/assessments/${assessmentId}/publish`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    expect(publishResponse.body).toMatchObject({
      id: assessmentId,
      approvalStatus: 'published',
      isLocked: false,
    });
    expect(publishResponse.body.publishedAt).toEqual(expect.any(String));

    const postPublishQuestionMutationResponse = await request(
      app.getHttpServer(),
    )
      .patch(`${GLOBAL_PREFIX}/grades/questions/${mcqQuestion.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ prompt: 'This mutation should be rejected after publish.' })
      .expect(409);

    expect(postPublishQuestionMutationResponse.body?.error?.code).toBe(
      'grades.assessment.invalid_status_transition',
    );

    const approveResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/grades/assessments/${assessmentId}/approve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    expect(approveResponse.body).toMatchObject({
      id: assessmentId,
      approvalStatus: 'approved',
      isLocked: false,
    });

    const resolvedSubmissionResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/grades/assessments/${assessmentId}/submissions/resolve`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        studentId: fixture.submittingStudentId,
        enrollmentId: fixture.submittingEnrollmentId,
      })
      .expect(201);

    const submissionId = resolvedSubmissionResponse.body.id as string;
    cleanupState.submissionIds.add(submissionId);

    expect(resolvedSubmissionResponse.body).toMatchObject({
      id: submissionId,
      assessmentId,
      studentId: fixture.submittingStudentId,
      enrollmentId: fixture.submittingEnrollmentId,
      status: 'in_progress',
    });

    const idempotentResolveResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/grades/assessments/${assessmentId}/submissions/resolve`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        studentId: fixture.submittingStudentId,
        enrollmentId: fixture.submittingEnrollmentId,
      })
      .expect(201);

    expect(idempotentResolveResponse.body.id).toBe(submissionId);

    const unsyncedSubmissionResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/grades/assessments/${assessmentId}/submissions/resolve`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        studentId: fixture.unsyncedStudentId,
        enrollmentId: fixture.unsyncedEnrollmentId,
      })
      .expect(201);

    const unsyncedSubmissionId = unsyncedSubmissionResponse.body.id as string;
    cleanupState.submissionIds.add(unsyncedSubmissionId);

    const prematureSyncResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/grades/submissions/${unsyncedSubmissionId}/sync-grade-item`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(409);

    expect(prematureSyncResponse.body?.error?.code).toBe(
      'grades.submission.not_submitted',
    );

    const submissionsListResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/assessments/${assessmentId}/submissions`)
      .query({ classroomId: fixture.classroomId })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(submissionsListResponse.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: submissionId,
          status: 'in_progress',
          studentId: fixture.submittingStudentId,
        }),
        expect.objectContaining({
          id: unsyncedSubmissionId,
          status: 'in_progress',
          studentId: fixture.unsyncedStudentId,
        }),
      ]),
    );

    const mcqAnswerResponse = await request(app.getHttpServer())
      .put(
        `${GLOBAL_PREFIX}/grades/submissions/${submissionId}/answers/${mcqQuestion.id}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ selectedOptionIds: [correctOptionId] })
      .expect(200);

    const mcqAnswerId = mcqAnswerResponse.body.id as string;
    cleanupState.answerIds.add(mcqAnswerId);

    expect(mcqAnswerResponse.body).toMatchObject({
      questionId: mcqQuestion.id,
      correctionStatus: 'pending',
      maxPoints: 6,
      selectedOptions: [
        expect.objectContaining({
          optionId: correctOptionId,
          label: 'Mars',
        }),
      ],
    });

    const bulkSaveResponse = await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/grades/submissions/${submissionId}/answers`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        answers: [
          {
            questionId: shortQuestion.id,
            answerText: 'Solid',
          },
        ],
      })
      .expect(200);

    const shortAnswerId = bulkSaveResponse.body.answers[0].id as string;
    cleanupState.answerIds.add(shortAnswerId);

    expect(bulkSaveResponse.body).toMatchObject({
      submissionId,
      savedCount: 1,
      answers: [
        expect.objectContaining({
          id: shortAnswerId,
          questionId: shortQuestion.id,
          answerText: 'Solid',
          correctionStatus: 'pending',
          maxPoints: 4,
        }),
      ],
    });

    const detailBeforeSubmitResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/submissions/${submissionId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(detailBeforeSubmitResponse.body.progress).toMatchObject({
      totalQuestions: 2,
      answeredCount: 2,
      requiredQuestionCount: 2,
      requiredAnsweredCount: 2,
      pendingCorrectionCount: 2,
    });
    expect(detailBeforeSubmitResponse.body.questions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: mcqQuestion.id,
          answer: expect.objectContaining({ id: mcqAnswerId }),
        }),
        expect.objectContaining({
          id: shortQuestion.id,
          answer: expect.objectContaining({ id: shortAnswerId }),
        }),
      ]),
    );

    const submitResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/grades/submissions/${submissionId}/submit`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    expect(submitResponse.body).toMatchObject({
      id: submissionId,
      status: 'submitted',
      submittedAt: expect.any(String),
    });

    const postSubmitAnswerSaveResponse = await request(app.getHttpServer())
      .put(
        `${GLOBAL_PREFIX}/grades/submissions/${submissionId}/answers/${mcqQuestion.id}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ selectedOptionIds: [correctOptionId] })
      .expect(409);

    expect(postSubmitAnswerSaveResponse.body?.error?.code).toBe(
      'grades.submission.already_submitted',
    );

    const reviewMcqResponse = await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/grades/submissions/${submissionId}/answers/${mcqAnswerId}/review`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        awardedPoints: 6,
        reviewerComment: 'Correct option selected',
      })
      .expect(200);

    expect(reviewMcqResponse.body).toMatchObject({
      id: mcqAnswerId,
      correctionStatus: 'corrected',
      awardedPoints: 6,
      reviewerComment: 'Correct option selected',
    });

    const bulkReviewResponse = await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/grades/submissions/${submissionId}/answers/review`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        reviews: [
          {
            answerId: shortAnswerId,
            awardedPoints: 2,
            reviewerComment: 'Partial short-answer credit',
          },
        ],
      })
      .expect(200);

    expect(bulkReviewResponse.body).toMatchObject({
      submissionId,
      reviewedCount: 1,
      answers: [
        expect.objectContaining({
          id: shortAnswerId,
          correctionStatus: 'corrected',
          awardedPoints: 2,
        }),
      ],
    });

    const finalizeResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/grades/submissions/${submissionId}/review/finalize`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    expect(finalizeResponse.body).toMatchObject({
      id: submissionId,
      status: 'corrected',
      totalScore: 8,
      maxScore: 10,
      correctedAt: expect.any(String),
      reviewedById: expect.any(String),
    });

    const syncResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/grades/submissions/${submissionId}/sync-grade-item`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    const gradeItemId = syncResponse.body.gradeItem.id as string;
    cleanupState.itemIds.add(gradeItemId);

    expect(syncResponse.body).toMatchObject({
      synced: true,
      idempotent: false,
      submission: {
        id: submissionId,
        assessmentId,
        studentId: fixture.submittingStudentId,
        enrollmentId: fixture.submittingEnrollmentId,
        status: 'corrected',
        totalScore: 8,
        maxScore: 10,
      },
      gradeItem: {
        id: gradeItemId,
        assessmentId,
        studentId: fixture.submittingStudentId,
        enrollmentId: fixture.submittingEnrollmentId,
        status: 'entered',
        score: 8,
        enteredAt: expect.any(String),
        enteredById: expect.any(String),
      },
    });

    const secondSyncResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/grades/submissions/${submissionId}/sync-grade-item`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    expect(secondSyncResponse.body).toMatchObject({
      synced: true,
      idempotent: true,
      gradeItem: {
        id: gradeItemId,
        score: 8,
        status: 'entered',
      },
    });

    const gradeItemCount = await prisma.gradeItem.count({
      where: { assessmentId, studentId: fixture.submittingStudentId },
    });
    expect(gradeItemCount).toBe(1);

    const gradebookQuery = {
      ...gradesScopeQuery(fixture),
      includeVirtualMissing: true,
    };
    const analyticsQuery = gradesScopeQuery(fixture);

    const gradebookResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/gradebook`)
      .query(gradebookQuery)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(gradebookResponse.body.columns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assessmentId,
          maxScore: 10,
        }),
      ]),
    );
    expect(gradebookResponse.body.summary).toMatchObject({
      studentCount: 2,
      assessmentCount: 1,
      averagePercent: 20,
    });

    const submittingRow = gradebookResponse.body.rows.find(
      (row: { studentId: string }) =>
        row.studentId === fixture.submittingStudentId,
    );
    expect(submittingRow).toMatchObject({
      studentId: fixture.submittingStudentId,
      finalPercent: 20,
      completedWeight: 25,
      totalEnteredCount: 1,
    });
    expect(submittingRow.cells).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assessmentId,
          itemId: gradeItemId,
          score: 8,
          status: 'entered',
          percent: 80,
          weightedContribution: 20,
          isVirtualMissing: false,
        }),
      ]),
    );

    const unsyncedRow = gradebookResponse.body.rows.find(
      (row: { studentId: string }) =>
        row.studentId === fixture.unsyncedStudentId,
    );
    expect(unsyncedRow.cells).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assessmentId,
          itemId: null,
          status: 'missing',
          isVirtualMissing: true,
        }),
      ]),
    );

    const analyticsSummaryResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/analytics/summary`)
      .query(analyticsQuery)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(analyticsSummaryResponse.body).toMatchObject({
      studentCount: 2,
      assessmentCount: 1,
      enteredItemCount: 1,
      missingItemCount: 1,
      averagePercent: 20,
      highestPercent: 20,
      lowestPercent: 20,
    });

    const analyticsDistributionResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/analytics/distribution`)
      .query(analyticsQuery)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(analyticsDistributionResponse.body).toMatchObject({
      totalStudents: 2,
      incompleteCount: 1,
    });
    expect(analyticsDistributionResponse.body.buckets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: 20, to: 29, count: 1 }),
      ]),
    );

    const snapshotResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/grades/students/${fixture.submittingStudentId}/snapshot`,
      )
      .query({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
        subjectId: fixture.subjectId,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(snapshotResponse.body).toMatchObject({
      studentId: fixture.submittingStudentId,
      finalPercent: 20,
      completedWeight: 25,
    });
    expect(snapshotResponse.body.subjects).toEqual([
      expect.objectContaining({
        subjectId: fixture.subjectId,
        finalPercent: 20,
        completedWeight: 25,
        assessmentCount: 1,
        enteredCount: 1,
      }),
    ]);
    expect(snapshotResponse.body.assessments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assessmentId,
          itemId: gradeItemId,
          score: 8,
          status: 'entered',
          percent: 80,
          weightedContribution: 20,
          isVirtualMissing: false,
        }),
      ]),
    );

    const expectedAuditActions = [
      'grades.assessment.create',
      'grades.assessment.publish',
      'grades.assessment.approve',
      'grades.question.create',
      'grades.submission.create',
      'grades.submission.answer.save',
      'grades.submission.answers.bulk_save',
      'grades.submission.submit',
      'grades.submission.answer.review',
      'grades.submission.answers.bulk_review',
      'grades.submission.review.finalize',
      'grades.submission.grade_item.sync',
    ];
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        schoolId: demoSchoolId,
        action: { in: expectedAuditActions },
        resourceId: {
          in: [
            assessmentId,
            mcqQuestion.id,
            shortQuestion.id,
            trueFalseQuestion.id,
            submissionId,
            mcqAnswerId,
            shortAnswerId,
          ],
        },
      },
      select: { action: true },
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

function selectEndDateWithinAcademicYear(params: {
  startDate: Date;
  endDate: Date;
  offsetDays: number;
}): Date {
  const candidate = addUtcDays(params.startDate, params.offsetDays);
  return candidate <= params.endDate ? candidate : params.endDate;
}

function selectDateWithinTerm(
  startDate: Date,
  endDate: Date,
  offsetDays: number,
): string {
  const candidate = addUtcDays(startDate, offsetDays);
  return formatDateOnly(candidate <= endDate ? candidate : startDate);
}
