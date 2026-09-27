import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { SchoolManagementOnly } from '../../../../common/decorators/school-management-only.decorator';
import { AcademicContentPreparationTemplateUseCases } from '../application/academic-content-preparation-template.use-cases';
import {
  AcademicContentPreparationTemplateDeleteResponseDto,
  AcademicContentPreparationTemplateDetailDto,
  AcademicContentPreparationTemplateListResponseDto,
  CreateAcademicContentPreparationTemplateDto,
  ListAcademicContentPreparationTemplatesQueryDto,
  UpdateAcademicContentPreparationTemplateDto,
} from '../dto/academic-content-preparation-template.dto';

@ApiTags('academics-academic-content')
@ApiBearerAuth()
@SchoolManagementOnly()
@Controller('academics/academic-content/templates/preparation')
export class AcademicContentPreparationTemplateController {
  constructor(
    private readonly templates: AcademicContentPreparationTemplateUseCases,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store, private, max-age=0')
  @RequiredPermissions('academics.academic_content.view')
  @ApiOperation({ summary: 'List School Preparation templates' })
  @ApiOkResponse({ type: AcademicContentPreparationTemplateListResponseDto })
  list(@Query() query: ListAcademicContentPreparationTemplatesQueryDto) {
    return this.templates.list(query);
  }

  @Get(':templateId')
  @Header('Cache-Control', 'no-store, private, max-age=0')
  @RequiredPermissions('academics.academic_content.view')
  @ApiOperation({ summary: 'Get Preparation template detail' })
  @ApiParam({ name: 'templateId', format: 'uuid' })
  @ApiOkResponse({ type: AcademicContentPreparationTemplateDetailDto })
  detail(@Param('templateId', ParseUUIDPipe) id: string) {
    return this.templates.detail(id);
  }

  @Post()
  @RequiredPermissions('academics.academic_content.settings.manage')
  @ApiOperation({ summary: 'Create Preparation template' })
  @ApiBody({ type: CreateAcademicContentPreparationTemplateDto })
  @ApiCreatedResponse({ type: AcademicContentPreparationTemplateDetailDto })
  create(@Body() dto: CreateAcademicContentPreparationTemplateDto) {
    return this.templates.create(dto);
  }

  @Patch(':templateId')
  @RequiredPermissions('academics.academic_content.settings.manage')
  @ApiOperation({ summary: 'Update Preparation template' })
  @ApiParam({ name: 'templateId', format: 'uuid' })
  @ApiBody({ type: UpdateAcademicContentPreparationTemplateDto })
  @ApiOkResponse({ type: AcademicContentPreparationTemplateDetailDto })
  update(
    @Param('templateId', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAcademicContentPreparationTemplateDto,
  ) {
    return this.templates.update(id, dto);
  }

  @Delete(':templateId')
  @HttpCode(HttpStatus.OK)
  @RequiredPermissions('academics.academic_content.settings.manage')
  @ApiOperation({ summary: 'Soft delete Preparation template' })
  @ApiParam({ name: 'templateId', format: 'uuid' })
  @ApiOkResponse({ type: AcademicContentPreparationTemplateDeleteResponseDto })
  delete(@Param('templateId', ParseUUIDPipe) id: string) {
    return this.templates.delete(id);
  }
}
