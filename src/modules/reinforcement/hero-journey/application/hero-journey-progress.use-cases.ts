import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  HeroJourneyEventType,
  HeroMissionProgressStatus,
} from '@prisma/client';
import { getRequestContext } from '../../../../common/context/request-context';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import {
  requireReinforcementScope,
  ReinforcementScope,
} from '../../reinforcement-context';
import {
  assertMissionCompletable,
  assertMissionStartable,
  assertObjectiveCompletable,
  assertProgressStartable,
  assertStudentEnrollmentMatchesMission,
  buildHeroJourneyEventPayload,
  calculateHeroMissionProgressPercent,
  deriveProgressStatusAfterObjectiveCompletion,
  normalizeHeroProgressStatus,
} from '../domain/hero-journey-progress-domain';
import {
  CompleteHeroMissionDto,
  CompleteHeroObjectiveDto,
  GetStudentHeroProgressQueryDto,
  StartHeroMissionDto,
} from '../dto/hero-journey-progress.dto';
import {
  HeroJourneyProgressRepository,
  HeroProgressDetailRecord,
  HeroProgressEnrollmentRecord,
  HeroProgressTermRecord,
} from '../infrastructure/hero-journey-progress.repository';
import {
  presentHeroProgressDetail,
  presentStudentHeroProgress,
} from '../presenters/hero-journey-progress.presenter';

type ProgressAcademicContext = {
  academicYearId: string;
  termId: string;
  term: HeroProgressTermRecord;
};

@Injectable()
export class GetStudentHeroProgressUseCase {
  constructor(
    private readonly heroProgressRepository: HeroJourneyProgressRepository,
  ) {}

  async execute(studentId: string, query: GetStudentHeroProgressQueryDto) {
    requireReinforcementScope();

    const context = await resolveProgressAcademicContext({
      repository: this.heroProgressRepository,
      query,
    });
    const student = await this.heroProgressRepository.findStudent(studentId);
    if (!student) {
      throw new NotFoundDomainException('Student not found', { studentId });
    }

    const enrollment =
      await this.heroProgressRepository.findActiveEnrollmentForStudent({
        studentId,
        academicYearId: context.academicYearId,
        termId: context.termId,
      });
    if (!enrollment) {
      throw new NotFoundDomainException('Student enrollment not found', {
        studentId,
        academicYearId: context.academicYearId,
        termId: context.termId,
      });
    }

    const enrollmentStageId = enrollment.classroom.section.grade.stageId;
    const stageId = query.stageId ?? enrollmentStageId;
    if (stageId !== enrollmentStageId) {
      throw new NotFoundDomainException('Student enrollment not found', {
        studentId,
        stageId,
      });
    }

    const status = query.status
      ? normalizeHeroProgressStatus(query.status)
      : undefined;
    const progress = await this.heroProgressRepository.listStudentProgress({
      studentId,
      academicYearId: context.academicYearId,
      termId: context.termId,
      stageId,
      status,
      includeArchived: query.includeArchived ?? false,
    });
    const includeAvailable = query.includeAvailable ?? true;
    const shouldIncludeAvailable =
      includeAvailable &&
      (!status || status === HeroMissionProgressStatus.NOT_STARTED);
    const availableMissions = shouldIncludeAvailable
      ? await this.heroProgressRepository.listAvailablePublishedMissionsForStudent(
          {
            academicYearId: context.academicYearId,
            termId: context.termId,
            stageId,
            excludeMissionIds: progress.map((item) => item.missionId),
          },
        )
      : [];
    const recentEvents =
      await this.heroProgressRepository.listRecentEventsForStudent({
        studentId,
        academicYearId: context.academicYearId,
        termId: context.termId,
        stageId,
        limit: 10,
      });

    return presentStudentHeroProgress({
      student,
      enrollment,
      academicYearId: context.academicYearId,
      termId: context.termId,
      progress,
      availableMissions,
      recentEvents,
    });
  }
}

@Injectable()
export class GetHeroProgressDetailUseCase {
  constructor(
    private readonly heroProgressRepository: HeroJourneyProgressRepository,
  ) {}

  async execute(progressId: string) {
    requireReinforcementScope();
    const progress =
      await this.heroProgressRepository.findProgressById(progressId);
    if (!progress) {
      throw new NotFoundDomainException('Hero mission progress not found', {
        progressId,
      });
    }

    return presentHeroProgressDetail(progress);
  }
}

