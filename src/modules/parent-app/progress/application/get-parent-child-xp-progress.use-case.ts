import { Injectable } from '@nestjs/common';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentXpProgressResponseDto } from '../dto/parent-progress.dto';
import { ParentProgressReadAdapter } from '../infrastructure/parent-progress-read.adapter';
import { ParentProgressPresenter } from '../presenters/parent-progress.presenter';

@Injectable()
export class GetParentChildXpProgressUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly readAdapter: ParentProgressReadAdapter,
  ) {}

  async execute(studentId: string): Promise<ParentXpProgressResponseDto> {
    const child = await this.accessService.assertParentOwnsStudent(studentId);
    const result = await this.readAdapter.getXpProgress(child);

    return ParentProgressPresenter.presentXp(result);
  }
}
