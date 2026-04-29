import { HeroMissionProgressStatus } from '@prisma/client';
import {
  buildHeroTopStudents,
  calculateAverageProgressPercent,
  deriveHeroMissionRewardState,
  summarizeBadgeEarnings,
  summarizeHeroEventTypes,
  summarizeHeroMissionStatuses,
  summarizeHeroProgressStatuses,
  summarizeHeroRewards,
  HeroDashboardScope,
} from '../domain/hero-journey-dashboard-domain';
import {
  HeroBadgeSummaryDataset,
  HeroDashboardClassroomRecord,
  HeroDashboardDataset,
  HeroDashboardEnrollmentRecord,
  HeroDashboardEventRecord,
  HeroDashboardMissionRecord,
  HeroDashboardProgressRecord,
  HeroDashboardStageRecord,
  HeroDashboardStudentBadgeRecord,
  HeroDashboardXpLedgerRecord,
  HeroMapDataset,
} from '../infrastructure/hero-journey-dashboard.repository';

export function presentHeroOverview(params: {
  scope: HeroDashboardScope;
  dataset: HeroDashboardDataset;
}) {
  return {
    scope: presentScope(params.scope),
    ...presentDashboardSummaryParts(params.dataset),
  };
}

export function presentHeroStageSummary(params: {
  scope: HeroDashboardScope;
  stage: HeroDashboardStageRecord;
  dataset: HeroDashboardDataset;
}) {
  return {
    stage: {
      stageId: params.stage.id,
      nameEn: params.stage.nameEn,
      nameAr: params.stage.nameAr,
      academicYearId: params.scope.academicYearId,
      termId: params.scope.termId,
    },
    studentsCount: params.dataset.enrollments.length,
    ...presentDashboardSummaryParts(params.dataset),
  };
}

export function presentHeroClassroomSummary(params: {
  scope: HeroDashboardScope;
  classroom: HeroDashboardClassroomRecord;
  dataset: HeroDashboardDataset;
}) {
  return {
    classroom: {
      classroomId: params.classroom.id,
      classroomName: deriveName(params.classroom.nameAr, params.classroom.nameEn),
      sectionId: params.classroom.sectionId,
      gradeId: params.classroom.section.gradeId,
      stageId: params.classroom.section.grade.stageId,
      academicYearId: params.scope.academicYearId,
      termId: params.scope.termId,
    },
    studentsCount: params.dataset.enrollments.length,
    ...presentDashboardSummaryParts(params.dataset),
    students: buildClassroomStudentRows(params.dataset),
  };
}

export function presentHeroMap(params: {
  scope: HeroDashboardScope;
  dataset: HeroMapDataset;
  studentId?: string | null;
}) {
  const progressByMission = groupBy(params.dataset.progress, (row) => row.missionId);
  const xpByProgressId = new Map(
    params.dataset.xpLedger.map((entry) => [entry.sourceId, entry]),
  );
  const badgeByStudentAndBadgeId = new Map(
    params.dataset.studentBadges.map((studentBadge) => [
      `${studentBadge.studentId}:${studentBadge.badgeId}`,
      studentBadge,
    ]),
  );

  return {
    scope: presentScope(params.scope),
    mode: params.studentId ? 'student' : 'aggregate',
    missions: params.dataset.missions.map((mission) => {
      const missionProgress = progressByMission.get(mission.id) ?? [];
      const aggregate = summarizeMissionProgressAggregate(missionProgress);
      const studentProgress = params.studentId
        ? buildStudentMissionProgressState({
            mission,
            progress: missionProgress.find(
              (row) => row.studentId === params.studentId,
            ),
            xpByProgressId,
            badgeByStudentAndBadgeId,
            studentId: params.studentId,
          })
        : undefined;

      return {
        missionId: mission.id,
        titleEn: mission.titleEn,
        titleAr: mission.titleAr,
        briefEn: mission.briefEn,
        briefAr: mission.briefAr,
        status: presentEnum(mission.status),
        requiredLevel: mission.requiredLevel,
        rewardXp: mission.rewardXp,
        badgeReward: mission.badgeReward
          ? presentBadgeSummary(mission.badgeReward)
          : null,
        positionX: mission.positionX,
        positionY: mission.positionY,
        sortOrder: mission.sortOrder,
        objectivesCount: mission.objectives.length,
        requiredObjectivesCount: mission.objectives.filter(
          (objective) => objective.isRequired,
        ).length,
        ...(params.studentId
          ? { studentProgress }
          : {
              completedCount: aggregate.completedCount,
              startedCount: aggregate.startedCount,
            }),
      };
    }),
  };
}

