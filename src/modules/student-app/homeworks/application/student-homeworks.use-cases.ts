import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import {
  GetHomeworkSubmissionUseCase as CoreGetHomeworkSubmissionUseCase,
  SaveHomeworkSubmissionDraftUseCase,
  SubmitHomeworkSubmissionUseCase as CoreSubmitHomeworkSubmissionUseCase,
} from '../../../homework/application/homework-submissions.use-cases';
import {
  ListStudentHomeworkAnswersUseCase as CoreListStudentHomeworkAnswersUseCase,
  mapBulkAnswersDto,
  mapSingleAnswerDto,
  SaveStudentHomeworkAnswerUseCase as CoreSaveStudentHomeworkAnswerUseCase,
  SaveStudentHomeworkAnswersDraftUseCase as CoreSaveStudentHomeworkAnswersDraftUseCase,
} from '../../../homework/application/homework-answers.use-cases';
import {
  CreateStudentHomeworkSubmissionAttachmentUseCase as CoreCreateStudentHomeworkSubmissionAttachmentUseCase,
  DeleteStudentHomeworkSubmissionAttachmentUseCase as CoreDeleteStudentHomeworkSubmissionAttachmentUseCase,
  ListStudentHomeworkSubmissionAttachmentsUseCase as CoreListStudentHomeworkSubmissionAttachmentsUseCase,
  ReorderStudentHomeworkSubmissionAttachmentUseCase as CoreReorderStudentHomeworkSubmissionAttachmentUseCase,
  UpdateStudentHomeworkSubmissionAttachmentUseCase as CoreUpdateStudentHomeworkSubmissionAttachmentUseCase,
} from '../../../homework/application/homework-submission-attachments.use-cases';
import {
  BulkSaveHomeworkAnswersDto,
  SaveHomeworkAnswerDto,
} from '../../../homework/dto/homework-answer.dto';
import {
  HomeworkAnswerDetailResponseDto,
  HomeworkAnswersListResponseDto,
} from '../../../homework/dto/homework-answer-response.dto';
import {
  CreateHomeworkSubmissionAttachmentDto,
  ReorderHomeworkSubmissionAttachmentDto,
  UpdateHomeworkSubmissionAttachmentDto,
} from '../../../homework/dto/homework-submission-attachment.dto';
import {
  HomeworkSubmissionAttachmentDetailResponseDto,
  HomeworkSubmissionAttachmentsListResponseDto,
} from '../../../homework/dto/homework-submission-attachment-response.dto';
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
      answers: dto.answers,
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
      answers: dto.answers,
    });

    return { submission: presentStudentHomeworkSubmission(submission) };
  }
}

@Injectable()
export class ListStudentHomeworkSubmissionAnswersUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly listAnswersUseCase: CoreListStudentHomeworkAnswersUseCase,
  ) {}

  async execute(homeworkId: string): Promise<HomeworkAnswersListResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    return this.listAnswersUseCase.execute({
      homeworkId,
      studentId: context.studentId,
      enrollmentId: context.enrollmentId,
    });
  }
}

@Injectable()
export class SaveStudentHomeworkSubmissionAnswersUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly saveAnswersUseCase: CoreSaveStudentHomeworkAnswersDraftUseCase,
  ) {}

  async execute(
    homeworkId: string,
    dto: BulkSaveHomeworkAnswersDto,
  ): Promise<HomeworkAnswersListResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    return this.saveAnswersUseCase.execute({
      homeworkId,
      studentId: context.studentId,
      enrollmentId: context.enrollmentId,
      answers: mapBulkAnswersDto(dto),
    });
  }
}

@Injectable()
export class SaveStudentHomeworkSubmissionAnswerUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly saveAnswerUseCase: CoreSaveStudentHomeworkAnswerUseCase,
  ) {}

  async execute(
    homeworkId: string,
    questionId: string,
    dto: SaveHomeworkAnswerDto,
  ): Promise<HomeworkAnswerDetailResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    return this.saveAnswerUseCase.execute({
      homeworkId,
      studentId: context.studentId,
      enrollmentId: context.enrollmentId,
      questionId,
      answer: mapSingleAnswerDto({ questionId, dto }),
      isDraft: dto.isDraft,
    });
  }
}

@Injectable()
export class ListStudentHomeworkSubmissionAttachmentsUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly listAttachmentsUseCase: CoreListStudentHomeworkSubmissionAttachmentsUseCase,
  ) {}

  async execute(
    homeworkId: string,
  ): Promise<HomeworkSubmissionAttachmentsListResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    return this.listAttachmentsUseCase.execute({
      homeworkId,
      studentId: context.studentId,
      enrollmentId: context.enrollmentId,
    });
  }
}

@Injectable()
export class CreateStudentHomeworkSubmissionAttachmentUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly createAttachmentUseCase: CoreCreateStudentHomeworkSubmissionAttachmentUseCase,
  ) {}

  async execute(
    homeworkId: string,
    dto: CreateHomeworkSubmissionAttachmentDto,
  ): Promise<HomeworkSubmissionAttachmentDetailResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    return this.createAttachmentUseCase.execute(
      {
        homeworkId,
        studentId: context.studentId,
        enrollmentId: context.enrollmentId,
      },
      dto,
    );
  }
}

@Injectable()
export class UpdateStudentHomeworkSubmissionAttachmentUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly updateAttachmentUseCase: CoreUpdateStudentHomeworkSubmissionAttachmentUseCase,
  ) {}

  async execute(
    homeworkId: string,
    attachmentId: string,
    dto: UpdateHomeworkSubmissionAttachmentDto,
  ): Promise<HomeworkSubmissionAttachmentDetailResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    return this.updateAttachmentUseCase.execute(
      {
        homeworkId,
        attachmentId,
        studentId: context.studentId,
        enrollmentId: context.enrollmentId,
      },
      dto,
    );
  }
}

@Injectable()
export class ReorderStudentHomeworkSubmissionAttachmentUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly reorderAttachmentUseCase: CoreReorderStudentHomeworkSubmissionAttachmentUseCase,
  ) {}

  async execute(
    homeworkId: string,
    attachmentId: string,
    dto: ReorderHomeworkSubmissionAttachmentDto,
  ): Promise<HomeworkSubmissionAttachmentDetailResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    return this.reorderAttachmentUseCase.execute(
      {
        homeworkId,
        attachmentId,
        studentId: context.studentId,
        enrollmentId: context.enrollmentId,
      },
      dto,
    );
  }
}

@Injectable()
export class DeleteStudentHomeworkSubmissionAttachmentUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly deleteAttachmentUseCase: CoreDeleteStudentHomeworkSubmissionAttachmentUseCase,
  ) {}

  async execute(homeworkId: string, attachmentId: string): Promise<void> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    return this.deleteAttachmentUseCase.execute({
      homeworkId,
      attachmentId,
      studentId: context.studentId,
      enrollmentId: context.enrollmentId,
    });
  }
}
