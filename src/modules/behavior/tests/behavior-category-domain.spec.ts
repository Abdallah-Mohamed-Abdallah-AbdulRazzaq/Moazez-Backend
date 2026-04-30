import { BehaviorRecordType, BehaviorSeverity } from '@prisma/client';
import { ValidationDomainException } from '../../../common/exceptions/domain-exception';
import {
  BehaviorCategoryInUseException,
  BehaviorRecordPointsInvalidException,
  assertBehaviorCategoryCanChangeIdentity,
  assertBehaviorCategoryCanDelete,
  assertBehaviorCategoryNamePresent,
  assertBehaviorCategoryPointsCompatible,
  normalizeBehaviorCategoryCode,
  normalizeBehaviorRecordType,
  normalizeBehaviorSeverity,
} from '../domain/behavior-category-domain';

describe('Behavior category domain helpers', () => {
  it('requires an English or Arabic category name', () => {
    expect(() =>
      assertBehaviorCategoryNamePresent({ nameEn: null, nameAr: '  ' }),
    ).toThrow(ValidationDomainException);

    expect(() =>
      assertBehaviorCategoryNamePresent({ nameEn: 'Helpful', nameAr: null }),
    ).not.toThrow();
  });

  it('normalizes category codes deterministically', () => {
    expect(normalizeBehaviorCategoryCode(' late arrival ')).toBe(
      'LATE_ARRIVAL',
    );
    expect(normalizeBehaviorCategoryCode('late-arrival')).toBe('LATE_ARRIVAL');
    expect(normalizeBehaviorCategoryCode('Late__Arrival')).toBe('LATE_ARRIVAL');
  });

  it('rejects negative points for positive categories', () => {
    expect(() =>
      assertBehaviorCategoryPointsCompatible({
        type: BehaviorRecordType.POSITIVE,
        defaultPoints: -1,
      }),
    ).toThrow(BehaviorRecordPointsInvalidException);
  });

  it('rejects positive points for negative categories', () => {
    expect(() =>
      assertBehaviorCategoryPointsCompatible({
        type: BehaviorRecordType.NEGATIVE,
        defaultPoints: 1,
      }),
    ).toThrow(BehaviorRecordPointsInvalidException);
  });

  it('allows zero points for positive and negative categories', () => {
    expect(() =>
      assertBehaviorCategoryPointsCompatible({
        type: BehaviorRecordType.POSITIVE,
        defaultPoints: 0,
      }),
    ).not.toThrow();
    expect(() =>
      assertBehaviorCategoryPointsCompatible({
        type: BehaviorRecordType.NEGATIVE,
        defaultPoints: 0,
      }),
    ).not.toThrow();
  });

  it('normalizes lowercase type and severity values to Prisma enums', () => {
    expect(normalizeBehaviorRecordType('positive')).toBe(
      BehaviorRecordType.POSITIVE,
    );
    expect(normalizeBehaviorRecordType('negative')).toBe(
      BehaviorRecordType.NEGATIVE,
    );
    expect(normalizeBehaviorSeverity('critical')).toBe(
      BehaviorSeverity.CRITICAL,
    );
    expect(normalizeBehaviorSeverity(undefined)).toBe(BehaviorSeverity.LOW);
  });

  it('rejects identity changes for in-use categories', () => {
    expect(() =>
      assertBehaviorCategoryCanChangeIdentity({
        categoryId: 'category-1',
        usage: { recordsCount: 1, pointLedgerEntriesCount: 0 },
        changedFields: ['code'],
      }),
    ).toThrow(BehaviorCategoryInUseException);

    expect(() =>
      assertBehaviorCategoryCanChangeIdentity({
        categoryId: 'category-1',
        usage: { recordsCount: 0, pointLedgerEntriesCount: 1 },
        changedFields: ['type'],
      }),
    ).toThrow(BehaviorCategoryInUseException);
  });

  it('rejects deletion for in-use categories', () => {
    expect(() =>
      assertBehaviorCategoryCanDelete({
        categoryId: 'category-1',
        usage: { recordsCount: 0, pointLedgerEntriesCount: 1 },
      }),
    ).toThrow(BehaviorCategoryInUseException);
  });
});
