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

const BEHAVIOR_AUDIT_ACTIONS = [
  'behavior.category.create',
  'behavior.category.update',
  'behavior.category.delete',
  'behavior.record.create',
  'behavior.record.update',
  'behavior.record.submit',
  'behavior.record.cancel',
  'behavior.record.approve',
  'behavior.record.reject',
] as const;

jest.setTimeout(45000);

describe('Behavior Foundation closeout flow (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let demoSchoolId: string;
  let demoOrganizationId: string;

  const cleanupState = {
    categoryIds: new Set<string>(),
    recordIds: new Set<string>(),
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
      const categoryIds = [...cleanupState.categoryIds];
      const recordIds = [...cleanupState.recordIds];
      const studentIds = [...cleanupState.studentIds];
      const auditResourceIds = [...categoryIds, ...recordIds];

      if (auditResourceIds.length > 0) {
        await prisma.auditLog.deleteMany({
          where: {
            resourceId: { in: auditResourceIds },
            action: { in: [...BEHAVIOR_AUDIT_ACTIONS] },
          },
        });
      }

      if (
        recordIds.length > 0 ||
        categoryIds.length > 0 ||
        studentIds.length > 0
      ) {
        await prisma.behaviorPointLedger.deleteMany({
          where: {
            OR: [
              ...(recordIds.length > 0
                ? [{ recordId: { in: recordIds } }]
                : []),
              ...(categoryIds.length > 0
                ? [{ categoryId: { in: categoryIds } }]
                : []),
              ...(studentIds.length > 0
                ? [{ studentId: { in: studentIds } }]
                : []),
            ],
          },
        });
      }

      if (
        recordIds.length > 0 ||
        categoryIds.length > 0 ||
        studentIds.length > 0
      ) {
        await prisma.behaviorRecord.deleteMany({
          where: {
            OR: [
              ...(recordIds.length > 0 ? [{ id: { in: recordIds } }] : []),
              ...(categoryIds.length > 0
                ? [{ categoryId: { in: categoryIds } }]
                : []),
              ...(studentIds.length > 0
                ? [{ studentId: { in: studentIds } }]
                : []),
            ],
          },
        });
      }

      if (categoryIds.length > 0) {
        await prisma.behaviorCategory.deleteMany({
          where: { id: { in: categoryIds } },
        });
      }

      if (studentIds.length > 0) {
        await prisma.rewardRedemption.deleteMany({
          where: { studentId: { in: studentIds } },
        });
        await prisma.xpLedger.deleteMany({
          where: { studentId: { in: studentIds } },
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

  it('runs the Sprint 6A Behavior Foundation closeout flow', async () => {
    const suffix = randomUUID().split('-')[0];
    const { accessToken } = await login();

    const meResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/auth/me`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(meResponse.body).toMatchObject({
      email: DEMO_ADMIN_EMAIL,
      activeMembership: {
        schoolId: demoSchoolId,
        organizationId: demoOrganizationId,
      },
    });

    const fixture = await createBehaviorPrerequisites(suffix);
    const sideEffectBaseline = await readExternalSideEffectCounts(
      fixture.studentId,
    );
    const positiveCategoryCode = `S6A_POS_${suffix}`.toUpperCase();
    const negativeCategoryCode = `S6A_NEG_${suffix}`.toUpperCase();
    const tempCategoryCode = `S6A_TMP_${suffix}`.toUpperCase();

    const positiveCategoryResponse = await createCategory(accessToken, {
      code: positiveCategoryCode,
      nameEn: `Sprint 6A Positive ${suffix}`,
      nameAr: `Sprint 6A Positive ${suffix} AR`,
      descriptionEn: 'Positive behavior category for Sprint 6A closeout.',
      type: 'positive',
      defaultSeverity: 'medium',
      defaultPoints: 5,
      isActive: true,
      sortOrder: 10,
    });
    const positiveCategoryId = positiveCategoryResponse.body.id as string;

    expect(positiveCategoryResponse.body).toMatchObject({
      code: positiveCategoryCode,
      type: 'positive',
      defaultSeverity: 'medium',
      defaultPoints: 5,
      isActive: true,
    });
    expect(positiveCategoryResponse.body.defaultPoints).toBeGreaterThan(0);
    expectNoSchoolId(positiveCategoryResponse.body);

    const negativeCategoryResponse = await createCategory(accessToken, {
      code: negativeCategoryCode,
      nameEn: `Sprint 6A Negative ${suffix}`,
      nameAr: `Sprint 6A Negative ${suffix} AR`,
      descriptionEn: 'Negative behavior category for Sprint 6A closeout.',
      type: 'negative',
      defaultSeverity: 'high',
      defaultPoints: -3,
      isActive: true,
      sortOrder: 20,
    });
    const negativeCategoryId = negativeCategoryResponse.body.id as string;

    expect(negativeCategoryResponse.body).toMatchObject({
      code: negativeCategoryCode,
      type: 'negative',
      defaultSeverity: 'high',
      defaultPoints: -3,
      isActive: true,
    });
    expect(negativeCategoryResponse.body.defaultPoints).toBeLessThan(0);
    expectNoSchoolId(negativeCategoryResponse.body);

    const categoriesListResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/behavior/categories`)
      .query({ search: suffix })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(categoriesListResponse.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: positiveCategoryId, type: 'positive' }),
        expect.objectContaining({ id: negativeCategoryId, type: 'negative' }),
      ]),
    );
    expectNoSchoolId(categoriesListResponse.body);

    const categoryDetailResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/behavior/categories/${positiveCategoryId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(categoryDetailResponse.body).toMatchObject({
      id: positiveCategoryId,
      code: positiveCategoryCode,
      type: 'positive',
      defaultSeverity: 'medium',
      defaultPoints: 5,
    });
    expectNoSchoolId(categoryDetailResponse.body);

    const categoryUpdateResponse = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/behavior/categories/${negativeCategoryId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        descriptionEn: 'Updated before the negative category is used.',
        sortOrder: 25,
      })
      .expect(200);

    expect(categoryUpdateResponse.body).toMatchObject({
      id: negativeCategoryId,
      descriptionEn: 'Updated before the negative category is used.',
      sortOrder: 25,
    });
    expectNoSchoolId(categoryUpdateResponse.body);

    const positiveRecordResponse = await createRecord(accessToken, {
      academicYearId: fixture.academicYearId,
      termId: fixture.termId,
      studentId: fixture.studentId,
      enrollmentId: fixture.enrollmentId,
      categoryId: positiveCategoryId,
      titleEn: `Sprint 6A Positive Record ${suffix}`,
      titleAr: `Sprint 6A Positive Record ${suffix} AR`,
      noteEn: 'Created as a draft and approved through review.',
      occurredAt: fixture.occurredAt,
    });
    const positiveRecordId = positiveRecordResponse.body.id as string;

    expect(positiveRecordResponse.body).toMatchObject({
      id: positiveRecordId,
      academicYearId: fixture.academicYearId,
      termId: fixture.termId,
      studentId: fixture.studentId,
      enrollmentId: fixture.enrollmentId,
      categoryId: positiveCategoryId,
      status: 'draft',
      type: 'positive',
      severity: 'medium',
      points: 5,
    });
    expectNoSchoolId(positiveRecordResponse.body);

    const recordsListResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/behavior/records`)
      .query({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
        studentId: fixture.studentId,
        search: `Positive Record ${suffix}`,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(recordsListResponse.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: positiveRecordId, status: 'draft' }),
      ]),
    );
    expect(recordsListResponse.body.summary).toEqual(
      expect.objectContaining({ total: 1, draft: 1, positive: 1 }),
    );
    expectNoSchoolId(recordsListResponse.body);

    const recordDetailResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/behavior/records/${positiveRecordId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(recordDetailResponse.body).toMatchObject({
      id: positiveRecordId,
      academicYear: { id: fixture.academicYearId },
      term: { id: fixture.termId },
      student: { id: fixture.studentId },
      enrollment: { id: fixture.enrollmentId },
      category: { id: positiveCategoryId },
    });
    expectNoSchoolId(recordDetailResponse.body);

    const updatedPositiveRecordResponse = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/behavior/records/${positiveRecordId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        titleEn: `Sprint 6A Positive Record Updated ${suffix}`,
        noteEn: 'Updated while the record is still draft.',
        metadata: { closeout: 'sprint6a' },
      })
      .expect(200);

    expect(updatedPositiveRecordResponse.body).toMatchObject({
      id: positiveRecordId,
      status: 'draft',
      titleEn: `Sprint 6A Positive Record Updated ${suffix}`,
      noteEn: 'Updated while the record is still draft.',
      metadata: { closeout: 'sprint6a' },
    });
    expectNoSchoolId(updatedPositiveRecordResponse.body);

    const submittedPositiveResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/behavior/records/${positiveRecordId}/submit`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(201);

    expect(submittedPositiveResponse.body).toMatchObject({
      id: positiveRecordId,
      status: 'submitted',
      submittedById: meResponse.body.id,
    });
    expect(submittedPositiveResponse.body.submittedAt).toEqual(
      expect.any(String),
    );
    expectNoSchoolId(submittedPositiveResponse.body);
    await expectBehaviorPointLedgerCount(positiveRecordId, 0);
    await expectExternalSideEffectCounts(fixture.studentId, sideEffectBaseline);

    const submittedUpdateResponse = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/behavior/records/${positiveRecordId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ noteEn: 'Submitted records cannot be updated.' })
      .expect(409);

    expect(submittedUpdateResponse.body?.error?.code).toBe(
      'behavior.record.invalid_status_transition',
    );

    const reviewQueueResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/behavior/review-queue`)
      .query({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
        studentId: fixture.studentId,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(reviewQueueResponse.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: positiveRecordId,
          status: 'submitted',
          type: 'positive',
        }),
      ]),
    );
    expect(reviewQueueResponse.body.summary).toEqual(
      expect.objectContaining({ submitted: 1, positive: 1 }),
    );
    expectNoSchoolId(reviewQueueResponse.body);

    const reviewQueueDetailResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/behavior/review-queue/${positiveRecordId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(reviewQueueDetailResponse.body).toMatchObject({
      id: positiveRecordId,
      status: 'submitted',
      summaries: {
        student: { id: fixture.studentId },
        enrollment: { id: fixture.enrollmentId },
        category: { id: positiveCategoryId },
        academicYear: { id: fixture.academicYearId },
        term: { id: fixture.termId },
      },
      behaviorPointLedgerEntries: [],
    });
    expectNoSchoolId(reviewQueueDetailResponse.body);

    const approvePositiveResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/behavior/records/${positiveRecordId}/approve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reviewNoteEn: 'Approved by Sprint 6A closeout.' })
      .expect(201);

    expect(approvePositiveResponse.body.record).toMatchObject({
      id: positiveRecordId,
      status: 'approved',
      reviewedById: meResponse.body.id,
      reviewNoteEn: 'Approved by Sprint 6A closeout.',
    });
    expect(approvePositiveResponse.body.record.reviewedAt).toEqual(
      expect.any(String),
    );
    expect(approvePositiveResponse.body.behaviorPointLedger).toMatchObject({
      recordId: positiveRecordId,
      studentId: fixture.studentId,
      enrollmentId: fixture.enrollmentId,
      categoryId: positiveCategoryId,
      entryType: 'award',
      amount: 5,
      actorId: meResponse.body.id,
    });
    expectNoSchoolId(approvePositiveResponse.body);
    await expectBehaviorPointLedgerCount(positiveRecordId, 1);
    await expectExternalSideEffectCounts(fixture.studentId, sideEffectBaseline);

    const duplicateApproveResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/behavior/records/${positiveRecordId}/approve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reviewNoteEn: 'Duplicate approval should fail.' })
      .expect(409);

    expect(duplicateApproveResponse.body?.error?.code).toBe(
      'behavior.record.already_reviewed',
    );
    await expectBehaviorPointLedgerCount(positiveRecordId, 1);

    const negativeRecordResponse = await createRecord(accessToken, {
      academicYearId: fixture.academicYearId,
      termId: fixture.termId,
      studentId: fixture.studentId,
      enrollmentId: fixture.enrollmentId,
      categoryId: negativeCategoryId,
      titleEn: `Sprint 6A Negative Record ${suffix}`,
      titleAr: `Sprint 6A Negative Record ${suffix} AR`,
      noteEn: 'Created as a submitted negative record and rejected.',
      occurredAt: fixture.occurredAt,
    });
    const negativeRecordId = negativeRecordResponse.body.id as string;

    expect(negativeRecordResponse.body).toMatchObject({
      id: negativeRecordId,
      status: 'draft',
      type: 'negative',
      severity: 'high',
      points: -3,
    });

    const submittedNegativeResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/behavior/records/${negativeRecordId}/submit`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(201);

    expect(submittedNegativeResponse.body).toMatchObject({
      id: negativeRecordId,
      status: 'submitted',
      type: 'negative',
      points: -3,
    });
    await expectBehaviorPointLedgerCount(negativeRecordId, 0);

    const rejectNegativeResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/behavior/records/${negativeRecordId}/reject`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reviewNoteEn: 'Rejected by Sprint 6A closeout.' })
      .expect(201);

    expect(rejectNegativeResponse.body).toMatchObject({
      id: negativeRecordId,
      status: 'rejected',
      reviewedById: meResponse.body.id,
      reviewNoteEn: 'Rejected by Sprint 6A closeout.',
    });
    expect(rejectNegativeResponse.body.reviewedAt).toEqual(expect.any(String));
    expectNoSchoolId(rejectNegativeResponse.body);
    await expectBehaviorPointLedgerCount(negativeRecordId, 0);
    await expectExternalSideEffectCounts(fixture.studentId, sideEffectBaseline);

    const draftCancelResponse = await createRecord(accessToken, {
      academicYearId: fixture.academicYearId,
      termId: fixture.termId,
      studentId: fixture.studentId,
      enrollmentId: fixture.enrollmentId,
      categoryId: positiveCategoryId,
      titleEn: `Sprint 6A Draft Cancel Record ${suffix}`,
      noteEn: 'Created to validate draft cancellation.',
      occurredAt: fixture.occurredAt,
    });
    const draftCancelRecordId = draftCancelResponse.body.id as string;

    const cancelledDraftResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/behavior/records/${draftCancelRecordId}/cancel`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ cancellationReasonEn: 'Cancelled before submission.' })
      .expect(201);

    expect(cancelledDraftResponse.body).toMatchObject({
      id: draftCancelRecordId,
      status: 'cancelled',
      cancelledById: meResponse.body.id,
      cancellationReasonEn: 'Cancelled before submission.',
    });
    expect(cancelledDraftResponse.body.cancelledAt).toEqual(expect.any(String));
    await expectBehaviorPointLedgerCount(draftCancelRecordId, 0);

    const cancelledSubmitResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/behavior/records/${draftCancelRecordId}/submit`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(409);

    expect(cancelledSubmitResponse.body?.error?.code).toBe(
      'behavior.record.cancelled',
    );

    const submittedCancelResponse = await createRecord(accessToken, {
      academicYearId: fixture.academicYearId,
      termId: fixture.termId,
      studentId: fixture.studentId,
      enrollmentId: fixture.enrollmentId,
      categoryId: positiveCategoryId,
      titleEn: `Sprint 6A Submitted Cancel Record ${suffix}`,
      noteEn: 'Created to validate submitted cancellation.',
      occurredAt: fixture.occurredAt,
    });
    const submittedCancelRecordId = submittedCancelResponse.body.id as string;

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/behavior/records/${submittedCancelRecordId}/submit`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(201);

    const cancelledSubmittedResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/behavior/records/${submittedCancelRecordId}/cancel`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ cancellationReasonEn: 'Cancelled after submission.' })
      .expect(201);

    expect(cancelledSubmittedResponse.body).toMatchObject({
      id: submittedCancelRecordId,
      status: 'cancelled',
      cancelledById: meResponse.body.id,
      cancellationReasonEn: 'Cancelled after submission.',
    });
    await expectBehaviorPointLedgerCount(submittedCancelRecordId, 0);
    await expectExternalSideEffectCounts(fixture.studentId, sideEffectBaseline);

    const overviewResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/behavior/overview`)
      .query({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
        studentId: fixture.studentId,
        includeRecentActivity: true,
        includeTopCategories: true,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(overviewResponse.body.scope).toMatchObject({
      academicYearId: fixture.academicYearId,
      termId: fixture.termId,
      studentId: fixture.studentId,
    });
    expect(overviewResponse.body.records).toMatchObject({
      total: 4,
      draft: 0,
      submitted: 0,
      approved: 1,
      rejected: 1,
      cancelled: 2,
      positive: 3,
      negative: 1,
    });
    expect(overviewResponse.body.review).toEqual(
      expect.objectContaining({
        pendingReview: 0,
        reviewed: 2,
        approvalRate: 0.5,
        rejectionRate: 0.5,
      }),
    );
    expect(overviewResponse.body.points).toMatchObject({
      totalPoints: 5,
      positivePoints: 5,
      negativePoints: 0,
      awardEntries: 1,
      penaltyEntries: 0,
      studentsWithPoints: 1,
    });
    expect(overviewResponse.body.categories).toEqual(
      expect.objectContaining({
        totalCategories: expect.any(Number),
        activeCategories: expect.any(Number),
        inactiveCategories: expect.any(Number),
        topCategories: expect.arrayContaining([
          expect.objectContaining({
            categoryId: positiveCategoryId,
            totalPoints: 5,
          }),
        ]),
      }),
    );
    expect(overviewResponse.body.recentActivity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: positiveRecordId, status: 'approved' }),
        expect.objectContaining({ id: negativeRecordId, status: 'rejected' }),
        expect.objectContaining({
          id: draftCancelRecordId,
          status: 'cancelled',
        }),
        expect.objectContaining({
          id: submittedCancelRecordId,
          status: 'cancelled',
        }),
      ]),
    );
    expect(overviewResponse.body.topStudents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          studentId: fixture.studentId,
          totalPoints: 5,
        }),
      ]),
    );
    expectNoSchoolId(overviewResponse.body);

    const studentSummaryResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/behavior/students/${fixture.studentId}/summary`)
      .query({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
        includeTimeline: true,
        includeCategoryBreakdown: true,
        includeLedger: true,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(studentSummaryResponse.body).toMatchObject({
      student: { id: fixture.studentId },
      scope: {
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
        studentId: fixture.studentId,
      },
      records: {
        total: 4,
        approved: 1,
        rejected: 1,
        cancelled: 2,
        positive: 3,
        negative: 1,
      },
      points: {
        totalPoints: 5,
        positivePoints: 5,
        negativePoints: 0,
        awardEntries: 1,
        penaltyEntries: 0,
      },
    });
    expect(studentSummaryResponse.body.timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: positiveRecordId }),
        expect.objectContaining({ id: negativeRecordId }),
      ]),
    );
    expect(studentSummaryResponse.body.ledger).toEqual([
      expect.objectContaining({
        recordId: positiveRecordId,
        categoryId: positiveCategoryId,
        entryType: 'award',
        amount: 5,
      }),
    ]);
    expect(studentSummaryResponse.body).not.toHaveProperty('xp');
    expect(studentSummaryResponse.body).not.toHaveProperty('rewards');
    expectNoForbiddenKeys(studentSummaryResponse.body, [
      'xpLedger',
      'rewardCatalogItem',
      'rewardRedemption',
    ]);
    expectNoSchoolId(studentSummaryResponse.body);

    const classroomSummaryResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/behavior/classrooms/${fixture.classroomId}/summary`,
      )
      .query({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
        includeStudents: true,
        includeCategoryBreakdown: true,
        includeRecentActivity: true,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(classroomSummaryResponse.body).toMatchObject({
      classroom: { id: fixture.classroomId },
      scope: {
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
        classroomId: fixture.classroomId,
      },
      students: {
        totalEnrolledStudents: 1,
        studentsWithBehaviorRecords: 1,
        studentsWithPoints: 1,
      },
      records: {
        total: 4,
        approved: 1,
        rejected: 1,
        cancelled: 2,
        positive: 3,
        negative: 1,
      },
      points: {
        totalPoints: 5,
        positivePoints: 5,
        negativePoints: 0,
      },
    });
    expect(classroomSummaryResponse.body.studentSummaries).toEqual([
      expect.objectContaining({
        student: expect.objectContaining({ id: fixture.studentId }),
        points: expect.objectContaining({ totalPoints: 5 }),
      }),
    ]);
    expect(classroomSummaryResponse.body.recentActivity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: positiveRecordId }),
        expect.objectContaining({ id: negativeRecordId }),
      ]),
    );
    expectNoSchoolId(classroomSummaryResponse.body);

    const tempCategoryResponse = await createCategory(accessToken, {
      code: tempCategoryCode,
      nameEn: `Sprint 6A Temporary ${suffix}`,
      nameAr: `Sprint 6A Temporary ${suffix} AR`,
      type: 'positive',
      defaultSeverity: 'low',
      defaultPoints: 1,
      isActive: true,
      sortOrder: 99,
    });
    const tempCategoryId = tempCategoryResponse.body.id as string;

    await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/behavior/categories/${tempCategoryId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({ ok: true });
      });

    const categoriesAfterDeleteResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/behavior/categories`)
      .query({ search: `S6A_TMP_${suffix}` })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(
      categoriesAfterDeleteResponse.body.items.map(
        (category: { id: string }) => category.id,
      ),
    ).not.toContain(tempCategoryId);

    const deletedDetailResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/behavior/categories/${tempCategoryId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(deletedDetailResponse.body?.error?.code).toBe('not_found');

    const inUseDeleteResponse = await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/behavior/categories/${positiveCategoryId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(409);

    expect(inUseDeleteResponse.body?.error?.code).toBe(
      'behavior.category.in_use',
    );

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/behavior/categories/${positiveCategoryId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const auditLogs = await prisma.auditLog.findMany({
      where: {
        schoolId: demoSchoolId,
        resourceId: {
          in: [...cleanupState.categoryIds, ...cleanupState.recordIds],
        },
        action: { in: [...BEHAVIOR_AUDIT_ACTIONS] },
      },
      select: { action: true, outcome: true },
    });
    const auditActions = auditLogs.map((log) => log.action);

    expect(auditActions).toEqual(
      expect.arrayContaining([...BEHAVIOR_AUDIT_ACTIONS]),
    );
    expect(auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'behavior.record.approve',
          outcome: 'SUCCESS',
        }),
        expect.objectContaining({
          action: 'behavior.record.reject',
          outcome: 'SUCCESS',
        }),
        expect.objectContaining({
          action: 'behavior.category.delete',
          outcome: 'SUCCESS',
        }),
      ]),
    );

    await expectExternalSideEffectCounts(fixture.studentId, sideEffectBaseline);
  });

  async function login(): Promise<{ accessToken: string }> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email: DEMO_ADMIN_EMAIL, password: DEMO_ADMIN_PASSWORD })
      .expect(200);

    return { accessToken: response.body.accessToken };
  }

  async function createBehaviorPrerequisites(suffix: string): Promise<{
    academicYearId: string;
    termId: string;
    occurredAt: string;
    stageId: string;
    gradeId: string;
    sectionId: string;
    classroomId: string;
    studentId: string;
    enrollmentId: string;
  }> {
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
          nameAr: `Sprint 6A Year ${suffix} AR`,
          nameEn: `Sprint 6A Year ${suffix}`,
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
          nameAr: `Sprint 6A Term ${suffix} AR`,
          nameEn: `Sprint 6A Term ${suffix}`,
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
        nameAr: `Sprint 6A Stage ${suffix} AR`,
        nameEn: `Sprint 6A Stage ${suffix}`,
        sortOrder: 610,
      },
      select: { id: true },
    });
    cleanupState.stageIds.add(stage.id);

    const grade = await prisma.grade.create({
      data: {
        schoolId: demoSchoolId,
        stageId: stage.id,
        nameAr: `Sprint 6A Grade ${suffix} AR`,
        nameEn: `Sprint 6A Grade ${suffix}`,
        sortOrder: 610,
      },
      select: { id: true },
    });
    cleanupState.gradeIds.add(grade.id);

    const section = await prisma.section.create({
      data: {
        schoolId: demoSchoolId,
        gradeId: grade.id,
        nameAr: `Sprint 6A Section ${suffix} AR`,
        nameEn: `Sprint 6A Section ${suffix}`,
        sortOrder: 610,
      },
      select: { id: true },
    });
    cleanupState.sectionIds.add(section.id);

    const classroom = await prisma.classroom.create({
      data: {
        schoolId: demoSchoolId,
        sectionId: section.id,
        nameAr: `Sprint 6A Classroom ${suffix} AR`,
        nameEn: `Sprint 6A Classroom ${suffix}`,
        sortOrder: 610,
      },
      select: { id: true },
    });
    cleanupState.classroomIds.add(classroom.id);

    const student = await prisma.student.create({
      data: {
        schoolId: demoSchoolId,
        organizationId: demoOrganizationId,
        firstName: `Behavior${suffix}`,
        lastName: 'Student',
        status: StudentStatus.ACTIVE,
      },
      select: { id: true },
    });
    cleanupState.studentIds.add(student.id);

    const enrollment = await prisma.enrollment.create({
      data: {
        schoolId: demoSchoolId,
        studentId: student.id,
        academicYearId: academicYear.id,
        termId: term.id,
        classroomId: classroom.id,
        status: StudentEnrollmentStatus.ACTIVE,
        enrolledAt: term.startDate,
      },
      select: { id: true },
    });
    cleanupState.enrollmentIds.add(enrollment.id);

    return {
      academicYearId: academicYear.id,
      termId: term.id,
      occurredAt: selectDateWithinTerm(
        term.startDate,
        term.endDate,
        2,
      ).toISOString(),
      stageId: stage.id,
      gradeId: grade.id,
      sectionId: section.id,
      classroomId: classroom.id,
      studentId: student.id,
      enrollmentId: enrollment.id,
    };
  }

  async function createCategory(
    accessToken: string,
    payload: {
      code: string;
      nameEn: string;
      nameAr: string;
      descriptionEn?: string;
      type: 'positive' | 'negative';
      defaultSeverity: 'low' | 'medium' | 'high' | 'critical';
      defaultPoints: number;
      isActive: boolean;
      sortOrder: number;
    },
  ) {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/behavior/categories`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(payload)
      .expect(201);

    cleanupState.categoryIds.add(response.body.id as string);
    return response;
  }

  async function createRecord(
    accessToken: string,
    payload: {
      academicYearId: string;
      termId: string;
      studentId: string;
      enrollmentId: string;
      categoryId: string;
      titleEn: string;
      titleAr?: string;
      noteEn: string;
      occurredAt: string;
    },
  ) {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/behavior/records`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(payload)
      .expect(201);

    cleanupState.recordIds.add(response.body.id as string);
    return response;
  }

  async function expectBehaviorPointLedgerCount(
    recordId: string,
    expectedCount: number,
  ): Promise<void> {
    await expect(
      prisma.behaviorPointLedger.count({
        where: { schoolId: demoSchoolId, recordId },
      }),
    ).resolves.toBe(expectedCount);
  }

  async function readExternalSideEffectCounts(studentId: string): Promise<{
    xpLedgerCount: number;
    xpLedgerAmount: number;
    rewardRedemptionCount: number;
    rewardCatalogItemCount: number;
  }> {
    const [
      xpLedgerCount,
      xpLedgerAggregate,
      rewardRedemptionCount,
      rewardCatalogItemCount,
    ] = await Promise.all([
      prisma.xpLedger.count({
        where: { schoolId: demoSchoolId, studentId },
      }),
      prisma.xpLedger.aggregate({
        where: { schoolId: demoSchoolId, studentId },
        _sum: { amount: true },
      }),
      prisma.rewardRedemption.count({
        where: { schoolId: demoSchoolId, studentId },
      }),
      prisma.rewardCatalogItem.count({
        where: { schoolId: demoSchoolId },
      }),
    ]);

    return {
      xpLedgerCount,
      xpLedgerAmount: xpLedgerAggregate._sum.amount ?? 0,
      rewardRedemptionCount,
      rewardCatalogItemCount,
    };
  }

  async function expectExternalSideEffectCounts(
    studentId: string,
    expected: {
      xpLedgerCount: number;
      xpLedgerAmount: number;
      rewardRedemptionCount: number;
      rewardCatalogItemCount: number;
    },
  ): Promise<void> {
    await expect(readExternalSideEffectCounts(studentId)).resolves.toEqual(
      expected,
    );
  }

  function expectNoSchoolId(value: unknown): void {
    if (!value || typeof value !== 'object') return;

    if (Array.isArray(value)) {
      for (const item of value) expectNoSchoolId(item);
      return;
    }

    for (const [key, nested] of Object.entries(value)) {
      expect(key).not.toBe('schoolId');
      expectNoSchoolId(nested);
    }
  }

  function expectNoForbiddenKeys(
    value: unknown,
    forbiddenKeys: string[],
  ): void {
    if (!value || typeof value !== 'object') return;

    if (Array.isArray(value)) {
      for (const item of value) expectNoForbiddenKeys(item, forbiddenKeys);
      return;
    }

    for (const [key, nested] of Object.entries(value)) {
      expect(forbiddenKeys).not.toContain(key);
      expectNoForbiddenKeys(nested, forbiddenKeys);
    }
  }

  function selectDateWithinTerm(
    startDate: Date,
    endDate: Date,
    offsetDays: number,
  ): Date {
    const candidate = addUtcDays(startDate, offsetDays);
    return candidate <= endDate ? candidate : new Date(startDate);
  }

  function addUtcDays(date: Date, days: number): Date {
    const value = new Date(date);
    value.setUTCDate(value.getUTCDate() + days);
    return value;
  }
});
