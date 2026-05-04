import { Injectable } from '@nestjs/common';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import type { TeacherAppClassId } from '../../shared/teacher-app.types';
import {
  ListTeacherClassroomRosterQueryDto,
  TeacherClassroomRosterResponseDto,
} from '../dto/teacher-classroom.dto';
import { TeacherClassroomReadAdapter } from '../infrastructure/teacher-classroom-read.adapter';
import { TeacherClassroomPresenter } from '../presenters/teacher-classroom.presenter';

@Injectable()
export class ListTeacherClassroomRosterUseCase {
  constructor(
    private readonly accessService: TeacherAppAccessService,
    private readonly classroomReadAdapter: TeacherClassroomReadAdapter,
  ) {}

  async execute(
    classId: TeacherAppClassId,
    query: ListTeacherClassroomRosterQueryDto,
  ): Promise<TeacherClassroomRosterResponseDto> {
    const allocation = await this.accessService.assertTeacherOwnsAllocation(
      classId,
    );
    const roster = await this.classroomReadAdapter.listActiveRoster({
      classroomId: allocation.classroomId,
      filters: query,
    });

    return TeacherClassroomPresenter.presentRoster({
      classId: allocation.id,
      students: roster.items,
      pagination: {
        page: roster.page,
        limit: roster.limit,
        total: roster.total,
      },
    });
  }
}
