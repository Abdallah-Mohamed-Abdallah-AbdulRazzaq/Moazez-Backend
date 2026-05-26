import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  LessonPlanItemStatus,
  LessonPlanStatus,
  Prisma,
} from '@prisma/client';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { AcademicsScope, requireAcademicsScope } from '../../academics-context';
import {
  CreateLessonPlanDto,
  CreateLessonPlanItemDto,
  LessonPlanItemStatusNoteDto,
  ListLessonPlansQueryDto,
  ReorderLessonPlanItemDto,
  UpdateLessonPlanDto,
  UpdateLessonPlanItemDto,
} from '../dto/lesson-plans.dto';
import {
  DeleteLessonPlanItemResponseDto,
  DeleteLessonPlanResponseDto,
  LessonPlanDetailResponseDto,
  LessonPlanItemResponseDto,
  LessonPlansListResponseDto,
} from '../dto/lesson-plans-response.dto';
import {
  assertDateRange,
  assertDateWithinRange,
  assertDayOfWeek,
  assertSortOrder,
  dayOfWeekFromDate,
  normalizeDateOnly,
  normalizeNullableText,
  normalizeRequiredTitle,
} from '../domain/lesson-plan-inputs';
import {
  isUniqueConstraintError,
  LessonPlanDuplicateException,
  LessonPlanInvalidItemScopeException,
  LessonPlanInvalidScopeException,
  LessonPlanInvalidTransitionException,
  LessonPlanItemInvalidTransitionException,
  LessonPlanItemNotFoundException,
  LessonPlanNotFoundException,
  LessonPlanReadOnlyException,
} from '../domain/lesson-plan.exceptions';
import {
  LessonPlanAllocationRecord,
  LessonPlanDetailRecord,
  LessonPlanItemRecord,
  LessonPlanLessonRecord,
  LessonPlanTimetableEntryRecord,
  LessonPlansRepository,
  ListLessonPlansFilters,
} from '../infrastructure/lesson-plans.repository';
import {
  presentLessonPlanDetail,
  presentLessonPlanItem,
  presentLessonPlans,
} from '../presenters/lesson-plans.presenter';

@Injectable()
export class ListLessonPlansUseCase {
  constructor(private readonly lessonPlansRepository: LessonPlansRepository) {}

  async execute(
    query: ListLessonPlansQueryDto,
  ): Promise<LessonPlansListResponseDto> {
    requireAcademicsScope();
    const filters: ListLessonPlansFilters = {
      academicYearId: query.academicYearId,
      termId: query.termId,
      teacherSubjectAllocationId: query.teacherSubjectAllocationId,
      teacherUserId: query.teacherUserId,
      classroomId: query.classroomId,
      subjectId: query.subjectId,
      curriculumId: query.curriculumId,
      status: query.status,
      weekStartDate: query.weekStartDate
        ? normalizeDateOnly(query.weekStartDate, 'weekStartDate')
        : undefined,
      search: normalizeNullableText(query.search) ?? undefined,
    };

    const lessonPlans = await this.lessonPlansRepository.listPlans(filters);
    return presentLessonPlans(lessonPlans);
  }
}

