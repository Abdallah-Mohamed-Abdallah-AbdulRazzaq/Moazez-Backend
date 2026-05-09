import { Injectable } from '@nestjs/common';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentReportsListResponseDto } from '../dto/parent-reports.dto';
import { ParentReportsReadAdapter } from '../infrastructure/parent-reports-read.adapter';
import { ParentReportsPresenter } from '../presenters/parent-reports.presenter';

@Injectable()
export class ListParentChildReportsUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly readAdapter: ParentReportsReadAdapter,
  ) {}

  async execute(studentId: string): Promise<ParentReportsListResponseDto> {
    const child = await this.accessService.assertParentOwnsStudent(studentId);
    const result = await this.readAdapter.listReports(child);

    return ParentReportsPresenter.presentList(result);
  }
}
