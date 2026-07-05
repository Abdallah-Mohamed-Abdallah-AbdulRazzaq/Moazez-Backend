import { Injectable } from '@nestjs/common';
import { AuditOutcome, DismissalRequestStatus, UserType } from '@prisma/client';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import {
  DismissalWaitingStudentInvalidArrivalStatusException,
  DismissalWaitingStudentNotFoundException,
} from '../../shared/dismissal.errors';
import { WAITING_DISMISSAL_REQUEST_STATUSES } from '../../shared/dismissal.types';
import { requireDismissalRequestQueueScope } from '../../requests/application/dismissal-request-queue-scope';
import {
  isRequestVisibleToStaff,
  resolveThresholds,
} from '../../requests/application/list-active-dismissal-requests.use-case';
import {
  DismissalRequestDetailRecord,
  DismissalRequestsReadRepository,
} from '../../requests/infrastructure/dismissal-requests-read.repository';
import { DismissalRequestsWriteRepository } from '../../requests/infrastructure/dismissal-requests-write.repository';
import { ConfirmStudentArrivalDto } from '../dto/confirm-student-arrival.dto';
import { ConfirmStudentArrivalResponseDto } from '../dto/dismissal-waiting-students-query.dto';
import { presentStudentArrivalConfirmation } from '../presenter/dismissal-waiting-students.presenter';

@Injectable()
export class ConfirmStudentArrivalUseCase {
  constructor(
    private readonly dismissalRequestsReadRepository: DismissalRequestsReadRepository,
    private readonly dismissalRequestsWriteRepository: DismissalRequestsWriteRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    requestId: string,
    command: ConfirmStudentArrivalDto,
  ): Promise<ConfirmStudentArrivalResponseDto> {
    const scope = requireDismissalRequestQueueScope();
    const now = new Date();
    const note = normalizeArrivalNote(command.note);

    const [request, thresholdSettings, assignments] = await Promise.all([
      this.dismissalRequestsReadRepository.findActiveRequestById(requestId),
      this.dismissalRequestsReadRepository.findSettingsThresholds(),
      scope.userType === UserType.DISMISSAL_STAFF
        ? this.dismissalRequestsReadRepository.listActiveStaffAssignments({
            staffUserId: scope.actorId,
            now,
          })
        : Promise.resolve([]),
    ]);

    if (!request) {
      throw new DismissalWaitingStudentNotFoundException();
    }

    if (
      scope.userType === UserType.DISMISSAL_STAFF &&
      !isRequestVisibleToStaff(requestToQueueRecord(request), assignments)
    ) {
      throw new DismissalWaitingStudentNotFoundException();
    }

    if (!WAITING_DISMISSAL_REQUEST_STATUSES.includes(request.status)) {
      throw new DismissalWaitingStudentInvalidArrivalStatusException();
    }

    const thresholds = resolveThresholds(thresholdSettings);

    if (
      request.status === DismissalRequestStatus.AT_GATE ||
      request.status === DismissalRequestStatus.READY
    ) {
      return presentStudentArrivalConfirmation({
        request,
        previousStatus: null,
        changed: false,
        thresholds,
        now,
      });
    }

    if (
      request.status !== DismissalRequestStatus.CALLED &&
      request.status !== DismissalRequestStatus.MOVING
    ) {
      throw new DismissalWaitingStudentInvalidArrivalStatusException();
    }

    const updated =
      await this.dismissalRequestsWriteRepository.updateStatusWithEvent({
        schoolId: scope.schoolId,
        requestId: request.id,
        statusFrom: request.status,
        statusTo: DismissalRequestStatus.AT_GATE,
        actorUserId: scope.actorId,
        note,
      });

    await this.authRepository.createAuditLog({
      actorId: scope.actorId,
      userType: scope.userType,
      organizationId: scope.organizationId,
      schoolId: scope.schoolId,
      module: 'dismissal',
      action: 'dismissal.waiting_student.arrival_confirmed',
      resourceType: 'dismissal_request',
      resourceId: updated.id,
      outcome: AuditOutcome.SUCCESS,
      before: {
        status: request.status,
      },
      after: {
        status: updated.status,
        note: Boolean(note),
      },
    });

    return presentStudentArrivalConfirmation({
      request: updated,
      previousStatus: request.status,
      changed: true,
      thresholds,
      now,
    });
  }
}

function normalizeArrivalNote(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function requestToQueueRecord(
  request: DismissalRequestDetailRecord,
): Parameters<typeof isRequestVisibleToStaff>[0] {
  return request;
}
