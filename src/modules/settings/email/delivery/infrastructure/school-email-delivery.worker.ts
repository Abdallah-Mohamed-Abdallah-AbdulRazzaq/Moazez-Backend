import { Injectable, OnModuleInit } from '@nestjs/common';
import { UserType } from '@prisma/client';
import { Worker } from 'bullmq';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../../../../common/context/request-context';
import { BullmqService } from '../../../../../infrastructure/queue/bullmq.service';
import { ProcessEmailDeliveryRecipientUseCase } from '../application/process-email-delivery-recipient.use-case';
import {
  SCHOOL_EMAIL_DELIVERY_QUEUE_NAME,
  SchoolEmailDeliveryRecipientJobData,
} from '../domain/email-delivery.constants';

@Injectable()
export class SchoolEmailDeliveryWorker implements OnModuleInit {
  private worker: Worker<SchoolEmailDeliveryRecipientJobData, void, string> | null =
    null;

  constructor(
    private readonly bullmqService: BullmqService,
    private readonly processRecipientUseCase: ProcessEmailDeliveryRecipientUseCase,
  ) {}

  onModuleInit(): void {
    this.worker = this.bullmqService.createWorker<
      SchoolEmailDeliveryRecipientJobData,
      void
    >(SCHOOL_EMAIL_DELIVERY_QUEUE_NAME, async (job) => {
      const context = createRequestContext(
        `school-email-delivery:${job.id ?? job.data.recipientId}`,
      );
      context.actor = {
        id: job.data.actorUserId ?? 'queue:school-email-delivery',
        userType: parseUserType(job.data.actorUserType),
      };
      context.activeMembership = {
        membershipId: 'queue:school-email-delivery',
        organizationId: job.data.organizationId,
        schoolId: job.data.schoolId,
        roleId: 'queue:school-email-delivery',
        permissions: [],
      };

      await runWithRequestContext(context, () =>
        this.processRecipientUseCase.execute(job.data),
      );
    });
  }
}

function parseUserType(value: string | null): UserType {
  if (value && value in UserType) {
    return value as UserType;
  }

  return UserType.SERVICE_ACCOUNT;
}
