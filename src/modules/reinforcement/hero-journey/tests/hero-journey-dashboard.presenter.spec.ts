import {
  HeroJourneyEventType,
  HeroMissionProgressStatus,
  HeroMissionStatus,
  StudentEnrollmentStatus,
  StudentStatus,
  XpSourceType,
} from '@prisma/client';
import {
  presentHeroBadgeSummary,
  presentHeroMap,
  presentHeroOverview,
} from '../presenters/hero-journey-dashboard.presenter';

const SCHOOL_ID = 'school-1';
const YEAR_ID = 'year-1';
const TERM_ID = 'term-1';
const STAGE_ID = 'stage-1';
const GRADE_ID = 'grade-1';
const SECTION_ID = 'section-1';
const CLASSROOM_ID = 'classroom-1';
const STUDENT_ID = 'student-1';
const ENROLLMENT_ID = 'enrollment-1';
const MISSION_ID = 'mission-1';
const PROGRESS_ID = 'progress-1';
const BADGE_ID = 'badge-1';
const NOW = new Date('2026-04-30T08:00:00.000Z');

describe('Hero Journey dashboard presenter', () => {
  it('maps overview enums to lowercase and never exposes schoolId', () => {
    const presented = presentHeroOverview({
      scope: scope(),
      dataset: dataset(),
    });

    expect(presented.recentActivity[0]).toMatchObject({
      type: 'xp_granted',
      progressId: PROGRESS_ID,
    });
    expect(presented.missions.published).toBe(1);
    expect(JSON.stringify(presented)).not.toContain('schoolId');
  });

  it('presents map aggregate mode and student reward state', () => {
    const aggregate = presentHeroMap({
      scope: scope(),
      dataset: mapDataset(),
    });
    expect(aggregate.missions[0]).toMatchObject({
      status: 'published',
      completedCount: 1,
      startedCount: 1,
    });

    const student = presentHeroMap({
      scope: { ...scope(), studentId: STUDENT_ID },
      dataset: mapDataset(),
      studentId: STUDENT_ID,
    });
    expect(student.missions[0].studentProgress).toMatchObject({
      status: 'completed',
      xpGranted: true,
      badgeAwarded: true,
    });
  });

  it('presents badge summary with student earned state', () => {
    const presented = presentHeroBadgeSummary({
      scope: { ...scope(), studentId: STUDENT_ID },
      dataset: {
        badges: [badgeRecord()],
        missionsUsingBadges: [missionRecord()],
        studentBadges: [studentBadgeRecord()],
      } as any,
      studentId: STUDENT_ID,
    });

    expect(presented.summary).toEqual({
      badgesTotal: 1,
      activeBadges: 1,
      earnedTotal: 1,
      studentsWithBadges: 1,
    });
    expect(presented.badges[0]).toMatchObject({
      badgeId: BADGE_ID,
      missionsUsingCount: 1,
      earnedCount: 1,
      studentEarned: true,
      studentBadgeId: 'student-badge-1',
    });
    expect(JSON.stringify(presented)).not.toContain('schoolId');
  });

  function scope() {
    return {
      academicYearId: YEAR_ID,
      yearId: YEAR_ID,
      termId: TERM_ID,
      stageId: STAGE_ID,
      gradeId: null,
      sectionId: null,
      classroomId: null,
      studentId: null,
      subjectId: null,
    };
  }

  function dataset() {
    return {
      enrollments: [enrollmentRecord()],
      missions: [missionRecord()],
      progress: [progressRecord()],
      xpLedger: [xpLedgerRecord()],
      studentBadges: [studentBadgeRecord()],
      events: [eventRecord()],
    } as any;
  }

  function mapDataset() {
    return {
      missions: [missionRecord()],
      progress: [progressRecord()],
      xpLedger: [xpLedgerRecord()],
      studentBadges: [studentBadgeRecord()],
    } as any;
  }

  function studentRecord() {
    return {
      id: STUDENT_ID,
      schoolId: SCHOOL_ID,
      firstName: 'Hero',
      lastName: 'Student',
      status: StudentStatus.ACTIVE,
    };
  }

  function enrollmentRecord() {
    return {
      id: ENROLLMENT_ID,
      schoolId: SCHOOL_ID,
      studentId: STUDENT_ID,
      academicYearId: YEAR_ID,
      termId: TERM_ID,
      classroomId: CLASSROOM_ID,
      status: StudentEnrollmentStatus.ACTIVE,
      student: studentRecord(),
      classroom: {
        id: CLASSROOM_ID,
        schoolId: SCHOOL_ID,
        nameAr: 'Classroom',
        nameEn: 'Classroom',
        sectionId: SECTION_ID,
        section: {
          id: SECTION_ID,
          nameAr: 'Section',
          nameEn: 'Section',
          gradeId: GRADE_ID,
          grade: {
            id: GRADE_ID,
            nameAr: 'Grade',
            nameEn: 'Grade',
            stageId: STAGE_ID,
            stage: {
              id: STAGE_ID,
              schoolId: SCHOOL_ID,
              nameAr: 'Stage',
              nameEn: 'Stage',
            },
          },
        },
      },
    };
  }

  function badgeRecord() {
    return {
      id: BADGE_ID,
      schoolId: SCHOOL_ID,
      slug: 'hero',
      nameEn: 'Hero',
      nameAr: 'Hero',
      descriptionEn: null,
      descriptionAr: null,
      assetPath: null,
      fileId: null,
      sortOrder: 1,
      isActive: true,
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
    };
  }

  function missionRecord() {
    return {
      id: MISSION_ID,
      schoolId: SCHOOL_ID,
      academicYearId: YEAR_ID,
      termId: TERM_ID,
      stageId: STAGE_ID,
      subjectId: null,
      titleEn: 'Mission',
      titleAr: null,
      briefEn: null,
      briefAr: null,
      requiredLevel: 1,
      rewardXp: 10,
      badgeRewardId: BADGE_ID,
      status: HeroMissionStatus.PUBLISHED,
      positionX: 1,
      positionY: 2,
      sortOrder: 1,
      publishedAt: NOW,
      archivedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
      badgeReward: badgeRecord(),
      objectives: [
        {
          id: 'objective-1',
          schoolId: SCHOOL_ID,
          missionId: MISSION_ID,
          type: 'MANUAL',
          titleEn: 'Objective',
          titleAr: null,
          subtitleEn: null,
          subtitleAr: null,
          sortOrder: 1,
          isRequired: true,
          deletedAt: null,
        },
      ],
    };
  }

  function progressRecord() {
    return {
      id: PROGRESS_ID,
      schoolId: SCHOOL_ID,
      missionId: MISSION_ID,
      studentId: STUDENT_ID,
      enrollmentId: ENROLLMENT_ID,
      academicYearId: YEAR_ID,
      termId: TERM_ID,
      status: HeroMissionProgressStatus.COMPLETED,
      progressPercent: 100,
      startedAt: NOW,
      completedAt: NOW,
      lastActivityAt: NOW,
      xpLedgerId: 'ledger-1',
      createdAt: NOW,
      updatedAt: NOW,
      student: studentRecord(),
      enrollment: enrollmentRecord(),
      objectiveProgress: [
        {
          id: 'objective-progress-1',
          schoolId: SCHOOL_ID,
          missionProgressId: PROGRESS_ID,
          objectiveId: 'objective-1',
          completedAt: NOW,
          objective: {
            id: 'objective-1',
            missionId: MISSION_ID,
            isRequired: true,
            deletedAt: null,
          },
        },
      ],
    };
  }

  function xpLedgerRecord() {
    return {
      id: 'ledger-1',
      schoolId: SCHOOL_ID,
      academicYearId: YEAR_ID,
      termId: TERM_ID,
      studentId: STUDENT_ID,
      enrollmentId: ENROLLMENT_ID,
      sourceType: XpSourceType.HERO_MISSION,
      sourceId: PROGRESS_ID,
      amount: 10,
      reason: null,
      reasonAr: null,
      actorUserId: 'actor-1',
      occurredAt: NOW,
      createdAt: NOW,
      student: studentRecord(),
    };
  }

  function studentBadgeRecord() {
    return {
      id: 'student-badge-1',
      schoolId: SCHOOL_ID,
      studentId: STUDENT_ID,
      badgeId: BADGE_ID,
      missionId: MISSION_ID,
      missionProgressId: PROGRESS_ID,
      earnedAt: NOW,
      createdAt: NOW,
      student: studentRecord(),
      badge: badgeRecord(),
      mission: {
        id: MISSION_ID,
        academicYearId: YEAR_ID,
        termId: TERM_ID,
        stageId: STAGE_ID,
        subjectId: null,
        deletedAt: null,
      },
    };
  }

  function eventRecord() {
    return {
      id: 'event-1',
      schoolId: SCHOOL_ID,
      missionId: MISSION_ID,
      missionProgressId: PROGRESS_ID,
      objectiveId: null,
      studentId: STUDENT_ID,
      enrollmentId: ENROLLMENT_ID,
      xpLedgerId: 'ledger-1',
      badgeId: BADGE_ID,
      type: HeroJourneyEventType.XP_GRANTED,
      sourceId: PROGRESS_ID,
      actorUserId: 'actor-1',
      occurredAt: NOW,
      createdAt: NOW,
    };
  }
});
