import {
  AuditOutcome,
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
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { TermsRepository } from '../../../academics/structure/infrastructure/terms.repository';
import { StructureRepository } from '../../../academics/structure/infrastructure/structure.repository';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { StudentSeatLimitPolicyService } from '../../../platform-admin/application/student-seat-limit-policy.service';
import { CreateOrLinkGuardianAccountUseCase } from '../../guardians/application/create-or-link-guardian-account.use-case';
import { EnrollmentsRepository } from '../../enrollments/infrastructure/enrollments.repository';
import { CreateOrLinkStudentAccountUseCase } from '../../students/application/create-or-link-student-account.use-case';
import { CreateSchoolRegistrationUseCase } from '../application/create-school-registration.use-case';
import { CreateSchoolRegistrationDto } from '../dto/school-registration.dto';
import {
  RegistrationCoreRecord,
  SchoolRegistrationRepository,
} from '../infrastructure/school-registration.repository';

describe('CreateSchoolRegistrationUseCase', () => {
  const now = new Date('2026-06-28T09:00:00.000Z');

  async function withStudentsScope<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'actor-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
        roleId: 'role-1',
        permissions: [
          'students.records.manage',
          'students.guardians.manage',
          'students.enrollments.manage',
        ],
      });

      return fn();
    });
  }

  function baseCommand(
    overrides?: Partial<CreateSchoolRegistrationDto>,
  ): CreateSchoolRegistrationDto {
    return {
      student: {
        full_name_en: 'Layla Ali Mahmoud Hassan',
        full_name_ar: 'LailaAr AliAr MahmoudAr HassanAr',
        dateOfBirth: '2016-02-14',
        gender: 'Female',
        nationality: 'Egyptian',
        contact: {
          address_line: '12 Nile Street',
          city: 'Cairo',
          district: 'Nasr City',
          student_phone: '+201001112233',
          student_email: 'layla@example.com',
        },
      },
      guardians: [
        {
          profile: {
            full_name: 'Mona Hassan',
            relation: 'Mother',
            phone_primary: '+201009998877',
            phone_secondary: '+201008887766',
            email: 'mona@example.com',
            national_id: '29901011234567',
            job_title: 'Engineer',
            workplace: 'Cairo Office',
            can_pickup: true,
            can_receive_notifications: true,
          },
        },
      ],
      enrollment: {
        academicYearId: 'year-1',
        gradeId: 'grade-1',
        sectionId: 'section-1',
        classroomId: 'classroom-1',
        enrollmentDate: '2026-09-01',
      },
      ...overrides,
    };
  }

  function credentialUser(userType: 'parent' | 'student') {
    return {
      userId: `${userType}-user-1`,
      fullName: userType === 'parent' ? 'Mona Hassan' : 'Layla Hassan',
      username: `${userType}.one`,
      loginEmail: `${userType}.one@school.test`,
      contactEmail: `${userType}.contact@example.com`,
      userType,
      roleId: `role-${userType}`,
      roleKey: userType,
      roleName: userType === 'parent' ? 'Parent' : 'Student',
      status: 'temporary_or_must_change' as const,
      hasPassword: true,
      mustChangePassword: true,
      passwordChangedAt: null,
      passwordProvisionedAt: now.toISOString(),
      credentialVersion: 1,
      lastLoginAt: null,
      createdAt: now.toISOString(),
    };
  }

  function buildCoreRecord(
    params: Parameters<
      SchoolRegistrationRepository['createRegistrationCore']
    >[0],
  ): RegistrationCoreRecord {
    const student = {
      id: 'student-1',
      schoolId: params.schoolId,
      organizationId: params.organizationId,
      applicationId: null,
      userId: null,
      firstName: String(params.student.firstName),
      fatherNameEn: params.student.fatherNameEn as string | null,
      grandfatherNameEn: params.student.grandfatherNameEn as string | null,
      lastName: String(params.student.lastName),
      firstNameAr: params.student.firstNameAr as string | null,
      fatherNameAr: params.student.fatherNameAr as string | null,
      grandfatherNameAr: params.student.grandfatherNameAr as string | null,
      familyNameAr: params.student.familyNameAr as string | null,
      birthDate: params.student.birthDate as Date | null,
      gender: params.student.gender as string | null,
      nationality: params.student.nationality as string | null,
      addressLine: params.student.addressLine as string | null,
      city: params.student.city as string | null,
      district: params.student.district as string | null,
      studentPhone: params.student.studentPhone as string | null,
      studentEmail: params.student.studentEmail as string | null,
      status:
        (params.student.status as StudentStatus | undefined) ??
        StudentStatus.ACTIVE,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    const guardianLinks = params.guardians.map((guardianCommand, index) => {
      const guardianId = `guardian-${index + 1}`;
      const guardian = {
        id: guardianId,
        schoolId: params.schoolId,
        organizationId: params.organizationId,
        userId: null,
        firstName: String(guardianCommand.data.firstName),
        lastName: String(guardianCommand.data.lastName),
        phone: String(guardianCommand.data.phone),
        phoneSecondary: guardianCommand.data.phoneSecondary as string | null,
        email: guardianCommand.data.email as string | null,
        nationalId: guardianCommand.data.nationalId as string | null,
        jobTitle: guardianCommand.data.jobTitle as string | null,
        workplace: guardianCommand.data.workplace as string | null,
        relation: String(guardianCommand.data.relation),
        isPrimary: Boolean(guardianCommand.data.isPrimary),
        canPickup: guardianCommand.data.canPickup as boolean | null,
        canReceiveNotifications: guardianCommand.data
          .canReceiveNotifications as boolean | null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };

      return {
        id: `link-${index + 1}`,
        studentId: student.id,
        guardianId,
        isPrimary: guardianCommand.isPrimary,
        guardian,
        student: {
          id: student.id,
          firstName: student.firstName,
          fatherNameEn: student.fatherNameEn,
          grandfatherNameEn: student.grandfatherNameEn,
          lastName: student.lastName,
          status: student.status,
        },
      };
    });

    return {
      student,
      guardianLinks,
      enrollment: {
        id: 'enrollment-1',
        schoolId: params.schoolId,
        studentId: student.id,
        academicYearId: params.enrollment.academicYearId,
        termId: params.enrollment.termId ?? null,
        classroomId: params.enrollment.classroomId,
        status: StudentEnrollmentStatus.ACTIVE,
        enrolledAt: params.enrollment.enrolledAt,
        endedAt: null,
        exitReason: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        academicYear: {
          id: params.enrollment.academicYearId,
          nameAr: 'Academic Year 2026/2027 AR',
          nameEn: 'Academic Year 2026/2027',
          isActive: true,
        },
        classroom: {
          id: params.enrollment.classroomId,
          nameAr: 'Classroom 1A AR',
          nameEn: 'Classroom 1A',
          section: {
            id: 'section-1',
            nameAr: 'Section A AR',
            nameEn: 'Section A',
            grade: {
              id: 'grade-1',
              nameAr: 'Grade 1 AR',
              nameEn: 'Grade 1',
            },
          },
        },
      },
    } as RegistrationCoreRecord;
  }

  function createUseCase() {
    const registrationRepository = {
      createRegistrationCore: jest.fn((params) =>
        Promise.resolve(buildCoreRecord(params)),
      ),
    } as unknown as SchoolRegistrationRepository;
    const enrollmentsRepository = {
      findAcademicYearById: jest.fn().mockResolvedValue({
        id: 'year-1',
        nameAr: 'Academic Year 2026/2027 AR',
        nameEn: 'Academic Year 2026/2027',
        isActive: true,
      }),
      findAcademicYearByName: jest.fn(),
    } as unknown as EnrollmentsRepository;
    const structureRepository = {
      findClassroomById: jest.fn().mockResolvedValue({
        id: 'classroom-1',
        schoolId: 'school-1',
        sectionId: 'section-1',
        roomId: null,
        nameAr: 'Classroom 1A AR',
        nameEn: 'Classroom 1A',
        sortOrder: 1,
        capacity: 24,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }),
      findSectionById: jest.fn().mockResolvedValue({
        id: 'section-1',
        schoolId: 'school-1',
        gradeId: 'grade-1',
        nameAr: 'Section A AR',
        nameEn: 'Section A',
        sortOrder: 1,
        capacity: 24,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }),
      findGradeById: jest.fn().mockResolvedValue({
        id: 'grade-1',
        schoolId: 'school-1',
        stageId: 'stage-1',
        nameAr: 'Grade 1 AR',
        nameEn: 'Grade 1',
        sortOrder: 1,
        capacity: 24,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }),
    } as unknown as StructureRepository;
    const termsRepository = {
      findTermById: jest.fn(),
    } as unknown as TermsRepository;
    const studentSeatLimitPolicy = {
      assertCanIncreaseActiveStudentSeats: jest.fn().mockResolvedValue({}),
    } as unknown as StudentSeatLimitPolicyService;
    const createOrLinkGuardianAccountUseCase = {
      execute: jest.fn(),
    } as unknown as CreateOrLinkGuardianAccountUseCase;
    const createOrLinkStudentAccountUseCase = {
      execute: jest.fn(),
    } as unknown as CreateOrLinkStudentAccountUseCase;
    const authRepository = {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthRepository;

    return {
      useCase: new CreateSchoolRegistrationUseCase(
        registrationRepository,
        enrollmentsRepository,
        structureRepository,
        termsRepository,
        studentSeatLimitPolicy,
        createOrLinkGuardianAccountUseCase,
        createOrLinkStudentAccountUseCase,
        authRepository,
      ),
      registrationRepository,
      enrollmentsRepository,
      structureRepository,
      termsRepository,
      studentSeatLimitPolicy,
      createOrLinkGuardianAccountUseCase,
      createOrLinkStudentAccountUseCase,
      authRepository,
    };
  }

  it('creates student, guardian link, enrollment, and returns persisted profile fields safely', async () => {
    const deps = createUseCase();

    const result = await withStudentsScope(() =>
      deps.useCase.execute(baseCommand()),
    );

    expect(
      deps.studentSeatLimitPolicy.assertCanIncreaseActiveStudentSeats,
    ).toHaveBeenCalledWith({
      schoolId: 'school-1',
      reason: 'registration_wizard',
    });
    expect(
      (deps.registrationRepository.createRegistrationCore as jest.Mock).mock
        .calls[0][0],
    ).toMatchObject({
      schoolId: 'school-1',
      organizationId: 'org-1',
      student: {
        firstName: 'Layla',
        fatherNameEn: 'Ali',
        grandfatherNameEn: 'Mahmoud',
        lastName: 'Hassan',
        firstNameAr: 'LailaAr',
        fatherNameAr: 'AliAr',
        grandfatherNameAr: 'MahmoudAr',
        familyNameAr: 'HassanAr',
        gender: 'Female',
        nationality: 'Egyptian',
        addressLine: '12 Nile Street',
        city: 'Cairo',
        district: 'Nasr City',
        studentPhone: '+201001112233',
        studentEmail: 'layla@example.com',
      },
      guardians: [
        {
          isPrimary: true,
          data: {
            firstName: 'Mona',
            lastName: 'Hassan',
            relation: 'mother',
            phone: '+201009998877',
            phoneSecondary: '+201008887766',
            email: 'mona@example.com',
            nationalId: '29901011234567',
            jobTitle: 'Engineer',
            workplace: 'Cairo Office',
            canPickup: true,
            canReceiveNotifications: true,
          },
        },
      ],
      enrollment: {
        academicYearId: 'year-1',
        termId: null,
        classroomId: 'classroom-1',
        enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
      },
    });

    expect(result.student).toEqual(
      expect.objectContaining({
        id: 'student-1',
        student_id: null,
        full_name_en: 'Layla Ali Mahmoud Hassan',
        full_name_ar: 'LailaAr AliAr MahmoudAr HassanAr',
        gender: 'Female',
        nationality: 'Egyptian',
        contact: {
          address_line: '12 Nile Street',
          city: 'Cairo',
          district: 'Nasr City',
          student_phone: '+201001112233',
          student_email: 'layla@example.com',
        },
      }),
    );
    expect(result.guardians[0]).toEqual(
      expect.objectContaining({
        guardianId: 'guardian-1',
        full_name: 'Mona Hassan',
        is_primary: true,
        phone_secondary: '+201008887766',
        national_id: '29901011234567',
        job_title: 'Engineer',
        workplace: 'Cairo Office',
        can_pickup: true,
        can_receive_notifications: true,
      }),
    );
    expect(result.enrollment).toEqual(
      expect.objectContaining({
        enrollmentId: 'enrollment-1',
        studentId: 'student-1',
        classroomId: 'classroom-1',
        status: 'active',
      }),
    );
    expect(JSON.stringify(result)).not.toContain('schoolId');
    expect(JSON.stringify(result)).not.toContain('organizationId');
    expect(JSON.stringify(result)).not.toContain('userId');
    expect(JSON.stringify(result)).not.toContain('roleId');
    expect(JSON.stringify(result)).not.toContain('membershipId');
    expect(JSON.stringify(result)).not.toContain('deletedAt');
    expect(JSON.stringify(result)).not.toContain('applicationId');
    expect(JSON.stringify(result)).not.toContain('applicant');
  });

  it('respects an explicitly primary guardian and leaves the others non-primary', async () => {
    const deps = createUseCase();
    const command = baseCommand({
      guardians: [
        {
          profile: {
            full_name: 'Mona Hassan',
            relation: 'Mother',
            phone_primary: '+201009998877',
          },
          relationship: { is_primary: false },
        },
        {
          profile: {
            full_name: 'Omar Hassan',
            relation: 'Father',
            phone_primary: '+201007776655',
          },
          relationship: { is_primary: true },
        },
      ],
    });

    const result = await withStudentsScope(() => deps.useCase.execute(command));
    const coreCommand = (
      deps.registrationRepository.createRegistrationCore as jest.Mock
    ).mock.calls[0][0];

    expect(coreCommand.guardians.map((guardian) => guardian.isPrimary)).toEqual(
      [false, true],
    );
    expect(result.guardians.map((guardian) => guardian.is_primary)).toEqual([
      false,
      true,
    ]);
  });

  it('creates and links optional parent and student accounts with sanitized summaries', async () => {
    const deps = createUseCase();
    (
      deps.createOrLinkGuardianAccountUseCase.execute as jest.Mock
    ).mockImplementation((guardianId: string, command) =>
      Promise.resolve({
        guardianId,
        user: credentialUser(command.mode === 'create' ? 'parent' : 'parent'),
        linked: true,
        ...(command.mode === 'create'
          ? { temporaryPassword: 'MZ-PARENT-1234' }
          : {}),
      }),
    );
    (
      deps.createOrLinkStudentAccountUseCase.execute as jest.Mock
    ).mockResolvedValue({
      studentId: 'student-1',
      user: credentialUser('student'),
      linked: true,
      temporaryPassword: 'MZ-STUDENT-1234',
    });

    const result = await withStudentsScope(() =>
      deps.useCase.execute(
        baseCommand({
          guardians: [
            {
              profile: {
                full_name: 'Mona Hassan',
                relation: 'Mother',
                phone_primary: '+201009998877',
              },
              account: {
                mode: 'create',
                username: 'parent.one',
                temporaryPasswordMode: 'generate',
              },
            },
            {
              profile: {
                full_name: 'Omar Hassan',
                relation: 'Father',
                phone_primary: '+201007776655',
              },
              relationship: { is_primary: true },
              account: {
                mode: 'link',
                userId: 'existing-parent-user',
              },
            },
          ],
          studentAccount: {
            mode: 'create',
            username: 'student.one',
            generatePassword: true,
          },
        }),
      ),
    );

    expect(
      deps.createOrLinkGuardianAccountUseCase.execute,
    ).toHaveBeenCalledWith(
      'guardian-1',
      expect.objectContaining({
        mode: 'create',
        username: 'parent.one',
      }),
    );
    expect(
      deps.createOrLinkGuardianAccountUseCase.execute,
    ).toHaveBeenCalledWith(
      'guardian-2',
      expect.objectContaining({
        mode: 'link',
        userId: 'existing-parent-user',
      }),
    );
    expect(deps.createOrLinkStudentAccountUseCase.execute).toHaveBeenCalledWith(
      'student-1',
      expect.objectContaining({
        mode: 'create',
        username: 'student.one',
      }),
    );
    expect(result.parentAccounts).toEqual([
      expect.objectContaining({
        target: 'parent',
        guardianId: 'guardian-1',
        mode: 'create',
        status: 'created',
        temporaryPassword: 'MZ-PARENT-1234',
        user: expect.not.objectContaining({
          userId: expect.anything(),
          roleId: expect.anything(),
        }),
      }),
      expect.objectContaining({
        target: 'parent',
        guardianId: 'guardian-2',
        mode: 'link',
        status: 'linked',
        user: expect.not.objectContaining({
          userId: expect.anything(),
          roleId: expect.anything(),
        }),
      }),
    ]);
    expect(result.studentAccount).toEqual(
      expect.objectContaining({
        target: 'student',
        mode: 'create',
        status: 'created',
        temporaryPassword: 'MZ-STUDENT-1234',
        user: expect.not.objectContaining({
          userId: expect.anything(),
          roleId: expect.anything(),
        }),
      }),
    );
    expect(result.warnings).toEqual([]);
    expect(deps.authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'students.registration.create',
        module: 'students',
        resourceType: 'registration',
        resourceId: 'student-1',
        outcome: AuditOutcome.SUCCESS,
        after: expect.objectContaining({
          studentId: 'student-1',
          guardianCount: 2,
          primaryGuardianCount: 1,
          enrollmentId: 'enrollment-1',
          parentAccountsCreatedCount: 1,
          parentAccountsLinkedCount: 1,
          studentAccountCreated: true,
          studentAccountLinked: false,
        }),
      }),
    );
    expect(
      JSON.stringify(
        (deps.authRepository.createAuditLog as jest.Mock).mock.calls,
      ),
    ).not.toContain('MZ-');
    expect(
      JSON.stringify(
        (deps.authRepository.createAuditLog as jest.Mock).mock.calls,
      ),
    ).not.toContain('29901011234567');
  });

  it('turns optional account failures into warnings after the core registration is durable', async () => {
    const deps = createUseCase();
    (
      deps.createOrLinkGuardianAccountUseCase.execute as jest.Mock
    ).mockRejectedValue(new Error('account failed'));
    (
      deps.createOrLinkStudentAccountUseCase.execute as jest.Mock
    ).mockRejectedValue(new Error('account failed'));

    const result = await withStudentsScope(() =>
      deps.useCase.execute(
        baseCommand({
          guardians: [
            {
              profile: {
                full_name: 'Mona Hassan',
                relation: 'Mother',
                phone_primary: '+201009998877',
              },
              account: {
                mode: 'create',
                username: 'parent.one',
              },
            },
          ],
          studentAccount: {
            mode: 'create',
            username: 'student.one',
          },
        }),
      ),
    );

    expect(
      deps.registrationRepository.createRegistrationCore,
    ).toHaveBeenCalled();
    expect(result.parentAccounts[0]).toEqual(
      expect.objectContaining({
        target: 'parent',
        guardianId: 'guardian-1',
        mode: 'create',
        status: 'failed',
      }),
    );
    expect(result.studentAccount).toEqual(
      expect.objectContaining({
        target: 'student',
        mode: 'create',
        status: 'failed',
      }),
    );
    expect(result.warnings).toEqual([
      'parent_account_failed:guardian-1',
      'student_account_failed',
    ]);
  });

  it('rejects empty guardian arrays before creating records', async () => {
    const deps = createUseCase();

    await expect(
      withStudentsScope(() =>
        deps.useCase.execute(baseCommand({ guardians: [] })),
      ),
    ).rejects.toBeInstanceOf(ValidationDomainException);
    expect(
      deps.registrationRepository.createRegistrationCore,
    ).not.toHaveBeenCalled();
  });

  it('rejects invalid account mode requirements before creating records', async () => {
    const deps = createUseCase();

    await expect(
      withStudentsScope(() =>
        deps.useCase.execute(
          baseCommand({
            guardians: [
              {
                profile: {
                  full_name: 'Mona Hassan',
                  relation: 'Mother',
                  phone_primary: '+201009998877',
                },
                account: { mode: 'create' },
              },
            ],
          }),
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationDomainException);
    expect(
      deps.registrationRepository.createRegistrationCore,
    ).not.toHaveBeenCalled();

    await expect(
      withStudentsScope(() =>
        deps.useCase.execute(
          baseCommand({
            studentAccount: { mode: 'link' },
          }),
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationDomainException);
    expect(
      deps.registrationRepository.createRegistrationCore,
    ).not.toHaveBeenCalled();
  });

  it('validates term, section, and grade placement before creating records', async () => {
    const deps = createUseCase();
    (deps.termsRepository.findTermById as jest.Mock).mockResolvedValue({
      id: 'term-1',
      schoolId: 'school-1',
      academicYearId: 'other-year',
      nameAr: 'Term AR',
      nameEn: 'Term',
      startDate: now,
      endDate: now,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    await expect(
      withStudentsScope(() =>
        deps.useCase.execute(
          baseCommand({
            enrollment: {
              academicYearId: 'year-1',
              termId: 'term-1',
              gradeId: 'grade-1',
              sectionId: 'section-1',
              classroomId: 'classroom-1',
              enrollmentDate: '2026-09-01',
            },
          }),
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationDomainException);
    expect(
      deps.registrationRepository.createRegistrationCore,
    ).not.toHaveBeenCalled();
  });
});
