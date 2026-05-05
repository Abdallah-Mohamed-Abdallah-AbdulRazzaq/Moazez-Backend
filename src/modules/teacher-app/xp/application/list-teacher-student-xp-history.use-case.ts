import { Injectable } from '@nestjs/common';
import { XpSourceType } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { TeacherAppAllocationReadAdapter } from '../../access/teacher-app-allocation-read.adapter';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import {
  TeacherXpHistoryQueryDto,
  TeacherXpHistoryResponseDto,
  TeacherXpHistorySourceQueryValue,
} from '../dto/teacher-xp.dto';
import { TeacherXpReadAdapter } from '../infrastructure/teacher-xp-read.adapter';
import { TeacherXpPresenter } from '../presenters/teacher-xp.presenter';

const SOURCE_FILTERS: Record<TeacherXpHistorySourceQueryValue, XpSourceType> = {
  [TeacherXpHistorySourceQueryValue.REINFORCEMENT_TASK]:
    XpSourceType.REINFORCEMENT_TASK,
  [TeacherXpHistorySourceQueryValue.HERO_MISSION]: XpSourceType.HERO_MISSION,
  [TeacherXpHistorySourceQueryValue.MANUAL_BONUS]: XpSourceType.MANUAL_BONUS,
  [TeacherXpHistorySourceQueryValue.BEHAVIOR]: XpSourceType.BEHAVIOR,
  [TeacherXpHistorySourceQueryValue.GRADE]: XpSourceType.GRADE,
  [TeacherXpHistorySourceQueryValue.ATTENDANCE]: XpSourceType.ATTENDANCE,
  [TeacherXpHistorySourceQueryValue.SYSTEM]: XpSourceType.SYSTEM,
};

@Injectable()
export class ListTeacherStudentXpHistoryUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly allocationReadAdapter: TeacherAppAllocationReadAdapter,
    private readonly xpReadAdapter: TeacherXpReadAdapter,
  ) {}

  async execute(
    studentId: string,
    query: TeacherXpHistoryQueryDto,
  ): Promise<TeacherXpHistoryResponseDto> {
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

    const result = await this.xpReadAdapter.listLedger({
      ownedEnrollments,
      filters: {
        studentId,
        sourceType: query.source ? SOURCE_FILTERS[query.source] : undefined,
        search: query.search,
        page: query.page,
        limit: query.limit,
      },
    });

    return TeacherXpPresenter.presentHistory({
      studentId,
      ledger: result.items,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
      },
    });
  }
}
