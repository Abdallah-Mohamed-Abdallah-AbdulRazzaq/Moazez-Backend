import { Injectable } from '@nestjs/common';
import { LessonPlanItemStatus } from '@prisma/client';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentSubjectLessonsNotFoundException } from '../domain/student-subject-lessons.errors';
import {
  STUDENT_SUBJECT_LESSON_STATUSES,
  type StudentSubjectLessonsQueryDto,
  type StudentSubjectLessonStatus,
} from '../dto/student-subject-lessons.dto';
import type { StudentSubjectLessonsResponseDto } from '../dto/student-subject-lessons-response.dto';
import {
  StudentSubjectLessonsReadAdapter,
  type StudentSubjectLessonCursorPosition,
  type StudentSubjectLessonItemRecord,
} from '../infrastructure/student-subject-lessons-read.adapter';
import {
  StudentSubjectLessonsPresenter,
  studentSubjectLessonOrderingPeriodIndex,
} from '../presenters/student-subject-lessons.presenter';

const CURSOR_VERSION = 1;
const DEFAULT_LIMIT = 20;
const MAXIMUM_LIMIT = 50;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRISMA_INT_MIN = -2_147_483_648;
const PRISMA_INT_MAX = 2_147_483_647;

const STATUS_TO_PRISMA: Record<
  StudentSubjectLessonStatus,
  LessonPlanItemStatus
> = {
  planned: LessonPlanItemStatus.PLANNED,
  in_progress: LessonPlanItemStatus.IN_PROGRESS,
  done: LessonPlanItemStatus.DONE,
  skipped: LessonPlanItemStatus.SKIPPED,
  rescheduled: LessonPlanItemStatus.RESCHEDULED,
  cancelled: LessonPlanItemStatus.CANCELLED,
};

export interface StudentSubjectLessonsCursorIdentity {
  subjectId: string;
  termId: string;
  from: string;
  to: string;
  status: StudentSubjectLessonStatus | null;
}

export interface StudentSubjectLessonsCursorPayload extends StudentSubjectLessonsCursorIdentity {
  version: 1;
  plannedDate: string;
  periodIndex: number | null;
  sortOrder: number;
  itemId: string;
}

@Injectable()
export class ListStudentSubjectLessonsUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentSubjectLessonsReadAdapter,
  ) {}

  async execute(params: {
    subjectId: string;
    query: StudentSubjectLessonsQueryDto;
  }): Promise<StudentSubjectLessonsResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    if (!context.termId) {
      throw new StudentSubjectLessonsNotFoundException();
    }

    const eligibility = await this.readAdapter.resolveEligibleSubject({
      context,
      subjectId: params.subjectId,
    });
    if (!eligibility) {
      throw new StudentSubjectLessonsNotFoundException();
    }

    const termStart = formatDateOnly(eligibility.termStartDate);
    const termEnd = formatDateOnly(eligibility.termEndDate);
    const from = normalizeDate(params.query.from ?? termStart, 'from');
    const to = normalizeDate(params.query.to ?? termEnd, 'to');
    const status = normalizeStatus(params.query.status);
    const limit = normalizeLimit(params.query.limit);

    if (from.value > to.value) invalidField('from');
    if (from.value < eligibility.termStartDate) invalidField('from');
    if (to.value > eligibility.termEndDate) invalidField('to');

    const identity: StudentSubjectLessonsCursorIdentity = {
      subjectId: params.subjectId,
      termId: context.termId,
      from: from.text,
      to: to.text,
      status,
    };
    const cursor = params.query.cursor
      ? decodeStudentSubjectLessonsCursor(params.query.cursor, identity)
      : null;

    const records = await this.readAdapter.listVisibleItems({
      context,
      subjectId: params.subjectId,
      from: from.value,
      to: to.value,
      status: status ? STATUS_TO_PRISMA[status] : null,
      cursor,
      take: limit + 1,
    });
    const hasNextPage = records.length > limit;
    const items = records.slice(0, limit);
    const nextCursor = hasNextPage
      ? encodeCursorFromRecord({
          identity,
          item: items[items.length - 1],
        })
      : null;

    return StudentSubjectLessonsPresenter.presentPage({
      context,
      items,
      nextCursor,
      hasNextPage,
    });
  }
}

