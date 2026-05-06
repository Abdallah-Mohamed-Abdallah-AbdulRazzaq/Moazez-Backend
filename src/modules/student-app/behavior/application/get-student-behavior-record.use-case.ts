import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentBehaviorRecordResponseDto } from '../dto/student-behavior.dto';
import { StudentBehaviorReadAdapter } from '../infrastructure/student-behavior-read.adapter';
import { StudentBehaviorPresenter } from '../presenters/student-behavior.presenter';

@Injectable()
export class GetStudentBehaviorRecordUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentBehaviorReadAdapter,
  ) {}

  async execute(recordId: string): Promise<StudentBehaviorRecordResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const record = await this.readAdapter.findVisibleBehaviorRecord({
      context,
      recordId,
    });

    if (!record) {
      throw new NotFoundDomainException(
        'Student App behavior record not found',
        {
          recordId,
        },
      );
    }

    return StudentBehaviorPresenter.presentRecord(record);
  }
}