@Injectable()
export class StartHeroMissionUseCase {
  constructor(
    private readonly heroProgressRepository: HeroJourneyProgressRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    studentId: string,
    missionId: string,
    command: StartHeroMissionDto,
  ) {
    const scope = requireReinforcementScope();
    const student = await this.heroProgressRepository.findStudent(studentId);
    if (!student) {
      throw new NotFoundDomainException('Student not found', { studentId });
    }

    const mission =
      await this.heroProgressRepository.findMissionForProgressStart(missionId);
    if (!mission) {
      throw new NotFoundDomainException('Hero mission not found', {
        missionId,
      });
    }
    assertMissionStartable(mission);

    const enrollment = command.enrollmentId
      ? await this.heroProgressRepository.findEnrollmentForStudent({
          studentId,
          enrollmentId: command.enrollmentId,
        })
      : await this.heroProgressRepository.findActiveEnrollmentForStudent({
          studentId,
          academicYearId: mission.academicYearId,
          termId: mission.termId,
        });
    if (!enrollment) {
      throw new NotFoundDomainException('Student enrollment not found', {
        studentId,
        enrollmentId: command.enrollmentId ?? null,
      });
    }
    assertStudentEnrollmentMatchesMission({ enrollment, mission });

    const existingProgress =
      await this.heroProgressRepository.findProgressByStudentMission({
        studentId,
        missionId,
      });
    if (assertProgressStartable(existingProgress) === 'return_existing') {
      return presentHeroProgressDetail(
        existingProgress as HeroProgressDetailRecord,
      );
    }

    const progress = await this.heroProgressRepository.startMissionProgress({
      schoolId: scope.schoolId,
      missionId: mission.id,
      studentId: student.id,
      enrollmentId: enrollment.id,
      academicYearId: mission.academicYearId,
      termId: mission.termId,
      actorId: scope.actorId,
      metadata: command.metadata,
    });
    await this.authRepository.createAuditLog(
      buildHeroProgressAuditEntry({
        scope,
        action: 'reinforcement.hero.progress.start',
        resourceType: 'hero_mission_progress',
        resourceId: progress.id,
        before: null,
        after: progress,
      }),
    );

    return presentHeroProgressDetail(progress);
  }
}

@Injectable()
export class CompleteHeroObjectiveUseCase {
  constructor(
    private readonly heroProgressRepository: HeroJourneyProgressRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    progressId: string,
    objectiveId: string,
    command: CompleteHeroObjectiveDto,
  ) {
    const scope = requireReinforcementScope();
    const progress =
      await this.heroProgressRepository.findProgressById(progressId);
    if (!progress) {
      throw new NotFoundDomainException('Hero mission progress not found', {
        progressId,
      });
    }

    const objective = await this.heroProgressRepository.findObjectiveById(
      objectiveId,
      { includeDeleted: true },
    );
    if (!objective) {
      throw new NotFoundDomainException('Hero mission objective not found', {
        objectiveId,
      });
    }

    assertObjectiveCompletable({
      progress,
      mission: progress.mission,
      objective,
    });

    const existingObjectiveProgress = progress.objectiveProgress.find(
      (item) => item.objectiveId === objective.id && item.completedAt,
    );
    if (existingObjectiveProgress) {
      return presentHeroProgressDetail(progress);
    }

    const statusAfterCompletion = deriveProgressStatusAfterObjectiveCompletion(
      progress.status,
    );
    const completedObjectiveProgress = [
      ...progress.objectiveProgress.filter((item) => item.completedAt),
      {
        objectiveId: objective.id,
        completedAt: new Date(),
      },
    ];
    const progressPercent = calculateHeroMissionProgressPercent({
      activeObjectives: progress.mission.objectives,
      completedObjectiveProgress,
    });
    const startedAt =
      statusAfterCompletion === HeroMissionProgressStatus.IN_PROGRESS &&
      progress.status === HeroMissionProgressStatus.NOT_STARTED &&
      !progress.startedAt
        ? new Date()
        : null;

    const result = await this.heroProgressRepository.completeObjectiveProgress({
      schoolId: scope.schoolId,
      progressId: progress.id,
      missionId: progress.missionId,
      objectiveId: objective.id,
      studentId: progress.studentId,
      enrollmentId: progress.enrollmentId,
      actorId: scope.actorId,
      progressPercent,
      startedAt,
      metadata: command.metadata,
    });
    await this.authRepository.createAuditLog(
      buildHeroProgressAuditEntry({
        scope,
        action: 'reinforcement.hero.objective.complete',
        resourceType: 'hero_mission_objective_progress',
        resourceId: result.objectiveProgressId,
        before: progress,
        after: result.progress,
        objectiveId: objective.id,
      }),
    );

    return presentHeroProgressDetail(result.progress);
  }
}

