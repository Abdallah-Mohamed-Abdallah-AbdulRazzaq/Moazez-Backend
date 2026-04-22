import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireStudentsScope } from '../../students/domain/students-scope';
import { StudentsRepository } from '../../students/infrastructure/students.repository';
import { StudentNoteResponseDto } from '../dto/student-note.dto';
import { StudentNotesRepository } from '../infrastructure/student-notes.repository';
import { presentStudentNote } from '../presenters/student-note.presenter';

@Injectable()
export class ListStudentNotesUseCase {
  constructor(
    private readonly studentsRepository: StudentsRepository,
    private readonly studentNotesRepository: StudentNotesRepository,
  ) {}

  async execute(studentId: string): Promise<StudentNoteResponseDto[]> {
    requireStudentsScope();

    const student = await this.studentsRepository.findStudentById(studentId);
    if (!student) {
      throw new NotFoundDomainException('Student not found', { studentId });
    }

    const notes = await this.studentNotesRepository.listStudentNotes(studentId);
    return notes.map((note) => presentStudentNote(note));
  }
}
