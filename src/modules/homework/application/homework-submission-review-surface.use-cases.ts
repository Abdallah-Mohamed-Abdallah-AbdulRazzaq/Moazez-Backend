import { Injectable } from '@nestjs/common';
import { HomeworkSubmissionStatus } from '@prisma/client';
import {
  GetHomeworkSubmissionForReviewUseCase,
  ListHomeworkSubmissionsForReviewUseCase,
  ReviewHomeworkSubmissionUseCase,
} from './homework-submissions.use-cases';
import {
  HomeworkSubmissionReviewDto,
  HomeworkSubmissionStatusFilter,
  ListHomeworkSubmissionsQueryDto,
} from '../dto/homework-submission.dto';
import {
  HomeworkSubmissionResponseDto,
  HomeworkSubmissionsListResponseDto,
} from '../dto/homework-submission-response.dto';
import { requireHomeworkScope } from '../homework-context';
import { HomeworkSubmissionPresenter } from '../presenters/homework-submission.presenter';

@Injectable()
export class ListHomeworkAssignmentSubmissionsUseCase {
  constructor(
    private readonly listHomeworkSubmissionsForReviewUseCase: ListHomeworkSubmissionsForReviewUseCase,
  ) {}

  async execute(
    homeworkId: string,
    query: ListHomeworkSubmissionsQueryDto,
  ): Promise<HomeworkSubmissionsListResponseDto> {
    const result = await this.listHomeworkSubmissionsForReviewUseCase.execute({
      homeworkId,
      statuses: mapSubmissionStatusFilter(query.status),
      search: query.search,
      page: query.page,
      limit: query.limit,
    });

    return HomeworkSubmissionPresenter.presentList(result);
  }
}

@Injectable()
export class GetHomeworkAssignmentSubmissionUseCase {
  constructor(
    private readonly getHomeworkSubmissionForReviewUseCase: GetHomeworkSubmissionForReviewUseCase,
  ) {}

  async execute(
    homeworkId: string,
    submissionId: string,
  ): Promise<HomeworkSubmissionResponseDto> {
    const submission = await this.getHomeworkSubmissionForReviewUseCase.execute(
      {
        homeworkId,
        submissionId,
      },
    );

    return HomeworkSubmissionPresenter.presentDetail(submission);
  }
}

@Injectable()
export class ReviewHomeworkAssignmentSubmissionUseCase {
  constructor(
    private readonly reviewHomeworkSubmissionUseCase: ReviewHomeworkSubmissionUseCase,
  ) {}

  async execute(
    homeworkId: string,
    submissionId: string,
    dto: HomeworkSubmissionReviewDto,
  ): Promise<HomeworkSubmissionResponseDto> {
    const scope = requireHomeworkScope();
    const submission = await this.reviewHomeworkSubmissionUseCase.execute({
      homeworkId,
      submissionId,
      reviewedByUserId: scope.actorId,
      reviewNote: dto.reviewNote,
      awardedMarks: dto.awardedMarks,
    });

    return HomeworkSubmissionPresenter.presentDetail(submission);
  }
}

function mapSubmissionStatusFilter(
  status?: HomeworkSubmissionStatusFilter,
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
      return [HomeworkSubmissionStatus.SUBMITTED, HomeworkSubmissionStatus.LATE];
  }
}
