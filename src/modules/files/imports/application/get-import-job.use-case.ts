import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { ImportJobStatusResponseDto } from '../dto/create-import-job.dto';
import { ImportJobsRepository } from '../infrastructure/import-jobs.repository';
import { requireImportsScope } from '../imports-scope';
import { presentImportJobStatus } from '../presenters/import-job.presenter';

@Injectable()
export class GetImportJobUseCase {
  constructor(
    private readonly importJobsRepository: ImportJobsRepository,
  ) {}

  async execute(importJobId: string): Promise<ImportJobStatusResponseDto> {
    requireImportsScope();

    const importJob = await this.importJobsRepository.findScopedImportJobById(
      importJobId,
    );
    if (!importJob) {
      throw new NotFoundDomainException('Import job not found', { importJobId });
    }

    return presentImportJobStatus(importJob);
  }
}
