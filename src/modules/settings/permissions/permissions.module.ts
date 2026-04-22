import { Module } from '@nestjs/common';
import { ListPermissionsUseCase } from './application/list-permissions.use-case';
import { PermissionsController } from './controller/permissions.controller';
import { PermissionsRepository } from './infrastructure/permissions.repository';

@Module({
  controllers: [PermissionsController],
  providers: [PermissionsRepository, ListPermissionsUseCase],
})
export class PermissionsModule {}