export function encodeStudentSubjectLessonsCursor(
  payload: StudentSubjectLessonsCursorPayload,
): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeStudentSubjectLessonsCursor(
  cursor: string,
  identity: StudentSubjectLessonsCursorIdentity,
): StudentSubjectLessonCursorPosition {
  try {
    if (
      cursor.length === 0 ||
      cursor.length > 4096 ||
      !/^[A-Za-z0-9_-]+$/.test(cursor)
    ) {
      invalidField('cursor');
    }

    const decoded = Buffer.from(cursor, 'base64url');
    if (decoded.toString('base64url') !== cursor) invalidField('cursor');
    const value: unknown = JSON.parse(decoded.toString('utf8'));
    if (!isCursorPayload(value)) invalidField('cursor');

    if (
      value.subjectId !== identity.subjectId ||
      value.termId !== identity.termId ||
      value.from !== identity.from ||
      value.to !== identity.to ||
      value.status !== identity.status
    ) {
      invalidField('cursor');
    }

    const plannedDate = parseDateOnly(value.plannedDate);
    if (value.plannedDate < identity.from || value.plannedDate > identity.to) {
      invalidField('cursor');
    }

    return {
      plannedDate,
      periodIndex: value.periodIndex,
      sortOrder: value.sortOrder,
      itemId: value.itemId,
    };
  } catch (error) {
    if (
      error instanceof ValidationDomainException &&
      error.details?.field === 'cursor'
    ) {
      throw error;
    }
    invalidField('cursor');
  }
}

function encodeCursorFromRecord(params: {
  identity: StudentSubjectLessonsCursorIdentity;
  item: StudentSubjectLessonItemRecord;
}): string {
  if (!params.item.plannedDate) {
    throw new Error('Subject lesson cursor received a null planned date');
  }

  return encodeStudentSubjectLessonsCursor({
    version: CURSOR_VERSION,
    ...params.identity,
    plannedDate: formatDateOnly(params.item.plannedDate),
    periodIndex: studentSubjectLessonOrderingPeriodIndex(params.item),
    sortOrder: params.item.sortOrder,
    itemId: params.item.id,
  });
}

function normalizeStatus(
  status: StudentSubjectLessonStatus | undefined,
): StudentSubjectLessonStatus | null {
  if (status === undefined) return null;
  if (!STUDENT_SUBJECT_LESSON_STATUSES.includes(status)) {
    invalidField('status');
  }
  return status;
}

function normalizeLimit(limit: number | undefined): number {
  const normalized = limit ?? DEFAULT_LIMIT;
  if (
    !Number.isInteger(normalized) ||
    normalized < 1 ||
    normalized > MAXIMUM_LIMIT
  ) {
    invalidField('limit');
  }
  return normalized;
}

function normalizeDate(
  value: string,
  field: 'from' | 'to',
): { text: string; value: Date } {
  try {
    return { text: value, value: parseDateOnly(value) };
  } catch {
    invalidField(field);
  }
}

function parseDateOnly(value: string): Date {
  const match = DATE_PATTERN.exec(value);
  if (!match) throw new Error('invalid date');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error('invalid date');
  }
  return date;
}

function formatDateOnly(date: Date): string {
  const year = `${date.getUTCFullYear()}`.padStart(4, '0');
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${date.getUTCDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isCursorPayload(
  value: unknown,
): value is StudentSubjectLessonsCursorPayload {
  if (!isRecord(value)) return false;
  const expectedKeys = [
    'version',
    'subjectId',
    'termId',
    'from',
    'to',
    'status',
    'plannedDate',
    'periodIndex',
    'sortOrder',
    'itemId',
  ];
  if (
    Object.keys(value).length !== expectedKeys.length ||
    expectedKeys.some((key) => !(key in value))
  ) {
    return false;
  }

  return (
    value.version === CURSOR_VERSION &&
    typeof value.subjectId === 'string' &&
    UUID_PATTERN.test(value.subjectId) &&
    typeof value.termId === 'string' &&
    UUID_PATTERN.test(value.termId) &&
    typeof value.from === 'string' &&
    isValidDateOnly(value.from) &&
    typeof value.to === 'string' &&
    isValidDateOnly(value.to) &&
    (value.status === null || isStudentLessonStatus(value.status)) &&
    typeof value.plannedDate === 'string' &&
    isValidDateOnly(value.plannedDate) &&
    (value.periodIndex === null || isPrismaInt(value.periodIndex)) &&
    isPrismaInt(value.sortOrder) &&
    typeof value.itemId === 'string' &&
    UUID_PATTERN.test(value.itemId)
  );
}

function isPrismaInt(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= PRISMA_INT_MIN &&
    value <= PRISMA_INT_MAX
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidDateOnly(value: string): boolean {
  try {
    parseDateOnly(value);
    return true;
  } catch {
    return false;
  }
}

function isStudentLessonStatus(
  value: unknown,
): value is StudentSubjectLessonStatus {
  return (
    typeof value === 'string' &&
    STUDENT_SUBJECT_LESSON_STATUSES.includes(
      value as StudentSubjectLessonStatus,
    )
  );
}

function invalidField(field: string): never {
  throw new ValidationDomainException(
    'Student Subject lesson query is invalid',
    {
      field,
    },
  );
}
