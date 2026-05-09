import { Injectable } from '@nestjs/common';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentProgressOverviewResponseDto } from '../dto/parent-progress.dto';
import { ParentProgressReadAdapter } from '../infrastructure/parent-progress-read.adapter';
import { ParentProgressPresenter } from '../presenters/parent-progress.presenter';

@Injectable()
export class GetParentChildProgressUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly readAdapter: ParentProgressReadAdapter,
  ) {}

  async execute(studentId: string): Promise<ParentProgressOverviewResponseDto> {
    const child = await this.accessService.assertParentOwnsStudent(studentId);
    const result = await this.readAdapter.getProgressOverview(child);

    return ParentProgressPresenter.presentOverview(result);
  }
}
