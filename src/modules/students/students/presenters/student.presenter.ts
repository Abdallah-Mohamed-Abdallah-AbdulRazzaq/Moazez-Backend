import {
  StudentResponseDto,
  StudentSummaryResponseDto,
} from '../dto/student.dto';
import { mapStudentStatusToApi } from '../domain/student-status.enums';
import { StudentRecord } from '../infrastructure/students.repository';

function toIsoDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function toFullName(student: Pick<StudentRecord, 'firstName' | 'lastName'>): string {
  return `${student.firstName} ${student.lastName}`.trim();
}

export function presentStudent(student: StudentRecord): StudentResponseDto {
  const fullName = toFullName(student);
  const birthDate = toIsoDate(student.birthDate);

  return {
    id: student.id,
    student_id: null,
    name: fullName,
    first_name_en: student.firstName,
    father_name_en: null,
    grandfather_name_en: null,
    family_name_en: student.lastName,
    first_name_ar: null,
    father_name_ar: null,
    grandfather_name_ar: null,
    family_name_ar: null,
    full_name_en: fullName,
    full_name_ar: null,
    dateOfBirth: birthDate,
    date_of_birth: birthDate,
    gender: null,
    nationality: null,
    status: mapStudentStatusToApi(student.status),
    contact: {
      address_line: null,
      city: null,
      district: null,
      student_phone: null,
      student_email: null,
    },
    created_at: student.createdAt.toISOString(),
    updated_at: student.updatedAt.toISOString(),
  };
}

export function presentStudentSummary(
  student: Pick<
    StudentRecord,
    'id' | 'firstName' | 'lastName' | 'status'
  >,
): StudentSummaryResponseDto {
  const fullName = toFullName(student);

  return {
    id: student.id,
    student_id: null,
    name: fullName,
    full_name_en: fullName,
    status: mapStudentStatusToApi(student.status),
  };
}
