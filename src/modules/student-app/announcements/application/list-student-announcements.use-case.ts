import { Injectable } from '@nestjs/common';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import {
  StudentAnnouncementsListResponseDto,
  StudentAnnouncementsQueryDto,
} from '../dto/student-announcements.dto';
import { StudentAnnouncementsReadAdapter } from '../infrastructure/student-announcements-read.adapter';
import { StudentAnnouncementsPresenter } from '../presenters/student-announcements.presenter';

@Injectable()
export class ListStudentAnnouncementsUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentAnnouncementsReadAdapter,
  ) {}

  async execute(
    query?: StudentAnnouncementsQueryDto,
  ): Promise<StudentAnnouncementsListResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const result = await this.readAdapter.listAnnouncements({
      context,
      query,
    });

    return StudentAnnouncementsPresenter.presentList(result);
  }
}
