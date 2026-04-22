import { DomainException, NotFoundDomainException, ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { HttpStatus, Injectable } from '@nestjs/common';
import { requireStudentsScope } from '../../students/domain/students-scope';
import { StudentsRepository } from '../../students/infrastructure/students.repository';
import {
  mapStudentNoteCategoryFromApi,
} from '../domain/student-note.enums';
import {
  StudentNoteResponseDto,
  UpdateStudentNoteDto,
} from '../dto/student-note.dto';
import { StudentNotesRepository } from '../infrastructure/student-notes.repository';
import { presentStudentNote } from '../presenters/student-note.presenter';

function normalizeOptionalNote(note?: string): string | undefined {
  if (note === undefined) {
    return undefined;
  }

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
export class UpdateStudentNoteUseCase {
  constructor(
    private readonly studentsRepository: StudentsRepository,
    private readonly studentNotesRepository: StudentNotesRepository,
  ) {}

  async execute(
    studentId: string,
    noteId: string,
    command: UpdateStudentNoteDto,
  ): Promise<StudentNoteResponseDto> {
    requireStudentsScope();

    const student = await this.studentsRepository.findStudentById(studentId);
    if (!student) {
      throw new NotFoundDomainException('Student not found', { studentId });
    }

    const existing = await this.studentNotesRepository.findStudentNoteById(noteId);
    if (!existing || existing.studentId !== studentId) {
      throw new NotFoundDomainException('Student note not found', {
        studentId,
        noteId,
      });
    }

    assertSupportedVisibility(command.visibility);
    const normalizedNote = normalizeOptionalNote(command.note);

    const note = await this.studentNotesRepository.updateStudentNote(noteId, {
      ...(normalizedNote !== undefined ? { note: normalizedNote } : {}),
      ...(command.category !== undefined
        ? { category: mapStudentNoteCategoryFromApi(command.category) }
        : {}),
    });

    if (!note) {
      throw new NotFoundDomainException('Student note not found', {
        studentId,
        noteId,
      });
    }

    return presentStudentNote(note);
  }
}
