import { HttpStatus } from '@nestjs/common';
import {
  HeroJourneyEventType,
  HeroMissionProgressStatus,
  HeroMissionStatus,
  XpSourceType,
} from '@prisma/client';
import {
  DomainException,
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import {
  assertXpGrantAmount,
  buildXpLedgerPayload,
} from '../../xp/domain/reinforcement-xp-domain';
import { normalizeHeroMissionStatus } from './hero-journey-domain';
import { normalizeHeroProgressStatus } from './hero-journey-progress-domain';

export interface HeroRewardMissionLike {
  id: string;
  academicYearId: string;
  termId: string;
  rewardXp: number;
  badgeRewardId?: string | null;
  status: HeroMissionStatus | string;
  archivedAt?: Date | null;
  deletedAt?: Date | null;
  badgeReward?: HeroRewardBadgeLike | null;
}

export interface HeroRewardProgressLike {
  id: string;
  missionId: string;
  studentId: string;
  enrollmentId: string;
  academicYearId: string;
  termId: string;
  status: HeroMissionProgressStatus | string;
  completedAt?: Date | null;
  mission: HeroRewardMissionLike;
}

export interface HeroRewardBadgeLike {
  id: string;
  isActive: boolean;
  deletedAt?: Date | null;
}

export interface HeroRewardLedgerLike {
  id: string;
  sourceType: XpSourceType | string;
  sourceId: string;
  amount: number;
}

export interface HeroRewardStudentBadgeLike {
  id: string;
  badgeId: string;
}

export class HeroMissionXpAlreadyGrantedException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'reinforcement.hero.xp.duplicate_grant',
      message: 'Hero mission XP has already been granted',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export function assertHeroProgressRewardable(
  progress: HeroRewardProgressLike,
): void {
  const progressStatus = normalizeHeroProgressStatus(progress.status);
  if (progressStatus !== HeroMissionProgressStatus.COMPLETED) {
    throw new ValidationDomainException(
      'Hero mission progress must be completed before rewards can be granted',
      {
        progressId: progress.id,
        status: progressStatus,
      },
    );
  }

  assertMissionRewardableForCompletedProgress({
    mission: progress.mission,
    completedAt: progress.completedAt ?? null,
  });
}

export function resolveHeroXpAmount(params: {
  explicitAmount?: number | null;
  missionRewardXp: number;
}): number {
  return params.explicitAmount ?? params.missionRewardXp;
}

export function assertHeroXpAmountValid(amount: unknown): number {
  return assertXpGrantAmount(amount);
}

export function assertNoDuplicateHeroXpGrant(
  existing: HeroRewardLedgerLike | null | undefined,
): void {
  if (existing) {
    throw new HeroMissionXpAlreadyGrantedException({
      xpLedgerId: existing.id,
      sourceType: existing.sourceType,
      sourceId: existing.sourceId,
    });
  }
}

export function assertHeroBadgeAwardable(
  progress: HeroRewardProgressLike,
): HeroRewardBadgeLike {
  assertHeroProgressRewardable(progress);

  if (!progress.mission.badgeRewardId) {
    throw new ValidationDomainException(
      'Hero mission does not have a badge reward configured',
      {
        missionId: progress.missionId,
        progressId: progress.id,
        field: 'badgeRewardId',
      },
    );
  }

  const badge = progress.mission.badgeReward;
  if (
    !badge ||
    badge.id !== progress.mission.badgeRewardId ||
    !badge.isActive ||
    badge.deletedAt
  ) {
    throw new NotFoundDomainException('Hero badge reward not found', {
      badgeRewardId: progress.mission.badgeRewardId,
      missionId: progress.missionId,
    });
  }

  return badge;
}

export function buildHeroXpLedgerPayload(params: {
  schoolId: string;
  progress: HeroRewardProgressLike;
  policyId?: string | null;
  amount: number;
  reason?: string | null;
  reasonAr?: string | null;
  actorUserId?: string | null;
  occurredAt: Date;
  metadata?: unknown;
}) {
  return buildXpLedgerPayload({
    schoolId: params.schoolId,
    academicYearId: params.progress.academicYearId,
    termId: params.progress.termId,
    studentId: params.progress.studentId,
    enrollmentId: params.progress.enrollmentId,
    assignmentId: null,
    policyId: params.policyId ?? null,
    sourceType: XpSourceType.HERO_MISSION,
    sourceId: params.progress.id,
    amount: params.amount,
    reason: params.reason,
    reasonAr: params.reasonAr,
    actorUserId: params.actorUserId ?? null,
    occurredAt: params.occurredAt,
    metadata: params.metadata,
  });
}

export function buildHeroRewardEventPayload(params: {
  schoolId: string;
  type: HeroJourneyEventType;
  progress: HeroRewardProgressLike;
  xpLedgerId?: string | null;
  badgeId?: string | null;
  sourceId?: string | null;
  actorUserId?: string | null;
  occurredAt: Date;
  metadata?: unknown;
}) {
  return {
    schoolId: params.schoolId,
    missionId: params.progress.missionId,
    missionProgressId: params.progress.id,
    studentId: params.progress.studentId,
    enrollmentId: params.progress.enrollmentId,
    xpLedgerId: params.xpLedgerId ?? null,
    badgeId: params.badgeId ?? null,
    type: params.type,
    sourceId: params.sourceId ?? null,
    actorUserId: params.actorUserId ?? null,
    occurredAt: params.occurredAt,
    metadata: params.metadata,
  };
}

export function deriveHeroRewardState(params: {
  progress: HeroRewardProgressLike;
  ledger?: HeroRewardLedgerLike | null;
  studentBadge?: HeroRewardStudentBadgeLike | null;
}) {
  return {
    progressId: params.progress.id,
    missionId: params.progress.missionId,
    rewardXp: params.progress.mission.rewardXp,
    xpGranted: Boolean(params.progress && params.ledger),
    xpLedgerId: params.ledger?.id ?? null,
    badgeRewardId: params.progress.mission.badgeRewardId ?? null,
    badgeAwarded: Boolean(params.studentBadge),
    studentBadgeId: params.studentBadge?.id ?? null,
  };
}

export function summarizeStudentHeroRewards(params: {
  totalHeroXp: number;
  badgesCount: number;
  missionRewardStates: Array<{
    xpGranted: boolean;
    badgeAwarded: boolean;
  }>;
}) {
  return {
    totalHeroXp: params.totalHeroXp,
    badgesCount: params.badgesCount,
    completedMissions: params.missionRewardStates.length,
    xpGrantedMissions: params.missionRewardStates.filter(
      (state) => state.xpGranted,
    ).length,
    badgeAwardedMissions: params.missionRewardStates.filter(
      (state) => state.badgeAwarded,
    ).length,
  };
}

function assertMissionRewardableForCompletedProgress(params: {
  mission: HeroRewardMissionLike;
  completedAt: Date | null;
}): void {
  if (params.mission.deletedAt) {
    throw new NotFoundDomainException('Hero mission not found', {
      missionId: params.mission.id,
    });
  }

  const missionStatus = normalizeHeroMissionStatus(params.mission.status);
  if (missionStatus === HeroMissionStatus.PUBLISHED) return;

  if (
    missionStatus === HeroMissionStatus.ARCHIVED &&
    params.mission.archivedAt &&
    params.completedAt &&
    params.completedAt.getTime() <= params.mission.archivedAt.getTime()
  ) {
    return;
  }

  if (missionStatus === HeroMissionStatus.ARCHIVED) {
    throw new DomainException({
      code: 'reinforcement.hero.mission.archived',
      message: 'Hero mission is archived',
      httpStatus: HttpStatus.CONFLICT,
      details: { missionId: params.mission.id },
    });
  }

  throw new DomainException({
    code: 'reinforcement.hero.mission.not_published',
    message: 'Hero mission must be published first',
    httpStatus: HttpStatus.CONFLICT,
    details: {
      missionId: params.mission.id,
      status: missionStatus,
    },
  });
}
