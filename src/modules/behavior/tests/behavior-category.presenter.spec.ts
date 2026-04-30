import { BehaviorRecordType, BehaviorSeverity } from '@prisma/client';
import {
  presentBehaviorCategory,
  presentBehaviorCategoryList,
} from '../presenters/behavior-category.presenter';

const NOW = new Date('2026-04-30T12:00:00.000Z');

describe('Behavior category presenter', () => {
  it('maps enum values to lowercase and hides internal schoolId', () => {
    const result = presentBehaviorCategory(categoryRecord());

    expect(result).toMatchObject({
      id: 'category-1',
      code: 'LATE_ARRIVAL',
      type: 'negative',
      defaultSeverity: 'medium',
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
    expect(result).not.toHaveProperty('schoolId');
    expect(result).not.toHaveProperty('metadata');
    expect(result).not.toHaveProperty('deletedAt');
  });

  it('includes deletedAt only when requested by includeDeleted list/detail callers', () => {
    const deletedAt = new Date('2026-04-30T13:00:00.000Z');
    const result = presentBehaviorCategory(categoryRecord({ deletedAt }), {
      includeDeleted: true,
    });

    expect(result).toHaveProperty('deletedAt', deletedAt.toISOString());
  });

  it('presents category lists with deterministic pagination metadata', () => {
    const result = presentBehaviorCategoryList({
      items: [categoryRecord()],
      total: 1,
      limit: 25,
      offset: 0,
    });

    expect(result).toMatchObject({
      total: 1,
      limit: 25,
      offset: 0,
      items: [{ id: 'category-1', type: 'negative' }],
    });
  });

  function categoryRecord(overrides?: Record<string, unknown>) {
    return {
      id: 'category-1',
      schoolId: 'school-1',
      code: 'LATE_ARRIVAL',
      nameEn: 'Late arrival',
      nameAr: null,
      descriptionEn: null,
      descriptionAr: null,
      type: BehaviorRecordType.NEGATIVE,
      defaultSeverity: BehaviorSeverity.MEDIUM,
      defaultPoints: -2,
      isActive: true,
      sortOrder: 10,
      createdById: 'creator-1',
      metadata: { internal: true },
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
      ...overrides,
    } as never;
  }
});
