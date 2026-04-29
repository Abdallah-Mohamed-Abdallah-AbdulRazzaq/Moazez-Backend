import {
  HeroBadgeRecord,
  HeroMissionRecord,
  HeroMissionObjectiveRecord,
} from '../infrastructure/hero-journey.repository';

export function presentHeroBadge(badge: HeroBadgeRecord) {
  return {
    id: badge.id,
    slug: badge.slug,
    nameEn: badge.nameEn,
    nameAr: badge.nameAr,
    descriptionEn: badge.descriptionEn,
    descriptionAr: badge.descriptionAr,
    assetPath: badge.assetPath,
    fileId: badge.fileId,
    sortOrder: badge.sortOrder,
    isActive: badge.isActive,
    createdAt: badge.createdAt.toISOString(),
    updatedAt: badge.updatedAt.toISOString(),
  };
}

export function presentHeroBadges(badges: HeroBadgeRecord[]) {
  return {
    items: badges.map((badge) => presentHeroBadge(badge)),
  };
}

export function presentHeroMissionList(params: {
  items: HeroMissionRecord[];
  total: number;
  limit?: number | null;
  offset?: number | null;
}) {
  return {
    items: params.items.map((mission) => presentHeroMissionRow(mission)),
    total: params.total,
    limit: params.limit ?? null,
    offset: params.offset ?? null,
  };
}

export function presentHeroMissionRow(mission: HeroMissionRecord) {
  return {
    id: mission.id,
    academicYearId: mission.academicYearId,
    yearId: mission.academicYearId,
    termId: mission.termId,
    stageId: mission.stageId,
    subjectId: mission.subjectId,
    linkedAssessmentId: mission.linkedAssessmentId,
    linkedLessonRef: mission.linkedLessonRef,
    titleEn: mission.titleEn,
    titleAr: mission.titleAr,
    briefEn: mission.briefEn,
    briefAr: mission.briefAr,
    requiredLevel: mission.requiredLevel,
    rewardXp: mission.rewardXp,
    status: presentEnum(mission.status),
    positionX: mission.positionX,
    positionY: mission.positionY,
    sortOrder: mission.sortOrder,
    publishedAt: presentNullableDate(mission.publishedAt),
    archivedAt: presentNullableDate(mission.archivedAt),
    badgeReward: mission.badgeReward
      ? presentHeroBadgeSummary(mission.badgeReward)
      : null,
    objectivesCount: mission.objectives.length,
    createdAt: mission.createdAt.toISOString(),
    updatedAt: mission.updatedAt.toISOString(),
  };
}

export function presentHeroMissionDetail(mission: HeroMissionRecord) {
  return {
    ...presentHeroMissionRow(mission),
    publishedById: mission.publishedById,
    archivedById: mission.archivedById,
    createdById: mission.createdById,
    objectives: mission.objectives.map((objective) =>
      presentHeroMissionObjective(objective),
    ),
  };
}

export function presentHeroMissionObjective(
  objective: HeroMissionObjectiveRecord,
) {
  return {
    id: objective.id,
    type: presentEnum(objective.type),
    titleEn: objective.titleEn,
    titleAr: objective.titleAr,
    subtitleEn: objective.subtitleEn,
    subtitleAr: objective.subtitleAr,
    linkedAssessmentId: objective.linkedAssessmentId,
    linkedLessonRef: objective.linkedLessonRef,
    sortOrder: objective.sortOrder,
    isRequired: objective.isRequired,
  };
}

export function presentEnum(value: string): string {
  return value.toLowerCase();
}

function presentHeroBadgeSummary(
  badge: NonNullable<HeroMissionRecord['badgeReward']>,
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

function presentNullableDate(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}
