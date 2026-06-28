import { Injectable } from '@nestjs/common';
import { AuditOutcome } from '@prisma/client';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import {
  TermsRepository,
  type TermRecord,
} from '../../../academics/structure/infrastructure/terms.repository';
import {
  ClassroomRecord,
  GradeRecord,
  SectionRecord,
  StructureRepository,
} from '../../../academics/structure/infrastructure/structure.repository';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { StudentSeatLimitPolicyService } from '../../../platform-admin/application/student-seat-limit-policy.service';
import { AccountLinkingDto } from '../../account/dto/account-linking.dto';
import { CreateOrLinkGuardianAccountUseCase } from '../../guardians/application/create-or-link-guardian-account.use-case';
import {
  resolveGuardianEmail,
  resolveGuardianName,
  resolveGuardianPhone,
  resolveGuardianProfileFields,
  resolveGuardianRelation,
} from '../../guardians/domain/guardian.inputs';
import { StudentEnrollmentInactiveYearException } from '../../enrollments/domain/enrollment.exceptions';
import {
  AcademicYearRecord,
  EnrollmentsRepository,
} from '../../enrollments/infrastructure/enrollments.repository';
import { toEnrollmentDate } from '../../enrollments/application/shared';
import { CreateOrLinkStudentAccountUseCase } from '../../students/application/create-or-link-student-account.use-case';
import {
  resolveStudentBirthDate,
  resolveStudentName,
  resolveStudentProfileFields,
} from '../../students/domain/student-record.inputs';
import { mapStudentStatusFromApi } from '../../students/domain/student-status.enums';
import { requireStudentsScope } from '../../students/domain/students-scope';
import {
  CreateSchoolRegistrationDto,
  SchoolRegistrationAccountDto,
  SchoolRegistrationResponseDto,
} from '../dto/school-registration.dto';
import { SchoolRegistrationRepository } from '../infrastructure/school-registration.repository';
import {
  ParentAccountPresentation,
  presentSchoolRegistration,
  StudentAccountPresentation,
} from '../presenters/school-registration.presenter';

interface ResolvedRegistrationPlacement {
  academicYear: AcademicYearRecord;
  term: TermRecord | null;
  grade: GradeRecord;
  section: SectionRecord;
  classroom: ClassroomRecord;
}

function normalizeOptionalText(value?: string | null): string | null {
  const normalized = value?.trim().replace(/\s+/g, ' ');
  return normalized && normalized.length > 0 ? normalized : null;
}

