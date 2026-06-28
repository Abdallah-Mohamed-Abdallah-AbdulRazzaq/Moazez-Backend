import {
  AdmissionApplicationSource,
  AdmissionApplicationStatus,
  AdmissionDecisionType,
  AdmissionDocumentStatus,
  FileVisibility,
  InterviewStatus,
  PlacementTestStatus,
  StudentEnrollmentStatus,
  StudentStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { CreateSchoolRegistrationUseCase } from '../../../students/registration/application/create-school-registration.use-case';
import { RegisterAcceptedApplicationUseCase } from '../application/register-accepted-application.use-case';
import { RegisterAcceptedApplicationDto } from '../dto/application-registration-submit.dto';
import { ApplicationNotAcceptedException } from '../domain/application.exceptions';
import {
  ApplicationRegistrationHandoffRecord,
  ApplicationsRepository,
} from '../infrastructure/applications.repository';
import { ApplicationEnrollmentHandoffValidator } from '../validators/application-enrollment-handoff.validator';
import { DecisionRequiresAllStepsException } from '../../decisions/domain/admission-decision.exceptions';

describe('RegisterAcceptedApplicationUseCase', () => {
  const createdAt = new Date('2026-06-01T08:00:00.000Z');
  const updatedAt = new Date('2026-06-01T09:00:00.000Z');

  async function withScope<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
        roleId: 'role-1',
        permissions: [
          'admissions.applications.manage',
          'students.records.manage',
          'students.guardians.manage',
          'students.enrollments.manage',
        ],
      });

      return fn();
    });
  }

  function buildApplication(
    overrides?: Partial<ApplicationRegistrationHandoffRecord>,
  ): ApplicationRegistrationHandoffRecord {
    return {
      id: 'application-1',
      schoolId: 'school-1',
      organizationId: 'org-1',
      leadId: 'lead-1',
      studentName: 'Layla Hassan',
      requestedAcademicYearId: 'year-1',
      requestedGradeId: 'grade-1',
      source: AdmissionApplicationSource.IN_APP,
      status: AdmissionApplicationStatus.ACCEPTED,
      submittedAt: new Date('2026-04-21T08:00:00.000Z'),
      createdAt,
      updatedAt,
      decision: {
        id: 'decision-1',
        decision: AdmissionDecisionType.ACCEPT,
        decidedAt: new Date('2026-04-22T09:00:00.000Z'),
      },
      requestedAcademicYear: {
        id: 'year-1',
        nameAr: 'Academic Year 2026/2027 AR',
        nameEn: 'Academic Year 2026/2027',
        isActive: true,
      },
      requestedGrade: {
        id: 'grade-1',
        stageId: 'stage-1',
        nameAr: 'Grade 4 AR',
        nameEn: 'Grade 4',
      },
      lead: {
        id: 'lead-1',
        studentName: 'Layla Hassan',
        primaryContactName: 'Lead Parent',
        phone: '+201000000000',
        email: 'lead.parent@example.com',
      },
      applicantAdmissionRequest: {
        id: 'request-1',
        schoolId: 'school-1',
        applicationId: 'application-1',
        requestedAcademicYearId: 'year-1',
        requestedGradeId: 'grade-1',
        childFirstName: 'Layla',
        childLastName: 'Hassan',
        childFullName: 'Layla Hassan',
        childDateOfBirth: new Date('2018-04-12T00:00:00.000Z'),
        childGender: 'female',
        childNationality: 'Egyptian',
        previousSchool: 'ABC School',
        notes: 'Needs placement confirmation',
        submittedAt: new Date('2026-04-21T08:00:00.000Z'),
        requestedAcademicYear: {
          id: 'year-1',
          nameAr: 'Academic Year 2026/2027 AR',
          nameEn: 'Academic Year 2026/2027',
        },
        requestedGrade: {
          id: 'grade-1',
          nameAr: 'Grade 4 AR',
          nameEn: 'Grade 4',
        },
        applicantProfile: {
          fullName: 'Nour Ali',
          phoneNumber: '+201001112233',
          city: 'Cairo',
          relationship: 'mother',
          user: {
            email: 'nour.login@example.com',
            contactEmail: 'nour.contact@example.com',
          },
        },
      },
      documents: [
        {
          id: 'document-1',
          applicationId: 'application-1',
          fileId: 'file-1',
          documentType: 'birth_certificate',
          status: AdmissionDocumentStatus.PENDING_REVIEW,
          notes: 'Readable copy',
          createdAt,
          updatedAt,
          file: {
            id: 'file-1',
            originalName: 'birth-certificate.pdf',
            mimeType: 'application/pdf',
            sizeBytes: BigInt(12345),
            visibility: FileVisibility.PRIVATE,
          },
          applicantAdmissionRequestDocuments: [{ id: 'applicant-document-1' }],
        },
      ],
      student: null,
      ...overrides,
    };
  }

  function buildRegisteredStudent(): NonNullable<
    ApplicationRegistrationHandoffRecord['student']
  > {
    return {
      id: 'student-1',
      schoolId: 'school-1',
      organizationId: 'org-1',
      applicationId: 'application-1',
      userId: null,
      firstName: 'Layla',
      fatherNameEn: null,
      grandfatherNameEn: null,
      lastName: 'Hassan',
      firstNameAr: null,
      fatherNameAr: null,
      grandfatherNameAr: null,
      familyNameAr: null,
      birthDate: new Date('2018-04-12T00:00:00.000Z'),
      gender: 'female',
      nationality: 'Egyptian',
      addressLine: null,
      city: null,
      district: null,
      studentPhone: null,
      studentEmail: null,
      status: StudentStatus.ACTIVE,
      createdAt,
      updatedAt,
      deletedAt: null,
      enrollments: [
        {
          id: 'enrollment-1',
          schoolId: 'school-1',
          studentId: 'student-1',
          academicYearId: 'year-1',
          termId: null,
          classroomId: 'classroom-1',
          status: StudentEnrollmentStatus.ACTIVE,
          enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
          endedAt: null,
          exitReason: null,
          createdAt,
          updatedAt,
          deletedAt: null,
          academicYear: {
            id: 'year-1',
            nameAr: 'Academic Year 2026/2027 AR',
            nameEn: 'Academic Year 2026/2027',
            isActive: true,
          },
          classroom: {
            id: 'classroom-1',
            nameAr: 'Classroom 4A AR',
            nameEn: 'Classroom 4A',
            section: {
              id: 'section-1',
              nameAr: 'Section A AR',
              nameEn: 'Section A',
              grade: {
                id: 'grade-1',
                nameAr: 'Grade 4 AR',
                nameEn: 'Grade 4',
              },
            },
          },
        },
      ],
    };
  }

  function command(
    overrides?: Partial<RegisterAcceptedApplicationDto>,
  ): RegisterAcceptedApplicationDto {
    return {
      student: {
        full_name_en: 'Layla Hassan',
        dateOfBirth: '2018-04-12',
      },
      guardians: [
        {
          profile: {
            full_name: 'Nour Ali',
            relation: 'Mother',
            phone_primary: '+201001112233',
          },
          relationship: { is_primary: true },
          account: { mode: 'none' },
        },
      ],
      enrollment: {
        academicYearId: 'year-1',
        gradeId: 'grade-1',
        sectionId: 'section-1',
        classroomId: 'classroom-1',
        enrollmentDate: '2026-09-01',
      },
      studentAccount: { mode: 'none' },
      ...overrides,
    };
  }

  function wizardResponse() {
    return {
      registrationId: 'student-1',
      student: {
        id: 'student-1',
        student_id: null,
        name: 'Layla Hassan',
        first_name_en: 'Layla',
        father_name_en: null,
        grandfather_name_en: null,
        family_name_en: 'Hassan',
        first_name_ar: null,
        father_name_ar: null,
        grandfather_name_ar: null,
        family_name_ar: null,
        full_name_en: 'Layla Hassan',
        full_name_ar: null,
        dateOfBirth: '2018-04-12',
        date_of_birth: '2018-04-12',
        gender: 'female',
        nationality: 'Egyptian',
        status: 'active',
        contact: {
          address_line: null,
          city: null,
          district: null,
          student_phone: null,
          student_email: null,
        },
        created_at: createdAt.toISOString(),
        updated_at: updatedAt.toISOString(),
      },
      guardians: [
        {
          guardianId: 'guardian-1',
          full_name: 'Nour Ali',
          first_name: 'Nour',
          last_name: 'Ali',
          relation: 'mother',
          phone_primary: '+201001112233',
          phone_secondary: null,
          email: null,
          national_id: null,
          job_title: null,
          workplace: null,
          is_primary: true,
          can_pickup: null,
          can_receive_notifications: null,
          created_at: createdAt.toISOString(),
          updated_at: updatedAt.toISOString(),
        },
      ],
      enrollment: {
        enrollmentId: 'enrollment-1',
        studentId: 'student-1',
        academicYearId: 'year-1',
        academicYearName: 'Academic Year 2026/2027',
        termId: null,
        classroomId: 'classroom-1',
        classroomName: 'Classroom 4A',
        gradeId: 'grade-1',
        gradeName: 'Grade 4',
        sectionId: 'section-1',
        sectionName: 'Section A',
        enrollmentDate: '2026-09-01',
        status: 'active',
      },
      parentAccounts: [
        {
          target: 'parent',
          guardianId: 'guardian-1',
          mode: 'none',
          status: 'skipped',
        },
      ],
      studentAccount: {
        target: 'student',
        mode: 'none',
        status: 'skipped',
      },
      warnings: ['parent_account_skipped:guardian-1', 'student_account_skipped'],
      createdAt: createdAt.toISOString(),
      completedAt: updatedAt.toISOString(),
    };
  }

  function createRepository(params?: {
    application?: ApplicationRegistrationHandoffRecord | null;
    applications?: ApplicationRegistrationHandoffRecord[];
    totalPlacementTests?: number;
    completedPlacementTests?: number;
    totalInterviews?: number;
    completedInterviews?: number;
  }): ApplicationsRepository {
    const applications = params?.applications
      ? [...params.applications]
      : [params?.application ?? buildApplication()];

    return {
      findApplicationRegistrationHandoffById: jest
        .fn()
        .mockImplementation(() => Promise.resolve(applications.shift() ?? null)),
      countPlacementTestsForApplication: jest
        .fn()
        .mockImplementation(
          async ({ status }: { status?: PlacementTestStatus }) =>
            status === PlacementTestStatus.COMPLETED
              ? (params?.completedPlacementTests ?? 1)
              : (params?.totalPlacementTests ?? 1),
        ),
      countInterviewsForApplication: jest
        .fn()
        .mockImplementation(
          async ({ status }: { status?: InterviewStatus }) =>
            status === InterviewStatus.COMPLETED
              ? (params?.completedInterviews ?? 1)
              : (params?.totalInterviews ?? 1),
        ),
      createApplication: jest.fn(),
      updateApplication: jest.fn(),
    } as unknown as ApplicationsRepository;
  }

  function createUseCase(params?: {
    repository?: ApplicationsRepository;
    wizard?: Partial<CreateSchoolRegistrationUseCase>;
    authRepository?: Partial<AuthRepository>;
  }) {
    const repository = params?.repository ?? createRepository();
    const wizard = {
      execute: jest.fn().mockResolvedValue(wizardResponse()),
      ...params?.wizard,
    } as unknown as CreateSchoolRegistrationUseCase;
    const authRepository = {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
      ...params?.authRepository,
    } as unknown as AuthRepository;

    return {
      repository,
      wizard,
      authRepository,
      useCase: new RegisterAcceptedApplicationUseCase(
        repository,
        new ApplicationEnrollmentHandoffValidator(repository),
        wizard,
        authRepository,
      ),
    };
  }

  it('registers an accepted application through the school registration wizard', async () => {
    const deps = createUseCase();

    const result = await withScope(() =>
      deps.useCase.execute('application-1', command()),
    );

    expect(deps.wizard.execute).toHaveBeenCalledWith(command(), {
      source: 'admissions_application',
      sourceApplicationId: 'application-1',
    });
    expect(result).toEqual(
      expect.objectContaining({
        applicationId: 'application-1',
        registered: true,
        alreadyRegistered: false,
        registration: expect.objectContaining({
          student: expect.objectContaining({ id: 'student-1' }),
          enrollment: expect.objectContaining({ enrollmentId: 'enrollment-1' }),
        }),
        warnings: ['parent_account_skipped:guardian-1', 'student_account_skipped'],
      }),
    );
    expect(deps.authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        module: 'admissions',
        action: 'admissions.application.register',
        resourceType: 'application',
        resourceId: 'application-1',
        after: {
          applicationId: 'application-1',
          studentId: 'student-1',
          enrollmentId: 'enrollment-1',
          guardianCount: 1,
          createdVia: 'admissions_application_register',
        },
      }),
    );
  });

  it('uses only the route application id as the trusted source id', async () => {
    const deps = createUseCase();
    const unsafeCommand = command({
      student: {
        ...command().student,
        applicationId: 'body-application-id',
      } as RegisterAcceptedApplicationDto['student'] & {
        applicationId: string;
      },
    });

    await withScope(() =>
      deps.useCase.execute('route-application-id', unsafeCommand),
    );

    expect(deps.wizard.execute).toHaveBeenCalledWith(unsafeCommand, {
      source: 'admissions_application',
      sourceApplicationId: 'application-1',
    });
  });

  it('returns alreadyRegistered without creating duplicate records', async () => {
    const application = buildApplication({
      student: buildRegisteredStudent(),
    });
    const deps = createUseCase({ repository: createRepository({ application }) });

    const result = await withScope(() =>
      deps.useCase.execute('application-1', command()),
    );

    expect(deps.wizard.execute).not.toHaveBeenCalled();
    expect(deps.authRepository.createAuditLog).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        applicationId: 'application-1',
        registered: true,
        alreadyRegistered: true,
        registration: {
          student: expect.objectContaining({
            id: 'student-1',
            full_name_en: 'Layla Hassan',
          }),
          enrollment: expect.objectContaining({
            enrollmentId: 'enrollment-1',
            studentId: 'student-1',
          }),
        },
        warnings: ['application.already_registered'],
      }),
    );
    expect(JSON.stringify(result)).not.toContain('schoolId');
    expect(JSON.stringify(result)).not.toContain('organizationId');
    expect(JSON.stringify(result)).not.toContain('userId');
    expect(JSON.stringify(result)).not.toContain('membershipId');
    expect(JSON.stringify(result)).not.toContain('roleId');
    expect(JSON.stringify(result)).not.toContain('passwordHash');
    expect(JSON.stringify(result)).not.toContain('deletedAt');
  });

  it('warns when an already registered Student has no active enrollment', async () => {
    const student = buildRegisteredStudent();
    student.enrollments = [];
    const deps = createUseCase({
      repository: createRepository({
        application: buildApplication({ student }),
      }),
    });

    const result = await withScope(() =>
      deps.useCase.execute('application-1', command()),
    );

    expect(result.registration).toEqual(
      expect.objectContaining({ enrollment: null }),
    );
    expect(result.warnings).toEqual([
      'application.already_registered',
      'application.already_has_student_without_active_enrollment',
    ]);
  });

  it('collapses a concurrent unique conflict into the alreadyRegistered response', async () => {
    const repository = createRepository({
      applications: [
        buildApplication(),
        buildApplication({ student: buildRegisteredStudent() }),
      ],
    });
    const deps = createUseCase({
      repository,
      wizard: {
        execute: jest.fn().mockRejectedValue({ code: 'P2002' }),
      } as Partial<CreateSchoolRegistrationUseCase>,
    });

    const result = await withScope(() =>
      deps.useCase.execute('application-1', command()),
    );

    expect(result.alreadyRegistered).toBe(true);
    expect(result.warnings).toContain('application.already_registered');
  });

  it('keeps non-accepted and incomplete workflow validation as submit blockers', async () => {
    const nonAccepted = createUseCase({
      repository: createRepository({
        application: buildApplication({
          status: AdmissionApplicationStatus.WAITLISTED,
          decision: {
            id: 'decision-1',
            decision: AdmissionDecisionType.WAITLIST,
            decidedAt: new Date('2026-04-22T09:00:00.000Z'),
          },
        }),
      }),
    });

    await expect(
      withScope(() => nonAccepted.useCase.execute('application-1', command())),
    ).rejects.toBeInstanceOf(ApplicationNotAcceptedException);
    expect(nonAccepted.wizard.execute).not.toHaveBeenCalled();

    const incomplete = createUseCase({
      repository: createRepository({
        application: buildApplication(),
        totalPlacementTests: 1,
        completedPlacementTests: 0,
        totalInterviews: 1,
        completedInterviews: 1,
      }),
    });

    await expect(
      withScope(() => incomplete.useCase.execute('application-1', command())),
    ).rejects.toBeInstanceOf(DecisionRequiresAllStepsException);
    expect(incomplete.wizard.execute).not.toHaveBeenCalled();
  });

  it('does not expose internal ownership, credential, or applicant identity fields', async () => {
    const deps = createUseCase();

    const result = await withScope(() =>
      deps.useCase.execute('application-1', command()),
    );
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain('schoolId');
    expect(serialized).not.toContain('organizationId');
    expect(serialized).not.toContain('userId');
    expect(serialized).not.toContain('membershipId');
    expect(serialized).not.toContain('roleId');
    expect(serialized).not.toContain('passwordHash');
    expect(serialized).not.toContain('deletedAt');
    expect(serialized).not.toContain('applicantUserId');
    expect(serialized).not.toContain('applicantProfileId');
    expect(serialized).not.toContain('StudentDocument');
  });
});
