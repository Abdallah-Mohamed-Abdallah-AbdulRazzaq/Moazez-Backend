import { AttendanceExcuseStatus, AuditOutcome } from '@prisma/client';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { AttendanceScope } from '../../attendance-context';
import {
  CreateAttendanceExcuseRequestDto,
  UpdateAttendanceExcuseRequestDto,
} from '../dto/attendance-excuse.dto';
import { AttendanceExcuseInvalidDateRangeException } from '../domain/excuse.exceptions';
import {
  assertExcuseTermWritable,
  hasOwn,
  normalizeSelectedPeriodKeys,
  validateAndNormalizeExcuseValues,
} from '../domain/excuse-validation';
import {
  AttendanceExcuseAttachmentRecord,
  AttendanceExcusesRepository,
  AttendanceExcuseRequestRecord,
  CreateAttendanceExcuseRequestData,
  TermReferenceRecord,
  UpdateAttendanceExcuseRequestData,
} from '../infrastructure/attendance-excuses.repository';

export async function validateExcuseAcademicContext(
  repository: AttendanceExcusesRepository,
  academicYearId: string,
  termId: string,
): Promise<{ term: TermReferenceRecord }> {
  const { academicYear, term } = await repository.validateAcademicYearAndTerm(
    academicYearId,
    termId,
  );

  if (!academicYear) {
    throw new NotFoundDomainException('Academic year not found', {
      academicYearId,
    });
  }

  if (!term || term.academicYearId !== academicYearId) {
    throw new NotFoundDomainException('Term not found', {
      academicYearId,
      termId,
    });
  }

  return { term };
}

export async function validateExcuseStudent(
  repository: AttendanceExcusesRepository,
  studentId: string,
): Promise<void> {
  const student = await repository.validateStudent(studentId);
  if (!student) {
    throw new NotFoundDomainException('Student not found', { studentId });
  }
}

export function buildCreateExcuseRequestData(params: {
  scope: AttendanceScope;
  academicYearId: string;
  command: CreateAttendanceExcuseRequestDto;
  term: TermReferenceRecord;
}): CreateAttendanceExcuseRequestData {
  assertExcuseTermWritable(params.term);

  const selectedPeriodKeys = normalizeSelectedPeriodKeys(params.command);
  const values = validateAndNormalizeExcuseValues(
    {
      type: params.command.type,
      dateFrom: params.command.dateFrom,
      dateTo: params.command.dateTo,
      selectedPeriodKeys,
      lateMinutes: params.command.lateMinutes,
      earlyLeaveMinutes: params.command.earlyLeaveMinutes,
      reasonAr: params.command.reasonAr,
      reasonEn: params.command.reasonEn,
    },
    params.term,
  );

  return {
    schoolId: params.scope.schoolId,
    academicYearId: params.academicYearId,
    termId: params.command.termId,
    studentId: params.command.studentId,
    status: AttendanceExcuseStatus.PENDING,
    createdById: params.scope.actorId,
    ...values,
  };
}

export function buildUpdateExcuseRequestData(params: {
  existing: AttendanceExcuseRequestRecord;
  command: UpdateAttendanceExcuseRequestDto;
  term: TermReferenceRecord;
}): UpdateAttendanceExcuseRequestData {
  assertExcuseTermWritable(params.term);

  const selectedPeriodKeys = hasSelectedPeriodPatch(params.command)
    ? normalizeSelectedPeriodKeys(params.command)
    : [...params.existing.selectedPeriodKeys];

  const values = validateAndNormalizeExcuseValues(
    {
      type: params.command.type ?? params.existing.type,
      dateFrom: params.command.dateFrom ?? params.existing.dateFrom,
      dateTo: params.command.dateTo ?? params.existing.dateTo,
      selectedPeriodKeys,
      lateMinutes: hasOwn(params.command, 'lateMinutes')
        ? params.command.lateMinutes
        : params.existing.lateMinutes,
      earlyLeaveMinutes: hasOwn(params.command, 'earlyLeaveMinutes')
        ? params.command.earlyLeaveMinutes
        : params.existing.earlyLeaveMinutes,
      reasonAr: hasOwn(params.command, 'reasonAr')
        ? params.command.reasonAr
        : params.existing.reasonAr,
      reasonEn: hasOwn(params.command, 'reasonEn')
        ? params.command.reasonEn
        : params.existing.reasonEn,
    },
    params.term,
  );

  return values;
}

