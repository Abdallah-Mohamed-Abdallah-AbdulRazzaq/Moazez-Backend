import { Module } from '@nestjs/common';
import { AuthModule } from '../../iam/auth/auth.module';
import { CreateRoleUseCase } from './application/create-role.use-case';
import { DeleteRoleUseCase } from './application/delete-role.use-case';
import { CloneRoleUseCase } from './application/clone-role.use-case';
import { ListRolesUseCase } from './application/list-roles.use-case';
import { ReplaceRolePermissionsUseCase } from './application/replace-role-permissions.use-case';
import { UpdateRoleUseCase } from './application/update-role.use-case';
import { RolesController } from './controller/roles.controller';
import { RolesRepository } from './infrastructure/roles.repository';

@Module({
  imports: [AuthModule],
  controllers: [RolesController],
  providers: [
    RolesRepository,
    ListRolesUseCase,
    CreateRoleUseCase,
    CloneRoleUseCase,
    UpdateRoleUseCase,
    DeleteRoleUseCase,
    ReplaceRolePermissionsUseCase,
  ],
})
export class RolesModule {}
