import { Module } from '@nestjs/common';
import { DisciplineDerivedReadService } from './application/discipline-derived-read.service';
import { DisciplineDerivedRepository } from './infrastructure/discipline-derived.repository';

@Module({
  providers: [DisciplineDerivedReadService, DisciplineDerivedRepository],
  exports: [DisciplineDerivedReadService],
})
export class DisciplineModule {}
