import { Injectable } from '@nestjs/common';
import {
  ReinforcementProofType,
  ReinforcementRewardType,
  ReinforcementSource,
  ReinforcementTargetScope,
} from '@prisma/client';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { CreateReinforcementTaskUseCase } from '../../../reinforcement/tasks/application/create-reinforcement-task.use-case';
import { CreateReinforcementTaskDto } from '../../../reinforcement/tasks/dto/reinforcement-task.dto';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import type {
  TeacherAppAllocationRecord,
  TeacherAppClassId,
} from '../../shared/teacher-app.types';
import {
  TeacherTaskCreateDto,
  TeacherTaskCreateProofType,
  TeacherTaskCreateRewardDto,
  TeacherTaskCreateRewardType,
  TeacherTaskDetailResponseDto,
} from '../dto/teacher-tasks.dto';
import { TeacherTasksReadAdapter } from '../infrastructure/teacher-tasks-read.adapter';
import { TeacherTasksPresenter } from '../presenters/teacher-tasks.presenter';

@Injectable()
export class CreateTeacherTaskUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly tasksReadAdapter: TeacherTasksReadAdapter,
    private readonly createReinforcementTaskUseCase: CreateReinforcementTaskUseCase,
  ) {}

  async execute(
    dto: TeacherTaskCreateDto,
  ): Promise<TeacherTaskDetailResponseDto> {
    const context = this.accessService.assertCurrentTeacher();
    const classIds = assertUniqueValues(dto.classIds, 'classIds', true);
    const studentIds = assertUniqueValues(dto.studentIds, 'studentIds', false);
    const allocations = await this.resolveOwnedAllocations(classIds);
    const taskContext = resolveSharedTaskContext(allocations);

    for (const studentId of studentIds) {
      const ownedStudent = await this.tasksReadAdapter.findOwnedStudent({
        allocations,
        studentId,
      });

      if (!ownedStudent) {
        throw new NotFoundDomainException('Teacher task student not found', {
          studentId,
        });
      }
    }

    const created = await this.createReinforcementTaskUseCase.execute(
      mapTeacherTaskCreateDto({
        dto,
        teacherUserId: context.teacherUserId,
        taskContext,
        studentIds,
        allocations,
      }),
    );

    const task = await this.tasksReadAdapter.findVisibleTaskById({
      teacherUserId: context.teacherUserId,
      allocations,
      taskId: created.id,
    });

    if (!task) {
      throw new NotFoundDomainException('Teacher task not found', {
        taskId: created.id,
      });
    }

    return TeacherTasksPresenter.presentDetail({ task, allocations });
  }

  private async resolveOwnedAllocations(
    classIds: TeacherAppClassId[],
  ): Promise<TeacherAppAllocationRecord[]> {
    const allocations: TeacherAppAllocationRecord[] = [];

    for (const classId of classIds) {
      allocations.push(await this.accessService.assertTeacherOwnsAllocation(classId));
    }

    return allocations;
  }
}

interface SharedTeacherTaskContext {
  academicYearId: string;
  termId: string;
  subjectId: string;
}

function mapTeacherTaskCreateDto(params: {
  dto: TeacherTaskCreateDto;
  teacherUserId: string;
  taskContext: SharedTeacherTaskContext;
  studentIds: string[];
  allocations: TeacherAppAllocationRecord[];
}): CreateReinforcementTaskDto {
  const reward = mapReward(params.dto);

  return {
    academicYearId: params.taskContext.academicYearId,
    termId: params.taskContext.termId,
    subjectId: params.taskContext.subjectId,
    titleEn: params.dto.title,
    descriptionEn: params.dto.description ?? null,
    source: ReinforcementSource.TEACHER,
    assignedById: params.teacherUserId,
    targets:
      params.studentIds.length > 0
        ? params.studentIds.map((studentId) => ({
            scopeType: ReinforcementTargetScope.STUDENT,
            scopeId: studentId,
          }))
        : params.allocations.map((allocation) => ({
            scopeType: ReinforcementTargetScope.CLASSROOM,
            scopeId: allocation.classroomId,
          })),
    stages: params.dto.stages?.map((stage) => ({
      sortOrder: stage.order ?? null,
      titleEn: stage.title,
      descriptionEn: stage.description ?? null,
      proofType: mapProofType(stage.proofType),
      requiresApproval: stage.requiresApproval ?? true,
    })),
    dueDate: params.dto.dueAt ?? params.dto.dueDate ?? null,
    rewardType: reward.rewardType,
    rewardValue: reward.rewardValue,
    rewardLabelEn: reward.rewardLabelEn,
  };
}

