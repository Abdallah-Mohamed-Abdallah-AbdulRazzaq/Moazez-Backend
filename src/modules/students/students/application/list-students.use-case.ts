import { Injectable } from '@nestjs/common';
import { mapStudentStatusFromApi } from '../domain/student-status.enums';
import {
  ListStudentsQueryDto,
  StudentResponseDto,
} from '../dto/student.dto';
import { StudentsRepository } from '../infrastructure/students.repository';
import { presentStudent } from '../presenters/student.presenter';

@Injectable()
export class ListStudentsUseCase {
  constructor(private readonly studentsRepository: StudentsRepository) {}

  async execute(query: ListStudentsQueryDto): Promise<StudentResponseDto[]> {
    const students = await this.studentsRepository.listStudents({
      search: query.search,
      ...(query.status ? { status: mapStudentStatusFromApi(query.status) } : {}),
    });

    return students.map((student) => presentStudent(student));
  }
}
