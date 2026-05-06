import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentSubjectDetailResponseDto } from '../dto/student-subjects.dto';
import { StudentSubjectsReadAdapter } from '../infrastructure/student-subjects-read.adapter';
import { StudentSubjectsPresenter } from '../presenters/student-subjects.presenter';

@Injectable()
export class GetStudentSubjectUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentSubjectsReadAdapter,
  ) {}

  async execute(subjectId: string): Promise<StudentSubjectDetailResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const allocation = await this.readAdapter.findCurrentSubject({
      context,
      subjectId,
    });

    if (!allocation) {
      throw new NotFoundDomainException('Student App subject not found', {
        subjectId,
      });
    }

    const statsBySubjectId = await this.readAdapter.summarizeSubjectGrades({
      context,
      subjectIds: [allocation.subjectId],
      classroom: allocation.classroom,
    });

    return StudentSubjectsPresenter.presentDetail({
      allocation,
      statsBySubjectId,
    });
  }
}
