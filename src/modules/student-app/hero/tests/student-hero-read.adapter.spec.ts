import {
  HeroMissionProgressStatus,
  HeroMissionStatus,
  RewardRedemptionStatus,
  XpSourceType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { StudentAppContext } from '../../shared/student-app.types';
import { StudentHeroReadAdapter } from '../infrastructure/student-hero-read.adapter';

describe('StudentHeroReadAdapter', () => {
  it('lists published stage missions and current student progress through prisma.scoped', async () => {
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
      { id: 'mission-1', sortOrder: 1 },
    ]);
    scopedHeroMissionProgressMocks.findMany.mockResolvedValue([
      { id: 'progress-1', missionId: 'mission-1' },
    ]);

    await adapter.listMissions(contextFixture(), { status: 'completed' });

    const missionQuery = scopedHeroMissionMocks.findMany.mock.calls[0][0];
    expect(missionQuery.where).toMatchObject({
      academicYearId: 'year-1',
      termId: 'term-1',
      stageId: 'stage-1',
      status: HeroMissionStatus.PUBLISHED,
    });
    expect(missionQuery.where).not.toHaveProperty('schoolId');
    expect(
      scopedHeroMissionProgressMocks.findMany.mock.calls[0][0].where,
    ).toEqual({
      missionId: { in: ['mission-1'] },
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
    });
  });

  it('finds mission detail only inside the current student stage and progress ownership', async () => {
    const {
      adapter,
      scopedEnrollmentMocks,
      scopedHeroMissionMocks,
      scopedHeroMissionProgressMocks,
    } = createAdapter();
    scopedEnrollmentMocks.findFirstOrThrow.mockResolvedValue(
      enrollmentFixture(),
    );
    scopedHeroMissionMocks.findFirst.mockResolvedValue({ id: 'mission-1' });
    scopedHeroMissionProgressMocks.findFirst.mockResolvedValue(null);

    await adapter.findMission({
      context: contextFixture(),
      missionId: 'mission-1',
    });

    expect(
      scopedHeroMissionMocks.findFirst.mock.calls[0][0].where,
    ).toMatchObject({
      id: 'mission-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      stageId: 'stage-1',
      status: HeroMissionStatus.PUBLISHED,
    });
    expect(
      scopedHeroMissionProgressMocks.findFirst.mock.calls[0][0].where,
    ).toEqual({
      missionId: 'mission-1',
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
    });
  });

  it('reads badges, rewards, and XP summaries without mutations', async () => {
    const {
      adapter,
      scopedEnrollmentMocks,
      scopedHeroMissionMocks,
      scopedHeroMissionProgressMocks,
      scopedHeroStudentBadgeMocks,
      scopedXpLedgerMocks,
      scopedRewardRedemptionMocks,
      mutationMocks,
      platformBypass,
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

    const result = await adapter.getHeroOverview(contextFixture());

    expect(result).toMatchObject({
      currentXp: 25,
      rewardsSummary: {
        totalHeroXp: 10,
        completedMissions: 1,
        rewardRedemptions: {
          requested: 1,
          approved: 0,
          fulfilled: 0,
        },
      },
    });
    expect(scopedXpLedgerMocks.aggregate.mock.calls[1][0].where).toMatchObject({
      studentId: 'student-1',
      sourceType: XpSourceType.HERO_MISSION,
    });
    expect(
      scopedHeroMissionProgressMocks.count.mock.calls[0][0].where,
    ).toMatchObject({
      studentId: 'student-1',
      status: HeroMissionProgressStatus.COMPLETED,
    });
    for (const mutation of Object.values(mutationMocks)) {
      expect(mutation).not.toHaveBeenCalled();
    }
    expect(platformBypass).not.toHaveBeenCalled();
  });
});

function contextFixture(): StudentAppContext {
  return {
    studentUserId: 'student-user-1',
    studentId: 'student-1',
    schoolId: 'school-1',
    organizationId: 'org-1',
    membershipId: 'membership-1',
    roleId: 'role-1',
    permissions: ['students.records.view'],
    enrollmentId: 'enrollment-1',
    classroomId: 'classroom-1',
    academicYearId: 'year-1',
    requestedAcademicYearId: 'year-1',
    requestedTermId: 'term-1',
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
          stage: {
            id: 'stage-1',
            nameEn: 'Primary',
            nameAr: 'Primary AR',
          },
        },
      },
    },
  };
}

function modelMocks(): {
  findFirst: jest.Mock;
  findFirstOrThrow: jest.Mock;
  findMany: jest.Mock;
  count: jest.Mock;
  groupBy: jest.Mock;
  aggregate: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  updateMany: jest.Mock;
  delete: jest.Mock;
  deleteMany: jest.Mock;
} {
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
  };
}

function createAdapter(): {
  adapter: StudentHeroReadAdapter;
  scopedEnrollmentMocks: ReturnType<typeof modelMocks>;
  scopedHeroMissionMocks: ReturnType<typeof modelMocks>;
  scopedHeroMissionProgressMocks: ReturnType<typeof modelMocks>;
  scopedHeroStudentBadgeMocks: ReturnType<typeof modelMocks>;
  scopedXpLedgerMocks: ReturnType<typeof modelMocks>;
  scopedRewardRedemptionMocks: ReturnType<typeof modelMocks>;
  mutationMocks: Record<string, jest.Mock>;
  platformBypass: jest.Mock;
} {
  const scopedEnrollmentMocks = modelMocks();
  const scopedHeroMissionMocks = modelMocks();
  const scopedHeroMissionProgressMocks = modelMocks();
  const scopedHeroStudentBadgeMocks = modelMocks();
  const scopedXpLedgerMocks = modelMocks();
  const scopedRewardRedemptionMocks = modelMocks();
  const platformBypass = jest.fn();
  const prisma = {
    platformBypass,
    scoped: {
      enrollment: scopedEnrollmentMocks,
      heroMission: scopedHeroMissionMocks,
      heroMissionProgress: scopedHeroMissionProgressMocks,
      heroStudentBadge: scopedHeroStudentBadgeMocks,
      xpLedger: scopedXpLedgerMocks,
      rewardRedemption: scopedRewardRedemptionMocks,
    },
  } as unknown as PrismaService;

  return {
    adapter: new StudentHeroReadAdapter(prisma),
    scopedEnrollmentMocks,
    scopedHeroMissionMocks,
    scopedHeroMissionProgressMocks,
    scopedHeroStudentBadgeMocks,
    scopedXpLedgerMocks,
    scopedRewardRedemptionMocks,
    mutationMocks: {
      heroMissionCreate: scopedHeroMissionMocks.create,
      heroMissionUpdate: scopedHeroMissionMocks.update,
      heroMissionProgressCreate: scopedHeroMissionProgressMocks.create,
      heroMissionProgressUpdate: scopedHeroMissionProgressMocks.update,
      heroStudentBadgeCreate: scopedHeroStudentBadgeMocks.create,
      xpLedgerCreate: scopedXpLedgerMocks.create,
      rewardRedemptionCreate: scopedRewardRedemptionMocks.create,
    },
    platformBypass,
  };
}
