import { Injectable } from '@nestjs/common';
import { HomeworkSubmissionAttachmentNotFoundException } from '../../../homework/domain/homework-submission-attachment.exceptions';
import {
  PrivateMediaContentService,
  type PrivateMediaContent,
  type PrivateMediaContentRequest,
} from '../../../../infrastructure/storage/private-media-content.service';
import { TeacherHomeworksReadAdapter } from '../infrastructure/teacher-homeworks-read.adapter';
import { TeacherHomeworkOwnershipService } from './teacher-homework-ownership.service';

@Injectable()
export class GetTeacherHomeworkSubmissionAttachmentContentUseCase {
  constructor(
    private readonly ownership: TeacherHomeworkOwnershipService,
    private readonly readAdapter: TeacherHomeworksReadAdapter,
    private readonly contentService: PrivateMediaContentService,
  ) {}

  execute(
    params: {
      classId: string;
      homeworkId: string;
      submissionId: string;
      attachmentId: string;
    },
    request: PrivateMediaContentRequest = {},
  ): Promise<PrivateMediaContent> {
    return this.contentService.openAuthorized(
      async () => {
        // Repeat the complete ownership chain immediately before streaming.
        const context = await this.ownership.resolveOwnedHomework(params);
        const file = await this.readAdapter.findSubmissionAttachmentContent({
          ...params,
          ...context,
        });
        if (!file) throw new HomeworkSubmissionAttachmentNotFoundException();
        return file;
      },
      () => new HomeworkSubmissionAttachmentNotFoundException(),
      request,
    );
  }
}
