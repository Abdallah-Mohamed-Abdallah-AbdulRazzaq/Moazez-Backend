import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import {
  GetHomeworkSubmissionUseCase as CoreGetHomeworkSubmissionUseCase,
  SaveHomeworkSubmissionDraftUseCase,
  SubmitHomeworkSubmissionUseCase as CoreSubmitHomeworkSubmissionUseCase,
} from '../../../homework/application/homework-submissions.use-cases';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import {
  StudentHomeworkSubmissionBodyDto,
  StudentHomeworkSubmissionResponseDto,
  StudentHomeworkSubmitBodyDto,
  StudentHomeworkResponseDto,
  StudentHomeworksListResponseDto,
  StudentHomeworksQueryDto,
} from '../dto/student-homeworks.dto';
import { StudentHomeworksReadAdapter } from '../infrastructure/student-homeworks-read.adapter';
import {
  presentStudentHomeworkSubmission,
  StudentHomeworksPresenter,
} from '../presenters/student-homeworks.presenter';

@Injectable()
export class ListStudentHomeworksUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentHomeworksReadAdapter,
  ) {}

  async execute(
    query?: StudentHomeworksQueryDto,
  ): Promise<StudentHomeworksListResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const homeworks = await this.readAdapter.listHomeworks({ context, query });

    return StudentHomeworksPresenter.presentList(homeworks);
  }
}

@Injectable()
export class GetStudentHomeworkUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentHomeworksReadAdapter,
  ) {}

  async execute(homeworkId: string): Promise<StudentHomeworkResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const homework = await this.readAdapter.findHomework({
      context,
      homeworkId,
    });

    if (!homework) {
      throw new NotFoundDomainException('Student App homework not found', {
        homeworkId,
      });
    }

    return StudentHomeworksPresenter.presentDetail(homework);
  }
}

@Injectable()
export class GetStudentHomeworkSubmissionUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly getHomeworkSubmissionUseCase: CoreGetHomeworkSubmissionUseCase,
  ) {}

  async execute(
    homeworkId: string,
  ): Promise<StudentHomeworkSubmissionResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const submission = await this.getHomeworkSubmissionUseCase.execute({
      homeworkId,
      studentId: context.studentId,
      enrollmentId: context.enrollmentId,
    });

    return {
      submission: submission
        ? presentStudentHomeworkSubmission(submission)
        : null,
    };
  }
}

@Injectable()
export class SaveStudentHomeworkSubmissionUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly saveHomeworkSubmissionDraftUseCase: SaveHomeworkSubmissionDraftUseCase,
  ) {}

  async execute(
    homeworkId: string,
    dto: StudentHomeworkSubmissionBodyDto,
  ): Promise<StudentHomeworkSubmissionResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const submission = await this.saveHomeworkSubmissionDraftUseCase.execute({
      homeworkId,
      studentId: context.studentId,
      enrollmentId: context.enrollmentId,
      bodyText: dto.bodyText,
    });

    return { submission: presentStudentHomeworkSubmission(submission) };
  }
}

@Injectable()
export class SubmitStudentHomeworkSubmissionUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly submitHomeworkSubmissionUseCase: CoreSubmitHomeworkSubmissionUseCase,
  ) {}

  async execute(
    homeworkId: string,
    dto: StudentHomeworkSubmitBodyDto,
  ): Promise<StudentHomeworkSubmissionResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const submission = await this.submitHomeworkSubmissionUseCase.execute({
      homeworkId,
      studentId: context.studentId,
      enrollmentId: context.enrollmentId,
      bodyText: dto.bodyText,
    });

    return { submission: presentStudentHomeworkSubmission(submission) };
  }
}
