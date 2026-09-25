import { Injectable } from '@nestjs/common';
import { ValidationDomainException } from '../../../../../common/exceptions/domain-exception';
import { academicContentManagementScope } from '../../application/academic-content-management.scope';
import { ACADEMIC_CONTENT_PLATFORM_HARD_MAX_FILE_SIZE_BYTES } from '../domain/academic-content-file.constants';
import { AcademicContentEffectiveFilePolicy } from '../domain/academic-content-file-policy';
import { AcademicContentFileRepository } from '../infrastructure/academic-content-file.repository';
import { AcademicContentFilePolicyResolver } from './academic-content-file-policy.resolver';

export type AcademicContentFilePolicyPatch = Partial<
  Omit<AcademicContentEffectiveFilePolicy, 'maximumFileSizeBytes'>
> & { maximumFileSizeBytes?: string };

@Injectable()
export class GetAcademicContentFilePolicyUseCase {
  constructor(private readonly resolver: AcademicContentFilePolicyResolver) {}

  execute() {
    const { schoolId } = academicContentManagementScope(
      'academics.academic_content.view',
    );
    return this.resolver.resolve(schoolId);
  }
}

@Injectable()
export class UpdateAcademicContentFilePolicyUseCase {
  constructor(private readonly repository: AcademicContentFileRepository) {}

  execute(command: AcademicContentFilePolicyPatch) {
    const scope = academicContentManagementScope(
      'academics.academic_content.settings.manage',
    );
    const allowed = [
      'attachmentsEnabled',
      'maximumFileSizeBytes',
      'documentsEnabled',
      'imagesEnabled',
      'videosEnabled',
      'audioEnabled',
      'archivesEnabled',
      'otherFilesEnabled',
      'allowStudentDownload',
      'allowGuardianDownload',
      'allowInlinePreview',
    ];
    if (!command || Object.keys(command).some((key) => !allowed.includes(key)))
      throw new ValidationDomainException(
        'Invalid Academic Content file policy',
      );
    const { maximumFileSizeBytes, ...flags } = command;
    if (Object.values(flags).some((value) => typeof value !== 'boolean'))
      throw new ValidationDomainException(
        'Invalid Academic Content file policy',
      );
    let parsedSize: bigint | undefined;
    if (maximumFileSizeBytes !== undefined) {
      if (
        typeof maximumFileSizeBytes !== 'string' ||
        maximumFileSizeBytes.length > 11 ||
        !/^[1-9][0-9]*$/u.test(maximumFileSizeBytes)
      )
        throw new ValidationDomainException('Invalid maximum file size');
      parsedSize = BigInt(maximumFileSizeBytes);
      if (parsedSize > ACADEMIC_CONTENT_PLATFORM_HARD_MAX_FILE_SIZE_BYTES)
        throw new ValidationDomainException('Maximum file size exceeds 10 GiB');
    }
    return this.repository.updatePolicy({
      ...scope,
      changes: {
        ...flags,
        ...(parsedSize === undefined
          ? {}
          : { maximumFileSizeBytes: parsedSize }),
      },
    });
  }
}
