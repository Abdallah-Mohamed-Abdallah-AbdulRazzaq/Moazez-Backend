import { GradeItemStatus } from '@prisma/client';
import { presentGradeItemStatus } from '../../shared/presenters/grades.presenter';
import {
  BulkGradeAssessmentItemsResponseDto,
  GradeAssessmentItemResponseDto,
  GradeAssessmentItemsListResponseDto,
  GradeItemStudentSummaryResponseDto,
} from '../dto/grade-assessment-items.dto';
import {
  GradeAssessmentForGradeItemsRecord,
  GradeItemEnrollmentRecord,
  GradeItemRecord,
  GradeItemStudentRecord,
} from '../infrastructure/grades-assessment-items.repository';

export interface VirtualMissingGradeItemRecord {
  id: null;
  assessmentId: string;
  studentId: string;
  enrollmentId: string | null;
  student: GradeItemStudentRecord | null;
  enrollment: GradeItemEnrollmentRecord | null;
  score: null;
  status: GradeItemStatus;
  comment: null;
  enteredById: null;
  enteredAt: null;
  createdAt: null;
  updatedAt: null;
  isVirtualMissing: true;
}

export type GradeItemPresenterRecord =
  | GradeItemRecord
  | VirtualMissingGradeItemRecord;

export function buildVirtualMissingGradeItem(params: {
  assessment: GradeAssessmentForGradeItemsRecord;
  enrollment: GradeItemEnrollmentRecord;
}): VirtualMissingGradeItemRecord {
  return {
    id: null,
    assessmentId: params.assessment.id,
    studentId: params.enrollment.studentId,
    enrollmentId: params.enrollment.id,
    student: params.enrollment.student,
    enrollment: params.enrollment,
    score: null,
    status: GradeItemStatus.MISSING,
    comment: null,
    enteredById: null,
    enteredAt: null,
    createdAt: null,
    updatedAt: null,
    isVirtualMissing: true,
  };
}

export function presentGradeItem(
  item: GradeItemPresenterRecord,
): GradeAssessmentItemResponseDto {
  return {
    id: item.id,
    assessmentId: item.assessmentId,
    studentId: item.studentId,
    enrollmentId: item.enrollmentId,
    student: presentStudentSummary(item.student),
    score: presentDecimal(item.score),
    status: presentGradeItemStatus(item.status),
    comment: item.comment,
    enteredById: item.enteredById,
    enteredAt: presentNullableDate(item.enteredAt),
    createdAt: presentNullableDate(item.createdAt),
    updatedAt: presentNullableDate(item.updatedAt),
    isVirtualMissing:
      'isVirtualMissing' in item ? item.isVirtualMissing : false,
  };
}

export function presentGradeItems(
  items: GradeItemPresenterRecord[],
): GradeAssessmentItemsListResponseDto {
  return {
    items: items.map((item) => presentGradeItem(item)),
  };
}

export function presentBulkGradeItems(params: {
  assessmentId: string;
  items: GradeItemRecord[];
}): BulkGradeAssessmentItemsResponseDto {
  return {
    assessmentId: params.assessmentId,
    updatedCount: params.items.length,
    items: params.items.map((item) => presentGradeItem(item)),
  };
}

function presentStudentSummary(
  student: GradeItemStudentRecord | null,
): GradeItemStudentSummaryResponseDto | null {
  if (!student) return null;

  const fullName = [student.firstName, student.lastName]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');

  return {
    id: student.id,
    fullName,
    nameEn: fullName,
    nameAr: null,
    code: null,
    admissionNo: null,
  };
}

function presentDecimal(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && 'toNumber' in value) {
    return (value as { toNumber: () => number }).toNumber();
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function presentNullableDate(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}
