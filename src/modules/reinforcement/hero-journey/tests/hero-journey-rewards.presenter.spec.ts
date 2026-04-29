import {
  HeroJourneyEventType,
  HeroMissionProgressStatus,
  HeroMissionStatus,
  StudentStatus,
  XpSourceType,
} from '@prisma/client';
import {
  presentHeroMissionBadgeAward,
  presentHeroMissionXpGrant,
  presentStudentHeroRewards,
} from '../presenters/hero-journey-rewards.presenter';

const NOW = new Date('2026-04-29T12:00:00.000Z');

describe('Hero Journey rewards presenter', () => {
  it('maps XP grants with lowercase source type and idempotency', () => {
    const presented = presentHeroMissionXpGrant({
      progress: progressRecord(),
      ledger: ledgerRecord(),
      idempotent: true,
    });

    expect(presented).toMatchObject({
      id: 'ledger-1',
      progressId: 'progress-1',
      missionId: 'mission-1',
      sourceType: 'hero_mission',
      amount: 10,
      idempotent: true,
    });
    expect(JSON.stringify(presented)).not.toContain('schoolId');
  });

  it('maps badge awards with badge summaries and no school ids', () => {
    const presented = presentHeroMissionBadgeAward({
      progress: progressRecord(),
      studentBadge: studentBadgeRecord(),
      idempotent: false,
    });

    expect(presented).toMatchObject({
      id: 'student-badge-1',
      badgeId: 'badge-1',
      studentBadgeId: 'student-badge-1',
      badge: {
        slug: 'quest-master',
        nameEn: 'Quest Master',
      },
      idempotent: false,
    });
    expect(JSON.stringify(presented)).not.toContain('schoolId');
  });

  it('aggregates student reward summary and lowercases event enums', () => {
    const presented = presentStudentHeroRewards({
      student: studentRecord(),
      includeEvents: true,
      rewards: {
        xpLedger: [ledgerRecord()],
        badges: [studentBadgeRecord()],
        allStudentBadges: [studentBadgeRecord()],
        completedProgress: [progressRecord({ xpLedgerId: 'ledger-1' })],
        events: [eventRecord()],
      },
    });

    expect(presented.summary).toEqual({
      totalHeroXp: 10,
      badgesCount: 1,
      completedMissions: 1,
      xpGrantedMissions: 1,
      badgeAwardedMissions: 1,
    });
    expect(presented.xpLedger[0]).toMatchObject({
      sourceType: 'hero_mission',
      progressId: 'progress-1',
      missionId: 'mission-1',
    });
    expect(presented.events?.[0]).toMatchObject({
      type: 'badge_awarded',
      progressId: 'progress-1',
    });
    expect(JSON.stringify(presented)).not.toContain('schoolId');
  });

  function progressRecord(overrides?: any) {
    return {
      id: 'progress-1',
      schoolId: 'school-1',
      missionId: 'mission-1',
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      status: HeroMissionProgressStatus.COMPLETED,
      progressPercent: 100,
      startedAt: NOW,
      completedAt: NOW,
      lastActivityAt: NOW,
      xpLedgerId: overrides?.xpLedgerId ?? null,
      createdAt: NOW,
      updatedAt: NOW,
      mission: {
        id: 'mission-1',
        schoolId: 'school-1',
        academicYearId: 'year-1',
        termId: 'term-1',
        stageId: 'stage-1',
        titleEn: 'Mission',
        titleAr: null,
        rewardXp: 10,
        badgeRewardId: 'badge-1',
        status: HeroMissionStatus.PUBLISHED,
        archivedAt: null,
        deletedAt: null,
        badgeReward: badgeRecord(),
      },
      student: studentRecord(),
      enrollment: {
        id: 'enrollment-1',
        schoolId: 'school-1',
        studentId: 'student-1',
        academicYearId: 'year-1',
        termId: 'term-1',
        classroomId: 'classroom-1',
        status: 'ACTIVE',
        deletedAt: null,
        classroom: {
          id: 'classroom-1',
          sectionId: 'section-1',
          section: {
            id: 'section-1',
            gradeId: 'grade-1',
            grade: { id: 'grade-1', stageId: 'stage-1' },
          },
        },
      },
      ...(overrides ?? {}),
    } as never;
  }

  function ledgerRecord() {
    return {
      id: 'ledger-1',
      schoolId: 'school-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      assignmentId: null,
      policyId: 'policy-1',
      sourceType: XpSourceType.HERO_MISSION,
      sourceId: 'progress-1',
      amount: 10,
      reason: null,
      reasonAr: null,
      actorUserId: 'actor-1',
      occurredAt: NOW,
      metadata: null,
      createdAt: NOW,
      updatedAt: NOW,
    } as never;
  }

  function studentBadgeRecord() {
    return {
      id: 'student-badge-1',
      schoolId: 'school-1',
      studentId: 'student-1',
      badgeId: 'badge-1',
      missionId: 'mission-1',
      missionProgressId: 'progress-1',
      earnedAt: NOW,
      metadata: null,
      createdAt: NOW,
      updatedAt: NOW,
      badge: badgeRecord(),
    } as never;
  }

  function badgeRecord() {
    return {
      id: 'badge-1',
      schoolId: 'school-1',
      slug: 'quest-master',
      nameEn: 'Quest Master',
      nameAr: null,
      descriptionEn: 'Completed a quest',
      descriptionAr: null,
      assetPath: '/badges/quest.svg',
      fileId: null,
      isActive: true,
      deletedAt: null,
    };
  }

  function studentRecord() {
    return {
      id: 'student-1',
      schoolId: 'school-1',
      firstName: 'Hero',
      lastName: 'Student',
      status: StudentStatus.ACTIVE,
      deletedAt: null,
    };
  }

  function eventRecord() {
    return {
      id: 'event-1',
      schoolId: 'school-1',
      missionId: 'mission-1',
      missionProgressId: 'progress-1',
      objectiveId: null,
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      xpLedgerId: null,
      badgeId: 'badge-1',
      type: HeroJourneyEventType.BADGE_AWARDED,
      sourceId: 'student-badge-1',
      actorUserId: 'actor-1',
      occurredAt: NOW,
      metadata: null,
      createdAt: NOW,
      updatedAt: NOW,
    } as never;
  }
});