@Injectable()
export class CreateLessonPlanUseCase {
  constructor(
    private readonly lessonPlansRepository: LessonPlansRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    command: CreateLessonPlanDto,
  ): Promise<LessonPlanDetailResponseDto> {
    const scope = requireAcademicsScope();
    const resolved = await resolvePlanCreateScope(
      this.lessonPlansRepository,
      command,
    );
    const title = normalizeRequiredTitle(command.title);
    const description = normalizeNullableText(command.description);
    const weekStartDate = normalizeDateOnly(
      command.weekStartDate,
      'weekStartDate',
    );
    const weekEndDate = normalizeDateOnly(command.weekEndDate, 'weekEndDate');
    assertDateRange(weekStartDate, weekEndDate);

    const duplicate = await this.lessonPlansRepository.findDuplicatePlan({
      teacherSubjectAllocationId: command.teacherSubjectAllocationId,
      weekStartDate,
    });
    if (duplicate) {
      throw new LessonPlanDuplicateException({
        teacherSubjectAllocationId: command.teacherSubjectAllocationId,
        weekStartDate: command.weekStartDate,
      });
    }

    try {
      const lessonPlan = await this.lessonPlansRepository.createPlan({
        schoolId: scope.schoolId,
        academicYearId: command.academicYearId,
        termId: command.termId,
        teacherSubjectAllocationId: command.teacherSubjectAllocationId,
        teacherUserId: resolved.allocation.teacherUserId,
        classroomId: resolved.allocation.classroomId,
        subjectId: resolved.allocation.subjectId,
        curriculumId: command.curriculumId,
        title,
        description,
        status: LessonPlanStatus.DRAFT,
        weekStartDate,
        weekEndDate,
        createdByUserId: scope.actorId,
        updatedByUserId: scope.actorId,
      });

      await recordLessonPlanAudit(this.authRepository, {
        scope,
        action: 'academics.lesson_plan.create',
        resourceType: 'lesson_plan',
        resourceId: lessonPlan.id,
        after: summarizeLessonPlan(lessonPlan),
      });

      return presentLessonPlanDetail(lessonPlan);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new LessonPlanDuplicateException({
          teacherSubjectAllocationId: command.teacherSubjectAllocationId,
          weekStartDate: command.weekStartDate,
        });
      }

      throw error;
    }
  }
}

@Injectable()
export class GetLessonPlanUseCase {
  constructor(private readonly lessonPlansRepository: LessonPlansRepository) {}

  async execute(lessonPlanId: string): Promise<LessonPlanDetailResponseDto> {
    requireAcademicsScope();
    const lessonPlan = await findPlanOrThrow(
      this.lessonPlansRepository,
      lessonPlanId,
    );
    return presentLessonPlanDetail(lessonPlan);
  }
}

@Injectable()
export class UpdateLessonPlanUseCase {
  constructor(
    private readonly lessonPlansRepository: LessonPlansRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    lessonPlanId: string,
    command: UpdateLessonPlanDto,
  ): Promise<LessonPlanDetailResponseDto> {
    const scope = requireAcademicsScope();
    const existing = await findPlanOrThrow(
      this.lessonPlansRepository,
      lessonPlanId,
    );
    assertPlanMutable(existing);

    const weekStartDate =
      command.weekStartDate !== undefined
        ? normalizeDateOnly(command.weekStartDate, 'weekStartDate')
        : existing.weekStartDate;
    const weekEndDate =
      command.weekEndDate !== undefined
        ? normalizeDateOnly(command.weekEndDate, 'weekEndDate')
        : existing.weekEndDate;
    assertDateRange(weekStartDate, weekEndDate);

    if (command.weekStartDate !== undefined) {
      const duplicate = await this.lessonPlansRepository.findDuplicatePlan({
        teacherSubjectAllocationId: existing.teacherSubjectAllocationId,
        weekStartDate,
        excludeLessonPlanId: existing.id,
      });
      if (duplicate) {
        throw new LessonPlanDuplicateException({
          teacherSubjectAllocationId: existing.teacherSubjectAllocationId,
          weekStartDate: command.weekStartDate,
        });
      }
    }

    const updated = await this.lessonPlansRepository.updatePlan(lessonPlanId, {
      ...(command.title !== undefined
        ? { title: normalizeRequiredTitle(command.title) }
        : {}),
      ...(command.description !== undefined
        ? { description: normalizeNullableText(command.description) }
        : {}),
      weekStartDate,
      weekEndDate,
      updatedByUserId: scope.actorId,
    });

    await recordLessonPlanAudit(this.authRepository, {
      scope,
      action: 'academics.lesson_plan.update',
      resourceType: 'lesson_plan',
      resourceId: updated.id,
      before: summarizeLessonPlan(existing),
      after: summarizeLessonPlan(updated),
    });

    return presentLessonPlanDetail(updated);
  }
}

