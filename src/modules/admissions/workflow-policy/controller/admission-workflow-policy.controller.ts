import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { GetAdmissionWorkflowPolicyUseCase } from '../application/get-admission-workflow-policy.use-case';
import { UpdateAdmissionWorkflowPolicyUseCase } from '../application/update-admission-workflow-policy.use-case';
import {
  AdmissionWorkflowPolicyResponseDto,
  UpdateAdmissionWorkflowPolicyDto,
} from '../dto/admission-workflow-policy.dto';

@ApiTags('admissions-workflow-policy')
@ApiBearerAuth()
@Controller('admissions/workflow-policy')
export class AdmissionWorkflowPolicyController {
  constructor(
    private readonly getAdmissionWorkflowPolicyUseCase: GetAdmissionWorkflowPolicyUseCase,
    private readonly updateAdmissionWorkflowPolicyUseCase: UpdateAdmissionWorkflowPolicyUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: AdmissionWorkflowPolicyResponseDto })
  @RequiredPermissions('admissions.applications.view')
  getPolicy(): Promise<AdmissionWorkflowPolicyResponseDto> {
    return this.getAdmissionWorkflowPolicyUseCase.execute();
  }

  @Patch()
  @ApiOkResponse({ type: AdmissionWorkflowPolicyResponseDto })
  @RequiredPermissions('admissions.applications.manage')
  updatePolicy(
    @Body() dto: UpdateAdmissionWorkflowPolicyDto,
  ): Promise<AdmissionWorkflowPolicyResponseDto> {
    return this.updateAdmissionWorkflowPolicyUseCase.execute(dto);
  }
}
