import { Injectable } from '@nestjs/common';
import { AuditOutcome, SchoolEmailDeliveryBatchStatus } from '@prisma/client';
import { AuthRepository } from '../../../../iam/auth/infrastructure/auth.repository';
import { requireSettingsScope } from '../../../settings-context';
import {
  EmailDeliveryBatchNotCancelableException,
  EmailDeliveryBatchNotFoundException,
} from '../../domain/email.exceptions';
import { EmailDeliveryRepository } from '../infrastructure/email-delivery.repository';
import { presentDeliveryBatch } from '../presenters/email-delivery.presenter';

const CANCELABLE_STATUSES = new Set<SchoolEmailDeliveryBatchStatus>([
  SchoolEmailDeliveryBatchStatus.DRAFT,
  SchoolEmailDeliveryBatchStatus.QUEUED,
  SchoolEmailDeliveryBatchStatus.PROCESSING,
]);

@Injectable()
export class CancelEmailDeliveryUseCase {
  constructor(
    private readonly deliveryRepository: EmailDeliveryRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(batchId: string) {
    const scope = requireSettingsScope();
    const batch = await this.deliveryRepository.findBatchById(batchId);
    if (!batch) throw new EmailDeliveryBatchNotFoundException();
    if (!CANCELABLE_STATUSES.has(batch.status)) {
      throw new EmailDeliveryBatchNotCancelableException(batch.status);
    }

    const cancelled = await this.deliveryRepository.cancelBatch(
      batchId,
      new Date(),
    );

    await this.authRepository.createAuditLog({
      actorId: scope.actorId,
      userType: scope.userType,
      organizationId: scope.organizationId,
      schoolId: scope.schoolId,
      module: 'settings',
      action: 'settings.email.delivery.cancel',
      resourceType: 'school_email_delivery_batch',
      resourceId: batchId,
      outcome: AuditOutcome.SUCCESS,
      before: {
        status: batch.status,
      },
      after: {
        status: cancelled.status,
      },
    });

    return presentDeliveryBatch(cancelled);
  }
}
