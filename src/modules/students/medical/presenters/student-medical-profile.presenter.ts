import { StudentMedicalProfileResponseDto } from '../dto/student-medical-profile.dto';
import { StudentMedicalProfileRecord } from '../infrastructure/student-medical.repository';

export function presentStudentMedicalProfile(
  profile: StudentMedicalProfileRecord,
): StudentMedicalProfileResponseDto {
  return {
    id: profile.id,
    studentId: profile.studentId,
    allergies: profile.allergies,
    notes: profile.emergencyNotes,
    bloodType: profile.bloodType,
    conditions: [...profile.conditions],
    medications: [...profile.medications],
  };
}
