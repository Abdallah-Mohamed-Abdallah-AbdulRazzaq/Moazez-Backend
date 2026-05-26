import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  HomeworkAssignmentMode,
  HomeworkAssignmentStatus,
  HomeworkTargetMode,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuthRepository } from '../../iam/auth/infrastructure/auth.repository';
import { HomeworkScope, requireHomeworkScope } from '../homework-context';
import { validateHomeworkQuestionsForPublish } from './homework-questions.use-cases';
import {
  CreateHomeworkAssignmentDto,
  ListHomeworkAssignmentsQueryDto,
  UpdateHomeworkAssignmentDto,
} from '../dto/homework-assignment.dto';
import {
  HomeworkAssignmentAlreadyClosedException,
  HomeworkAssignmentAlreadyPublishedException,
  HomeworkAssignmentAllocationMismatchException,
  HomeworkAssignmentCancelledException,
  HomeworkAssignmentDueDateInvalidException,
  HomeworkAssignmentNoEligibleTargetsException,
  HomeworkAssignmentNotFoundException,
  HomeworkAssignmentNotMutableException,
  HomeworkAssignmentNotPublishableException,
  HomeworkAssignmentScheduleMismatchException,
  HomeworkAssignmentTargetConflictException,
  HomeworkAssignmentTargetRequiredException,
  HomeworkAssignmentValidationException,
} from '../domain/homework.exceptions';
import {
  CreateHomeworkAssignmentData,
  CreateHomeworkTargetData,
  HomeworkAssignmentWithCounters,
  HomeworkRepository,
  HomeworkTeacherAllocationRecord,
  ListHomeworkAssignmentsFilters,
} from '../infrastructure/homework.repository';
import {
  presentHomeworkAssignment,
  presentHomeworkAssignments,
  presentHomeworkTargets,
} from '../presenters/homework-assignment.presenter';

interface ResolvedHomeworkWriteContext {
  academicYearId: string;
  termId: string;
  classroomId: string;
  subjectId: string;
  teacherUserId: string;
  teacherSubjectAllocationId: string;
  timetableEntryId: string | null;
  scheduleDate: Date | null;
  targetMode: HomeworkTargetMode;
  allocation: HomeworkTeacherAllocationRecord;
}

interface HomeworkWriteCommand {
  academicYearId: string;
  termId: string;
  teacherSubjectAllocationId: string;
  timetableEntryId?: string | null;
  scheduleDate?: string | Date | null;
  title: string;
  description?: string | null;
  mode?: HomeworkAssignmentMode;
  targetMode: HomeworkTargetMode;
  studentIds?: string[];
  publishAt?: string | Date | null;
  dueAt: string | Date;
  estimatedMinutes?: number | null;
  totalMarks?: number | null;
  isGraded?: boolean;
}

@Injectable()
export class ListHomeworkAssignmentsUseCase {
  constructor(private readonly homeworkRepository: HomeworkRepository) {}

  async execute(query: ListHomeworkAssignmentsQueryDto) {
    requireHomeworkScope();
    const filters = normalizeListFilters(query);
    const result = await this.homeworkRepository.listAssignments(filters);
    return presentHomeworkAssignments(result);
  }
}

@Injectable()
export class GetHomeworkAssignmentUseCase {
  constructor(private readonly homeworkRepository: HomeworkRepository) {}

  async execute(homeworkId: string) {
    requireHomeworkScope();
    const assignment = await findAssignmentOrThrow(
      this.homeworkRepository,
      homeworkId,
    );
    return presentHomeworkAssignment(assignment);
  }
}

