import {
  HeroMissionProgressStatus,
  HeroMissionStatus,
  RewardRedemptionStatus,
  XpSourceType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { ParentAppAccessibleChild } from '../../shared/parent-app.types';
import { ParentHeroReadAdapter } from '../infrastructure/parent-hero-read.adapter';

describe('ParentHeroReadAdapter', () => {
  it('lists only published current-stage missions for the linked child', async () => {
    const {
      adapter,
      scopedEnrollmentMocks,
      scopedHeroMissionMocks,
      scopedHeroMissionProgressMocks,
    } = createAdapter();
    scopedEnrollmentMocks.findFirstOrThrow.mockResolvedValue(
      enrollmentFixture(),
    );
    scopedHeroMissionMocks.findMany.mockResolvedValue([
      { id: 'mission-1', titleEn: 'Mission', titleAr: null },
    ]);
    scopedHeroMissionProgressMocks.findMany.mockResolvedValue([]);

    await adapter.listMissions(childFixture(), {
      subjectId: 'subject-1',
      status: 'completed',
    });

    const query = scopedHeroMissionMocks.findMany.mock.calls[0][0];
    expect(query.where).toMatchObject({
      academicYearId: 'year-1',
      termId: 'term-1',
      stageId: 'stage-1',
      status: HeroMissionStatus.PUBLISHED,
      deletedAt: null,
      subjectId: 'subject-1',
    });
    expect(scopedHeroMissionProgressMocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          missionId: { in: ['mission-1'] },
          studentId: 'student-1',
          enrollmentId: 'enrollment-1',
        },
      }),
    );
  });

  it('calculates overview from XpLedger and child-scoped hero/reward read models only', async () => {
    const {
      adapter,
      scopedEnrollmentMocks,
      scopedHeroMissionMocks,
      scopedHeroMissionProgressMocks,
      scopedHeroStudentBadgeMocks,
      scopedXpLedgerMocks,
      scopedRewardRedemptionMocks,
      scopedBehaviorPointLedgerMocks,
    } = createAdapter();
    scopedEnrollmentMocks.findFirstOrThrow.mockResolvedValue(
      enrollmentFixture(),
    );
    scopedHeroMissionMocks.findMany.mockResolvedValue([]);
    scopedHeroMissionProgressMocks.findMany.mockResolvedValue([]);
    scopedHeroMissionProgressMocks.count.mockResolvedValue(1);
    scopedHeroStudentBadgeMocks.findMany.mockResolvedValue([]);
    scopedXpLedgerMocks.aggregate
      .mockResolvedValueOnce({ _sum: { amount: 25 } })
      .mockResolvedValueOnce({ _sum: { amount: 10 } });
    scopedRewardRedemptionMocks.groupBy.mockResolvedValue([
      { status: RewardRedemptionStatus.REQUESTED, _count: { _all: 1 } },
    ]);

    const result = await adapter.getHeroOverview(childFixture());

    expect(result.currentXp).toBe(25);
    expect(scopedXpLedgerMocks.aggregate).toHaveBeenNthCalledWith(1, {
      where: {
        studentId: 'student-1',
        enrollmentId: 'enrollment-1',
        academicYearId: 'year-1',
        termId: 'term-1',
      },
      _sum: { amount: true },
    });
    expect(scopedXpLedgerMocks.aggregate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          sourceType: XpSourceType.HERO_MISSION,
        }),
      }),
    );
    expect(scopedHeroMissionProgressMocks.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          studentId: 'student-1',
          enrollmentId: 'enrollment-1',
          status: HeroMissionProgressStatus.COMPLETED,
        }),
      }),
    );
    expect(scopedBehaviorPointLedgerMocks.aggregate).not.toHaveBeenCalled();
  });

  it('performs no writes or platform bypass calls', async () => {
    const {
      adapter,
      scopedEnrollmentMocks,
      scopedHeroMissionMocks,
      scopedHeroMissionProgressMocks,
      mutationMocks,
      platformBypass,
    } = createAdapter();
    scopedEnrollmentMocks.findFirstOrThrow.mockResolvedValue(
      enrollmentFixture(),
    );
    scopedHeroMissionMocks.findMany.mockResolvedValue([]);
    scopedHeroMissionProgressMocks.findMany.mockResolvedValue([]);

    await adapter.listMissions(childFixture());

    for (const mutation of Object.values(mutationMocks)) {
      expect(mutation).not.toHaveBeenCalled();
    }
    expect(platformBypass).not.toHaveBeenCalled();
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

function enrollmentFixture() {
  return {
    id: 'enrollment-1',
    classroom: {
      id: 'classroom-1',
      section: {
        id: 'section-1',
        grade: {
          id: 'grade-1',
          stage: { id: 'stage-1' },
        },
      },
    },
  };
}

function modelMocks() {
  return {
    findFirst: jest.fn(),
    findFirstOrThrow: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
    aggregate: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    upsert: jest.fn(),
  };
}

function createAdapter() {
  const scopedEnrollmentMocks = modelMocks();
  const scopedHeroMissionMocks = modelMocks();
  const scopedHeroMissionProgressMocks = modelMocks();
  const scopedHeroMissionObjectiveProgressMocks = modelMocks();
  const scopedHeroStudentBadgeMocks = modelMocks();
  const scopedHeroJourneyEventMocks = modelMocks();
  const scopedRewardRedemptionMocks = modelMocks();
  const scopedXpLedgerMocks = modelMocks();
  const scopedBehaviorPointLedgerMocks = modelMocks();
  const platformBypass = jest.fn();
  const prisma = {
    platformBypass,
    scoped: {
      enrollment: scopedEnrollmentMocks,
      heroMission: scopedHeroMissionMocks,
      heroMissionProgress: scopedHeroMissionProgressMocks,
      heroMissionObjectiveProgress: scopedHeroMissionObjectiveProgressMocks,
      heroStudentBadge: scopedHeroStudentBadgeMocks,
      heroJourneyEvent: scopedHeroJourneyEventMocks,
      rewardRedemption: scopedRewardRedemptionMocks,
      xpLedger: scopedXpLedgerMocks,
      behaviorPointLedger: scopedBehaviorPointLedgerMocks,
    },
  } as unknown as PrismaService;

  return {
    adapter: new ParentHeroReadAdapter(prisma),
    scopedEnrollmentMocks,
    scopedHeroMissionMocks,
    scopedHeroMissionProgressMocks,
    scopedHeroMissionObjectiveProgressMocks,
    scopedHeroStudentBadgeMocks,
    scopedHeroJourneyEventMocks,
    scopedRewardRedemptionMocks,
    scopedXpLedgerMocks,
    scopedBehaviorPointLedgerMocks,
    mutationMocks: {
      missionProgressCreate: scopedHeroMissionProgressMocks.create,
      objectiveProgressCreate: scopedHeroMissionObjectiveProgressMocks.create,
      badgeCreate: scopedHeroStudentBadgeMocks.create,
      eventCreate: scopedHeroJourneyEventMocks.create,
      xpLedgerCreate: scopedXpLedgerMocks.create,
      behaviorLedgerCreate: scopedBehaviorPointLedgerMocks.create,
      redemptionCreate: scopedRewardRedemptionMocks.create,
    },
    platformBypass,
  };
}
