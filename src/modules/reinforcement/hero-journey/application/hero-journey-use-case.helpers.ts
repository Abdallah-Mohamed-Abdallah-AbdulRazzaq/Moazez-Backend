import {
  AuditOutcome,
  HeroMissionStatus,
  Prisma,
} from '@prisma/client';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { FilesNotFoundException } from '../../../files/uploads/domain/file-upload.exceptions';
import { ReinforcementScope } from '../../reinforcement-context';
import {
  HeroBadgeDuplicateSlugException,
  assertBadgeNamePresent,
  assertMissionTitlePresent,
  assertRequiredLevelValid,
  assertRewardXpValid,
  hasOwn,
  isUniqueConstraintError,
  normalizeBadgeSlug,
  normalizeHeroMissionStatus,
  normalizeMissionObjectives,
  normalizeNullableText,
} from '../domain/hero-journey-domain';
import {
  CreateHeroBadgeDto,
  CreateHeroMissionDto,
  ListHeroBadgesQueryDto,
  ListHeroMissionsQueryDto,
  UpdateHeroBadgeDto,
  UpdateHeroMissionDto,
} from '../dto/hero-journey.dto';
import {
  HeroBadgeRecord,
  HeroJourneyRepository,
  HeroMissionRecord,
  HeroTermRecord,
  ListHeroBadgesFilters,
  ListHeroMissionsFilters,
  UpdateHeroMissionWithObjectivesInput,
} from '../infrastructure/hero-journey.repository';

export function normalizeBadgeListFilters(
  query: ListHeroBadgesQueryDto,
): ListHeroBadgesFilters {
  return {
    ...(query.search ? { search: query.search } : {}),
    ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    includeDeleted: query.includeDeleted ?? false,
  };
}

export function normalizeMissionListFilters(
  query: ListHeroMissionsQueryDto,
): ListHeroMissionsFilters {
  return {
    ...(query.academicYearId ?? query.yearId
      ? { academicYearId: query.academicYearId ?? query.yearId }
      : {}),
    ...(query.termId ? { termId: query.termId } : {}),
    ...(query.stageId ? { stageId: query.stageId } : {}),
    ...(query.subjectId ? { subjectId: query.subjectId } : {}),
    ...(query.status ? { status: normalizeHeroMissionStatus(query.status) } : {}),
    ...(query.search ? { search: query.search } : {}),
    includeArchived: query.includeArchived ?? false,
    includeDeleted: query.includeDeleted ?? false,
    ...(query.limit ? { limit: query.limit } : {}),
    ...(query.offset !== undefined ? { offset: query.offset } : {}),
  };
}

export function resolveHeroAcademicYearId(input: {
  academicYearId?: string | null;
  yearId?: string | null;
}): string {
  const academicYearId = input.academicYearId ?? input.yearId;
  if (!academicYearId) {
    throw new ValidationDomainException('Academic year is required', {
      field: 'academicYearId',
      aliases: ['yearId'],
    });
  }

  return academicYearId;
}

export async function validateHeroAcademicContext(params: {
  repository: HeroJourneyRepository;
  academicYearId: string;
  termId: string;
}): Promise<{ term: HeroTermRecord }> {
  const [academicYear, term] = await Promise.all([
    params.repository.findAcademicYear(params.academicYearId),
    params.repository.findTerm(params.termId),
  ]);

  if (!academicYear) {
    throw new NotFoundDomainException('Academic year not found', {
      academicYearId: params.academicYearId,
    });
  }

  if (!term || term.academicYearId !== params.academicYearId) {
    throw new NotFoundDomainException('Term not found', {
      academicYearId: params.academicYearId,
      termId: params.termId,
    });
  }

  return { term };
}

export async function validateStage(
  repository: HeroJourneyRepository,
  stageId: string,
): Promise<void> {
  const stage = await repository.findStage(stageId);
  if (!stage) {
    throw new NotFoundDomainException('Stage not found', { stageId });
  }
}

export async function validateSubject(
  repository: HeroJourneyRepository,
  subjectId?: string | null,
): Promise<void> {
  if (!subjectId) return;
  const subject = await repository.findSubject(subjectId);
  if (!subject) {
    throw new NotFoundDomainException('Subject not found', { subjectId });
  }
}

export async function validateLinkedAssessment(
  repository: HeroJourneyRepository,
  assessmentId?: string | null,
): Promise<void> {
  if (!assessmentId) return;
  const assessment = await repository.findAssessment(assessmentId);
  if (!assessment) {
    throw new NotFoundDomainException('Assessment not found', { assessmentId });
  }
}

