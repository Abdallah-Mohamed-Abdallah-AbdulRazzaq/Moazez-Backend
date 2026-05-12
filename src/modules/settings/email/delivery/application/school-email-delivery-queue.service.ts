import { Injectable } from '@nestjs/common';
import { UserType } from '@prisma/client';
import { BullmqService } from '../../../../../infrastructure/queue/bullmq.service';
import {
  buildSchoolEmailDeliveryRecipientJobId,
  SCHOOL_EMAIL_DELIVERY_QUEUE_NAME,
  SCHOOL_EMAIL_DELIVERY_SEND_RECIPIENT_JOB_NAME,
  SchoolEmailDeliveryRecipientJobData,
} from '../domain/email-delivery.constants';

@Injectable()
export class SchoolEmailDeliveryQueueService {
  constructor(private readonly bullmqService: BullmqService) {}

  enqueueRecipientDelivery(data: {
    schoolId: string;
    organizationId: string;
    batchId: string;
    recipientId: string;
    actorUserId: string | null;
    actorUserType: UserType | null;
  }) {
    const jobData: SchoolEmailDeliveryRecipientJobData = {
      schoolId: data.schoolId,
      organizationId: data.organizationId,
      batchId: data.batchId,
      recipientId: data.recipientId,
      actorUserId: data.actorUserId,
      actorUserType: data.actorUserType,
    };

    return this.bullmqService.addJob(
      SCHOOL_EMAIL_DELIVERY_QUEUE_NAME,
      SCHOOL_EMAIL_DELIVERY_SEND_RECIPIENT_JOB_NAME,
      jobData,
      {
        jobId: buildSchoolEmailDeliveryRecipientJobId({
          batchId: data.batchId,
          recipientId: data.recipientId,
        }),
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );
  }
}
