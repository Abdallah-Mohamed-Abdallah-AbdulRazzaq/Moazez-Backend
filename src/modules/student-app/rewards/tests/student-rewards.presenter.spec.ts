import {
  FileVisibility,
  RewardCatalogItemStatus,
  RewardCatalogItemType,
  RewardRedemptionRequestSource,
  RewardRedemptionStatus,
} from '@prisma/client';
import { StudentRewardsPresenter } from '../presenters/student-rewards.presenter';
import type {
  StudentRewardCatalogReadModel,
  StudentRewardRedemptionReadModel,
} from '../infrastructure/student-rewards-read.adapter';

describe('StudentRewardsPresenter', () => {
  it('presents app-safe catalog rewards with XpLedger-backed affordability fields', () => {
    const result = StudentRewardsPresenter.presentRewardsList({
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
    expectSafeStudentRewardsPayload(serialized);
  });

  it('presents current-student redemption summaries without internal actor or ledger fields', () => {
    const result = StudentRewardsPresenter.presentRedemptions({
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
    expectSafeStudentRewardsPayload(serialized);
  });
});

function rewardFixture(
  overrides: Partial<StudentRewardCatalogReadModel> = {},
): StudentRewardCatalogReadModel {
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
  } as unknown as StudentRewardCatalogReadModel;
}

function redemptionFixture(
  overrides: Partial<StudentRewardRedemptionReadModel> = {},
): StudentRewardRedemptionReadModel {
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
    approvedById: 'hidden-approver',
    fulfilledById: 'hidden-fulfiller',
    xpLedgerId: 'hidden-xp-ledger',
    eligibilitySnapshot: { totalEarnedXp: 25 },
    metadata: { BehaviorPointLedger: 'not-xp' },
    ...overrides,
  } as unknown as StudentRewardRedemptionReadModel;
}

function expectSafeStudentRewardsPayload(serialized: string): void {
  for (const forbidden of [
    'schoolId',
    'organizationId',
    'membershipId',
    'roleId',
    'deletedAt',
    'studentId',
    'enrollmentId',
    'createdById',
    'updatedById',
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
    'BehaviorPointLedger',
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}
