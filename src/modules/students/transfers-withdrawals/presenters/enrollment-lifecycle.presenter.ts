import { EnrollmentRecord } from '../../enrollments/infrastructure/enrollments.repository';
import { EnrollmentMovementResponseDto } from '../dto/enrollment-lifecycle.dto';
import { EnrollmentMovementActionType } from '../domain/enrollment-lifecycle.enums';

function deriveName(nameAr: string, nameEn: string): string {
  return nameEn.trim().length > 0 ? nameEn : nameAr;
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function normalizeOptionalText(value?: string | null): string | null {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : null;
}

function buildPlacementSnapshot(enrollment: EnrollmentRecord): {
  gradeId: string;
  sectionId: string;
  classroomId: string;
  grade: string;
  section: string;
  classroom: string;
} {
  return {
    gradeId: enrollment.classroom.section.grade.id,
    sectionId: enrollment.classroom.section.id,
    classroomId: enrollment.classroom.id,
    grade: deriveName(
      enrollment.classroom.section.grade.nameAr,
      enrollment.classroom.section.grade.nameEn,
    ),
    section: deriveName(
      enrollment.classroom.section.nameAr,
      enrollment.classroom.section.nameEn,
    ),
    classroom: deriveName(
      enrollment.classroom.nameAr,
      enrollment.classroom.nameEn,
    ),
  };
}

function deriveAcademicYearName(enrollment: EnrollmentRecord): string {
  return deriveName(enrollment.academicYear.nameAr, enrollment.academicYear.nameEn);
}

export function presentEnrollmentMovement(params: {
  id: string;
  actionType: EnrollmentMovementActionType;
  fromEnrollment: EnrollmentRecord;
  toEnrollment?: EnrollmentRecord | null;
  effectiveDate: Date;
  reason?: string | null;
  notes?: string | null;
  sourceRequestId?: string | null;
  createdAt: Date;
}): EnrollmentMovementResponseDto {
  const fromPlacement = buildPlacementSnapshot(params.fromEnrollment);
  const toPlacement = params.toEnrollment
    ? buildPlacementSnapshot(params.toEnrollment)
    : null;

  return {
    id: params.id,
    studentId: params.fromEnrollment.studentId,
    academicYear: deriveAcademicYearName(
      params.toEnrollment ?? params.fromEnrollment,
    ),
    actionType: params.actionType,
    fromGradeId: fromPlacement.gradeId,
    fromSectionId: fromPlacement.sectionId,
    fromClassroomId: fromPlacement.classroomId,
    toGradeId: toPlacement?.gradeId ?? null,
    toSectionId: toPlacement?.sectionId ?? null,
    toClassroomId: toPlacement?.classroomId ?? null,
    fromGrade: fromPlacement.grade,
    fromSection: fromPlacement.section,
    fromClassroom: fromPlacement.classroom,
    toGrade: toPlacement?.grade ?? null,
    toSection: toPlacement?.section ?? null,
    toClassroom: toPlacement?.classroom ?? null,
    effectiveDate: toDateOnly(params.effectiveDate),
    reason: normalizeOptionalText(params.reason),
    notes: normalizeOptionalText(params.notes),
    sourceRequestId: params.sourceRequestId ?? null,
    createdAt: params.createdAt.toISOString(),
  };
}
