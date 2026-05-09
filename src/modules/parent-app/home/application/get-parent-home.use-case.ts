import { Injectable } from '@nestjs/common';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import {
  ParentAppChildNotFoundException,
  ParentAppRequiredParentException,
} from '../../shared/parent-app-errors';
import { ParentHomeResponseDto } from '../dto/parent-home.dto';
import { ParentHomeReadAdapter } from '../infrastructure/parent-home-read.adapter';
import { ParentHomePresenter } from '../presenters/parent-home.presenter';

@Injectable()
export class GetParentHomeUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly readAdapter: ParentHomeReadAdapter,
  ) {}

  async execute(): Promise<ParentHomeResponseDto> {
    const context = await this.accessService.getParentAppContext();

    const [parent, school, children, pendingTaskCounts] = await Promise.all([
      this.readAdapter.findParentIdentity(context),
      this.readAdapter.findSchoolDisplay(context),
      this.readAdapter.listChildren(context),
      this.readAdapter.countPendingTasksForChildren(context),
    ]);

    if (!parent) {
      throw new ParentAppRequiredParentException({
        reason: 'parent_home_identity_missing',
      });
    }

    if (children.length !== context.children.length) {
      throw new ParentAppChildNotFoundException({
        reason: 'parent_home_child_details_missing',
      });
    }

    return ParentHomePresenter.present({
      parent,
      school,
      children,
      pendingTaskCounts,
    });
  }
}
