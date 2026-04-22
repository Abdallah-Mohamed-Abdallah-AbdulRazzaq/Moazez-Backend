import { DomainException, NotFoundDomainException, ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { HttpStatus, Injectable } from '@nestjs/common';
import { requireStudentsScope } from '../../students/domain/students-scope';
import { StudentsRepository } from '../../students/infrastructure/students.repository';
import {
  mapStudentNoteCategoryFromApi,
} from '../domain/student-note.enums';
import {
  CreateStudentNoteDto,
  StudentNoteResponseDto,
} from '../dto/student-note.dto';
import { StudentNotesRepository } from '../infrastructure/student-notes.repository';
import { presentStudentNote } from '../presenters/student-note.presenter';

function normalizeRequiredNote(note: string): string {
  const normalized = note.trim();
  if (normalized.length === 0) {
    throw new ValidationDomainException('Student note is required', {
      field: 'note',
    });
  }

  return normalized;
}

function assertSupportedVisibility(visibility?: string): void {
  if (visibility && visibility !== 'internal') {
    throw new DomainException({
      code: 'validation.failed',
      message: 'Only internal student notes are supported in this phase',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details: { field: 'visibility' },
    });
  }
}

@Injectable()
export class CreateStudentNoteUseCase {
  constructor(
    private readonly studentsRepository: StudentsRepository,
    private readonly studentNotesRepository: StudentNotesRepository,
  ) {}

  async execute(
    studentId: string,
    command: CreateStudentNoteDto,
  ): Promise<StudentNoteResponseDto> {
    const scope = requireStudentsScope();

    const student = await this.studentsRepository.findStudentById(studentId);
    if (!student) {
      throw new NotFoundDomainException('Student not found', { studentId });
    }

    assertSupportedVisibility(command.visibility);

    const note = await this.studentNotesRepository.createStudentNote({
      schoolId: scope.schoolId,
      studentId,
      note: normalizeRequiredNote(command.note),
      category: command.category
        ? mapStudentNoteCategoryFromApi(command.category)
        : null,
      authorUserId: scope.actorId,
    });

    return presentStudentNote(note);
  }
}
