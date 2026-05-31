import { Injectable } from '@nestjs/common';
import {
  CreateHomeworkAssignmentUseCase,
  CloseHomeworkAssignmentUseCase,
  CancelHomeworkAssignmentUseCase,
  GetHomeworkAssignmentUseCase,
  ListHomeworkAssignmentsUseCase,
  ListHomeworkTargetsUseCase,
  PublishHomeworkAssignmentUseCase,
  ResolveHomeworkTargetsUseCase,
  UpdateHomeworkAssignmentUseCase,
} from '../../../homework/application/homework-assignments.use-cases';
import {
  GetHomeworkSubmissionForReviewUseCase,
  ListHomeworkSubmissionsForReviewUseCase,
  ReviewHomeworkSubmissionUseCase as CoreReviewHomeworkSubmissionUseCase,
} from '../../../homework/application/homework-submissions.use-cases';
import { ListHomeworkSubmissionAnswersUseCase } from '../../../homework/application/homework-answers.use-cases';
import {
  BulkReviewHomeworkSubmissionAnswersUseCase as CoreBulkReviewHomeworkSubmissionAnswersUseCase,
  ReviewHomeworkSubmissionAnswerUseCase as CoreReviewHomeworkSubmissionAnswerUseCase,
} from '../../../homework/application/homework-answer-review.use-cases';
import {
  GetHomeworkGradeSyncStatusUseCase,
  SyncHomeworkAssignmentToGradesUseCase,
  SyncHomeworkSubmissionToGradesUseCase,
} from '../../../homework/application/homework-grade-sync.use-cases';
import { ListHomeworkSubmissionAttachmentsUseCase } from '../../../homework/application/homework-submission-attachments.use-cases';
import {
  CreateHomeworkAttachmentUseCase,
  DeleteHomeworkAttachmentUseCase,
  ListHomeworkAttachmentsUseCase,
  ReorderHomeworkAttachmentUseCase,
  UpdateHomeworkAttachmentUseCase,
} from '../../../homework/application/homework-attachments.use-cases';
import {
  CreateHomeworkQuestionOptionUseCase,
  CreateHomeworkQuestionUseCase,
  DeleteHomeworkQuestionOptionUseCase,
  DeleteHomeworkQuestionUseCase,
  GetHomeworkQuestionUseCase,
  ListHomeworkQuestionsUseCase,
  ReorderHomeworkQuestionOptionUseCase,
  ReorderHomeworkQuestionUseCase,
  UpdateHomeworkQuestionOptionUseCase,
  UpdateHomeworkQuestionUseCase,
} from '../../../homework/application/homework-questions.use-cases';
import {
  CreateHomeworkAttachmentDto,
  ReorderHomeworkAttachmentDto,
  UpdateHomeworkAttachmentDto,
} from '../../../homework/dto/homework-attachment.dto';
import {
  HomeworkAttachmentDetailResponseDto,
  HomeworkAttachmentsListResponseDto,
} from '../../../homework/dto/homework-attachment-response.dto';
import {
  CreateHomeworkAssignmentDto,
  ListHomeworkAssignmentsQueryDto,
  UpdateHomeworkAssignmentDto,
} from '../../../homework/dto/homework-assignment.dto';
import {
  CreateHomeworkQuestionDto,
  CreateHomeworkQuestionOptionDto,
  ReorderHomeworkQuestionDto,
  ReorderHomeworkQuestionOptionDto,
  UpdateHomeworkQuestionDto,
  UpdateHomeworkQuestionOptionDto,
} from '../../../homework/dto/homework-question.dto';
import {
  HomeworkQuestionDetailResponseDto,
  HomeworkQuestionsListResponseDto,
} from '../../../homework/dto/homework-question-response.dto';
import {
  HomeworkAnswerDetailResponseDto,
  HomeworkAnswersListResponseDto,
} from '../../../homework/dto/homework-answer-response.dto';
import {
  BulkReviewHomeworkAnswersDto,
  ReviewHomeworkAnswerDto,
} from '../../../homework/dto/homework-answer.dto';
import { HomeworkSubmissionAttachmentsListResponseDto } from '../../../homework/dto/homework-submission-attachment-response.dto';
import {
  HomeworkGradeSyncResponseDto,
  HomeworkGradeSyncStatusResponseDto,
} from '../../../homework/dto/homework-grade-sync.dto';
import { HomeworkSubmissionStatus } from '@prisma/client';
import { TeacherAppAllocationReadAdapter } from '../../access/teacher-app-allocation-read.adapter';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import { TeacherAppAllocationNotFoundException } from '../../shared/teacher-app.errors';
import { TeacherAppAllocationRecord } from '../../shared/teacher-app.types';
import {
  ListTeacherHomeworkAssignmentsQueryDto,
  ListTeacherHomeworkSubmissionsQueryDto,
  TeacherHomeworkAssignmentDto,
  TeacherHomeworkAssignmentsListResponseDto,
  TeacherHomeworkCreateDto,
  TeacherHomeworkDashboardResponseDto,
  TeacherHomeworkSubmissionResponseDto,
  TeacherHomeworkSubmissionReviewDto,
  TeacherHomeworkSubmissionsListResponseDto,
  TeacherHomeworkTargetsListResponseDto,
  TeacherHomeworkSubmissionStatus,
  TeacherHomeworkUpdateDto,
} from '../dto/teacher-homeworks.dto';
import { TeacherHomeworksReadAdapter } from '../infrastructure/teacher-homeworks-read.adapter';
import { TeacherHomeworksPresenter } from '../presenters/teacher-homeworks.presenter';
import { TeacherHomeworkOwnershipService } from './teacher-homework-ownership.service';

