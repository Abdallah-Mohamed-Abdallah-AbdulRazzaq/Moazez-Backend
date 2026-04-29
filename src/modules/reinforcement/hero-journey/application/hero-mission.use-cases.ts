import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireReinforcementScope } from '../../reinforcement-context';
import {
  assertMissionArchivable,
  assertMissionDeletable,
  assertMissionEditable,
  assertMissionPublishable,
} from '../domain/hero-journey-domain';
import {
  ArchiveHeroMissionDto,
  CreateHeroMissionDto,
  DeleteHeroResourceResponseDto,
  ListHeroMissionsQueryDto,
  UpdateHeroMissionDto,
} from '../dto/hero-journey.dto';
import { HeroJourneyRepository } from '../infrastructure/hero-journey.repository';
import {
  presentHeroMissionDetail,
  presentHeroMissionList,
} from '../presenters/hero-journey.presenter';
import {
  buildCreateMissionInput,
  buildMissionAuditEntry,
  buildUpdateMissionInput,
  normalizeMissionListFilters,
  protectedPublishedMissionChanges,
  validateBadgeReward,
} from './hero-journey-use-case.helpers';

@Injectable()
export class ListHeroMissionsUseCase {
  constructor(private readonly heroJourneyRepository: HeroJourneyRepository) {}

  async execute(query: ListHeroMissionsQueryDto) {
    requireReinforcementScope();
    const filters = normalizeMissionListFilters(query);
    const result = await this.heroJourneyRepository.listMissions(filters);

    return presentHeroMissionList({
      ...result,
      limit: filters.limit ?? null,
      offset: filters.offset ?? null,
    });
  }
}

@Injectable()
export class GetHeroMissionUseCase {
  constructor(private readonly heroJourneyRepository: HeroJourneyRepository) {}

  async execute(missionId: string) {
    requireReinforcementScope();
    const mission = await this.heroJourneyRepository.findMissionById(missionId);
    if (!mission) {
      throw new NotFoundDomainException('Hero mission not found', { missionId });
    }

    return presentHeroMissionDetail(mission);
  }
}

@Injectable()
export class CreateHeroMissionUseCase {
  constructor(
    private readonly heroJourneyRepository: HeroJourneyRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(command: CreateHeroMissionDto) {
    const scope = requireReinforcementScope();
    const input = await buildCreateMissionInput({
      scope,
      repository: this.heroJourneyRepository,
      command,
    });

    const mission =
      await this.heroJourneyRepository.createMissionWithObjectives(input);
    await this.authRepository.createAuditLog(
      buildMissionAuditEntry({
        scope,
        action: 'reinforcement.hero.mission.create',
        mission,
      }),
    );

    return presentHeroMissionDetail(mission);
  }
}

@Injectable()
export class UpdateHeroMissionUseCase {
  constructor(
    private readonly heroJourneyRepository: HeroJourneyRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(missionId: string, command: UpdateHeroMissionDto) {
    const scope = requireReinforcementScope();
    const existing = await this.heroJourneyRepository.findMissionById(missionId);
    if (!existing) {
      throw new NotFoundDomainException('Hero mission not found', { missionId });
    }

    assertMissionEditable({
      mission: existing,
      protectedChangedFields: protectedPublishedMissionChanges(command),
    });

    const input = await buildUpdateMissionInput({
      scope,
      repository: this.heroJourneyRepository,
      existing,
      command,
    });
    const mission =
      await this.heroJourneyRepository.updateMissionWithObjectives(input);
    await this.authRepository.createAuditLog(
      buildMissionAuditEntry({
        scope,
        action: 'reinforcement.hero.mission.update',
        mission,
        before: existing,
      }),
    );

    return presentHeroMissionDetail(mission);
  }
}

@Injectable()
export class PublishHeroMissionUseCase {
  constructor(
    private readonly heroJourneyRepository: HeroJourneyRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(missionId: string) {
    const scope = requireReinforcementScope();
    const existing = await this.heroJourneyRepository.findMissionById(missionId);
    if (!existing) {
      throw new NotFoundDomainException('Hero mission not found', { missionId });
    }

    assertMissionPublishable(existing);
    await validateBadgeReward(
      this.heroJourneyRepository,
      existing.badgeRewardId,
    );

    const mission = await this.heroJourneyRepository.publishMission({
      schoolId: scope.schoolId,
      missionId: existing.id,
      actorId: scope.actorId,
    });
    await this.authRepository.createAuditLog(
      buildMissionAuditEntry({
        scope,
        action: 'reinforcement.hero.mission.publish',
        mission,
        before: existing,
        afterMetadata: {
          beforeStatus: existing.status,
          afterStatus: mission.status,
        },
      }),
    );

    return presentHeroMissionDetail(mission);
  }
}

@Injectable()
export class ArchiveHeroMissionUseCase {
  constructor(
    private readonly heroJourneyRepository: HeroJourneyRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(missionId: string, command: ArchiveHeroMissionDto) {
    const scope = requireReinforcementScope();
    const existing = await this.heroJourneyRepository.findMissionById(missionId);
    if (!existing) {
      throw new NotFoundDomainException('Hero mission not found', { missionId });
    }

    assertMissionArchivable(existing);

    const mission = await this.heroJourneyRepository.archiveMission({
      schoolId: scope.schoolId,
      missionId: existing.id,
      actorId: scope.actorId,
    });
    await this.authRepository.createAuditLog(
      buildMissionAuditEntry({
        scope,
        action: 'reinforcement.hero.mission.archive',
        mission,
        before: existing,
        afterMetadata: {
          beforeStatus: existing.status,
          afterStatus: mission.status,
          reason: command.reason ?? null,
        },
      }),
    );

    return presentHeroMissionDetail(mission);
  }
}

@Injectable()
export class DeleteHeroMissionUseCase {
  constructor(
    private readonly heroJourneyRepository: HeroJourneyRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(missionId: string): Promise<DeleteHeroResourceResponseDto> {
    const scope = requireReinforcementScope();
    const existing = await this.heroJourneyRepository.findMissionById(missionId);
    if (!existing) {
      throw new NotFoundDomainException('Hero mission not found', { missionId });
    }

    const progressCount =
      await this.heroJourneyRepository.countMissionProgress(existing.id);
    assertMissionDeletable({ mission: existing, progressCount });

    const deleted = await this.heroJourneyRepository.softDeleteMissionAndObjectives({
      schoolId: scope.schoolId,
      missionId: existing.id,
    });
    await this.authRepository.createAuditLog(
      buildMissionAuditEntry({
        scope,
        action: 'reinforcement.hero.mission.delete',
        mission: deleted,
        before: existing,
      }),
    );

    return { ok: true };
  }
}
