import { StudentEnrollmentStatus, StudentStatus, UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { EnrollApplicationHandoffUseCase } from '../../../admissions/applications/application/enroll-application-handoff.use-case';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { CreateEnrollmentUseCase } from '../application/create-enrollment.use-case';
import { ValidateEnrollmentUseCase } from '../application/validate-enrollment.use-case';
import {
  StudentEnrollmentInactiveYearException,
  StudentEnrollmentPlacementConflictException,
} from '../domain/enrollment.exceptions';
import { EnrollmentPlacementService } from '../domain/enrollment-placement.service';
import { EnrollmentsRepository } from '../infrastructure/enrollments.repository';

describe('Enrollments use cases', () => {
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
          'students.enrollments.view',
          'students.enrollments.manage',
        ],
      });

      return fn();
    });
  }

  function buildEnrollmentRecord(overrides?: Partial<{
    id: string;
    studentId: string;
    academicYearId: string;
    classroomId: string;
    termId: string | null;
    enrolledAt: Date;
    status: StudentEnrollmentStatus;
  }>) {
    return {
      id: overrides?.id ?? 'enrollment-1',
      schoolId: 'school-1',
      studentId: overrides?.studentId ?? 'student-1',
      academicYearId: overrides?.academicYearId ?? 'year-1',
      termId:
        overrides?.termId === undefined ? null : overrides.termId,
      classroomId: overrides?.classroomId ?? 'classroom-1',
      status: overrides?.status ?? StudentEnrollmentStatus.ACTIVE,
      enrolledAt: overrides?.enrolledAt ?? new Date('2026-09-01T00:00:00.000Z'),
      endedAt: null,
      exitReason: null,
      createdAt: new Date('2026-09-01T08:00:00.000Z'),
      updatedAt: new Date('2026-09-01T08:00:00.000Z'),
      deletedAt: null,
      academicYear: {
        id: overrides?.academicYearId ?? 'year-1',
        nameAr: 'Academic Year 2026/2027 AR',
        nameEn: 'Academic Year 2026/2027',
        isActive: true,
      },
      classroom: {
        id: overrides?.classroomId ?? 'classroom-1',
        nameAr: 'Demo Classroom 1A AR',
        nameEn: 'Demo Classroom 1A',
        section: {
          id: 'section-1',
          nameAr: 'Demo Section A AR',
          nameEn: 'Demo Section A',
          grade: {
            id: 'grade-1',
            nameAr: 'Demo Grade 1 AR',
            nameEn: 'Demo Grade 1',
          },
        },
      },
    };
  }

  function buildPlacementResolution(overrides?: Partial<{
    activeEnrollment: ReturnType<typeof buildEnrollmentRecord> | null;
  }>) {
    return {
      student: {
        id: 'student-1',
        schoolId: 'school-1',
        organizationId: 'org-1',
        applicationId: null,
        firstName: 'Layla',
        lastName: 'Hassan',
        birthDate: new Date('2016-02-14T00:00:00.000Z'),
        status: StudentStatus.ACTIVE,
        createdAt: new Date('2026-04-22T09:00:00.000Z'),
        updatedAt: new Date('2026-04-22T09:00:00.000Z'),
        deletedAt: null,
      },
      academicYear: {
        id: 'year-1',
        nameAr: 'Academic Year 2026/2027 AR',
        nameEn: 'Academic Year 2026/2027',
        isActive: true,
      },
      term: null,
      grade: {
        id: 'grade-1',
        schoolId: 'school-1',
        stageId: 'stage-1',
        nameAr: 'Demo Grade 1 AR',
        nameEn: 'Demo Grade 1',
        sortOrder: 1,
        capacity: 24,
        createdAt: new Date('2026-04-22T09:00:00.000Z'),
        updatedAt: new Date('2026-04-22T09:00:00.000Z'),
        deletedAt: null,
      },
      section: {
        id: 'section-1',
        schoolId: 'school-1',
        gradeId: 'grade-1',
        nameAr: 'Demo Section A AR',
        nameEn: 'Demo Section A',
        sortOrder: 1,
        capacity: 24,
        createdAt: new Date('2026-04-22T09:00:00.000Z'),
        updatedAt: new Date('2026-04-22T09:00:00.000Z'),
        deletedAt: null,
      },
      classroom: {
        id: 'classroom-1',
        schoolId: 'school-1',
        sectionId: 'section-1',
        roomId: null,
        nameAr: 'Demo Classroom 1A AR',
        nameEn: 'Demo Classroom 1A',
        sortOrder: 1,
        capacity: 24,
        createdAt: new Date('2026-04-22T09:00:00.000Z'),
        updatedAt: new Date('2026-04-22T09:00:00.000Z'),
        deletedAt: null,
      },
      activeEnrollment:
        overrides?.activeEnrollment === undefined
          ? null
          : overrides.activeEnrollment,
    };
  }

  it('creates an enrollment successfully', async () => {
    const placementService = {
      resolvePlacement: jest.fn().mockResolvedValue(buildPlacementResolution()),
    } as unknown as EnrollmentPlacementService;
    const enrollmentsRepository = {
      createEnrollment: jest.fn().mockResolvedValue(buildEnrollmentRecord()),
    } as unknown as EnrollmentsRepository;
    const enrollApplicationHandoffUseCase = {
      execute: jest.fn(),
    } as unknown as EnrollApplicationHandoffUseCase;
    const authRepository = {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthRepository;

    const useCase = new CreateEnrollmentUseCase(
      enrollmentsRepository,
      placementService,
      enrollApplicationHandoffUseCase,
      authRepository,
    );

    const result = await withStudentsScope(() =>
      useCase.execute({
        studentId: 'student-1',
        academicYearId: 'year-1',
        gradeId: 'grade-1',
        sectionId: 'section-1',
        classroomId: 'classroom-1',
        enrollmentDate: '2026-09-01',
      }),
    );

    expect((placementService.resolvePlacement as jest.Mock).mock.calls[0][1]).toEqual(
      { handoff: null },
    );
    expect((enrollmentsRepository.createEnrollment as jest.Mock).mock.calls[0][0]).toMatchObject({
      schoolId: 'school-1',
      studentId: 'student-1',
      academicYearId: 'year-1',
      classroomId: 'classroom-1',
      status: StudentEnrollmentStatus.ACTIVE,
      enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
    });
    expect(result).toEqual({
      enrollmentId: 'enrollment-1',
      studentId: 'student-1',
      academicYear: 'Academic Year 2026/2027',
      academicYearId: 'year-1',
      grade: 'Demo Grade 1',
      section: 'Demo Section A',
      classroom: 'Demo Classroom 1A',
      gradeId: 'grade-1',
      sectionId: 'section-1',
      classroomId: 'classroom-1',
      enrollmentDate: '2026-09-01',
      status: 'active',
    });
    expect(
      (authRepository.createAuditLog as jest.Mock).mock.calls[0][0],
    ).toMatchObject({
      action: 'students.enrollment.create',
      resourceType: 'enrollment',
      resourceId: 'enrollment-1',
    });
  });

  it('creates an enrollment from an accepted admissions handoff', async () => {
    const placementService = {
      resolvePlacement: jest.fn().mockResolvedValue(buildPlacementResolution()),
    } as unknown as EnrollmentPlacementService;
    const enrollmentsRepository = {
      createEnrollment: jest.fn().mockResolvedValue(buildEnrollmentRecord()),
    } as unknown as EnrollmentsRepository;
    const enrollApplicationHandoffUseCase = {
      execute: jest.fn().mockResolvedValue({
        applicationId: 'application-1',
        eligible: true,
        handoff: {
          studentDraft: { fullName: 'Layla Hassan' },
          guardianDrafts: [],
          enrollmentDraft: {
            requestedAcademicYearId: 'year-1',
            requestedAcademicYearName: 'Academic Year 2026/2027',
            requestedGradeId: 'grade-1',
            requestedGradeName: 'Demo Grade 1',
          },
        },
      }),
    } as unknown as EnrollApplicationHandoffUseCase;
    const authRepository = {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthRepository;

    const useCase = new CreateEnrollmentUseCase(
      enrollmentsRepository,
      placementService,
      enrollApplicationHandoffUseCase,
      authRepository,
    );

    await withStudentsScope(() =>
      useCase.execute({
        studentId: 'student-1',
        applicationId: 'application-1',
        classroomId: 'classroom-1',
        sectionId: 'section-1',
        enrollmentDate: '2026-09-01',
      }),
    );

    expect(enrollApplicationHandoffUseCase.execute).toHaveBeenCalledWith(
      'application-1',
    );
    expect((placementService.resolvePlacement as jest.Mock).mock.calls[0][1]).toEqual({
      handoff: expect.objectContaining({
        applicationId: 'application-1',
        eligible: true,
      }),
    });
  });

  it('rejects duplicate active placement conflicts with the canonical code', async () => {
    const placementService = {
      resolvePlacement: jest
        .fn()
        .mockRejectedValue(
          new StudentEnrollmentPlacementConflictException({
            studentId: 'student-1',
          }),
        ),
    } as unknown as EnrollmentPlacementService;
    const enrollApplicationHandoffUseCase = {
      execute: jest.fn(),
    } as unknown as EnrollApplicationHandoffUseCase;
    const useCase = new CreateEnrollmentUseCase(
      {} as EnrollmentsRepository,
      placementService,
      enrollApplicationHandoffUseCase,
      { createAuditLog: jest.fn() } as never,
    );

    await expect(
      withStudentsScope(() =>
        useCase.execute({
          studentId: 'student-1',
          academicYearId: 'year-1',
          classroomId: 'classroom-2',
          enrollmentDate: '2026-09-02',
        }),
      ),
    ).rejects.toBeInstanceOf(StudentEnrollmentPlacementConflictException);
  });

  it('rejects inactive academic years with the canonical code', async () => {
    const placementService = {
      resolvePlacement: jest
        .fn()
        .mockRejectedValue(
          new StudentEnrollmentInactiveYearException({
            academicYearId: 'year-2',
          }),
        ),
    } as unknown as EnrollmentPlacementService;
    const validateUseCase = new ValidateEnrollmentUseCase(
      placementService,
      { execute: jest.fn() } as unknown as EnrollApplicationHandoffUseCase,
    );

    const result = await withStudentsScope(() =>
      validateUseCase.execute({
        studentId: 'student-1',
        academicYearId: 'year-2',
        classroomId: 'classroom-1',
        enrollmentDate: '2026-09-01',
      }),
    );

    expect(result).toEqual({
      valid: false,
      errors: ['students.enrollment.inactive_year'],
    });
  });
});