@Injectable()
export class GetTeacherHomeworksDashboardUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly allocationReadAdapter: TeacherAppAllocationReadAdapter,
    private readonly homeworksReadAdapter: TeacherHomeworksReadAdapter,
  ) {}

  async execute(): Promise<TeacherHomeworkDashboardResponseDto> {
    const context = this.accessService.assertCurrentTeacher();
    const allocations =
      await this.allocationReadAdapter.listAllOwnedAllocations(
        context.teacherUserId,
      );
    const academicYearIds = allocations
      .map((allocation) => allocation.term?.academicYearId)
      .filter((id): id is string => Boolean(id));

    const [assignments, academicYears] = await Promise.all([
      this.homeworksReadAdapter.listDashboardAssignments({
        teacherUserId: context.teacherUserId,
        allocationIds: allocations.map((allocation) => allocation.id),
      }),
      this.homeworksReadAdapter.listAcademicYearReferences(academicYearIds),
    ]);

    return TeacherHomeworksPresenter.presentDashboard({
      allocations,
      assignments,
      academicYears,
      now: new Date(),
    });
  }
}

@Injectable()
export class ListTeacherHomeworkAssignmentsUseCase {
  constructor(
    private readonly ownershipService: TeacherHomeworkOwnershipService,
    private readonly listHomeworkAssignmentsUseCase: ListHomeworkAssignmentsUseCase,
  ) {}

  async execute(
    classId: string,
    query: ListTeacherHomeworkAssignmentsQueryDto,
  ): Promise<TeacherHomeworkAssignmentsListResponseDto> {
    const context = await this.ownershipService.resolveOwnedClass(classId);
    const result = await this.listHomeworkAssignmentsUseCase.execute({
      ...query,
      teacherUserId: context.teacherUserId,
      teacherSubjectAllocationId: context.allocation.id,
    } satisfies ListHomeworkAssignmentsQueryDto);

    return TeacherHomeworksPresenter.presentAssignmentsList(result);
  }
}

@Injectable()
export class CreateTeacherHomeworkAssignmentUseCase {
  constructor(
    private readonly ownershipService: TeacherHomeworkOwnershipService,
    private readonly createHomeworkAssignmentUseCase: CreateHomeworkAssignmentUseCase,
  ) {}

  async execute(
    classId: string,
    dto: TeacherHomeworkCreateDto,
  ): Promise<TeacherHomeworkAssignmentDto> {
    const context = await this.ownershipService.resolveOwnedClass(classId);
    const created = await this.createHomeworkAssignmentUseCase.execute(
      mapCreateCommand({ dto, allocation: context.allocation }),
    );
    this.ownershipService.assertAssignmentResponseBelongsToClass({
      assignment: created,
      classId: context.allocation.id,
    });

    return TeacherHomeworksPresenter.presentAssignment(created);
  }
}

@Injectable()
export class GetTeacherHomeworkAssignmentUseCase {
  constructor(
    private readonly ownershipService: TeacherHomeworkOwnershipService,
    private readonly getHomeworkAssignmentUseCase: GetHomeworkAssignmentUseCase,
  ) {}