export async function validateObjectiveLinkedAssessments(
  repository: HeroJourneyRepository,
  assessmentIds: Array<string | null>,
): Promise<void> {
  const uniqueIds = [...new Set(assessmentIds.filter(Boolean) as string[])];
  for (const assessmentId of uniqueIds) {
    await validateLinkedAssessment(repository, assessmentId);
  }
}

export async function validateBadgeReward(
  repository: HeroJourneyRepository,
  badgeRewardId?: string | null,
): Promise<void> {
  if (!badgeRewardId) return;
  const badge = await repository.findBadgeById(badgeRewardId);
  if (!badge || !badge.isActive) {
    throw new NotFoundDomainException('Hero badge reward not found', {
      badgeRewardId,
    });
  }
}

export async function validateFileReference(
  repository: HeroJourneyRepository,
  fileId?: string | null,
): Promise<void> {
  if (!fileId) return;
  const file = await repository.findFile(fileId);
  if (!file) {
    throw new FilesNotFoundException({ fileId });
  }
}

export function buildCreateBadgeData(params: {
  scope: ReinforcementScope;
  command: CreateHeroBadgeDto;
}): Prisma.HeroBadgeUncheckedCreateInput {
  const slug = normalizeBadgeSlug(params.command.slug);
  const nameEn = normalizeNullableText(params.command.nameEn);
  const nameAr = normalizeNullableText(params.command.nameAr);
  assertBadgeNamePresent({ nameEn, nameAr });

  return {
    schoolId: params.scope.schoolId,
    slug,
    nameEn,
    nameAr,
    descriptionEn: normalizeNullableText(params.command.descriptionEn),
    descriptionAr: normalizeNullableText(params.command.descriptionAr),
    assetPath: normalizeNullableText(params.command.assetPath),
    fileId: params.command.fileId ?? null,
    sortOrder: params.command.sortOrder ?? 0,
    isActive: params.command.isActive ?? true,
    metadata: toNullableJson(params.command.metadata),
  };
}

export function buildUpdateBadgeData(params: {
  existing: HeroBadgeRecord;
  command: UpdateHeroBadgeDto;
}): Prisma.HeroBadgeUncheckedUpdateManyInput {
  const data: Prisma.HeroBadgeUncheckedUpdateManyInput = {};
  const nextNameEn = hasOwn(params.command, 'nameEn')
    ? normalizeNullableText(params.command.nameEn)
    : params.existing.nameEn;
  const nextNameAr = hasOwn(params.command, 'nameAr')
    ? normalizeNullableText(params.command.nameAr)
    : params.existing.nameAr;

  assertBadgeNamePresent({ nameEn: nextNameEn, nameAr: nextNameAr });

  if (hasOwn(params.command, 'slug')) {
    data.slug = normalizeBadgeSlug(params.command.slug);
  }
  if (hasOwn(params.command, 'nameEn')) data.nameEn = nextNameEn;
  if (hasOwn(params.command, 'nameAr')) data.nameAr = nextNameAr;
  if (hasOwn(params.command, 'descriptionEn')) {
    data.descriptionEn = normalizeNullableText(params.command.descriptionEn);
  }
  if (hasOwn(params.command, 'descriptionAr')) {
    data.descriptionAr = normalizeNullableText(params.command.descriptionAr);
  }
  if (hasOwn(params.command, 'assetPath')) {
    data.assetPath = normalizeNullableText(params.command.assetPath);
  }
  if (hasOwn(params.command, 'fileId')) data.fileId = params.command.fileId ?? null;
  if (params.command.sortOrder !== undefined && params.command.sortOrder !== null) {
    data.sortOrder = params.command.sortOrder;
  }
  if (params.command.isActive !== undefined && params.command.isActive !== null) {
    data.isActive = params.command.isActive;
  }
  if (hasOwn(params.command, 'metadata')) {
    data.metadata = toNullableJson(params.command.metadata);
  }

  return data;
}

