import { Injectable } from '@nestjs/common';
import { AuditOutcome, CurriculumStatus, Prisma } from '@prisma/client';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireAcademicsScope, AcademicsScope } from '../../academics-context';
import {
  CreateCurriculumDto,
  CreateCurriculumLessonDto,
  CreateCurriculumUnitDto,
  ListCurriculaQueryDto,
  ReorderCurriculumNodeDto,
  UpdateCurriculumDto,
  UpdateCurriculumLessonDto,
  UpdateCurriculumUnitDto,
} from '../dto/curriculum.dto';
import {
  CurriculumDetailResponseDto,
  CurriculumLessonResponseDto,
  CurriculumResponseDto,
  CurriculumUnitResponseDto,
  DeleteCurriculumNodeResponseDto,
} from '../dto/curriculum-response.dto';
import {
  CurriculumActivationIncompleteException,
  CurriculumDuplicateException,
  CurriculumInvalidReorderException,
  CurriculumInvalidScopeException,
  CurriculumLessonNotFoundException,
  CurriculumNotFoundException,
  CurriculumReadOnlyException,
  CurriculumUnitNotFoundException,
  isUniqueConstraintError,
} from '../domain/curriculum.exceptions';
import {
  normalizeNullableText,
  normalizeOptionalObjectives,
  normalizeRequiredTitle,
} from '../domain/curriculum-inputs';
import {
  CurriculumDetailRecord,
  CurriculumLessonRecord,
  CurriculumListRecord,
  CurriculumRepository,
  CurriculumUnitRecord,
  ListCurriculaFilters,
} from '../infrastructure/curriculum.repository';
import {
  presentCurricula,
  presentCurriculumDetail,
  presentCurriculumLesson,
  presentCurriculum,
  presentCurriculumUnit,
} from '../presenters/curriculum.presenter';

@Injectable()
export class ListCurriculaUseCase {
  constructor(private readonly curriculumRepository: CurriculumRepository) {}

  async execute(query: ListCurriculaQueryDto) {
    requireAcademicsScope();
    const curricula = await this.curriculumRepository.listCurricula(
      normalizeListFilters(query),
    );
    return presentCurricula(curricula);
  }
}

@Injectable()
export class CreateCurriculumUseCase {
  constructor(
    private readonly curriculumRepository: CurriculumRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    command: CreateCurriculumDto,
  ): Promise<CurriculumDetailResponseDto> {
    const scope = requireAcademicsScope();
    const title = resolveTitle(command.title);
    const academicScope = await validateAcademicScope(
      this.curriculumRepository,
      command,
    );
    const duplicate = await this.curriculumRepository.findCurriculumByScope({
      academicYearId: academicScope.academicYearId,
      termId: academicScope.termId,
      gradeId: academicScope.gradeId,
      subjectId: academicScope.subjectId,
    });
    if (duplicate) {
      throw new CurriculumDuplicateException({
        academicYearId: academicScope.academicYearId,
        termId: academicScope.termId,
        gradeId: academicScope.gradeId,
        subjectId: academicScope.subjectId,
      });
    }

    try {
      const curriculum = await this.curriculumRepository.createCurriculum({
        schoolId: scope.schoolId,
        academicYearId: academicScope.academicYearId,
        termId: academicScope.termId,
        gradeId: academicScope.gradeId,
        subjectId: academicScope.subjectId,
        title,
        description: normalizeNullableText(command.description),
        status: CurriculumStatus.DRAFT,
        createdByUserId: scope.actorId,
        updatedByUserId: scope.actorId,
      });

      await this.recordAudit({
        scope,
        action: 'academics.curriculum.create',
        resourceType: 'curriculum',
        resourceId: curriculum.id,
        after: summarizeCurriculum(curriculum),
      });

      return presentCurriculumDetail(curriculum);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new CurriculumDuplicateException({
          academicYearId: academicScope.academicYearId,
          termId: academicScope.termId,
          gradeId: academicScope.gradeId,
          subjectId: academicScope.subjectId,
        });
      }

      throw error;
    }
  }

  private recordAudit(input: CurriculumAuditInput): Promise<unknown> {
    return recordCurriculumAudit(this.authRepository, input);
  }
}

