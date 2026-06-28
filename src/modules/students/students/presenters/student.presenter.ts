import {
  StudentResponseDto,
  StudentSummaryResponseDto,
} from '../dto/student.dto';
import { mapStudentStatusToApi } from '../domain/student-status.enums';
import { StudentRecord } from '../infrastructure/students.repository';

type StudentSummaryPresenterRecord = Pick<
  StudentRecord,
  'id' | 'firstName' | 'lastName' | 'status'
> &
  Partial<Pick<StudentRecord, 'fatherNameEn' | 'grandfatherNameEn'>>;

function toIsoDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function joinNameParts(parts: Array<string | null | undefined>): string | null {
  const fullName = parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(' ');

  return fullName.length > 0 ? fullName : null;
}

function toEnglishFullName(
  student: Pick<
    StudentRecord,
    'firstName' | 'fatherNameEn' | 'grandfatherNameEn' | 'lastName'
  >,
): string {
  return (
    joinNameParts([
      student.firstName,
      student.fatherNameEn,
      student.grandfatherNameEn,
      student.lastName,
    ]) ?? `${student.firstName} ${student.lastName}`.trim()
  );
}

function toArabicFullName(
  student: Pick<
    StudentRecord,
    'firstNameAr' | 'fatherNameAr' | 'grandfatherNameAr' | 'familyNameAr'
  >,
): string | null {
  return joinNameParts([
    student.firstNameAr,
    student.fatherNameAr,
    student.grandfatherNameAr,
    student.familyNameAr,
  ]);
}

export function presentStudent(student: StudentRecord): StudentResponseDto {
  const fullName = toEnglishFullName(student);
  const birthDate = toIsoDate(student.birthDate);

  return {
    id: student.id,
    student_id: null,
    name: fullName,
    first_name_en: student.firstName,
    father_name_en: student.fatherNameEn,
    grandfather_name_en: student.grandfatherNameEn,
    family_name_en: student.lastName,
    first_name_ar: student.firstNameAr,
    father_name_ar: student.fatherNameAr,
    grandfather_name_ar: student.grandfatherNameAr,
    family_name_ar: student.familyNameAr,
    full_name_en: fullName,
    full_name_ar: toArabicFullName(student),
    dateOfBirth: birthDate,
    date_of_birth: birthDate,
    gender: student.gender,
    nationality: student.nationality,
    status: mapStudentStatusToApi(student.status),
    contact: {
      address_line: student.addressLine,
      city: student.city,
      district: student.district,
      student_phone: student.studentPhone,
      student_email: student.studentEmail,
    },
    created_at: student.createdAt.toISOString(),
    updated_at: student.updatedAt.toISOString(),
  };
}

export function presentStudentSummary(
  student: StudentSummaryPresenterRecord,
): StudentSummaryResponseDto {
  const fullName =
    joinNameParts([
      student.firstName,
      student.fatherNameEn,
      student.grandfatherNameEn,
      student.lastName,
    ]) ??
    `${student.firstName} ${student.lastName}`.trim();

  return {
    id: student.id,
    student_id: null,
    name: fullName,
    full_name_en: fullName,
    status: mapStudentStatusToApi(student.status),
  };
}