export async function buildCreateMissionInput(params: {
  scope: ReinforcementScope;
  repository: HeroJourneyRepository;
  command: CreateHeroMissionDto;
}) {
  const academicYearId = resolveHeroAcademicYearId(params.command);
  await validateHeroAcademicContext({
    repository: params.repository,
    academicYearId,
    termId: params.command.termId,
  });
  await validateStage(params.repository, params.command.stageId);
  await validateSubject(params.repository, params.command.subjectId);
  await validateLinkedAssessment(
    params.repository,
    params.command.linkedAssessmentId,
  );
  await validateBadgeReward(params.repository, params.command.badgeRewardId);

  const titleEn = normalizeNullableText(params.command.titleEn);
  const titleAr = normalizeNullableText(params.command.titleAr);
  assertMissionTitlePresent({ titleEn, titleAr });

  const objectives = normalizeMissionObjectives({
    objectives: params.command.objectives,
    requireNonEmpty: true,
  });
  await validateObjectiveLinkedAssessments(
    params.repository,
    objectives.map((objective) => objective.linkedAssessmentId),
  );

  return {
    schoolId: params.scope.schoolId,
    mission: {
      academicYearId,
      termId: params.command.termId,
      stageId: params.command.stageId,
      subjectId: params.command.subjectId ?? null,
      linkedAssessmentId: params.command.linkedAssessmentId ?? null,
      linkedLessonRef: normalizeNullableText(params.command.linkedLessonRef),
      titleEn,
      titleAr,
      briefEn: normalizeNullableText(params.command.briefEn),
      briefAr: normalizeNullableText(params.command.briefAr),
      requiredLevel: assertRequiredLevelValid(params.command.requiredLevel ?? 1),
      rewardXp: assertRewardXpValid(params.command.rewardXp ?? 0),
      badgeRewardId: params.command.badgeRewardId ?? null,
      status: HeroMissionStatus.DRAFT,
      positionX: params.command.positionX ?? null,
      positionY: params.command.positionY ?? null,
      sortOrder: params.command.sortOrder ?? 0,
      createdById: params.scope.actorId,
      metadata: toNullableJson(params.command.metadata),
    },
    objectives,
  };
}

export async function buildUpdateMissionInput(params: {
  scope: ReinforcementScope;
  repository: HeroJourneyRepository;
  existing: HeroMissionRecord;
  command: UpdateHeroMissionDto;
}): Promise<UpdateHeroMissionWithObjectivesInput> {
  const data: Prisma.HeroMissionUncheckedUpdateManyInput = {};

  const nextAcademicYearId =
    params.command.academicYearId ??
    params.command.yearId ??
    params.existing.academicYearId;
  const nextTermId = params.command.termId ?? params.existing.termId;

  if (hasOwn(params.command, 'academicYearId') || hasOwn(params.command, 'yearId')) {
    data.academicYearId = nextAcademicYearId;
  }
  if (hasOwn(params.command, 'termId')) data.termId = nextTermId;
  if (hasOwn(params.command, 'stageId')) data.stageId = params.command.stageId;
  if (hasOwn(params.command, 'subjectId')) {
    data.subjectId = params.command.subjectId ?? null;
  }
  if (hasOwn(params.command, 'linkedAssessmentId')) {
    data.linkedAssessmentId = params.command.linkedAssessmentId ?? null;
  }
  if (hasOwn(params.command, 'linkedLessonRef')) {
    data.linkedLessonRef = normalizeNullableText(params.command.linkedLessonRef);
  }

  const nextTitleEn = hasOwn(params.command, 'titleEn')
    ? normalizeNullableText(params.command.titleEn)
    : params.existing.titleEn;
  const nextTitleAr = hasOwn(params.command, 'titleAr')
    ? normalizeNullableText(params.command.titleAr)
    : params.existing.titleAr;
  assertMissionTitlePresent({ titleEn: nextTitleEn, titleAr: nextTitleAr });
  if (hasOwn(params.command, 'titleEn')) data.titleEn = nextTitleEn;
  if (hasOwn(params.command, 'titleAr')) data.titleAr = nextTitleAr;

  if (hasOwn(params.command, 'briefEn')) {
    data.briefEn = normalizeNullableText(params.command.briefEn);
  }
  if (hasOwn(params.command, 'briefAr')) {
    data.briefAr = normalizeNullableText(params.command.briefAr);
  }
  if (params.command.requiredLevel !== undefined) {
    data.requiredLevel = assertRequiredLevelValid(params.command.requiredLevel);
  }
  if (params.command.rewardXp !== undefined) {
    data.rewardXp = assertRewardXpValid(params.command.rewardXp);
  }
  if (hasOwn(params.command, 'badgeRewardId')) {
    data.badgeRewardId = params.command.badgeRewardId ?? null;
  }
  if (hasOwn(params.command, 'positionX')) {
    data.positionX = params.command.positionX ?? null;
  }
  if (hasOwn(params.command, 'positionY')) {
    data.positionY = params.command.positionY ?? null;
  }
  if (params.command.sortOrder !== undefined && params.command.sortOrder !== null) {
    data.sortOrder = params.command.sortOrder;
  }
  if (hasOwn(params.command, 'metadata')) {
    data.metadata = toNullableJson(params.command.metadata);
  }

  if (
    hasOwn(params.command, 'academicYearId') ||
    hasOwn(params.command, 'yearId') ||
    hasOwn(params.command, 'termId')
  ) {
    await validateHeroAcademicContext({
      repository: params.repository,
      academicYearId: nextAcademicYearId,
      termId: nextTermId,
    });
  }
  if (hasOwn(params.command, 'stageId') && params.command.stageId) {
    await validateStage(params.repository, params.command.stageId);
  }
  if (hasOwn(params.command, 'subjectId')) {
    await validateSubject(params.repository, params.command.subjectId);
  }
  if (hasOwn(params.command, 'linkedAssessmentId')) {
    await validateLinkedAssessment(
      params.repository,
      params.command.linkedAssessmentId,
    );
  }
  if (hasOwn(params.command, 'badgeRewardId')) {
    await validateBadgeReward(params.repository, params.command.badgeRewardId);
  }

  const objectives = hasOwn(params.command, 'objectives')
    ? normalizeMissionObjectives({
        objectives: params.command.objectives ?? [],
      })
    : undefined;

  if (objectives) {
    await validateObjectiveLinkedAssessments(
      params.repository,
      objectives.map((objective) => objective.linkedAssessmentId),
    );
  }

  return {
    schoolId: params.scope.schoolId,
    missionId: params.existing.id,
    mission: data,
    objectives,
  };
}

