import { Injectable, OnModuleInit } from '@nestjs/common';
import { UserType } from '@prisma/client';
import { Worker } from 'bullmq';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../../../../common/context/request-context';
import { BullmqService } from '../../../../../infrastructure/queue/bullmq.service';
import { ProcessEmailDeliveryRecipientUseCase } from '../application/process-email-delivery-recipient.use-case';
import { SchoolEmailDeliveryReconciliationService } from '../application/school-email-delivery-reconciliation.service';
import {
  SCHOOL_EMAIL_DELIVERY_QUEUE_NAME,
  SCHOOL_EMAIL_DELIVERY_RECONCILE_JOB_NAME,
  SCHOOL_EMAIL_DELIVERY_SEND_RECIPIENT_JOB_NAME,
  SchoolEmailDeliveryRecipientJobData,
} from '../domain/email-delivery.constants';

@Injectable()
export class SchoolEmailDeliveryWorker implements OnModuleInit {
  private worker: Worker<
    SchoolEmailDeliveryRecipientJobData,
    void,
    string
  > | null = null;

  constructor(
    private readonly bullmqService: BullmqService,
    private readonly processRecipientUseCase: ProcessEmailDeliveryRecipientUseCase,
    private readonly reconciliationService: SchoolEmailDeliveryReconciliationService,
  ) {}

  onModuleInit(): void {
    this.worker = this.bullmqService.createWorker<
      SchoolEmailDeliveryRecipientJobData,
      void
    >(SCHOOL_EMAIL_DELIVERY_QUEUE_NAME, async (job) => {
      if (job.name === SCHOOL_EMAIL_DELIVERY_RECONCILE_JOB_NAME) {
        await this.reconciliationService.reconcile();
        return;
      }
      if (job.name !== SCHOOL_EMAIL_DELIVERY_SEND_RECIPIENT_JOB_NAME) {
        throw new Error('school_email_delivery_job_unknown');
      }

      const context = createRequestContext(
        `school-email-delivery:${job.id ?? job.data.recipientId}`,
      );
      const actorUserType = parseUserType(job.data.actorUserType);
      if (job.data.actorUserId && actorUserType) {
        context.actor = {
          id: job.data.actorUserId,
          userType: actorUserType,
        };
      }
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

function parseUserType(value: string | null): UserType | null {
  if (value && value in UserType) {
    return value as UserType;
  }

  return null;
}