@Injectable()
export class CreateSchoolRegistrationUseCase {
  constructor(
    private readonly registrationRepository: SchoolRegistrationRepository,
    private readonly enrollmentsRepository: EnrollmentsRepository,
    private readonly structureRepository: StructureRepository,
    private readonly termsRepository: TermsRepository,
    private readonly studentSeatLimitPolicy: StudentSeatLimitPolicyService,
    private readonly createOrLinkGuardianAccountUseCase: CreateOrLinkGuardianAccountUseCase,
    private readonly createOrLinkStudentAccountUseCase: CreateOrLinkStudentAccountUseCase,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    command: CreateSchoolRegistrationDto,
  ): Promise<SchoolRegistrationResponseDto> {
    const scope = requireStudentsScope();
    this.validateCommand(command);

    const placement = await this.resolvePlacement(command);
    await this.studentSeatLimitPolicy.assertCanIncreaseActiveStudentSeats({
      schoolId: scope.schoolId,
      reason: 'registration_wizard',
    });

    const studentName = resolveStudentName(command.student);
    const studentProfile = resolveStudentProfileFields(command.student);
    const studentBirthDate = resolveStudentBirthDate(
      command.student.dateOfBirth,
      command.student.date_of_birth,
    );
    const primaryGuardianIndex = this.resolvePrimaryGuardianIndex(command);

    const core = await this.registrationRepository.createRegistrationCore({
      schoolId: scope.schoolId,
      organizationId: scope.organizationId,
      student: {
        schoolId: scope.schoolId,
        organizationId: scope.organizationId,
        applicationId: null,
        firstName: studentName.firstName,
        fatherNameEn: studentProfile.fatherNameEn,
        grandfatherNameEn: studentProfile.grandfatherNameEn,
        lastName: studentName.lastName,
        firstNameAr: studentProfile.firstNameAr,
        fatherNameAr: studentProfile.fatherNameAr,
        grandfatherNameAr: studentProfile.grandfatherNameAr,
        familyNameAr: studentProfile.familyNameAr,
        birthDate: studentBirthDate,
        gender: studentProfile.gender,
        nationality: studentProfile.nationality,
        addressLine: studentProfile.addressLine,
        city: studentProfile.city,
        district: studentProfile.district,
        studentPhone: studentProfile.studentPhone,
        studentEmail: studentProfile.studentEmail,
        ...(command.student.status
          ? { status: mapStudentStatusFromApi(command.student.status) }
          : {}),
      },
      guardians: command.guardians.map((guardianCommand, index) => {
        const name = resolveGuardianName(guardianCommand.profile);
        const profile = resolveGuardianProfileFields(guardianCommand.profile);
        const isPrimary = index === primaryGuardianIndex;

        return {
          data: {
            schoolId: scope.schoolId,
            organizationId: scope.organizationId,
            userId: null,
            firstName: name.firstName,
            lastName: name.lastName,
            phone: resolveGuardianPhone(guardianCommand.profile.phone_primary),
            phoneSecondary: profile.phoneSecondary,
            email: resolveGuardianEmail(guardianCommand.profile.email),
            nationalId: profile.nationalId,
            jobTitle: profile.jobTitle,
            workplace: profile.workplace,
            relation: resolveGuardianRelation(guardianCommand.profile.relation),
            isPrimary,
            canPickup: profile.canPickup,
            canReceiveNotifications: profile.canReceiveNotifications,
          },
          isPrimary,
        };
      }),
      enrollment: {
        academicYearId: placement.academicYear.id,
        termId: placement.term?.id ?? null,
        classroomId: placement.classroom.id,
        enrolledAt: toEnrollmentDate(command.enrollment.enrollmentDate),
      },
    });

    const warnings: string[] = [];
    const parentAccounts = await this.applyParentAccountSteps(
      command,
      core,
      warnings,
    );
    const studentAccount = await this.applyStudentAccountStep(
      command,
      core,
      warnings,
    );

    await this.recordAudit({
      studentId: core.student.id,
      guardianCount: core.guardianLinks.length,
      primaryGuardianCount: core.guardianLinks.filter((link) => link.isPrimary)
        .length,
      enrollmentId: core.enrollment.id,
      parentAccountsCreatedCount: parentAccounts.filter(
        (account) => account.mode === 'create' && account.result,
      ).length,
      parentAccountsLinkedCount: parentAccounts.filter(
        (account) => account.mode === 'link' && account.result,
      ).length,
      studentAccountCreated:
        studentAccount.mode === 'create' && Boolean(studentAccount.result),
      studentAccountLinked:
        studentAccount.mode === 'link' && Boolean(studentAccount.result),
    });

    return presentSchoolRegistration({
      core,
      parentAccounts,
      studentAccount,
      warnings,
      completedAt: new Date(),
    });
  }

  private validateCommand(command: CreateSchoolRegistrationDto): void {
    if (!command.student) {
      throw new ValidationDomainException('Student payload is required', {
        field: 'student',
      });
    }

    if (!command.guardians?.length) {
      throw new ValidationDomainException(
        'At least one guardian is required for registration',
        { field: 'guardians' },
      );
    }

    if (!command.enrollment) {
      throw new ValidationDomainException('Enrollment payload is required', {
        field: 'enrollment',
      });
    }

    for (const [index, guardian] of command.guardians.entries()) {
      this.validateAccountRequirements(
        `guardians.${index}.account`,
        guardian.account,
      );
    }

    this.validateAccountRequirements('studentAccount', command.studentAccount);
  }

