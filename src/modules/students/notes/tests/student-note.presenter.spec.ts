import { StudentNoteCategory } from '@prisma/client';
import { presentStudentNote } from '../presenters/student-note.presenter';

describe('student note presenter', () => {
  it('returns the contract-backed note shape', () => {
    expect(
      presentStudentNote({
        id: 'note-1',
        schoolId: 'school-1',
        studentId: 'student-1',
        note: 'Helped classmates during activity',
        category: StudentNoteCategory.BEHAVIOR,
        authorUserId: 'user-1',
        createdAt: new Date('2026-04-22T10:00:00.000Z'),
        updatedAt: new Date('2026-04-22T10:10:00.000Z'),
        authorUser: {
          id: 'user-1',
          firstName: 'Teacher',
          lastName: 'A',
        },
      }),
    ).toEqual({
      id: 'note-1',
      studentId: 'student-1',
      date: '2026-04-22T10:00:00.000Z',
      category: 'behavior',
      note: 'Helped classmates during activity',
      xpAdjustment: null,
      visibility: 'internal',
      created_by: 'Teacher A',
    });
  });
});