export function presentHeroBadgeSummary(params: {
  scope: HeroDashboardScope;
  dataset: HeroBadgeSummaryDataset;
  studentId?: string | null;
}) {
  const missionsUsingByBadgeId = countBy(
    params.dataset.missionsUsingBadges
      .map((mission) => mission.badgeRewardId)
      .filter((badgeId): badgeId is string => Boolean(badgeId)),
  );
  const earnedByBadgeId = groupBy(
    params.dataset.studentBadges,
    (studentBadge) => studentBadge.badgeId,
  );
  const studentBadgeByBadgeId = new Map(
    params.dataset.studentBadges
      .filter((studentBadge) => studentBadge.studentId === params.studentId)
      .map((studentBadge) => [studentBadge.badgeId, studentBadge]),
  );

  return {
    scope: presentScope(params.scope),
    summary: summarizeBadgeEarnings({
      badges: params.dataset.badges,
      studentBadges: params.dataset.studentBadges,
    }),
    badges: params.dataset.badges.map((badge) => {
      const studentBadge = studentBadgeByBadgeId.get(badge.id) ?? null;

      return {
        badgeId: badge.id,
        slug: badge.slug,
        nameEn: badge.nameEn,
        nameAr: badge.nameAr,
        isActive: badge.isActive,
        assetPath: badge.assetPath,
        fileId: badge.fileId,
        missionsUsingCount: missionsUsingByBadgeId.get(badge.id) ?? 0,
        earnedCount: earnedByBadgeId.get(badge.id)?.length ?? 0,
        ...(params.studentId
          ? {
              studentEarned: Boolean(studentBadge),
              studentBadgeId: studentBadge?.id ?? null,
              earnedAt: presentNullableDate(studentBadge?.earnedAt ?? null),
            }
          : {}),
      };
    }),
  };
}

function presentDashboardSummaryParts(dataset: HeroDashboardDataset) {
  const expectedProgressCount = dataset.missions.length * dataset.enrollments.length;
  const rewards = summarizeHeroRewards({
    xpLedger: dataset.xpLedger,
    studentBadges: dataset.studentBadges,
  });

  return {
    missions: summarizeHeroMissionStatuses(dataset.missions),
    progress: summarizeHeroProgressStatuses(
      dataset.progress,
      expectedProgressCount,
    ),
    objectives: {
      totalRequired: countRequiredObjectiveInstances(dataset),
      completedRequired: countCompletedRequiredObjectives(dataset.progress),
      averageProgressPercent: calculateAverageProgressPercent(dataset.progress),
    },
    rewards,
    events: summarizeHeroEventTypes(dataset.events),
    topStudents: buildHeroTopStudents({
      progress: dataset.progress.map((progress) => ({
        studentId: progress.studentId,
        student: progress.student,
        progressStatus: progress.status,
        progressPercent: progress.progressPercent,
      })),
      xpLedger: dataset.xpLedger.map((entry) => ({
        studentId: entry.studentId,
        student: entry.student,
        xpAmount: entry.amount,
      })),
      badges: dataset.studentBadges.map((badge) => ({
        studentId: badge.studentId,
        student: badge.student,
        badgeId: badge.badgeId,
      })),
      limit: 10,
    }),
    recentActivity: dataset.events.slice(0, 15).map((event) =>
      presentRecentActivity(event),
    ),
  };
}

function buildStudentMissionProgressState(params: {
  mission: HeroDashboardMissionRecord;
  progress?: HeroDashboardProgressRecord;
  xpByProgressId: Map<string, HeroDashboardXpLedgerRecord>;
  badgeByStudentAndBadgeId: Map<string, HeroDashboardStudentBadgeRecord>;
  studentId: string;
}) {
  const progress = params.progress ?? null;
  const ledger = progress
    ? params.xpByProgressId.get(progress.id) ??
      (progress.xpLedgerId ? params.xpByProgressId.get(progress.xpLedgerId) : null) ??
      null
    : null;
  const studentBadge = params.mission.badgeRewardId
    ? params.badgeByStudentAndBadgeId.get(
        `${params.studentId}:${params.mission.badgeRewardId}`,
      ) ?? null
    : null;
  const rewardState = deriveHeroMissionRewardState({
    mission: params.mission,
    progress,
    xpLedger: ledger,
    studentBadge,
  });

  return {
    progressId: progress?.id ?? null,
    status: progress ? presentEnum(progress.status) : 'not_started',
    progressPercent: progress?.progressPercent ?? 0,
    startedAt: presentNullableDate(progress?.startedAt ?? null),
    completedAt: presentNullableDate(progress?.completedAt ?? null),
    xpGranted: rewardState.xpGranted,
    xpLedgerId: rewardState.xpLedgerId,
    badgeAwarded: rewardState.badgeAwarded,
    studentBadgeId: rewardState.studentBadgeId,
  };
}

