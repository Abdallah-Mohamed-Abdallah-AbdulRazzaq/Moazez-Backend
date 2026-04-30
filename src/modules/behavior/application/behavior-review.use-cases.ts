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
  assertBehaviorApprovalPointsValid,
  assertBehaviorRecordApprovable,
  assertBehaviorRecordRejectable,
  BehaviorPointsDuplicateSourceException,
  buildBehaviorLedgerReason,
  deriveBehaviorEffectivePoints,
  deriveBehaviorLedgerEntryType,
  isUniqueConstraintError,
} from '../domain/behavior-review-domain';
import {
  BehaviorCategoryInactiveException,
  BehaviorScopeInvalidException,
  hasOwn,
  normalizeBehaviorRecordStatus,
  normalizeBehaviorRecordType,
  normalizeBehaviorSeverity,
  normalizeNullableText,
  parseBehaviorIsoDate,
} from '../domain/behavior-records-domain';
import {
  ApproveBehaviorRecordDto,
  ListBehaviorReviewQueueQueryDto,
  RejectBehaviorRecordDto,
} from '../dto/behavior-review.dto';
import {
  BehaviorReviewCategoryRecord,
  BehaviorReviewEnrollmentRecord,
  BehaviorReviewRecord,
  BehaviorReviewRepository,
  BehaviorReviewTermRecord,
  ListBehaviorReviewQueueFilters,
} from '../infrastructure/behavior-review.repository';
import {
  presentBehaviorReviewApproval,
  presentBehaviorReviewQueueList,
  presentBehaviorReviewRecord,
} from '../presenters/behavior-review.presenter';

@Injectable()
export class ListBehaviorReviewQueueUseCase {
  constructor(
    private readonly behaviorReviewRepository: BehaviorReviewRepository,
  ) {}

  async execute(query: ListBehaviorReviewQueueQueryDto) {
    requireBehaviorScope();
    const filters = await normalizeBehaviorReviewQueueFilters({
      query,
      repository: this.behaviorReviewRepository,
    });
    const result = await this.behaviorReviewRepository.listReviewQueue(filters);

    return presentBehaviorReviewQueueList({
      ...result,
      limit: filters.limit ?? null,
      offset: filters.offset ?? null,
    });
  }
}

@Injectable()
export class GetBehaviorReviewQueueItemUseCase {
  constructor(
    private readonly behaviorReviewRepository: BehaviorReviewRepository,
  ) {}

  async execute(recordId: string) {
    requireBehaviorScope();
    const record = await findReviewRecordOrThrow(
      this.behaviorReviewRepository,
      recordId,
    );

    return presentBehaviorReviewRecord(record);
  }
}

@Injectable()
export class ApproveBehaviorRecordUseCase {
  constructor(
    private readonly behaviorReviewRepository: BehaviorReviewRepository,
  ) {}

  async execute(recordId: string, command: ApproveBehaviorRecordDto) {
    const scope = requireBehaviorScope();
    const existing = await findReviewRecordOrThrow(
      this.behaviorReviewRepository,
      recordId,
    );
    assertBehaviorRecordApprovable(existing);
    await assertReviewCategoryActive({
      repository: this.behaviorReviewRepository,
      record: existing,
    });

    const pointsOverrideProvided = hasOwn(command, 'pointsOverride');
    const effectivePoints = deriveBehaviorEffectivePoints({
      recordPoints: existing.points,
      pointsOverride: command.pointsOverride,
    });
    assertBehaviorApprovalPointsValid({
      type: existing.type,
      effectivePoints,
    });

    const now = new Date();
    const reviewNoteEn = normalizeNullableText(command.reviewNoteEn);
    const reviewNoteAr = normalizeNullableText(command.reviewNoteAr);
    const entryType = deriveBehaviorLedgerEntryType(existing.type);
    const reason = buildBehaviorLedgerReason({
      type: existing.type,
      titleEn: existing.titleEn,
      titleAr: existing.titleAr,
      reviewNoteEn,
      reviewNoteAr,
    });

    try {
      const result =
        await this.behaviorReviewRepository.approveRecordWithPointLedger({
          schoolId: scope.schoolId,
          recordId: existing.id,
          recordData: {
            status: BehaviorRecordStatus.APPROVED,
            reviewedAt: now,
            reviewedById: scope.actorId,
            reviewNoteEn,
            reviewNoteAr,
            ...(pointsOverrideProvided ? { points: effectivePoints } : {}),
            ...(hasOwn(command, 'metadata')
              ? { metadata: toNullableJson(command.metadata) }
              : {}),
          },
          ledgerData: {
            academicYearId: existing.academicYearId,
            termId: existing.termId,
            studentId: existing.studentId,
            enrollmentId: existing.enrollmentId,
            recordId: existing.id,
            categoryId: existing.categoryId,
            entryType,
            amount: effectivePoints,
            actorId: scope.actorId,
            occurredAt: now,
            reasonEn: reason.reasonEn,
            reasonAr: reason.reasonAr,
            metadata: toNullableJson(
              buildApprovalLedgerMetadata({
                command,
                pointsBefore: existing.points,
                effectivePoints,
                pointsOverrideProvided,
              }),
            ),
          },
          buildAuditEntry: (record, ledger) =>
            buildBehaviorReviewAuditEntry({
              scope,
              action: 'behavior.record.approve',
              before: existing,
              record,
              ledger,
              pointsBefore: existing.points,
              effectivePoints,
              reviewNoteEn,
              reviewNoteAr,
              metadataProvided: hasOwn(command, 'metadata'),
            }),
        });

      return presentBehaviorReviewApproval(result);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new BehaviorPointsDuplicateSourceException({ recordId });
      }

      throw error;
    }
  }
}