  private validateAccountRequirements(
    field: string,
    account?: SchoolRegistrationAccountDto,
  ): void {
    if (!account) {
      return;
    }

    if (!['none', 'create', 'link'].includes(account.mode)) {
      throw new ValidationDomainException('Account mode is invalid', {
        field: `${field}.mode`,
      });
    }

    if (account.mode === 'none') {
      return;
    }

    if (account.mode === 'create' && !normalizeOptionalText(account.username)) {
      throw new ValidationDomainException(
        'Username is required when creating an account',
        { field: `${field}.username` },
      );
    }

    if (account.mode === 'link' && !account.userId) {
      throw new ValidationDomainException(
        'User id is required when linking an account',
        { field: `${field}.userId` },
      );
    }
  }

  private resolvePrimaryGuardianIndex(
    command: CreateSchoolRegistrationDto,
  ): number {
    const explicitPrimaryIndex = command.guardians.findIndex(
      (guardian) => guardian.relationship?.is_primary === true,
    );

    return explicitPrimaryIndex >= 0 ? explicitPrimaryIndex : 0;
  }

  private async resolvePlacement(
    command: CreateSchoolRegistrationDto,
  ): Promise<ResolvedRegistrationPlacement> {
    if (command.enrollment.status && command.enrollment.status !== 'active') {
      throw new ValidationDomainException(
        'Only active enrollments can be created in this phase',
        { field: 'status' },
      );
    }

    const academicYear = await this.resolveAcademicYear(command);
    if (!academicYear.isActive) {
      throw new StudentEnrollmentInactiveYearException({
        academicYearId: academicYear.id,
      });
    }

    const term = await this.resolveTerm(
      command.enrollment.termId ?? null,
      academicYear.id,
    );
    const classroom = await this.structureRepository.findClassroomById(
      command.enrollment.classroomId,
    );
    if (!classroom) {
      throw new NotFoundDomainException('Classroom not found', {
        classroomId: command.enrollment.classroomId,
      });
    }

    if (
      command.enrollment.sectionId &&
      classroom.sectionId !== command.enrollment.sectionId
    ) {
      throw new ValidationDomainException(
        'Classroom does not belong to the provided section',
        {
          field: 'classroomId',
          sectionId: command.enrollment.sectionId,
          classroomId: command.enrollment.classroomId,
        },
      );
    }

    const section = await this.structureRepository.findSectionById(
      classroom.sectionId,
    );
    if (!section) {
      throw new NotFoundDomainException('Section not found', {
        sectionId: classroom.sectionId,
      });
    }

    if (
      command.enrollment.gradeId &&
      section.gradeId !== command.enrollment.gradeId
    ) {
      throw new ValidationDomainException(
        'Section does not belong to the provided grade',
        {
          field: 'sectionId',
          gradeId: command.enrollment.gradeId,
          sectionId: section.id,
        },
      );
    }

    const grade = await this.structureRepository.findGradeById(section.gradeId);
    if (!grade) {
      throw new NotFoundDomainException('Grade not found', {
        gradeId: section.gradeId,
      });
    }

    return {
      academicYear,
      term,
      grade,
      section,
      classroom,
    };
  }

  private async resolveAcademicYear(
    command: CreateSchoolRegistrationDto,
  ): Promise<AcademicYearRecord> {
    const academicYearId = command.enrollment.academicYearId ?? null;
    const academicYearName = normalizeOptionalText(
      command.enrollment.academicYear,
    );

    if (academicYearId) {
      const academicYear =
        await this.enrollmentsRepository.findAcademicYearById(academicYearId);
      if (!academicYear) {
        throw new NotFoundDomainException('Academic year not found', {
          academicYearId,
        });
      }

      return academicYear;
    }

    if (academicYearName) {
      const academicYear =
        await this.enrollmentsRepository.findAcademicYearByName(
          academicYearName,
        );
      if (!academicYear) {
        throw new NotFoundDomainException('Academic year not found', {
          academicYear: academicYearName,
        });
      }

      return academicYear;
    }

    throw new ValidationDomainException('Academic year is required', {
      field: 'academicYearId',
    });
  }

