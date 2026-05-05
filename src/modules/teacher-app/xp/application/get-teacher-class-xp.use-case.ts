import { Injectable } from '@nestjs/common';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import { TeacherXpClassResponseDto } from '../dto/teacher-xp.dto';
import { TeacherXpReadAdapter } from '../infrastructure/teacher-xp-read.adapter';
import { TeacherXpPresenter } from '../presenters/teacher-xp.presenter';

@Injectable()
export class GetTeacherClassXpUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly xpReadAdapter: TeacherXpReadAdapter,
  ) {}

  async execute(classId: string): Promise<TeacherXpClassResponseDto> {
    this.accessService.assertCurrentTeacher();
    const allocation =
      await this.accessService.assertTeacherOwnsAllocation(classId);
    const ownedEnrollments = await this.xpReadAdapter.listOwnedEnrollments({
      allocations: [allocation],
    });
    const ledger = await this.xpReadAdapter.listAllLedger({
      ownedEnrollments,
    });

    return TeacherXpPresenter.presentClass({
      allocation,
      ownedEnrollments,
      ledger,
    });
  }
}
