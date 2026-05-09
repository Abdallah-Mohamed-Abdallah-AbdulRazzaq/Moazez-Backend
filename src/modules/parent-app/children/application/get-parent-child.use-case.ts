import { Injectable } from '@nestjs/common';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentAppChildNotFoundException } from '../../shared/parent-app-errors';
import { ParentChildDetailResponseDto } from '../dto/parent-children.dto';
import { ParentChildrenReadAdapter } from '../infrastructure/parent-children-read.adapter';
import { ParentChildrenPresenter } from '../presenters/parent-children.presenter';

@Injectable()
export class GetParentChildUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly readAdapter: ParentChildrenReadAdapter,
  ) {}

  async execute(studentId: string): Promise<ParentChildDetailResponseDto> {
    const accessibleChild =
      await this.accessService.assertParentOwnsStudent(studentId);
    const child = await this.readAdapter.findChild(accessibleChild);

    if (!child) {
      throw new ParentAppChildNotFoundException({
        studentId,
        reason: 'parent_child_details_missing',
      });
    }

    return ParentChildrenPresenter.presentDetail(child);
  }
}
