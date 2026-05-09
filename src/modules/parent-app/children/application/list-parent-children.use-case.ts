import { Injectable } from '@nestjs/common';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentAppChildNotFoundException } from '../../shared/parent-app-errors';
import { ParentChildrenListResponseDto } from '../dto/parent-children.dto';
import { ParentChildrenReadAdapter } from '../infrastructure/parent-children-read.adapter';
import { ParentChildrenPresenter } from '../presenters/parent-children.presenter';

@Injectable()
export class ListParentChildrenUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly readAdapter: ParentChildrenReadAdapter,
  ) {}

  async execute(): Promise<ParentChildrenListResponseDto> {
    const context = await this.accessService.getParentAppContext();
    const children = await this.readAdapter.listChildren(context);

    if (children.length !== context.children.length) {
      throw new ParentAppChildNotFoundException({
        reason: 'parent_children_details_missing',
      });
    }

    return ParentChildrenPresenter.presentList(children);
  }
}
