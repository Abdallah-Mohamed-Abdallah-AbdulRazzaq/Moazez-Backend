import { MODULE_METADATA } from '@nestjs/common/constants';
import { AcademicContentStatus, AcademicContentType } from '@prisma/client';
import { AcademicsModule } from '../../academics.module';
import { AcademicContentModule } from '../academic-content.module';
import { AcademicContentRepository } from '../infrastructure/academic-content.repository';
import { AcademicContentAudienceResolver } from '../application/academic-content-audience.resolver';
import { ReplaceAcademicContentTargetsUseCase } from '../application/replace-academic-content-targets.use-case';

describe('Academic Content foundation', () => {
  it('keeps the V1 content type contract exact', () => {
    expect(Object.values(AcademicContentType)).toEqual([
      'TEACHER_PREPARATION',
      'WEEKLY_PLAN',
      'GUARDIAN_WEEKLY_NOTE',
      'SUBJECT_RESOURCE',
      'ONLINE_SESSION',
      'GENERAL_RESOURCE',
    ]);
  });

  it('reserves the complete lifecycle vocabulary while ACC-4A activates draft and archive', () => {
    expect(Object.values(AcademicContentStatus)).toEqual([
      'DRAFT',
      'SUBMITTED',
      'CHANGES_REQUESTED',
      'APPROVED',
      'SCHEDULED',
      'PUBLISHED',
      'EXPIRED',
      'ARCHIVED',
      'CANCELLED',
    ]);
  });

  it('wires a provider-only AcademicContentModule into AcademicsModule', () => {
    const academicsImports = moduleMetadata(
      MODULE_METADATA.IMPORTS,
      AcademicsModule,
    );
    const providers = moduleMetadata(
      MODULE_METADATA.PROVIDERS,
      AcademicContentModule,
    );
    const controllers = moduleMetadata(
      MODULE_METADATA.CONTROLLERS,
      AcademicContentModule,
    );
    const exports = moduleMetadata(
      MODULE_METADATA.EXPORTS,
      AcademicContentModule,
    );

    expect(academicsImports).toContain(AcademicContentModule);
    expect(providers).toContain(AcademicContentRepository);
    expect(providers).toContain(AcademicContentAudienceResolver);
    expect(providers).toContain(ReplaceAcademicContentTargetsUseCase);
    expect(controllers).toEqual([]);
    expect(exports).toContain(AcademicContentAudienceResolver);
  });
});

function moduleMetadata(metadataKey: string, target: object): unknown[] {
  const metadata: unknown = Reflect.getMetadata(metadataKey, target);
  return Array.isArray(metadata) ? metadata : [];
}
