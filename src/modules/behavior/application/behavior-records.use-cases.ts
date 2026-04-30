import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  BehaviorRecordStatus,
  Prisma,
} from '@prisma/client';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../common/exceptions/domain-exception';
import { BehaviorScope, requireBehaviorScope } from '../behavior-context';
import {
  assertBehaviorOccurredAtInsideTerm,
  assertBehaviorRecordCanCancel,
  assertBehaviorRecordCanSubmit,
  assertBehaviorRecordCanUpdate,
  assertBehaviorRecordCategoryActive,
  assertBehaviorRecordCategoryCompatible,
  assertBehaviorRecordContentPresent,
  assertBehaviorRecordPointsCompatible,
  BehaviorRecordCategoryDefaults,
  BehaviorScopeInvalidException,
  deriveBehaviorRecordDefaultsFromCategory,
  hasOwn,
  normalizeBehaviorRecordStatus,
  normalizeBehaviorRecordType,
  normalizeBehaviorSeverity,
  normalizeNullableText,
  parseBehaviorIsoDate,
} from '../domain/behavior-records-domain';
import {
  CancelBehaviorRecordDto,
  CreateBehaviorRecordDto,
  ListBehaviorRecordsQueryDto,
  UpdateBehaviorRecordDto,
} from '../dto/behavior-records.dto';
import {
  BehaviorEnrollmentRecord,
  BehaviorRecordAuditInput,
  BehaviorRecordCategoryRecord,
  BehaviorRecordRecord,
  BehaviorRecordsRepository,
  BehaviorTermRecord,
  ListBehaviorRecordsFilters,
} from '../infrastructure/behavior-records.repository';
import {
  presentBehaviorRecord,
  presentBehaviorRecordList,
} from '../presenters/behavior-records.presenter';

@Injectable()
export class ListBehaviorRecordsUseCase {
  constructor(
    private readonly behaviorRecordsRepository: BehaviorRecordsRepository,
  ) {}

  async execute(query: ListBehaviorRecordsQueryDto) {
    requireBehaviorScope();
    const filters = await normalizeBehaviorRecordListFilters({
      query,
      repository: this.behaviorRecordsRepository,
    });
    const result = await this.behaviorRecordsRepository.listRecords(filters);

    return presentBehaviorRecordList({
      ...result,
      limit: filters.limit ?? null,
      offset: filters.offset ?? null,
    });
  }
}

@Injectable()
export class GetBehaviorRecordUseCase {
  constructor(
    private readonly behaviorRecordsRepository: BehaviorRecordsRepository,
  ) {}

  async execute(recordId: string) {
    requireBehaviorScope();
    const record = await requireBehaviorRecord(
      this.behaviorRecordsRepository,
      recordId,
    );

    return presentBehaviorRecord(record);
  }
}

@Injectable()
export class CreateBehaviorRecordUseCase {
  constructor(
    private readonly behaviorRecordsRepository: BehaviorRecordsRepository,
  ) {}

  async execute(command: CreateBehaviorRecordDto) {
    const scope = requireBehaviorScope();
    const input = await buildCreateBehaviorRecordInput({
      scope,
      repository: this.behaviorRecordsRepository,
      command,
    });

    const record = await this.behaviorRecordsRepository.createRecord({
      schoolId: scope.schoolId,
      data: input.data,
      buildAuditEntry: (created) =>
        buildBehaviorRecordAuditEntry({
          scope,
          action: 'behavior.record.create',
          record: created,
        }),
    });

    return presentBehaviorRecord(record);
  }
}

@Injectable()
export class UpdateBehaviorRecordUseCase {
  constructor(
    private readonly behaviorRecordsRepository: BehaviorRecordsRepository,
  ) {}

  async execute(recordId: string, command: UpdateBehaviorRecordDto) {
    const scope = requireBehaviorScope();
    const existing = await requireBehaviorRecord(
      this.behaviorRecordsRepository,
      recordId,
    );
    assertBehaviorRecordCanUpdate(existing.status);

    const input = await buildUpdateBehaviorRecordInput({
      repository: this.behaviorRecordsRepository,
      existing,
      command,
    });

    const record = await this.behaviorRecordsRepository.updateRecord({
      schoolId: scope.schoolId,
      recordId: existing.id,
      data: input.data,
      buildAuditEntry: (updated) =>
        buildBehaviorRecordAuditEntry({
          scope,
          action: 'behavior.record.update',
          record: updated,
          before: existing,
        }),
    });

    return presentBehaviorRecord(record);
  }
}

