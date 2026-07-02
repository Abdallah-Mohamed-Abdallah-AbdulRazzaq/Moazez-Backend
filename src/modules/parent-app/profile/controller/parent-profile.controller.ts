import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { GetParentProfileUseCase } from '../application/get-parent-profile.use-case';
import { ParentProfileResponseDto } from '../dto/parent-profile.dto';

@ApiTags('parent-app')
@ApiBearerAuth()
@Controller('parent/profile')
export class ParentProfileController {
  constructor(
    private readonly getParentProfileUseCase: GetParentProfileUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: ParentProfileResponseDto })
  @RequiredPermissions('parent.profile.view')
  getProfile(): Promise<ParentProfileResponseDto> {
    return this.getParentProfileUseCase.execute();
  }
}
