import {
  Body,
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
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../../common/decorators/required-permissions.decorator';
import { CreateEmailCampaignUseCase } from '../application/create-email-campaign.use-case';
import {
  GetEmailCampaignUseCase,
  ListEmailDeliveriesUseCase,
} from '../application/delivery-read.use-cases';
import { PreviewCampaignRecipientsUseCase } from '../application/preview-campaign-recipients.use-case';
import { PreviewEmailCampaignUseCase } from '../application/preview-email-campaign.use-case';
import {
  CampaignPreviewDto,
  CampaignPreviewRecipientsDto,
  CampaignPreviewResponseDto,
  CreateCampaignDto,
  DeliveryBatchListResponseDto,
  DeliveryBatchSummaryDto,
  DeliveryListQueryDto,
  DeliveryRecipientPreviewResponseDto,
} from '../dto/email-delivery.dto';

@ApiTags('settings-email-campaigns')
@ApiBearerAuth()
@Controller('settings/email/campaigns')
export class EmailCampaignController {
  constructor(
    private readonly previewRecipientsUseCase: PreviewCampaignRecipientsUseCase,
    private readonly previewCampaignUseCase: PreviewEmailCampaignUseCase,
    private readonly createCampaignUseCase: CreateEmailCampaignUseCase,
    private readonly listDeliveriesUseCase: ListEmailDeliveriesUseCase,
    private readonly getCampaignUseCase: GetEmailCampaignUseCase,
  ) {}

  @Post('preview-recipients')
  @RequiredPermissions('settings.email.campaigns.view')
  @ApiOperation({
    summary: 'Preview recipients for a general email campaign',
    description:
      'Resolves the selected school-scoped audience and optional custom emails without creating a delivery batch.',
  })
  @ApiCreatedResponse({ type: DeliveryRecipientPreviewResponseDto })
  @ApiBadRequestResponse({ description: 'validation.failed' })
  @ApiUnprocessableEntityResponse({
    description: 'settings.email.delivery_no_recipients',
  })
  @ApiForbiddenResponse({
    description:
      'Requires settings.email.campaigns.view in the current school scope.',
  })
  previewRecipients(
    @Body() dto: CampaignPreviewRecipientsDto,
  ): Promise<DeliveryRecipientPreviewResponseDto> {
    return this.previewRecipientsUseCase.execute(dto);
  }

  @Post('preview')
  @RequiredPermissions('settings.email.campaigns.view')
  @ApiOperation({
    summary: 'Preview a general email campaign',
    description:
      'Renders campaign HTML/text and reports template variable issues without sending email.',
  })
  @ApiCreatedResponse({ type: CampaignPreviewResponseDto })
  @ApiBadRequestResponse({ description: 'validation.failed' })
  @ApiUnprocessableEntityResponse({
    description:
      'settings.email.campaign_invalid | settings.email.campaign_credential_variables_forbidden',
  })
  @ApiForbiddenResponse({
    description:
      'Requires settings.email.campaigns.view in the current school scope.',
  })
  previewCampaign(
    @Body() dto: CampaignPreviewDto,
  ): Promise<CampaignPreviewResponseDto> {
    return this.previewCampaignUseCase.execute(dto);
  }

  @Post()
  @RequiredPermissions('settings.email.campaigns.manage')
  @ApiOperation({
    summary: 'Create a queued general email campaign',
    description:
      'Creates a queue-backed external email campaign separate from in-app communication announcements.',
  })
  @ApiCreatedResponse({ type: DeliveryBatchSummaryDto })
  @ApiBadRequestResponse({ description: 'validation.failed' })
  @ApiUnprocessableEntityResponse({
    description:
      'settings.email.delivery_no_recipients | settings.email.delivery_too_many_recipients | settings.email.campaign_invalid',
  })
  @ApiForbiddenResponse({
    description:
      'Requires settings.email.campaigns.manage in the current school scope.',
  })
  createCampaign(
    @Body() dto: CreateCampaignDto,
  ): Promise<DeliveryBatchSummaryDto> {
    return this.createCampaignUseCase.execute(dto);
  }

  @Get()
  @RequiredPermissions('settings.email.campaigns.view')
  @ApiOperation({ summary: 'List general email campaign batches' })
  @ApiOkResponse({ type: DeliveryBatchListResponseDto })
  @ApiBadRequestResponse({ description: 'validation.failed' })
  @ApiForbiddenResponse({
    description:
      'Requires settings.email.campaigns.view in the current school scope.',
  })
  listCampaigns(
    @Query() query: DeliveryListQueryDto,
  ): Promise<DeliveryBatchListResponseDto> {
    return this.listDeliveriesUseCase.execute({
      ...query,
      kind: 'GENERAL_CAMPAIGN',
    });
  }

  @Get(':batchId')
  @RequiredPermissions('settings.email.campaigns.view')
  @ApiOperation({ summary: 'Get one general email campaign batch' })
  @ApiParam({
    name: 'batchId',
    description: 'Campaign batch id',
    format: 'uuid',
  })
  @ApiOkResponse({ type: DeliveryBatchSummaryDto })
  @ApiNotFoundResponse({
    description: 'settings.email.delivery_batch_not_found',
  })
  @ApiForbiddenResponse({
    description:
      'Requires settings.email.campaigns.view in the current school scope.',
  })
  getCampaign(
    @Param('batchId', new ParseUUIDPipe()) batchId: string,
  ): Promise<DeliveryBatchSummaryDto> {
    return this.getCampaignUseCase.execute(batchId);
  }
}
