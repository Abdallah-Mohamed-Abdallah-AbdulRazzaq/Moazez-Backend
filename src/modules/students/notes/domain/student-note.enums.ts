import { StudentNoteCategory } from '@prisma/client';

export const STUDENT_NOTE_CATEGORY_API_VALUES = [
  'behavior',
  'academic',
  'attendance',
  'general',
] as const;

export type StudentNoteCategoryApiValue =
  (typeof STUDENT_NOTE_CATEGORY_API_VALUES)[number];

export const STUDENT_NOTE_VISIBILITY_API_VALUES = [
  'internal',
  'guardian_visible',
] as const;

export type StudentNoteVisibilityApiValue =
  (typeof STUDENT_NOTE_VISIBILITY_API_VALUES)[number];

export function mapStudentNoteCategoryToApi(
  category: StudentNoteCategory | null,
): StudentNoteCategoryApiValue | null {
  switch (category) {
    case StudentNoteCategory.BEHAVIOR:
      return 'behavior';
    case StudentNoteCategory.ACADEMIC:
      return 'academic';
    case StudentNoteCategory.ATTENDANCE:
      return 'attendance';
    case StudentNoteCategory.GENERAL:
      return 'general';
    case null:
      return null;
  }
}

export function mapStudentNoteCategoryFromApi(
  category: StudentNoteCategoryApiValue,
): StudentNoteCategory {
  switch (category) {
    case 'behavior':
      return StudentNoteCategory.BEHAVIOR;
    case 'academic':
      return StudentNoteCategory.ACADEMIC;
    case 'attendance':
      return StudentNoteCategory.ATTENDANCE;
    case 'general':
      return StudentNoteCategory.GENERAL;
  }
}