@Injectable()
export class ActivateLessonPlanUseCase {
  constructor(
    private readonly lessonPlansRepository: LessonPlansRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(lessonPlanId: string): Promise<LessonPlanDetailResponseDto> {
    const scope = requireAcademicsScope();
    const existing = await findPlanOrThrow(
      this.lessonPlansRepository,
      lessonPlanId,
    );
    if (existing.status !== LessonPlanStatus.DRAFT) {
      throw new LessonPlanInvalidTransitionException({
        from: existing.status,
        to: LessonPlanStatus.ACTIVE,
      });
    }

    if (existing.items.length === 0) {
      throw new LessonPlanInvalidTransitionException({
        reason: 'activation_requires_items',
      });
    }

    const updated = await this.lessonPlansRepository.updatePlan(lessonPlanId, {
      status: LessonPlanStatus.ACTIVE,
      activatedAt: new Date(),
      updatedByUserId: scope.actorId,
    });

    await recordLessonPlanAudit(this.authRepository, {
      scope,
      action: 'academics.lesson_plan.activate',
      resourceType: 'lesson_plan',
      resourceId: updated.id,
      before: summarizeLessonPlan(existing),
      after: summarizeLessonPlan(updated),
    });

    return presentLessonPlanDetail(updated);
  }
}

@Injectable()
export class ArchiveLessonPlanUseCase {
  constructor(
    private readonly lessonPlansRepository: LessonPlansRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(lessonPlanId: string): Promise<LessonPlanDetailResponseDto> {
    const scope = requireAcademicsScope();
    const existing = await findPlanOrThrow(
      this.lessonPlansRepository,
      lessonPlanId,
    );
    if (existing.status === LessonPlanStatus.ARCHIVED) {
      throw new LessonPlanInvalidTransitionException({
        from: existing.status,
        to: LessonPlanStatus.ARCHIVED,
      });
    }

    const updated = await this.lessonPlansRepository.updatePlan(lessonPlanId, {
      status: LessonPlanStatus.ARCHIVED,
      archivedAt: new Date(),
      updatedByUserId: scope.actorId,
    });

    await recordLessonPlanAudit(this.authRepository, {
      scope,
      action: 'academics.lesson_plan.archive',
      resourceType: 'lesson_plan',
      resourceId: updated.id,
      before: summarizeLessonPlan(existing),
      after: summarizeLessonPlan(updated),
    });

    return presentLessonPlanDetail(updated);
  }
}

@Injectable()
export class DeleteLessonPlanUseCase {
  constructor(
    private readonly lessonPlansRepository: LessonPlansRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(lessonPlanId: string): Promise<DeleteLessonPlanResponseDto> {
    const scope = requireAcademicsScope();
    const existing = await findPlanOrThrow(
      this.lessonPlansRepository,
      lessonPlanId,
    );
    const result = await this.lessonPlansRepository.softDeletePlan(lessonPlanId);
    if (result.status === 'not_found') {
      throw new LessonPlanNotFoundException({ lessonPlanId });
    }

    await recordLessonPlanAudit(this.authRepository, {
      scope,
      action: 'academics.lesson_plan.delete',
      resourceType: 'lesson_plan',
      resourceId: existing.id,
      before: summarizeLessonPlan(existing),
      after: summarizeLessonPlan(result.lessonPlan),
    });

    return { ok: true };
  }
}

@Injectable()
export class CreateLessonPlanItemUseCase {
  constructor(
    private readonly lessonPlansRepository: LessonPlansRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    lessonPlanId: string,
    command: CreateLessonPlanItemDto,
  ): Promise<LessonPlanItemResponseDto> {
    const scope = requireAcademicsScope();
    const lessonPlan = await findPlanOrThrow(
      this.lessonPlansRepository,
      lessonPlanId,
    );
    assertPlanMutable(lessonPlan);
    const lesson = await resolveItemLessonScope(
      this.lessonPlansRepository,
      lessonPlan,
      command.unitId,
      command.lessonId,
    );
    const timetable = await resolveTimetableScope(
      this.lessonPlansRepository,
      lessonPlan,
      command.timetableEntryId,
    );
    const planned = resolvePlannedSlot(command, lessonPlan, timetable);
    const sortOrder =
      command.sortOrder ??
      (await this.lessonPlansRepository.getNextItemSortOrder(lessonPlanId));
    assertSortOrder(sortOrder);

    const item = await this.lessonPlansRepository.createItem({
      schoolId: scope.schoolId,
      lessonPlanId,
      curriculumId: lessonPlan.curriculumId,
      unitId: command.unitId,
      lessonId: command.lessonId,
      timetableEntryId: timetable?.id ?? null,
      plannedDate: planned.plannedDate,
      dayOfWeek: planned.dayOfWeek,
      periodId: planned.periodId,
      periodLabel: planned.periodLabel,
      title: normalizeNullableText(command.title) ?? lesson.title,
      notes: normalizeNullableText(command.notes),
      status: LessonPlanItemStatus.PLANNED,
      sortOrder,
      createdByUserId: scope.actorId,
      updatedByUserId: scope.actorId,
    });

    await recordLessonPlanAudit(this.authRepository, {
      scope,
      action: 'academics.lesson_plan.item.create',
      resourceType: 'lesson_plan_item',
      resourceId: item.id,
      after: summarizeLessonPlanItem(item),
    });

    return presentLessonPlanItem(item);
  }
}

@Injectable()
export class UpdateLessonPlanItemUseCase {
  constructor(
    private readonly lessonPlansRepository: LessonPlansRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    lessonPlanId: string,
    itemId: string,
    command: UpdateLessonPlanItemDto,
  ): Promise<LessonPlanItemResponseDto> {
    const scope = requireAcademicsScope();
    const lessonPlan = await findPlanOrThrow(
      this.lessonPlansRepository,
      lessonPlanId,
    );
    assertPlanMutable(lessonPlan);
    const existing = await findItemOrThrow(this.lessonPlansRepository, {
      lessonPlanId,
      itemId,
    });

    const unitId = command.unitId ?? existing.unitId;
    const lessonId = command.lessonId ?? existing.lessonId;
    const lesson = await resolveItemLessonScope(
      this.lessonPlansRepository,
      lessonPlan,
      unitId,
      lessonId,
    );
    const timetable =
      command.timetableEntryId !== undefined
        ? await resolveTimetableScope(
            this.lessonPlansRepository,
            lessonPlan,
            command.timetableEntryId,
          )
        : null;
    const planned = resolveUpdatedPlannedSlot(
      command,
      lessonPlan,
      existing,
      timetable,
    );
    const title =
      command.title !== undefined
        ? normalizeNullableText(command.title) ?? lesson.title
        : existing.title;

    const updated = await this.lessonPlansRepository.updateItem(itemId, {
      unitId,
      lessonId,
      timetableEntryId:
        command.timetableEntryId !== undefined
          ? timetable?.id ?? null
          : existing.timetableEntryId,
      plannedDate: planned.plannedDate,
      dayOfWeek: planned.dayOfWeek,
      periodId: planned.periodId,
      periodLabel: planned.periodLabel,
      title,
      notes:
        command.notes !== undefined
          ? normalizeNullableText(command.notes)
          : existing.notes,
      updatedByUserId: scope.actorId,
    });

    await recordLessonPlanAudit(this.authRepository, {
      scope,
      action: 'academics.lesson_plan.item.update',
      resourceType: 'lesson_plan_item',
      resourceId: updated.id,
      before: summarizeLessonPlanItem(existing),
      after: summarizeLessonPlanItem(updated),
    });

    return presentLessonPlanItem(updated);
  }
}

@Injectable()
export class ReorderLessonPlanItemUseCase {
  constructor(
    private readonly lessonPlansRepository: LessonPlansRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    lessonPlanId: string,
    itemId: string,
    command: ReorderLessonPlanItemDto,
  ): Promise<LessonPlanItemResponseDto> {
    const scope = requireAcademicsScope();
    const lessonPlan = await findPlanOrThrow(
      this.lessonPlansRepository,
      lessonPlanId,
    );
    assertPlanMutable(lessonPlan);
    assertSortOrder(command.sortOrder);
    const existing = await findItemOrThrow(this.lessonPlansRepository, {
      lessonPlanId,
      itemId,
    });

    const updated = await this.lessonPlansRepository.updateItem(itemId, {
      sortOrder: command.sortOrder,
      updatedByUserId: scope.actorId,
    });

    await recordLessonPlanAudit(this.authRepository, {
      scope,
      action: 'academics.lesson_plan.item.reorder',
      resourceType: 'lesson_plan_item',
      resourceId: updated.id,
      before: summarizeLessonPlanItem(existing),
      after: summarizeLessonPlanItem(updated),
    });

    return presentLessonPlanItem(updated);
  }
}

@Injectable()
export class LessonPlanItemStatusUseCase {
  constructor(
    protected readonly lessonPlansRepository: LessonPlansRepository,
    protected readonly authRepository: AuthRepository,
  ) {}