@Injectable()
export class SubmitBehaviorRecordUseCase {
  constructor(
    private readonly behaviorRecordsRepository: BehaviorRecordsRepository,
  ) {}

  async execute(recordId: string) {
    const scope = requireBehaviorScope();
    const existing = await requireBehaviorRecord(
      this.behaviorRecordsRepository,
      recordId,
    );
    assertBehaviorRecordCanSubmit(existing.status);
    await validateSubmittableBehaviorRecord({
      repository: this.behaviorRecordsRepository,
      record: existing,
    });

    const submittedAt = new Date();
    const record = await this.behaviorRecordsRepository.submitRecord({
      schoolId: scope.schoolId,
      recordId: existing.id,
      data: {
        status: BehaviorRecordStatus.SUBMITTED,
        submittedAt,
        submittedById: scope.actorId,
      },
      buildAuditEntry: (updated) =>
        buildBehaviorRecordAuditEntry({
          scope,
          action: 'behavior.record.submit',
          record: updated,
          before: existing,
        }),
    });

    return presentBehaviorRecord(record);
  }
}

@Injectable()
export class CancelBehaviorRecordUseCase {
  constructor(
    private readonly behaviorRecordsRepository: BehaviorRecordsRepository,
  ) {}

  async execute(recordId: string, command: CancelBehaviorRecordDto) {
    const scope = requireBehaviorScope();
    const existing = await requireBehaviorRecord(
      this.behaviorRecordsRepository,
      recordId,
    );
    assertBehaviorRecordCanCancel(existing.status);

    const data: Prisma.BehaviorRecordUncheckedUpdateManyInput = {
      status: BehaviorRecordStatus.CANCELLED,
      cancelledAt: new Date(),
      cancelledById: scope.actorId,
      cancellationReasonEn: normalizeNullableText(
        command.cancellationReasonEn,
      ),
      cancellationReasonAr: normalizeNullableText(
        command.cancellationReasonAr,
      ),
    };
    if (hasOwn(command, 'metadata')) {
      data.metadata = toNullableJson(command.metadata);
    }

    const record = await this.behaviorRecordsRepository.cancelRecord({
      schoolId: scope.schoolId,
      recordId: existing.id,
      data,
      buildAuditEntry: (updated) =>
        buildBehaviorRecordAuditEntry({
          scope,
          action: 'behavior.record.cancel',
          record: updated,
          before: existing,
          extraMetadata: {
            cancellationReasonProvided: Boolean(
              normalizeNullableText(command.cancellationReasonEn) ||
                normalizeNullableText(command.cancellationReasonAr),
            ),
          },
        }),
    });

    return presentBehaviorRecord(record);
  }
}

async function normalizeBehaviorRecordListFilters(params: {
  query: ListBehaviorRecordsQueryDto;
  repository: BehaviorRecordsRepository;
}): Promise<ListBehaviorRecordsFilters> {
  const query = params.query;

  if (query.academicYearId) {
    await requireAcademicYear(params.repository, query.academicYearId);
  }

  let term: BehaviorTermRecord | null = null;
  if (query.termId) {
    term = await requireTerm(params.repository, query.termId);
    if (
      query.academicYearId &&
      term.academicYearId !== query.academicYearId
    ) {
      throw new BehaviorScopeInvalidException({
        academicYearId: query.academicYearId,
        termId: query.termId,
      });
    }
  }

  if (query.studentId) {
    await requireStudent(params.repository, query.studentId);
  }

  if (query.categoryId) {
    await requireCategory(params.repository, query.categoryId, {
      includeDeleted: query.includeDeleted ?? false,
    });
  }

  if (query.enrollmentId) {
    const enrollment = await requireEnrollment(
      params.repository,
      query.enrollmentId,
    );
    assertEnrollmentMatchesScope({
      enrollment,
      studentId: query.studentId,
      academicYearId: query.academicYearId,
      termId: query.termId,
    });
  }

  return {
    ...(query.academicYearId
      ? { academicYearId: query.academicYearId }
      : {}),
    ...(query.termId ? { termId: query.termId } : {}),
    ...(query.studentId ? { studentId: query.studentId } : {}),
    ...(query.enrollmentId ? { enrollmentId: query.enrollmentId } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.type ? { type: normalizeBehaviorRecordType(query.type) } : {}),
    ...(query.severity
      ? { severity: normalizeBehaviorSeverity(query.severity) }
      : {}),
    ...(query.status
      ? { status: normalizeBehaviorRecordStatus(query.status) }
      : {}),
    ...(query.occurredFrom
      ? {
          occurredFrom: parseBehaviorIsoDate(
            query.occurredFrom,
            'occurredFrom',
          ),
        }
      : {}),
    ...(query.occurredTo
      ? {
          occurredTo: parseBehaviorIsoDate(query.occurredTo, 'occurredTo'),
        }
      : {}),
    ...(query.createdById ? { createdById: query.createdById } : {}),
    ...(query.search ? { search: query.search } : {}),
    includeDeleted: query.includeDeleted ?? false,
    ...(query.limit !== undefined ? { limit: query.limit } : {}),
    ...(query.offset !== undefined ? { offset: query.offset } : {}),
  };
}

