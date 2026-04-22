import {
  EnrollmentAcademicYearResponseDto,
  EnrollmentResponseDto,
} from '../dto/enrollment.dto';
import { mapEnrollmentStatusToApi } from '../domain/enrollment-status.enums';
import { AcademicYearRecord, EnrollmentRecord } from '../infrastructure/enrollments.repository';

function deriveName(nameAr: string, nameEn: string): string {
  return nameEn.trim().length > 0 ? nameEn : nameAr;
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function presentEnrollment(
  enrollment: EnrollmentRecord,
): EnrollmentResponseDto {
  return {
    enrollmentId: enrollment.id,
    studentId: enrollment.studentId,
    academicYear: deriveName(
      enrollment.academicYear.nameAr,
      enrollment.academicYear.nameEn,
    ),
    academicYearId: enrollment.academicYear.id,
    grade: deriveName(
      enrollment.classroom.section.grade.nameAr,
      enrollment.classroom.section.grade.nameEn,
    ),
    section: deriveName(
      enrollment.classroom.section.nameAr,
      enrollment.classroom.section.nameEn,
    ),
    classroom: deriveName(enrollment.classroom.nameAr, enrollment.classroom.nameEn),
    gradeId: enrollment.classroom.section.grade.id,
    sectionId: enrollment.classroom.section.id,
    classroomId: enrollment.classroom.id,
    enrollmentDate: toDateOnly(enrollment.enrolledAt),
    status: mapEnrollmentStatusToApi(enrollment.status),
  };
}

export function presentEnrollmentAcademicYear(
  academicYear: AcademicYearRecord,
): EnrollmentAcademicYearResponseDto {
  return {
    id: academicYear.id,
    name: deriveName(academicYear.nameAr, academicYear.nameEn),
    nameAr: academicYear.nameAr,
    nameEn: academicYear.nameEn,
    isActive: academicYear.isActive,
  };
}