  protected async transition(
    lessonPlanId: string,
    itemId: string,
    targetStatus: LessonPlanItemStatus,
    note?: string | null,
  ): Promise<LessonPlanItemResponseDto> {
    const scope = requireAcademicsScope();
    const lessonPlan = await findPlanOrThrow(
      this.lessonPlansRepository,
      lessonPlanId,
    );
    assertPlanMutable(lessonPlan);
    const existing = await findItemOrThrow(this.lessonPlansRepository, {
      lessonPlanId,
      itemId,
    });
    assertItemTransition(existing.status, targetStatus);

    const now = new Date();
    const data: Prisma.LessonPlanItemUncheckedUpdateInput = {
      status: targetStatus,
      updatedByUserId: scope.actorId,
    };
    if (targetStatus === LessonPlanItemStatus.IN_PROGRESS) {
      data.startedAt = now;
    }
    if (targetStatus === LessonPlanItemStatus.DONE) {
      data.startedAt = existing.startedAt ?? now;
      data.completedAt = now;
    }
    if (targetStatus === LessonPlanItemStatus.SKIPPED) {
      data.skippedAt = now;
      const normalizedNote = normalizeNullableText(note);
      if (normalizedNote) data.notes = normalizedNote;
    }
    if (targetStatus === LessonPlanItemStatus.CANCELLED) {
      data.cancelledAt = now;
      const normalizedNote = normalizeNullableText(note);
      if (normalizedNote) data.notes = normalizedNote;
    }

    const updated = await this.lessonPlansRepository.updateItem(itemId, data);

    await recordLessonPlanAudit(this.authRepository, {
      scope,
      action: `academics.lesson_plan.item.${targetStatus.toLowerCase()}`,
      resourceType: 'lesson_plan_item',
      resourceId: updated.id,
      before: summarizeLessonPlanItem(existing),
      after: summarizeLessonPlanItem(updated),
    });

    return presentLessonPlanItem(updated);
  }
}

@Injectable()
export class StartLessonPlanItemUseCase extends LessonPlanItemStatusUseCase {
  constructor(
    lessonPlansRepository: LessonPlansRepository,
    authRepository: AuthRepository,
  ) {
    super(lessonPlansRepository, authRepository);
  }

