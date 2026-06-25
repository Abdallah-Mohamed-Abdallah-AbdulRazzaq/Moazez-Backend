import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { ListPermissionsUseCase } from '../application/list-permissions.use-case';
import { PermissionResponseDto } from '../dto/permission-response.dto';

@ApiTags('settings-permissions')
@ApiBearerAuth()
@Controller('settings/permissions')
export class PermissionsController {
  constructor(
    private readonly listPermissionsUseCase: ListPermissionsUseCase,
  ) {}

  @Get()
  @RequiredPermissions('settings.permissions.view')
  listPermissions(): Promise<PermissionResponseDto[]> {
    return this.listPermissionsUseCase.execute();
  }
}
