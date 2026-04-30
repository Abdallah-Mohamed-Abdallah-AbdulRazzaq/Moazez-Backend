import {
  RewardCatalogItemStatus,
  RewardRedemptionRequestSource,
  RewardRedemptionStatus,
} from '@prisma/client';
import {
  RewardArchivedForRequestException,
  RewardDuplicateRedemptionException,
  RewardInsufficientXpException,
  RewardInvalidStatusTransitionException,
  RewardNotPublishedException,
  RewardOutOfStockException,
  RewardRedemptionInvalidSourceException,
  RewardRedemptionNotApprovedException,
  RewardRedemptionNotRequestedException,
  RewardRedemptionTerminalException,
  assertApprovalStockAvailable,
  assertRedemptionApprovable,
  assertRedemptionCancellable,
  assertRedemptionFulfillable,
  assertRedemptionRejectable,
  assertRewardEligibility,
  assertRewardRequestable,
  assertRewardStockAvailableForRequest,
  assertRewardStillRequestableForApproval,
  buildApprovalEligibilitySnapshot,
  buildEligibilitySnapshot,
  deriveStockAfterApproval,
  isRedemptionOpen,
  isRedemptionTerminal,
  normalizeRewardRedemptionRequestSource,
  normalizeRewardRedemptionStatus,
  summarizeRedemptionStatusCounts,
} from '../domain/reward-redemptions-domain';

