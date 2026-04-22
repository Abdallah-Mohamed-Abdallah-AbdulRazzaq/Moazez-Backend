import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireStudentsScope } from '../../students/domain/students-scope';
import { StudentsRepository } from '../../students/infrastructure/students.repository';
import {
  StudentMedicalProfileResponseDto,
  UpdateStudentMedicalProfileDto,
} from '../dto/student-medical-profile.dto';
import { StudentMedicalRepository } from '../infrastructure/student-medical.repository';
import { presentStudentMedicalProfile } from '../presenters/student-medical-profile.presenter';

function normalizeOptionalText(value?: string): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizeStringArray(values?: string[]): string[] | undefined {
  if (values === undefined) {
    return undefined;
  }

  return values
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

@Injectable()
export class UpsertStudentMedicalProfileUseCase {
  constructor(
    private readonly studentsRepository: StudentsRepository,
    private readonly studentMedicalRepository: StudentMedicalRepository,
  ) {}

  async execute(
    studentId: string,
    command: UpdateStudentMedicalProfileDto,
  ): Promise<StudentMedicalProfileResponseDto> {
    const scope = requireStudentsScope();

    const student = await this.studentsRepository.findStudentById(studentId);
    if (!student) {
      throw new NotFoundDomainException('Student not found', { studentId });
    }

    const existing =
      await this.studentMedicalRepository.findStudentMedicalProfileByStudentId(
        studentId,
      );

    const profile = existing
      ? await this.studentMedicalRepository.updateStudentMedicalProfile(
          existing.id,
          {
            ...(command.bloodType !== undefined
              ? { bloodType: normalizeOptionalText(command.bloodType) }
              : {}),
            ...(command.allergies !== undefined
              ? { allergies: normalizeOptionalText(command.allergies) }
              : {}),
            ...(command.notes !== undefined
              ? { emergencyNotes: normalizeOptionalText(command.notes) }
              : {}),
            ...(command.conditions !== undefined
              ? { conditions: normalizeStringArray(command.conditions) }
              : {}),
            ...(command.medications !== undefined
              ? { medications: normalizeStringArray(command.medications) }
              : {}),
          },
        )
      : await this.studentMedicalRepository.createStudentMedicalProfile({
          schoolId: scope.schoolId,
          studentId,
          bloodType: normalizeOptionalText(command.bloodType) ?? null,
          allergies: normalizeOptionalText(command.allergies) ?? null,
          emergencyNotes: normalizeOptionalText(command.notes) ?? null,
          conditions: normalizeStringArray(command.conditions) ?? [],
          medications: normalizeStringArray(command.medications) ?? [],
        });

    if (!profile) {
      throw new NotFoundDomainException('Student medical profile not found', {
        studentId,
      });
    }

    return presentStudentMedicalProfile(profile);
  }
}
