import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { StudentResponseDto } from '../dto/student.dto';
import { StudentsRepository } from '../infrastructure/students.repository';
import { presentStudent } from '../presenters/student.presenter';

@Injectable()
export class GetStudentUseCase {
  constructor(private readonly studentsRepository: StudentsRepository) {}

  async execute(studentId: string): Promise<StudentResponseDto> {
    const student = await this.studentsRepository.findStudentById(studentId);
    if (!student) {
      throw new NotFoundDomainException('Student not found', { studentId });
    }

    return presentStudent(student);
  }
}
