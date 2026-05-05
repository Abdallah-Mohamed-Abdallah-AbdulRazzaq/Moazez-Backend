import { Injectable } from '@nestjs/common';
import { TeacherAppAllocationReadAdapter } from '../../access/teacher-app-allocation-read.adapter';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import { TeacherXpDashboardResponseDto } from '../dto/teacher-xp.dto';
import { TeacherXpReadAdapter } from '../infrastructure/teacher-xp-read.adapter';
import { TeacherXpPresenter } from '../presenters/teacher-xp.presenter';

@Injectable()
export class GetTeacherXpDashboardUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly allocationReadAdapter: TeacherAppAllocationReadAdapter,
    private readonly xpReadAdapter: TeacherXpReadAdapter,
  ) {}

  async execute(): Promise<TeacherXpDashboardResponseDto> {
    const context = this.accessService.assertCurrentTeacher();
    const allocations =
      await this.allocationReadAdapter.listAllOwnedAllocations(
        context.teacherUserId,
      );
    const ownedEnrollments = await this.xpReadAdapter.listOwnedEnrollments({
      allocations,
    });
    const ledger = await this.xpReadAdapter.listAllLedger({
      ownedEnrollments,
    });

    return TeacherXpPresenter.presentDashboard({
      allocations,
      ownedEnrollments,
      ledger,
    });
  }
}
