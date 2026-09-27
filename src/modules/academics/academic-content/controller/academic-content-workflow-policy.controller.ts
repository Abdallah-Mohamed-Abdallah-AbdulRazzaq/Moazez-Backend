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
import {
  GetAcademicContentWorkflowPolicyUseCase,
  UpdateAcademicContentWorkflowPolicyUseCase,
} from '../application/academic-content-workflow-policy.use-cases';
import {
  AcademicContentWorkflowPolicyResponseDto,
  UpdateAcademicContentWorkflowPolicyDto,
} from '../dto/academic-content-workflow-policy.dto';

@ApiTags('academics-academic-content')
@ApiBearerAuth()
@SchoolManagementOnly()
@Controller('academics/academic-content/settings')
export class AcademicContentWorkflowPolicyController {
  constructor(
    private readonly getPolicy: GetAcademicContentWorkflowPolicyUseCase,
    private readonly updatePolicy: UpdateAcademicContentWorkflowPolicyUseCase,
  ) {}

  @Get('workflow-policy')
  @RequiredPermissions('academics.academic_content.view')
  @ApiOperation({
    summary: 'Get effective School Academic Content workflow policy',
  })
  @ApiOkResponse({ type: AcademicContentWorkflowPolicyResponseDto })
  get(): Promise<AcademicContentWorkflowPolicyResponseDto> {
    return this.getPolicy.execute();
  }

  @Patch('workflow-policy')
  @RequiredPermissions('academics.academic_content.settings.manage')
  @ApiOperation({ summary: 'Update School Academic Content workflow policy' })
  @ApiBody({ type: UpdateAcademicContentWorkflowPolicyDto })
  @ApiOkResponse({ type: AcademicContentWorkflowPolicyResponseDto })
  update(
    @Body() dto: UpdateAcademicContentWorkflowPolicyDto,
  ): Promise<AcademicContentWorkflowPolicyResponseDto> {
    return this.updatePolicy.execute(dto);
  }
}
