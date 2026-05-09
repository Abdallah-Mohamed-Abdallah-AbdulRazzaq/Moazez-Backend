import { Injectable } from '@nestjs/common';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentBehaviorProgressResponseDto } from '../dto/parent-progress.dto';
import { ParentProgressReadAdapter } from '../infrastructure/parent-progress-read.adapter';
import { ParentProgressPresenter } from '../presenters/parent-progress.presenter';

@Injectable()
export class GetParentChildBehaviorProgressUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly readAdapter: ParentProgressReadAdapter,
  ) {}

  async execute(studentId: string): Promise<ParentBehaviorProgressResponseDto> {
    const child = await this.accessService.assertParentOwnsStudent(studentId);
    const result = await this.readAdapter.getBehaviorProgress(child);

    return ParentProgressPresenter.presentBehavior(result);
  }
}
