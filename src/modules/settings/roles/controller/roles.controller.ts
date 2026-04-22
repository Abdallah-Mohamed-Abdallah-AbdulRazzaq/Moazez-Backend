import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { CloneRoleUseCase } from '../application/clone-role.use-case';
import { CreateRoleUseCase } from '../application/create-role.use-case';
import { DeleteRoleUseCase } from '../application/delete-role.use-case';
import { ListRolesUseCase } from '../application/list-roles.use-case';
import { ReplaceRolePermissionsUseCase } from '../application/replace-role-permissions.use-case';
import { UpdateRoleUseCase } from '../application/update-role.use-case';
import { CloneRoleDto } from '../dto/clone-role.dto';
import { CreateRoleDto } from '../dto/create-role.dto';
import {
  DeleteRoleResponseDto,
  RolePermissionsResponseDto,
  RoleResponseDto,
} from '../dto/role-response.dto';
import { UpdateRolePermissionsDto } from '../dto/update-role-permissions.dto';
import { UpdateRoleDto } from '../dto/update-role.dto';

@ApiTags('settings-roles')
@ApiBearerAuth()
@Controller('settings/roles')
export class RolesController {
  constructor(
    private readonly listRolesUseCase: ListRolesUseCase,
    private readonly createRoleUseCase: CreateRoleUseCase,
    private readonly cloneRoleUseCase: CloneRoleUseCase,
    private readonly updateRoleUseCase: UpdateRoleUseCase,
    private readonly deleteRoleUseCase: DeleteRoleUseCase,
    private readonly replaceRolePermissionsUseCase: ReplaceRolePermissionsUseCase,
  ) {}

  @Get()
  @RequiredPermissions('settings.roles.view')
  listRoles(): Promise<RoleResponseDto[]> {
    return this.listRolesUseCase.execute();
  }

  @Post()
  @RequiredPermissions('settings.roles.manage')
  createRole(@Body() dto: CreateRoleDto): Promise<RoleResponseDto> {
    return this.createRoleUseCase.execute(dto);
  }

  @Post(':id/clone')
  @RequiredPermissions('settings.roles.manage')
  cloneRole(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CloneRoleDto,
  ): Promise<RoleResponseDto> {
    return this.cloneRoleUseCase.execute(id, dto);
  }

  @Patch(':id')
  @RequiredPermissions('settings.roles.manage')
  updateRole(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateRoleDto,
  ): Promise<RoleResponseDto> {
    return this.updateRoleUseCase.execute(id, dto);
  }

  @Delete(':id')
  @RequiredPermissions('settings.roles.manage')
  deleteRole(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<DeleteRoleResponseDto> {
    return this.deleteRoleUseCase.execute(id);
  }

  @Put(':id/permissions')
  @RequiredPermissions('settings.roles.manage')
  replaceRolePermissions(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateRolePermissionsDto,
  ): Promise<RolePermissionsResponseDto> {
    return this.replaceRolePermissionsUseCase.execute(id, dto);
  }
}
