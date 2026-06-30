import { Injectable } from '@nestjs/common';
import { AuditOutcome, UserType } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import {
  StudentProfileCorrectionRequestResponseDto,
  SubmitStudentProfileCorrectionRequestDto,
} from '../../../students/profile-correction-requests/dto/profile-correction-request.dto';
import {
  buildCurrentProfileSnapshot,
  changedFieldNamesFromChanges,
  normalizeCorrectionReason,
  normalizeProfileCorrectionChanges,
} from '../../../students/profile-correction-requests/domain/profile-correction-request.fields';
import { ProfileCorrectionRequestsRepository } from '../../../students/profile-correction-requests/infrastructure/profile-correction-requests.repository';
import { presentStudentProfileCorrectionRequest } from '../../../students/profile-correction-requests/presenters/profile-correction-request.presenter';
import { ProfileCorrectionRequestNotPendingException } from '../../../students/profile-correction-requests/application/student-profile-correction-errors';

@Injectable()
export class SubmitStudentProfileCorrectionRequestUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly repository: ProfileCorrectionRequestsRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    command: SubmitStudentProfileCorrectionRequestDto,
  ): Promise<StudentProfileCorrectionRequestResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const student = await this.repository.findCurrentStudentForCorrection(
      context,
    );

    if (!student) {
      throw new NotFoundDomainException('Student profile not found', {
        studentId: context.studentId,
      });
    }

    const changes = normalizeProfileCorrectionChanges(command.changes);
    const request = await this.repository.createStudentRequest({
      context,
      changes,
      currentSnapshot: buildCurrentProfileSnapshot(student, changes),
      reason: normalizeCorrectionReason(command.reason),
    });

    await this.authRepository.createAuditLog({
      actorId: context.studentUserId,
      userType: UserType.STUDENT,
      organizationId: context.organizationId,
      schoolId: context.schoolId,
      module: 'student_app',
      action: 'student.profile.correction.requested',
      resourceType: 'student_profile_correction_request',
      resourceId: request.id,
      outcome: AuditOutcome.SUCCESS,
      after: {
        requestId: request.id,
        studentId: context.studentId,
        status: request.status,
        changedFieldNames: changedFieldNamesFromChanges(
          request.requestedChanges,
        ),
        source: 'student_app',
      },
    });

    return presentStudentProfileCorrectionRequest(request);
  }
}

@Injectable()
export class ListStudentProfileCorrectionRequestsUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly repository: ProfileCorrectionRequestsRepository,
  ) {}

  async execute(): Promise<StudentProfileCorrectionRequestResponseDto[]> {
    const context = await this.accessService.getStudentAppContext();
    const requests = await this.repository.listStudentRequests(context);

    return requests.map(presentStudentProfileCorrectionRequest);
  }
}

@Injectable()
export class GetStudentProfileCorrectionRequestUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly repository: ProfileCorrectionRequestsRepository,
  ) {}

  async execute(
    requestId: string,
  ): Promise<StudentProfileCorrectionRequestResponseDto> {
    const context = await this.accessService.getStudentAppContext();
    const request = await this.repository.findStudentRequest({
      context,
      requestId,
    });

    if (!request) {
      throw new NotFoundDomainException('Profile correction request not found', {
        requestId,
      });
    }

    return presentStudentProfileCorrectionRequest(request);
  }
}

@Injectable()
export class CancelStudentProfileCorrectionRequestUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly repository: ProfileCorrectionRequestsRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    requestId: string,
  ): Promise<StudentProfileCorrectionRequestResponseDto> {
    const context = await this.accessService.getStudentAppContext();
    const result = await this.repository.cancelStudentRequest({
      context,
      requestId,
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
          actorId: context.studentUserId,
          userType: UserType.STUDENT,
          organizationId: context.organizationId,
          schoolId: context.schoolId,
          module: 'student_app',
          action: 'student.profile.correction.cancelled',
          resourceType: 'student_profile_correction_request',
          resourceId: result.request.id,
          outcome: AuditOutcome.SUCCESS,
          after: {
            requestId: result.request.id,
            studentId: context.studentId,
            status: result.request.status,
            changedFieldNames: changedFieldNamesFromChanges(
              result.request.requestedChanges,
            ),
            source: 'student_app',
          },
        });

        return presentStudentProfileCorrectionRequest(result.request);
    }
  }
}
