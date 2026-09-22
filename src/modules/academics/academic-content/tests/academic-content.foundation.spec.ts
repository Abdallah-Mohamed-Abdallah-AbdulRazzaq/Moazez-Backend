import { MODULE_METADATA } from '@nestjs/common/constants';
import { AcademicContentType } from '@prisma/client';
import { AcademicsModule } from '../../academics.module';
import { AcademicContentModule } from '../academic-content.module';
import { AcademicContentRepository } from '../infrastructure/academic-content.repository';

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
    expect(providers).toEqual([AcademicContentRepository]);
    expect(controllers).toEqual([]);
    expect(exports).toEqual([]);
  });
});

function moduleMetadata(metadataKey: string, target: object): unknown[] {
  const metadata: unknown = Reflect.getMetadata(metadataKey, target);
  return Array.isArray(metadata) ? metadata : [];
}