  private async resolveTerm(
    termId: string | null,
    academicYearId: string,
  ): Promise<TermRecord | null> {
    if (!termId) {
      return null;
    }

    const term = await this.termsRepository.findTermById(termId);
    if (!term) {
      throw new NotFoundDomainException('Term not found', { termId });
    }

    if (term.academicYearId !== academicYearId) {
      throw new ValidationDomainException(
        'Term does not belong to the provided academic year',
        {
          field: 'termId',
          termId,
          academicYearId,
        },
      );
    }

    return term;
  }

  private async applyParentAccountSteps(
    command: CreateSchoolRegistrationDto,
    core: Awaited<
      ReturnType<SchoolRegistrationRepository['createRegistrationCore']>
    >,
    warnings: string[],
  ): Promise<ParentAccountPresentation[]> {
    const results: ParentAccountPresentation[] = [];

    for (const [index, guardianCommand] of command.guardians.entries()) {
      const account = guardianCommand.account ?? { mode: 'none' as const };
      const guardianId = core.guardianLinks[index].guardianId;

      if (account.mode === 'none') {
        warnings.push(`parent_account_skipped:${guardianId}`);
        results.push({ guardianId, mode: 'none' });
        continue;
      }

      try {
        const result = await this.createOrLinkGuardianAccountUseCase.execute(
          guardianId,
          this.toAccountLinkingDto(account),
        );
        results.push({ guardianId, mode: account.mode, result });
      } catch {
        warnings.push(`parent_account_failed:${guardianId}`);
        results.push({ guardianId, mode: account.mode, failed: true });
      }
    }

    return results;
  }

  private async applyStudentAccountStep(
    command: CreateSchoolRegistrationDto,
    core: Awaited<
      ReturnType<SchoolRegistrationRepository['createRegistrationCore']>
    >,
    warnings: string[],
  ): Promise<StudentAccountPresentation> {
    const account = command.studentAccount ?? { mode: 'none' as const };

    if (account.mode === 'none') {
      warnings.push('student_account_skipped');
      return { mode: 'none' };
    }

    try {
      const result = await this.createOrLinkStudentAccountUseCase.execute(
        core.student.id,
        this.toAccountLinkingDto(account),
      );
      return { mode: account.mode, result };
    } catch {
      warnings.push('student_account_failed');
      return { mode: account.mode, failed: true };
    }
  }

  private toAccountLinkingDto(
    account: SchoolRegistrationAccountDto,
  ): AccountLinkingDto {
    if (account.mode === 'none') {
      throw new ValidationDomainException(
        'Account mode none cannot be linked through account use cases',
        { field: 'mode' },
      );
    }

    return {
      mode: account.mode,
      userId: account.userId,
      fullName: account.fullName,
      username: account.username,
      contactEmail: account.contactEmail,
      generatePassword: account.generatePassword,
      temporaryPasswordMode: account.temporaryPasswordMode,
      roleId: account.roleId,
    };
  }

  private async recordAudit(params: {
    studentId: string;
    guardianCount: number;
    primaryGuardianCount: number;
    enrollmentId: string;
    parentAccountsCreatedCount: number;
    parentAccountsLinkedCount: number;
    studentAccountCreated: boolean;
    studentAccountLinked: boolean;
  }): Promise<void> {
    const scope = requireStudentsScope();

    await this.authRepository.createAuditLog({
      actorId: scope.actorId,
      userType: scope.userType,
      organizationId: scope.organizationId,
      schoolId: scope.schoolId,
      module: 'students',
      action: 'students.registration.create',
      resourceType: 'registration',
      resourceId: params.studentId,
      outcome: AuditOutcome.SUCCESS,
      after: {
        studentId: params.studentId,
        guardianCount: params.guardianCount,
        primaryGuardianCount: params.primaryGuardianCount,
        enrollmentId: params.enrollmentId,
        parentAccountsCreatedCount: params.parentAccountsCreatedCount,
        parentAccountsLinkedCount: params.parentAccountsLinkedCount,
        studentAccountCreated: params.studentAccountCreated,
        studentAccountLinked: params.studentAccountLinked,
      },
    });
  }
}