async function buildCreateBehaviorRecordInput(params: {
  scope: BehaviorScope;
  repository: BehaviorRecordsRepository;
  command: CreateBehaviorRecordDto;
}): Promise<{
  data: Omit<Prisma.BehaviorRecordUncheckedCreateInput, 'schoolId'>;
}> {
  const academicYear = await requireAcademicYear(
    params.repository,
    params.command.academicYearId,
  );
  void academicYear;

  const term = params.command.termId
    ? await requireTerm(params.repository, params.command.termId)
    : null;
  if (term && term.academicYearId !== params.command.academicYearId) {
    throw new BehaviorScopeInvalidException({
      academicYearId: params.command.academicYearId,
      termId: term.id,
    });
  }

  await requireStudent(params.repository, params.command.studentId);

  const enrollment = params.command.enrollmentId
    ? await requireEnrollment(params.repository, params.command.enrollmentId)
    : await params.repository.findEnrollmentForStudent({
        studentId: params.command.studentId,
        academicYearId: params.command.academicYearId,
        termId: params.command.termId ?? null,
      });

  if (enrollment) {
    assertEnrollmentMatchesScope({
      enrollment,
      studentId: params.command.studentId,
      academicYearId: params.command.academicYearId,
      termId: params.command.termId,
    });
  }

  const category = params.command.categoryId
    ? await requireCategory(params.repository, params.command.categoryId)
    : null;
  const defaults = deriveBehaviorRecordDefaultsFromCategory({
    category,
    type: params.command.type,
    severity: params.command.severity,
    points: params.command.points,
  });

  const occurredAt = parseBehaviorIsoDate(
    params.command.occurredAt,
    'occurredAt',
  );
  assertBehaviorOccurredAtInsideTerm({ occurredAt, term });

  const content = normalizeRecordContent(params.command);
  assertBehaviorRecordContentPresent(content);
  assertBehaviorRecordPointsCompatible({
    type: defaults.type,
    points: defaults.points,
  });

  return {
    data: {
      academicYearId: params.command.academicYearId,
      termId: params.command.termId ?? null,
      studentId: params.command.studentId,
      enrollmentId: enrollment?.id ?? null,
      categoryId: category?.id ?? null,
      type: defaults.type,
      severity: defaults.severity,
      status: BehaviorRecordStatus.DRAFT,
      ...content,
      points: defaults.points,
      occurredAt,
      createdById: params.scope.actorId,
      metadata: toNullableJson(params.command.metadata),
    },
  };
}

