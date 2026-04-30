import {
  RewardCatalogItemStatus,
  RewardCatalogItemType,
} from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import {
  RewardCatalogArchivedException,
  RewardCatalogInvalidStatusTransitionException,
  assertRewardCatalogArchivable,
  assertRewardCatalogEditable,
  assertRewardCatalogPublishable,
  assertRewardMinXpValid,
  assertRewardStockValid,
  assertRewardTitlePresent,
  isRewardCatalogAvailable,
  normalizeRewardCatalogStatus,
  normalizeRewardCatalogType,
} from '../domain/reward-catalog-domain';

describe('Reward catalog domain helpers', () => {
  it('normalizes reward status and type from lowercase API values', () => {
    expect(normalizeRewardCatalogStatus('published')).toBe(
      RewardCatalogItemStatus.PUBLISHED,
    );
    expect(normalizeRewardCatalogType('physical')).toBe(
      RewardCatalogItemType.PHYSICAL,
    );
    expect(normalizeRewardCatalogType(undefined)).toBe(
      RewardCatalogItemType.OTHER,
    );
  });

  it('requires an English or Arabic title', () => {
    expect(() =>
      assertRewardTitlePresent({ titleEn: null, titleAr: '  ' }),
    ).toThrow(ValidationDomainException);
    expect(() =>
      assertRewardTitlePresent({ titleEn: 'Certificate', titleAr: null }),
    ).not.toThrow();
  });

  it('allows unlimited rewards without stock fields', () => {
    expect(() =>
      assertRewardStockValid({
        isUnlimited: true,
        stockQuantity: null,
        stockRemaining: null,
      }),
    ).not.toThrow();
  });

  it('rejects limited rewards without stock fields', () => {
    expect(() =>
      assertRewardStockValid({ isUnlimited: false, stockQuantity: 5 }),
    ).toThrow(ValidationDomainException);
  });

  it('rejects stockRemaining greater than stockQuantity', () => {
    expect(() =>
      assertRewardStockValid({
        isUnlimited: false,
        stockQuantity: 2,
        stockRemaining: 3,
      }),
    ).toThrow(ValidationDomainException);
  });

  it('rejects negative minTotalXp values', () => {
    expect(assertRewardMinXpValid(0)).toBe(0);
    expect(() => assertRewardMinXpValid(-1)).toThrow(
      ValidationDomainException,
    );
  });

  it('allows draft items to be fully updated', () => {
    expect(() =>
      assertRewardCatalogEditable({
        item: { id: 'reward-1', status: RewardCatalogItemStatus.DRAFT },
        protectedChangedFields: ['academicYearId', 'termId', 'type'],
      }),
    ).not.toThrow();
  });

  it('rejects protected scope or type changes on published items', () => {
    expect(() =>
      assertRewardCatalogEditable({
        item: { id: 'reward-1', status: RewardCatalogItemStatus.PUBLISHED },
        protectedChangedFields: ['type'],
      }),
    ).toThrow(RewardCatalogInvalidStatusTransitionException);
  });

  it('rejects updates to archived items', () => {
    expect(() =>
      assertRewardCatalogEditable({
        item: { id: 'reward-1', status: RewardCatalogItemStatus.ARCHIVED },
      }),
    ).toThrow(RewardCatalogArchivedException);
  });

  it('requires draft status before publish', () => {
    expect(() =>
      assertRewardCatalogPublishable({
        id: 'reward-1',
        status: RewardCatalogItemStatus.PUBLISHED,
        titleEn: 'Published',
        isUnlimited: true,
      }),
    ).toThrow(RewardCatalogInvalidStatusTransitionException);
  });

  it('rejects already archived items during archive', () => {
    expect(() =>
      assertRewardCatalogArchivable({
        id: 'reward-1',
        status: RewardCatalogItemStatus.ARCHIVED,
      }),
    ).toThrow(RewardCatalogArchivedException);
  });

  it('summarizes availability from publish status and stock', () => {
    expect(
      isRewardCatalogAvailable({
        status: RewardCatalogItemStatus.PUBLISHED,
        isUnlimited: true,
      }),
    ).toBe(true);
    expect(
      isRewardCatalogAvailable({
        status: RewardCatalogItemStatus.PUBLISHED,
        isUnlimited: false,
        stockRemaining: 0,
      }),
    ).toBe(false);
  });
});