@Injectable()
export class CreateHomeworkAssignmentUseCase {
  constructor(
    private readonly homeworkRepository: HomeworkRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(command: CreateHomeworkAssignmentDto) {
    const scope = requireHomeworkScope();
    const context = await resolveHomeworkWriteContext(
      this.homeworkRepository,
      command,
    );

    const assignmentId = randomUUID();
    const targetStudentIds =
      context.targetMode === HomeworkTargetMode.SELECTED_STUDENTS
        ? command.studentIds
        : undefined;
    const targets = await buildTargetRows({
      repository: this.homeworkRepository,
      scope,
      assignmentId,
      context,
      studentIds: targetStudentIds,
      requireTargets:
        context.targetMode === HomeworkTargetMode.SELECTED_STUDENTS,
    });

    const { data } = buildCreateAssignmentData({
      scope,
      assignmentId,
      command,
      context,
    });

    const assignment =
      await this.homeworkRepository.createAssignmentWithTargets(data, targets);

    await this.authRepository.createAuditLog(
      buildHomeworkAuditEntry({
        scope,
        action: 'homework.assignment.create',
        assignment,
      }),
    );

    return presentHomeworkAssignment(assignment);
  }
}

@Injectable()
export class UpdateHomeworkAssignmentUseCase {
  constructor(
    private readonly homeworkRepository: HomeworkRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(homeworkId: string, command: UpdateHomeworkAssignmentDto) {
    const scope = requireHomeworkScope();
    const assignment = await findAssignmentOrThrow(
      this.homeworkRepository,
      homeworkId,
    );
    assertDraftMutable(assignment);

    const merged = mergeUpdateCommand(assignment, command);
    const context = await resolveHomeworkWriteContext(
      this.homeworkRepository,
      merged,
    );
    const selectedStudentIds = await resolveSelectedStudentIdsForUpdate(
      this.homeworkRepository,
      homeworkId,
      context.targetMode,
      command,
    );
    const targets = await buildTargetRows({
      repository: this.homeworkRepository,
      scope,
      assignmentId: homeworkId,
      context,
      studentIds: selectedStudentIds,
      requireTargets:
        context.targetMode === HomeworkTargetMode.SELECTED_STUDENTS,
    });

    const data = buildUpdateAssignmentData(command, merged, context);
    const updated = await this.homeworkRepository.updateAssignmentWithTargets(
      homeworkId,
      data,
      targets,
    );

    await this.authRepository.createAuditLog(
      buildHomeworkAuditEntry({
        scope,
        action: 'homework.assignment.update',
        assignment: updated,
        before: summarizeAssignmentForAudit(assignment),
      }),
    );

    return presentHomeworkAssignment(updated);
  }
}

@Injectable()
export class PublishHomeworkAssignmentUseCase {
  constructor(
    private readonly homeworkRepository: HomeworkRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(homeworkId: string) {
    const scope = requireHomeworkScope();
    const assignment = await findAssignmentOrThrow(
      this.homeworkRepository,
      homeworkId,
    );
    assertPublishable(assignment);

    const context = await resolveHomeworkWriteContext(
      this.homeworkRepository,
      assignmentToWriteCommand(assignment),
    );
    const selectedStudentIds =
      assignment.targetMode === HomeworkTargetMode.SELECTED_STUDENTS
        ? await this.homeworkRepository.listCurrentTargetStudentIds(homeworkId)
        : undefined;
    const targets = await buildTargetRows({
      repository: this.homeworkRepository,
      scope,
      assignmentId: homeworkId,
      context,
      studentIds: selectedStudentIds?.map((target) => target.studentId),
      requireTargets: true,
    });

    assertDueDate({
      dueAt: assignment.dueAt,
      publishAt: assignment.publishAt,
      now: new Date(),
    });
    await validateHomeworkQuestionsForPublish(
      this.homeworkRepository,
      homeworkId,
    );

    const now = new Date();
    const updated = await this.homeworkRepository.publishAssignmentWithTargets(
      homeworkId,
      {
        status: HomeworkAssignmentStatus.PUBLISHED,
        publishedAt: now,
        publishedByUserId: scope.actorId,
      },
      targets,
    );

    await this.authRepository.createAuditLog(
      buildHomeworkAuditEntry({
        scope,
        action: 'homework.assignment.publish',
        assignment: updated,
        before: summarizeAssignmentForAudit(assignment),
      }),
    );

    return presentHomeworkAssignment(updated);
  }
}

@Injectable()
export class CloseHomeworkAssignmentUseCase {
  constructor(
    private readonly homeworkRepository: HomeworkRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(homeworkId: string) {
    const scope = requireHomeworkScope();
    const assignment = await findAssignmentOrThrow(
      this.homeworkRepository,
      homeworkId,
    );
    assertClosable(assignment);

    const updated = await this.homeworkRepository.updateAssignmentStatus(
      homeworkId,
      {
        status: HomeworkAssignmentStatus.CLOSED,
        closedAt: new Date(),
      },
    );

    await this.authRepository.createAuditLog(
      buildHomeworkAuditEntry({
        scope,
        action: 'homework.assignment.close',
        assignment: updated,
        before: summarizeAssignmentForAudit(assignment),
      }),
    );

    return presentHomeworkAssignment(updated);
  }
}

@Injectable()
export class CancelHomeworkAssignmentUseCase {
  constructor(
    private readonly homeworkRepository: HomeworkRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(homeworkId: string) {
    const scope = requireHomeworkScope();
    const assignment = await findAssignmentOrThrow(
      this.homeworkRepository,
      homeworkId,
    );
    assertCancellable(assignment);

    const updated = await this.homeworkRepository.updateAssignmentStatus(
      homeworkId,
      {
        status: HomeworkAssignmentStatus.CANCELLED,
        cancelledAt: new Date(),
      },
    );

    await this.authRepository.createAuditLog(
      buildHomeworkAuditEntry({
        scope,
        action: 'homework.assignment.cancel',
        assignment: updated,
        before: summarizeAssignmentForAudit(assignment),
      }),
    );

    return presentHomeworkAssignment(updated);
  }
}

@Injectable()
export class ListHomeworkTargetsUseCase {
  constructor(private readonly homeworkRepository: HomeworkRepository) {}

