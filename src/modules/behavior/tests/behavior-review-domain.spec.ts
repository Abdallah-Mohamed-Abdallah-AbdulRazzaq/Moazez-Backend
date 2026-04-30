import {
  BehaviorPointLedgerEntryType,
  BehaviorRecordStatus,
  BehaviorRecordType,
} from '@prisma/client';
import {
  assertBehaviorApprovalPointsValid,
  assertBehaviorRecordApprovable,
  assertBehaviorRecordRejectable,
  BehaviorRecordNotSubmittedException,
  buildBehaviorLedgerReason,
  deriveBehaviorEffectivePoints,
  deriveBehaviorLedgerEntryType,
  isBehaviorReviewedStatus,
  summarizeBehaviorReviewQueue,
} from '../domain/behavior-review-domain';
import {
  BehaviorRecordAlreadyReviewedException,
  BehaviorRecordCancelledException,
  BehaviorRecordPointsInvalidException,
} from '../domain/behavior-records-domain';

describe('Behavior review domain helpers', () => {
  it('allows only SUBMITTED records to be approved or rejected', () => {
    expect(() =>
      assertBehaviorRecordApprovable({
        id: 'record-1',
        status: BehaviorRecordStatus.SUBMITTED,
      }),
    ).not.toThrow();
    expect(() =>
      assertBehaviorRecordRejectable({
        id: 'record-1',
        status: BehaviorRecordStatus.SUBMITTED,
      }),
    ).not.toThrow();
  });

  it('rejects DRAFT as not_submitted for approve and reject', () => {
    expect(() =>
      assertBehaviorRecordApprovable({
        id: 'record-1',
        status: BehaviorRecordStatus.DRAFT,
      }),
    ).toThrow(BehaviorRecordNotSubmittedException);
    expect(() =>
      assertBehaviorRecordRejectable({
        id: 'record-1',
        status: BehaviorRecordStatus.DRAFT,
      }),
    ).toThrow(BehaviorRecordNotSubmittedException);
  });

  it('rejects APPROVED and REJECTED as already_reviewed', () => {
    for (const status of [
      BehaviorRecordStatus.APPROVED,
      BehaviorRecordStatus.REJECTED,
    ]) {
      expect(() =>
        assertBehaviorRecordApprovable({ id: 'record-1', status }),
      ).toThrow(BehaviorRecordAlreadyReviewedException);
      expect(() =>
        assertBehaviorRecordRejectable({ id: 'record-1', status }),
      ).toThrow(BehaviorRecordAlreadyReviewedException);
    }
  });

  it('rejects CANCELLED as cancelled', () => {
    expect(() =>
      assertBehaviorRecordApprovable({
        id: 'record-1',
        status: BehaviorRecordStatus.CANCELLED,
      }),
    ).toThrow(BehaviorRecordCancelledException);
    expect(() =>
      assertBehaviorRecordRejectable({
        id: 'record-1',
        status: BehaviorRecordStatus.CANCELLED,
      }),
    ).toThrow(BehaviorRecordCancelledException);
  });

  it('validates approval points by behavior type and allows zero', () => {
    expect(() =>
      assertBehaviorApprovalPointsValid({
        type: BehaviorRecordType.POSITIVE,
        effectivePoints: -1,
      }),
    ).toThrow(BehaviorRecordPointsInvalidException);

    expect(() =>
      assertBehaviorApprovalPointsValid({
        type: BehaviorRecordType.NEGATIVE,
        effectivePoints: 1,
      }),
    ).toThrow(BehaviorRecordPointsInvalidException);

    expect(() =>
      assertBehaviorApprovalPointsValid({
        type: BehaviorRecordType.POSITIVE,
        effectivePoints: 0,
      }),
    ).not.toThrow();
    expect(() =>
      assertBehaviorApprovalPointsValid({
        type: BehaviorRecordType.NEGATIVE,
        effectivePoints: 0,
      }),
    ).not.toThrow();
  });

  it('uses pointsOverride when provided', () => {
    expect(
      deriveBehaviorEffectivePoints({
        recordPoints: 5,
        pointsOverride: 0,
      }),
    ).toBe(0);
    expect(
      deriveBehaviorEffectivePoints({
        recordPoints: 5,
      }),
    ).toBe(5);
  });

  it('maps positive records to AWARD and negative records to PENALTY', () => {
    expect(deriveBehaviorLedgerEntryType(BehaviorRecordType.POSITIVE)).toBe(
      BehaviorPointLedgerEntryType.AWARD,
    );
    expect(deriveBehaviorLedgerEntryType(BehaviorRecordType.NEGATIVE)).toBe(
      BehaviorPointLedgerEntryType.PENALTY,
    );
  });

  it('builds compact ledger reasons from review notes or record content', () => {
    expect(
      buildBehaviorLedgerReason({
        type: BehaviorRecordType.POSITIVE,
        titleEn: 'Leadership',
      }),
    ).toEqual({
      reasonEn: 'Approved behavior record: Leadership',
      reasonAr: null,
    });

    expect(
      buildBehaviorLedgerReason({
        type: BehaviorRecordType.NEGATIVE,
        reviewNoteEn: 'Reviewed by counselor',
        reviewNoteAr: 'Arabic note',
      }),
    ).toEqual({
      reasonEn: 'Reviewed by counselor',
      reasonAr: 'Arabic note',
    });
  });

  it('summarizes review queue records and detects reviewed statuses', () => {
    expect(
      summarizeBehaviorReviewQueue([
        {
          type: BehaviorRecordType.POSITIVE,
          status: BehaviorRecordStatus.SUBMITTED,
        },
        {
          type: BehaviorRecordType.POSITIVE,
          status: BehaviorRecordStatus.APPROVED,
        },
        {
          type: BehaviorRecordType.NEGATIVE,
          status: BehaviorRecordStatus.REJECTED,
        },
      ]),
    ).toEqual({
      total: 3,
      submitted: 1,
      approved: 1,
      rejected: 1,
      cancelled: 0,
      positive: 2,
      negative: 1,
    });

    expect(isBehaviorReviewedStatus(BehaviorRecordStatus.APPROVED)).toBe(true);
    expect(isBehaviorReviewedStatus(BehaviorRecordStatus.SUBMITTED)).toBe(
      false,
    );
  });
});