  async execute(
    classId: string,
    homeworkId: string,
  ): Promise<TeacherHomeworkAssignmentDto> {
    const context = await this.ownershipService.resolveOwnedHomework({
      classId,
      homeworkId,
    });
    const assignment =
      await this.getHomeworkAssignmentUseCase.execute(homeworkId);
    this.ownershipService.assertAssignmentResponseBelongsToClass({
      assignment,
      classId: context.allocation.id,
      homeworkId,
    });

    return TeacherHomeworksPresenter.presentAssignment(assignment);
  }
}

@Injectable()
export class UpdateTeacherHomeworkAssignmentUseCase {
  constructor(
    private readonly ownershipService: TeacherHomeworkOwnershipService,
    private readonly updateHomeworkAssignmentUseCase: UpdateHomeworkAssignmentUseCase,
  ) {}

  async execute(
    classId: string,
    homeworkId: string,
    dto: TeacherHomeworkUpdateDto,
  ): Promise<TeacherHomeworkAssignmentDto> {
    const context = await this.ownershipService.resolveOwnedHomework({
      classId,
      homeworkId,
    });
    const updated = await this.updateHomeworkAssignmentUseCase.execute(
      homeworkId,
      mapUpdateCommand({ dto, allocation: context.allocation }),
    );
    this.ownershipService.assertAssignmentResponseBelongsToClass({
      assignment: updated,
      classId: context.allocation.id,
      homeworkId,
    });

    return TeacherHomeworksPresenter.presentAssignment(updated);
  }
}

@Injectable()
export class PublishTeacherHomeworkAssignmentUseCase {
  constructor(
    private readonly ownershipService: TeacherHomeworkOwnershipService,
    private readonly publishHomeworkAssignmentUseCase: PublishHomeworkAssignmentUseCase,
  ) {}

  async execute(
    classId: string,
    homeworkId: string,
  ): Promise<TeacherHomeworkAssignmentDto> {
    const context = await this.ownershipService.resolveOwnedHomework({
      classId,
      homeworkId,
    });
    const published =
      await this.publishHomeworkAssignmentUseCase.execute(homeworkId);
    this.ownershipService.assertAssignmentResponseBelongsToClass({
      assignment: published,
      classId: context.allocation.id,
      homeworkId,
    });

    return TeacherHomeworksPresenter.presentAssignment(published);
  }
}

@Injectable()
export class CloseTeacherHomeworkAssignmentUseCase {
  constructor(
    private readonly ownershipService: TeacherHomeworkOwnershipService,
    private readonly closeHomeworkAssignmentUseCase: CloseHomeworkAssignmentUseCase,
  ) {}

  async execute(
    classId: string,
    homeworkId: string,
  ): Promise<TeacherHomeworkAssignmentDto> {
    const context = await this.ownershipService.resolveOwnedHomework({
      classId,
      homeworkId,
    });
    const closed =
      await this.closeHomeworkAssignmentUseCase.execute(homeworkId);
    this.ownershipService.assertAssignmentResponseBelongsToClass({
      assignment: closed,
      classId: context.allocation.id,
      homeworkId,
    });

    return TeacherHomeworksPresenter.presentAssignment(closed);
  }
}

@Injectable()
export class CancelTeacherHomeworkAssignmentUseCase {
  constructor(
    private readonly ownershipService: TeacherHomeworkOwnershipService,
    private readonly cancelHomeworkAssignmentUseCase: CancelHomeworkAssignmentUseCase,
  ) {}

  async execute(
    classId: string,
    homeworkId: string,
  ): Promise<TeacherHomeworkAssignmentDto> {
    const context = await this.ownershipService.resolveOwnedHomework({
      classId,
      homeworkId,
    });
    const cancelled =
      await this.cancelHomeworkAssignmentUseCase.execute(homeworkId);
    this.ownershipService.assertAssignmentResponseBelongsToClass({
      assignment: cancelled,
      classId: context.allocation.id,
      homeworkId,
    });

    return TeacherHomeworksPresenter.presentAssignment(cancelled);
  }
}

@Injectable()
export class ListTeacherHomeworkTargetsUseCase {
  constructor(
    private readonly ownershipService: TeacherHomeworkOwnershipService,
    private readonly listHomeworkTargetsUseCase: ListHomeworkTargetsUseCase,
  ) {}

