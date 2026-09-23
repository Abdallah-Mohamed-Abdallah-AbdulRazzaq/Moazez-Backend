import { Module } from '@nestjs/common';
import { AcademicContentAudienceResolver } from './application/academic-content-audience.resolver';
import { AcademicContentContextValidator } from './application/academic-content-context-validator';
import { AcademicContentTargetValidator } from './application/academic-content-target-validator';
import { CreateAcademicContentUseCase } from './application/create-academic-content.use-case';
import { ReplaceAcademicContentTargetsUseCase } from './application/replace-academic-content-targets.use-case';
import { AcademicContentAudienceRepository } from './infrastructure/academic-content-audience.repository';
import { AcademicContentRepository } from './infrastructure/academic-content.repository';

@Module({
  providers: [
    AcademicContentRepository,
    AcademicContentAudienceRepository,
    AcademicContentContextValidator,
    AcademicContentTargetValidator,
    CreateAcademicContentUseCase,
    ReplaceAcademicContentTargetsUseCase,
    AcademicContentAudienceResolver,
  ],
  exports: [
    CreateAcademicContentUseCase,
    ReplaceAcademicContentTargetsUseCase,
    AcademicContentAudienceResolver,
  ],
})
export class AcademicContentModule {}
