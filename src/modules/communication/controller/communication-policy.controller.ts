import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../common/decorators/required-permissions.decorator';
import {
  GetCommunicationAdminOverviewUseCase,
  GetCommunicationPolicyUseCase,
  UpdateCommunicationPolicyUseCase,
} from '../application/communication-policy.use-cases';
import { UpdateCommunicationPolicyDto } from '../dto/communication-policy.dto';
import { CommunicationCoreAccessGuard } from '../guards/communication-core-access.guard';

@ApiTags('communication')
@ApiBearerAuth()
@UseGuards(CommunicationCoreAccessGuard)
@Controller('communication')
export class CommunicationPolicyController {
  constructor(
    private readonly getCommunicationPolicyUseCase: GetCommunicationPolicyUseCase,
    private readonly updateCommunicationPolicyUseCase: UpdateCommunicationPolicyUseCase,
    private readonly getCommunicationAdminOverviewUseCase: GetCommunicationAdminOverviewUseCase,
  ) {}

  @Get('policies')
  @RequiredPermissions('communication.policies.view')
  getPolicy() {
    return this.getCommunicationPolicyUseCase.execute();
  }

  @Patch('policies')
  @RequiredPermissions('communication.policies.manage')
  updatePolicy(@Body() dto: UpdateCommunicationPolicyDto) {
    return this.updateCommunicationPolicyUseCase.execute(dto);
  }

  @Get('admin/overview')
  @RequiredPermissions('communication.admin.view')
  getAdminOverview() {
    return this.getCommunicationAdminOverviewUseCase.execute();
  }
}