@Injectable()
export class RejectBehaviorRecordUseCase {
  constructor(
    private readonly behaviorReviewRepository: BehaviorReviewRepository,
  ) {}

  async execute(recordId: string, command: RejectBehaviorRecordDto) {
    const scope = requireBehaviorScope();
    const existing = await findReviewRecordOrThrow(
      this.behaviorReviewRepository,
      recordId,
    );
    assertBehaviorRecordRejectable(existing);

    const now = new Date();
    const reviewNoteEn = normalizeNullableText(command.reviewNoteEn);
    const reviewNoteAr = normalizeNullableText(command.reviewNoteAr);

    const record = await this.behaviorReviewRepository.rejectRecord({
      schoolId: scope.schoolId,
      recordId: existing.id,
      recordData: {
        status: BehaviorRecordStatus.REJECTED,
        reviewedAt: now,
        reviewedById: scope.actorId,
        reviewNoteEn,
        reviewNoteAr,
        ...(hasOwn(command, 'metadata')
          ? { metadata: toNullableJson(command.metadata) }
          : {}),
      },
      buildAuditEntry: (updated) =>
        buildBehaviorReviewAuditEntry({
          scope,
          action: 'behavior.record.reject',
          before: existing,
          record: updated,
          pointsBefore: existing.points,
          effectivePoints: null,
          reviewNoteEn,
          reviewNoteAr,
          metadataProvided: hasOwn(command, 'metadata'),
        }),
    });

    return presentBehaviorReviewRecord(record);
  }
}

export async function normalizeBehaviorReviewQueueFilters(params: {
  query: ListBehaviorReviewQueueQueryDto;
  repository: BehaviorReviewRepository;
}): Promise<ListBehaviorReviewQueueFilters> {
  const query = params.query;

  if (query.academicYearId) {
    await requireAcademicYear(params.repository, query.academicYearId);
  }

  let term: BehaviorReviewTermRecord | null = null;
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
    await requireCategory(params.repository, query.categoryId);
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

  const occurredFrom = query.occurredFrom
    ? parseBehaviorIsoDate(query.occurredFrom, 'occurredFrom')
    : undefined;
  const occurredTo = query.occurredTo
    ? parseBehaviorIsoDate(query.occurredTo, 'occurredTo')
    : undefined;
  const submittedFrom = query.submittedFrom
    ? parseBehaviorIsoDate(query.submittedFrom, 'submittedFrom')
    : undefined;
  const submittedTo = query.submittedTo
    ? parseBehaviorIsoDate(query.submittedTo, 'submittedTo')
    : undefined;

  assertDateRangeValid({
    from: occurredFrom,
    to: occurredTo,
    fromField: 'occurredFrom',
    toField: 'occurredTo',
  });
  assertDateRangeValid({
    from: submittedFrom,
    to: submittedTo,
    fromField: 'submittedFrom',
    toField: 'submittedTo',
  });

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
      : query.includeReviewed
        ? {}
        : { status: BehaviorRecordStatus.SUBMITTED }),
    ...(occurredFrom ? { occurredFrom } : {}),
    ...(occurredTo ? { occurredTo } : {}),
    ...(submittedFrom ? { submittedFrom } : {}),
    ...(submittedTo ? { submittedTo } : {}),
    ...(query.createdById ? { createdById: query.createdById } : {}),
    includeReviewed: query.includeReviewed ?? false,
    ...(query.search ? { search: query.search } : {}),
    ...(query.limit !== undefined ? { limit: query.limit } : {}),
    ...(query.offset !== undefined ? { offset: query.offset } : {}),
  };
}