@Injectable()
export class GetCurriculumUseCase {
  constructor(private readonly curriculumRepository: CurriculumRepository) {}

  async execute(curriculumId: string): Promise<CurriculumDetailResponseDto> {
    requireAcademicsScope();
    const curriculum = await findCurriculumOrThrow(
      this.curriculumRepository,
      curriculumId,
    );
    return presentCurriculumDetail(curriculum);
  }
}

@Injectable()
export class UpdateCurriculumUseCase {
  constructor(
    private readonly curriculumRepository: CurriculumRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    curriculumId: string,
    command: UpdateCurriculumDto,
  ): Promise<CurriculumDetailResponseDto> {
    const scope = requireAcademicsScope();
    const curriculum = await findCurriculumOrThrow(
      this.curriculumRepository,
      curriculumId,
    );
    assertCurriculumMutable(curriculum);

    const data: Prisma.CurriculumUncheckedUpdateInput = {
      updatedByUserId: scope.actorId,
    };
    if (isProvided(command.title)) {
      data.title = resolveTitle(command.title ?? '');
    }
    if (isProvided(command.description)) {
      data.description = normalizeNullableText(command.description);
    }

    const updated = await this.curriculumRepository.updateCurriculum(
      curriculumId,
      data,
    );

    await recordCurriculumAudit(this.authRepository, {
      scope,
      action: 'academics.curriculum.update',
      resourceType: 'curriculum',
      resourceId: updated.id,
      before: summarizeCurriculum(curriculum),
      after: summarizeCurriculum(updated),
    });

    return presentCurriculumDetail(updated);
  }
}

