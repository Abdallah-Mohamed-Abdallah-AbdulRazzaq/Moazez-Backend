import {
  BehaviorRecordStatus,
  BehaviorRecordType,
  BehaviorSeverity,
} from '@prisma/client';
import { ValidationDomainException } from '../../../common/exceptions/domain-exception';
import {
  assertBehaviorOccurredAtInsideTerm,
  assertBehaviorRecordCanCancel,
  assertBehaviorRecordCanSubmit,
  assertBehaviorRecordCanUpdate,
  assertBehaviorRecordCategoryActive,
  assertBehaviorRecordCategoryCompatible,
  assertBehaviorRecordContentPresent,
  assertBehaviorRecordPointsCompatible,
  BehaviorCategoryInactiveException,
  BehaviorRecordAlreadyReviewedException,
  BehaviorRecordAlreadySubmittedException,
  BehaviorRecordCancelledException,
  BehaviorRecordOutsideTermException,
  BehaviorRecordPointsInvalidException,
  BehaviorRecordTypeMismatchException,
  deriveBehaviorRecordDefaultsFromCategory,
  normalizeBehaviorRecordStatus,
  normalizeBehaviorRecordType,
  normalizeBehaviorSeverity,
} from '../domain/behavior-records-domain';

describe('Behavior record domain helpers', () => {
  it('requires at least one title or note field', () => {
    expect(() =>
      assertBehaviorRecordContentPresent({
        titleEn: '',
        titleAr: ' ',
        noteEn: null,
        noteAr: undefined,
      }),
    ).toThrow(ValidationDomainException);

    expect(() =>
      assertBehaviorRecordContentPresent({ noteEn: 'Helped a classmate' }),
    ).not.toThrow();
  });

  it('validates points compatibility and allows zero for both types', () => {
    expect(() =>
      assertBehaviorRecordPointsCompatible({
        type: BehaviorRecordType.POSITIVE,
        points: -1,
      }),
    ).toThrow(BehaviorRecordPointsInvalidException);

    expect(() =>
      assertBehaviorRecordPointsCompatible({
        type: BehaviorRecordType.NEGATIVE,
        points: 1,
      }),
    ).toThrow(BehaviorRecordPointsInvalidException);

    expect(() =>
      assertBehaviorRecordPointsCompatible({
        type: BehaviorRecordType.POSITIVE,
        points: 0,
      }),
    ).not.toThrow();
    expect(() =>
      assertBehaviorRecordPointsCompatible({
        type: BehaviorRecordType.NEGATIVE,
        points: 0,
      }),
    ).not.toThrow();
  });

  it('rejects category type mismatches and inactive categories', () => {
    expect(() =>
      assertBehaviorRecordCategoryCompatible({
        categoryId: 'category-1',
        categoryType: BehaviorRecordType.POSITIVE,
        recordType: BehaviorRecordType.NEGATIVE,
      }),
    ).toThrow(BehaviorRecordTypeMismatchException);

    expect(() =>
      assertBehaviorRecordCategoryActive({
        category: { id: 'category-1', isActive: false },
      }),
    ).toThrow(BehaviorCategoryInactiveException);
  });

  it('rejects occurredAt outside the selected term range', () => {
    expect(() =>
      assertBehaviorOccurredAtInsideTerm({
        occurredAt: new Date('2026-03-31T23:59:59.000Z'),
        term: {
          id: 'term-1',
          startDate: new Date('2026-04-01T00:00:00.000Z'),
          endDate: new Date('2026-04-30T00:00:00.000Z'),
        },
      }),
    ).toThrow(BehaviorRecordOutsideTermException);

    expect(() =>
      assertBehaviorOccurredAtInsideTerm({
        occurredAt: new Date('2026-04-30T18:30:00.000Z'),
        term: {
          id: 'term-1',
          startDate: new Date('2026-04-01T00:00:00.000Z'),
          endDate: new Date('2026-04-30T00:00:00.000Z'),
        },
      }),
    ).not.toThrow();
  });

  it('derives type, severity, and points from category defaults', () => {
    const defaults = deriveBehaviorRecordDefaultsFromCategory({
      category: {
        id: 'category-1',
        type: BehaviorRecordType.POSITIVE,
        defaultSeverity: BehaviorSeverity.HIGH,
        defaultPoints: 10,
        isActive: true,
      },
    });

    expect(defaults).toEqual({
      type: BehaviorRecordType.POSITIVE,
      severity: BehaviorSeverity.HIGH,
      points: 10,
    });
  });

  it('requires a type when category is omitted', () => {
    expect(() => deriveBehaviorRecordDefaultsFromCategory({})).toThrow(
      ValidationDomainException,
    );
  });

  it('normalizes lowercase enum values to Prisma enums', () => {
    expect(normalizeBehaviorRecordType('positive')).toBe(
      BehaviorRecordType.POSITIVE,
    );
    expect(normalizeBehaviorSeverity('critical')).toBe(
      BehaviorSeverity.CRITICAL,
    );
    expect(normalizeBehaviorRecordStatus('submitted')).toBe(
      BehaviorRecordStatus.SUBMITTED,
    );
  });

  it('enforces update, submit, and cancel lifecycle transitions', () => {
    expect(() =>
      assertBehaviorRecordCanUpdate(BehaviorRecordStatus.DRAFT),
    ).not.toThrow();
    expect(() =>
      assertBehaviorRecordCanUpdate(BehaviorRecordStatus.SUBMITTED),
    ).toThrow();
    expect(() =>
      assertBehaviorRecordCanUpdate(BehaviorRecordStatus.CANCELLED),
    ).toThrow(BehaviorRecordCancelledException);

    expect(() =>
      assertBehaviorRecordCanSubmit(BehaviorRecordStatus.DRAFT),
    ).not.toThrow();
    expect(() =>
      assertBehaviorRecordCanSubmit(BehaviorRecordStatus.SUBMITTED),
    ).toThrow(BehaviorRecordAlreadySubmittedException);
    expect(() =>
      assertBehaviorRecordCanSubmit(BehaviorRecordStatus.APPROVED),
    ).toThrow(BehaviorRecordAlreadyReviewedException);

    expect(() =>
      assertBehaviorRecordCanCancel(BehaviorRecordStatus.DRAFT),
    ).not.toThrow();
    expect(() =>
      assertBehaviorRecordCanCancel(BehaviorRecordStatus.SUBMITTED),
    ).not.toThrow();
    expect(() =>
      assertBehaviorRecordCanCancel(BehaviorRecordStatus.CANCELLED),
    ).toThrow(BehaviorRecordCancelledException);
  });
});