  async execute(
    classId: string,
    homeworkId: string,
  ): Promise<TeacherHomeworkTargetsListResponseDto> {
    await this.ownershipService.resolveOwnedHomework({ classId, homeworkId });
    const targets = await this.listHomeworkTargetsUseCase.execute(homeworkId);

    return TeacherHomeworksPresenter.presentTargetsList(targets);
  }
}

@Injectable()
export class ResolveTeacherHomeworkTargetsUseCase {
  constructor(
    private readonly ownershipService: TeacherHomeworkOwnershipService,
    private readonly resolveHomeworkTargetsUseCase: ResolveHomeworkTargetsUseCase,
  ) {}

  async execute(
    classId: string,
    homeworkId: string,
  ): Promise<TeacherHomeworkAssignmentDto> {
    const context = await this.ownershipService.resolveOwnedHomework({
      classId,
      homeworkId,
    });
    const resolved =
      await this.resolveHomeworkTargetsUseCase.execute(homeworkId);
    this.ownershipService.assertAssignmentResponseBelongsToClass({
      assignment: resolved,
      classId: context.allocation.id,
      homeworkId,
    });

    return TeacherHomeworksPresenter.presentAssignment(resolved);
  }
}

@Injectable()
export class ListTeacherHomeworkQuestionsUseCase {
  constructor(
    private readonly ownershipService: TeacherHomeworkOwnershipService,
    private readonly listHomeworkQuestionsUseCase: ListHomeworkQuestionsUseCase,
  ) {}

  async execute(
    classId: string,
    homeworkId: string,
  ): Promise<HomeworkQuestionsListResponseDto> {
    await this.ownershipService.resolveOwnedHomework({ classId, homeworkId });
    return this.listHomeworkQuestionsUseCase.execute(homeworkId);
  }
}

@Injectable()
export class CreateTeacherHomeworkQuestionUseCase {
  constructor(
    private readonly ownershipService: TeacherHomeworkOwnershipService,
    private readonly createHomeworkQuestionUseCase: CreateHomeworkQuestionUseCase,
  ) {}

  async execute(
    classId: string,
    homeworkId: string,
    dto: CreateHomeworkQuestionDto,
  ): Promise<HomeworkQuestionDetailResponseDto> {
    await this.ownershipService.resolveOwnedHomework({ classId, homeworkId });
    return this.createHomeworkQuestionUseCase.execute(homeworkId, dto);
  }
}

@Injectable()
export class GetTeacherHomeworkQuestionUseCase {
  constructor(
    private readonly ownershipService: TeacherHomeworkOwnershipService,
    private readonly getHomeworkQuestionUseCase: GetHomeworkQuestionUseCase,
  ) {}

  async execute(
    classId: string,
    homeworkId: string,
    questionId: string,
  ): Promise<HomeworkQuestionDetailResponseDto> {
    await this.ownershipService.resolveOwnedHomework({ classId, homeworkId });
    return this.getHomeworkQuestionUseCase.execute({ homeworkId, questionId });
  }
}

@Injectable()
export class UpdateTeacherHomeworkQuestionUseCase {
  constructor(
    private readonly ownershipService: TeacherHomeworkOwnershipService,
    private readonly updateHomeworkQuestionUseCase: UpdateHomeworkQuestionUseCase,
  ) {}

  async execute(
    classId: string,
    homeworkId: string,
    questionId: string,
    dto: UpdateHomeworkQuestionDto,
  ): Promise<HomeworkQuestionDetailResponseDto> {
    await this.ownershipService.resolveOwnedHomework({ classId, homeworkId });
    return this.updateHomeworkQuestionUseCase.execute(
      homeworkId,
      questionId,
      dto,
    );
  }
}

@Injectable()
export class ReorderTeacherHomeworkQuestionUseCase {
  constructor(
    private readonly ownershipService: TeacherHomeworkOwnershipService,
    private readonly reorderHomeworkQuestionUseCase: ReorderHomeworkQuestionUseCase,
  ) {}

  async execute(
    classId: string,
    homeworkId: string,
    questionId: string,
    dto: ReorderHomeworkQuestionDto,
  ): Promise<HomeworkQuestionDetailResponseDto> {
    await this.ownershipService.resolveOwnedHomework({ classId, homeworkId });
    return this.reorderHomeworkQuestionUseCase.execute(
      homeworkId,
      questionId,
      dto,
    );
  }
}

