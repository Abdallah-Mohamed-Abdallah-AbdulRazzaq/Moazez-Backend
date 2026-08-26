import {
  createRequestContext,
  runWithRequestContext,
} from '../../../../common/context/request-context';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { StructureRepository } from '../../../academics/structure/infrastructure/structure.repository';
import { TermsRepository } from '../../../academics/structure/infrastructure/terms.repository';
import { StudentSeatLimitPolicyService } from '../../../platform-admin/application/student-seat-limit-policy.service';
import { PlatformEntitlementStudentSeatLimitExceededException } from '../../../platform-admin/domain/platform-admin-errors';
import {
  StudentEnrollmentInactiveYearException,
  StudentEnrollmentPlacementConflictException,
} from '../../enrollments/domain/enrollment.exceptions';
import { StudentPlacementCapacityPolicyService } from '../../enrollments/domain/student-placement-capacity-policy.service';
import { EnrollmentsRepository } from '../../enrollments/infrastructure/enrollments.repository';
import { StudentBulkRegistrationPreflightUseCase } from '../application/student-bulk-registration-preflight.use-case';
import { StudentBulkRegistrationPlacementService } from '../domain/student-bulk-registration-placement.service';

describe('StudentBulkRegistration placement readiness', () => {
  const command = {
    academicYearId: '11111111-1111-4111-8111-111111111111',
    termId: '22222222-2222-4222-8222-222222222222',
    classroomId: '33333333-3333-4333-8333-333333333333',
    enrollmentDate: '2026-09-01',
  };
  const academicYear = {
    id: command.academicYearId,
    nameAr: 'العام',
    nameEn: 'Year',
    isActive: true,
  };
  const term = {
    id: command.termId,
    schoolId: 'school-1',
    academicYearId: command.academicYearId,
    nameAr: 'الفصل',
    nameEn: 'Term',
  };
  const classroom = {
    id: command.classroomId,
    schoolId: 'school-1',
    sectionId: 'section-1',
    nameAr: 'الفصل',
    nameEn: 'Classroom',
    capacity: 25,
  };
  const section = {
    id: 'section-1',
    schoolId: 'school-1',
    gradeId: 'grade-1',
    nameAr: 'الشعبة',
    nameEn: 'Section',
  };
  const grade = {
    id: 'grade-1',
    schoolId: 'school-1',
    stageId: 'stage-1',
    nameAr: 'الصف',
    nameEn: 'Grade',
  };
  const stage = {
    id: 'stage-1',
    schoolId: 'school-1',
    nameAr: 'المرحلة',
    nameEn: 'Stage',
  };
  const seatDecision = {
    schoolId: 'school-1',
    reason: 'bulk_registration_intake',
    limit: 100,
    used: 40,
    remaining: 60,
    incrementBy: 1,
    wouldIncreaseActiveSeats: true,
    allowed: true,
    calculation: 'active_students',
  };

  let enrollmentsRepository: { findAcademicYearById: jest.Mock };
  let termsRepository: { findTermById: jest.Mock };
  let structureRepository: {
    findClassroomById: jest.Mock;
    findSectionById: jest.Mock;
    findGradeById: jest.Mock;
    findStageById: jest.Mock;
  };
  let seatPolicy: { assertCanIncreaseActiveStudentSeats: jest.Mock };
  let capacityPolicy: { assertCanPlace: jest.Mock };
  let placementService: StudentBulkRegistrationPlacementService;

  beforeEach(() => {
    enrollmentsRepository = {
      findAcademicYearById: jest.fn().mockResolvedValue(academicYear),
    };
    termsRepository = { findTermById: jest.fn().mockResolvedValue(term) };
    structureRepository = {
      findClassroomById: jest.fn().mockResolvedValue(classroom),
      findSectionById: jest.fn().mockResolvedValue(section),
      findGradeById: jest.fn().mockResolvedValue(grade),
      findStageById: jest.fn().mockResolvedValue(stage),
    };
    seatPolicy = {
      assertCanIncreaseActiveStudentSeats: jest
        .fn()
        .mockResolvedValue(seatDecision),
    };
    capacityPolicy = { assertCanPlace: jest.fn().mockResolvedValue(undefined) };
    placementService = new StudentBulkRegistrationPlacementService(
      enrollmentsRepository as unknown as EnrollmentsRepository,
      termsRepository as unknown as TermsRepository,
      structureRepository as unknown as StructureRepository,
      seatPolicy as unknown as StudentSeatLimitPolicyService,
      capacityPolicy as unknown as StudentPlacementCapacityPolicyService,
    );
  });

  it('resolves the scoped hierarchy and invokes both canonical policies for one seat', async () => {
    const result = await inStudentsScope(() =>
      placementService.resolve(command),
    );

    expect(result).toMatchObject({
      academicYear,
      term,
      classroom,
      section,
      grade,
      stage,
      enrollmentDate: '2026-09-01',
      scope: { schoolId: 'school-1', organizationId: 'org-1' },
    });
    expect(seatPolicy.assertCanIncreaseActiveStudentSeats).toHaveBeenCalledWith(
      {
        schoolId: 'school-1',
        incrementBy: 1,
        reason: 'bulk_registration_intake',
      },
    );
    expect(capacityPolicy.assertCanPlace).toHaveBeenCalledWith({
      academicYearId: command.academicYearId,
      classroom,
      incrementBy: 1,
    });
  });

  it('accepts placement without an optional term', async () => {
    const result = await inStudentsScope(() =>
      placementService.resolve({ ...command, termId: undefined }),
    );

    expect(result.term).toBeNull();
    expect(termsRepository.findTermById).not.toHaveBeenCalled();
  });

  it('rejects an inactive academic year with the canonical error', async () => {
    enrollmentsRepository.findAcademicYearById.mockResolvedValue({
      ...academicYear,
      isActive: false,
    });

    await expect(
      inStudentsScope(() => placementService.resolve(command)),
    ).rejects.toBeInstanceOf(StudentEnrollmentInactiveYearException);
    expect(
      seatPolicy.assertCanIncreaseActiveStudentSeats,
    ).not.toHaveBeenCalled();
  });

  it('rejects a term from another academic year', async () => {
    termsRepository.findTermById.mockResolvedValue({
      ...term,
      academicYearId: '44444444-4444-4444-8444-444444444444',
    });

    await expect(
      inStudentsScope(() => placementService.resolve(command)),
    ).rejects.toBeInstanceOf(ValidationDomainException);
  });

  it.each([
    ['classroom', 'findClassroomById'],
    ['section', 'findSectionById'],
    ['grade', 'findGradeById'],
    ['stage', 'findStageById'],
  ] as const)(
    'fails closed when the %s cannot be resolved',
    async (_label, method) => {
      structureRepository[method].mockResolvedValue(null);

      await expect(
        inStudentsScope(() => placementService.resolve(command)),
      ).rejects.toBeInstanceOf(NotFoundDomainException);
      expect(
        seatPolicy.assertCanIncreaseActiveStudentSeats,
      ).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      new StudentEnrollmentInactiveYearException(),
      'students.enrollment.inactive_year',
    ],
    [new ValidationDomainException(), 'validation.failed'],
    [
      new StudentEnrollmentPlacementConflictException(),
      'students.enrollment.placement_conflict',
    ],
    [
      new PlatformEntitlementStudentSeatLimitExceededException({
        schoolId: 'school-1',
        limit: 40,
        used: 40,
        remaining: 0,
        calculation: 'active_students',
      }),
      'platform.entitlement.student_seat_limit_exceeded',
    ],
  ])('returns a stable invalid preflight for %s', async (error, code) => {
    const mockedPlacement = { resolve: jest.fn().mockRejectedValue(error) };
    const useCase = new StudentBulkRegistrationPreflightUseCase(
      mockedPlacement as unknown as StudentBulkRegistrationPlacementService,
    );

    await expect(useCase.execute(command)).resolves.toEqual({
      valid: false,
      errors: [code],
      templateVersion: 1,
      placement: null,
      studentSeat: null,
    });
  });

  it('returns the resolved placement and seat snapshot without persistence', async () => {
    const useCase = new StudentBulkRegistrationPreflightUseCase(
      placementService,
    );

    const response = await inStudentsScope(() => useCase.execute(command));

    expect(response).toEqual({
      valid: true,
      errors: [],
      templateVersion: 1,
      placement: {
        academicYear: { id: academicYear.id, nameAr: 'العام', nameEn: 'Year' },
        term: { id: term.id, nameAr: 'الفصل', nameEn: 'Term' },
        stage: { id: stage.id, nameAr: 'المرحلة', nameEn: 'Stage' },
        grade: { id: grade.id, nameAr: 'الصف', nameEn: 'Grade' },
        section: { id: section.id, nameAr: 'الشعبة', nameEn: 'Section' },
        classroom: {
          id: classroom.id,
          nameAr: 'الفصل',
          nameEn: 'Classroom',
          capacity: 25,
        },
        enrollmentDate: '2026-09-01',
      },
      studentSeat: { limit: 100, used: 40, remaining: 60 },
    });
  });

  it('does not swallow standard not-found failures', async () => {
    const error = new NotFoundDomainException('Classroom not found');
    const mockedPlacement = { resolve: jest.fn().mockRejectedValue(error) };
    const useCase = new StudentBulkRegistrationPreflightUseCase(
      mockedPlacement as unknown as StudentBulkRegistrationPlacementService,
    );

    await expect(useCase.execute(command)).rejects.toBe(error);
  });
});

function inStudentsScope<T>(fn: () => Promise<T>): Promise<T> {
  const context = createRequestContext('bulk-placement-test');
  context.actor = { id: 'actor-1', userType: 'SCHOOL_USER' };
  context.activeMembership = {
    membershipId: 'membership-1',
    organizationId: 'org-1',
    schoolId: 'school-1',
    roleId: 'role-1',
    permissions: ['students.records.manage', 'students.enrollments.manage'],
  };
  return runWithRequestContext(context, fn);
}