function summarizeMissionProgressAggregate(
  progress: HeroDashboardProgressRecord[],
) {
  return {
    startedCount: progress.filter(
      (row) => row.status !== HeroMissionProgressStatus.NOT_STARTED,
    ).length,
    completedCount: progress.filter(
      (row) => row.status === HeroMissionProgressStatus.COMPLETED,
    ).length,
  };
}

function buildClassroomStudentRows(dataset: HeroDashboardDataset) {
  const progressByStudent = groupBy(dataset.progress, (row) => row.studentId);
  const xpByStudent = sumBy(dataset.xpLedger, (row) => row.studentId, (row) => row.amount);
  const badgesByStudent = groupBy(dataset.studentBadges, (row) => row.studentId);

  return dataset.enrollments.map((enrollment) => {
    const progressRows = progressByStudent.get(enrollment.studentId) ?? [];
    const progressSummary = summarizeHeroProgressStatuses(
      progressRows,
      dataset.missions.length,
    );

    return {
      studentId: enrollment.studentId,
      student: presentStudent(enrollment.student),
      totalMissions: dataset.missions.length,
      completedMissions: progressSummary.completed,
      inProgressMissions: progressSummary.inProgress,
      totalHeroXp: xpByStudent.get(enrollment.studentId) ?? 0,
      badgesCount: badgesByStudent.get(enrollment.studentId)?.length ?? 0,
      averageProgressPercent: calculateAverageProgressPercent(progressRows),
    };
  });
}

function countRequiredObjectiveInstances(dataset: HeroDashboardDataset): number {
  const requiredObjectives = dataset.missions.reduce(
    (count, mission) =>
      count + mission.objectives.filter((objective) => objective.isRequired).length,
    0,
  );
  return requiredObjectives * dataset.enrollments.length;
}

function countCompletedRequiredObjectives(
  progressRows: HeroDashboardProgressRecord[],
): number {
  return progressRows.reduce(
    (count, progress) =>
      count +
      progress.objectiveProgress.filter(
        (objectiveProgress) =>
          objectiveProgress.completedAt &&
          objectiveProgress.objective.isRequired &&
          !objectiveProgress.objective.deletedAt,
      ).length,
    0,
  );
}

function presentRecentActivity(event: HeroDashboardEventRecord) {
  return {
    id: event.id,
    type: presentEnum(event.type),
    missionId: event.missionId,
    progressId: event.missionProgressId,
    objectiveId: event.objectiveId,
    studentId: event.studentId,
    xpLedgerId: event.xpLedgerId,
    badgeId: event.badgeId,
    occurredAt: event.occurredAt.toISOString(),
    actorUserId: event.actorUserId,
  };
}

function presentScope(scope: HeroDashboardScope) {
  return {
    academicYearId: scope.academicYearId,
    yearId: scope.yearId,
    termId: scope.termId,
    stageId: scope.stageId,
    gradeId: scope.gradeId,
    sectionId: scope.sectionId,
    classroomId: scope.classroomId,
    studentId: scope.studentId,
    subjectId: scope.subjectId,
  };
}

function presentStudent(
  student: HeroDashboardEnrollmentRecord['student'] | HeroDashboardXpLedgerRecord['student'],
) {
  return {
    id: student.id,
    firstName: student.firstName,
    lastName: student.lastName,
    name: `${student.firstName} ${student.lastName}`.trim(),
    nameAr: null,
    code: null,
    admissionNo: null,
  };
}

function presentBadgeSummary(badge: HeroDashboardMissionRecord['badgeReward']) {
  if (!badge) return null;

  return {
    id: badge.id,
    slug: badge.slug,
    nameEn: badge.nameEn,
    nameAr: badge.nameAr,
    descriptionEn: badge.descriptionEn,
    descriptionAr: badge.descriptionAr,
    assetPath: badge.assetPath,
    fileId: badge.fileId,
  };
}

function groupBy<T>(
  rows: T[],
  getKey: (row: T) => string,
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = getKey(row);
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  return grouped;
}

function countBy(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function sumBy<T>(
  rows: T[],
  getKey: (row: T) => string,
  getValue: (row: T) => number,
): Map<string, number> {
  const sums = new Map<string, number>();
  for (const row of rows) {
    const key = getKey(row);
    sums.set(key, (sums.get(key) ?? 0) + getValue(row));
  }
  return sums;
}

function presentEnum(value: string): string {
  return value.toLowerCase();
}

function presentNullableDate(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

function deriveName(nameAr: string, nameEn: string): string {
  return nameEn.trim().length > 0 ? nameEn : nameAr;
}
