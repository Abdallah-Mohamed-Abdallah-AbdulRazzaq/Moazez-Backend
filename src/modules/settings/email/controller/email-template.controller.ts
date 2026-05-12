import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SchoolEmailTemplateKey } from '@prisma/client';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { GetEmailTemplateUseCase } from '../application/get-email-template.use-case';
import { ListEmailTemplatesUseCase } from '../application/list-email-templates.use-case';
import { PreviewEmailTemplateUseCase } from '../application/preview-email-template.use-case';
import { ResetEmailTemplateUseCase } from '../application/reset-email-template.use-case';
import { UpdateEmailTemplateUseCase } from '../application/update-email-template.use-case';
import {
  EmailTemplateListResponseDto,
  EmailTemplatePreviewResponseDto,
  EmailTemplateResponseDto,
  PreviewEmailTemplateDto,
  UpdateEmailTemplateDto,
} from '../dto/email-template.dto';

@ApiTags('settings-email-templates')
@ApiBearerAuth()
@Controller('settings/email/templates')
export class EmailTemplateController {
  constructor(
    private readonly listEmailTemplatesUseCase: ListEmailTemplatesUseCase,
    private readonly getEmailTemplateUseCase: GetEmailTemplateUseCase,
    private readonly updateEmailTemplateUseCase: UpdateEmailTemplateUseCase,
    private readonly previewEmailTemplateUseCase: PreviewEmailTemplateUseCase,
    private readonly resetEmailTemplateUseCase: ResetEmailTemplateUseCase,
  ) {}

  @Get()
  @RequiredPermissions('settings.security.view')
  listTemplates(): Promise<EmailTemplateListResponseDto> {
    return this.listEmailTemplatesUseCase.execute();
  }

  @Get(':key')
  @RequiredPermissions('settings.security.view')
  getTemplate(
    @Param('key', new ParseEnumPipe(SchoolEmailTemplateKey))
    key: SchoolEmailTemplateKey,
  ): Promise<EmailTemplateResponseDto> {
    return this.getEmailTemplateUseCase.execute(key);
  }

  @Put(':key')
  @RequiredPermissions('settings.security.manage')
  updateTemplate(
    @Param('key', new ParseEnumPipe(SchoolEmailTemplateKey))
    key: SchoolEmailTemplateKey,
    @Body() dto: UpdateEmailTemplateDto,
  ): Promise<EmailTemplateResponseDto> {
    return this.updateEmailTemplateUseCase.execute(key, dto);
  }

  @Post(':key/preview')
  @RequiredPermissions('settings.security.view')
  previewTemplate(
    @Param('key', new ParseEnumPipe(SchoolEmailTemplateKey))
    key: SchoolEmailTemplateKey,
    @Body() dto: PreviewEmailTemplateDto,
  ): Promise<EmailTemplatePreviewResponseDto> {
    return this.previewEmailTemplateUseCase.execute(key, dto);
  }

  @Post(':key/reset-default')
  @RequiredPermissions('settings.security.manage')
  resetTemplate(
    @Param('key', new ParseEnumPipe(SchoolEmailTemplateKey))
    key: SchoolEmailTemplateKey,
  ): Promise<EmailTemplateResponseDto> {
    return this.resetEmailTemplateUseCase.execute(key);
  }
}