@Injectable()
export class CompleteHeroMissionUseCase {
  constructor(
    private readonly heroProgressRepository: HeroJourneyProgressRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(progressId: string, command: CompleteHeroMissionDto) {
    const scope = requireReinforcementScope();
    const progress =
      await this.heroProgressRepository.findProgressById(progressId);
    if (!progress) {
      throw new NotFoundDomainException('Hero mission progress not found', {
        progressId,
      });
    }

    assertMissionCompletable({
      progress,
      mission: progress.mission,
      activeObjectives: progress.mission.objectives,
      completedObjectiveProgress: progress.objectiveProgress,
    });

    const completedProgress =
      await this.heroProgressRepository.completeMissionProgress({
        schoolId: scope.schoolId,
        progressId: progress.id,
        missionId: progress.missionId,
        studentId: progress.studentId,
        enrollmentId: progress.enrollmentId,
        actorId: scope.actorId,
        metadata: command.metadata,
      });
    await this.authRepository.createAuditLog(
      buildHeroProgressAuditEntry({
        scope,
        action: 'reinforcement.hero.mission.complete',
        resourceType: 'hero_mission_progress',
        resourceId: completedProgress.id,
        before: progress,
        after: completedProgress,
      }),
    );

    return presentHeroProgressDetail(completedProgress);
  }
}

async function resolveProgressAcademicContext(params: {
  repository: HeroJourneyProgressRepository;
  query: GetStudentHeroProgressQueryDto;
}): Promise<ProgressAcademicContext> {
  const requestContext = getRequestContext();
  const requestedAcademicYearId =
    params.query.academicYearId ??
    params.query.yearId ??
    requestContext?.academicContext?.academicYearId;
  const academicYear = requestedAcademicYearId
    ? await params.repository.findAcademicYear(requestedAcademicYearId)
    : await params.repository.findActiveAcademicYear();
  if (!academicYear) {
    throw new NotFoundDomainException('Academic year not found', {
      academicYearId: requestedAcademicYearId ?? null,
    });
  }

  const requestedTermId =
    params.query.termId ?? requestContext?.academicContext?.termId;
  const term = requestedTermId
    ? await params.repository.findTerm(requestedTermId)
    : await params.repository.findActiveTerm(academicYear.id);
  if (!term || term.academicYearId !== academicYear.id) {
    throw new NotFoundDomainException('Term not found', {
      academicYearId: academicYear.id,
      termId: requestedTermId ?? null,
    });
  }

  return {
    academicYearId: academicYear.id,
    termId: term.id,
    term,
  };
}

function buildHeroProgressAuditEntry(params: {
  scope: ReinforcementScope;
  action: string;
  resourceType: 'hero_mission_progress' | 'hero_mission_objective_progress';
  resourceId: string;
  before: HeroProgressDetailRecord | null;
  after: HeroProgressDetailRecord;
  objectiveId?: string;
}) {
  const eventPayload = buildHeroJourneyEventPayload({
    schoolId: params.scope.schoolId,
    type:
      params.action === 'reinforcement.hero.mission.complete'
        ? HeroJourneyEventType.MISSION_COMPLETED
        : params.action === 'reinforcement.hero.objective.complete'
          ? HeroJourneyEventType.OBJECTIVE_COMPLETED
          : HeroJourneyEventType.MISSION_STARTED,
    missionId: params.after.missionId,
    missionProgressId: params.after.id,
    objectiveId: params.objectiveId ?? null,
    studentId: params.after.studentId,
    enrollmentId: params.after.enrollmentId,
    actorUserId: params.scope.actorId,
    occurredAt: params.after.lastActivityAt ?? new Date(),
  });

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
    before: params.before
      ? summarizeProgressForAudit(params.before, params.objectiveId)
      : undefined,
    after: {
      ...summarizeProgressForAudit(params.after, params.objectiveId),
      eventType: eventPayload.type,
    },
  };
}

function summarizeProgressForAudit(
  progress: HeroProgressDetailRecord,
  objectiveId?: string,
) {
  return {
    missionId: progress.missionId,
    objectiveId: objectiveId ?? null,
    studentId: progress.studentId,
    enrollmentId: progress.enrollmentId,
    status: progress.status,
    progressPercent: progress.progressPercent,
  };
}
