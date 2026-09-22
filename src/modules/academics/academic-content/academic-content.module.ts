import { Module } from '@nestjs/common';
import { AcademicContentRepository } from './infrastructure/academic-content.repository';

@Module({
  providers: [AcademicContentRepository],
})
export class AcademicContentModule {}
