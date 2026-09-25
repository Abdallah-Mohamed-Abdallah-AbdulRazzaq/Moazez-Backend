import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { SchoolManagementOnly } from '../../../../common/decorators/school-management-only.decorator';
import { UpdateAcademicContentFilePolicyDto } from '../dto/academic-content-file-policy.dto';
import { AcademicContentFilePolicyResponseDto } from '../dto/academic-content-response.dto';
import {
  GetAcademicContentFilePolicyUseCase,
  UpdateAcademicContentFilePolicyUseCase,
} from '../files/application/academic-content-file-policy.use-cases';
import { presentAcademicContentFilePolicy } from '../presenters/academic-content.presenter';

@ApiTags('academics-academic-content')
@ApiBearerAuth()
@SchoolManagementOnly()
@Controller('academics/academic-content/settings')
export class AcademicContentFilePolicyController {
  constructor(
    private readonly getPolicy: GetAcademicContentFilePolicyUseCase,
    private readonly updatePolicy: UpdateAcademicContentFilePolicyUseCase,
  ) {}

  @Get('file-policy')
  @RequiredPermissions('academics.academic_content.view')
  @ApiOperation({
    summary: 'Get effective School Academic Content file policy',
  })
  @ApiOkResponse({ type: AcademicContentFilePolicyResponseDto })
  async get(): Promise<AcademicContentFilePolicyResponseDto> {
    return presentAcademicContentFilePolicy(await this.getPolicy.execute());
  }

  @Patch('file-policy')
  @RequiredPermissions('academics.academic_content.settings.manage')
  @ApiOperation({ summary: 'Update School Academic Content file policy' })
  @ApiBody({ type: UpdateAcademicContentFilePolicyDto })
  @ApiOkResponse({ type: AcademicContentFilePolicyResponseDto })
  async update(
    @Body() dto: UpdateAcademicContentFilePolicyDto,
  ): Promise<AcademicContentFilePolicyResponseDto> {
    return presentAcademicContentFilePolicy(
      await this.updatePolicy.execute(dto),
    );
  }
}
