import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  HeroJourneyEventType,
  Prisma,
  ReinforcementTargetScope,
  XpSourceType,
} from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireReinforcementScope, ReinforcementScope } from '../../reinforcement-context';
import {
  assertAllowedXpReason,
  assertXpCapsNotExceeded,
  assertXpCooldownNotViolated,
  buildEffectiveScopeCandidates,
  calculateXpCapUsage,
  getCalendarDayWindow,
  getCalendarWeekWindow,
  isUniqueConstraintError,
  selectEffectiveXpPolicy,
  XpResolvedScope,
} from '../../xp/domain/reinforcement-xp-domain';
import {
  assertHeroBadgeAwardable,
  assertHeroProgressRewardable,
  assertHeroXpAmountValid,
  buildHeroRewardEventPayload,
  buildHeroXpLedgerPayload,
  resolveHeroXpAmount,
} from '../domain/hero-journey-rewards-domain';
import {
  AwardHeroMissionBadgeDto,
  GetStudentHeroRewardsQueryDto,
  GrantHeroMissionXpDto,
} from '../dto/hero-journey-rewards.dto';
import {
  HeroJourneyRewardsRepository,
  HeroRewardProgressRecord,
  HeroRewardXpLedgerRecord,
  HeroRewardXpPolicyRecord,
  HeroStudentBadgeRecord,
} from '../infrastructure/hero-journey-rewards.repository';
import {
  presentHeroMissionBadgeAward,
  presentHeroMissionXpGrant,
  presentStudentHeroRewards,
} from '../presenters/hero-journey-rewards.presenter';

