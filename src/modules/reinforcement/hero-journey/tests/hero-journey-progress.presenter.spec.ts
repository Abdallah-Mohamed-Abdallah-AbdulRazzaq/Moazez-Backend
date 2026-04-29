import {
  HeroJourneyEventType,
  HeroMissionObjectiveType,
  HeroMissionProgressStatus,
  HeroMissionStatus,
  StudentEnrollmentStatus,
  StudentStatus,
} from '@prisma/client';
import {
  presentHeroProgressDetail,
  presentStudentHeroProgress,
} from '../presenters/hero-journey-progress.presenter';

const NOW = new Date('2026-04-29T12:00:00.000Z');

describe('Hero Journey progress presenter', () => {
  it('maps progress detail enums to lowercase and never exposes schoolId', () => {
    const result = presentHeroProgressDetail(progressRecord());

    expect(result).toMatchObject({
      id: 'progress-1',
      status: 'in_progress',
      mission: {
        id: 'mission-1',
        status: 'published',
      },
      objectives: [
        {
          id: 'objective-1',
          type: 'quiz',
          completedAt: NOW.toISOString(),
          completedById: 'actor-1',
        },
      ],
      events: [
        {
          id: 'event-1',
          type: 'objective_completed',
          objectiveId: 'objective-1',
        },
      ],
    });
    expect(result).not.toHaveProperty('schoolId');
    expect(result.mission).not.toHaveProperty('schoolId');
    expect(result.objectives[0]).not.toHaveProperty('schoolId');
    expect(result.events[0]).not.toHaveProperty('schoolId');
  });

  it('presents student progress with available missions as not_started', () => {
    const result = presentStudentHeroProgress({
      student: studentRecord(),
      enrollment: enrollmentRecord(),
      academicYearId: 'year-1',
      termId: 'term-1',
      progress: [progressRecord()],
      availableMissions: [
        missionRecord({
          id: 'mission-available',
          objectives: [
            objectiveRecord({
              id: 'available-required',
              missionId: 'mission-available',
            }),
          ],
        }),
      ],
      recentEvents: [eventRecord()],
    });

    expect(result.summary).toMatchObject({
      missionsTotal: 2,
      notStarted: 1,
      inProgress: 1,
    });
    expect(result.missions[1]).toMatchObject({
      missionId: 'mission-available',
      progressId: null,
      status: 'not_started',
      progressPercent: 0,
      objectives: {
        total: 1,
        required: 1,
        completedRequired: 0,
      },
    });
    expect(result.student).not.toHaveProperty('schoolId');
    expect(result.enrollment).not.toHaveProperty('schoolId');
  });

  function progressRecord(overrides?: any) {
    return {
      id: overrides?.id ?? 'progress-1',
      schoolId: 'school-1',
      missionId: overrides?.missionId ?? 'mission-1',
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      status: overrides?.status ?? HeroMissionProgressStatus.IN_PROGRESS,
      progressPercent: overrides?.progressPercent ?? 100,
      startedAt: NOW,
      completedAt: overrides?.completedAt ?? null,
      lastActivityAt: NOW,
      xpLedgerId: null,
      metadata: { internal: true },
      createdAt: NOW,
      updatedAt: NOW,
      mission: overrides?.mission ?? missionRecord(),
      student: studentRecord(),
      enrollment: enrollmentRecord(),
      objectiveProgress: overrides?.objectiveProgress ?? [
        {
          id: 'objective-progress-1',
          schoolId: 'school-1',
          missionProgressId: 'progress-1',
          objectiveId: 'objective-1',
          completedAt: NOW,
          completedById: 'actor-1',
          metadata: null,
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
      events: overrides?.events ?? [eventRecord()],
    } as never;
  }

  function missionRecord(overrides?: any) {
    return {
      id: overrides?.id ?? 'mission-1',
      schoolId: 'school-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      stageId: 'stage-1',
      subjectId: null,
      linkedAssessmentId: null,
      linkedLessonRef: null,
      titleEn: 'Mission',
      titleAr: null,
      briefEn: 'Brief',
      briefAr: null,
      requiredLevel: 1,
      rewardXp: 10,
      badgeRewardId: 'badge-1',
      status: HeroMissionStatus.PUBLISHED,
      positionX: null,
      positionY: null,
      sortOrder: 1,
      publishedAt: NOW,
      publishedById: null,
      archivedAt: null,
      archivedById: null,
      createdById: null,
      metadata: null,
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
      badgeReward: {
        id: 'badge-1',
        slug: 'badge',
        nameEn: 'Badge',
        nameAr: null,
        assetPath: null,
        fileId: null,
        isActive: true,
      },
      objectives: overrides?.objectives ?? [objectiveRecord()],
    } as never;
  }

  function objectiveRecord(overrides?: any) {
    return {
      id: overrides?.id ?? 'objective-1',
      schoolId: 'school-1',
      missionId: overrides?.missionId ?? 'mission-1',
      type: HeroMissionObjectiveType.QUIZ,
      titleEn: 'Objective',
      titleAr: null,
      subtitleEn: null,
      subtitleAr: null,
      linkedAssessmentId: null,
      linkedLessonRef: null,
      sortOrder: 1,
      isRequired: true,
      metadata: null,
      createdAt: NOW,
      updatedAt: NOW,
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
    } as never;
  }

  function enrollmentRecord() {
    return {
      id: 'enrollment-1',
      schoolId: 'school-1',
      studentId: 'student-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      classroomId: 'classroom-1',
      status: StudentEnrollmentStatus.ACTIVE,
      classroom: {
        id: 'classroom-1',
        sectionId: 'section-1',
        section: {
          id: 'section-1',
          gradeId: 'grade-1',
          grade: {
            id: 'grade-1',
            stageId: 'stage-1',
            stage: {
              id: 'stage-1',
              nameEn: 'Primary',
              nameAr: null,
            },
          },
        },
      },
    } as never;
  }

  function eventRecord() {
    return {
      id: 'event-1',
      schoolId: 'school-1',
      missionId: 'mission-1',
      missionProgressId: 'progress-1',
      objectiveId: 'objective-1',
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      xpLedgerId: null,
      badgeId: null,
      type: HeroJourneyEventType.OBJECTIVE_COMPLETED,
      sourceId: null,
      actorUserId: 'actor-1',
      occurredAt: NOW,
      metadata: null,
      createdAt: NOW,
      updatedAt: NOW,
    } as never;
  }
});
