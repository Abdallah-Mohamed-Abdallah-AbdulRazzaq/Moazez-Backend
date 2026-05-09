import { Injectable } from '@nestjs/common';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import {
  ParentBehaviorQueryDto,
  ParentBehaviorSummaryResponseDto,
} from '../dto/parent-behavior.dto';
import { ParentBehaviorReadAdapter } from '../infrastructure/parent-behavior-read.adapter';
import { ParentBehaviorPresenter } from '../presenters/parent-behavior.presenter';

@Injectable()
export class GetParentChildBehaviorSummaryUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly readAdapter: ParentBehaviorReadAdapter,
  ) {}

  async execute(
    studentId: string,
    query?: ParentBehaviorQueryDto,
  ): Promise<ParentBehaviorSummaryResponseDto> {
    const child = await this.accessService.assertParentOwnsStudent(studentId);
    const summary = await this.readAdapter.getBehaviorSummary({
      child,
      query,
    });

    return ParentBehaviorPresenter.presentSummary({ child, summary });
  }
}
