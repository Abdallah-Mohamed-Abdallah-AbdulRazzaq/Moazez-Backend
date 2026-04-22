import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
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
  listPermissions(): Promise<PermissionResponseDto[]> {
    return this.listPermissionsUseCase.execute();
  }
}
