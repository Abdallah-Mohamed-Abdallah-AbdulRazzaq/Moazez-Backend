import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
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
  @ApiOperation({
    summary: 'List school email templates',
    description:
      'Returns customized templates when present and default template content otherwise.',
  })
  @ApiOkResponse({ type: EmailTemplateListResponseDto })
  @ApiForbiddenResponse({
    description: 'Requires settings.security.view in the current school scope.',
  })
  listTemplates(): Promise<EmailTemplateListResponseDto> {
    return this.listEmailTemplatesUseCase.execute();
  }

  @Get(':key')
  @RequiredPermissions('settings.security.view')
  @ApiOperation({ summary: 'Get one school email template' })
  @ApiParam({
    name: 'key',
    enum: SchoolEmailTemplateKey,
    description: 'School email template key',
  })
  @ApiOkResponse({ type: EmailTemplateResponseDto })
  @ApiForbiddenResponse({
    description: 'Requires settings.security.view in the current school scope.',
  })
  getTemplate(
    @Param('key', new ParseEnumPipe(SchoolEmailTemplateKey))
    key: SchoolEmailTemplateKey,
  ): Promise<EmailTemplateResponseDto> {
    return this.getEmailTemplateUseCase.execute(key);
  }

  @Put(':key')
  @RequiredPermissions('settings.security.manage')
  @ApiOperation({
    summary: 'Update one school email template',
    description:
      'Updates school-branded template content and validates variables without exposing credential secrets.',
  })
  @ApiParam({
    name: 'key',
    enum: SchoolEmailTemplateKey,
    description: 'School email template key',
  })
  @ApiOkResponse({ type: EmailTemplateResponseDto })
  @ApiBadRequestResponse({ description: 'validation.failed' })
  @ApiUnprocessableEntityResponse({
    description: 'settings.email.template_invalid',
  })
  @ApiForbiddenResponse({
    description:
      'Requires settings.security.manage in the current school scope.',
  })
  updateTemplate(
    @Param('key', new ParseEnumPipe(SchoolEmailTemplateKey))
    key: SchoolEmailTemplateKey,
    @Body() dto: UpdateEmailTemplateDto,
  ): Promise<EmailTemplateResponseDto> {
    return this.updateEmailTemplateUseCase.execute(key, dto);
  }

  @Post(':key/preview')
  @RequiredPermissions('settings.security.view')
  @ApiOperation({
    summary: 'Preview a school email template',
    description:
      'Renders an unsaved template preview and reports missing or unknown variables.',
  })
  @ApiParam({
    name: 'key',
    enum: SchoolEmailTemplateKey,
    description: 'School email template key',
  })
  @ApiCreatedResponse({ type: EmailTemplatePreviewResponseDto })
  @ApiBadRequestResponse({ description: 'validation.failed' })
  @ApiUnprocessableEntityResponse({
    description: 'settings.email.template_invalid',
  })
  @ApiForbiddenResponse({
    description: 'Requires settings.security.view in the current school scope.',
  })
  previewTemplate(
    @Param('key', new ParseEnumPipe(SchoolEmailTemplateKey))
    key: SchoolEmailTemplateKey,
    @Body() dto: PreviewEmailTemplateDto,
  ): Promise<EmailTemplatePreviewResponseDto> {
    return this.previewEmailTemplateUseCase.execute(key, dto);
  }

  @Post(':key/reset-default')
  @RequiredPermissions('settings.security.manage')
  @ApiOperation({
    summary: 'Reset a school email template to the default content',
  })
  @ApiParam({
    name: 'key',
    enum: SchoolEmailTemplateKey,
    description: 'School email template key',
  })
  @ApiCreatedResponse({ type: EmailTemplateResponseDto })
  @ApiForbiddenResponse({
    description:
      'Requires settings.security.manage in the current school scope.',
  })
  resetTemplate(
    @Param('key', new ParseEnumPipe(SchoolEmailTemplateKey))
    key: SchoolEmailTemplateKey,
  ): Promise<EmailTemplateResponseDto> {
    return this.resetEmailTemplateUseCase.execute(key);
  }
}
