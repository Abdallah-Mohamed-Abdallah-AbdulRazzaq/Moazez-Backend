import { Injectable } from '@nestjs/common';
import { UserType } from '@prisma/client';
import { DismissalHistoryNotFoundException } from '../../shared/dismissal.errors';
import { DismissalRequestHistoryDetailResponseDto } from '../dto/list-dismissal-request-history.dto';
import { DismissalRequestsHistoryRepository } from '../infrastructure/dismissal-requests-history.repository';
import { DismissalRequestsReadRepository } from '../infrastructure/dismissal-requests-read.repository';
import { presentDismissalRequestHistoryDetail } from '../presenter/dismissal-request-history.presenter';
import { requireDismissalRequestQueueScope } from './dismissal-request-queue-scope';
import {
  isRequestVisibleToStaff,
  resolveThresholds,
} from './list-active-dismissal-requests.use-case';

@Injectable()
export class GetDismissalRequestHistoryDetailUseCase {
  constructor(
    private readonly historyRepository: DismissalRequestsHistoryRepository,
    private readonly readRepository: DismissalRequestsReadRepository,
  ) {}

  async execute(
    requestId: string,
  ): Promise<DismissalRequestHistoryDetailResponseDto> {
    const scope = requireDismissalRequestQueueScope();
    const now = new Date();

    const [request, thresholdSettings, assignments] = await Promise.all([
      this.historyRepository.findHistoryRequestById(requestId),
      this.historyRepository.findSettingsThresholds(),
      scope.userType === UserType.DISMISSAL_STAFF
        ? this.readRepository.listActiveStaffAssignments({
            staffUserId: scope.actorId,
            now,
          })
        : Promise.resolve([]),
    ]);

    if (!request) {
      throw new DismissalHistoryNotFoundException();
    }

    if (
      scope.userType === UserType.DISMISSAL_STAFF &&
      !isRequestVisibleToStaff(request, assignments)
    ) {
      throw new DismissalHistoryNotFoundException();
    }

    return presentDismissalRequestHistoryDetail({
      request,
      thresholds: resolveThresholds(thresholdSettings),
      now,
    });
  }
}
