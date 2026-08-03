import { Injectable, OnModuleInit } from '@nestjs/common';
import { BullmqService } from '../../../../infrastructure/queue/bullmq.service';
import { ExpireDismissalRequestsUseCase } from '../application/expire-dismissal-requests.use-case';
import {
  DISMISSAL_REQUEST_EXPIRY_QUEUE_NAME,
  type DismissalRequestExpiryJobData,
} from '../domain/dismissal-request-expiry.constants';

@Injectable()
export class DismissalRequestExpiryWorker implements OnModuleInit {
  constructor(
    private readonly bullmqService: BullmqService,
    private readonly expireDismissalRequestsUseCase: ExpireDismissalRequestsUseCase,
  ) {}

  onModuleInit(): void {
    this.bullmqService.createWorker<DismissalRequestExpiryJobData, void>(
      DISMISSAL_REQUEST_EXPIRY_QUEUE_NAME,
      async (job) => {
        await this.expireDismissalRequestsUseCase.runOnce({
          batchSize: job.data.batchSize,
        });
      },
    );

  }
}
