import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { mapStudentStatusFromApi } from '../domain/student-status.enums';
import {
  StudentResponseDto,
  UpdateStudentDto,
} from '../dto/student.dto';
import {
  resolveStudentBirthDate,
  resolveStudentName,
} from '../domain/student-record.inputs';
import { StudentsRepository } from '../infrastructure/students.repository';
import { presentStudent } from '../presenters/student.presenter';

function hasStudentNamePatch(command: UpdateStudentDto): boolean {
  return [
    command.name,
    command.full_name_en,
    command.full_name_ar,
    command.first_name_en,
    command.first_name_ar,
    command.family_name_en,
    command.family_name_ar,
  ].some((value) => value !== undefined);
}

@Injectable()
export class UpdateStudentUseCase {
  constructor(private readonly studentsRepository: StudentsRepository) {}

  async execute(
    studentId: string,
    command: UpdateStudentDto,
  ): Promise<StudentResponseDto> {
    const existingStudent = await this.studentsRepository.findStudentById(studentId);
    if (!existingStudent) {
      throw new NotFoundDomainException('Student not found', { studentId });
    }

    const data: Record<string, unknown> = {};

    if (hasStudentNamePatch(command)) {
      const name = resolveStudentName(command, {
        firstName: existingStudent.firstName,
        lastName: existingStudent.lastName,
      });
      data.firstName = name.firstName;
      data.lastName = name.lastName;
    }

    if (command.dateOfBirth !== undefined || command.date_of_birth !== undefined) {
      data.birthDate = resolveStudentBirthDate(
        command.dateOfBirth,
        command.date_of_birth,
        existingStudent.birthDate,
      );
    }

    if (command.status) {
      data.status = mapStudentStatusFromApi(command.status);
    }

    if (Object.keys(data).length === 0) {
      return presentStudent(existingStudent);
    }

    const updatedStudent = await this.studentsRepository.updateStudent(
      studentId,
      data,
    );

    if (!updatedStudent) {
      throw new NotFoundDomainException('Student not found', { studentId });
    }

    return presentStudent(updatedStudent);
  }
}
