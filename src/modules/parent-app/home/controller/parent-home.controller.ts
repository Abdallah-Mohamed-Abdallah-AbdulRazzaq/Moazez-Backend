import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { GetParentHomeUseCase } from '../application/get-parent-home.use-case';
import { ParentHomeResponseDto } from '../dto/parent-home.dto';

@ApiTags('parent-app')
@ApiBearerAuth()
@Controller('parent')
export class ParentHomeController {
  constructor(private readonly getParentHomeUseCase: GetParentHomeUseCase) {}

  @Get('home')
  @ApiOkResponse({ type: ParentHomeResponseDto })
  @RequiredPermissions('parent.home.view')
  getHome(): Promise<ParentHomeResponseDto> {
    return this.getParentHomeUseCase.execute();
  }
}
