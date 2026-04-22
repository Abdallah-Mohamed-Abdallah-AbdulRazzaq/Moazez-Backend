import { Injectable } from '@nestjs/common';
import { mapStudentStatusFromApi } from '../domain/student-status.enums';
import {
  CreateStudentDto,
  StudentResponseDto,
} from '../dto/student.dto';
import {
  resolveStudentBirthDate,
  resolveStudentName,
} from '../domain/student-record.inputs';
import { requireStudentsScope } from '../domain/students-scope';
import { StudentsRepository } from '../infrastructure/students.repository';
import { presentStudent } from '../presenters/student.presenter';

@Injectable()
export class CreateStudentUseCase {
  constructor(private readonly studentsRepository: StudentsRepository) {}

  async execute(command: CreateStudentDto): Promise<StudentResponseDto> {
    const scope = requireStudentsScope();
    const name = resolveStudentName(command);
    const birthDate = resolveStudentBirthDate(
      command.dateOfBirth,
      command.date_of_birth,
    );

    const student = await this.studentsRepository.createStudent({
      schoolId: scope.schoolId,
      organizationId: scope.organizationId,
      applicationId: null,
      firstName: name.firstName,
      lastName: name.lastName,
      birthDate,
      ...(command.status
        ? { status: mapStudentStatusFromApi(command.status) }
        : {}),
    });

    return presentStudent(student);
  }
}
