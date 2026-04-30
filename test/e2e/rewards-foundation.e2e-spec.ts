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

const REWARD_AUDIT_ACTIONS = [
  'reinforcement.reward.catalog.create',
  'reinforcement.reward.catalog.update',
  'reinforcement.reward.catalog.publish',
  'reinforcement.reward.catalog.archive',
  'reinforcement.reward.redemption.request',
  'reinforcement.reward.redemption.cancel',
  'reinforcement.reward.redemption.approve',
  'reinforcement.reward.redemption.reject',
  'reinforcement.reward.redemption.fulfill',
] as const;

jest.setTimeout(45000);

describe('Rewards Foundation closeout flow (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let demoSchoolId: string;
  let demoOrganizationId: string;

  const cleanupState = {
    rewardIds: new Set<string>(),
    redemptionIds: new Set<string>(),
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
      const rewardIds = [...cleanupState.rewardIds];
      const redemptionIds = [...cleanupState.redemptionIds];
      const studentIds = [...cleanupState.studentIds];
      const auditResourceIds = [...rewardIds, ...redemptionIds];

      if (auditResourceIds.length > 0) {
        await prisma.auditLog.deleteMany({
          where: {
            resourceId: { in: auditResourceIds },
            action: { in: [...REWARD_AUDIT_ACTIONS] },
          },
        });
      }

      if (redemptionIds.length > 0 || rewardIds.length > 0) {
        await prisma.rewardRedemption.deleteMany({
          where: {
            OR: [
              ...(redemptionIds.length > 0
                ? [{ id: { in: redemptionIds } }]
                : []),
              ...(rewardIds.length > 0
                ? [{ catalogItemId: { in: rewardIds } }]
                : []),
            ],
          },
        });
      }

      if (rewardIds.length > 0) {
        await prisma.rewardCatalogItem.deleteMany({
          where: { id: { in: rewardIds } },
        });
      }

      if (studentIds.length > 0) {
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

  async function login(): Promise<{ accessToken: string }> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email: DEMO_ADMIN_EMAIL, password: DEMO_ADMIN_PASSWORD })
      .expect(200);

    return { accessToken: response.body.accessToken };
  }

  async function createRewardsPrerequisites(): Promise<{
    academicYearId: string;
    termId: string;
    stageId: string;
    gradeId: string;
    sectionId: string;
    classroomId: string;
    studentId: string;
    enrollmentId: string;
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
          nameAr: `Sprint 5C Year ${suffix} AR`,
          nameEn: `Sprint 5C Year ${suffix}`,
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
          nameAr: `Sprint 5C Term ${suffix} AR`,
          nameEn: `Sprint 5C Term ${suffix}`,
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
        nameAr: `Sprint 5C Stage ${suffix} AR`,
        nameEn: `Sprint 5C Stage ${suffix}`,
        sortOrder: 1,
      },
      select: { id: true },
    });
    cleanupState.stageIds.add(stage.id);

    const grade = await prisma.grade.create({
      data: {
        schoolId: demoSchoolId,
        stageId: stage.id,
        nameAr: `Sprint 5C Grade ${suffix} AR`,
        nameEn: `Sprint 5C Grade ${suffix}`,
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
        nameAr: `Sprint 5C Section ${suffix} AR`,
        nameEn: `Sprint 5C Section ${suffix}`,
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
        nameAr: `Sprint 5C Classroom ${suffix} AR`,
        nameEn: `Sprint 5C Classroom ${suffix}`,
        sortOrder: 1,
        capacity: 24,
      },
      select: { id: true },
    });
    cleanupState.classroomIds.add(classroom.id);

    const student = await prisma.student.create({
      data: {
        schoolId: demoSchoolId,
        organizationId: demoOrganizationId,
        firstName: `Sprint 5C ${suffix}`,
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
      stageId: stage.id,
      gradeId: grade.id,
      sectionId: section.id,
      classroomId: classroom.id,
      studentId: student.id,
      enrollmentId: enrollment.id,
    };
  }

  it('covers reward catalog, redemptions, lifecycle checks, read models, archive, and audit', async () => {
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

    const fixture = await createRewardsPrerequisites();
    const suffix = randomUUID().split('-')[0];
    const xpBaseline = await readStudentXpInvariant(fixture.studentId);
    expect(xpBaseline).toEqual({ count: 0, totalAmount: 0 });

    const unlimitedTitle = `Sprint 5C Unlimited Reward ${suffix}`;
    const createUnlimitedResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/rewards/catalog`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
        titleEn: unlimitedTitle,
        titleAr: `${unlimitedTitle} AR`,
        descriptionEn: 'Closeout unlimited reward.',
        descriptionAr: 'Closeout unlimited reward AR.',
        type: 'privilege',
        minTotalXp: 0,
        isUnlimited: true,
        sortOrder: 10,
      })
      .expect(201);

    const unlimitedRewardId = createUnlimitedResponse.body.id as string;
    cleanupState.rewardIds.add(unlimitedRewardId);
    expect(createUnlimitedResponse.body).toMatchObject({
      id: unlimitedRewardId,
      academicYearId: fixture.academicYearId,
      termId: fixture.termId,
      titleEn: unlimitedTitle,
      type: 'privilege',
      status: 'draft',
      minTotalXp: 0,
      stockQuantity: null,
      stockRemaining: null,
      isUnlimited: true,
      isAvailable: false,
    });
    expectNoSchoolId(createUnlimitedResponse.body);

    const catalogListResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/rewards/catalog`)
      .query({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
        search: unlimitedTitle,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(catalogListResponse.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: unlimitedRewardId,
          titleEn: unlimitedTitle,
          status: 'draft',
        }),
      ]),
    );
    expectNoSchoolId(catalogListResponse.body);

    const catalogDetailResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/reinforcement/rewards/catalog/${unlimitedRewardId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(catalogDetailResponse.body).toMatchObject({
      id: unlimitedRewardId,
      titleEn: unlimitedTitle,
      status: 'draft',
      type: 'privilege',
      isUnlimited: true,
    });
    expectNoSchoolId(catalogDetailResponse.body);

    const updatedUnlimitedTitle = `${unlimitedTitle} Updated`;
    const updateUnlimitedResponse = await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/reinforcement/rewards/catalog/${unlimitedRewardId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        titleEn: updatedUnlimitedTitle,
        descriptionEn: 'Updated by Sprint 5C closeout.',
        sortOrder: 11,
        metadata: { sprint: '5c', branch: 'draft-update' },
      })
      .expect(200);

    expect(updateUnlimitedResponse.body).toMatchObject({
      id: unlimitedRewardId,
      titleEn: updatedUnlimitedTitle,
      status: 'draft',
      sortOrder: 11,
    });

    const publishUnlimitedResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/rewards/catalog/${unlimitedRewardId}/publish`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(201);

    expect(publishUnlimitedResponse.body).toMatchObject({
      id: unlimitedRewardId,
      status: 'published',
      isAvailable: true,
    });
    expect(publishUnlimitedResponse.body.publishedAt).toEqual(
      expect.any(String),
    );
    expect(publishUnlimitedResponse.body.publishedById).toEqual(
      meResponse.body.id,
    );

    const unlimitedStockBeforeRequest =
      await readRewardStock(unlimitedRewardId);
    const requestUnlimitedResponse = await createRedemption({
      accessToken,
      catalogItemId: unlimitedRewardId,
      studentId: fixture.studentId,
      enrollmentId: fixture.enrollmentId,
      academicYearId: fixture.academicYearId,
      termId: fixture.termId,
      requestNoteEn: 'Requested by Sprint 5C E2E.',
    });

    const unlimitedRedemptionId = requestUnlimitedResponse.body.id as string;
    cleanupState.redemptionIds.add(unlimitedRedemptionId);
    expect(requestUnlimitedResponse.body).toMatchObject({
      id: unlimitedRedemptionId,
      catalogItemId: unlimitedRewardId,
      studentId: fixture.studentId,
      enrollmentId: fixture.enrollmentId,
      status: 'requested',
      requestSource: 'dashboard',
      eligibilitySnapshot: expect.objectContaining({
        minTotalXp: 0,
        totalEarnedXp: 0,
        eligible: true,
        stockAvailable: true,
        isUnlimited: true,
        stockRemaining: null,
      }),
      catalogItem: expect.objectContaining({
        id: unlimitedRewardId,
        titleEn: updatedUnlimitedTitle,
        status: 'published',
      }),
      student: expect.objectContaining({ id: fixture.studentId }),
    });
    expectNoSchoolId(requestUnlimitedResponse.body);
    await expectRewardStock(unlimitedRewardId, unlimitedStockBeforeRequest);
    await expectStudentXpInvariant(fixture.studentId, xpBaseline);

    const redemptionsListResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/rewards/redemptions`)
      .query({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
        studentId: fixture.studentId,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(redemptionsListResponse.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: unlimitedRedemptionId,
          catalogItemId: unlimitedRewardId,
          status: 'requested',
        }),
      ]),
    );
    expectNoSchoolId(redemptionsListResponse.body);

    const redemptionDetailResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/reinforcement/rewards/redemptions/${unlimitedRedemptionId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(redemptionDetailResponse.body).toMatchObject({
      id: unlimitedRedemptionId,
      catalogItem: expect.objectContaining({
        id: unlimitedRewardId,
        titleEn: updatedUnlimitedTitle,
      }),
      student: expect.objectContaining({ id: fixture.studentId }),
      enrollment: expect.objectContaining({
        id: fixture.enrollmentId,
        classroomId: fixture.classroomId,
      }),
    });
    expectNoSchoolId(redemptionDetailResponse.body);

    const duplicateResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/rewards/redemptions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(
        redemptionPayload({
          catalogItemId: unlimitedRewardId,
          studentId: fixture.studentId,
          enrollmentId: fixture.enrollmentId,
          academicYearId: fixture.academicYearId,
          termId: fixture.termId,
        }),
      )
      .expect(409);
    expect(duplicateResponse.body?.error?.code).toBe(
      'reinforcement.reward.duplicate_redemption',
    );

    const cancelResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/rewards/redemptions/${unlimitedRedemptionId}/cancel`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ cancellationReasonEn: 'Closeout cancellation path.' })
      .expect(201);

    expect(cancelResponse.body).toMatchObject({
      id: unlimitedRedemptionId,
      status: 'cancelled',
      cancelledById: meResponse.body.id,
    });
    expect(cancelResponse.body.cancelledAt).toEqual(expect.any(String));
    await expectRewardStock(unlimitedRewardId, unlimitedStockBeforeRequest);
    await expectStudentXpInvariant(fixture.studentId, xpBaseline);

    const limitedTitle = `Sprint 5C Limited Reward ${suffix}`;
    const limitedRewardId = await createAndPublishReward({
      accessToken,
      fixture,
      titleEn: limitedTitle,
      type: 'physical',
      isUnlimited: false,
      stockQuantity: 1,
      stockRemaining: 1,
      sortOrder: 20,
    });

    await expectRewardStock(limitedRewardId, {
      isUnlimited: false,
      stockQuantity: 1,
      stockRemaining: 1,
    });

    const requestLimitedResponse = await createRedemption({
      accessToken,
      catalogItemId: limitedRewardId,
      studentId: fixture.studentId,
      enrollmentId: fixture.enrollmentId,
      academicYearId: fixture.academicYearId,
      termId: fixture.termId,
    });

    const limitedRedemptionId = requestLimitedResponse.body.id as string;
    cleanupState.redemptionIds.add(limitedRedemptionId);
    expect(requestLimitedResponse.body).toMatchObject({
      id: limitedRedemptionId,
      status: 'requested',
      eligibilitySnapshot: expect.objectContaining({
        eligible: true,
        stockAvailable: true,
        stockRemaining: 1,
      }),
    });
    await expectRewardStock(limitedRewardId, {
      isUnlimited: false,
      stockQuantity: 1,
      stockRemaining: 1,
    });
    await expectStudentXpInvariant(fixture.studentId, xpBaseline);

    const approveLimitedResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/rewards/redemptions/${limitedRedemptionId}/approve`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reviewNoteEn: 'Approved by Sprint 5C E2E.' })
      .expect(201);

    expect(approveLimitedResponse.body).toMatchObject({
      id: limitedRedemptionId,
      status: 'approved',
      reviewedById: meResponse.body.id,
      eligibilitySnapshot: expect.objectContaining({
        eligible: true,
        stockAvailable: true,
        stockRemainingBeforeApproval: 1,
        stockRemainingAfterApproval: 0,
        stockRemaining: 0,
      }),
    });
    expect(approveLimitedResponse.body.reviewedAt).toEqual(expect.any(String));
    await expectRewardStock(limitedRewardId, {
      isUnlimited: false,
      stockQuantity: 1,
      stockRemaining: 0,
    });
    await expectStudentXpInvariant(fixture.studentId, xpBaseline);

    const approvedCancelResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/rewards/redemptions/${limitedRedemptionId}/cancel`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ cancellationReasonEn: 'Approved redemptions stay approved.' })
      .expect(409);
    expect(approvedCancelResponse.body?.error?.code).toBe(
      'reinforcement.redemption.not_requested',
    );
    await expectRewardStock(limitedRewardId, {
      isUnlimited: false,
      stockQuantity: 1,
      stockRemaining: 0,
    });

    const fulfillResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/rewards/redemptions/${limitedRedemptionId}/fulfill`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fulfillmentNoteEn: 'Delivered at the school desk.' })
      .expect(201);

    expect(fulfillResponse.body).toMatchObject({
      id: limitedRedemptionId,
      status: 'fulfilled',
      fulfilledById: meResponse.body.id,
    });
    expect(fulfillResponse.body.fulfilledAt).toEqual(expect.any(String));
    await expectRewardStock(limitedRewardId, {
      isUnlimited: false,
      stockQuantity: 1,
      stockRemaining: 0,
    });
    await expectStudentXpInvariant(fixture.studentId, xpBaseline);

    const terminalRejectResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/rewards/redemptions/${limitedRedemptionId}/reject`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reviewNoteEn: 'Terminal redemptions cannot be rejected.' })
      .expect(409);
    expect(terminalRejectResponse.body?.error?.code).toBe(
      'reinforcement.redemption.terminal',
    );

    const outOfStockResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/rewards/redemptions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(
        redemptionPayload({
          catalogItemId: limitedRewardId,
          studentId: fixture.studentId,
          enrollmentId: fixture.enrollmentId,
          academicYearId: fixture.academicYearId,
          termId: fixture.termId,
        }),
      )
      .expect(409);
    expect(outOfStockResponse.body?.error?.code).toBe(
      'reinforcement.reward.out_of_stock',
    );

    const highXpRewardId = await createAndPublishReward({
      accessToken,
      fixture,
      titleEn: `Sprint 5C High XP Reward ${suffix}`,
      type: 'certificate',
      minTotalXp: 999999,
      isUnlimited: true,
      sortOrder: 30,
    });

    const insufficientXpResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/rewards/redemptions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(
        redemptionPayload({
          catalogItemId: highXpRewardId,
          studentId: fixture.studentId,
          enrollmentId: fixture.enrollmentId,
          academicYearId: fixture.academicYearId,
          termId: fixture.termId,
        }),
      )
      .expect(422);
    expect(insufficientXpResponse.body?.error?.code).toBe(
      'reinforcement.reward.insufficient_xp',
    );
    await expectStudentXpInvariant(fixture.studentId, xpBaseline);

    const rejectRewardId = await createAndPublishReward({
      accessToken,
      fixture,
      titleEn: `Sprint 5C Reject Reward ${suffix}`,
      type: 'digital',
      isUnlimited: true,
      sortOrder: 40,
    });
    const rejectRequestResponse = await createRedemption({
      accessToken,
      catalogItemId: rejectRewardId,
      studentId: fixture.studentId,
      enrollmentId: fixture.enrollmentId,
      academicYearId: fixture.academicYearId,
      termId: fixture.termId,
    });
    const rejectedRedemptionId = rejectRequestResponse.body.id as string;
    cleanupState.redemptionIds.add(rejectedRedemptionId);

    const rejectResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/rewards/redemptions/${rejectedRedemptionId}/reject`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reviewNoteEn: 'Rejected by Sprint 5C E2E.' })
      .expect(201);

    expect(rejectResponse.body).toMatchObject({
      id: rejectedRedemptionId,
      status: 'rejected',
      reviewedById: meResponse.body.id,
    });
    expect(rejectResponse.body.reviewedAt).toEqual(expect.any(String));
    await expectStudentXpInvariant(fixture.studentId, xpBaseline);

    const approvedHoldRewardId = await createAndPublishReward({
      accessToken,
      fixture,
      titleEn: `Sprint 5C Approved Hold Reward ${suffix}`,
      type: 'other',
      isUnlimited: true,
      sortOrder: 50,
    });
    const approvedHoldRequest = await createRedemption({
      accessToken,
      catalogItemId: approvedHoldRewardId,
      studentId: fixture.studentId,
      enrollmentId: fixture.enrollmentId,
      academicYearId: fixture.academicYearId,
      termId: fixture.termId,
    });
    const approvedHoldRedemptionId = approvedHoldRequest.body.id as string;
    cleanupState.redemptionIds.add(approvedHoldRedemptionId);

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/rewards/redemptions/${approvedHoldRedemptionId}/approve`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reviewNoteEn: 'Keep approved for dashboard status counts.' })
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe('approved');
      });

    const openRewardId = await createAndPublishReward({
      accessToken,
      fixture,
      titleEn: `Sprint 5C Open Reward ${suffix}`,
      type: 'privilege',
      isUnlimited: true,
      sortOrder: 60,
    });
    const openRequest = await createRedemption({
      accessToken,
      catalogItemId: openRewardId,
      studentId: fixture.studentId,
      enrollmentId: fixture.enrollmentId,
      academicYearId: fixture.academicYearId,
      termId: fixture.termId,
    });
    const openRedemptionId = openRequest.body.id as string;
    cleanupState.redemptionIds.add(openRedemptionId);

    const lowStockRewardId = await createAndPublishReward({
      accessToken,
      fixture,
      titleEn: `Sprint 5C Low Stock Reward ${suffix}`,
      type: 'physical',
      isUnlimited: false,
      stockQuantity: 5,
      stockRemaining: 1,
      sortOrder: 70,
    });

    await expectStudentXpInvariant(fixture.studentId, xpBaseline);

    const readAuditCountBefore = await countTrackedRewardAuditLogs();
    const lowStockBeforeReads = await readRewardStock(lowStockRewardId);
    const limitedStockBeforeReads = await readRewardStock(limitedRewardId);

    const overviewResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/rewards/overview`)
      .query({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(overviewResponse.body.scope).toMatchObject({
      academicYearId: fixture.academicYearId,
      termId: fixture.termId,
    });
    expect(overviewResponse.body.catalog).toEqual(
      expect.objectContaining({
        total: expect.any(Number),
        published: expect.any(Number),
        physical: expect.any(Number),
        unlimited: expect.any(Number),
        limited: expect.any(Number),
      }),
    );
    expect(overviewResponse.body.redemptions).toEqual(
      expect.objectContaining({
        requested: expect.any(Number),
        approved: expect.any(Number),
        rejected: expect.any(Number),
        fulfilled: expect.any(Number),
        cancelled: expect.any(Number),
      }),
    );
    expect(overviewResponse.body.redemptions).toMatchObject({
      requested: 1,
      approved: 1,
      rejected: 1,
      fulfilled: 1,
      cancelled: 1,
    });
    expect(overviewResponse.body.fulfillment).toEqual(
      expect.objectContaining({
        fulfillmentRate: expect.any(Number),
        pendingReview: expect.any(Number),
        pendingFulfillment: expect.any(Number),
      }),
    );
    expect(overviewResponse.body.xp).toEqual(
      expect.objectContaining({
        totalEarnedXp: expect.any(Number),
        studentsWithXp: expect.any(Number),
        averageEarnedXp: expect.any(Number),
      }),
    );
    expect(overviewResponse.body.topRequestedRewards.length).toBeGreaterThan(0);
    expect(overviewResponse.body.recentRedemptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: openRedemptionId }),
        expect.objectContaining({ id: limitedRedemptionId }),
      ]),
    );
    expect(overviewResponse.body.lowStockRewards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: lowStockRewardId,
          isLowStock: true,
          stockRemaining: 1,
        }),
      ]),
    );
    expectNoSchoolId(overviewResponse.body);

    const studentSummaryResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/reinforcement/rewards/students/${fixture.studentId}/summary`,
      )
      .query({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
        includeCatalogEligibility: true,
        includeHistory: true,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(studentSummaryResponse.body).toMatchObject({
      student: { id: fixture.studentId },
      xp: { totalEarnedXp: 0 },
      redemptionsSummary: expect.objectContaining({
        requested: 1,
        approved: 1,
        rejected: 1,
        fulfilled: 1,
        cancelled: 1,
      }),
    });
    expect(studentSummaryResponse.body.history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: unlimitedRedemptionId }),
        expect.objectContaining({ id: limitedRedemptionId }),
        expect.objectContaining({ id: rejectedRedemptionId }),
        expect.objectContaining({ id: approvedHoldRedemptionId }),
        expect.objectContaining({ id: openRedemptionId }),
      ]),
    );

    const eligibilityByReward = new Map(
      studentSummaryResponse.body.eligibility.map(
        (row: { catalogItemId: string }) => [row.catalogItemId, row],
      ),
    );
    expect(eligibilityByReward.get(limitedRewardId)).toEqual(
      expect.objectContaining({
        catalogItemId: limitedRewardId,
        stockAvailable: false,
        isEligible: false,
      }),
    );
    expect(eligibilityByReward.get(highXpRewardId)).toEqual(
      expect.objectContaining({
        catalogItemId: highXpRewardId,
        hasEnoughXp: false,
        isEligible: false,
      }),
    );
    expect(eligibilityByReward.get(openRewardId)).toEqual(
      expect.objectContaining({
        catalogItemId: openRewardId,
        hasOpenRedemption: true,
        openRedemptionId,
        isEligible: false,
      }),
    );
    expect(eligibilityByReward.get(lowStockRewardId)).toEqual(
      expect.objectContaining({
        catalogItemId: lowStockRewardId,
        stockAvailable: true,
        hasEnoughXp: true,
        hasOpenRedemption: false,
        isEligible: true,
      }),
    );
    expectNoSchoolId(studentSummaryResponse.body);

    const catalogSummaryResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/rewards/catalog-summary`)
      .query({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(catalogSummaryResponse.body.summary).toEqual(
      expect.objectContaining({
        published: expect.any(Number),
        outOfStock: expect.any(Number),
        lowStock: expect.any(Number),
        unlimited: expect.any(Number),
        limited: expect.any(Number),
      }),
    );
    expect(
      catalogSummaryResponse.body.summary.outOfStock,
    ).toBeGreaterThanOrEqual(1);
    expect(catalogSummaryResponse.body.summary.lowStock).toBeGreaterThanOrEqual(
      1,
    );

    const catalogSummaryByReward = new Map(
      catalogSummaryResponse.body.items.map((item: { id: string }) => [
        item.id,
        item,
      ]),
    );
    expect(catalogSummaryByReward.get(limitedRewardId)).toEqual(
      expect.objectContaining({
        id: limitedRewardId,
        isAvailable: false,
        isLowStock: false,
        stockRemaining: 0,
        redemptions: expect.objectContaining({ fulfilled: 1 }),
      }),
    );
    expect(catalogSummaryByReward.get(lowStockRewardId)).toEqual(
      expect.objectContaining({
        id: lowStockRewardId,
        isAvailable: true,
        isLowStock: true,
        stockRemaining: 1,
        redemptions: expect.objectContaining({ total: 0 }),
      }),
    );
    expectNoSchoolId(catalogSummaryResponse.body);

    await expectStudentXpInvariant(fixture.studentId, xpBaseline);
    await expectRewardStock(limitedRewardId, limitedStockBeforeReads);
    await expectRewardStock(lowStockRewardId, lowStockBeforeReads);
    await expect(countTrackedRewardAuditLogs()).resolves.toBe(
      readAuditCountBefore,
    );

    const archiveResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/rewards/catalog/${unlimitedRewardId}/archive`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reason: 'Sprint 5C closeout archive check.' })
      .expect(201);

    expect(archiveResponse.body).toMatchObject({
      id: unlimitedRewardId,
      status: 'archived',
      archivedById: meResponse.body.id,
    });
    expect(archiveResponse.body.archivedAt).toEqual(expect.any(String));

    const defaultAfterArchiveResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/rewards/catalog`)
      .query({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
        search: updatedUnlimitedTitle,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(
      defaultAfterArchiveResponse.body.items.map(
        (item: { id: string }) => item.id,
      ),
    ).not.toContain(unlimitedRewardId);

    const includeArchivedResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/reinforcement/rewards/catalog`)
      .query({
        academicYearId: fixture.academicYearId,
        termId: fixture.termId,
        search: updatedUnlimitedTitle,
        includeArchived: true,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(includeArchivedResponse.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: unlimitedRewardId,
          status: 'archived',
        }),
      ]),
    );

    const archivedRequestResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/rewards/redemptions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(
        redemptionPayload({
          catalogItemId: unlimitedRewardId,
          studentId: fixture.studentId,
          enrollmentId: fixture.enrollmentId,
          academicYearId: fixture.academicYearId,
          termId: fixture.termId,
        }),
      )
      .expect(409);
    expect(archivedRequestResponse.body?.error?.code).toBe(
      'reinforcement.reward.archived',
    );
    await expectStudentXpInvariant(fixture.studentId, xpBaseline);

    const auditLogs = await prisma.auditLog.findMany({
      where: {
        schoolId: demoSchoolId,
        action: { in: [...REWARD_AUDIT_ACTIONS] },
        resourceId: {
          in: [...cleanupState.rewardIds, ...cleanupState.redemptionIds],
        },
      },
      select: { action: true, outcome: true },
    });
    const auditActions = auditLogs.map((log) => log.action);

    expect(auditActions).toEqual(
      expect.arrayContaining([...REWARD_AUDIT_ACTIONS]),
    );
    expect(auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'reinforcement.reward.redemption.approve',
          outcome: 'SUCCESS',
        }),
        expect.objectContaining({
          action: 'reinforcement.reward.redemption.fulfill',
          outcome: 'SUCCESS',
        }),
        expect.objectContaining({
          action: 'reinforcement.reward.catalog.archive',
          outcome: 'SUCCESS',
        }),
      ]),
    );
  });

  async function createAndPublishReward(params: {
    accessToken: string;
    fixture: {
      academicYearId: string;
      termId: string;
    };
    titleEn: string;
    type: string;
    minTotalXp?: number;
    isUnlimited: boolean;
    stockQuantity?: number;
    stockRemaining?: number;
    sortOrder: number;
  }): Promise<string> {
    const createResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/rewards/catalog`)
      .set('Authorization', `Bearer ${params.accessToken}`)
      .send({
        academicYearId: params.fixture.academicYearId,
        termId: params.fixture.termId,
        titleEn: params.titleEn,
        titleAr: `${params.titleEn} AR`,
        type: params.type,
        minTotalXp: params.minTotalXp ?? 0,
        isUnlimited: params.isUnlimited,
        stockQuantity: params.stockQuantity,
        stockRemaining: params.stockRemaining,
        sortOrder: params.sortOrder,
      })
      .expect(201);

    const rewardId = createResponse.body.id as string;
    cleanupState.rewardIds.add(rewardId);

    const publishResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/reinforcement/rewards/catalog/${rewardId}/publish`,
      )
      .set('Authorization', `Bearer ${params.accessToken}`)
      .send({})
      .expect(201);

    expect(publishResponse.body).toMatchObject({
      id: rewardId,
      status: 'published',
      type: params.type,
      minTotalXp: params.minTotalXp ?? 0,
      isUnlimited: params.isUnlimited,
    });

    return rewardId;
  }

  async function createRedemption(params: {
    accessToken: string;
    catalogItemId: string;
    studentId: string;
    enrollmentId: string;
    academicYearId: string;
    termId: string;
    requestNoteEn?: string;
  }) {
    return request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/reinforcement/rewards/redemptions`)
      .set('Authorization', `Bearer ${params.accessToken}`)
      .send(redemptionPayload(params))
      .expect(201);
  }

  function redemptionPayload(params: {
    catalogItemId: string;
    studentId: string;
    enrollmentId: string;
    academicYearId: string;
    termId: string;
    requestNoteEn?: string;
  }) {
    return {
      catalogItemId: params.catalogItemId,
      studentId: params.studentId,
      enrollmentId: params.enrollmentId,
      academicYearId: params.academicYearId,
      termId: params.termId,
      requestSource: 'dashboard',
      requestNoteEn: params.requestNoteEn,
    };
  }

  async function readRewardStock(rewardId: string): Promise<{
    isUnlimited: boolean;
    stockQuantity: number | null;
    stockRemaining: number | null;
  }> {
    const reward = await prisma.rewardCatalogItem.findFirst({
      where: { id: rewardId, schoolId: demoSchoolId },
      select: {
        isUnlimited: true,
        stockQuantity: true,
        stockRemaining: true,
      },
    });

    if (!reward) {
      throw new Error(`Reward ${rewardId} not found while checking stock.`);
    }

    return reward;
  }

  async function expectRewardStock(
    rewardId: string,
    expected: {
      isUnlimited: boolean;
      stockQuantity: number | null;
      stockRemaining: number | null;
    },
  ): Promise<void> {
    await expect(readRewardStock(rewardId)).resolves.toEqual(expected);
  }

  async function readStudentXpInvariant(studentId: string): Promise<{
    count: number;
    totalAmount: number;
  }> {
    const [count, aggregate] = await Promise.all([
      prisma.xpLedger.count({
        where: { schoolId: demoSchoolId, studentId },
      }),
      prisma.xpLedger.aggregate({
        where: { schoolId: demoSchoolId, studentId },
        _sum: { amount: true },
      }),
    ]);

    return {
      count,
      totalAmount: aggregate._sum.amount ?? 0,
    };
  }

  async function expectStudentXpInvariant(
    studentId: string,
    expected: { count: number; totalAmount: number },
  ): Promise<void> {
    await expect(readStudentXpInvariant(studentId)).resolves.toEqual(expected);
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

  function countTrackedRewardAuditLogs(): Promise<number> {
    const resourceIds = [
      ...cleanupState.rewardIds,
      ...cleanupState.redemptionIds,
    ];
    if (resourceIds.length === 0) return Promise.resolve(0);

    return prisma.auditLog.count({
      where: {
        schoolId: demoSchoolId,
        resourceId: { in: resourceIds },
        action: { in: [...REWARD_AUDIT_ACTIONS] },
      },
    });
  }
});
