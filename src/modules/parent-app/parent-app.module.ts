import { Module } from '@nestjs/common';
import { ParentAppAccessService } from './access/parent-app-access.service';
import { ParentAppGuardianReadAdapter } from './access/parent-app-guardian-read.adapter';

@Module({
  providers: [ParentAppAccessService, ParentAppGuardianReadAdapter],
  exports: [ParentAppAccessService],
})
export class ParentAppModule {}
