import { HeroMissionProgressStatus } from '@prisma/client';
import { summarizeHeroProgress } from '../domain/hero-journey-progress-domain';
import {
  HeroJourneyEventRecord,
  HeroProgressDetailRecord,
  HeroProgressEnrollmentRecord,
  HeroProgressMissionRecord,
  HeroProgressStudentRecord,
} from '../infrastructure/hero-journey-progress.repository';

export function presentHeroProgressDetail(progress: HeroProgressDetailRecord) {
  return {
    id: progress.id,
    missionId: progress.missionId,
    studentId: progress.studentId,
    enrollmentId: progress.enrollmentId,
    academicYearId: progress.academicYearId,
    termId: progress.termId,
    status: presentEnum(progress.status),
    progressPercent: progress.progressPercent,
    startedAt: presentNullableDate(progress.startedAt),
    completedAt: presentNullableDate(progress.completedAt),
    lastActivityAt: presentNullableDate(progress.lastActivityAt),
    mission: presentProgressMission(progress.mission),
    student: presentStudentSummary(progress.student),
    enrollment: presentEnrollmentDetailSummary(progress.enrollment),
    objectives: progress.mission.objectives.map((objective) => {
      const objectiveProgress = progress.objectiveProgress.find(
        (item) => item.objectiveId === objective.id,
      );

      return {
        id: objective.id,
        type: presentEnum(objective.type),
        titleEn: objective.titleEn,
        titleAr: objective.titleAr,
        sortOrder: objective.sortOrder,
        isRequired: objective.isRequired,
        completedAt: presentNullableDate(
          objectiveProgress?.completedAt ?? null,
        ),
        completedById: objectiveProgress?.completedById ?? null,
      };
    }),
    events: progress.events.map((event) => presentHeroJourneyEvent(event)),
  };
}

export function presentStudentHeroProgress(params: {
  student: HeroProgressStudentRecord;
  enrollment: HeroProgressEnrollmentRecord;
  academicYearId: string;
  termId: string;
  progress: HeroProgressDetailRecord[];
  availableMissions: HeroProgressMissionRecord[];
  recentEvents: HeroJourneyEventRecord[];
}) {
  const statuses = [
    ...params.progress.map((item) => item.status),
    ...params.availableMissions.map(() => 'available_not_started' as const),
  ];

  return {
    student: presentStudentSummary(params.student),
    enrollment: presentEnrollmentSummary({
      enrollment: params.enrollment,
      academicYearId: params.academicYearId,
      termId: params.termId,
    }),
    summary: summarizeHeroProgress(statuses),
    missions: [
      ...params.progress.map((progress) => presentProgressMissionRow(progress)),
      ...params.availableMissions.map((mission) =>
        presentAvailableMissionRow(mission),
      ),
    ],
    recentEvents: params.recentEvents.map((event) =>
      presentHeroJourneyEvent(event),
    ),
  };
}

function presentProgressMissionRow(progress: HeroProgressDetailRecord) {
  return {
    missionId: progress.missionId,
    progressId: progress.id,
    status: presentEnum(progress.status),
    progressPercent: progress.progressPercent,
    titleEn: progress.mission.titleEn,
    titleAr: progress.mission.titleAr,
    requiredLevel: progress.mission.requiredLevel,
    rewardXp: progress.mission.rewardXp,
    badgeReward: progress.mission.badgeReward
      ? presentBadgeSummary(progress.mission.badgeReward)
      : null,
    startedAt: presentNullableDate(progress.startedAt),
    completedAt: presentNullableDate(progress.completedAt),
    lastActivityAt: presentNullableDate(progress.lastActivityAt),
    objectives: buildObjectiveSummary({
      mission: progress.mission,
      progress,
    }),
  };
}

function presentAvailableMissionRow(mission: HeroProgressMissionRecord) {
  return {
    missionId: mission.id,
    progressId: null,
    status: 'not_started',
    progressPercent: 0,
    titleEn: mission.titleEn,
    titleAr: mission.titleAr,
    requiredLevel: mission.requiredLevel,
    rewardXp: mission.rewardXp,
    badgeReward: mission.badgeReward
      ? presentBadgeSummary(mission.badgeReward)
      : null,
    startedAt: null,
    completedAt: null,
    lastActivityAt: null,
    objectives: buildObjectiveSummary({ mission }),
  };
}

function presentProgressMission(mission: HeroProgressMissionRecord) {
  return {
    id: mission.id,
    titleEn: mission.titleEn,
    titleAr: mission.titleAr,
    briefEn: mission.briefEn,
    briefAr: mission.briefAr,
    requiredLevel: mission.requiredLevel,
    rewardXp: mission.rewardXp,
    status: presentEnum(mission.status),
    badgeReward: mission.badgeReward
      ? presentBadgeSummary(mission.badgeReward)
      : null,
  };
}

function presentStudentSummary(student: HeroProgressStudentRecord) {
  return {
    id: student.id,
    firstName: student.firstName,
    lastName: student.lastName,
    nameAr: null,
    code: null,
    admissionNo: null,
  };
}

function presentEnrollmentSummary(params: {
  enrollment: HeroProgressEnrollmentRecord;
  academicYearId: string;
  termId: string;
}) {
  return {
    enrollmentId: params.enrollment.id,
    academicYearId: params.academicYearId,
    termId: params.termId,
    classroomId: params.enrollment.classroomId,
    sectionId: params.enrollment.classroom.sectionId,
    gradeId: params.enrollment.classroom.section.gradeId,
    stageId: params.enrollment.classroom.section.grade.stageId,
  };
}

function presentEnrollmentDetailSummary(
  enrollment: HeroProgressEnrollmentRecord,
) {
  return {
    id: enrollment.id,
    classroomId: enrollment.classroomId,
    sectionId: enrollment.classroom.sectionId,
    gradeId: enrollment.classroom.section.gradeId,
    stageId: enrollment.classroom.section.grade.stageId,
  };
}

function buildObjectiveSummary(params: {
  mission: HeroProgressMissionRecord;
  progress?: HeroProgressDetailRecord;
}) {
  const activeObjectives = params.mission.objectives;
  const requiredObjectives = activeObjectives.filter(
    (objective) => objective.isRequired,
  );
  const completedIds = new Set(
    (params.progress?.objectiveProgress ?? [])
      .filter((item) => item.completedAt)
      .map((item) => item.objectiveId),
  );
  const completed = activeObjectives.filter((objective) =>
    completedIds.has(objective.id),
  ).length;
  const completedRequired = requiredObjectives.filter((objective) =>
    completedIds.has(objective.id),
  ).length;

  return {
    total: activeObjectives.length,
    required: requiredObjectives.length,
    optional: activeObjectives.length - requiredObjectives.length,
    completed,
    completedRequired,
  };
}

function presentBadgeSummary(
  badge: NonNullable<HeroProgressMissionRecord['badgeReward']>,
) {
  return {
    id: badge.id,
    slug: badge.slug,
    nameEn: badge.nameEn,
    nameAr: badge.nameAr,
    assetPath: badge.assetPath,
    fileId: badge.fileId,
    isActive: badge.isActive,
  };
}

function presentHeroJourneyEvent(event: HeroJourneyEventRecord) {
  return {
    id: event.id,
    type: presentEnum(event.type),
    missionId: event.missionId,
    missionProgressId: event.missionProgressId,
    objectiveId: event.objectiveId,
    occurredAt: event.occurredAt.toISOString(),
    actorUserId: event.actorUserId,
  };
}

function presentEnum(value: string | HeroMissionProgressStatus): string {
  return String(value).toLowerCase();
}

function presentNullableDate(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}
