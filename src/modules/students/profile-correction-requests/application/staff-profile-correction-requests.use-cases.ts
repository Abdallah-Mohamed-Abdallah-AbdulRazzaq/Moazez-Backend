import { Injectable } from '@nestjs/common';
import { AuditOutcome, StudentProfileCorrectionRequestStatus } from '@prisma/client';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireStudentsScope } from '../../students/domain/students-scope';
import {
  ListProfileCorrectionRequestsQueryDto,
  ReviewProfileCorrectionRequestDto,
  StaffProfileCorrectionRequestResponseDto,
} from '../dto/profile-correction-request.dto';
import {
  changedFieldNamesFromChanges,
  normalizeCorrectionReason,
} from '../domain/profile-correction-request.fields';
import { ProfileCorrectionRequestsRepository } from '../infrastructure/profile-correction-requests.repository';
import {
  presentStaffProfileCorrectionRequest,
  presentStaffProfileCorrectionRequests,
} from '../presenters/profile-correction-request.presenter';
import {
  ProfileCorrectionRequestNotPendingException,
  ProfileCorrectionRequestTargetUnavailableException,
} from './student-profile-correction-errors';

@Injectable()
export class ListStaffProfileCorrectionRequestsUseCase {
  constructor(
    private readonly repository: ProfileCorrectionRequestsRepository,
  ) {}

  async execute(
    query: ListProfileCorrectionRequestsQueryDto,
  ): Promise<StaffProfileCorrectionRequestResponseDto[]> {
    const scope = requireStudentsScope();
    const requests = await this.repository.listStaffRequests({
      schoolId: scope.schoolId,
      status: mapStatus(query.status),
      studentId: query.studentId,
    });

    return presentStaffProfileCorrectionRequests(requests);
  }
}

@Injectable()
export class GetStaffProfileCorrectionRequestUseCase {
  constructor(
    private readonly repository: ProfileCorrectionRequestsRepository,
  ) {}

  async execute(
    requestId: string,
  ): Promise<StaffProfileCorrectionRequestResponseDto> {
    const scope = requireStudentsScope();
    const request = await this.repository.findStaffRequest({
      schoolId: scope.schoolId,
      requestId,
    });

    if (!request) {
      throw new NotFoundDomainException('Profile correction request not found', {
        requestId,
      });
    }

    return presentStaffProfileCorrectionRequest(request);
  }
}

@Injectable()
export class ApproveProfileCorrectionRequestUseCase {
  constructor(
    private readonly repository: ProfileCorrectionRequestsRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    requestId: string,
    command: ReviewProfileCorrectionRequestDto,
  ): Promise<StaffProfileCorrectionRequestResponseDto> {
    const scope = requireStudentsScope();
    const result = await this.repository.approveStaffRequest({
      schoolId: scope.schoolId,
      actorId: scope.actorId,
      requestId,
      reviewerNote: normalizeCorrectionReason(command.reviewerNote),
    });

    switch (result.status) {
      case 'not_found':
        throw new NotFoundDomainException(
          'Profile correction request not found',
          { requestId },
        );
      case 'student_not_found':
        throw new ProfileCorrectionRequestTargetUnavailableException({
          requestId,
        });
      case 'not_pending':
        throw new ProfileCorrectionRequestNotPendingException({
          requestId,
          status: result.currentStatus,
        });
      case 'approved':
        await this.authRepository.createAuditLog({
          actorId: scope.actorId,
          userType: scope.userType,
          organizationId: scope.organizationId,
          schoolId: scope.schoolId,
          module: 'students',
          action: 'students.profile.correction.approved',
          resourceType: 'student_profile_correction_request',
          resourceId: result.request.id,
          outcome: AuditOutcome.SUCCESS,
          after: {
            requestId: result.request.id,
            studentId: result.request.studentId,
            status: result.request.status,
            changedFieldNames: changedFieldNamesFromChanges(
              result.request.requestedChanges,
            ),
            source: 'school_staff',
          },
        });

        return presentStaffProfileCorrectionRequest(result.request);
    }
  }
}

@Injectable()
export class RejectProfileCorrectionRequestUseCase {
  constructor(
    private readonly repository: ProfileCorrectionRequestsRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    requestId: string,
    command: ReviewProfileCorrectionRequestDto,
  ): Promise<StaffProfileCorrectionRequestResponseDto> {
    const scope = requireStudentsScope();
    const result = await this.repository.rejectStaffRequest({
      schoolId: scope.schoolId,
      actorId: scope.actorId,
      requestId,
      reviewerNote: normalizeCorrectionReason(command.reviewerNote),
    });

    switch (result.status) {
      case 'not_found':
        throw new NotFoundDomainException(
          'Profile correction request not found',
          { requestId },
        );
      case 'not_pending':
        throw new ProfileCorrectionRequestNotPendingException({
          requestId,
          status: result.currentStatus,
        });
      case 'updated':
        await this.authRepository.createAuditLog({
          actorId: scope.actorId,
          userType: scope.userType,
          organizationId: scope.organizationId,
          schoolId: scope.schoolId,
          module: 'students',
          action: 'students.profile.correction.rejected',
          resourceType: 'student_profile_correction_request',
          resourceId: result.request.id,
          outcome: AuditOutcome.SUCCESS,
          after: {
            requestId: result.request.id,
            studentId: result.request.studentId,
            status: result.request.status,
            changedFieldNames: changedFieldNamesFromChanges(
              result.request.requestedChanges,
            ),
            source: 'school_staff',
          },
        });

        return presentStaffProfileCorrectionRequest(result.request);
    }
  }
}

function mapStatus(
  status: ListProfileCorrectionRequestsQueryDto['status'],
): StudentProfileCorrectionRequestStatus | undefined {
  if (!status) {
    return undefined;
  }

  if (!(status in StudentProfileCorrectionRequestStatus)) {
    throw new ValidationDomainException('Profile correction status is invalid', {
      field: 'status',
    });
  }

  return StudentProfileCorrectionRequestStatus[status];
}
