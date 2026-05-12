import { Injectable } from '@nestjs/common';
import {
  SchoolEmailDeliveryBatchStatus,
  SchoolEmailDeliveryKind,
} from '@prisma/client';
import { EmailDeliveryBatchNotFoundException } from '../../domain/email.exceptions';
import {
  DeliveryListQueryDto,
  DeliveryRecipientsQueryDto,
} from '../dto/email-delivery.dto';
import { EmailDeliveryRepository } from '../infrastructure/email-delivery.repository';
import {
  presentDeliveryBatch,
  presentDeliveryBatchList,
  presentDeliveryRecipients,
} from '../presenters/email-delivery.presenter';

@Injectable()
export class ListEmailDeliveriesUseCase {
  constructor(private readonly deliveryRepository: EmailDeliveryRepository) {}

  async execute(query: DeliveryListQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const result = await this.deliveryRepository.listBatches({
      kind: query.kind as SchoolEmailDeliveryKind | undefined,
      status: query.status as SchoolEmailDeliveryBatchStatus | undefined,
      page,
      limit,
    });

    return presentDeliveryBatchList({ ...result, page, limit });
  }
}

@Injectable()
export class GetEmailDeliveryUseCase {
  constructor(private readonly deliveryRepository: EmailDeliveryRepository) {}

  async execute(batchId: string) {
    const batch = await this.deliveryRepository.findBatchById(batchId);
    if (!batch) throw new EmailDeliveryBatchNotFoundException();

    return presentDeliveryBatch(batch);
  }
}

@Injectable()
export class GetEmailCampaignUseCase {
  constructor(private readonly deliveryRepository: EmailDeliveryRepository) {}

  async execute(batchId: string) {
    const batch = await this.deliveryRepository.findBatchByIdAndKind(
      batchId,
      SchoolEmailDeliveryKind.GENERAL_CAMPAIGN,
    );
    if (!batch) throw new EmailDeliveryBatchNotFoundException();

    return presentDeliveryBatch(batch);
  }
}

@Injectable()
export class ListEmailDeliveryRecipientsUseCase {
  constructor(private readonly deliveryRepository: EmailDeliveryRepository) {}

  async execute(batchId: string, query: DeliveryRecipientsQueryDto) {
    const batch = await this.deliveryRepository.findBatchById(batchId);
    if (!batch) throw new EmailDeliveryBatchNotFoundException();

    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const result = await this.deliveryRepository.listRecipients({
      batchId,
      page,
      limit,
    });

    return presentDeliveryRecipients({ ...result, page, limit });
  }
}
