import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { TeacherAppAllocationReadAdapter } from '../../access/teacher-app-allocation-read.adapter';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import { TeacherXpStudentResponseDto } from '../dto/teacher-xp.dto';
import { TeacherXpReadAdapter } from '../infrastructure/teacher-xp-read.adapter';
import { TeacherXpPresenter } from '../presenters/teacher-xp.presenter';

@Injectable()
export class GetTeacherStudentXpUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly allocationReadAdapter: TeacherAppAllocationReadAdapter,
    private readonly xpReadAdapter: TeacherXpReadAdapter,
  ) {}

  async execute(studentId: string): Promise<TeacherXpStudentResponseDto> {
    const context = this.accessService.assertCurrentTeacher();
    const allocations =
      await this.allocationReadAdapter.listAllOwnedAllocations(
        context.teacherUserId,
      );
    const ownedEnrollments = await this.xpReadAdapter.listOwnedEnrollments({
      allocations,
      studentId,
    });

    if (ownedEnrollments.length === 0) {
      throw new NotFoundDomainException('Teacher XP student not found', {
        studentId,
      });
    }

    const ledger = await this.xpReadAdapter.listAllLedger({
      ownedEnrollments,
      filters: { studentId },
    });

    return TeacherXpPresenter.presentStudent({
      studentId,
      ownedEnrollments,
      ledger,
    });
  }
}
