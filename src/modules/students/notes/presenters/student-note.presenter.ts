import { StudentNoteResponseDto } from '../dto/student-note.dto';
import { mapStudentNoteCategoryToApi } from '../domain/student-note.enums';
import { StudentNoteRecord } from '../infrastructure/student-notes.repository';

function buildAuthorName(
  note: Pick<StudentNoteRecord, 'authorUser'>,
): string | null {
  const fullName = `${note.authorUser.firstName} ${note.authorUser.lastName}`.trim();
  return fullName.length > 0 ? fullName : null;
}

export function presentStudentNote(
  note: StudentNoteRecord,
): StudentNoteResponseDto {
  return {
    id: note.id,
    studentId: note.studentId,
    date: note.createdAt.toISOString(),
    category: mapStudentNoteCategoryToApi(note.category),
    note: note.note,
    xpAdjustment: null,
    visibility: 'internal',
    created_by: buildAuthorName(note),
  };
}