  execute(
    lessonPlanId: string,
    itemId: string,
  ): Promise<LessonPlanItemResponseDto> {
    return this.transition(lessonPlanId, itemId, LessonPlanItemStatus.IN_PROGRESS);
  }
}

@Injectable()
export class CompleteLessonPlanItemUseCase extends LessonPlanItemStatusUseCase {
  constructor(
    lessonPlansRepository: LessonPlansRepository,
    authRepository: AuthRepository,
  ) {
    super(lessonPlansRepository, authRepository);
  }

  execute(
    lessonPlanId: string,
    itemId: string,
  ): Promise<LessonPlanItemResponseDto> {
    return this.transition(lessonPlanId, itemId, LessonPlanItemStatus.DONE);
  }
}

@Injectable()
export class SkipLessonPlanItemUseCase extends LessonPlanItemStatusUseCase {
  constructor(
    lessonPlansRepository: LessonPlansRepository,
    authRepository: AuthRepository,
  ) {
    super(lessonPlansRepository, authRepository);
  }

  execute(
    lessonPlanId: string,
    itemId: string,
    command: LessonPlanItemStatusNoteDto,
  ): Promise<LessonPlanItemResponseDto> {
    return this.transition(
      lessonPlanId,
      itemId,
      LessonPlanItemStatus.SKIPPED,
      command.note,
    );
  }
}

@Injectable()
export class CancelLessonPlanItemUseCase extends LessonPlanItemStatusUseCase {
  constructor(
    lessonPlansRepository: LessonPlansRepository,
    authRepository: AuthRepository,
  ) {
    super(lessonPlansRepository, authRepository);
  }

