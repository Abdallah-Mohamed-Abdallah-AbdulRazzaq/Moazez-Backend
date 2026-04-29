import { summarizeStudentHeroRewards } from '../domain/hero-journey-rewards-domain';
import type {
  HeroRewardProgressRecord,
  HeroRewardStudentRecord,
  HeroRewardXpLedgerRecord,
  HeroStudentBadgeRecord,
  StudentHeroRewardsRecord,
} from '../infrastructure/hero-journey-rewards.repository';

export function presentHeroMissionXpGrant(params: {
  progress: HeroRewardProgressRecord;
  ledger: HeroRewardXpLedgerRecord;
  idempotent: boolean;
}) {
  return {
    id: params.ledger.id,
    progressId: params.progress.id,
    missionId: params.progress.missionId,
    studentId: params.progress.studentId,
    enrollmentId: params.progress.enrollmentId,
    xpLedgerId: params.ledger.id,
    sourceType: presentEnum(params.ledger.sourceType),
    sourceId: params.ledger.sourceId,
    amount: params.ledger.amount,
    policyId: params.ledger.policyId,
    reason: params.ledger.reason,
    reasonAr: params.ledger.reasonAr,
    occurredAt: params.ledger.occurredAt.toISOString(),
    idempotent: params.idempotent,
  };
}

export function presentHeroMissionBadgeAward(params: {
  progress: HeroRewardProgressRecord;
  studentBadge: HeroStudentBadgeRecord;
  idempotent: boolean;
}) {
  return {
    id: params.studentBadge.id,
    progressId: params.progress.id,
    missionId: params.progress.missionId,
    studentId: params.progress.studentId,
    badgeId: params.studentBadge.badgeId,
    studentBadgeId: params.studentBadge.id,
    badge: presentBadgeSummary(params.studentBadge.badge),
    earnedAt: params.studentBadge.earnedAt.toISOString(),
    idempotent: params.idempotent,
  };
}

export function presentStudentHeroRewards(params: {
  student: HeroRewardStudentRecord;
  rewards: StudentHeroRewardsRecord;
  includeEvents: boolean;
}) {
  const ledgersByProgressId = new Map(
    params.rewards.xpLedger.map((ledger) => [ledger.sourceId, ledger]),
  );
  const badgesByBadgeId = new Map(
    params.rewards.allStudentBadges.map((studentBadge) => [
      studentBadge.badgeId,
      studentBadge,
    ]),
  );
  const missionRows = params.rewards.completedProgress.map((progress) => {
    const ledger =
      (progress.xpLedgerId
        ? params.rewards.xpLedger.find(
            (entry) => entry.id === progress.xpLedgerId,
          )
        : null) ?? ledgersByProgressId.get(progress.id) ?? null;
    const studentBadge = progress.mission.badgeRewardId
      ? badgesByBadgeId.get(progress.mission.badgeRewardId) ?? null
      : null;

    return {
      progressId: progress.id,
      missionId: progress.missionId,
      titleEn: progress.mission.titleEn,
      titleAr: progress.mission.titleAr,
      rewardXp: progress.mission.rewardXp,
      xpGranted: Boolean(ledger),
      xpLedgerId: ledger?.id ?? null,
      badgeRewardId: progress.mission.badgeRewardId,
      badgeAwarded: Boolean(studentBadge),
      studentBadgeId: studentBadge?.id ?? null,
      completedAt: presentNullableDate(progress.completedAt),
    };
  });
  const summary = summarizeStudentHeroRewards({
    totalHeroXp: params.rewards.xpLedger.reduce(
      (total, ledger) => total + ledger.amount,
      0,
    ),
    badgesCount: params.rewards.badges.length,
    missionRewardStates: missionRows,
  });

  return {
    student: presentStudentSummary(params.student),
    summary,
    xpLedger: params.rewards.xpLedger.map((ledger) =>
      presentHeroXpLedgerRow(ledger, params.rewards.completedProgress),
    ),
    badges: params.rewards.badges.map((studentBadge) =>
      presentStudentBadgeRow(studentBadge),
    ),
    missions: missionRows,
    ...(params.includeEvents
      ? {
          events: params.rewards.events.map((event) => ({
            id: event.id,
            type: presentEnum(event.type),
            missionId: event.missionId,
            progressId: event.missionProgressId,
            studentId: event.studentId,
            enrollmentId: event.enrollmentId,
            xpLedgerId: event.xpLedgerId,
            badgeId: event.badgeId,
            occurredAt: event.occurredAt.toISOString(),
            actorUserId: event.actorUserId,
          })),
        }
      : {}),
  };
}

function presentStudentSummary(student: HeroRewardStudentRecord) {
  return {
    id: student.id,
    firstName: student.firstName,
    lastName: student.lastName,
    nameAr: null,
    code: null,
    admissionNo: null,
  };
}

function presentHeroXpLedgerRow(
  ledger: HeroRewardXpLedgerRecord,
  progress: HeroRewardProgressRecord[],
) {
  const missionProgress = progress.find((item) => item.id === ledger.sourceId);

  return {
    id: ledger.id,
    progressId: ledger.sourceId,
    missionId: missionProgress?.missionId ?? null,
    sourceType: presentEnum(ledger.sourceType),
    sourceId: ledger.sourceId,
    amount: ledger.amount,
    policyId: ledger.policyId,
    reason: ledger.reason,
    reasonAr: ledger.reasonAr,
    occurredAt: ledger.occurredAt.toISOString(),
    actorUserId: ledger.actorUserId,
  };
}

function presentStudentBadgeRow(studentBadge: HeroStudentBadgeRecord) {
  return {
    id: studentBadge.id,
    studentBadgeId: studentBadge.id,
    badgeId: studentBadge.badgeId,
    missionId: studentBadge.missionId,
    progressId: studentBadge.missionProgressId,
    badge: presentBadgeSummary(studentBadge.badge),
    earnedAt: studentBadge.earnedAt.toISOString(),
  };
}

function presentBadgeSummary(badge: HeroStudentBadgeRecord['badge']) {
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

function presentEnum(value: string): string {
  return value.toLowerCase();
}

function presentNullableDate(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}
