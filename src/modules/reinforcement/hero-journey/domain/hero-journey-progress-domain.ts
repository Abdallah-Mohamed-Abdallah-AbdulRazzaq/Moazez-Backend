import { HttpStatus } from '@nestjs/common';
import {
  HeroJourneyEventType,
  HeroMissionProgressStatus,
  HeroMissionStatus,
} from '@prisma/client';
import {
  DomainException,
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { normalizeHeroMissionStatus } from './hero-journey-domain';

type MissionStateLike = {
  id: string;
  status: HeroMissionStatus | string;
  archivedAt?: Date | null;
  deletedAt?: Date | null;
};

type ProgressStateLike = {
  id: string;
  status: HeroMissionProgressStatus | string;
};

type ObjectiveStateLike = {
  id: string;
  missionId: string;
  deletedAt?: Date | null;
};

type EnrollmentStageLike = {
  id: string;
  academicYearId: string;
  termId?: string | null;
  classroom: {
    section: {
      grade: {
        stageId: string;
      };
    };
  };
};

type MissionAcademicLike = {
  id: string;
  academicYearId: string;
  termId: string;
  stageId: string;
};

type ActiveObjectiveLike = {
  id: string;
  isRequired: boolean;
  deletedAt?: Date | null;
};

type CompletedObjectiveLike = {
  objectiveId: string;
  completedAt?: Date | null;
};

const PROGRESS_STATUS_ALIASES: Record<string, HeroMissionProgressStatus> = {
  not_started: HeroMissionProgressStatus.NOT_STARTED,
  in_progress: HeroMissionProgressStatus.IN_PROGRESS,
  completed: HeroMissionProgressStatus.COMPLETED,
  cancelled: HeroMissionProgressStatus.CANCELLED,
};

export class HeroMissionNotPublishedException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'reinforcement.hero.mission.not_published',
      message: 'Hero mission must be published first',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class HeroProgressAlreadyCompletedException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'reinforcement.hero.progress.already_completed',
      message: 'Hero mission progress is already completed',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class HeroProgressObjectiveNotCompletedException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'reinforcement.hero.progress.objective_not_completed',
      message: 'Required Hero mission objective is not completed',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class HeroProgressInvalidStatusException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'validation.failed',
      message: 'Hero mission progress status is invalid for this action',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export function normalizeHeroProgressStatus(
  input: HeroMissionProgressStatus | string | null | undefined,
): HeroMissionProgressStatus {
  if (!input) {
    throw new ValidationDomainException('Progress status is required', {
      field: 'status',
    });
  }

  const normalized = String(input).trim();
  const aliasKey = normalized.replace(/[-\s]/g, '_').toLowerCase();
  const alias = PROGRESS_STATUS_ALIASES[aliasKey];
  if (alias) return alias;

  const enumValue = normalized.toUpperCase() as HeroMissionProgressStatus;
  if (Object.values(HeroMissionProgressStatus).includes(enumValue)) {
    return enumValue;
  }

  throw new ValidationDomainException('Progress status is invalid', {
    field: 'status',
    value: input,
  });
}

export function assertMissionStartable(mission: MissionStateLike): void {
  const status = normalizeHeroMissionStatus(mission.status);
  if (mission.deletedAt) {
    throw new NotFoundDomainException('Hero mission not found', {
      missionId: mission.id,
    });
  }

  if (status === HeroMissionStatus.ARCHIVED || mission.archivedAt) {
    throw new DomainException({
      code: 'reinforcement.hero.mission.archived',
      message: 'Hero mission is archived',
      httpStatus: HttpStatus.CONFLICT,
      details: { missionId: mission.id },
    });
  }

  if (status !== HeroMissionStatus.PUBLISHED) {
    throw new HeroMissionNotPublishedException({
      missionId: mission.id,
      status,
    });
  }
}

export function assertProgressStartable(
  progress: ProgressStateLike | null,
): 'create' | 'return_existing' {
  if (!progress) return 'create';

  const status = normalizeHeroProgressStatus(progress.status);
  if (
    status === HeroMissionProgressStatus.NOT_STARTED ||
    status === HeroMissionProgressStatus.IN_PROGRESS
  ) {
    return 'return_existing';
  }

  if (status === HeroMissionProgressStatus.COMPLETED) {
    throw new HeroProgressAlreadyCompletedException({
      progressId: progress.id,
    });
  }

  throw new HeroProgressInvalidStatusException({
    progressId: progress.id,
    status,
  });
}

export function assertObjectiveCompletable(params: {
  progress: ProgressStateLike;
  mission: MissionStateLike;
  objective: ObjectiveStateLike;
}): void {
  assertMissionStartable(params.mission);

  const progressStatus = normalizeHeroProgressStatus(params.progress.status);
  if (progressStatus === HeroMissionProgressStatus.COMPLETED) {
    throw new HeroProgressAlreadyCompletedException({
      progressId: params.progress.id,
    });
  }

  if (
    progressStatus !== HeroMissionProgressStatus.IN_PROGRESS &&
    progressStatus !== HeroMissionProgressStatus.NOT_STARTED
  ) {
    throw new HeroProgressInvalidStatusException({
      progressId: params.progress.id,
      status: progressStatus,
    });
  }

  if (params.objective.deletedAt) {
    throw new NotFoundDomainException('Hero mission objective not found', {
      objectiveId: params.objective.id,
    });
  }

  if (params.objective.missionId !== params.mission.id) {
    throw new NotFoundDomainException('Hero mission objective not found', {
      missionId: params.mission.id,
      objectiveId: params.objective.id,
    });
  }
}

export function assertMissionCompletable(params: {
  progress: ProgressStateLike;
  mission: MissionStateLike;
  activeObjectives: ActiveObjectiveLike[];
  completedObjectiveProgress: CompletedObjectiveLike[];
}): void {
  assertMissionStartable(params.mission);

  const progressStatus = normalizeHeroProgressStatus(params.progress.status);
  if (progressStatus === HeroMissionProgressStatus.COMPLETED) {
    throw new HeroProgressAlreadyCompletedException({
      progressId: params.progress.id,
    });
  }

  if (
    progressStatus !== HeroMissionProgressStatus.IN_PROGRESS &&
    progressStatus !== HeroMissionProgressStatus.NOT_STARTED
  ) {
    throw new HeroProgressInvalidStatusException({
      progressId: params.progress.id,
      status: progressStatus,
    });
  }

  if (
    !canCompleteHeroMission({
      activeObjectives: params.activeObjectives,
      completedObjectiveProgress: params.completedObjectiveProgress,
    })
  ) {
    throw new HeroProgressObjectiveNotCompletedException({
      progressId: params.progress.id,
    });
  }
}

export function assertStudentEnrollmentMatchesMission(params: {
  enrollment: EnrollmentStageLike;
  mission: MissionAcademicLike;
}): void {
  const stageId = params.enrollment.classroom.section.grade.stageId;
  const termMatches =
    !params.enrollment.termId ||
    params.enrollment.termId === params.mission.termId;

  if (
    params.enrollment.academicYearId !== params.mission.academicYearId ||
    !termMatches ||
    stageId !== params.mission.stageId
  ) {
    throw new ValidationDomainException(
      'Student enrollment does not match Hero mission academic scope',
      {
        enrollmentId: params.enrollment.id,
        missionId: params.mission.id,
        academicYearId: params.mission.academicYearId,
        termId: params.mission.termId,
        stageId: params.mission.stageId,
      },
    );
  }
}

export function calculateHeroMissionProgressPercent(params: {
  activeObjectives: ActiveObjectiveLike[];
  completedObjectiveProgress: CompletedObjectiveLike[];
}): number {
  const requiredObjectives = params.activeObjectives.filter(
    (objective) => objective.isRequired && !objective.deletedAt,
  );
  if (requiredObjectives.length === 0) return 0;

  const completedIds = new Set(
    params.completedObjectiveProgress
      .filter((progress) => progress.completedAt)
      .map((progress) => progress.objectiveId),
  );
  const completedRequired = requiredObjectives.filter((objective) =>
    completedIds.has(objective.id),
  ).length;

  return Math.round((completedRequired / requiredObjectives.length) * 100);
}

export function canCompleteHeroMission(params: {
  activeObjectives: ActiveObjectiveLike[];
  completedObjectiveProgress: CompletedObjectiveLike[];
}): boolean {
  const requiredObjectives = params.activeObjectives.filter(
    (objective) => objective.isRequired && !objective.deletedAt,
  );
  if (requiredObjectives.length === 0) return false;

  const completedIds = new Set(
    params.completedObjectiveProgress
      .filter((progress) => progress.completedAt)
      .map((progress) => progress.objectiveId),
  );

  return requiredObjectives.every((objective) =>
    completedIds.has(objective.id),
  );
}

export function deriveProgressStatusAfterObjectiveCompletion(
  currentStatus: HeroMissionProgressStatus | string,
): HeroMissionProgressStatus {
  const status = normalizeHeroProgressStatus(currentStatus);
  if (status === HeroMissionProgressStatus.COMPLETED) {
    throw new HeroProgressAlreadyCompletedException();
  }
  if (
    status !== HeroMissionProgressStatus.IN_PROGRESS &&
    status !== HeroMissionProgressStatus.NOT_STARTED
  ) {
    throw new HeroProgressInvalidStatusException({ status });
  }

  return HeroMissionProgressStatus.IN_PROGRESS;
}

export function summarizeHeroProgress(
  statuses: Array<HeroMissionProgressStatus | 'available_not_started'>,
) {
  const total = statuses.length;
  const notStarted = statuses.filter(
    (status) =>
      status === 'available_not_started' ||
      status === HeroMissionProgressStatus.NOT_STARTED,
  ).length;
  const inProgress = statuses.filter(
    (status) => status === HeroMissionProgressStatus.IN_PROGRESS,
  ).length;
  const completed = statuses.filter(
    (status) => status === HeroMissionProgressStatus.COMPLETED,
  ).length;
  const cancelled = statuses.filter(
    (status) => status === HeroMissionProgressStatus.CANCELLED,
  ).length;

  return {
    missionsTotal: total,
    notStarted,
    inProgress,
    completed,
    cancelled,
    completionRate: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}

export function buildHeroJourneyEventPayload(params: {
  schoolId: string;
  type: HeroJourneyEventType;
  missionId?: string | null;
  missionProgressId?: string | null;
  objectiveId?: string | null;
  studentId?: string | null;
  enrollmentId?: string | null;
  actorUserId?: string | null;
  occurredAt: Date;
  metadata?: unknown;
}) {
  return {
    schoolId: params.schoolId,
    type: params.type,
    missionId: params.missionId ?? null,
    missionProgressId: params.missionProgressId ?? null,
    objectiveId: params.objectiveId ?? null,
    studentId: params.studentId ?? null,
    enrollmentId: params.enrollmentId ?? null,
    actorUserId: params.actorUserId ?? null,
    occurredAt: params.occurredAt,
    metadata: params.metadata,
  };
}