@Injectable()
export class DeleteTeacherHomeworkQuestionUseCase {
  constructor(
    private readonly ownershipService: TeacherHomeworkOwnershipService,
    private readonly deleteHomeworkQuestionUseCase: DeleteHomeworkQuestionUseCase,
  ) {}

  async execute(
    classId: string,
    homeworkId: string,
    questionId: string,
  ): Promise<void> {
    await this.ownershipService.resolveOwnedHomework({ classId, homeworkId });
    return this.deleteHomeworkQuestionUseCase.execute(homeworkId, questionId);
  }
}

@Injectable()
export class CreateTeacherHomeworkQuestionOptionUseCase {
  constructor(
    private readonly ownershipService: TeacherHomeworkOwnershipService,
    private readonly createHomeworkQuestionOptionUseCase: CreateHomeworkQuestionOptionUseCase,
  ) {}

  async execute(
    classId: string,
    homeworkId: string,
    questionId: string,
    dto: CreateHomeworkQuestionOptionDto,
  ): Promise<HomeworkQuestionDetailResponseDto> {
    await this.ownershipService.resolveOwnedHomework({ classId, homeworkId });
    return this.createHomeworkQuestionOptionUseCase.execute(
      homeworkId,
      questionId,
      dto,
    );
  }
}

@Injectable()
export class UpdateTeacherHomeworkQuestionOptionUseCase {
  constructor(
    private readonly ownershipService: TeacherHomeworkOwnershipService,
    private readonly updateHomeworkQuestionOptionUseCase: UpdateHomeworkQuestionOptionUseCase,
  ) {}

  async execute(
    classId: string,
    homeworkId: string,
    questionId: string,
    optionId: string,
    dto: UpdateHomeworkQuestionOptionDto,
  ): Promise<HomeworkQuestionDetailResponseDto> {
    await this.ownershipService.resolveOwnedHomework({ classId, homeworkId });
    return this.updateHomeworkQuestionOptionUseCase.execute(
      homeworkId,
      questionId,
      optionId,
      dto,
    );
  }
}

@Injectable()
export class ReorderTeacherHomeworkQuestionOptionUseCase {
  constructor(
    private readonly ownershipService: TeacherHomeworkOwnershipService,
    private readonly reorderHomeworkQuestionOptionUseCase: ReorderHomeworkQuestionOptionUseCase,
  ) {}

  async execute(
    classId: string,
    homeworkId: string,
    questionId: string,
    optionId: string,
    dto: ReorderHomeworkQuestionOptionDto,
  ): Promise<HomeworkQuestionDetailResponseDto> {
    await this.ownershipService.resolveOwnedHomework({ classId, homeworkId });
    return this.reorderHomeworkQuestionOptionUseCase.execute(
      homeworkId,
      questionId,
      optionId,
      dto,
    );
  }
}

@Injectable()
export class DeleteTeacherHomeworkQuestionOptionUseCase {
  constructor(
    private readonly ownershipService: TeacherHomeworkOwnershipService,
    private readonly deleteHomeworkQuestionOptionUseCase: DeleteHomeworkQuestionOptionUseCase,
  ) {}

  async execute(
    classId: string,
    homeworkId: string,
    questionId: string,
    optionId: string,
  ): Promise<HomeworkQuestionDetailResponseDto> {
    await this.ownershipService.resolveOwnedHomework({ classId, homeworkId });
    return this.deleteHomeworkQuestionOptionUseCase.execute(
      homeworkId,
      questionId,
      optionId,
    );
  }
}

@Injectable()
export class ListTeacherHomeworkAttachmentsUseCase {
  constructor(
    private readonly ownershipService: TeacherHomeworkOwnershipService,
    private readonly listHomeworkAttachmentsUseCase: ListHomeworkAttachmentsUseCase,
  ) {}

  async execute(
    classId: string,
    homeworkId: string,
  ): Promise<HomeworkAttachmentsListResponseDto> {
    await this.ownershipService.resolveOwnedHomework({ classId, homeworkId });
    return this.listHomeworkAttachmentsUseCase.execute(homeworkId);
  }
}

@Injectable()
export class CreateTeacherHomeworkAttachmentUseCase {
  constructor(
    private readonly ownershipService: TeacherHomeworkOwnershipService,
    private readonly createHomeworkAttachmentUseCase: CreateHomeworkAttachmentUseCase,
  ) {}

