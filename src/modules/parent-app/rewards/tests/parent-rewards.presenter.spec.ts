import {
  FileVisibility,
  RewardCatalogItemStatus,
  RewardCatalogItemType,
  RewardRedemptionRequestSource,
  RewardRedemptionStatus,
} from '@prisma/client';
import type { ParentAppAccessibleChild } from '../../shared/parent-app.types';
import type {
  ParentRewardCatalogReadModel,
  ParentRewardRedemptionReadModel,
} from '../infrastructure/parent-rewards-read.adapter';
import { ParentRewardsPresenter } from '../presenters/parent-rewards.presenter';

describe('ParentRewardsPresenter', () => {
  it('presents child reward catalog with XpLedger-backed affordability fields', () => {
    const result = ParentRewardsPresenter.presentRewardsList({
      child: childFixture(),
      rewards: [
        rewardFixture({ id: 'reward-ready', minTotalXp: 10 }),
        rewardFixture({ id: 'reward-locked', minTotalXp: 99 }),
      ],
      total: 2,
      page: 1,
      limit: 50,
      totalEarnedXp: 25,
    });
    const serialized = JSON.stringify(result);

    expect(result.child).toEqual({
      studentId: 'student-1',
      student_id: 'student-1',
    });
    expect(result.xp).toEqual({ totalEarnedXp: 25 });
    expect(result.rewards).toEqual([
      expect.objectContaining({
        rewardId: 'reward-ready',
        requiredXp: 10,
        isRedeemable: true,
        insufficientXp: false,
        availabilityStatus: 'available',
        image: expect.objectContaining({
          id: 'file-1',
          downloadPath: '/api/v1/files/file-1/download',
        }),
      }),
      expect.objectContaining({
        rewardId: 'reward-locked',
        requiredXp: 99,
        isRedeemable: false,
        insufficientXp: true,
        availabilityStatus: 'insufficient_xp',
      }),
    ]);
    expectSafeParentRewardsPayload(serialized);
  });

  it('presents child-scoped redemptions without actor, audit, or ledger internals', () => {
    const result = ParentRewardsPresenter.presentRedemptions({
      child: childFixture(),
      redemptions: [
        redemptionFixture({
          id: 'redemption-1',
          status: RewardRedemptionStatus.REQUESTED,
        }),
        redemptionFixture({
          id: 'redemption-2',
          status: RewardRedemptionStatus.APPROVED,
        }),
      ],
      statusCounts: {
        [RewardRedemptionStatus.REQUESTED]: 1,
        [RewardRedemptionStatus.APPROVED]: 1,
      },
      totalEarnedXp: 25,
    });
    const serialized = JSON.stringify(result);

    expect(result.summary).toEqual({
      total: 2,
      requested: 1,
      approved: 1,
      rejected: 0,
      fulfilled: 0,
      cancelled: 0,
    });
    expect(result.redemptions).toEqual([
      expect.objectContaining({
        redemptionId: 'redemption-1',
        status: 'requested',
        requestSource: 'student_app',
        nextAction: 'await_review',
      }),
      expect.objectContaining({
        redemptionId: 'redemption-2',
        status: 'approved',
        nextAction: 'await_fulfillment',
      }),
    ]);
    expectSafeParentRewardsPayload(serialized);
  });
});

function childFixture(): ParentAppAccessibleChild {
  return {
    studentId: 'student-1',
    enrollmentId: 'enrollment-1',
    classroomId: 'classroom-1',
    academicYearId: 'year-1',
    termId: 'term-1',
  };
}

function rewardFixture(
  overrides: Partial<ParentRewardCatalogReadModel> = {},
): ParentRewardCatalogReadModel {
  return {
    id: 'reward-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    titleEn: 'Reward',
    titleAr: null,
    descriptionEn: 'Visible reward',
    descriptionAr: null,
    type: RewardCatalogItemType.PRIVILEGE,
    status: RewardCatalogItemStatus.PUBLISHED,
    minTotalXp: 10,
    stockRemaining: null,
    isUnlimited: true,
    imageFileId: 'file-1',
    publishedAt: new Date('2026-01-01T08:00:00.000Z'),
    imageFile: {
      id: 'file-1',
      originalName: 'reward.png',
      mimeType: 'image/png',
      sizeBytes: 2048,
      visibility: FileVisibility.PRIVATE,
      createdAt: new Date('2026-01-01T07:00:00.000Z'),
      bucket: 'hidden-bucket',
      objectKey: 'hidden-object-key',
      metadata: { signedUrl: 'https://storage.invalid/file' },
    },
    schoolId: 'hidden-school',
    organizationId: 'hidden-org',
    createdById: 'hidden-creator',
    updatedById: 'hidden-updater',
    metadata: { wallet: true, payment: true },
    ...overrides,
  } as unknown as ParentRewardCatalogReadModel;
}

function redemptionFixture(
  overrides: Partial<ParentRewardRedemptionReadModel> = {},
): ParentRewardRedemptionReadModel {
  return {
    id: 'redemption-1',
    catalogItemId: 'reward-1',
    status: RewardRedemptionStatus.REQUESTED,
    requestSource: RewardRedemptionRequestSource.STUDENT_APP,
    requestedAt: new Date('2026-01-02T08:00:00.000Z'),
    reviewedAt: null,
    fulfilledAt: null,
    cancelledAt: null,
    requestNoteEn: 'Student note',
    requestNoteAr: null,
    catalogItem: rewardFixture(),
    studentId: 'hidden-student',
    enrollmentId: 'hidden-enrollment',
    requestedById: 'hidden-requester',
    approvedById: 'hidden-approver',
    fulfilledById: 'hidden-fulfiller',
    xpLedgerId: 'hidden-xp-ledger',
    eligibilitySnapshot: { totalEarnedXp: 25 },
    metadata: { BehaviorPointLedger: 'not-xp' },
    ...overrides,
  } as unknown as ParentRewardRedemptionReadModel;
}

function expectSafeParentRewardsPayload(serialized: string): void {
  for (const forbidden of [
    'schoolId',
    'organizationId',
    'membershipId',
    'roleId',
    'deletedAt',
    'enrollmentId',
    'guardianId',
    'parentId',
    'studentGuardianId',
    'createdById',
    'updatedById',
    'requestedById',
    'approvedById',
    'rejectedById',
    'fulfilledById',
    'cancelledById',
    'xpLedgerId',
    'ledgerEntryId',
    'eligibilitySnapshot',
    'metadata',
    'objectKey',
    'bucket',
    'signedUrl',
    'storage.invalid',
    'wallet',
    'finance',
    'payment',
    'marketplace',
    'BehaviorPointLedger',
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}
