import { StudentStatus, UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { CreateStudentUseCase } from '../application/create-student.use-case';
import { UpdateStudentUseCase } from '../application/update-student.use-case';
import { StudentsRepository } from '../infrastructure/students.repository';

describe('Students records use cases', () => {
  async function withStudentsScope<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
        roleId: 'role-1',
        permissions: [
          'students.records.view',
          'students.records.manage',
          'students.guardians.view',
          'students.guardians.manage',
        ],
      });

      return fn();
    });
  }

  function createStudentRecord(overrides?: Partial<{
    id: string;
    firstName: string;
    lastName: string;
    birthDate: Date | null;
    status: StudentStatus;
    createdAt: Date;
    updatedAt: Date;
  }>) {
    return {
      id: overrides?.id ?? 'student-1',
      schoolId: 'school-1',
      organizationId: 'org-1',
      applicationId: null,
      firstName: overrides?.firstName ?? 'Ahmed',
      lastName: overrides?.lastName ?? 'Hassan',
      birthDate:
        overrides?.birthDate === undefined
          ? new Date('2014-05-10T00:00:00.000Z')
          : overrides.birthDate,
      status: overrides?.status ?? StudentStatus.ACTIVE,
      createdAt: overrides?.createdAt ?? new Date('2026-04-22T09:00:00.000Z'),
      updatedAt: overrides?.updatedAt ?? new Date('2026-04-22T09:00:00.000Z'),
      deletedAt: null,
    };
  }

  it('creates a student successfully', async () => {
    const repository = {
      createStudent: jest.fn().mockResolvedValue(createStudentRecord()),
    } as unknown as StudentsRepository;

    const useCase = new CreateStudentUseCase(repository);

    const result = await withStudentsScope(() =>
      useCase.execute({
        full_name_en: 'Ahmed Hassan',
        dateOfBirth: '2014-05-10',
      }),
    );

    expect((repository.createStudent as jest.Mock).mock.calls[0][0]).toMatchObject({
      schoolId: 'school-1',
      organizationId: 'org-1',
      firstName: 'Ahmed',
      lastName: 'Hassan',
      applicationId: null,
      birthDate: new Date('2014-05-10T00:00:00.000Z'),
    });

    expect(result).toEqual({
      id: 'student-1',
      student_id: null,
      name: 'Ahmed Hassan',
      first_name_en: 'Ahmed',
      father_name_en: null,
      grandfather_name_en: null,
      family_name_en: 'Hassan',
      first_name_ar: null,
      father_name_ar: null,
      grandfather_name_ar: null,
      family_name_ar: null,
      full_name_en: 'Ahmed Hassan',
      full_name_ar: null,
      dateOfBirth: '2014-05-10',
      date_of_birth: '2014-05-10',
      gender: null,
      nationality: null,
      status: 'Active',
      contact: {
        address_line: null,
        city: null,
        district: null,
        student_phone: null,
        student_email: null,
      },
      created_at: '2026-04-22T09:00:00.000Z',
      updated_at: '2026-04-22T09:00:00.000Z',
    });
  });

  it('updates a student successfully', async () => {
    const existingStudent = createStudentRecord();
    const updatedStudent = createStudentRecord({
      lastName: 'Mostafa',
      status: StudentStatus.SUSPENDED,
      updatedAt: new Date('2026-04-22T10:30:00.000Z'),
    });

    const repository = {
      findStudentById: jest
        .fn()
        .mockResolvedValueOnce(existingStudent)
        .mockResolvedValueOnce(updatedStudent),
      updateStudent: jest.fn().mockResolvedValue(updatedStudent),
    } as unknown as StudentsRepository;

    const useCase = new UpdateStudentUseCase(repository);

    const result = await withStudentsScope(() =>
      useCase.execute('student-1', {
        family_name_en: 'Mostafa',
        status: 'Suspended',
      }),
    );

    expect((repository.updateStudent as jest.Mock).mock.calls[0]).toEqual([
      'student-1',
      {
        firstName: 'Ahmed',
        lastName: 'Mostafa',
        status: StudentStatus.SUSPENDED,
      },
    ]);

    expect(result).toEqual(
      expect.objectContaining({
        id: 'student-1',
        name: 'Ahmed Mostafa',
        family_name_en: 'Mostafa',
        full_name_en: 'Ahmed Mostafa',
        status: 'Suspended',
        updated_at: '2026-04-22T10:30:00.000Z',
      }),
    );
  });
});
