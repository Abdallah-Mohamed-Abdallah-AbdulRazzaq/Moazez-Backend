import { Injectable } from '@nestjs/common';
import { UserType } from '@prisma/client';
import { DismissalRequestNotFoundException } from '../../shared/dismissal.errors';
import { DismissalRequestDetailResponseDto } from '../dto/dismissal-request-query.dto';
import {
  DismissalRequestDetailRecord,
  DismissalRequestsReadRepository,
} from '../infrastructure/dismissal-requests-read.repository';
import { presentDismissalRequestDetail } from '../presenter/dismissal-request-queue.presenter';
import {
  isRequestVisibleToStaff,
  resolveThresholds,
} from './list-active-dismissal-requests.use-case';
import { requireDismissalRequestQueueScope } from './dismissal-request-queue-scope';

@Injectable()
export class GetDismissalRequestDetailUseCase {
  constructor(
    private readonly dismissalRequestsReadRepository: DismissalRequestsReadRepository,
  ) {}

  async execute(requestId: string): Promise<DismissalRequestDetailResponseDto> {
    const scope = requireDismissalRequestQueueScope();
    const now = new Date();
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
      throw new DismissalRequestNotFoundException();
    }

    if (
      scope.userType === UserType.DISMISSAL_STAFF &&
      !isRequestVisibleToStaff(requestToQueueRecord(request), assignments)
    ) {
      throw new DismissalRequestNotFoundException();
    }

    return presentDismissalRequestDetail({
      request,
      thresholds: resolveThresholds(thresholdSettings),
      now,
    });
  }
}

function requestToQueueRecord(
  request: DismissalRequestDetailRecord,
): Parameters<typeof isRequestVisibleToStaff>[0] {
  return request;
}