  async execute(
    classId: string,
    homeworkId: string,
    dto: CreateHomeworkAttachmentDto,
  ): Promise<HomeworkAttachmentDetailResponseDto> {
    await this.ownershipService.resolveOwnedHomework({ classId, homeworkId });
    return this.createHomeworkAttachmentUseCase.execute(homeworkId, dto);
  }
}

@Injectable()
export class UpdateTeacherHomeworkAttachmentUseCase {
  constructor(
    private readonly ownershipService: TeacherHomeworkOwnershipService,
    private readonly updateHomeworkAttachmentUseCase: UpdateHomeworkAttachmentUseCase,
  ) {}

  async execute(
    classId: string,
    homeworkId: string,
    attachmentId: string,
    dto: UpdateHomeworkAttachmentDto,
  ): Promise<HomeworkAttachmentDetailResponseDto> {
    await this.ownershipService.resolveOwnedHomework({ classId, homeworkId });
    return this.updateHomeworkAttachmentUseCase.execute(
      homeworkId,
      attachmentId,
      dto,
    );
  }
}

@Injectable()
export class ReorderTeacherHomeworkAttachmentUseCase {
  constructor(
    private readonly ownershipService: TeacherHomeworkOwnershipService,
    private readonly reorderHomeworkAttachmentUseCase: ReorderHomeworkAttachmentUseCase,
  ) {}

  async execute(
    classId: string,
    homeworkId: string,
    attachmentId: string,
    dto: ReorderHomeworkAttachmentDto,
  ): Promise<HomeworkAttachmentDetailResponseDto> {
    await this.ownershipService.resolveOwnedHomework({ classId, homeworkId });
    return this.reorderHomeworkAttachmentUseCase.execute(
      homeworkId,
      attachmentId,
      dto,
    );
  }
}

@Injectable()
export class DeleteTeacherHomeworkAttachmentUseCase {
  constructor(
    private readonly ownershipService: TeacherHomeworkOwnershipService,
    private readonly deleteHomeworkAttachmentUseCase: DeleteHomeworkAttachmentUseCase,
  ) {}

  async execute(
    classId: string,
    homeworkId: string,
    attachmentId: string,
  ): Promise<void> {
    await this.ownershipService.resolveOwnedHomework({ classId, homeworkId });
    return this.deleteHomeworkAttachmentUseCase.execute(
      homeworkId,
      attachmentId,
    );
  }
}

@Injectable()
export class ListTeacherHomeworkSubmissionsUseCase {
  constructor(
    private readonly ownershipService: TeacherHomeworkOwnershipService,
    private readonly listHomeworkSubmissionsForReviewUseCase: ListHomeworkSubmissionsForReviewUseCase,
  ) {}

  async execute(
    classId: string,
    homeworkId: string,
    query: ListTeacherHomeworkSubmissionsQueryDto,
  ): Promise<TeacherHomeworkSubmissionsListResponseDto> {
    await this.ownershipService.resolveOwnedHomework({ classId, homeworkId });
    const result = await this.listHomeworkSubmissionsForReviewUseCase.execute({
      homeworkId,
      statuses: mapSubmissionStatusFilter(query.status),
      search: query.search,
      page: query.page,
      limit: query.limit,
    });

    return TeacherHomeworksPresenter.presentSubmissionsList(result);
  }
}

@Injectable()
export class GetTeacherHomeworkSubmissionUseCase {
  constructor(
    private readonly ownershipService: TeacherHomeworkOwnershipService,
    private readonly getHomeworkSubmissionForReviewUseCase: GetHomeworkSubmissionForReviewUseCase,
  ) {}

  async execute(
    classId: string,
    homeworkId: string,
    submissionId: string,
  ): Promise<TeacherHomeworkSubmissionResponseDto> {
    await this.ownershipService.resolveOwnedHomework({ classId, homeworkId });
    const submission = await this.getHomeworkSubmissionForReviewUseCase.execute(
      {
        homeworkId,
        submissionId,
      },
    );

    return TeacherHomeworksPresenter.presentSubmissionDetail(submission);
  }
}

@Injectable()
export class ListTeacherHomeworkSubmissionAnswersUseCase {
  constructor(
    private readonly ownershipService: TeacherHomeworkOwnershipService,
    private readonly listHomeworkSubmissionAnswersUseCase: ListHomeworkSubmissionAnswersUseCase,
  ) {}

