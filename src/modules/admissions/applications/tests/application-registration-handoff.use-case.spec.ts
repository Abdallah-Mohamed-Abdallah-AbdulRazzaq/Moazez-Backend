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
import { GetApplicationRegistrationHandoffUseCase } from '../application/get-application-registration-handoff.use-case';
import {
  ApplicationRegistrationHandoffRecord,
  ApplicationsRepository,
} from '../infrastructure/applications.repository';
import { ApplicationEnrollmentHandoffValidator } from '../validators/application-enrollment-handoff.validator';

describe('Admissions application registration handoff', () => {
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
          'admissions.applications.view',
          'admissions.applications.manage',
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

  function createRepository(params?: {
    application?: ApplicationRegistrationHandoffRecord | null;
    totalPlacementTests?: number;
    completedPlacementTests?: number;
    totalInterviews?: number;
    completedInterviews?: number;
  }): ApplicationsRepository {
    return {
      findApplicationRegistrationHandoffById: jest
        .fn()
        .mockResolvedValue(params?.application ?? buildApplication()),
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

  function createUseCase(repository: ApplicationsRepository) {
    return new GetApplicationRegistrationHandoffUseCase(
      repository,
      new ApplicationEnrollmentHandoffValidator(repository),
    );
  }

  it('returns a wizard-compatible draft for an accepted application', async () => {
    const repository = createRepository();
    const useCase = createUseCase(repository);

    const result = await withScope(() => useCase.execute('application-1'));

    expect(result).toEqual(
      expect.objectContaining({
        applicationId: 'application-1',
        status: 'accepted',
        eligible: true,
        alreadyRegistered: false,
        registered: null,
        eligibility: {
          canPrepareHandoff: true,
          canSubmitRegistration: false,
          reasonCodes: [],
          placementTests: { total: 1, completed: 1 },
          interviews: { total: 1, completed: 1 },
          documents: {
            included: true,
            blockingPolicy: 'not_enforced_by_current_handoff',
          },
        },
      }),
    );
    expect(result.wizardDraft).toEqual(
      expect.objectContaining({
        student: expect.objectContaining({
          name: 'Layla Hassan',
          full_name_en: 'Layla Hassan',
          first_name_en: 'Layla',
          family_name_en: 'Hassan',
          dateOfBirth: '2018-04-12',
          date_of_birth: '2018-04-12',
          gender: 'female',
          nationality: 'Egyptian',
          status: 'active',
        }),
        enrollment: {
          academicYearId: 'year-1',
          gradeId: 'grade-1',
          sectionId: null,
          classroomId: null,
          termId: null,
          enrollmentDate: null,
          status: 'active',
        },
        studentAccount: { mode: 'none' },
      }),
    );
    expect(result.wizardDraft?.guardians).toEqual([
      {
        profile: expect.objectContaining({
          full_name: 'Nour Ali',
          relation: 'mother',
          phone_primary: '+201001112233',
          phone_secondary: null,
          email: 'nour.contact@example.com',
          national_id: null,
          job_title: null,
          workplace: null,
          can_pickup: null,
          can_receive_notifications: null,
        }),
        relationship: { is_primary: true },
        account: { mode: 'none' },
      },
    ]);
    expect(result.missingRequiredForRegistration).toEqual([
      'enrollment.classroomId',
      'enrollment.enrollmentDate',
    ]);
    expect(result.warnings).toEqual([
      'documents.pending_review_present',
      'documents.not_blocking_current_handoff',
      'enrollment.classroomId_required',
      'enrollment.enrollmentDate_required',
    ]);
  });

  it('summarizes source and documents without storage internals', async () => {
    const result = await withScope(() =>
      createUseCase(createRepository()).execute('application-1'),
    );

    expect(result.source).toEqual({
      application: expect.objectContaining({
        id: 'application-1',
        studentName: 'Layla Hassan',
        requestedAcademicYearId: 'year-1',
        requestedAcademicYearName: 'Academic Year 2026/2027',
        requestedGradeId: 'grade-1',
        requestedGradeName: 'Grade 4',
        source: 'in_app',
        status: 'accepted',
      }),
      applicantRequest: expect.objectContaining({
        id: 'request-1',
        childFullName: 'Layla Hassan',
        previousSchool: 'ABC School',
        notesProvided: true,
        applicant: {
          fullName: 'Nour Ali',
          relationship: 'mother',
          phoneNumber: '+201001112233',
          city: 'Cairo',
          email: 'nour.contact@example.com',
        },
      }),
      lead: expect.objectContaining({
        id: 'lead-1',
        primaryContactName: 'Lead Parent',
      }),
    });
    expect(result.documents).toEqual([
      {
        applicationDocumentId: 'document-1',
        documentType: 'birth_certificate',
        status: 'pending_review',
        notes: 'Readable copy',
        source: 'applicant_upload',
        file: {
          id: 'file-1',
          originalName: 'birth-certificate.pdf',
          mimeType: 'application/pdf',
          sizeBytes: '12345',
        },
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('bucket');
    expect(JSON.stringify(result)).not.toContain('objectKey');
  });

  it('uses lead fallback and reports missing guardian relation', async () => {
    const application = buildApplication({
      applicantAdmissionRequest: null,
    });
    const result = await withScope(() =>
      createUseCase(createRepository({ application })).execute('application-1'),
    );

    expect(result.wizardDraft?.guardians).toEqual([
      {
        profile: expect.objectContaining({
          full_name: 'Lead Parent',
          relation: null,
          phone_primary: '+201000000000',
          email: 'lead.parent@example.com',
        }),
        relationship: { is_primary: true },
        account: { mode: 'none' },
      },
    ]);
    expect(result.warnings).toContain('guardian.relation_missing');
    expect(result.missingRequiredForRegistration).toContain(
      'guardians[0].profile.relation',
    );
  });

  it('returns guardian missing requirements when no guardian-like source exists', async () => {
    const application = buildApplication({
      lead: null,
      applicantAdmissionRequest: null,
    });
    const result = await withScope(() =>
      createUseCase(createRepository({ application })).execute('application-1'),
    );

    expect(result.wizardDraft?.guardians).toEqual([]);
    expect(result.warnings).toContain('guardian.source_missing');
    expect(result.missingRequiredForRegistration).toEqual(
      expect.arrayContaining([
        'guardians[0].profile.full_name',
        'guardians[0].profile.relation',
        'guardians[0].profile.phone_primary',
      ]),
    );
  });

  it('adds safe conflict warnings and keeps Application placement canonical', async () => {
    const application = buildApplication({
      applicantAdmissionRequest: {
        ...buildApplication().applicantAdmissionRequest!,
        childFullName: 'Layla Different',
        requestedAcademicYearId: 'year-2',
        requestedGradeId: 'grade-2',
      },
    });

    const result = await withScope(() =>
      createUseCase(createRepository({ application })).execute('application-1'),
    );

    expect(result.wizardDraft?.student.full_name_en).toBe('Layla Hassan');
    expect(result.wizardDraft?.enrollment.academicYearId).toBe('year-1');
    expect(result.wizardDraft?.enrollment.gradeId).toBe('grade-1');
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        'application.applicant_request_name_conflict',
        'application.requested_academic_year_conflict',
        'application.requested_grade_conflict',
      ]),
    );
  });

  it('returns alreadyRegistered response without duplicate wizard draft', async () => {
    const application = buildApplication({
      student: buildRegisteredStudent(),
    });
    const result = await withScope(() =>
      createUseCase(createRepository({ application })).execute('application-1'),
    );

    expect(result.alreadyRegistered).toBe(true);
    expect(result.eligible).toBe(false);
    expect(result.wizardDraft).toBeNull();
    expect(result.registered?.student).toEqual(
      expect.objectContaining({
        id: 'student-1',
        full_name_en: 'Layla Hassan',
        student_id: null,
      }),
    );
    expect(result.registered?.enrollment).toEqual(
      expect.objectContaining({
        enrollmentId: 'enrollment-1',
        studentId: 'student-1',
        academicYearId: 'year-1',
        classroomId: 'classroom-1',
        status: 'active',
      }),
    );
    expect(result.eligibility.reasonCodes).toEqual([
      'application.already_registered',
    ]);
    expect(result.warnings).toContain('application.already_registered');
    expect(result.missingRequiredForRegistration).toEqual([]);
  });

  it('does not expose internal ownership or credential fields', async () => {
    const result = await withScope(() =>
      createUseCase(createRepository()).execute('application-1'),
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
  });
});
