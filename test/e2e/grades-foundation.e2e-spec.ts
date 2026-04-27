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

describe('Grades Foundation closeout flow (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let demoSchoolId: string;
  let demoOrganizationId: string;

  const cleanupState = {
    ruleIds: new Set<string>(),
    assessmentIds: new Set<string>(),
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
      const ruleIds = [...cleanupState.ruleIds];
      const assessmentIds = [...cleanupState.assessmentIds];
      const itemIds = [...cleanupState.itemIds];
      const studentIds = [...cleanupState.studentIds];

      const auditResourceIds = [...ruleIds, ...assessmentIds, ...itemIds];
      if (auditResourceIds.length > 0) {
        await prisma.auditLog.deleteMany({
          where: {
            resourceId: { in: auditResourceIds },
            action: {
              in: [
                'grades.rule.create',
                'grades.rule.update',
                'grades.assessment.create',
                'grades.assessment.update',
                'grades.assessment.delete',
                'grades.assessment.publish',
                'grades.assessment.approve',
                'grades.assessment.lock',
                'grades.item.update',
                'grades.items.bulk_update',
              ],
            },
          },
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

      if (assessmentIds.length > 0) {
        await prisma.gradeAssessment.deleteMany({
          where: { id: { in: assessmentIds } },
        });
      }

      if (ruleIds.length > 0) {
        await prisma.gradeRule.deleteMany({
          where: { id: { in: ruleIds } },
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

  async function createGradesPrerequisites(): Promise<{
    academicYearId: string;
    termId: string;
    assessmentDates: {
      main: string;
      draft: string;
      lock: string;
      published: string;
      deleted: string;
    };
    stageId: string;
    gradeId: string;
    sectionId: string;
    classroomId: string;
    subjectId: string;
    enteredStudentId: string;
    absentStudentId: string;
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
          nameAr: `Sprint 4A Year ${suffix} AR`,
          nameEn: `Sprint 4A Year ${suffix}`,
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
        nameAr: `Sprint 4A Term ${suffix} AR`,
        nameEn: `Sprint 4A Term ${suffix}`,
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
        nameAr: `Sprint 4A Stage ${suffix} AR`,
        nameEn: `Sprint 4A Stage ${suffix}`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    cleanupState.stageIds.add(stage.id);

    const grade = await prisma.grade.create({
      data: {
        schoolId: demoSchoolId,
        stageId: stage.id,
        nameAr: `Sprint 4A Grade ${suffix} AR`,
        nameEn: `Sprint 4A Grade ${suffix}`,
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
        nameAr: `Sprint 4A Section ${suffix} AR`,
        nameEn: `Sprint 4A Section ${suffix}`,
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
        nameAr: `Sprint 4A Classroom ${suffix} AR`,
        nameEn: `Sprint 4A Classroom ${suffix}`,
        sortOrder: 1,
        capacity: 24,
      },
      select: { id: true },
    });
    cleanupState.classroomIds.add(classroom.id);

    const subject = await prisma.subject.create({
      data: {
        schoolId: demoSchoolId,
        nameAr: `Sprint 4A Math ${suffix} AR`,
        nameEn: `Sprint 4A Math ${suffix}`,
        code: `S4A-${suffix}`,
        color: '#2563eb',
        isActive: true,
      },
      select: { id: true },
    });
    cleanupState.subjectIds.add(subject.id);

    const [enteredStudent, absentStudent] = await Promise.all([
      prisma.student.create({
        data: {
          schoolId: demoSchoolId,
          organizationId: demoOrganizationId,
          firstName: `Sprint 4A Entered ${suffix}`,
          lastName: 'Student',
          status: StudentStatus.ACTIVE,
        },
        select: { id: true },
      }),
      prisma.student.create({
        data: {
          schoolId: demoSchoolId,
          organizationId: demoOrganizationId,
          firstName: `Sprint 4A Absent ${suffix}`,
          lastName: 'Student',
          status: StudentStatus.ACTIVE,
        },
        select: { id: true },
      }),
    ]);
    cleanupState.studentIds.add(enteredStudent.id);
    cleanupState.studentIds.add(absentStudent.id);

    const [enteredEnrollment, absentEnrollment] = await Promise.all([
      prisma.enrollment.create({
        data: {
          schoolId: demoSchoolId,
          studentId: enteredStudent.id,
          academicYearId: academicYear.id,
          termId: term.id,
          classroomId: classroom.id,
          status: StudentEnrollmentStatus.ACTIVE,
          enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
        },
        select: { id: true },
      }),
      prisma.enrollment.create({
        data: {
          schoolId: demoSchoolId,
          studentId: absentStudent.id,
          academicYearId: academicYear.id,
          termId: term.id,
          classroomId: classroom.id,
          status: StudentEnrollmentStatus.ACTIVE,
          enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
        },
        select: { id: true },
      }),
    ]);
    cleanupState.enrollmentIds.add(enteredEnrollment.id);
    cleanupState.enrollmentIds.add(absentEnrollment.id);

    return {
      academicYearId: academicYear.id,
      termId: term.id,
      assessmentDates: {
        main: selectDateWithinTerm(termStartDate, termEndDate, 14),
        draft: selectDateWithinTerm(termStartDate, termEndDate, 15),
        lock: selectDateWithinTerm(termStartDate, termEndDate, 16),
        published: selectDateWithinTerm(termStartDate, termEndDate, 17),
        deleted: selectDateWithinTerm(termStartDate, termEndDate, 18),
      },
      stageId: stage.id,
      gradeId: grade.id,
      sectionId: section.id,
      classroomId: classroom.id,
      subjectId: subject.id,
      enteredStudentId: enteredStudent.id,
      absentStudentId: absentStudent.id,
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

  async function createAssessment(
    accessToken: string,
    params: {
      fixture: {
        academicYearId: string;
        termId: string;
        subjectId: string;
        classroomId: string;
      };
      titleEn: string;
      date: string;
      weight: number;
      maxScore: number;
      expectedTimeMinutes?: number;
    },
  ) {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/grades/assessments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        ...gradesScopeQuery(params.fixture),
        titleEn: params.titleEn,
        titleAr: `${params.titleEn} AR`,
        type: 'QUIZ',
        deliveryMode: 'SCORE_ONLY',
        date: params.date,
        weight: params.weight,
        maxScore: params.maxScore,
        expectedTimeMinutes: params.expectedTimeMinutes ?? 30,
      })
      .expect(201);

    cleanupState.assessmentIds.add(response.body.id);
    return response.body;
  }

  it('covers grade rules, score-only assessments, workflow, grade entry, read models, and audit', async () => {
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

    const fixture = await createGradesPrerequisites();

    const schoolRuleResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/grades/rules`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
        scopeType: 'school',
        passMark: 50,
        rounding: 'decimal_2',
      })
      .expect(201);
    cleanupState.ruleIds.add(schoolRuleResponse.body.id);

    expect(schoolRuleResponse.body).toMatchObject({
      scopeType: 'school',
      scopeKey: demoSchoolId,
      passMark: 50,
      rounding: 'decimal_2',
    });

    const gradeRuleResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/grades/rules`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
        scopeType: 'grade',
        scopeId: fixture.gradeId,
        gradeId: fixture.gradeId,
        passMark: 60,
        rounding: 'decimal_2',
      })
      .expect(201);
    cleanupState.ruleIds.add(gradeRuleResponse.body.id);

    expect(gradeRuleResponse.body).toMatchObject({
      scopeType: 'grade',
      scopeKey: fixture.gradeId,
      gradeId: fixture.gradeId,
      passMark: 60,
    });

    const rulesListResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/rules`)
      .query({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(rulesListResponse.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: schoolRuleResponse.body.id }),
        expect.objectContaining({ id: gradeRuleResponse.body.id }),
      ]),
    );

    const effectiveClassroomRuleResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/rules/effective`)
      .query({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
        scopeType: 'classroom',
        scopeId: fixture.classroomId,
        classroomId: fixture.classroomId,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(effectiveClassroomRuleResponse.body).toMatchObject({
      source: 'GRADE',
      ruleId: gradeRuleResponse.body.id,
      scopeType: 'grade',
      gradeId: fixture.gradeId,
      passMark: 60,
    });

    const effectiveSchoolRuleResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/rules/effective`)
      .query({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
        scopeType: 'school',
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(effectiveSchoolRuleResponse.body).toMatchObject({
      source: 'SCHOOL',
      ruleId: schoolRuleResponse.body.id,
      scopeType: 'school',
      passMark: 50,
    });

    const mainAssessment = await createAssessment(accessToken, {
      fixture,
      titleEn: `Sprint 4A Main ${randomUUID().split('-')[0]}`,
      date: fixture.assessmentDates.main,
      weight: 20,
      maxScore: 20,
    });

    expect(mainAssessment).toMatchObject({
      subjectId: fixture.subjectId,
      scopeType: 'classroom',
      scopeKey: fixture.classroomId,
      deliveryMode: 'SCORE_ONLY',
      approvalStatus: 'draft',
      isLocked: false,
    });

    const draftAssessment = await createAssessment(accessToken, {
      fixture,
      titleEn: `Sprint 4A Draft Guard ${randomUUID().split('-')[0]}`,
      date: fixture.assessmentDates.draft,
      weight: 5,
      maxScore: 10,
    });

    const lockAssessment = await createAssessment(accessToken, {
      fixture,
      titleEn: `Sprint 4A Lock Guard ${randomUUID().split('-')[0]}`,
      date: fixture.assessmentDates.lock,
      weight: 10,
      maxScore: 10,
    });

    const publishedAssessment = await createAssessment(accessToken, {
      fixture,
      titleEn: `Sprint 4A Published Column ${randomUUID().split('-')[0]}`,
      date: fixture.assessmentDates.published,
      weight: 5,
      maxScore: 10,
    });

    const deleteAssessment = await createAssessment(accessToken, {
      fixture,
      titleEn: `Sprint 4A Delete Guard ${randomUUID().split('-')[0]}`,
      date: fixture.assessmentDates.deleted,
      weight: 4,
      maxScore: 10,
    });

    const assessmentsListResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/assessments`)
      .query(gradesScopeQuery(fixture))
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(assessmentsListResponse.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: mainAssessment.id,
          approvalStatus: 'draft',
        }),
      ]),
    );

    const assessmentDetailResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/assessments/${mainAssessment.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(assessmentDetailResponse.body).toMatchObject({
      id: mainAssessment.id,
      deliveryMode: 'SCORE_ONLY',
      approvalStatus: 'draft',
    });

    const patchedAssessmentResponse = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/grades/assessments/${mainAssessment.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        titleEn: `${mainAssessment.titleEn} Updated`,
        expectedTimeMinutes: 35,
      })
      .expect(200);

    expect(patchedAssessmentResponse.body).toMatchObject({
      id: mainAssessment.id,
      titleEn: `${mainAssessment.titleEn} Updated`,
      expectedTimeMinutes: 35,
    });

    await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/grades/assessments/${deleteAssessment.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({ ok: true });
      });

    const deletedAssessmentResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/assessments/${deleteAssessment.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(deletedAssessmentResponse.body?.error?.code).toBe('not_found');

    const publishMainResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/grades/assessments/${mainAssessment.id}/publish`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    expect(publishMainResponse.body).toMatchObject({
      id: mainAssessment.id,
      approvalStatus: 'published',
      isLocked: false,
    });
    expect(publishMainResponse.body.publishedAt).toEqual(expect.any(String));

    const patchPublishedResponse = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/grades/assessments/${mainAssessment.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ titleEn: 'This update must be rejected' })
      .expect(409);

    expect(patchPublishedResponse.body?.error?.code).toBe(
      'grades.assessment.invalid_status_transition',
    );

    const approveMainResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/grades/assessments/${mainAssessment.id}/approve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    expect(approveMainResponse.body).toMatchObject({
      id: mainAssessment.id,
      approvalStatus: 'approved',
      isLocked: false,
    });
    expect(approveMainResponse.body.approvedAt).toEqual(expect.any(String));

    const publishColumnResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/grades/assessments/${publishedAssessment.id}/publish`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    expect(publishColumnResponse.body).toMatchObject({
      id: publishedAssessment.id,
      approvalStatus: 'published',
    });

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/grades/assessments/${lockAssessment.id}/publish`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/grades/assessments/${lockAssessment.id}/approve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    const lockResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/grades/assessments/${lockAssessment.id}/lock`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    expect(lockResponse.body).toMatchObject({
      id: lockAssessment.id,
      approvalStatus: 'approved',
      isLocked: true,
    });
    expect(lockResponse.body.lockedAt).toEqual(expect.any(String));

    const itemsBeforeEntryResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/assessments/${mainAssessment.id}/items`)
      .query({ classroomId: fixture.classroomId })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const virtualStudentIds = itemsBeforeEntryResponse.body.items
      .filter((item: { isVirtualMissing: boolean }) => item.isVirtualMissing)
      .map((item: { studentId: string }) => item.studentId);
    expect(virtualStudentIds).toEqual(
      expect.arrayContaining([
        fixture.enteredStudentId,
        fixture.absentStudentId,
      ]),
    );

    const singleItemResponse = await request(app.getHttpServer())
      .put(
        `${GLOBAL_PREFIX}/grades/assessments/${mainAssessment.id}/items/${fixture.enteredStudentId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        status: 'entered',
        score: 18,
        comment: 'Strong first entry',
      })
      .expect(200);

    cleanupState.itemIds.add(singleItemResponse.body.id);
    expect(singleItemResponse.body).toMatchObject({
      assessmentId: mainAssessment.id,
      studentId: fixture.enteredStudentId,
      status: 'entered',
      score: 18,
      isVirtualMissing: false,
    });

    const bulkItemsResponse = await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/grades/assessments/${mainAssessment.id}/items`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        items: [
          {
            studentId: fixture.enteredStudentId,
            status: 'entered',
            score: 19,
          },
          {
            studentId: fixture.absentStudentId,
            status: 'absent',
            comment: 'Absent for closeout verification',
          },
        ],
      })
      .expect(200);

    for (const item of bulkItemsResponse.body.items) {
      if (item.id) cleanupState.itemIds.add(item.id);
    }

    expect(bulkItemsResponse.body).toMatchObject({
      assessmentId: mainAssessment.id,
      updatedCount: 2,
      items: expect.arrayContaining([
        expect.objectContaining({
          studentId: fixture.enteredStudentId,
          status: 'entered',
          score: 19,
        }),
        expect.objectContaining({
          studentId: fixture.absentStudentId,
          status: 'absent',
          score: null,
        }),
      ]),
    });

    const itemsAfterEntryResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/assessments/${mainAssessment.id}/items`)
      .query({ classroomId: fixture.classroomId })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(itemsAfterEntryResponse.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          studentId: fixture.enteredStudentId,
          status: 'entered',
          score: 19,
          isVirtualMissing: false,
        }),
        expect.objectContaining({
          studentId: fixture.absentStudentId,
          status: 'absent',
          score: null,
          isVirtualMissing: false,
        }),
      ]),
    );

    const invalidScoreResponse = await request(app.getHttpServer())
      .put(
        `${GLOBAL_PREFIX}/grades/assessments/${mainAssessment.id}/items/${fixture.enteredStudentId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'entered', score: 21 })
      .expect(422);

    expect(invalidScoreResponse.body?.error?.code).toBe(
      'grades.item.out_of_range',
    );

    const draftItemMutationResponse = await request(app.getHttpServer())
      .put(
        `${GLOBAL_PREFIX}/grades/assessments/${draftAssessment.id}/items/${fixture.enteredStudentId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'entered', score: 8 })
      .expect(409);

    expect(draftItemMutationResponse.body?.error?.code).toBe(
      'grades.assessment.not_published',
    );

    const lockedItemMutationResponse = await request(app.getHttpServer())
      .put(
        `${GLOBAL_PREFIX}/grades/assessments/${lockAssessment.id}/items/${fixture.enteredStudentId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'entered', score: 8 })
      .expect(409);

    expect(lockedItemMutationResponse.body?.error?.code).toBe(
      'grades.assessment.locked',
    );

    const gradebookResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/gradebook`)
      .query({ ...gradesScopeQuery(fixture), includeVirtualMissing: true })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const gradebook = gradebookResponse.body;
    const columnIds = gradebook.columns.map(
      (column: { assessmentId: string }) => column.assessmentId,
    );

    expect(columnIds).toEqual(
      expect.arrayContaining([
        mainAssessment.id,
        lockAssessment.id,
        publishedAssessment.id,
      ]),
    );
    expect(columnIds).not.toContain(draftAssessment.id);
    expect(columnIds).not.toContain(deleteAssessment.id);
    expect(gradebook.rule).toMatchObject({
      source: 'GRADE',
      ruleId: gradeRuleResponse.body.id,
      passMark: 60,
      rounding: 'decimal_2',
    });
    expect(gradebook.summary).toMatchObject({
      studentCount: 2,
      assessmentCount: 3,
      averagePercent: 19,
      passingCount: 0,
      failingCount: 1,
      incompleteCount: 1,
    });

    const enteredRow = gradebook.rows.find(
      (row: { studentId: string }) =>
        row.studentId === fixture.enteredStudentId,
    );
    const absentRow = gradebook.rows.find(
      (row: { studentId: string }) => row.studentId === fixture.absentStudentId,
    );

    expect(enteredRow).toMatchObject({
      studentId: fixture.enteredStudentId,
      finalPercent: 19,
      completedWeight: 20,
      status: 'failing',
      totalEnteredCount: 1,
      missingCount: 2,
      absentCount: 0,
    });
    expect(enteredRow.cells).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assessmentId: mainAssessment.id,
          score: 19,
          status: 'entered',
          percent: 95,
          weightedContribution: 19,
          isVirtualMissing: false,
        }),
        expect.objectContaining({
          assessmentId: lockAssessment.id,
          score: null,
          status: 'missing',
          percent: null,
          weightedContribution: null,
          isVirtualMissing: true,
        }),
      ]),
    );

    expect(absentRow).toMatchObject({
      studentId: fixture.absentStudentId,
      finalPercent: null,
      completedWeight: 0,
      status: 'incomplete',
      totalEnteredCount: 0,
      missingCount: 2,
      absentCount: 1,
    });
    expect(absentRow.cells).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assessmentId: mainAssessment.id,
          score: null,
          status: 'absent',
          isVirtualMissing: false,
        }),
      ]),
    );

    const analyticsSummaryResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/analytics/summary`)
      .query(gradesScopeQuery(fixture))
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(analyticsSummaryResponse.body).toMatchObject({
      studentCount: 2,
      assessmentCount: 3,
      enteredItemCount: 1,
      missingItemCount: 4,
      absentItemCount: 1,
      averagePercent: 19,
      highestPercent: 19,
      lowestPercent: 19,
      passingCount: 0,
      failingCount: 1,
      incompleteCount: 1,
      passRate: 0,
      completedWeightAverage: 10,
    });

    const analyticsDistributionResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/grades/analytics/distribution`)
      .query(gradesScopeQuery(fixture))
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(analyticsDistributionResponse.body).toMatchObject({
      incompleteCount: 1,
      totalStudents: 2,
    });
    expect(analyticsDistributionResponse.body.buckets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: 10, to: 19, count: 1 }),
      ]),
    );

    const studentSnapshotResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/grades/students/${fixture.enteredStudentId}/snapshot`,
      )
      .query({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
        subjectId: fixture.subjectId,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(studentSnapshotResponse.body).toMatchObject({
      studentId: fixture.enteredStudentId,
      academicYearId: fixture.academicYearId,
      yearId: fixture.academicYearId,
      termId: fixture.termId,
      subjectId: fixture.subjectId,
      finalPercent: 19,
      completedWeight: 20,
      status: 'failing',
    });
    expect(studentSnapshotResponse.body.subjects).toEqual([
      expect.objectContaining({
        subjectId: fixture.subjectId,
        finalPercent: 19,
        completedWeight: 20,
        assessmentCount: 3,
        enteredCount: 1,
        missingCount: 2,
        absentCount: 0,
        status: 'failing',
      }),
    ]);
    expect(studentSnapshotResponse.body.assessments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assessmentId: mainAssessment.id,
          status: 'entered',
          score: 19,
          percent: 95,
          weightedContribution: 19,
          isVirtualMissing: false,
        }),
        expect.objectContaining({
          assessmentId: publishedAssessment.id,
          status: 'missing',
          isVirtualMissing: true,
        }),
      ]),
    );

    const auditLogs = await prisma.auditLog.findMany({
      where: {
        schoolId: demoSchoolId,
        resourceId: {
          in: [
            ...cleanupState.ruleIds,
            ...cleanupState.assessmentIds,
            ...cleanupState.itemIds,
          ],
        },
        action: {
          in: [
            'grades.rule.create',
            'grades.rule.update',
            'grades.assessment.create',
            'grades.assessment.publish',
            'grades.assessment.approve',
            'grades.assessment.lock',
            'grades.item.update',
            'grades.items.bulk_update',
          ],
        },
      },
      select: { action: true },
    });
    const auditActions = auditLogs.map((log) => log.action);

    expect(auditActions).toEqual(
      expect.arrayContaining([
        'grades.rule.create',
        'grades.assessment.create',
        'grades.assessment.publish',
        'grades.assessment.approve',
        'grades.assessment.lock',
        'grades.item.update',
        'grades.items.bulk_update',
      ]),
    );
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
