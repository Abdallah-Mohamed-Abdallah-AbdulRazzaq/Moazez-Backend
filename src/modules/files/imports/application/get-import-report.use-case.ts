import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { ImportJobReportResponseDto } from '../dto/create-import-job.dto';
import { ImportJobsRepository } from '../infrastructure/import-jobs.repository';
import { requireImportsScope } from '../imports-scope';
import { presentImportJobReport } from '../presenters/import-job.presenter';

@Injectable()
export class GetImportReportUseCase {
  constructor(
    private readonly importJobsRepository: ImportJobsRepository,
  ) {}

  async execute(importJobId: string): Promise<ImportJobReportResponseDto> {
    requireImportsScope();

    const importJob = await this.importJobsRepository.findScopedImportJobById(
      importJobId,
    );
    if (!importJob) {
      throw new NotFoundDomainException('Import job not found', { importJobId });
    }

    return presentImportJobReport(importJob);
  }
}
