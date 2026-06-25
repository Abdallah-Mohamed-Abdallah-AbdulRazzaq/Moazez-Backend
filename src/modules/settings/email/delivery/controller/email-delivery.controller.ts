import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
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
  @RequiredPermissions('settings.email.deliveries.view')
  @ApiOperation({
    summary: 'List school email delivery batches',
    description:
      'Returns school-scoped credential delivery and campaign batches with operational send counts.',
  })
  @ApiOkResponse({ type: DeliveryBatchListResponseDto })
  @ApiBadRequestResponse({ description: 'validation.failed' })
  @ApiForbiddenResponse({
    description:
      'Requires settings.email.deliveries.view in the current school scope.',
  })
  listDeliveries(
    @Query() query: DeliveryListQueryDto,
  ): Promise<DeliveryBatchListResponseDto> {
    return this.listDeliveriesUseCase.execute(query);
  }

  @Get(':batchId')
  @RequiredPermissions('settings.email.deliveries.view')
  @ApiOperation({ summary: 'Get one school email delivery batch' })
  @ApiParam({
    name: 'batchId',
    description: 'Delivery batch id',
    format: 'uuid',
  })
  @ApiOkResponse({ type: DeliveryBatchSummaryDto })
  @ApiNotFoundResponse({
    description: 'settings.email.delivery_batch_not_found',
  })
  @ApiForbiddenResponse({
    description:
      'Requires settings.email.deliveries.view in the current school scope.',
  })
  getDelivery(
    @Param('batchId', new ParseUUIDPipe()) batchId: string,
  ): Promise<DeliveryBatchSummaryDto> {
    return this.getDeliveryUseCase.execute(batchId);
  }

  @Get(':batchId/recipients')
  @RequiredPermissions('settings.email.deliveries.view')
  @ApiOperation({ summary: 'List recipients for one email delivery batch' })
  @ApiParam({
    name: 'batchId',
    description: 'Delivery batch id',
    format: 'uuid',
  })
  @ApiOkResponse({ type: DeliveryRecipientListResponseDto })
  @ApiBadRequestResponse({ description: 'validation.failed' })
  @ApiNotFoundResponse({
    description: 'settings.email.delivery_batch_not_found',
  })
  @ApiForbiddenResponse({
    description:
      'Requires settings.email.deliveries.view in the current school scope.',
  })
  listRecipients(
    @Param('batchId', new ParseUUIDPipe()) batchId: string,
    @Query() query: DeliveryRecipientsQueryDto,
  ): Promise<DeliveryRecipientListResponseDto> {
    return this.listRecipientsUseCase.execute(batchId, query);
  }

  @Post(':batchId/cancel')
  @RequiredPermissions('settings.email.deliveries.manage')
  @ApiOperation({ summary: 'Cancel a queued email delivery batch' })
  @ApiParam({
    name: 'batchId',
    description: 'Delivery batch id',
    format: 'uuid',
  })
  @ApiCreatedResponse({ type: DeliveryBatchSummaryDto })
  @ApiNotFoundResponse({
    description: 'settings.email.delivery_batch_not_found',
  })
  @ApiConflictResponse({
    description: 'settings.email.delivery_batch_not_cancelable',
  })
  @ApiForbiddenResponse({
    description:
      'Requires settings.email.deliveries.manage in the current school scope.',
  })
  cancelDelivery(
    @Param('batchId', new ParseUUIDPipe()) batchId: string,
  ): Promise<DeliveryBatchSummaryDto> {
    return this.cancelDeliveryUseCase.execute(batchId);
  }
}