function resolveSharedTaskContext(
  allocations: TeacherAppAllocationRecord[],
): SharedTeacherTaskContext {
  const first = allocations[0];
  const academicYearId = first?.term?.academicYearId;

  if (!first || !academicYearId) {
    throw new ValidationDomainException('Teacher task class context is invalid', {
      field: 'classIds',
    });
  }

  for (const allocation of allocations) {
    if (
      allocation.term?.academicYearId !== academicYearId ||
      allocation.termId !== first.termId ||
      allocation.subjectId !== first.subjectId
    ) {
      throw new ValidationDomainException(
        'Teacher task classes must share the same subject and term',
        {
          field: 'classIds',
        },
      );
    }
  }

  return {
    academicYearId,
    termId: first.termId,
    subjectId: first.subjectId,
  };
}

function mapProofType(
  proofType?: TeacherTaskCreateProofType,
): ReinforcementProofType {
  switch (proofType) {
    case TeacherTaskCreateProofType.FILE:
    case TeacherTaskCreateProofType.DOCUMENT:
      return ReinforcementProofType.DOCUMENT;
    case TeacherTaskCreateProofType.IMAGE:
      return ReinforcementProofType.IMAGE;
    case TeacherTaskCreateProofType.TEXT:
    case TeacherTaskCreateProofType.NONE:
    case undefined:
      return ReinforcementProofType.NONE;
  }
}

function mapReward(dto: TeacherTaskCreateDto): {
  rewardType: ReinforcementRewardType | null;
  rewardValue: number | null;
  rewardLabelEn: string | null;
} {
  const reward = dto.reward ?? legacyReward(dto);
  if (!reward || reward.type === TeacherTaskCreateRewardType.NONE) {
    return { rewardType: null, rewardValue: null, rewardLabelEn: null };
  }

  const value = reward.value ?? parseNumericRewardValue(dto.rewardValue);

  switch (reward.type) {
    case TeacherTaskCreateRewardType.XP:
      return {
        rewardType: ReinforcementRewardType.XP,
        rewardValue: requirePositiveRewardValue(value, reward.type),
        rewardLabelEn:
          normalizeText(reward.label) ??
          `${requirePositiveRewardValue(value, reward.type)} XP`,
      };
    case TeacherTaskCreateRewardType.POINTS: {
      const points = requirePositiveRewardValue(value, reward.type);
      return {
        rewardType: ReinforcementRewardType.MORAL,
        rewardValue: points,
        rewardLabelEn: normalizeText(reward.label) ?? `${points} points`,
      };
    }
    case TeacherTaskCreateRewardType.MORAL:
      return {
        rewardType: ReinforcementRewardType.MORAL,
        rewardValue: value,
        rewardLabelEn:
          normalizeText(reward.label) ?? normalizeText(dto.rewardValue),
      };
    case TeacherTaskCreateRewardType.FINANCIAL:
      return {
        rewardType: ReinforcementRewardType.FINANCIAL,
        rewardValue: value,
        rewardLabelEn:
          normalizeText(reward.label) ?? normalizeText(dto.rewardValue),
      };
  }
}

function legacyReward(
  dto: TeacherTaskCreateDto,
): TeacherTaskCreateRewardDto | null {
  if (!dto.rewardType) return null;

  return {
    type: dto.rewardType,
    value: parseNumericRewardValue(dto.rewardValue),
    label: normalizeText(dto.rewardValue),
  };
}

function parseNumericRewardValue(value?: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function requirePositiveRewardValue(
  value: number | null,
  type: TeacherTaskCreateRewardType,
): number {
  if (value === null || value <= 0) {
    throw new ValidationDomainException('Teacher task reward value is required', {
      field: 'reward.value',
      rewardType: type,
    });
  }

  return value;
}

function assertUniqueValues(
  values: string[] | undefined,
  field: string,
  required: boolean,
): string[] {
  if (!Array.isArray(values) || values.length === 0) {
    if (!required) return [];
    throw new ValidationDomainException('Teacher task target is required', {
      field,
    });
  }

  const normalized = values.map((value) => value.trim()).filter(Boolean);
  if (new Set(normalized).size !== normalized.length) {
    throw new ValidationDomainException('Duplicate teacher task target', {
      field,
    });
  }

  return normalized;
}

function normalizeText(value?: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
