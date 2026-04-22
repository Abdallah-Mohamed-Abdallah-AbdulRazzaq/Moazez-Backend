import { StudentEnrollmentStatus, StudentStatus, UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import {
  StudentEnrollmentInactiveYearException,
  StudentEnrollmentPlacementConflictException,
} from '../../enrollments/domain/enrollment.exceptions';
import { EnrollmentPlacementService } from '../../enrollments/domain/enrollment-placement.service';
import { EnrollmentsRepository } from '../../enrollments/infrastructure/enrollments.repository';
import { StudentsRepository } from '../../students/infrastructure/students.repository';
import { StudentEnrollmentAlreadyWithdrawnException } from '../domain/lifecycle.exceptions';
import { PromotionPlacementService } from '../domain/promotion-placement.service';
import { PromoteStudentEnrollmentUseCase } from '../application/promote-student-enrollment.use-case';
import { TransferStudentEnrollmentUseCase } from '../application/transfer-student-enrollment.use-case';
import { WithdrawStudentEnrollmentUseCase } from '../application/withdraw-student-enrollment.use-case';

describe('students lifecycle transition use cases', () => {
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
          'students.enrollments.view',
          'students.lifecycle.manage',
        ],
      });

      return fn();
    });
  }

  function buildStudentRecord() {
    return {
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
    };
  }

  function buildEnrollmentRecord(overrides?: Partial<{
    id: string;
    studentId: string;
    academicYearId: string;
    academicYearName: string;
    classroomId: string;
    classroomName: string;
    sectionId: string;
    sectionName: string;
    gradeId: string;
    gradeName: string;
    termId: string | null;
    status: StudentEnrollmentStatus;
    enrolledAt: Date;
    endedAt: Date | null;
    exitReason: string | null;
    createdAt: Date;
    updatedAt: Date;
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
      endedAt: overrides?.endedAt ?? null,
      exitReason: overrides?.exitReason ?? null,
      createdAt: overrides?.createdAt ?? new Date('2026-09-01T08:00:00.000Z'),
      updatedAt: overrides?.updatedAt ?? new Date('2026-09-01T08:00:00.000Z'),
      deletedAt: null,
      academicYear: {
        id: overrides?.academicYearId ?? 'year-1',
        nameAr: `${overrides?.academicYearName ?? 'Academic Year 2026/2027'} AR`,
        nameEn: overrides?.academicYearName ?? 'Academic Year 2026/2027',
        isActive: true,
      },
      classroom: {
        id: overrides?.classroomId ?? 'classroom-1',
        nameAr: `${overrides?.classroomName ?? 'Demo Classroom A'} AR`,
        nameEn: overrides?.classroomName ?? 'Demo Classroom A',
        section: {
          id: overrides?.sectionId ?? 'section-1',
          nameAr: `${overrides?.sectionName ?? 'Demo Section A'} AR`,
          nameEn: overrides?.sectionName ?? 'Demo Section A',
          grade: {
            id: overrides?.gradeId ?? 'grade-1',
            nameAr: `${overrides?.gradeName ?? 'Demo Grade 1'} AR`,
            nameEn: overrides?.gradeName ?? 'Demo Grade 1',
          },
        },
      },
    };
  }

  function buildPlacementResolution(overrides?: Partial<{
    academicYearId: string;
    academicYearName: string;
    classroomId: string;
    classroomName: string;
    sectionId: string;
    sectionName: string;
    gradeId: string;
    gradeName: string;
    classroomCapacity: number | null;
  }>) {
    return {
      student: buildStudentRecord(),
      academicYear: {
        id: overrides?.academicYearId ?? 'year-1',
        nameAr: `${overrides?.academicYearName ?? 'Academic Year 2026/2027'} AR`,
        nameEn: overrides?.academicYearName ?? 'Academic Year 2026/2027',
        isActive: true,
      },
      term: null,
      grade: {
        id: overrides?.gradeId ?? 'grade-1',
        schoolId: 'school-1',
        stageId: 'stage-1',
        nameAr: `${overrides?.gradeName ?? 'Demo Grade 1'} AR`,
        nameEn: overrides?.gradeName ?? 'Demo Grade 1',
        sortOrder: 1,
        capacity: 24,
        createdAt: new Date('2026-04-22T09:00:00.000Z'),
        updatedAt: new Date('2026-04-22T09:00:00.000Z'),
        deletedAt: null,
      },
      section: {
        id: overrides?.sectionId ?? 'section-2',
        schoolId: 'school-1',
        gradeId: overrides?.gradeId ?? 'grade-1',
        nameAr: `${overrides?.sectionName ?? 'Demo Section B'} AR`,
        nameEn: overrides?.sectionName ?? 'Demo Section B',
        sortOrder: 2,
        capacity: 24,
        createdAt: new Date('2026-04-22T09:00:00.000Z'),
        updatedAt: new Date('2026-04-22T09:00:00.000Z'),
        deletedAt: null,
      },
      classroom: {
        id: overrides?.classroomId ?? 'classroom-2',
        schoolId: 'school-1',
        sectionId: overrides?.sectionId ?? 'section-2',
        roomId: null,
        nameAr: `${overrides?.classroomName ?? 'Demo Classroom B'} AR`,
        nameEn: overrides?.classroomName ?? 'Demo Classroom B',
        sortOrder: 1,
        capacity:
          overrides?.classroomCapacity === undefined
            ? 24
            : overrides.classroomCapacity,
        createdAt: new Date('2026-04-22T09:00:00.000Z'),
        updatedAt: new Date('2026-04-22T09:00:00.000Z'),
        deletedAt: null,
      },
      activeEnrollment: null,
    };
  }

  it('withdraws an active enrollment successfully', async () => {
    const activeEnrollment = buildEnrollmentRecord();
    const updatedEnrollment = buildEnrollmentRecord({
      status: StudentEnrollmentStatus.WITHDRAWN,
      endedAt: new Date('2026-03-20T00:00:00.000Z'),
      exitReason: 'Family relocation',
      updatedAt: new Date('2026-03-20T09:00:00.000Z'),
    });
    const studentsRepository = {
      findStudentById: jest.fn().mockResolvedValue(buildStudentRecord()),
    } as unknown as StudentsRepository;
    const enrollmentsRepository = {
      findActiveEnrollmentByStudentId: jest.fn().mockResolvedValue(activeEnrollment),
      withdrawEnrollment: jest.fn().mockResolvedValue(updatedEnrollment),
    } as unknown as EnrollmentsRepository;
    const authRepository = {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthRepository;

    const useCase = new WithdrawStudentEnrollmentUseCase(
      enrollmentsRepository,
      studentsRepository,
      authRepository,
    );

    const result = await withStudentsScope(() =>
      useCase.execute({
        studentId: 'student-1',
        effectiveDate: '2026-03-20',
        reason: 'Family relocation',
        notes: '',
        actionType: 'withdrawn',
        sourceRequestId: null,
      }),
    );

    expect((enrollmentsRepository.withdrawEnrollment as jest.Mock).mock.calls[0][0]).toEqual({
      enrollmentId: 'enrollment-1',
      effectiveDate: new Date('2026-03-20T00:00:00.000Z'),
      exitReason: 'Family relocation',
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: 'enrollment-1',
        actionType: 'withdrawn',
        studentId: 'student-1',
        fromClassroomId: 'classroom-1',
        toClassroomId: null,
        reason: 'Family relocation',
      }),
    );
    expect((authRepository.createAuditLog as jest.Mock).mock.calls[0][0]).toMatchObject({
      action: 'students.enrollment.withdraw',
      resourceId: 'enrollment-1',
    });
  });

  it('fails withdrawal with the canonical already-withdrawn code when no active enrollment exists', async () => {
    const studentsRepository = {
      findStudentById: jest.fn().mockResolvedValue(buildStudentRecord()),
    } as unknown as StudentsRepository;
    const enrollmentsRepository = {
      findActiveEnrollmentByStudentId: jest.fn().mockResolvedValue(null),
    } as unknown as EnrollmentsRepository;

    const useCase = new WithdrawStudentEnrollmentUseCase(
      enrollmentsRepository,
      studentsRepository,
      { createAuditLog: jest.fn() } as never,
    );

    await expect(
      withStudentsScope(() =>
        useCase.execute({
          studentId: 'student-1',
          effectiveDate: '2026-03-20',
          reason: 'Family relocation',
          notes: '',
          actionType: 'withdrawn',
        }),
      ),
    ).rejects.toBeInstanceOf(StudentEnrollmentAlreadyWithdrawnException);
  });

  it('transfers an enrollment successfully', async () => {
    const activeEnrollment = buildEnrollmentRecord();
    const completedEnrollment = buildEnrollmentRecord({
      status: StudentEnrollmentStatus.COMPLETED,
      endedAt: new Date('2026-03-15T00:00:00.000Z'),
      exitReason: 'Capacity balancing',
      updatedAt: new Date('2026-03-15T10:00:00.000Z'),
    });
    const nextEnrollment = buildEnrollmentRecord({
      id: 'enrollment-2',
      classroomId: 'classroom-2',
      classroomName: 'Demo Classroom B',
      sectionId: 'section-2',
      sectionName: 'Demo Section B',
      enrolledAt: new Date('2026-03-15T00:00:00.000Z'),
      createdAt: new Date('2026-03-15T10:00:00.000Z'),
      updatedAt: new Date('2026-03-15T10:00:00.000Z'),
    });
    const studentsRepository = {
      findStudentById: jest.fn().mockResolvedValue(buildStudentRecord()),
    } as unknown as StudentsRepository;
    const enrollmentsRepository = {
      findActiveEnrollmentByStudentId: jest.fn().mockResolvedValue(activeEnrollment),
      countActiveEnrollmentsInPlacement: jest.fn().mockResolvedValue(0),
      completeEnrollmentAndCreateNext: jest.fn().mockResolvedValue({
        previousEnrollment: completedEnrollment,
        nextEnrollment,
      }),
    } as unknown as EnrollmentsRepository;
    const placementService = {
      resolvePlacement: jest.fn().mockResolvedValue(
        buildPlacementResolution({
          sectionId: 'section-2',
          classroomId: 'classroom-2',
          sectionName: 'Demo Section B',
          classroomName: 'Demo Classroom B',
        }),
      ),
    } as unknown as EnrollmentPlacementService;
    const authRepository = {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthRepository;

    const useCase = new TransferStudentEnrollmentUseCase(
      enrollmentsRepository,
      studentsRepository,
      placementService,
      authRepository,
    );

    const result = await withStudentsScope(() =>
      useCase.execute({
        studentId: 'student-1',
        targetSectionId: 'section-2',
        targetClassroomId: 'classroom-2',
        effectiveDate: '2026-03-15',
        reason: 'Capacity balancing',
        notes: 'Mid-year move',
        sourceRequestId: null,
      }),
    );

    expect(
      (enrollmentsRepository.completeEnrollmentAndCreateNext as jest.Mock).mock.calls[0][0],
    ).toMatchObject({
      currentEnrollmentId: 'enrollment-1',
      newEnrollment: {
        studentId: 'student-1',
        academicYearId: 'year-1',
        classroomId: 'classroom-2',
      },
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: 'enrollment-2',
        actionType: 'transferred_internal',
        fromClassroomId: 'classroom-1',
        toClassroomId: 'classroom-2',
        reason: 'Capacity balancing',
      }),
    );
    expect((authRepository.createAuditLog as jest.Mock).mock.calls[0][0]).toMatchObject({
      action: 'students.enrollment.transfer',
      resourceId: 'enrollment-2',
    });
  });

  it('rejects transfer when the destination placement is at capacity', async () => {
    const studentsRepository = {
      findStudentById: jest.fn().mockResolvedValue(buildStudentRecord()),
    } as unknown as StudentsRepository;
    const enrollmentsRepository = {
      findActiveEnrollmentByStudentId: jest.fn().mockResolvedValue(buildEnrollmentRecord()),
      countActiveEnrollmentsInPlacement: jest.fn().mockResolvedValue(1),
    } as unknown as EnrollmentsRepository;
    const placementService = {
      resolvePlacement: jest.fn().mockResolvedValue(
        buildPlacementResolution({
          sectionId: 'section-2',
          classroomId: 'classroom-2',
          classroomCapacity: 1,
        }),
      ),
    } as unknown as EnrollmentPlacementService;

    const useCase = new TransferStudentEnrollmentUseCase(
      enrollmentsRepository,
      studentsRepository,
      placementService,
      { createAuditLog: jest.fn() } as never,
    );

    await expect(
      withStudentsScope(() =>
        useCase.execute({
          studentId: 'student-1',
          targetSectionId: 'section-2',
          targetClassroomId: 'classroom-2',
          effectiveDate: '2026-03-15',
          reason: 'Capacity balancing',
          notes: '',
        }),
      ),
    ).rejects.toBeInstanceOf(StudentEnrollmentPlacementConflictException);
  });

  it('promotes an enrollment successfully', async () => {
    const activeEnrollment = buildEnrollmentRecord();
    const completedEnrollment = buildEnrollmentRecord({
      status: StudentEnrollmentStatus.COMPLETED,
      endedAt: new Date('2026-09-01T00:00:00.000Z'),
      exitReason: 'Promoted',
      updatedAt: new Date('2026-09-01T08:30:00.000Z'),
    });
    const nextEnrollment = buildEnrollmentRecord({
      id: 'enrollment-3',
      academicYearId: 'year-2',
      academicYearName: 'Academic Year 2027/2028',
      classroomId: 'classroom-3',
      classroomName: 'Demo Classroom Grade 2',
      sectionId: 'section-3',
      sectionName: 'Demo Section Grade 2',
      gradeId: 'grade-2',
      gradeName: 'Demo Grade 2',
      enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
      createdAt: new Date('2026-09-01T08:30:00.000Z'),
      updatedAt: new Date('2026-09-01T08:30:00.000Z'),
    });
    const studentsRepository = {
      findStudentById: jest.fn().mockResolvedValue(buildStudentRecord()),
    } as unknown as StudentsRepository;
    const enrollmentsRepository = {
      findActiveEnrollmentByStudentId: jest.fn().mockResolvedValue(activeEnrollment),
      countActiveEnrollmentsInPlacement: jest.fn().mockResolvedValue(0),
      completeEnrollmentAndCreateNext: jest.fn().mockResolvedValue({
        previousEnrollment: completedEnrollment,
        nextEnrollment,
      }),
    } as unknown as EnrollmentsRepository;
    const promotionPlacementService = {
      resolvePlacement: jest.fn().mockResolvedValue(
        buildPlacementResolution({
          academicYearId: 'year-2',
          academicYearName: 'Academic Year 2027/2028',
          gradeId: 'grade-2',
          gradeName: 'Demo Grade 2',
          sectionId: 'section-3',
          sectionName: 'Demo Section Grade 2',
          classroomId: 'classroom-3',
          classroomName: 'Demo Classroom Grade 2',
        }),
      ),
    } as unknown as PromotionPlacementService;
    const authRepository = {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthRepository;

    const useCase = new PromoteStudentEnrollmentUseCase(
      enrollmentsRepository,
      studentsRepository,
      promotionPlacementService,
      authRepository,
    );

    const result = await withStudentsScope(() =>
      useCase.execute({
        studentId: 'student-1',
        targetAcademicYear: 'Academic Year 2027/2028',
        effectiveDate: '2026-09-01',
        notes: 'Auto promotion',
      }),
    );

    expect(result).toEqual(
      expect.objectContaining({
        id: 'enrollment-3',
        actionType: 'promoted',
        fromGradeId: 'grade-1',
        toGradeId: 'grade-2',
        academicYear: 'Academic Year 2027/2028',
      }),
    );
    expect((authRepository.createAuditLog as jest.Mock).mock.calls[0][0]).toMatchObject({
      action: 'students.enrollment.promote',
      resourceId: 'enrollment-3',
    });
  });

  it('rejects promotion into an inactive academic year with the canonical code', async () => {
    const studentsRepository = {
      findStudentById: jest.fn().mockResolvedValue(buildStudentRecord()),
    } as unknown as StudentsRepository;
    const enrollmentsRepository = {
      findActiveEnrollmentByStudentId: jest.fn().mockResolvedValue(buildEnrollmentRecord()),
    } as unknown as EnrollmentsRepository;
    const promotionPlacementService = {
      resolvePlacement: jest
        .fn()
        .mockRejectedValue(
          new StudentEnrollmentInactiveYearException({
            academicYearId: 'year-2',
          }),
        ),
    } as unknown as PromotionPlacementService;

    const useCase = new PromoteStudentEnrollmentUseCase(
      enrollmentsRepository,
      studentsRepository,
      promotionPlacementService,
      { createAuditLog: jest.fn() } as never,
    );

    await expect(
      withStudentsScope(() =>
        useCase.execute({
          studentId: 'student-1',
          targetAcademicYear: 'Academic Year 2027/2028',
          effectiveDate: '2026-09-01',
          notes: 'Auto promotion',
        }),
      ),
    ).rejects.toBeInstanceOf(StudentEnrollmentInactiveYearException);
  });
});