  execute(
    lessonPlanId: string,
    itemId: string,
    command: LessonPlanItemStatusNoteDto,
  ): Promise<LessonPlanItemResponseDto> {
    return this.transition(
      lessonPlanId,
      itemId,
      LessonPlanItemStatus.CANCELLED,
      command.note,
    );
  }
}

@Injectable()
export class DeleteLessonPlanItemUseCase {
  constructor(
    private readonly lessonPlansRepository: LessonPlansRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    lessonPlanId: string,
    itemId: string,
  ): Promise<DeleteLessonPlanItemResponseDto> {
    const scope = requireAcademicsScope();
    const lessonPlan = await findPlanOrThrow(
      this.lessonPlansRepository,
      lessonPlanId,
    );
    assertPlanMutable(lessonPlan);
    const existing = await findItemOrThrow(this.lessonPlansRepository, {
      lessonPlanId,
      itemId,
    });

    const result = await this.lessonPlansRepository.softDeleteItem({
      lessonPlanId,
      itemId,
    });
    if (result.status === 'not_found') {
      throw new LessonPlanItemNotFoundException({ lessonPlanId, itemId });
    }

    await recordLessonPlanAudit(this.authRepository, {
      scope,
      action: 'academics.lesson_plan.item.delete',
      resourceType: 'lesson_plan_item',
      resourceId: existing.id,
      before: summarizeLessonPlanItem(existing),
      after: summarizeLessonPlanItem(result.item),
    });

    return { ok: true };
  }
}

type PlanCreateScope = {
  allocation: LessonPlanAllocationRecord;
};

async function resolvePlanCreateScope(
  repository: LessonPlansRepository,
  command: CreateLessonPlanDto,
): Promise<PlanCreateScope> {
  const [academicYear, term, allocation, curriculum] = await Promise.all([
    repository.findAcademicYearById(command.academicYearId),
    repository.findTermById(command.termId),
    repository.findTeacherAllocationById(command.teacherSubjectAllocationId),
    repository.findCurriculumById(command.curriculumId),
  ]);

  if (!academicYear || !term || !allocation || !curriculum) {
    throw new LessonPlanInvalidScopeException({
      academicYearId: command.academicYearId,
      termId: command.termId,
      teacherSubjectAllocationId: command.teacherSubjectAllocationId,
      curriculumId: command.curriculumId,
    });
  }

  if (term.academicYearId !== command.academicYearId) {
    throw new LessonPlanInvalidScopeException({ field: 'termId' });
  }

  if (
    allocation.termId !== command.termId ||
    allocation.term.academicYearId !== command.academicYearId
  ) {
    throw new LessonPlanInvalidScopeException({
      field: 'teacherSubjectAllocationId',
    });
  }

  if (
    (command.teacherUserId &&
      command.teacherUserId !== allocation.teacherUserId) ||
    (command.classroomId && command.classroomId !== allocation.classroomId) ||
    (command.subjectId && command.subjectId !== allocation.subjectId)
  ) {
    throw new LessonPlanInvalidScopeException({
      field: 'teacherSubjectAllocationId',
    });
  }

  if (
    curriculum.academicYearId !== command.academicYearId ||
    curriculum.termId !== command.termId ||
    curriculum.subjectId !== allocation.subjectId ||
    curriculum.gradeId !== allocation.classroom.section.gradeId
  ) {
    throw new LessonPlanInvalidScopeException({ field: 'curriculumId' });
  }

  return { allocation };
}

async function findPlanOrThrow(
  repository: LessonPlansRepository,
  lessonPlanId: string,
): Promise<LessonPlanDetailRecord> {
  const lessonPlan = await repository.findPlanById(lessonPlanId);
  if (!lessonPlan) {
    throw new LessonPlanNotFoundException({ lessonPlanId });
  }

  return lessonPlan;
}

async function findItemOrThrow(
  repository: LessonPlansRepository,
  input: { lessonPlanId: string; itemId: string },
): Promise<LessonPlanItemRecord> {
  const item = await repository.findItemById(input);
  if (!item) {
    throw new LessonPlanItemNotFoundException(input);
  }

  return item;
}

function assertPlanMutable(lessonPlan: LessonPlanDetailRecord): void {
  if (lessonPlan.status === LessonPlanStatus.ARCHIVED) {
    throw new LessonPlanReadOnlyException({
      lessonPlanId: lessonPlan.id,
      status: lessonPlan.status,
    });
  }
}

async function resolveItemLessonScope(
  repository: LessonPlansRepository,
  lessonPlan: LessonPlanDetailRecord,
  unitId: string,
  lessonId: string,
): Promise<LessonPlanLessonRecord> {
  const [unit, lesson] = await Promise.all([
    repository.findUnitById(unitId),
    repository.findLessonById(lessonId),
  ]);

  if (!unit || !lesson) {
    throw new LessonPlanInvalidItemScopeException({ unitId, lessonId });
  }

  if (
    unit.curriculumId !== lessonPlan.curriculumId ||
    lesson.curriculumId !== lessonPlan.curriculumId ||
    lesson.unitId !== unitId
  ) {
    throw new LessonPlanInvalidItemScopeException({
      lessonPlanId: lessonPlan.id,
      unitId,
      lessonId,
    });
  }

  return lesson;
}

async function resolveTimetableScope(
  repository: LessonPlansRepository,
  lessonPlan: LessonPlanDetailRecord,
  timetableEntryId: string | null | undefined,
): Promise<LessonPlanTimetableEntryRecord | null> {
  if (timetableEntryId === undefined || timetableEntryId === null) {
    return null;
  }

  const timetable = await repository.findTimetableEntryById(timetableEntryId);
  if (!timetable) {
    throw new LessonPlanInvalidItemScopeException({ timetableEntryId });
  }

  if (
    timetable.academicYearId !== lessonPlan.academicYearId ||
    timetable.termId !== lessonPlan.termId ||
    timetable.teacherSubjectAllocationId !==
      lessonPlan.teacherSubjectAllocationId ||
    timetable.teacherUserId !== lessonPlan.teacherUserId ||
    timetable.classroomId !== lessonPlan.classroomId ||
    timetable.subjectId !== lessonPlan.subjectId
  ) {
    throw new LessonPlanInvalidItemScopeException({ timetableEntryId });
  }

  return timetable;
}

type PlannedSlot = {
  plannedDate: Date | null;
  dayOfWeek: number | null;
  periodId: string | null;
  periodLabel: string | null;
};

function resolvePlannedSlot(
  command: CreateLessonPlanItemDto,
  lessonPlan: LessonPlanDetailRecord,
  timetable: LessonPlanTimetableEntryRecord | null,
): PlannedSlot {
  const plannedDate = command.plannedDate
    ? normalizeDateOnly(command.plannedDate, 'plannedDate')
    : null;
  if (plannedDate) {
    assertDateWithinRange(
      plannedDate,
      lessonPlan.weekStartDate,
      lessonPlan.weekEndDate,
    );
  }

  const computedDayOfWeek = plannedDate ? dayOfWeekFromDate(plannedDate) : null;
  const dayOfWeek =
    command.dayOfWeek ?? computedDayOfWeek ?? timetable?.dayOfWeek ?? null;
  assertDayOfWeek(dayOfWeek);
  if (
    plannedDate &&
    command.dayOfWeek !== undefined &&
    command.dayOfWeek !== null &&
    command.dayOfWeek !== computedDayOfWeek
  ) {
    throw new LessonPlanInvalidItemScopeException({
      field: 'dayOfWeek',
      plannedDate: command.plannedDate,
    });
  }

  return {
    plannedDate,
    dayOfWeek,
    periodId: command.periodId ?? timetable?.periodId ?? null,
    periodLabel:
      normalizeNullableText(command.periodLabel) ??
      timetable?.period?.label ??
      null,
  };
}

function resolveUpdatedPlannedSlot(
  command: UpdateLessonPlanItemDto,
  lessonPlan: LessonPlanDetailRecord,
  existing: LessonPlanItemRecord,
  timetable: LessonPlanTimetableEntryRecord | null,
): PlannedSlot {
  const plannedDate =
    command.plannedDate === undefined
      ? existing.plannedDate
      : command.plannedDate === null
        ? null
        : normalizeDateOnly(command.plannedDate, 'plannedDate');
  if (plannedDate) {
    assertDateWithinRange(
      plannedDate,
      lessonPlan.weekStartDate,
      lessonPlan.weekEndDate,
    );
  }

  const computedDayOfWeek = plannedDate ? dayOfWeekFromDate(plannedDate) : null;
  const defaultDayOfWeek =
    timetable?.dayOfWeek ??
    (command.timetableEntryId !== undefined ? null : existing.dayOfWeek);
  const dayOfWeek =
    command.dayOfWeek !== undefined
      ? command.dayOfWeek
      : computedDayOfWeek ?? defaultDayOfWeek;
  assertDayOfWeek(dayOfWeek);
  if (
    plannedDate &&
    command.dayOfWeek !== undefined &&
    command.dayOfWeek !== null &&
    command.dayOfWeek !== computedDayOfWeek
  ) {
    throw new LessonPlanInvalidItemScopeException({
      field: 'dayOfWeek',
      plannedDate: command.plannedDate,
    });
  }

  const periodId =
    command.periodId !== undefined
      ? command.periodId
      : timetable?.periodId ??
        (command.timetableEntryId !== undefined ? null : existing.periodId);
  const periodLabel =
    command.periodLabel !== undefined
      ? normalizeNullableText(command.periodLabel)
      : timetable?.period?.label ??
        (command.timetableEntryId !== undefined ? null : existing.periodLabel);

  return {
    plannedDate,
    dayOfWeek: dayOfWeek ?? null,
    periodId: periodId ?? null,
    periodLabel: periodLabel ?? null,
  };
}

function assertItemTransition(
  current: LessonPlanItemStatus,
  target: LessonPlanItemStatus,
): void {
  const allowed: Record<LessonPlanItemStatus, LessonPlanItemStatus[]> = {
    [LessonPlanItemStatus.PLANNED]: [
      LessonPlanItemStatus.IN_PROGRESS,
      LessonPlanItemStatus.DONE,
      LessonPlanItemStatus.SKIPPED,
      LessonPlanItemStatus.CANCELLED,
    ],
    [LessonPlanItemStatus.IN_PROGRESS]: [
      LessonPlanItemStatus.DONE,
      LessonPlanItemStatus.SKIPPED,
      LessonPlanItemStatus.CANCELLED,
    ],
    [LessonPlanItemStatus.DONE]: [],
    [LessonPlanItemStatus.SKIPPED]: [],
    [LessonPlanItemStatus.RESCHEDULED]: [],
    [LessonPlanItemStatus.CANCELLED]: [],
  };

  if (!allowed[current].includes(target)) {
    throw new LessonPlanItemInvalidTransitionException({
      from: current,
      to: target,
    });
  }
}

type LessonPlanAuditInput = {
  scope: AcademicsScope;
  action: string;
  resourceType: string;
  resourceId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
};

function recordLessonPlanAudit(
  authRepository: AuthRepository,
  input: LessonPlanAuditInput,
): Promise<unknown> {
  return authRepository.createAuditLog({
    actorId: input.scope.actorId,
    userType: input.scope.userType,
    organizationId: input.scope.organizationId,
    schoolId: input.scope.schoolId,
    module: 'academics',
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    outcome: AuditOutcome.SUCCESS,
    before: input.before,
    after: input.after,
  });
}

function summarizeLessonPlan(
  lessonPlan: LessonPlanDetailRecord,
): Record<string, unknown> {
  return {
    id: lessonPlan.id,
    academicYearId: lessonPlan.academicYearId,
    termId: lessonPlan.termId,
    teacherSubjectAllocationId: lessonPlan.teacherSubjectAllocationId,
    curriculumId: lessonPlan.curriculumId,
    title: lessonPlan.title,
    status: lessonPlan.status,
    weekStartDate: lessonPlan.weekStartDate.toISOString(),
    weekEndDate: lessonPlan.weekEndDate.toISOString(),
    deletedAt: lessonPlan.deletedAt?.toISOString() ?? null,
  };
}

function summarizeLessonPlanItem(
  item: LessonPlanItemRecord,
): Record<string, unknown> {
  return {
    id: item.id,
    lessonPlanId: item.lessonPlanId,
    curriculumId: item.curriculumId,
    unitId: item.unitId,
    lessonId: item.lessonId,
    timetableEntryId: item.timetableEntryId,
    title: item.title,
    status: item.status,
    sortOrder: item.sortOrder,
    deletedAt: item.deletedAt?.toISOString() ?? null,
  };
}
