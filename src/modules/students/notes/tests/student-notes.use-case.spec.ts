import { StudentNoteCategory, StudentStatus, UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { StudentsRepository } from '../../students/infrastructure/students.repository';
import { CreateStudentNoteUseCase } from '../application/create-student-note.use-case';
import { UpdateStudentNoteUseCase } from '../application/update-student-note.use-case';
import { StudentNotesRepository } from '../infrastructure/student-notes.repository';

describe('Student notes use cases', () => {
  async function withStudentsScope<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
        roleId: 'role-1',
        permissions: ['students.notes.view', 'students.notes.manage'],
      });

      return fn();
    });
  }

  function createStudentRecord() {
    return {
      id: 'student-1',
      schoolId: 'school-1',
      organizationId: 'org-1',
      applicationId: null,
      firstName: 'Ahmed',
      lastName: 'Hassan',
      birthDate: null,
      status: StudentStatus.ACTIVE,
      createdAt: new Date('2026-04-22T09:00:00.000Z'),
      updatedAt: new Date('2026-04-22T09:00:00.000Z'),
      deletedAt: null,
    };
  }

  function createStudentNoteRecord(overrides?: Partial<{
    id: string;
    note: string;
    category: StudentNoteCategory | null;
  }>) {
    return {
      id: overrides?.id ?? 'note-1',
      schoolId: 'school-1',
      studentId: 'student-1',
      note: overrides?.note ?? 'Helped classmates during activity',
      category: overrides?.category ?? StudentNoteCategory.BEHAVIOR,
      authorUserId: 'user-1',
      createdAt: new Date('2026-04-22T10:00:00.000Z'),
      updatedAt: new Date('2026-04-22T10:00:00.000Z'),
      authorUser: {
        id: 'user-1',
        firstName: 'Teacher',
        lastName: 'A',
      },
    };
  }

  it('creates a student note successfully', async () => {
    const studentsRepository = {
      findStudentById: jest.fn().mockResolvedValue(createStudentRecord()),
    } as unknown as StudentsRepository;
    const notesRepository = {
      createStudentNote: jest.fn().mockResolvedValue(createStudentNoteRecord()),
    } as unknown as StudentNotesRepository;

    const useCase = new CreateStudentNoteUseCase(
      studentsRepository,
      notesRepository,
    );

    const result = await withStudentsScope(() =>
      useCase.execute('student-1', {
        category: 'behavior',
        note: ' Helped classmates during activity ',
        visibility: 'internal',
        xpAdjustment: 5,
      }),
    );

    expect((notesRepository.createStudentNote as jest.Mock).mock.calls[0][0]).toEqual({
      schoolId: 'school-1',
      studentId: 'student-1',
      note: 'Helped classmates during activity',
      category: StudentNoteCategory.BEHAVIOR,
      authorUserId: 'user-1',
    });
    expect(result).toEqual({
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

  it('updates a student note successfully', async () => {
    const studentsRepository = {
      findStudentById: jest.fn().mockResolvedValue(createStudentRecord()),
    } as unknown as StudentsRepository;
    const notesRepository = {
      findStudentNoteById: jest.fn().mockResolvedValue(createStudentNoteRecord()),
      updateStudentNote: jest.fn().mockResolvedValue(
        createStudentNoteRecord({
          note: 'Stayed focused during group work',
          category: StudentNoteCategory.ACADEMIC,
        }),
      ),
    } as unknown as StudentNotesRepository;

    const useCase = new UpdateStudentNoteUseCase(
      studentsRepository,
      notesRepository,
    );

    const result = await withStudentsScope(() =>
      useCase.execute('student-1', 'note-1', {
        category: 'academic',
        note: ' Stayed focused during group work ',
      }),
    );

    expect((notesRepository.updateStudentNote as jest.Mock).mock.calls[0]).toEqual([
      'note-1',
      {
        note: 'Stayed focused during group work',
        category: StudentNoteCategory.ACADEMIC,
      },
    ]);
    expect(result).toEqual({
      id: 'note-1',
      studentId: 'student-1',
      date: '2026-04-22T10:00:00.000Z',
      category: 'academic',
      note: 'Stayed focused during group work',
      xpAdjustment: null,
      visibility: 'internal',
      created_by: 'Teacher A',
    });
  });
});
