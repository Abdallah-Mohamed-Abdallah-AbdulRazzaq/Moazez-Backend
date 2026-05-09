import { Injectable } from '@nestjs/common';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import {
  ParentBehaviorListResponseDto,
  ParentBehaviorQueryDto,
} from '../dto/parent-behavior.dto';
import { ParentBehaviorReadAdapter } from '../infrastructure/parent-behavior-read.adapter';
import { ParentBehaviorPresenter } from '../presenters/parent-behavior.presenter';

@Injectable()
export class ListParentChildBehaviorUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly readAdapter: ParentBehaviorReadAdapter,
  ) {}

  async execute(
    studentId: string,
    query?: ParentBehaviorQueryDto,
  ): Promise<ParentBehaviorListResponseDto> {
    const child = await this.accessService.assertParentOwnsStudent(studentId);
    const result = await this.readAdapter.listVisibleBehaviorRecords({
      child,
      query,
    });

    return ParentBehaviorPresenter.presentList(result);
  }
}
