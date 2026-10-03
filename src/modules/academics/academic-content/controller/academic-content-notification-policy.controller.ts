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
  GetAcademicContentNotificationPolicyUseCase,
  UpdateAcademicContentNotificationPolicyUseCase,
} from '../application/academic-content-notification-policy.use-cases';
import {
  AcademicContentNotificationPolicyResponseDto,
  UpdateAcademicContentNotificationPolicyDto,
} from '../dto/academic-content-notification-policy.dto';

@ApiTags('academics-academic-content')
@ApiBearerAuth()
@SchoolManagementOnly()
@Controller('academics/academic-content/settings')
export class AcademicContentNotificationPolicyController {
  constructor(
    private readonly getPolicy: GetAcademicContentNotificationPolicyUseCase,
    private readonly updatePolicy: UpdateAcademicContentNotificationPolicyUseCase,
  ) {}

  @Get('notification-policy')
  @RequiredPermissions('academics.academic_content.view')
  @ApiOperation({
    summary: 'Get effective School Academic Content notification policy',
  })
  @ApiOkResponse({ type: AcademicContentNotificationPolicyResponseDto })
  get(): Promise<AcademicContentNotificationPolicyResponseDto> {
    return this.getPolicy.execute();
  }

  @Patch('notification-policy')
  @RequiredPermissions('academics.academic_content.settings.manage')
  @ApiOperation({
    summary: 'Update School Academic Content notification policy',
  })
  @ApiBody({ type: UpdateAcademicContentNotificationPolicyDto })
  @ApiOkResponse({ type: AcademicContentNotificationPolicyResponseDto })
  update(
    @Body() dto: UpdateAcademicContentNotificationPolicyDto,
  ): Promise<AcademicContentNotificationPolicyResponseDto> {
    return this.updatePolicy.execute(dto);
  }
}