describe('Reward redemption domain helpers', () => {
  it('normalizes status and request source from lowercase API values', () => {
    expect(normalizeRewardRedemptionStatus('requested')).toBe(
      RewardRedemptionStatus.REQUESTED,
    );
    expect(normalizeRewardRedemptionRequestSource('student_app')).toBe(
      RewardRedemptionRequestSource.STUDENT_APP,
    );
    expect(normalizeRewardRedemptionRequestSource(undefined)).toBe(
      RewardRedemptionRequestSource.DASHBOARD,
    );
  });

  it('rejects invalid request sources with the redemption source code', () => {
    expect(() => normalizeRewardRedemptionRequestSource('mobile')).toThrow(
      RewardRedemptionInvalidSourceException,
    );
  });

  it('rejects non-published rewards', () => {
    expect(() =>
      assertRewardRequestable({
        id: 'reward-1',
        status: RewardCatalogItemStatus.DRAFT,
        isUnlimited: true,
      }),
    ).toThrow(RewardNotPublishedException);
  });

  it('rejects archived or deleted rewards', () => {
    expect(() =>
      assertRewardRequestable({
        id: 'reward-1',
        status: RewardCatalogItemStatus.ARCHIVED,
        isUnlimited: true,
      }),
    ).toThrow(RewardArchivedForRequestException);

    expect(() =>
      assertRewardRequestable({
        id: 'reward-2',
        status: RewardCatalogItemStatus.PUBLISHED,
        deletedAt: new Date(),
        isUnlimited: true,
      }),
    ).toThrow(RewardArchivedForRequestException);
  });

  it('rejects out-of-stock limited rewards', () => {
    expect(() =>
      assertRewardStockAvailableForRequest({
        id: 'reward-1',
        isUnlimited: false,
        stockRemaining: 0,
      }),
    ).toThrow(RewardOutOfStockException);
  });

  it('allows unlimited rewards without stock remaining', () => {
    expect(() =>
      assertRewardStockAvailableForRequest({
        id: 'reward-1',
        isUnlimited: true,
        stockRemaining: null,
      }),
    ).not.toThrow();
  });

  it('rejects insufficient XP and accepts eligible students', () => {
    expect(() =>
      assertRewardEligibility({
        catalogItemId: 'reward-1',
        studentId: 'student-1',
        minTotalXp: 100,
        totalEarnedXp: 90,
      }),
    ).toThrow(RewardInsufficientXpException);

    expect(() =>
      assertRewardEligibility({
        minTotalXp: 100,
        totalEarnedXp: 100,
      }),
    ).not.toThrow();
  });

  it('builds the request-time eligibility snapshot', () => {
    expect(
      buildEligibilitySnapshot({
        catalogItemStatus: RewardCatalogItemStatus.PUBLISHED,
        minTotalXp: 50,
        totalEarnedXp: 75,
        isUnlimited: false,
        stockRemaining: 2,
      }),
    ).toEqual({
      minTotalXp: 50,
      totalEarnedXp: 75,
      eligible: true,
      stockAvailable: true,
      isUnlimited: false,
      stockRemaining: 2,
      catalogItemStatus: 'published',
    });
  });

  it('classifies open and terminal statuses', () => {
    expect(isRedemptionOpen(RewardRedemptionStatus.REQUESTED)).toBe(true);
    expect(isRedemptionOpen(RewardRedemptionStatus.APPROVED)).toBe(true);
    expect(isRedemptionTerminal(RewardRedemptionStatus.REJECTED)).toBe(true);
    expect(isRedemptionTerminal(RewardRedemptionStatus.FULFILLED)).toBe(true);
    expect(isRedemptionTerminal(RewardRedemptionStatus.CANCELLED)).toBe(true);
  });

  it('rejects cancellation of terminal redemptions', () => {
    for (const status of [
      RewardRedemptionStatus.REJECTED,
      RewardRedemptionStatus.FULFILLED,
      RewardRedemptionStatus.CANCELLED,
    ]) {
      expect(() => assertRedemptionCancellable({ status })).toThrow(
        RewardRedemptionTerminalException,
      );
    }
  });

  it('allows cancellation of requested redemptions only', () => {
    expect(() =>
      assertRedemptionCancellable({
        status: RewardRedemptionStatus.REQUESTED,
      }),
    ).not.toThrow();
    expect(() =>
      assertRedemptionCancellable({
        status: RewardRedemptionStatus.APPROVED,
      }),
    ).toThrow(RewardRedemptionNotRequestedException);
  });

  it('approves only requested redemptions and rejects terminal statuses', () => {
    expect(() =>
      assertRedemptionApprovable({
        status: RewardRedemptionStatus.REQUESTED,
      }),
    ).not.toThrow();
    expect(() =>
      assertRedemptionApprovable({
        status: RewardRedemptionStatus.APPROVED,
      }),
    ).toThrow(RewardInvalidStatusTransitionException);

    for (const status of [
      RewardRedemptionStatus.REJECTED,
      RewardRedemptionStatus.FULFILLED,
      RewardRedemptionStatus.CANCELLED,
    ]) {
      expect(() => assertRedemptionApprovable({ status })).toThrow(
        RewardRedemptionTerminalException,
      );
    }
  });

  it('rejects only requested redemptions', () => {
    expect(() =>
      assertRedemptionRejectable({
        status: RewardRedemptionStatus.REQUESTED,
      }),
    ).not.toThrow();
    expect(() =>
      assertRedemptionRejectable({
        status: RewardRedemptionStatus.APPROVED,
      }),
    ).toThrow(RewardInvalidStatusTransitionException);
  });

  it('fulfills only approved redemptions', () => {
    expect(() =>
      assertRedemptionFulfillable({
        status: RewardRedemptionStatus.APPROVED,
      }),
    ).not.toThrow();
    expect(() =>
      assertRedemptionFulfillable({
        status: RewardRedemptionStatus.REQUESTED,
      }),
    ).toThrow(RewardRedemptionNotApprovedException);

    for (const status of [
      RewardRedemptionStatus.REJECTED,
      RewardRedemptionStatus.FULFILLED,
      RewardRedemptionStatus.CANCELLED,
    ]) {
      expect(() => assertRedemptionFulfillable({ status })).toThrow(
        RewardRedemptionTerminalException,
      );
    }
  });

  it('rechecks catalog availability for approval', () => {
    expect(() =>
      assertRewardStillRequestableForApproval({
        id: 'reward-1',
        status: RewardCatalogItemStatus.PUBLISHED,
        isUnlimited: false,
        stockRemaining: 1,
      }),
    ).not.toThrow();
    expect(() =>
      assertApprovalStockAvailable({
        id: 'reward-1',
        isUnlimited: false,
        stockRemaining: 0,
      }),
    ).toThrow(RewardOutOfStockException);
  });

  it('derives and records the approval eligibility snapshot', () => {
    const approvedAt = new Date('2026-04-30T12:30:00.000Z');

    expect(
      deriveStockAfterApproval({
        isUnlimited: false,
        stockRemaining: 2,
      }),
    ).toBe(1);
    expect(
      deriveStockAfterApproval({
        isUnlimited: true,
        stockRemaining: null,
      }),
    ).toBeNull();
    expect(
      buildApprovalEligibilitySnapshot({
        previousSnapshot: { requestedAt: 'before' },
        catalogItemStatus: RewardCatalogItemStatus.PUBLISHED,
        minTotalXp: 50,
        totalEarnedXp: 75,
        isUnlimited: false,
        stockRemainingBeforeApproval: 2,
        stockRemainingAfterApproval: 1,
        approvedAt,
      }),
    ).toEqual({
      requestedAt: 'before',
      minTotalXp: 50,
      totalEarnedXp: 75,
      eligible: true,
      stockAvailable: true,
      isUnlimited: false,
      stockRemaining: 1,
      stockRemainingBeforeApproval: 2,
      stockRemainingAfterApproval: 1,
      catalogItemStatus: 'published',
      approvedAt: approvedAt.toISOString(),
    });
  });

  it('summarizes status counts', () => {
    expect(
      summarizeRedemptionStatusCounts({
        REQUESTED: 2,
        APPROVED: 1,
        CANCELLED: 3,
      }),
    ).toEqual({
      requested: 2,
      approved: 1,
      rejected: 0,
      fulfilled: 0,
      cancelled: 3,
    });
  });

  it('exposes the duplicate redemption exception for use-case translation', () => {
    expect(() => {
      throw new RewardDuplicateRedemptionException();
    }).toThrow(RewardDuplicateRedemptionException);
  });
});
