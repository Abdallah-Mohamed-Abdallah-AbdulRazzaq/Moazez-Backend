import { Module } from '@nestjs/common';
import { ApplicationsModule } from '../applications/applications.module';
import { CreatePlacementTestUseCase } from './application/create-placement-test.use-case';
import { GetPlacementTestUseCase } from './application/get-placement-test.use-case';
import { ListPlacementTestsUseCase } from './application/list-placement-tests.use-case';
import { UpdatePlacementTestUseCase } from './application/update-placement-test.use-case';
import { PlacementTestsController } from './controller/placement-tests.controller';
import { PlacementTestsRepository } from './infrastructure/placement-tests.repository';
import { PlacementTestScheduleValidator } from './validators/placement-test-schedule.validator';

@Module({
  imports: [ApplicationsModule],
  controllers: [PlacementTestsController],
  providers: [
    PlacementTestsRepository,
    PlacementTestScheduleValidator,
    ListPlacementTestsUseCase,
    CreatePlacementTestUseCase,
    GetPlacementTestUseCase,
    UpdatePlacementTestUseCase,
  ],
})
export class AdmissionsTestsModule {}
