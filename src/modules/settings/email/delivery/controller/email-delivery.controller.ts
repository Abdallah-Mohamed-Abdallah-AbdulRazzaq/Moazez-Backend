import { Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../../common/decorators/required-permissions.decorator';
import { CancelEmailDeliveryUseCase } from '../application/cancel-email-delivery.use-case';
import {
  GetEmailDeliveryUseCase,
  ListEmailDeliveriesUseCase,
  ListEmailDeliveryRecipientsUseCase,
} from '../application/delivery-read.use-cases';
import {
  DeliveryBatchListResponseDto,
  DeliveryBatchSummaryDto,
  DeliveryListQueryDto,
  DeliveryRecipientListResponseDto,
  DeliveryRecipientsQueryDto,
} from '../dto/email-delivery.dto';

@ApiTags('settings-email-deliveries')
@ApiBearerAuth()
@Controller('settings/email/deliveries')
export class EmailDeliveryController {
  constructor(
    private readonly listDeliveriesUseCase: ListEmailDeliveriesUseCase,
    private readonly getDeliveryUseCase: GetEmailDeliveryUseCase,
    private readonly listRecipientsUseCase: ListEmailDeliveryRecipientsUseCase,
    private readonly cancelDeliveryUseCase: CancelEmailDeliveryUseCase,
  ) {}

  @Get()
  @RequiredPermissions('settings.security.view')
  listDeliveries(
    @Query() query: DeliveryListQueryDto,
  ): Promise<DeliveryBatchListResponseDto> {
    return this.listDeliveriesUseCase.execute(query);
  }

  @Get(':batchId')
  @RequiredPermissions('settings.security.view')
  getDelivery(
    @Param('batchId', new ParseUUIDPipe()) batchId: string,
  ): Promise<DeliveryBatchSummaryDto> {
    return this.getDeliveryUseCase.execute(batchId);
  }

  @Get(':batchId/recipients')
  @RequiredPermissions('settings.security.view')
  listRecipients(
    @Param('batchId', new ParseUUIDPipe()) batchId: string,
    @Query() query: DeliveryRecipientsQueryDto,
  ): Promise<DeliveryRecipientListResponseDto> {
    return this.listRecipientsUseCase.execute(batchId, query);
  }

  @Post(':batchId/cancel')
  @RequiredPermissions('settings.security.manage')
  cancelDelivery(
    @Param('batchId', new ParseUUIDPipe()) batchId: string,
  ): Promise<DeliveryBatchSummaryDto> {
    return this.cancelDeliveryUseCase.execute(batchId);
  }
}
