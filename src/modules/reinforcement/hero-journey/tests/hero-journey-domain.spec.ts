import {
  HeroMissionObjectiveType,
  HeroMissionStatus,
} from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import {
  HeroMissionArchivedException,
  HeroMissionInvalidStatusTransitionException,
  HeroMissionPointsInvalidException,
  HeroObjectiveInvalidOrderException,
  assertBadgeNamePresent,
  assertMissionDeletable,
  assertMissionPublishable,
  assertMissionTitlePresent,
  assertRewardXpValid,
  normalizeBadgeSlug,
  normalizeMissionObjectives,
  normalizeObjectiveType,
} from '../domain/hero-journey-domain';

describe('Hero Journey domain helpers', () => {
  it('normalizes and validates badge slugs', () => {
    expect(normalizeBadgeSlug(' Speed-Runner ')).toBe('speed-runner');
    expect(() => normalizeBadgeSlug('bad slug!')).toThrow(
      ValidationDomainException,
    );
  });

  it('rejects badge creation without a bilingual name', () => {
    expect(() => assertBadgeNamePresent({ nameEn: '', nameAr: null })).toThrow(
      ValidationDomainException,
    );
  });

  it('normalizes objective type and sort ordering', () => {
    expect(normalizeObjectiveType('quiz')).toBe(HeroMissionObjectiveType.QUIZ);

    const objectives = normalizeMissionObjectives({
      objectives: [
        { type: 'manual', titleEn: 'Second', sortOrder: 20 },
        { type: 'assessment', titleEn: 'First', sortOrder: 10 },
        { type: 'lesson', titleEn: 'Third' },
      ],
    });

    expect(objectives.map((objective) => objective.titleEn)).toEqual([
      'First',
      'Second',
      'Third',
    ]);
    expect(objectives.map((objective) => objective.sortOrder)).toEqual([
      1, 2, 3,
    ]);
  });

  it('rejects empty required objective sets and duplicate sort orders', () => {
    expect(() =>
      normalizeMissionObjectives({ objectives: [], requireNonEmpty: true }),
    ).toThrow(ValidationDomainException);

    expect(() =>
      normalizeMissionObjectives({
        objectives: [
          { titleEn: 'One', sortOrder: 1 },
          { titleEn: 'Two', sortOrder: 1 },
        ],
      }),
    ).toThrow(HeroObjectiveInvalidOrderException);
  });

  it('validates mission title and XP points', () => {
    expect(() => assertMissionTitlePresent({ titleEn: null, titleAr: '' })).toThrow(
      ValidationDomainException,
    );
    expect(assertRewardXpValid(0)).toBe(0);
    expect(() => assertRewardXpValid(-1)).toThrow(
      HeroMissionPointsInvalidException,
    );
  });

  it('requires draft status and an active required objective before publish', () => {
    expect(() =>
      assertMissionPublishable({
        id: 'mission-1',
        status: HeroMissionStatus.PUBLISHED,
        titleEn: 'Published',
        titleAr: null,
        rewardXp: 10,
        objectives: [{ isRequired: true }],
      }),
    ).toThrow(HeroMissionInvalidStatusTransitionException);

    expect(() =>
      assertMissionPublishable({
        id: 'mission-1',
        status: HeroMissionStatus.DRAFT,
        titleEn: 'Draft',
        titleAr: null,
        rewardXp: 10,
        objectives: [{ isRequired: false }],
      }),
    ).toThrow(HeroObjectiveInvalidOrderException);
  });

  it('allows deleting drafts and archived missions without progress only', () => {
    expect(() =>
      assertMissionDeletable({
        mission: { id: 'mission-1', status: HeroMissionStatus.DRAFT },
        progressCount: 0,
      }),
    ).not.toThrow();

    expect(() =>
      assertMissionDeletable({
        mission: { id: 'mission-2', status: HeroMissionStatus.PUBLISHED },
        progressCount: 0,
      }),
    ).toThrow(HeroMissionInvalidStatusTransitionException);

    expect(() =>
      assertMissionDeletable({
        mission: { id: 'mission-3', status: HeroMissionStatus.ARCHIVED },
        progressCount: 1,
      }),
    ).toThrow(HeroMissionInvalidStatusTransitionException);
  });

  it('uses the archived mission error for archived workflow actions', () => {
    expect(() =>
      assertMissionPublishable({
        id: 'mission-1',
        status: HeroMissionStatus.ARCHIVED,
        titleEn: 'Archived',
        titleAr: null,
        rewardXp: 10,
        objectives: [{ isRequired: true }],
      }),
    ).toThrow(HeroMissionArchivedException);
  });
});
