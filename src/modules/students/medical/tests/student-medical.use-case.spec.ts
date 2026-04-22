import { StudentStatus, UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { StudentsRepository } from '../../students/infrastructure/students.repository';
import { UpsertStudentMedicalProfileUseCase } from '../application/upsert-student-medical-profile.use-case';
import { StudentMedicalRepository } from '../infrastructure/student-medical.repository';

describe('Student medical profile use cases', () => {
  async function withStudentsScope<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
        roleId: 'role-1',
        permissions: ['students.medical.view', 'students.medical.manage'],
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

  function createMedicalProfileRecord(overrides?: Partial<{
    id: string;
    bloodType: string | null;
    allergies: string | null;
    emergencyNotes: string | null;
    conditions: string[];
    medications: string[];
  }>) {
    return {
      id: overrides?.id ?? 'medical-1',
      schoolId: 'school-1',
      studentId: 'student-1',
      bloodType: overrides?.bloodType ?? 'O+',
      allergies: overrides?.allergies ?? 'Peanuts',
      conditions: overrides?.conditions ?? ['Asthma'],
      medications: overrides?.medications ?? ['Inhaler'],
      emergencyNotes: overrides?.emergencyNotes ?? 'Carries inhaler',
      createdAt: new Date('2026-04-22T10:00:00.000Z'),
      updatedAt: new Date('2026-04-22T10:00:00.000Z'),
    };
  }

  it('creates or upserts a medical profile successfully when missing', async () => {
    const studentsRepository = {
      findStudentById: jest.fn().mockResolvedValue(createStudentRecord()),
    } as unknown as StudentsRepository;
    const medicalRepository = {
      findStudentMedicalProfileByStudentId: jest.fn().mockResolvedValue(null),
      createStudentMedicalProfile: jest
        .fn()
        .mockResolvedValue(createMedicalProfileRecord()),
    } as unknown as StudentMedicalRepository;

    const useCase = new UpsertStudentMedicalProfileUseCase(
      studentsRepository,
      medicalRepository,
    );

    const result = await withStudentsScope(() =>
      useCase.execute('student-1', {
        bloodType: ' O+ ',
        allergies: ' Peanuts ',
        notes: ' Carries inhaler ',
        conditions: [' Asthma '],
        medications: [' Inhaler '],
      }),
    );

    expect(
      (medicalRepository.createStudentMedicalProfile as jest.Mock).mock.calls[0][0],
    ).toEqual({
      schoolId: 'school-1',
      studentId: 'student-1',
      bloodType: 'O+',
      allergies: 'Peanuts',
      emergencyNotes: 'Carries inhaler',
      conditions: ['Asthma'],
      medications: ['Inhaler'],
    });
    expect(result).toEqual({
      id: 'medical-1',
      studentId: 'student-1',
      allergies: 'Peanuts',
      notes: 'Carries inhaler',
      bloodType: 'O+',
      conditions: ['Asthma'],
      medications: ['Inhaler'],
    });
  });

  it('updates a medical profile successfully', async () => {
    const studentsRepository = {
      findStudentById: jest.fn().mockResolvedValue(createStudentRecord()),
    } as unknown as StudentsRepository;
    const medicalRepository = {
      findStudentMedicalProfileByStudentId: jest
        .fn()
        .mockResolvedValue(createMedicalProfileRecord()),
      updateStudentMedicalProfile: jest.fn().mockResolvedValue(
        createMedicalProfileRecord({
          allergies: 'Dust',
          emergencyNotes: 'Needs medication at dismissal',
          medications: ['Antihistamine'],
        }),
      ),
    } as unknown as StudentMedicalRepository;

    const useCase = new UpsertStudentMedicalProfileUseCase(
      studentsRepository,
      medicalRepository,
    );

    const result = await withStudentsScope(() =>
      useCase.execute('student-1', {
        allergies: ' Dust ',
        notes: ' Needs medication at dismissal ',
        medications: [' Antihistamine '],
      }),
    );

    expect(
      (medicalRepository.updateStudentMedicalProfile as jest.Mock).mock.calls[0],
    ).toEqual([
      'medical-1',
      {
        allergies: 'Dust',
        emergencyNotes: 'Needs medication at dismissal',
        medications: ['Antihistamine'],
      },
    ]);
    expect(result).toEqual({
      id: 'medical-1',
      studentId: 'student-1',
      allergies: 'Dust',
      notes: 'Needs medication at dismissal',
      bloodType: 'O+',
      conditions: ['Asthma'],
      medications: ['Antihistamine'],
    });
  });
});