@Injectable()
export class ActivateCurriculumUseCase {
  constructor(
    private readonly curriculumRepository: CurriculumRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(curriculumId: string): Promise<CurriculumDetailResponseDto> {
    const scope = requireAcademicsScope();
    const curriculum = await findCurriculumOrThrow(
      this.curriculumRepository,
      curriculumId,
    );
    if (curriculum.status !== CurriculumStatus.DRAFT) {
      throw new CurriculumReadOnlyException({
        curriculumId,
        status: curriculum.status,
        allowedStatus: CurriculumStatus.DRAFT,
      });
    }

    const { unitsCount, lessonsCount } =
      await this.curriculumRepository.countActiveUnitsAndLessons(curriculumId);
    if (unitsCount === 0 || lessonsCount === 0) {
      throw new CurriculumActivationIncompleteException({
        curriculumId,
        unitsCount,
        lessonsCount,
      });
    }

    const updated = await this.curriculumRepository.updateCurriculum(
      curriculumId,
      {
        status: CurriculumStatus.ACTIVE,
        publishedAt: new Date(),
        updatedByUserId: scope.actorId,
      },
    );

    await recordCurriculumAudit(this.authRepository, {
      scope,
      action: 'academics.curriculum.activate',
      resourceType: 'curriculum',
      resourceId: updated.id,
      before: summarizeCurriculum(curriculum),
      after: summarizeCurriculum(updated),
    });

    return presentCurriculumDetail(updated);
  }
}

@Injectable()
export class ArchiveCurriculumUseCase {
  constructor(
    private readonly curriculumRepository: CurriculumRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(curriculumId: string): Promise<CurriculumDetailResponseDto> {
    const scope = requireAcademicsScope();
    const curriculum = await findCurriculumOrThrow(
      this.curriculumRepository,
      curriculumId,
    );
    if (curriculum.status === CurriculumStatus.ARCHIVED) {
      throw new CurriculumReadOnlyException({
        curriculumId,
        status: curriculum.status,
      });
    }

    const updated = await this.curriculumRepository.updateCurriculum(
      curriculumId,
      {
        status: CurriculumStatus.ARCHIVED,
        archivedAt: new Date(),
        updatedByUserId: scope.actorId,
      },
    );

    await recordCurriculumAudit(this.authRepository, {
      scope,
      action: 'academics.curriculum.archive',
      resourceType: 'curriculum',
      resourceId: updated.id,
      before: summarizeCurriculum(curriculum),
      after: summarizeCurriculum(updated),
    });

    return presentCurriculumDetail(updated);
  }
}

@Injectable()
export class DeleteCurriculumUseCase {
  constructor(
    private readonly curriculumRepository: CurriculumRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    curriculumId: string,
  ): Promise<DeleteCurriculumNodeResponseDto> {
    const scope = requireAcademicsScope();
    const curriculum = await findCurriculumOrThrow(
      this.curriculumRepository,
      curriculumId,
    );
    const result =
      await this.curriculumRepository.softDeleteCurriculum(curriculumId);
    if (result.status === 'not_found') {
      throw new CurriculumNotFoundException({ curriculumId });
    }

    await recordCurriculumAudit(this.authRepository, {
      scope,
      action: 'academics.curriculum.delete',
      resourceType: 'curriculum',
      resourceId: curriculum.id,
      before: summarizeCurriculum(curriculum),
      after: summarizeCurriculum(result.curriculum),
    });

    return { ok: true };
  }
}

@Injectable()
export class CreateCurriculumUnitUseCase {
  constructor(
    private readonly curriculumRepository: CurriculumRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    curriculumId: string,
    command: CreateCurriculumUnitDto,
  ): Promise<CurriculumUnitResponseDto> {
    const scope = requireAcademicsScope();
    const curriculum = await findCurriculumOrThrow(
      this.curriculumRepository,
      curriculumId,
    );
    assertCurriculumMutable(curriculum);

    const title = resolveTitle(command.title);
    const sortOrder =
      command.sortOrder ??
      (await this.curriculumRepository.getNextUnitSortOrder(curriculumId));
    assertValidSortOrder(sortOrder);

    const unit = await this.curriculumRepository.createUnit({
      schoolId: scope.schoolId,
      curriculumId,
      title,
      description: normalizeNullableText(command.description),
      sortOrder,
      estimatedLessons: command.estimatedLessons ?? null,
    });

    await recordCurriculumAudit(this.authRepository, {
      scope,
      action: 'academics.curriculum.unit.create',
      resourceType: 'curriculum_unit',
      resourceId: unit.id,
      after: summarizeUnit(unit),
    });

    return presentCurriculumUnit(unit);
  }
}

@Injectable()
export class UpdateCurriculumUnitUseCase {
  constructor(
    private readonly curriculumRepository: CurriculumRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    curriculumId: string,
    unitId: string,
    command: UpdateCurriculumUnitDto,
  ): Promise<CurriculumUnitResponseDto> {
    const scope = requireAcademicsScope();
    const curriculum = await findCurriculumOrThrow(
      this.curriculumRepository,
      curriculumId,
    );
    assertCurriculumMutable(curriculum);
    const unit = await findUnitOrThrow(
      this.curriculumRepository,
      curriculumId,
      unitId,
    );

    const data: Prisma.CurriculumUnitUncheckedUpdateInput = {};
    if (isProvided(command.title)) {
      data.title = resolveTitle(command.title ?? '');
    }
    if (isProvided(command.description)) {
      data.description = normalizeNullableText(command.description);
    }
    if (isProvided(command.estimatedLessons)) {
      data.estimatedLessons = command.estimatedLessons ?? null;
    }

    const updated = await this.curriculumRepository.updateUnit(unitId, data);

    await recordCurriculumAudit(this.authRepository, {
      scope,
      action: 'academics.curriculum.unit.update',
      resourceType: 'curriculum_unit',
      resourceId: updated.id,
      before: summarizeUnit(unit),
      after: summarizeUnit(updated),
    });

    return presentCurriculumUnit(updated);
  }
}

@Injectable()
export class ReorderCurriculumUnitUseCase {
  constructor(
    private readonly curriculumRepository: CurriculumRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    curriculumId: string,
    unitId: string,
    command: ReorderCurriculumNodeDto,
  ): Promise<CurriculumUnitResponseDto> {
    const scope = requireAcademicsScope();
    const curriculum = await findCurriculumOrThrow(
      this.curriculumRepository,
      curriculumId,
    );
    assertCurriculumMutable(curriculum);
    const unit = await findUnitOrThrow(
      this.curriculumRepository,
      curriculumId,
      unitId,
    );
    assertValidSortOrder(command.sortOrder);

    const updated = await this.curriculumRepository.updateUnit(unitId, {
      sortOrder: command.sortOrder,
    });

    await recordCurriculumAudit(this.authRepository, {
      scope,
      action: 'academics.curriculum.unit.reorder',
      resourceType: 'curriculum_unit',
      resourceId: updated.id,
      before: summarizeUnit(unit),
      after: summarizeUnit(updated),
    });

    return presentCurriculumUnit(updated);
  }
}

@Injectable()
export class DeleteCurriculumUnitUseCase {
  constructor(
    private readonly curriculumRepository: CurriculumRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    curriculumId: string,
    unitId: string,
  ): Promise<DeleteCurriculumNodeResponseDto> {
    const scope = requireAcademicsScope();
    const curriculum = await findCurriculumOrThrow(
      this.curriculumRepository,
      curriculumId,
    );
    assertCurriculumMutable(curriculum);
    const unit = await findUnitOrThrow(
      this.curriculumRepository,
      curriculumId,
      unitId,
    );
    const result = await this.curriculumRepository.softDeleteUnit({
      curriculumId,
      unitId,
    });
    if (result.status === 'not_found') {
      throw new CurriculumUnitNotFoundException({ curriculumId, unitId });
    }

    await recordCurriculumAudit(this.authRepository, {
      scope,
      action: 'academics.curriculum.unit.delete',
      resourceType: 'curriculum_unit',
      resourceId: unit.id,
      before: summarizeUnit(unit),
      after: summarizeUnit(result.unit),
    });

    return { ok: true };
  }
}

@Injectable()
export class CreateCurriculumLessonUseCase {
  constructor(
    private readonly curriculumRepository: CurriculumRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    curriculumId: string,
    unitId: string,
    command: CreateCurriculumLessonDto,
  ): Promise<CurriculumLessonResponseDto> {
    const scope = requireAcademicsScope();
    const curriculum = await findCurriculumOrThrow(
      this.curriculumRepository,
      curriculumId,
    );
    assertCurriculumMutable(curriculum);
    await findUnitOrThrow(this.curriculumRepository, curriculumId, unitId);

    const title = resolveTitle(command.title);
    const sortOrder =
      command.sortOrder ??
      (await this.curriculumRepository.getNextLessonSortOrder({
        curriculumId,
        unitId,
      }));
    assertValidSortOrder(sortOrder);

    const objectives = normalizeOptionalObjectives(command.objectives);
    const lesson = await this.curriculumRepository.createLesson({
      schoolId: scope.schoolId,
      curriculumId,
      unitId,
      title,
      description: normalizeNullableText(command.description),
      objectives: objectivesToPrisma(objectives),
      sortOrder,
      estimatedMinutes: command.estimatedMinutes ?? null,
    });

    await recordCurriculumAudit(this.authRepository, {
      scope,
      action: 'academics.curriculum.lesson.create',
      resourceType: 'curriculum_lesson',
      resourceId: lesson.id,
      after: summarizeLesson(lesson),
    });

    return presentCurriculumLesson(lesson);
  }
}

@Injectable()
export class UpdateCurriculumLessonUseCase {
  constructor(
    private readonly curriculumRepository: CurriculumRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    curriculumId: string,
    unitId: string,
    lessonId: string,
    command: UpdateCurriculumLessonDto,
  ): Promise<CurriculumLessonResponseDto> {
    const scope = requireAcademicsScope();
    const curriculum = await findCurriculumOrThrow(
      this.curriculumRepository,
      curriculumId,
    );
    assertCurriculumMutable(curriculum);
    await findUnitOrThrow(this.curriculumRepository, curriculumId, unitId);
    const lesson = await findLessonOrThrow(
      this.curriculumRepository,
      curriculumId,
      unitId,
      lessonId,
    );

    const data: Prisma.CurriculumLessonUncheckedUpdateInput = {};
    if (isProvided(command.title)) {
      data.title = resolveTitle(command.title ?? '');
    }
    if (isProvided(command.description)) {
      data.description = normalizeNullableText(command.description);
    }
    if (isProvided(command.objectives)) {
      data.objectives = objectivesToPrisma(
        normalizeOptionalObjectives(command.objectives),
      );
    }
    if (isProvided(command.estimatedMinutes)) {
      data.estimatedMinutes = command.estimatedMinutes ?? null;
    }

    const updated = await this.curriculumRepository.updateLesson(
      lessonId,
      data,
    );

    await recordCurriculumAudit(this.authRepository, {
      scope,
      action: 'academics.curriculum.lesson.update',
      resourceType: 'curriculum_lesson',
      resourceId: updated.id,
      before: summarizeLesson(lesson),
      after: summarizeLesson(updated),
    });

    return presentCurriculumLesson(updated);
  }
}

@Injectable()
export class ReorderCurriculumLessonUseCase {
  constructor(
    private readonly curriculumRepository: CurriculumRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    curriculumId: string,
    unitId: string,
    lessonId: string,
    command: ReorderCurriculumNodeDto,
  ): Promise<CurriculumLessonResponseDto> {
    const scope = requireAcademicsScope();
    const curriculum = await findCurriculumOrThrow(
      this.curriculumRepository,
      curriculumId,
    );
    assertCurriculumMutable(curriculum);
    await findUnitOrThrow(this.curriculumRepository, curriculumId, unitId);
    const lesson = await findLessonOrThrow(
      this.curriculumRepository,
      curriculumId,
      unitId,
      lessonId,
    );
    assertValidSortOrder(command.sortOrder);

    const updated = await this.curriculumRepository.updateLesson(lessonId, {
      sortOrder: command.sortOrder,
    });

    await recordCurriculumAudit(this.authRepository, {
      scope,
      action: 'academics.curriculum.lesson.reorder',
      resourceType: 'curriculum_lesson',
      resourceId: updated.id,
      before: summarizeLesson(lesson),
      after: summarizeLesson(updated),
    });

    return presentCurriculumLesson(updated);
  }
}

@Injectable()
export class DeleteCurriculumLessonUseCase {
  constructor(
    private readonly curriculumRepository: CurriculumRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    curriculumId: string,
    unitId: string,
    lessonId: string,
  ): Promise<DeleteCurriculumNodeResponseDto> {
    const scope = requireAcademicsScope();
    const curriculum = await findCurriculumOrThrow(
      this.curriculumRepository,
      curriculumId,
    );
    assertCurriculumMutable(curriculum);
    await findUnitOrThrow(this.curriculumRepository, curriculumId, unitId);
    const lesson = await findLessonOrThrow(
      this.curriculumRepository,
      curriculumId,
      unitId,
      lessonId,
    );
    const result = await this.curriculumRepository.softDeleteLesson({
      curriculumId,
      unitId,
      lessonId,
    });
    if (result.status === 'not_found') {
      throw new CurriculumLessonNotFoundException({
        curriculumId,
        unitId,
        lessonId,
      });
    }

    await recordCurriculumAudit(this.authRepository, {
      scope,
      action: 'academics.curriculum.lesson.delete',
      resourceType: 'curriculum_lesson',
      resourceId: lesson.id,
      before: summarizeLesson(lesson),
      after: summarizeLesson(result.lesson),
    });

    return { ok: true };
  }
}

function normalizeListFilters(
  query: ListCurriculaQueryDto,
): ListCurriculaFilters {
  return {
    ...(query.academicYearId ? { academicYearId: query.academicYearId } : {}),
    ...(query.termId ? { termId: query.termId } : {}),
    ...(query.gradeId ? { gradeId: query.gradeId } : {}),
    ...(query.subjectId ? { subjectId: query.subjectId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.search ? { search: query.search } : {}),
  };
}

async function validateAcademicScope(
  repository: CurriculumRepository,
  command: {
    academicYearId: string;
    termId: string;
    gradeId: string;
    subjectId: string;
  },
): Promise<{
  academicYearId: string;
  termId: string;
  gradeId: string;
  subjectId: string;
}> {
  const [academicYear, term, grade, subject] = await Promise.all([
    repository.findAcademicYearById(command.academicYearId),
    repository.findTermById(command.termId),
    repository.findGradeById(command.gradeId),
    repository.findSubjectById(command.subjectId),
  ]);

  if (!academicYear) {
    throw new CurriculumInvalidScopeException({
      field: 'academicYearId',
      academicYearId: command.academicYearId,
    });
  }
  if (!term || term.academicYearId !== academicYear.id) {
    throw new CurriculumInvalidScopeException({
      field: 'termId',
      academicYearId: command.academicYearId,
      termId: command.termId,
    });
  }
  if (!grade) {
    throw new CurriculumInvalidScopeException({
      field: 'gradeId',
      gradeId: command.gradeId,
    });
  }
  if (!subject || !subject.isActive) {
    throw new CurriculumInvalidScopeException({
      field: 'subjectId',
      subjectId: command.subjectId,
    });
  }

  return {
    academicYearId: academicYear.id,
    termId: term.id,
    gradeId: grade.id,
    subjectId: subject.id,
  };
}

async function findCurriculumOrThrow(
  repository: CurriculumRepository,
  curriculumId: string,
): Promise<CurriculumDetailRecord> {
  const curriculum = await repository.findCurriculumById(curriculumId);
  if (!curriculum) {
    throw new CurriculumNotFoundException({ curriculumId });
  }

  return curriculum;
}

async function findUnitOrThrow(
  repository: CurriculumRepository,
  curriculumId: string,
  unitId: string,
): Promise<CurriculumUnitRecord> {
  const unit = await repository.findUnitById({ curriculumId, unitId });
  if (!unit) {
    throw new CurriculumUnitNotFoundException({ curriculumId, unitId });
  }

  return unit;
}

async function findLessonOrThrow(
  repository: CurriculumRepository,
  curriculumId: string,
  unitId: string,
  lessonId: string,
): Promise<CurriculumLessonRecord> {
  const lesson = await repository.findLessonById({
    curriculumId,
    unitId,
    lessonId,
  });
  if (!lesson) {
    throw new CurriculumLessonNotFoundException({
      curriculumId,
      unitId,
      lessonId,
    });
  }

  return lesson;
}

function assertCurriculumMutable(curriculum: CurriculumDetailRecord): void {
  if (curriculum.status === CurriculumStatus.ARCHIVED) {
    throw new CurriculumReadOnlyException({
      curriculumId: curriculum.id,
      status: curriculum.status,
    });
  }
}

function resolveTitle(value: string): string {
  const title = normalizeRequiredTitle(value);
  if (title.length === 0) {
    throw new CurriculumInvalidScopeException({ field: 'title' });
  }

  return title;
}

function assertValidSortOrder(sortOrder: number): void {
  if (!Number.isInteger(sortOrder) || sortOrder < 0) {
    throw new CurriculumInvalidReorderException({ sortOrder });
  }
}

function objectivesToPrisma(
  objectives: string[] | null,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  return objectives ?? Prisma.DbNull;
}

function isProvided(value: unknown): boolean {
  return value !== undefined;
}

interface CurriculumAuditInput {
  scope: AcademicsScope;
  action: string;
  resourceType: string;
  resourceId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

function recordCurriculumAudit(
  authRepository: AuthRepository,
  input: CurriculumAuditInput,
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

function summarizeCurriculum(
  curriculum: CurriculumListRecord | CurriculumDetailRecord,
): Record<string, unknown> {
  return {
    id: curriculum.id,
    academicYearId: curriculum.academicYearId,
    termId: curriculum.termId,
    gradeId: curriculum.gradeId,
    subjectId: curriculum.subjectId,
    title: curriculum.title,
    status: curriculum.status,
    unitCount: curriculum.units.length,
    lessonCount: curriculum.lessons.length,
  };
}

function summarizeUnit(unit: CurriculumUnitRecord): Record<string, unknown> {
  return {
    id: unit.id,
    curriculumId: unit.curriculumId,
    title: unit.title,
    sortOrder: unit.sortOrder,
    estimatedLessons: unit.estimatedLessons,
    lessonCount: unit.lessons.length,
  };
}

function summarizeLesson(
  lesson: CurriculumLessonRecord,
): Record<string, unknown> {
  return {
    id: lesson.id,
    curriculumId: lesson.curriculumId,
    unitId: lesson.unitId,
    title: lesson.title,
    sortOrder: lesson.sortOrder,
    estimatedMinutes: lesson.estimatedMinutes,
  };
}
