import { Module } from '@nestjs/common';
import { GetOverviewUseCase } from './application/get-overview.use-case';
import { OverviewController } from './controller/overview.controller';
import { OverviewRepository } from './infrastructure/overview.repository';

@Module({
  controllers: [OverviewController],
  providers: [OverviewRepository, GetOverviewUseCase],
})
export class OverviewModule {}
