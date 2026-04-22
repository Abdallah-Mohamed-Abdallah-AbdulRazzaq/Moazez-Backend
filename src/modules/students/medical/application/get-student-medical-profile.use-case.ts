import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireStudentsScope } from '../../students/domain/students-scope';
import { StudentsRepository } from '../../students/infrastructure/students.repository';
import { StudentMedicalProfileResponseDto } from '../dto/student-medical-profile.dto';
import { StudentMedicalRepository } from '../infrastructure/student-medical.repository';
import { presentStudentMedicalProfile } from '../presenters/student-medical-profile.presenter';

@Injectable()
export class GetStudentMedicalProfileUseCase {
  constructor(
    private readonly studentsRepository: StudentsRepository,
    private readonly studentMedicalRepository: StudentMedicalRepository,
  ) {}

  async execute(
    studentId: string,
  ): Promise<StudentMedicalProfileResponseDto | null> {
    requireStudentsScope();

    const student = await this.studentsRepository.findStudentById(studentId);
    if (!student) {
      throw new NotFoundDomainException('Student not found', { studentId });
    }

    const profile =
      await this.studentMedicalRepository.findStudentMedicalProfileByStudentId(
        studentId,
      );

    return profile ? presentStudentMedicalProfile(profile) : null;
  }
}