export function protectedPublishedMissionChanges(
  command: UpdateHeroMissionDto,
): string[] {
  const protectedFields = [
    'academicYearId',
    'yearId',
    'termId',
    'stageId',
    'subjectId',
    'linkedAssessmentId',
    'linkedLessonRef',
    'requiredLevel',
    'rewardXp',
    'badgeRewardId',
    'objectives',
  ];

  return protectedFields.filter((field) => hasOwn(command, field));
}

export function translateBadgeDuplicate(error: unknown): never {
  if (isUniqueConstraintError(error)) {
    throw new HeroBadgeDuplicateSlugException();
  }

  throw error;
}

export function buildBadgeAuditEntry(params: {
  scope: ReinforcementScope;
  action: string;
  badge: HeroBadgeRecord;
  before?: HeroBadgeRecord | null;
}) {
  const entry = {
    actorId: params.scope.actorId,
    userType: params.scope.userType,
    organizationId: params.scope.organizationId,
    schoolId: params.scope.schoolId,
    module: 'reinforcement.hero',
    action: params.action,
    resourceType: 'hero_badge',
    resourceId: params.badge.id,
    outcome: AuditOutcome.SUCCESS,
    after: summarizeBadgeForAudit(params.badge),
  };

  return params.before
    ? { ...entry, before: summarizeBadgeForAudit(params.before) }
    : entry;
}

export function buildMissionAuditEntry(params: {
  scope: ReinforcementScope;
  action: string;
  mission: HeroMissionRecord;
  before?: HeroMissionRecord | null;
  afterMetadata?: Record<string, unknown>;
}) {
  const entry = {
    actorId: params.scope.actorId,
    userType: params.scope.userType,
    organizationId: params.scope.organizationId,
    schoolId: params.scope.schoolId,
    module: 'reinforcement.hero',
    action: params.action,
    resourceType: 'hero_mission',
    resourceId: params.mission.id,
    outcome: AuditOutcome.SUCCESS,
    after: {
      ...summarizeMissionForAudit(params.mission),
      ...(params.afterMetadata ?? {}),
    },
  };

  return params.before
    ? { ...entry, before: summarizeMissionForAudit(params.before) }
    : entry;
}

export function summarizeBadgeForAudit(badge: HeroBadgeRecord) {
  return {
    slug: badge.slug,
    isActive: badge.isActive,
    fileId: badge.fileId,
    sortOrder: badge.sortOrder,
  };
}

export function summarizeMissionForAudit(mission: HeroMissionRecord) {
  return {
    status: mission.status,
    academicYearId: mission.academicYearId,
    termId: mission.termId,
    stageId: mission.stageId,
    subjectId: mission.subjectId,
    rewardXp: mission.rewardXp,
    badgeRewardId: mission.badgeRewardId,
    objectiveCount: mission.objectives.length,
  };
}

function toNullableJson(
  value: unknown,
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}