export function parseExcuseListDateFilters(input: {
  dateFrom?: string;
  dateTo?: string;
}): { dateFrom?: Date; dateTo?: Date } {
  const dateFrom = input.dateFrom
    ? parseOptionalFilterDate(input.dateFrom, 'dateFrom')
    : undefined;
  const dateTo = input.dateTo
    ? parseOptionalFilterDate(input.dateTo, 'dateTo')
    : undefined;

  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw new AttendanceExcuseInvalidDateRangeException({
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
    });
  }

  return { dateFrom, dateTo };
}

export function summarizeExcuseRequest(request: AttendanceExcuseRequestRecord) {
  return {
    status: request.status,
    type: request.type,
    dateFrom: request.dateFrom.toISOString().slice(0, 10),
    dateTo: request.dateTo.toISOString().slice(0, 10),
    selectedPeriodKeys: request.selectedPeriodKeys,
    lateMinutes: request.lateMinutes,
    earlyLeaveMinutes: request.earlyLeaveMinutes,
    reasonAr: request.reasonAr,
    reasonEn: request.reasonEn,
    deletedAt: request.deletedAt?.toISOString() ?? null,
  };
}

export function normalizeAttachmentFileIds(fileIds: string[]): string[] {
  if (!Array.isArray(fileIds)) {
    throw new ValidationDomainException('fileIds must be an array', {
      field: 'fileIds',
    });
  }

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const fileId of fileIds) {
    const trimmed = fileId.trim();
    if (trimmed.length === 0) {
      throw new ValidationDomainException('fileIds must contain UUIDs', {
        field: 'fileIds',
      });
    }

    if (!seen.has(trimmed)) {
      normalized.push(trimmed);
      seen.add(trimmed);
    }
  }

  if (normalized.length === 0) {
    throw new ValidationDomainException('At least one fileId is required', {
      field: 'fileIds',
    });
  }

  return normalized;
}

export function summarizeExcuseAttachment(
  attachment: AttendanceExcuseAttachmentRecord,
) {
  return {
    id: attachment.id,
    fileId: attachment.fileId,
    resourceType: attachment.resourceType,
    resourceId: attachment.resourceId,
    originalName: attachment.file.originalName,
    mimeType: attachment.file.mimeType,
    sizeBytes: attachment.file.sizeBytes.toString(),
    createdAt: attachment.createdAt.toISOString(),
  };
}

export function buildExcuseAuditEntry(params: {
  scope: AttendanceScope;
  action: string;
  request: AttendanceExcuseRequestRecord;
  before?: AttendanceExcuseRequestRecord | null;
}) {
  const entry = {
    actorId: params.scope.actorId,
    userType: params.scope.userType,
    organizationId: params.scope.organizationId,
    schoolId: params.scope.schoolId,
    module: 'attendance',
    action: params.action,
    resourceType: 'attendance_excuse_request',
    resourceId: params.request.id,
    outcome: AuditOutcome.SUCCESS,
    after: summarizeExcuseRequest(params.request),
  };

  return params.before
    ? { ...entry, before: summarizeExcuseRequest(params.before) }
    : entry;
}

export function buildExcuseAttachmentAuditEntry(params: {
  scope: AttendanceScope;
  action: string;
  request: AttendanceExcuseRequestRecord;
  attachments: AttendanceExcuseAttachmentRecord[];
  before?: AttendanceExcuseAttachmentRecord | null;
}) {
  const entry = {
    actorId: params.scope.actorId,
    userType: params.scope.userType,
    organizationId: params.scope.organizationId,
    schoolId: params.scope.schoolId,
    module: 'attendance',
    action: params.action,
    resourceType: 'attendance_excuse_request',
    resourceId: params.request.id,
    outcome: AuditOutcome.SUCCESS,
    after: {
      attachmentIds: params.attachments.map((attachment) => attachment.id),
      fileIds: params.attachments.map((attachment) => attachment.fileId),
    },
  };

  return params.before
    ? { ...entry, before: summarizeExcuseAttachment(params.before) }
    : entry;
}

function hasSelectedPeriodPatch(command: UpdateAttendanceExcuseRequestDto) {
  return (
    hasOwn(command, 'selectedPeriodKeys') ||
    hasOwn(command, 'selectedPeriodIds')
  );
}

function parseOptionalFilterDate(value: string, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AttendanceExcuseInvalidDateRangeException({ field });
  }

  return date;
}
