import { Injectable } from '@nestjs/common';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentAcademicProgressResponseDto } from '../dto/parent-progress.dto';
import { ParentProgressReadAdapter } from '../infrastructure/parent-progress-read.adapter';
import { ParentProgressPresenter } from '../presenters/parent-progress.presenter';

@Injectable()
export class GetParentChildAcademicProgressUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly readAdapter: ParentProgressReadAdapter,
  ) {}

  async execute(studentId: string): Promise<ParentAcademicProgressResponseDto> {
    const child = await this.accessService.assertParentOwnsStudent(studentId);
    const result = await this.readAdapter.getAcademicProgress(child);

    return ParentProgressPresenter.presentAcademic(result);
  }
}
