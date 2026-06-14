import { Module } from '@nestjs/common';
import { GetAcademicsOverviewUseCase } from './application/get-academics-overview.use-case';
import { AcademicsOverviewController } from './controller/academics-overview.controller';
import { AcademicsOverviewRepository } from './infrastructure/academics-overview.repository';

@Module({
  controllers: [AcademicsOverviewController],
  providers: [AcademicsOverviewRepository, GetAcademicsOverviewUseCase],
})
export class OverviewModule {}