@Injectable()
export class GrantHeroMissionXpUseCase {
  constructor(
    private readonly rewardsRepository: HeroJourneyRewardsRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(progressId: string, command: GrantHeroMissionXpDto) {
    const scope = requireReinforcementScope();
    const progress = await this.findRewardProgress(progressId);
    assertHeroProgressRewardable(progress);

    const existing = await this.rewardsRepository.findExistingHeroXpLedger({
      progressId: progress.id,
      studentId: progress.studentId,
    });
    if (existing) {
      return presentHeroMissionXpGrant({
        progress,
        ledger: existing,
        idempotent: true,
      });
    }

    const amount = assertHeroXpAmountValid(
      resolveHeroXpAmount({
        explicitAmount: command.amount,
        missionRewardXp: progress.mission.rewardXp,
      }),
    );
    const now = new Date();
    const resolvedScope = scopeFromHeroProgress(progress);
    const policy = await findEffectiveHeroXpPolicyForScope({
      repository: this.rewardsRepository,
      schoolId: scope.schoolId,
      academicYearId: progress.academicYearId,
      termId: progress.termId,
      scope: resolvedScope,
      now,
    });
    const capUsage = await enforceHeroXpPolicyForGrant({
      repository: this.rewardsRepository,
      policy,
      academicYearId: progress.academicYearId,
      termId: progress.termId,
      studentId: progress.studentId,
      amount,
      reason: command.reason,
      sourceType: XpSourceType.HERO_MISSION,
      now,
    });

    const ledgerPayload = buildHeroXpLedgerPayload({
      schoolId: scope.schoolId,
      progress,
      policyId: policy?.id ?? null,
      amount,
      reason: command.reason,
      reasonAr: command.reasonAr,
      actorUserId: scope.actorId,
      occurredAt: now,
      metadata: command.metadata,
    });
    const eventPayload = buildHeroRewardEventPayload({
      schoolId: scope.schoolId,
      type: HeroJourneyEventType.XP_GRANTED,
      progress,
      sourceId: progress.id,
      actorUserId: scope.actorId,
      occurredAt: now,
      metadata: command.metadata,
    });

    try {
      const ledger = await this.rewardsRepository.createHeroXpLedgerAndEvent({
        schoolId: scope.schoolId,
        progressId: progress.id,
        ledger: {
          ...ledgerPayload,
          metadata: toJsonInput(ledgerPayload.metadata),
        },
        event: {
          ...eventPayload,
          metadata: toJsonInput(eventPayload.metadata),
        },
      });
      await this.authRepository.createAuditLog(
        buildHeroRewardAuditEntry({
          scope,
          action: 'reinforcement.hero.xp.grant',
          resourceType: 'xp_ledger',
          resourceId: ledger.id,
          after: {
            missionId: progress.missionId,
            progressId: progress.id,
            studentId: progress.studentId,
            enrollmentId: progress.enrollmentId,
            xpLedgerId: ledger.id,
            amount: ledger.amount,
            policyId: ledger.policyId,
            capUsage,
            idempotent: false,
          },
        }),
      );

      return presentHeroMissionXpGrant({
        progress,
        ledger,
        idempotent: false,
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const duplicate =
          await this.rewardsRepository.findExistingHeroXpLedger({
            progressId: progress.id,
            studentId: progress.studentId,
          });
        if (duplicate) {
          return presentHeroMissionXpGrant({
            progress,
            ledger: duplicate,
            idempotent: true,
          });
        }
      }

      throw error;
    }
  }

  private async findRewardProgress(
    progressId: string,
  ): Promise<HeroRewardProgressRecord> {
    const progress =
      await this.rewardsRepository.findProgressForReward(progressId);
    if (!progress) {
      throw new NotFoundDomainException('Hero mission progress not found', {
        progressId,
      });
    }

    return progress;
  }
}

@Injectable()
export class AwardHeroMissionBadgeUseCase {
  constructor(
    private readonly rewardsRepository: HeroJourneyRewardsRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(progressId: string, command: AwardHeroMissionBadgeDto) {
    const scope = requireReinforcementScope();
    const progress = await this.findRewardProgress(progressId);
    const badge = assertHeroBadgeAwardable(progress);

    const existing = await this.rewardsRepository.findExistingStudentBadge({
      studentId: progress.studentId,
      badgeId: badge.id,
    });
    if (existing) {
      return presentHeroMissionBadgeAward({
        progress,
        studentBadge: existing,
        idempotent: true,
      });
    }

    const now = new Date();
    const studentBadgePayload: Prisma.HeroStudentBadgeUncheckedCreateInput = {
      schoolId: scope.schoolId,
      studentId: progress.studentId,
      badgeId: badge.id,
      missionId: progress.missionId,
      missionProgressId: progress.id,
      earnedAt: now,
      metadata: toJsonInput(command.metadata),
    };
    const eventPayload = buildHeroRewardEventPayload({
      schoolId: scope.schoolId,
      type: HeroJourneyEventType.BADGE_AWARDED,
      progress,
      badgeId: badge.id,
      actorUserId: scope.actorId,
      occurredAt: now,
      metadata: command.metadata,
    });

    try {
      const studentBadge =
        await this.rewardsRepository.createHeroStudentBadgeAndEvent({
          schoolId: scope.schoolId,
          studentBadge: studentBadgePayload,
          event: {
            ...eventPayload,
            metadata: toJsonInput(eventPayload.metadata),
          },
        });
      await this.authRepository.createAuditLog(
        buildHeroRewardAuditEntry({
          scope,
          action: 'reinforcement.hero.badge.award',
          resourceType: 'hero_student_badge',
          resourceId: studentBadge.id,
          after: {
            missionId: progress.missionId,
            progressId: progress.id,
            studentId: progress.studentId,
            enrollmentId: progress.enrollmentId,
            badgeId: badge.id,
            studentBadgeId: studentBadge.id,
            idempotent: false,
          },
        }),
      );

      return presentHeroMissionBadgeAward({
        progress,
        studentBadge,
        idempotent: false,
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const duplicate =
          await this.rewardsRepository.findExistingStudentBadge({
            studentId: progress.studentId,
            badgeId: badge.id,
          });
        if (duplicate) {
          return presentHeroMissionBadgeAward({
            progress,
            studentBadge: duplicate,
            idempotent: true,
          });
        }
      }

      throw error;
    }
  }

  private async findRewardProgress(
    progressId: string,
  ): Promise<HeroRewardProgressRecord> {
    const progress =
      await this.rewardsRepository.findProgressForReward(progressId);
    if (!progress) {
      throw new NotFoundDomainException('Hero mission progress not found', {
        progressId,
      });
    }

    return progress;
  }
}

@Injectable()
export class GetStudentHeroRewardsUseCase {
  constructor(
    private readonly rewardsRepository: HeroJourneyRewardsRepository,
  ) {}

  async execute(studentId: string, query: GetStudentHeroRewardsQueryDto) {
    requireReinforcementScope();

    const student = await this.rewardsRepository.findStudent(studentId);
    if (!student) {
      throw new NotFoundDomainException('Student not found', { studentId });
    }

    const includeEvents = query.includeEvents ?? false;
    const rewards = await this.rewardsRepository.getStudentHeroRewards({
      studentId,
      academicYearId: query.academicYearId ?? query.yearId,
      termId: query.termId,
      includeEvents,
    });

    return presentStudentHeroRewards({
      student,
      rewards,
      includeEvents,
    });
  }
}

async function findEffectiveHeroXpPolicyForScope(params: {
  repository: HeroJourneyRewardsRepository;
  schoolId: string;
  academicYearId: string;
  termId: string;
  scope: XpResolvedScope;
  now: Date;
}): Promise<HeroRewardXpPolicyRecord | null> {
  const candidates = buildEffectiveScopeCandidates(params.scope, params.schoolId);
  const policies = await params.repository.findEffectiveXpPolicyCandidates({
    academicYearId: params.academicYearId,
    termId: params.termId,
    candidates,
    now: params.now,
  });

  return selectEffectiveXpPolicy(policies, candidates, params.now);
}

async function enforceHeroXpPolicyForGrant(params: {
  repository: HeroJourneyRewardsRepository;
  policy: HeroRewardXpPolicyRecord | null;
  academicYearId: string;
  termId: string;
  studentId: string;
  amount: number;
  reason?: string | null;
  sourceType: XpSourceType;
  now: Date;
}) {
  if (!params.policy) {
    return calculateXpCapUsage({
      dailyXp: 0,
      weeklyXp: 0,
      policy: null,
    });
  }

  const day = getCalendarDayWindow(params.now);
  const week = getCalendarWeekWindow(params.now);
  const [dailyXp, weeklyXp, latest] = await Promise.all([
    params.repository.sumXpForPeriod({
      academicYearId: params.academicYearId,
      termId: params.termId,
      studentId: params.studentId,
      from: day.from,
      to: day.to,
    }),
    params.repository.sumXpForPeriod({
      academicYearId: params.academicYearId,
      termId: params.termId,
      studentId: params.studentId,
      from: week.from,
      to: week.to,
    }),
    params.repository.findLatestXpForCooldown({
      academicYearId: params.academicYearId,
      termId: params.termId,
      studentId: params.studentId,
      beforeOrAt: params.now,
    }),
  ]);

  const usage = calculateXpCapUsage({
    dailyXp,
    weeklyXp,
    policy: params.policy,
  });
  assertAllowedXpReason({
    policy: params.policy,
    reason: params.reason,
    sourceType: params.sourceType,
  });
  assertXpCapsNotExceeded({ amount: params.amount, usage });
  assertXpCooldownNotViolated({
    policy: params.policy,
    latestOccurredAt: latest?.occurredAt ?? null,
    now: params.now,
  });

  return usage;
}

function scopeFromHeroProgress(progress: HeroRewardProgressRecord): XpResolvedScope {
  return {
    scopeType: ReinforcementTargetScope.STUDENT,
    scopeKey: progress.studentId,
    stageId: progress.enrollment.classroom.section.grade.stageId,
    gradeId: progress.enrollment.classroom.section.gradeId,
    sectionId: progress.enrollment.classroom.sectionId,
    classroomId: progress.enrollment.classroomId,
    studentId: progress.studentId,
  };
}

function buildHeroRewardAuditEntry(params: {
  scope: ReinforcementScope;
  action: string;
  resourceType: 'xp_ledger' | 'hero_student_badge';
  resourceId: string;
  after: Record<string, unknown>;
}) {
  return {
    actorId: params.scope.actorId,
    userType: params.scope.userType,
    organizationId: params.scope.organizationId,
    schoolId: params.scope.schoolId,
    module: 'reinforcement.hero',
    action: params.action,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    outcome: AuditOutcome.SUCCESS,
    after: params.after,
  };
}

function toJsonInput(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined ? undefined : (value as Prisma.InputJsonValue);
}