async function findReviewRecordOrThrow(
  repository: BehaviorReviewRepository,
  recordId: string,
): Promise<BehaviorReviewRecord> {
  const record = await repository.findReviewRecordById(recordId);
  if (!record) {
    throw new NotFoundDomainException('Behavior record not found', {
      recordId,
    });
  }

  return record;
}

async function requireAcademicYear(
  repository: BehaviorReviewRepository,
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
  repository: BehaviorReviewRepository,
  termId: string,
): Promise<BehaviorReviewTermRecord> {
  const term = await repository.findTerm(termId);
  if (!term) {
    throw new NotFoundDomainException('Term not found', { termId });
  }

  return term;
}

async function requireStudent(
  repository: BehaviorReviewRepository,
  studentId: string,
) {
  const student = await repository.findStudent(studentId);
  if (!student) {
    throw new NotFoundDomainException('Student not found', { studentId });
  }

  return student;
}

async function requireEnrollment(
  repository: BehaviorReviewRepository,
  enrollmentId: string,
): Promise<BehaviorReviewEnrollmentRecord> {
  const enrollment = await repository.findEnrollmentById(enrollmentId);
  if (!enrollment) {
    throw new NotFoundDomainException('Enrollment not found', { enrollmentId });
  }

  return enrollment;
}

async function requireCategory(
  repository: BehaviorReviewRepository,
  categoryId: string,
): Promise<BehaviorReviewCategoryRecord> {
  const category = await repository.findCategoryById(categoryId);
  if (!category) {
    throw new NotFoundDomainException('Behavior category not found', {
      categoryId,
    });
  }

  return category;
}

async function assertReviewCategoryActive(params: {
  repository: BehaviorReviewRepository;
  record: BehaviorReviewRecord;
}): Promise<void> {
  if (!params.record.categoryId) return;

  const category = await params.repository.findCategoryById(
    params.record.categoryId,
  );
  if (!category || !category.isActive) {
    throw new BehaviorCategoryInactiveException({
      categoryId: params.record.categoryId,
    });
  }
}

function assertEnrollmentMatchesScope(params: {
  enrollment: BehaviorReviewEnrollmentRecord;
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

function assertDateRangeValid(params: {
  from?: Date;
  to?: Date;
  fromField: string;
  toField: string;
}): void {
  if (params.from && params.to && params.from > params.to) {
    throw new ValidationDomainException('Date range is invalid', {
      [params.fromField]: params.from.toISOString(),
      [params.toField]: params.to.toISOString(),
    });
  }
}

function buildApprovalLedgerMetadata(params: {
  command: ApproveBehaviorRecordDto;
  pointsBefore: number;
  effectivePoints: number;
  pointsOverrideProvided: boolean;
}) {
  return {
    source: 'behavior_record_approval',
    ...(params.pointsOverrideProvided
      ? {
          pointsOverride: {
            pointsBefore: params.pointsBefore,
            effectivePoints: params.effectivePoints,
          },
        }
      : {}),
    ...(hasOwn(params.command, 'metadata')
      ? { reviewMetadata: params.command.metadata ?? null }
      : {}),
  };
}

function buildBehaviorReviewAuditEntry(params: {
  scope: BehaviorScope;
  action: 'behavior.record.approve' | 'behavior.record.reject';
  before: BehaviorReviewRecord;
  record: BehaviorReviewRecord;
  ledger?: { id: string; entryType: string; amount: number } | null;
  pointsBefore: number;
  effectivePoints: number | null;
  reviewNoteEn?: string | null;
  reviewNoteAr?: string | null;
  metadataProvided: boolean;
}) {
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
    before: summarizeBehaviorRecordForAudit(params.before),
    after: {
      ...summarizeBehaviorRecordForAudit(params.record),
      studentId: params.record.studentId,
      enrollmentId: params.record.enrollmentId,
      academicYearId: params.record.academicYearId,
      termId: params.record.termId,
      categoryId: params.record.categoryId,
      type: params.record.type,
      severity: params.record.severity,
      pointsBefore: params.pointsBefore,
      effectivePoints: params.effectivePoints,
      statusBefore: params.before.status,
      statusAfter: params.record.status,
      ledgerEntryId: params.ledger?.id ?? null,
      ledgerEntryType: params.ledger?.entryType ?? null,
      reviewNotePresence: {
        en: Boolean(params.reviewNoteEn),
        ar: Boolean(params.reviewNoteAr),
      },
      metadataProvided: params.metadataProvided,
    },
  };
}

function summarizeBehaviorRecordForAudit(record: BehaviorReviewRecord) {
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