  async execute(
    classId: string,
    homeworkId: string,
    submissionId: string,
  ): Promise<HomeworkAnswersListResponseDto> {
    await this.ownershipService.resolveOwnedHomework({ classId, homeworkId });
    return this.listHomeworkSubmissionAnswersUseCase.execute({
      homeworkId,
      submissionId,
    });
  }
}

@Injectable()
export class ReviewTeacherHomeworkSubmissionAnswerUseCase {
  constructor(
    private readonly ownershipService: TeacherHomeworkOwnershipService,
    private readonly reviewHomeworkSubmissionAnswerUseCase: CoreReviewHomeworkSubmissionAnswerUseCase,
  ) {}

  async execute(
    classId: string,
    homeworkId: string,
    submissionId: string,
    answerId: string,
    dto: ReviewHomeworkAnswerDto,
  ): Promise<HomeworkAnswerDetailResponseDto> {
    const context = await this.ownershipService.resolveOwnedHomework({
      classId,
      homeworkId,
    });

    return this.reviewHomeworkSubmissionAnswerUseCase.execute({
      homeworkId,
      submissionId,
      answerId,
      reviewedByUserId: context.teacherUserId,
      review: dto,
    });
  }
}

@Injectable()
export class BulkReviewTeacherHomeworkSubmissionAnswersUseCase {
  constructor(
    private readonly ownershipService: TeacherHomeworkOwnershipService,
    private readonly bulkReviewHomeworkSubmissionAnswersUseCase: CoreBulkReviewHomeworkSubmissionAnswersUseCase,
  ) {}

  async execute(
    classId: string,
    homeworkId: string,
    submissionId: string,
    dto: BulkReviewHomeworkAnswersDto,
  ): Promise<HomeworkAnswersListResponseDto> {
    const context = await this.ownershipService.resolveOwnedHomework({
      classId,
      homeworkId,
    });

    return this.bulkReviewHomeworkSubmissionAnswersUseCase.execute({
      homeworkId,
      submissionId,
      reviewedByUserId: context.teacherUserId,
      reviews: dto.answers,
    });
  }
}

@Injectable()
export class ListTeacherHomeworkSubmissionAttachmentsUseCase {
  constructor(
    private readonly ownershipService: TeacherHomeworkOwnershipService,
    private readonly listHomeworkSubmissionAttachmentsUseCase: ListHomeworkSubmissionAttachmentsUseCase,
  ) {}

  async execute(
    classId: string,
    homeworkId: string,
    submissionId: string,
  ): Promise<HomeworkSubmissionAttachmentsListResponseDto> {
    await this.ownershipService.resolveOwnedHomework({ classId, homeworkId });
    return this.listHomeworkSubmissionAttachmentsUseCase.execute({
      homeworkId,
      submissionId,
    });
  }
}

@Injectable()
export class ReviewTeacherHomeworkSubmissionUseCase {
  constructor(
    private readonly ownershipService: TeacherHomeworkOwnershipService,
    private readonly reviewHomeworkSubmissionUseCase: CoreReviewHomeworkSubmissionUseCase,
  ) {}

  async execute(
    classId: string,
    homeworkId: string,
    submissionId: string,
    dto: TeacherHomeworkSubmissionReviewDto,
  ): Promise<TeacherHomeworkSubmissionResponseDto> {
    const context = await this.ownershipService.resolveOwnedHomework({
      classId,
      homeworkId,
    });
    const submission = await this.reviewHomeworkSubmissionUseCase.execute({
      homeworkId,
      submissionId,
      reviewedByUserId: context.teacherUserId,
      reviewNote: dto.reviewNote,
      awardedMarks: dto.awardedMarks,
    });

    return TeacherHomeworksPresenter.presentSubmissionDetail(submission);
  }
}

@Injectable()
export class GetTeacherHomeworkGradeSyncStatusUseCase {
  constructor(
    private readonly ownershipService: TeacherHomeworkOwnershipService,
    private readonly getHomeworkGradeSyncStatusUseCase: GetHomeworkGradeSyncStatusUseCase,
  ) {}

  async execute(
    classId: string,
    homeworkId: string,
  ): Promise<HomeworkGradeSyncStatusResponseDto> {
    await this.ownershipService.resolveOwnedHomework({ classId, homeworkId });
    return this.getHomeworkGradeSyncStatusUseCase.execute(homeworkId);
  }
}

@Injectable()
export class SyncTeacherHomeworkAssignmentToGradesUseCase {
  constructor(
    private readonly ownershipService: TeacherHomeworkOwnershipService,
    private readonly syncHomeworkAssignmentToGradesUseCase: SyncHomeworkAssignmentToGradesUseCase,
  ) {}

