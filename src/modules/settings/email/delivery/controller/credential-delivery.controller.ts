import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
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
  previewRecipients(
    @Body() dto: CredentialDeliveryPreviewRecipientsDto,
  ): Promise<DeliveryRecipientPreviewResponseDto> {
    return this.previewRecipientsUseCase.execute(dto);
  }

  @Post()
  @RequiredPermissions('settings.security.manage')
  createDelivery(
    @Body() dto: CreateCredentialDeliveryDto,
  ): Promise<DeliveryBatchSummaryDto> {
    return this.createCredentialDeliveryUseCase.execute(dto);
  }
}
