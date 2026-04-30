import {
  RewardCatalogItemStatus,
  RewardCatalogItemType,
  RewardRedemptionRequestSource,
  RewardRedemptionStatus,
  StudentEnrollmentStatus,
  StudentStatus,
} from '@prisma/client';
import {
  presentRewardRedemptionDetail,
  presentRewardRedemptionList,
} from '../presenters/reward-redemptions.presenter';

const NOW = new Date('2026-04-30T12:00:00.000Z');

describe('Reward redemptions presenter', () => {
  it('maps enum values to lowercase and hides internal schoolId', () => {
    const result = presentRewardRedemptionDetail(redemptionRecord());

    expect(result).toMatchObject({
      id: 'redemption-1',
      status: 'requested',
      requestSource: 'dashboard',
      requestedAt: NOW.toISOString(),
      catalogItem: {
        id: 'reward-1',
        type: 'physical',
        status: 'published',
        minTotalXp: 50,
      },
      student: {
        id: 'student-1',
        firstName: 'Mona',
        lastName: 'Salem',
        nameAr: null,
        code: null,
        admissionNo: null,
      },
      enrollment: {
        id: 'enrollment-1',
        classroomId: 'classroom-1',
        sectionId: 'section-1',
        gradeId: 'grade-1',
        stageId: 'stage-1',
      },
      eligibilitySnapshot: {
        minTotalXp: 50,
        totalEarnedXp: 75,
        eligible: true,
      },
    });
    expect(result).not.toHaveProperty('schoolId');
    expect(result).not.toHaveProperty('metadata');
    expect(result.catalogItem).not.toHaveProperty('schoolId');
  });

  it('summarizes list status counts', () => {
    const result = presentRewardRedemptionList({
      items: [redemptionRecord()],
      total: 3,
      statusCounts: {
        REQUESTED: 1,
        APPROVED: 1,
        CANCELLED: 1,
      },
      limit: 20,
      offset: 0,
    });

    expect(result.summary).toEqual({
      total: 3,
      requested: 1,
      approved: 1,
      rejected: 0,
      fulfilled: 0,
      cancelled: 1,
    });
    expect(result.items[0]).not.toHaveProperty('schoolId');
  });

  it('presents review and fulfillment fields without exposing schoolId', () => {
    const result = presentRewardRedemptionDetail(
      redemptionRecord({
        status: RewardRedemptionStatus.FULFILLED,
        reviewedById: 'reviewer-1',
        reviewedAt: NOW,
        reviewNoteEn: 'Approved at desk',
        fulfilledById: 'fulfiller-1',
        fulfilledAt: NOW,
        fulfillmentNoteEn: 'Collected',
        eligibilitySnapshot: {
          minTotalXp: 50,
          totalEarnedXp: 75,
          eligible: true,
          stockAvailable: true,
          isUnlimited: false,
          stockRemaining: 1,
          stockRemainingBeforeApproval: 2,
          stockRemainingAfterApproval: 1,
          catalogItemStatus: 'published',
          approvedAt: NOW.toISOString(),
        },
      }),
    );

    expect(result).toMatchObject({
      status: 'fulfilled',
      reviewedById: 'reviewer-1',
      reviewedAt: NOW.toISOString(),
      reviewNoteEn: 'Approved at desk',
      fulfilledById: 'fulfiller-1',
      fulfilledAt: NOW.toISOString(),
      fulfillmentNoteEn: 'Collected',
      eligibilitySnapshot: {
        stockRemainingBeforeApproval: 2,
        stockRemainingAfterApproval: 1,
      },
    });
    expect(result).not.toHaveProperty('schoolId');
    expect(result.catalogItem).not.toHaveProperty('schoolId');
  });

  function redemptionRecord(overrides?: any) {
    return {
      id: 'redemption-1',
      schoolId: 'school-1',
      catalogItemId: 'reward-1',
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      status: overrides?.status ?? RewardRedemptionStatus.REQUESTED,
      requestSource: RewardRedemptionRequestSource.DASHBOARD,
      requestedById: 'actor-1',
      reviewedById: overrides?.reviewedById ?? null,
      fulfilledById: overrides?.fulfilledById ?? null,
      cancelledById: null,
      requestedAt: NOW,
      reviewedAt: overrides?.reviewedAt ?? null,
      fulfilledAt: overrides?.fulfilledAt ?? null,
      cancelledAt: null,
      requestNoteEn: 'Please approve',
      requestNoteAr: null,
      reviewNoteEn: overrides?.reviewNoteEn ?? null,
      reviewNoteAr: null,
      fulfillmentNoteEn: overrides?.fulfillmentNoteEn ?? null,
      fulfillmentNoteAr: null,
      cancellationReasonEn: null,
      cancellationReasonAr: null,
      eligibilitySnapshot: overrides?.eligibilitySnapshot ?? {
        minTotalXp: 50,
        totalEarnedXp: 75,
        eligible: true,
        stockAvailable: true,
        isUnlimited: false,
        stockRemaining: 2,
        catalogItemStatus: 'published',
      },
      metadata: { internal: true },
      createdAt: NOW,
      updatedAt: NOW,
      catalogItem: {
        id: 'reward-1',
        schoolId: 'school-1',
        academicYearId: 'year-1',
        termId: 'term-1',
        titleEn: 'Reward',
        titleAr: null,
        type: RewardCatalogItemType.PHYSICAL,
        status: RewardCatalogItemStatus.PUBLISHED,
        minTotalXp: 50,
        isUnlimited: false,
        stockQuantity: 5,
        stockRemaining: 2,
        imageFileId: 'file-1',
        deletedAt: null,
      },
      student: {
        id: 'student-1',
        firstName: 'Mona',
        lastName: 'Salem',
        status: StudentStatus.ACTIVE,
        deletedAt: null,
      },
      enrollment: {
        id: 'enrollment-1',
        studentId: 'student-1',
        academicYearId: 'year-1',
        termId: 'term-1',
        classroomId: 'classroom-1',
        status: StudentEnrollmentStatus.ACTIVE,
        enrolledAt: NOW,
        deletedAt: null,
        classroom: {
          id: 'classroom-1',
          sectionId: 'section-1',
          section: {
            id: 'section-1',
            gradeId: 'grade-1',
            grade: {
              id: 'grade-1',
              stageId: 'stage-1',
            },
          },
        },
      },
      academicYear: {
        id: 'year-1',
        nameAr: 'Year AR',
        nameEn: 'Year',
        isActive: true,
      },
      term: {
        id: 'term-1',
        academicYearId: 'year-1',
        nameAr: 'Term AR',
        nameEn: 'Term',
        isActive: true,
      },
    } as never;
  }
});
