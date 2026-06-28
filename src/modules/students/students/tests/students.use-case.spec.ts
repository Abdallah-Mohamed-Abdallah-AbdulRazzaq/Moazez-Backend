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
    fatherNameEn: string | null;
    grandfatherNameEn: string | null;
    lastName: string;
    firstNameAr: string | null;
    fatherNameAr: string | null;
    grandfatherNameAr: string | null;
    familyNameAr: string | null;
    birthDate: Date | null;
    gender: string | null;
    nationality: string | null;
    addressLine: string | null;
    city: string | null;
    district: string | null;
    studentPhone: string | null;
    studentEmail: string | null;
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
      fatherNameEn: overrides?.fatherNameEn ?? null,
      grandfatherNameEn: overrides?.grandfatherNameEn ?? null,
      lastName: overrides?.lastName ?? 'Hassan',
      firstNameAr: overrides?.firstNameAr ?? null,
      fatherNameAr: overrides?.fatherNameAr ?? null,
      grandfatherNameAr: overrides?.grandfatherNameAr ?? null,
      familyNameAr: overrides?.familyNameAr ?? null,
      birthDate:
        overrides?.birthDate === undefined
          ? new Date('2014-05-10T00:00:00.000Z')
          : overrides.birthDate,
      gender: overrides?.gender ?? null,
      nationality: overrides?.nationality ?? null,
      addressLine: overrides?.addressLine ?? null,
      city: overrides?.city ?? null,
      district: overrides?.district ?? null,
      studentPhone: overrides?.studentPhone ?? null,
      studentEmail: overrides?.studentEmail ?? null,
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

  it('creates a student with durable profile fields', async () => {
    const repository = {
      createStudent: jest.fn().mockResolvedValue(
        createStudentRecord({
          fatherNameEn: 'Ali',
          grandfatherNameEn: 'Mahmoud',
          firstNameAr: 'AhmadAr',
          fatherNameAr: 'AliAr',
          grandfatherNameAr: 'MahmoudAr',
          familyNameAr: 'HassanAr',
          gender: 'Male',
          nationality: 'Egyptian',
          addressLine: '12 Nile Street',
          city: 'Cairo',
          district: 'Nasr City',
          studentPhone: '+201001112233',
          studentEmail: 'student@example.com',
        }),
      ),
    } as unknown as StudentsRepository;

    const useCase = new CreateStudentUseCase(repository);

    const result = await withStudentsScope(() =>
      useCase.execute({
        full_name_en: 'Ahmed Ali Mahmoud Hassan',
        full_name_ar: 'AhmadAr AliAr MahmoudAr HassanAr',
        dateOfBirth: '2014-05-10',
        gender: 'Male',
        nationality: 'Egyptian',
        contact: {
          address_line: '12 Nile Street',
          city: 'Cairo',
          district: 'Nasr City',
          student_phone: '+201001112233',
          student_email: 'student@example.com',
        },
      }),
    );

    expect((repository.createStudent as jest.Mock).mock.calls[0][0]).toMatchObject({
      firstName: 'Ahmed',
      fatherNameEn: 'Ali',
      grandfatherNameEn: 'Mahmoud',
      lastName: 'Hassan',
      firstNameAr: 'AhmadAr',
      fatherNameAr: 'AliAr',
      grandfatherNameAr: 'MahmoudAr',
      familyNameAr: 'HassanAr',
      gender: 'Male',
      nationality: 'Egyptian',
      addressLine: '12 Nile Street',
      city: 'Cairo',
      district: 'Nasr City',
      studentPhone: '+201001112233',
      studentEmail: 'student@example.com',
    });

    expect(result).toEqual(
      expect.objectContaining({
        student_id: null,
        name: 'Ahmed Ali Mahmoud Hassan',
        father_name_en: 'Ali',
        grandfather_name_en: 'Mahmoud',
        first_name_ar: 'AhmadAr',
        father_name_ar: 'AliAr',
        grandfather_name_ar: 'MahmoudAr',
        family_name_ar: 'HassanAr',
        full_name_en: 'Ahmed Ali Mahmoud Hassan',
        full_name_ar: 'AhmadAr AliAr MahmoudAr HassanAr',
        gender: 'Male',
        nationality: 'Egyptian',
        contact: {
          address_line: '12 Nile Street',
          city: 'Cairo',
          district: 'Nasr City',
          student_phone: '+201001112233',
          student_email: 'student@example.com',
        },
      }),
    );
    expect(result).not.toHaveProperty('applicationId');
    expect(result).not.toHaveProperty('userId');
  });

  it('updates a student successfully', async () => {
    const existingStudent = createStudentRecord();
    const updatedStudent = createStudentRecord({
      lastName: 'Mostafa',
      fatherNameEn: 'Ali',
      grandfatherNameEn: 'Mahmoud',
      firstNameAr: 'AhmedAr',
      fatherNameAr: 'AliAr',
      grandfatherNameAr: 'MahmoudAr',
      familyNameAr: 'MostafaAr',
      gender: 'Male',
      nationality: 'Egyptian',
      addressLine: '15 Garden Street',
      city: 'Giza',
      district: 'Dokki',
      studentPhone: '+201009998877',
      studentEmail: 'updated.student@example.com',
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
        full_name_en: 'Ahmed Ali Mahmoud Mostafa',
        full_name_ar: 'AhmedAr AliAr MahmoudAr MostafaAr',
        status: 'Suspended',
        gender: 'Male',
        nationality: 'Egyptian',
        contact: {
          address_line: '15 Garden Street',
          city: 'Giza',
          district: 'Dokki',
          student_phone: '+201009998877',
          student_email: 'updated.student@example.com',
        },
      }),
    );

    expect((repository.updateStudent as jest.Mock).mock.calls[0]).toEqual([
      'student-1',
      {
        firstName: 'Ahmed',
        lastName: 'Mostafa',
        fatherNameEn: 'Ali',
        grandfatherNameEn: 'Mahmoud',
        firstNameAr: 'AhmedAr',
        fatherNameAr: 'AliAr',
        grandfatherNameAr: 'MahmoudAr',
        familyNameAr: 'MostafaAr',
        status: StudentStatus.SUSPENDED,
        gender: 'Male',
        nationality: 'Egyptian',
        addressLine: '15 Garden Street',
        city: 'Giza',
        district: 'Dokki',
        studentPhone: '+201009998877',
        studentEmail: 'updated.student@example.com',
      },
    ]);

    expect(result).toEqual(
      expect.objectContaining({
        id: 'student-1',
        name: 'Ahmed Ali Mahmoud Mostafa',
        father_name_en: 'Ali',
        grandfather_name_en: 'Mahmoud',
        family_name_en: 'Mostafa',
        first_name_ar: 'AhmedAr',
        father_name_ar: 'AliAr',
        grandfather_name_ar: 'MahmoudAr',
        family_name_ar: 'MostafaAr',
        full_name_en: 'Ahmed Ali Mahmoud Mostafa',
        full_name_ar: 'AhmedAr AliAr MahmoudAr MostafaAr',
        gender: 'Male',
        nationality: 'Egyptian',
        status: 'Suspended',
        contact: {
          address_line: '15 Garden Street',
          city: 'Giza',
          district: 'Dokki',
          student_phone: '+201009998877',
          student_email: 'updated.student@example.com',
        },
        updated_at: '2026-04-22T10:30:00.000Z',
      }),
    );
  });

  it('clears nullable student profile fields on update', async () => {
    const existingStudent = createStudentRecord({
      fatherNameEn: 'Ali',
      grandfatherNameEn: 'Mahmoud',
      firstNameAr: 'AhmedAr',
      fatherNameAr: 'AliAr',
      grandfatherNameAr: 'MahmoudAr',
      familyNameAr: 'HassanAr',
      gender: 'Male',
      nationality: 'Egyptian',
      addressLine: '12 Nile Street',
      city: 'Cairo',
      district: 'Nasr City',
      studentPhone: '+201001112233',
      studentEmail: 'student@example.com',
    });
    const updatedStudent = createStudentRecord({
      updatedAt: new Date('2026-04-22T10:30:00.000Z'),
    });

    const repository = {
      findStudentById: jest.fn().mockResolvedValue(existingStudent),
      updateStudent: jest.fn().mockResolvedValue(updatedStudent),
    } as unknown as StudentsRepository;

    const useCase = new UpdateStudentUseCase(repository);

    await withStudentsScope(() =>
      useCase.execute('student-1', {
        father_name_en: '',
        grandfather_name_en: null,
        full_name_ar: null,
        gender: null,
        nationality: '',
        contact: {
          address_line: null,
          city: '',
          district: null,
          student_phone: '',
          student_email: null,
        },
      }),
    );

    expect((repository.updateStudent as jest.Mock).mock.calls[0]).toEqual([
      'student-1',
      {
        firstName: 'Ahmed',
        lastName: 'Hassan',
        fatherNameEn: null,
        grandfatherNameEn: null,
        firstNameAr: null,
        fatherNameAr: null,
        grandfatherNameAr: null,
        familyNameAr: null,
        gender: null,
        nationality: null,
        addressLine: null,
        city: null,
        district: null,
        studentPhone: null,
        studentEmail: null,
      },
    ]);
  });
});