  async execute(homeworkId: string) {
    requireHomeworkScope();
    await findAssignmentOrThrow(this.homeworkRepository, homeworkId);
    const targets = await this.homeworkRepository.listTargets(homeworkId);
    return presentHomeworkTargets(targets);
  }
}

@Injectable()
export class ResolveHomeworkTargetsUseCase {
  constructor(
    private readonly homeworkRepository: HomeworkRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(homeworkId: string) {
    const scope = requireHomeworkScope();
    const assignment = await findAssignmentOrThrow(
      this.homeworkRepository,
      homeworkId,
    );
    assertDraftMutable(assignment);

    const selectedStudentIds =
      assignment.targetMode === HomeworkTargetMode.SELECTED_STUDENTS
        ? await this.homeworkRepository.listCurrentTargetStudentIds(homeworkId)
        : undefined;
    const context = await resolveHomeworkWriteContext(
      this.homeworkRepository,
      assignmentToWriteCommand(assignment),
    );
    const targets = await buildTargetRows({
      repository: this.homeworkRepository,
      scope,
      assignmentId: homeworkId,
      context,
      studentIds: selectedStudentIds?.map((target) => target.studentId),
      requireTargets:
        assignment.targetMode === HomeworkTargetMode.SELECTED_STUDENTS,
    });

    const updated = await this.homeworkRepository.replaceTargets(
      homeworkId,
      targets,
    );

    await this.authRepository.createAuditLog(
      buildHomeworkAuditEntry({
        scope,
        action: 'homework.targets.resolve',
        assignment: updated,
        before: summarizeAssignmentForAudit(assignment),
      }),
    );

    return presentHomeworkAssignment(updated);
  }
}

async function findAssignmentOrThrow(
  repository: HomeworkRepository,
  homeworkId: string,
): Promise<HomeworkAssignmentWithCounters> {
  const assignment = await repository.findAssignmentById(homeworkId);
  if (!assignment) {
    throw new HomeworkAssignmentNotFoundException({ homeworkId });
  }

  return assignment;
}

function normalizeListFilters(
  query: ListHomeworkAssignmentsQueryDto,
): ListHomeworkAssignmentsFilters {
  return {
    ...(query.academicYearId ? { academicYearId: query.academicYearId } : {}),
    ...(query.termId ? { termId: query.termId } : {}),
    ...(query.classroomId ? { classroomId: query.classroomId } : {}),
    ...(query.teacherUserId ? { teacherUserId: query.teacherUserId } : {}),
    ...(query.teacherSubjectAllocationId
      ? { teacherSubjectAllocationId: query.teacherSubjectAllocationId }
      : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.mode ? { mode: query.mode } : {}),
    ...(query.dueFrom
      ? { dueFrom: parseDateBoundary(query.dueFrom, 'start', 'dueFrom') }
      : {}),
    ...(query.dueTo
      ? { dueTo: parseDateBoundary(query.dueTo, 'end', 'dueTo') }
      : {}),
    ...(query.search ? { search: query.search } : {}),
    page: query.page ?? 1,
    limit: query.limit ?? 25,
  };
}

async function resolveHomeworkWriteContext(
  repository: HomeworkRepository,
  command: {
    academicYearId: string;
    termId: string;
    teacherSubjectAllocationId: string;
    timetableEntryId?: string | null;
    scheduleDate?: string | Date | null;
    targetMode?: HomeworkTargetMode | null;
  },
): Promise<ResolvedHomeworkWriteContext> {
  const allocation = await repository.findTeacherAllocationById(
    command.teacherSubjectAllocationId,
  );

  if (!allocation) {
    throw new HomeworkAssignmentAllocationMismatchException({
      teacherSubjectAllocationId: command.teacherSubjectAllocationId,
    });
  }

  if (
    allocation.termId !== command.termId ||
    allocation.term.academicYearId !== command.academicYearId
  ) {
    throw new HomeworkAssignmentAllocationMismatchException({
      academicYearId: command.academicYearId,
      termId: command.termId,
      teacherSubjectAllocationId: command.teacherSubjectAllocationId,
    });
  }

  const timetableEntryId = command.timetableEntryId ?? null;
  const scheduleDate = normalizeScheduleDate(command.scheduleDate);

  if (!timetableEntryId) {
    if (scheduleDate) {
      throw new HomeworkAssignmentScheduleMismatchException({
        field: 'scheduleDate',
      });
    }

    return {
      academicYearId: command.academicYearId,
      termId: command.termId,
      classroomId: allocation.classroomId,
      subjectId: allocation.subjectId,
      teacherUserId: allocation.teacherUserId,
      teacherSubjectAllocationId: allocation.id,
      timetableEntryId: null,
      scheduleDate: null,
      targetMode: command.targetMode ?? HomeworkTargetMode.CLASSROOM,
      allocation,
    };
  }

  const entry = await repository.findTimetableEntryById(timetableEntryId);
  if (!entry || !repository.isPublishedTimetableEntry(entry)) {
    throw new HomeworkAssignmentScheduleMismatchException({
      timetableEntryId,
    });
  }

  if (
    entry.academicYearId !== command.academicYearId ||
    entry.termId !== command.termId ||
    entry.classroomId !== allocation.classroomId ||
    entry.subjectId !== allocation.subjectId ||
    entry.teacherUserId !== allocation.teacherUserId ||
    entry.teacherSubjectAllocationId !== allocation.id
  ) {
    throw new HomeworkAssignmentScheduleMismatchException({
      timetableEntryId,
      teacherSubjectAllocationId: allocation.id,
    });
  }

  if (
    scheduleDate &&
    !isDateWithinRange(
      scheduleDate,
      allocation.term.startDate,
      allocation.term.endDate,
    )
  ) {
    throw new HomeworkAssignmentScheduleMismatchException({
      field: 'scheduleDate',
      termId: allocation.termId,
    });
  }

  return {
    academicYearId: command.academicYearId,
    termId: command.termId,
    classroomId: allocation.classroomId,
    subjectId: allocation.subjectId,
    teacherUserId: allocation.teacherUserId,
    teacherSubjectAllocationId: allocation.id,
    timetableEntryId: entry.id,
    scheduleDate,
    targetMode: command.targetMode ?? HomeworkTargetMode.CLASSROOM,
    allocation,
  };
}

async function buildTargetRows(input: {
  repository: HomeworkRepository;
  scope: HomeworkScope;
  assignmentId: string;
  context: ResolvedHomeworkWriteContext;
  studentIds?: string[];
  requireTargets: boolean;
}): Promise<CreateHomeworkTargetData[]> {
  const studentIds =
    input.context.targetMode === HomeworkTargetMode.SELECTED_STUDENTS
      ? uniqueIds(input.studentIds ?? [])
      : undefined;

  if (
    input.context.targetMode === HomeworkTargetMode.SELECTED_STUDENTS &&
    (!studentIds || studentIds.length === 0)
  ) {
    throw new HomeworkAssignmentTargetRequiredException({
      targetMode: input.context.targetMode,
    });
  }

  const enrollments = await input.repository.findEligibleEnrollments({
    academicYearId: input.context.academicYearId,
    termId: input.context.termId,
    classroomId: input.context.classroomId,
    studentIds,
  });

  if (studentIds && enrollments.length !== studentIds.length) {
    throw new HomeworkAssignmentTargetConflictException({
      targetMode: input.context.targetMode,
      requestedCount: studentIds.length,
      eligibleCount: enrollments.length,
    });
  }

  if (input.requireTargets && enrollments.length === 0) {
    throw new HomeworkAssignmentNoEligibleTargetsException({
      targetMode: input.context.targetMode,
    });
  }

  return enrollments.map((enrollment) => ({
    schoolId: input.scope.schoolId,
    homeworkAssignmentId: input.assignmentId,
    studentId: enrollment.studentId,
    enrollmentId: enrollment.id,
  }));
}

function buildCreateAssignmentData(input: {
  scope: HomeworkScope;
  assignmentId: string;
  command: CreateHomeworkAssignmentDto;
  context: ResolvedHomeworkWriteContext;
}): { data: CreateHomeworkAssignmentData } {
  const dueAt = parseRequiredDateTime(input.command.dueAt, 'dueAt');
  const publishAt = parseNullableDateTime(input.command.publishAt, 'publishAt');
  assertDueDate({ dueAt, publishAt, now: new Date() });

  const isGraded = input.command.isGraded ?? false;
  const totalMarks =
    input.command.totalMarks === undefined || input.command.totalMarks === null
      ? null
      : new Prisma.Decimal(input.command.totalMarks);
  assertGradingContract({ isGraded, totalMarks });

  return {
    data: {
      id: input.assignmentId,
      schoolId: input.scope.schoolId,
      academicYearId: input.context.academicYearId,
      termId: input.context.termId,
      classroomId: input.context.classroomId,
      subjectId: input.context.subjectId,
      teacherUserId: input.context.teacherUserId,
      teacherSubjectAllocationId: input.context.teacherSubjectAllocationId,
      timetableEntryId: input.context.timetableEntryId,
      scheduleDate: input.context.scheduleDate,
      title: input.command.title.trim(),
      description: normalizeNullableText(input.command.description),
      mode: input.command.mode ?? HomeworkAssignmentMode.HOMEWORK,
      status: HomeworkAssignmentStatus.DRAFT,
      targetMode: input.context.targetMode,
      publishAt,
      dueAt,
      estimatedMinutes: input.command.estimatedMinutes ?? null,
      totalMarks,
      isGraded,
      createdByUserId: input.scope.actorId,
    },
  };
}

function buildUpdateAssignmentData(
  command: UpdateHomeworkAssignmentDto,
  merged: HomeworkWriteCommand,
  context: ResolvedHomeworkWriteContext,
) {
  const dueAt = parseRequiredDateTime(merged.dueAt, 'dueAt');
  const publishAt = parseNullableDateTime(merged.publishAt, 'publishAt');
  assertDueDate({ dueAt, publishAt, now: new Date() });

  const isGraded = merged.isGraded ?? false;
  const totalMarks =
    merged.totalMarks === undefined || merged.totalMarks === null
      ? null
      : new Prisma.Decimal(merged.totalMarks);
  assertGradingContract({ isGraded, totalMarks });

  const data = {
    academicYearId: context.academicYearId,
    termId: context.termId,
    classroomId: context.classroomId,
    subjectId: context.subjectId,
    teacherUserId: context.teacherUserId,
    teacherSubjectAllocationId: context.teacherSubjectAllocationId,
    timetableEntryId: context.timetableEntryId,
    scheduleDate: context.scheduleDate,
    title: merged.title.trim(),
    description: normalizeNullableText(merged.description),
    mode: merged.mode ?? HomeworkAssignmentMode.HOMEWORK,
    targetMode: context.targetMode,
    publishAt,
    dueAt,
    estimatedMinutes: merged.estimatedMinutes ?? null,
    totalMarks,
    isGraded,
  };

  // PATCH is draft-only in 13B, so sending the complete write surface keeps
  // derived allocation state coherent after allocation or term changes.
  return data;
}

function mergeUpdateCommand(
  assignment: HomeworkAssignmentWithCounters,
  command: UpdateHomeworkAssignmentDto,
): HomeworkWriteCommand {
  return {
    academicYearId: command.academicYearId ?? assignment.academicYearId,
    termId: command.termId ?? assignment.termId,
    teacherSubjectAllocationId:
      command.teacherSubjectAllocationId ??
      assignment.teacherSubjectAllocationId,
    timetableEntryId: hasOwn(command, 'timetableEntryId')
      ? (command.timetableEntryId ?? null)
      : assignment.timetableEntryId,
    scheduleDate: hasOwn(command, 'scheduleDate')
      ? (command.scheduleDate ?? null)
      : assignment.scheduleDate,
    title: command.title ?? assignment.title,
    description: hasOwn(command, 'description')
      ? (command.description ?? null)
      : assignment.description,
    mode: command.mode ?? assignment.mode,
    targetMode: command.targetMode ?? assignment.targetMode,
    studentIds: command.studentIds,
    publishAt: hasOwn(command, 'publishAt')
      ? (command.publishAt ?? null)
      : assignment.publishAt,
    dueAt: command.dueAt ?? assignment.dueAt.toISOString(),
    estimatedMinutes: hasOwn(command, 'estimatedMinutes')
      ? (command.estimatedMinutes ?? null)
      : assignment.estimatedMinutes,
    totalMarks: hasOwn(command, 'totalMarks')
      ? (command.totalMarks ?? null)
      : decimalToNumber(assignment.totalMarks),
    isGraded: command.isGraded ?? assignment.isGraded,
  };
}

async function resolveSelectedStudentIdsForUpdate(
  repository: HomeworkRepository,
  homeworkId: string,
  targetMode: HomeworkTargetMode,
  command: UpdateHomeworkAssignmentDto,
): Promise<string[] | undefined> {
  if (targetMode !== HomeworkTargetMode.SELECTED_STUDENTS) {
    return undefined;
  }

  if (hasOwn(command, 'studentIds')) {
    return command.studentIds ?? [];
  }

  const currentTargets =
    await repository.listCurrentTargetStudentIds(homeworkId);
  return currentTargets.map((target) => target.studentId);
}

function assignmentToWriteCommand(assignment: HomeworkAssignmentWithCounters) {
  return {
    academicYearId: assignment.academicYearId,
    termId: assignment.termId,
    teacherSubjectAllocationId: assignment.teacherSubjectAllocationId,
    timetableEntryId: assignment.timetableEntryId,
    scheduleDate: assignment.scheduleDate,
    targetMode: assignment.targetMode,
  };
}

function assertDraftMutable(assignment: HomeworkAssignmentWithCounters): void {
  if (assignment.status === HomeworkAssignmentStatus.DRAFT) return;
  if (assignment.status === HomeworkAssignmentStatus.PUBLISHED) {
    throw new HomeworkAssignmentNotMutableException({
      homeworkId: assignment.id,
      status: assignment.status,
    });
  }
  if (assignment.status === HomeworkAssignmentStatus.CANCELLED) {
    throw new HomeworkAssignmentCancelledException({
      homeworkId: assignment.id,
    });
  }
  if (assignment.status === HomeworkAssignmentStatus.CLOSED) {
    throw new HomeworkAssignmentAlreadyClosedException({
      homeworkId: assignment.id,
    });
  }

  throw new HomeworkAssignmentNotMutableException({
    homeworkId: assignment.id,
    status: assignment.status,
  });
}

function assertPublishable(assignment: HomeworkAssignmentWithCounters): void {
  if (assignment.status === HomeworkAssignmentStatus.DRAFT) return;
  if (assignment.status === HomeworkAssignmentStatus.PUBLISHED) {
    throw new HomeworkAssignmentAlreadyPublishedException({
      homeworkId: assignment.id,
    });
  }
  if (assignment.status === HomeworkAssignmentStatus.CANCELLED) {
    throw new HomeworkAssignmentCancelledException({
      homeworkId: assignment.id,
    });
  }
  if (assignment.status === HomeworkAssignmentStatus.CLOSED) {
    throw new HomeworkAssignmentAlreadyClosedException({
      homeworkId: assignment.id,
    });
  }

  throw new HomeworkAssignmentNotPublishableException({
    homeworkId: assignment.id,
    status: assignment.status,
  });
}

function assertClosable(assignment: HomeworkAssignmentWithCounters): void {
  if (assignment.status === HomeworkAssignmentStatus.PUBLISHED) return;
  if (assignment.status === HomeworkAssignmentStatus.CLOSED) {
    throw new HomeworkAssignmentAlreadyClosedException({
      homeworkId: assignment.id,
    });
  }
  if (assignment.status === HomeworkAssignmentStatus.CANCELLED) {
    throw new HomeworkAssignmentCancelledException({
      homeworkId: assignment.id,
    });
  }

  throw new HomeworkAssignmentNotMutableException({
    homeworkId: assignment.id,
    status: assignment.status,
  });
}

function assertCancellable(assignment: HomeworkAssignmentWithCounters): void {
  if (
    assignment.status === HomeworkAssignmentStatus.DRAFT ||
    assignment.status === HomeworkAssignmentStatus.PUBLISHED
  ) {
    return;
  }
  if (assignment.status === HomeworkAssignmentStatus.CLOSED) {
    throw new HomeworkAssignmentAlreadyClosedException({
      homeworkId: assignment.id,
    });
  }
  if (assignment.status === HomeworkAssignmentStatus.CANCELLED) {
    throw new HomeworkAssignmentCancelledException({
      homeworkId: assignment.id,
    });
  }

  throw new HomeworkAssignmentNotMutableException({
    homeworkId: assignment.id,
    status: assignment.status,
  });
}

function assertDueDate(input: {
  dueAt: Date;
  publishAt?: Date | null;
  now: Date;
}): void {
  if (input.dueAt.getTime() <= input.now.getTime()) {
    throw new HomeworkAssignmentDueDateInvalidException({
      field: 'dueAt',
      reason: 'must_be_in_future',
    });
  }

  if (input.publishAt && input.dueAt.getTime() <= input.publishAt.getTime()) {
    throw new HomeworkAssignmentDueDateInvalidException({
      field: 'dueAt',
      reason: 'must_be_after_publish_at',
    });
  }
}

function assertGradingContract(input: {
  isGraded: boolean;
  totalMarks: Prisma.Decimal | null;
}): void {
  if (input.isGraded && !input.totalMarks) {
    throw new HomeworkAssignmentValidationException({
      field: 'totalMarks',
      reason: 'required_when_graded',
    });
  }
}

function normalizeNullableText(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null) return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function parseRequiredDateTime(value: string | Date, field: string): Date {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new HomeworkAssignmentDueDateInvalidException({ field });
  }

