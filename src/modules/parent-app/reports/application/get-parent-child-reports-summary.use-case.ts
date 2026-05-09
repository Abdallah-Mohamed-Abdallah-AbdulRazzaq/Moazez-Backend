import { Injectable } from '@nestjs/common';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentReportsSummaryResponseDto } from '../dto/parent-reports.dto';
import { ParentReportsReadAdapter } from '../infrastructure/parent-reports-read.adapter';
import { ParentReportsPresenter } from '../presenters/parent-reports.presenter';

@Injectable()
export class GetParentChildReportsSummaryUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly readAdapter: ParentReportsReadAdapter,
  ) {}

  async execute(studentId: string): Promise<ParentReportsSummaryResponseDto> {
    const child = await this.accessService.assertParentOwnsStudent(studentId);
    const result = await this.readAdapter.getReportsSummary(child);

    return ParentReportsPresenter.presentSummary(result);
  }
}
