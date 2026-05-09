import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentBehaviorRecordResponseDto } from '../dto/parent-behavior.dto';
import { ParentBehaviorReadAdapter } from '../infrastructure/parent-behavior-read.adapter';
import { ParentBehaviorPresenter } from '../presenters/parent-behavior.presenter';

@Injectable()
export class GetParentChildBehaviorRecordUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly readAdapter: ParentBehaviorReadAdapter,
  ) {}

  async execute(
    studentId: string,
    recordId: string,
  ): Promise<ParentBehaviorRecordResponseDto> {
    const child = await this.accessService.assertParentOwnsStudent(studentId);
    const result = await this.readAdapter.findVisibleBehaviorRecord({
      child,
      recordId,
    });

    if (!result) {
      throw new NotFoundDomainException(
        'Parent App behavior record not found',
        {
          studentId,
          recordId,
        },
      );
    }

    return ParentBehaviorPresenter.presentRecord(result);
  }
}
