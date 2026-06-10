import { Injectable } from '@nestjs/common';
import { AuditOutcome, UserType } from '@prisma/client';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../iam/auth/infrastructure/auth.repository';
import {
  ApplicantRequestDetailResponseDto,
  CreateApplicantRequestDto,
} from '../dto/applicant-request.dto';
import { normalizeCreateApplicantRequestInput } from '../domain/applicant-request.inputs';
import { ApplicantPortalRepository } from '../infrastructure/applicant-portal.repository';
import { presentApplicantRequestDetail } from '../presenters/applicant-request.presenter';
import { ApplicantPortalAccessService } from './applicant-portal-access.service';

export interface CreateApplicantRequestCommand extends CreateApplicantRequestDto {
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class CreateApplicantRequestUseCase {
  constructor(
    private readonly applicantPortalAccessService: ApplicantPortalAccessService,
    private readonly applicantPortalRepository: ApplicantPortalRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    command: CreateApplicantRequestCommand,
  ): Promise<ApplicantRequestDetailResponseDto> {
    const applicantContext =
      await this.applicantPortalAccessService.getApplicantContext();
    const input = normalizeCreateApplicantRequestInput(command);

    const school =
      await this.applicantPortalRepository.findDiscoverableSchoolForRequest(
        input.schoolId,
      );
    if (!school) {
      throw new NotFoundDomainException('School not found', {
        schoolId: input.schoolId,
      });
    }

    await this.validateRequestedAcademicContext({
      schoolId: school.id,
      requestedAcademicYearId: input.requestedAcademicYearId,
      requestedGradeId: input.requestedGradeId,
    });

    const request =
      await this.applicantPortalRepository.createApplicantAdmissionRequest({
        applicantUserId: applicantContext.applicantUserId,
        applicantProfileId: applicantContext.applicantProfileId,
        schoolId: school.id,
        organizationId: school.organizationId,
        requestedAcademicYearId: input.requestedAcademicYearId,
        requestedGradeId: input.requestedGradeId,
        childFirstName: input.childFirstName,
        childLastName: input.childLastName,
        childFullName: input.childFullName,
        childDateOfBirth: input.childDateOfBirth,
        childGender: input.childGender,
        childNationality: input.childNationality,
        previousSchool: input.previousSchool,
        notes: input.notes,
      });

    await this.authRepository.createAuditLog({
      actorId: applicantContext.applicantUserId,
      userType: UserType.APPLICANT,
      organizationId: school.organizationId,
      schoolId: school.id,
      module: 'applicant_portal',
      action: 'applicant.request.create',
      resourceType: 'applicant_admission_request',
      resourceId: request.id,
      outcome: AuditOutcome.SUCCESS,
      ipAddress: command.ipAddress,
      userAgent: command.userAgent,
      after: {
        status: 'draft',
        requestedAcademicYearProvided: Boolean(input.requestedAcademicYearId),
        requestedGradeProvided: Boolean(input.requestedGradeId),
        childDateOfBirthProvided: Boolean(input.childDateOfBirth),
        previousSchoolProvided: Boolean(input.previousSchool),
        notesProvided: Boolean(input.notes),
      },
    });

    const missingItemsCount =
      await this.applicantPortalRepository.countMandatoryRequiredDocumentsForSchool(
        school.id,
      );

    return presentApplicantRequestDetail(request, missingItemsCount);
  }

  private async validateRequestedAcademicContext(params: {
    schoolId: string;
    requestedAcademicYearId: string | null;
    requestedGradeId: string | null;
  }): Promise<void> {
    if (params.requestedAcademicYearId) {
      const academicYear =
        await this.applicantPortalRepository.findAcademicYearForSchool(
          params.schoolId,
          params.requestedAcademicYearId,
        );
      if (!academicYear) {
        throw new NotFoundDomainException('Requested academic year not found', {
          requestedAcademicYearId: params.requestedAcademicYearId,
        });
      }
    }

    if (params.requestedGradeId) {
      const grade = await this.applicantPortalRepository.findGradeForSchool(
        params.schoolId,
        params.requestedGradeId,
      );
      if (!grade) {
        throw new NotFoundDomainException('Requested grade not found', {
          requestedGradeId: params.requestedGradeId,
        });
      }
    }
  }
}