async function buildUpdateBehaviorRecordInput(params: {
  repository: BehaviorRecordsRepository;
  existing: BehaviorRecordRecord;
  command: UpdateBehaviorRecordDto;
}): Promise<{
  data: Prisma.BehaviorRecordUncheckedUpdateManyInput;
}> {
  let category: BehaviorRecordCategoryDefaults | null =
    params.existing.category;
  const data: Prisma.BehaviorRecordUncheckedUpdateManyInput = {};

  if (hasOwn(params.command, 'categoryId')) {
    if (!params.command.categoryId) {
      throw new ValidationDomainException('Behavior category id is invalid', {
        field: 'categoryId',
      });
    }

    category = await requireCategory(
      params.repository,
      params.command.categoryId,
    );
    data.categoryId = category.id;
  }

  const categoryChanged = hasOwn(params.command, 'categoryId');
  const nextType = hasOwn(params.command, 'type')
    ? normalizeBehaviorRecordType(params.command.type)
    : categoryChanged && category
      ? normalizeBehaviorRecordType(category.type)
      : params.existing.type;
  const nextSeverity = hasOwn(params.command, 'severity')
    ? normalizeBehaviorSeverity(params.command.severity)
    : categoryChanged && category
      ? normalizeBehaviorSeverity(category.defaultSeverity)
      : params.existing.severity;
  const nextPoints = hasOwn(params.command, 'points')
    ? Number(params.command.points)
    : categoryChanged && category
      ? category.defaultPoints
      : params.existing.points;

  if (category) {
    assertBehaviorRecordCategoryActive({ category });
    assertBehaviorRecordCategoryCompatible({
      categoryId: category.id,
      categoryType: category.type,
      recordType: nextType,
    });
  }

  const content = {
    titleEn: hasOwn(params.command, 'titleEn')
      ? normalizeNullableText(params.command.titleEn)
      : params.existing.titleEn,
    titleAr: hasOwn(params.command, 'titleAr')
      ? normalizeNullableText(params.command.titleAr)
      : params.existing.titleAr,
    noteEn: hasOwn(params.command, 'noteEn')
      ? normalizeNullableText(params.command.noteEn)
      : params.existing.noteEn,
    noteAr: hasOwn(params.command, 'noteAr')
      ? normalizeNullableText(params.command.noteAr)
      : params.existing.noteAr,
  };
  assertBehaviorRecordContentPresent(content);
  assertBehaviorRecordPointsCompatible({ type: nextType, points: nextPoints });

  const occurredAt = hasOwn(params.command, 'occurredAt')
    ? parseBehaviorIsoDate(params.command.occurredAt as string, 'occurredAt')
    : params.existing.occurredAt;
  assertBehaviorOccurredAtInsideTerm({
    occurredAt,
    term: params.existing.term,
  });

  if (hasOwn(params.command, 'type') || categoryChanged) data.type = nextType;
  if (hasOwn(params.command, 'severity') || categoryChanged) {
    data.severity = nextSeverity;
  }
  if (hasOwn(params.command, 'points') || categoryChanged) {
    data.points = nextPoints;
  }
  if (hasOwn(params.command, 'titleEn')) data.titleEn = content.titleEn;
  if (hasOwn(params.command, 'titleAr')) data.titleAr = content.titleAr;
  if (hasOwn(params.command, 'noteEn')) data.noteEn = content.noteEn;
  if (hasOwn(params.command, 'noteAr')) data.noteAr = content.noteAr;
  if (hasOwn(params.command, 'occurredAt')) data.occurredAt = occurredAt;
  if (hasOwn(params.command, 'metadata')) {
    data.metadata = toNullableJson(params.command.metadata);
  }

  return { data };
}

async function validateSubmittableBehaviorRecord(params: {
  repository: BehaviorRecordsRepository;
  record: BehaviorRecordRecord;
}): Promise<void> {
  assertBehaviorRecordContentPresent(params.record);

  if (params.record.categoryId) {
    const category = await params.repository.findCategoryById(
      params.record.categoryId,
    );
    assertBehaviorRecordCategoryActive({ category });
    if (!category) {
      throw new BehaviorScopeInvalidException({
        categoryId: params.record.categoryId,
      });
    }
    assertBehaviorRecordCategoryCompatible({
      categoryId: category.id,
      categoryType: category.type,
      recordType: params.record.type,
    });
  }

  assertBehaviorRecordPointsCompatible({
    type: params.record.type,
    points: params.record.points,
  });
}

async function requireBehaviorRecord(
  repository: BehaviorRecordsRepository,
  recordId: string,
): Promise<BehaviorRecordRecord> {
  const record = await repository.findRecordById(recordId);
  if (!record) {
    throw new NotFoundDomainException('Behavior record not found', {
      recordId,
    });
  }

  return record;
}

async function requireAcademicYear(
  repository: BehaviorRecordsRepository,
  academicYearId: string,
) {
  const academicYear = await repository.findAcademicYear(academicYearId);
  if (!academicYear) {
    throw new NotFoundDomainException('Academic year not found', {
      academicYearId,
    });
  }

  return academicYear;
}

