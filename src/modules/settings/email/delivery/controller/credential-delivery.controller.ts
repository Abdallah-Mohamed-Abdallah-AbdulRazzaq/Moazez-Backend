import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../../common/decorators/required-permissions.decorator';
import { CreateCredentialDeliveryUseCase } from '../application/create-credential-delivery.use-case';
import { PreviewCredentialDeliveryRecipientsUseCase } from '../application/preview-credential-delivery-recipients.use-case';
import {
  CreateCredentialDeliveryDto,
  CredentialDeliveryPreviewRecipientsDto,
  DeliveryBatchSummaryDto,
  DeliveryRecipientPreviewResponseDto,
} from '../dto/email-delivery.dto';

@ApiTags('settings-email-credential-deliveries')
@ApiBearerAuth()
@Controller('settings/email/credential-deliveries')
export class CredentialDeliveryController {
  constructor(
    private readonly previewRecipientsUseCase: PreviewCredentialDeliveryRecipientsUseCase,
    private readonly createCredentialDeliveryUseCase: CreateCredentialDeliveryUseCase,
  ) {}

  @Post('preview-recipients')
  @RequiredPermissions('settings.security.view')
  @ApiOperation({
    summary: 'Preview recipients for credential delivery',
    description:
      'Resolves school-scoped credential recipients and reports eligible/skipped counts without creating a batch or exposing passwords.',
  })
  @ApiCreatedResponse({ type: DeliveryRecipientPreviewResponseDto })
  @ApiBadRequestResponse({ description: 'validation.failed' })
  @ApiUnprocessableEntityResponse({
    description: 'settings.email.delivery_no_recipients',
  })
  @ApiForbiddenResponse({
    description: 'Requires settings.security.view in the current school scope.',
  })
  previewRecipients(
    @Body() dto: CredentialDeliveryPreviewRecipientsDto,
  ): Promise<DeliveryRecipientPreviewResponseDto> {
    return this.previewRecipientsUseCase.execute(dto);
  }

  @Post()
  @RequiredPermissions('settings.security.manage')
  @ApiOperation({
    summary: 'Create a queued credential delivery batch',
    description:
      'Creates queue-backed account credential delivery using contact emails. Temporary passwords are generated only when the selected mode allows it.',
  })
  @ApiCreatedResponse({ type: DeliveryBatchSummaryDto })
  @ApiBadRequestResponse({ description: 'validation.failed' })
  @ApiNotFoundResponse({
    description: 'settings.email.delivery_template_missing',
  })
  @ApiConflictResponse({
    description: 'settings.email.delivery_connection_inactive',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'settings.email.delivery_no_recipients | settings.email.delivery_too_many_recipients',
  })
  @ApiForbiddenResponse({
    description:
      'Requires settings.security.manage in the current school scope.',
  })
  createDelivery(
    @Body() dto: CreateCredentialDeliveryDto,
  ): Promise<DeliveryBatchSummaryDto> {
    return this.createCredentialDeliveryUseCase.execute(dto);
  }
}
