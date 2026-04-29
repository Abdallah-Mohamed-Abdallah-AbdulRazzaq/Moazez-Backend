import { HeroMissionProgressStatus, HeroMissionStatus } from '@prisma/client';
import {
  calculateHeroMissionProgressPercent,
  canCompleteHeroMission,
  normalizeHeroProgressStatus,
  summarizeHeroProgress,
} from '../domain/hero-journey-progress-domain';

describe('Hero Journey progress domain helpers', () => {
  it('returns 0 progress when no required objectives exist', () => {
    expect(
      calculateHeroMissionProgressPercent({
        activeObjectives: [
          { id: 'optional-1', isRequired: false },
          { id: 'optional-2', isRequired: false },
        ],
        completedObjectiveProgress: [
          { objectiveId: 'optional-1', completedAt: new Date() },
        ],
      }),
    ).toBe(0);
  });

  it('rounds required-objective progress correctly', () => {
    expect(
      calculateHeroMissionProgressPercent({
        activeObjectives: [
          { id: 'required-1', isRequired: true },
          { id: 'required-2', isRequired: true },
          { id: 'required-3', isRequired: true },
        ],
        completedObjectiveProgress: [
          { objectiveId: 'required-1', completedAt: new Date() },
        ],
      }),
    ).toBe(33);
  });

  it('does not let optional objectives block mission completion', () => {
    expect(
      canCompleteHeroMission({
        activeObjectives: [
          { id: 'required-1', isRequired: true },
          { id: 'optional-1', isRequired: false },
        ],
        completedObjectiveProgress: [
          { objectiveId: 'required-1', completedAt: new Date() },
        ],
      }),
    ).toBe(true);
  });

  it('normalizes progress statuses and summarizes mission states', () => {
    expect(normalizeHeroProgressStatus('in_progress')).toBe(
      HeroMissionProgressStatus.IN_PROGRESS,
    );

    expect(
      summarizeHeroProgress([
        HeroMissionProgressStatus.IN_PROGRESS,
        HeroMissionProgressStatus.COMPLETED,
        HeroMissionProgressStatus.CANCELLED,
        'available_not_started',
      ]),
    ).toEqual({
      missionsTotal: 4,
      notStarted: 1,
      inProgress: 1,
      completed: 1,
      cancelled: 1,
      completionRate: 25,
    });
  });

  it('does not treat archived missions as progress statuses', () => {
    expect(Object.values(HeroMissionStatus)).toContain(
      HeroMissionStatus.ARCHIVED,
    );
    expect(Object.values(HeroMissionProgressStatus)).not.toContain(
      'ARCHIVED' as HeroMissionProgressStatus,
    );
  });
});