async function requireTerm(
  repository: BehaviorRecordsRepository,
  termId: string,
): Promise<BehaviorTermRecord> {
  const term = await repository.findTerm(termId);
  if (!term) {
    throw new NotFoundDomainException('Term not found', { termId });
  }

  return term;
}

async function requireStudent(
  repository: BehaviorRecordsRepository,
  studentId: string,
) {
  const student = await repository.findStudent(studentId);
  if (!student) {
    throw new NotFoundDomainException('Student not found', { studentId });
  }

  return student;
}

async function requireEnrollment(
  repository: BehaviorRecordsRepository,
  enrollmentId: string,
): Promise<BehaviorEnrollmentRecord> {
  const enrollment = await repository.findEnrollmentById(enrollmentId);
  if (!enrollment) {
    throw new NotFoundDomainException('Enrollment not found', { enrollmentId });
  }

  return enrollment;
}

async function requireCategory(
  repository: BehaviorRecordsRepository,
  categoryId: string,
  options?: { includeDeleted?: boolean },
): Promise<BehaviorRecordCategoryRecord> {
  const category = await repository.findCategoryById(categoryId, options);
  if (!category) {
    throw new NotFoundDomainException('Behavior category not found', {
      categoryId,
    });
  }

  return category;
}

function assertEnrollmentMatchesScope(params: {
  enrollment: BehaviorEnrollmentRecord;
  studentId?: string;
  academicYearId?: string;
  termId?: string | null;
}): void {
  const invalidDetails = {
    enrollmentId: params.enrollment.id,
    studentId: params.studentId ?? null,
    academicYearId: params.academicYearId ?? null,
    termId: params.termId ?? null,
  };

  if (params.studentId && params.enrollment.studentId !== params.studentId) {
    throw new BehaviorScopeInvalidException({
      ...invalidDetails,
      field: 'studentId',
    });
  }

  if (
    params.academicYearId &&
    params.enrollment.academicYearId !== params.academicYearId
  ) {
    throw new BehaviorScopeInvalidException({
      ...invalidDetails,
      field: 'academicYearId',
    });
  }

  if (
    params.termId &&
    params.enrollment.termId &&
    params.enrollment.termId !== params.termId
  ) {
    throw new BehaviorScopeInvalidException({
      ...invalidDetails,
      field: 'termId',
    });
  }
}

function normalizeRecordContent(input: {
  titleEn?: string | null;
  titleAr?: string | null;
  noteEn?: string | null;
  noteAr?: string | null;
}) {
  return {
    titleEn: normalizeNullableText(input.titleEn),
    titleAr: normalizeNullableText(input.titleAr),
    noteEn: normalizeNullableText(input.noteEn),
    noteAr: normalizeNullableText(input.noteAr),
  };
}

function buildBehaviorRecordAuditEntry(params: {
  scope: BehaviorScope;
  action:
    | 'behavior.record.create'
    | 'behavior.record.update'
    | 'behavior.record.submit'
    | 'behavior.record.cancel';
  record: BehaviorRecordRecord;
  before?: BehaviorRecordRecord | null;
  extraMetadata?: Record<string, unknown>;
}): BehaviorRecordAuditInput {
  return {
    actorId: params.scope.actorId,
    userType: params.scope.userType,
    organizationId: params.scope.organizationId,
    schoolId: params.scope.schoolId,
    module: 'behavior',
    action: params.action,
    resourceType: 'behavior_record',
    resourceId: params.record.id,
    outcome: AuditOutcome.SUCCESS,
    before: params.before
      ? summarizeBehaviorRecordForAudit(params.before)
      : undefined,
    after: {
      ...summarizeBehaviorRecordForAudit(params.record),
      ...(params.before
        ? { statusBefore: params.before.status, statusAfter: params.record.status }
        : {}),
      ...(params.extraMetadata ?? {}),
    },
  };
}

function summarizeBehaviorRecordForAudit(record: BehaviorRecordRecord) {
  return {
    studentId: record.studentId,
    enrollmentId: record.enrollmentId,
    academicYearId: record.academicYearId,
    termId: record.termId,
    categoryId: record.categoryId,
    type: record.type,
    severity: record.severity,
    points: record.points,
    status: record.status,
    occurredAt: record.occurredAt.toISOString(),
  };
}

function toNullableJson(
  value: unknown,
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}