  return parsed;
}

function parseNullableDateTime(
  value: string | Date | null | undefined,
  field: string,
): Date | null {
  if (value === undefined || value === null || value === '') return null;
  return parseRequiredDateTime(value, field);
}

function parseDateBoundary(
  value: string,
  boundary: 'start' | 'end',
  field: string,
): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new HomeworkAssignmentDueDateInvalidException({ field });
  }

  if (!value.includes('T')) {
    date.setUTCHours(
      boundary === 'start' ? 0 : 23,
      boundary === 'start' ? 0 : 59,
      boundary === 'start' ? 0 : 59,
      boundary === 'start' ? 0 : 999,
    );
  }

  return date;
}

function normalizeScheduleDate(
  value: string | Date | null | undefined,
): Date | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new HomeworkAssignmentScheduleMismatchException({
      field: 'scheduleDate',
    });
  }

  parsed.setUTCHours(0, 0, 0, 0);
  return parsed;
}

function isDateWithinRange(date: Date, start: Date, end: Date): boolean {
  const dateKey = date.toISOString().slice(0, 10);
  const startKey = start.toISOString().slice(0, 10);
  const endKey = end.toISOString().slice(0, 10);
  return dateKey >= startKey && dateKey <= endKey;
}

function decimalToNumber(
  value: Prisma.Decimal | number | string | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && 'toNumber' in value) return value.toNumber();
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

function hasOwn<T extends object>(object: T, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function buildHomeworkAuditEntry(input: {
  scope: HomeworkScope;
  action: string;
  assignment: HomeworkAssignmentWithCounters;
  before?: Record<string, unknown>;
}) {
  return {
    actorId: input.scope.actorId,
    userType: input.scope.userType,
    organizationId: input.scope.organizationId,
    schoolId: input.scope.schoolId,
    module: 'homework',
    action: input.action,
    resourceType: 'homework_assignment',
    resourceId: input.assignment.id,
    outcome: AuditOutcome.SUCCESS,
    before: input.before,
    after: summarizeAssignmentForAudit(input.assignment),
  };
}

function summarizeAssignmentForAudit(
  assignment: HomeworkAssignmentWithCounters,
): Record<string, unknown> {
  return {
    id: assignment.id,
    title: assignment.title,
    status: assignment.status,
    mode: assignment.mode,
    targetMode: assignment.targetMode,
    dueAt: assignment.dueAt.toISOString(),
    totalTargets: assignment.counters.totalTargets,
  };
}