  async execute(
    classId: string,
    homeworkId: string,
  ): Promise<HomeworkGradeSyncResponseDto> {
    await this.ownershipService.resolveOwnedHomework({ classId, homeworkId });
    return this.syncHomeworkAssignmentToGradesUseCase.execute(homeworkId);
  }
}

@Injectable()
export class SyncTeacherHomeworkSubmissionToGradesUseCase {
  constructor(
    private readonly ownershipService: TeacherHomeworkOwnershipService,
    private readonly syncHomeworkSubmissionToGradesUseCase: SyncHomeworkSubmissionToGradesUseCase,
  ) {}

  async execute(
    classId: string,
    homeworkId: string,
    submissionId: string,
  ): Promise<HomeworkGradeSyncResponseDto> {
    await this.ownershipService.resolveOwnedHomework({ classId, homeworkId });
    return this.syncHomeworkSubmissionToGradesUseCase.execute({
      homeworkId,
      submissionId,
    });
  }
}

function mapCreateCommand(input: {
  dto: TeacherHomeworkCreateDto;
  allocation: TeacherAppAllocationRecord;
}): CreateHomeworkAssignmentDto {
  return {
    academicYearId: requireAllocationAcademicYearId(input.allocation),
    termId: input.allocation.termId,
    teacherSubjectAllocationId: input.allocation.id,
    timetableEntryId: input.dto.timetableEntryId,
    scheduleDate: input.dto.scheduleDate,
    title: input.dto.title,
    description: input.dto.description,
    mode: input.dto.mode,
    targetMode: input.dto.targetMode,
    studentIds: input.dto.studentIds,
    publishAt: input.dto.publishAt,
    dueAt: input.dto.dueAt,
    estimatedMinutes: input.dto.estimatedMinutes,
    totalMarks: input.dto.totalMarks,
    isGraded: input.dto.isGraded,
  };
}

function mapUpdateCommand(input: {
  dto: TeacherHomeworkUpdateDto;
  allocation: TeacherAppAllocationRecord;
}): UpdateHomeworkAssignmentDto {
  const command: UpdateHomeworkAssignmentDto = {
    academicYearId: requireAllocationAcademicYearId(input.allocation),
    termId: input.allocation.termId,
    teacherSubjectAllocationId: input.allocation.id,
  };

  copyDefined(command, input.dto, 'timetableEntryId');
  copyDefined(command, input.dto, 'scheduleDate');
  copyDefined(command, input.dto, 'title');
  copyDefined(command, input.dto, 'description');
  copyDefined(command, input.dto, 'mode');
  copyDefined(command, input.dto, 'targetMode');
  copyDefined(command, input.dto, 'studentIds');
  copyDefined(command, input.dto, 'publishAt');
  copyDefined(command, input.dto, 'dueAt');
  copyDefined(command, input.dto, 'estimatedMinutes');
  copyDefined(command, input.dto, 'totalMarks');
  copyDefined(command, input.dto, 'isGraded');

  return command;
}

function requireAllocationAcademicYearId(
  allocation: TeacherAppAllocationRecord,
): string {
  const academicYearId = allocation.term?.academicYearId;
  if (academicYearId) return academicYearId;

  throw new TeacherAppAllocationNotFoundException({
    classId: allocation.id,
    relation: 'term.academicYear',
  });
}

function copyDefined(
  target: UpdateHomeworkAssignmentDto,
  source: TeacherHomeworkUpdateDto,
  key: keyof TeacherHomeworkUpdateDto & keyof UpdateHomeworkAssignmentDto,
): void {
  const value = source[key];
  if (value !== undefined) {
    (target as Record<string, unknown>)[key] = value;
  }
}

function mapSubmissionStatusFilter(
  status?: TeacherHomeworkSubmissionStatus,
): HomeworkSubmissionStatus[] | undefined {
  switch (status) {
    case undefined:
      return undefined;
    case 'submitted':
      return [HomeworkSubmissionStatus.SUBMITTED];
    case 'late':
      return [HomeworkSubmissionStatus.LATE];
    case 'reviewed':
      return [HomeworkSubmissionStatus.REVIEWED];
    case 'pending_review':
      return [
        HomeworkSubmissionStatus.SUBMITTED,
        HomeworkSubmissionStatus.LATE,
      ];
  }
}
