import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import { BullmqService } from '../../../../infrastructure/queue/bullmq.service';
import { ExpireDismissalRequestsUseCase } from '../application/expire-dismissal-requests.use-case';

export interface DismissalRequestExpiryJobData {
  batchSize?: number;
}

export const DISMISSAL_REQUEST_EXPIRY_QUEUE_NAME =
  'dismissal-request-expiry';
export const DISMISSAL_REQUEST_EXPIRY_JOB_NAME =
  'expire-stale-dismissal-requests';
export const DISMISSAL_REQUEST_EXPIRY_REPEAT_JOB_ID =
  'dismissal-request-expiry-every-minute';
export const DISMISSAL_REQUEST_EXPIRY_REPEAT_PATTERN = '* * * * *';

@Injectable()
export class DismissalRequestExpiryWorker
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(DismissalRequestExpiryWorker.name);
  private worker: Worker<DismissalRequestExpiryJobData, void, string> | null =
    null;

  constructor(
    private readonly bullmqService: BullmqService,
    private readonly expireDismissalRequestsUseCase: ExpireDismissalRequestsUseCase,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    this.worker = this.bullmqService.createWorker<
      DismissalRequestExpiryJobData,
      void
    >(DISMISSAL_REQUEST_EXPIRY_QUEUE_NAME, async (job) => {
      await this.expireDismissalRequestsUseCase.runOnce({
        batchSize: job.data.batchSize,
      });
    });

    await this.bullmqService.addJob<DismissalRequestExpiryJobData>(
      DISMISSAL_REQUEST_EXPIRY_QUEUE_NAME,
      DISMISSAL_REQUEST_EXPIRY_JOB_NAME,
      {},
      {
        jobId: DISMISSAL_REQUEST_EXPIRY_REPEAT_JOB_ID,
        repeat: {
          pattern: DISMISSAL_REQUEST_EXPIRY_REPEAT_PATTERN,
        },
      },
    );

    this.logger.log(
      `Registered dismissal request expiry worker with ${DISMISSAL_REQUEST_EXPIRY_REPEAT_PATTERN} cadence.`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    this.worker = null;
  }
}
