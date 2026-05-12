import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
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
  @RequiredPermissions('settings.security.view')
  previewRecipients(
    @Body() dto: CampaignPreviewRecipientsDto,
  ): Promise<DeliveryRecipientPreviewResponseDto> {
    return this.previewRecipientsUseCase.execute(dto);
  }

  @Post('preview')
  @RequiredPermissions('settings.security.view')
  previewCampaign(
    @Body() dto: CampaignPreviewDto,
  ): Promise<CampaignPreviewResponseDto> {
    return this.previewCampaignUseCase.execute(dto);
  }

  @Post()
  @RequiredPermissions('settings.security.manage')
  createCampaign(
    @Body() dto: CreateCampaignDto,
  ): Promise<DeliveryBatchSummaryDto> {
    return this.createCampaignUseCase.execute(dto);
  }

  @Get()
  @RequiredPermissions('settings.security.view')
  listCampaigns(
    @Query() query: DeliveryListQueryDto,
  ): Promise<DeliveryBatchListResponseDto> {
    return this.listDeliveriesUseCase.execute({
      ...query,
      kind: 'GENERAL_CAMPAIGN',
    });
  }

  @Get(':batchId')
  @RequiredPermissions('settings.security.view')
  getCampaign(
    @Param('batchId', new ParseUUIDPipe()) batchId: string,
  ): Promise<DeliveryBatchSummaryDto> {
    return this.getCampaignUseCase.execute(batchId);
  }
}
