import { Module } from '@nestjs/common';
import { ParentAppAccessService } from './access/parent-app-access.service';
import { ParentAppGuardianReadAdapter } from './access/parent-app-guardian-read.adapter';
import { GetParentChildUseCase } from './children/application/get-parent-child.use-case';
import { ListParentChildrenUseCase } from './children/application/list-parent-children.use-case';
import { ParentChildrenController } from './children/controller/parent-children.controller';
import { ParentChildrenReadAdapter } from './children/infrastructure/parent-children-read.adapter';
import { GetParentHomeUseCase } from './home/application/get-parent-home.use-case';
import { ParentHomeController } from './home/controller/parent-home.controller';
import { ParentHomeReadAdapter } from './home/infrastructure/parent-home-read.adapter';
import { GetParentProfileUseCase } from './profile/application/get-parent-profile.use-case';
import { ParentProfileController } from './profile/controller/parent-profile.controller';
import { ParentProfileReadAdapter } from './profile/infrastructure/parent-profile-read.adapter';

@Module({
  controllers: [
    ParentHomeController,
    ParentChildrenController,
    ParentProfileController,
  ],
  providers: [
    ParentAppAccessService,
    ParentAppGuardianReadAdapter,
    ParentHomeReadAdapter,
    GetParentHomeUseCase,
    ParentChildrenReadAdapter,
    ListParentChildrenUseCase,
    GetParentChildUseCase,
    ParentProfileReadAdapter,
    GetParentProfileUseCase,
  ],
  exports: [ParentAppAccessService],
})
export class ParentAppModule {}
