import { Injectable } from '@nestjs/common';
import { requireTeacherDirectoryScope } from '../teacher-directory.context';
import type {
  ListTeachersQueryDto,
  TeachersListResponseDto,
} from '../dto/teacher-directory.dto';
import { TeacherDirectoryRepository } from '../infrastructure/teacher-directory.repository';
import { presentTeacherDirectoryListItem } from '../presenters/teacher-directory.presenter';

@Injectable()
export class ListTeachersUseCase {
  constructor(private readonly repository: TeacherDirectoryRepository) {}

  async execute(query: ListTeachersQueryDto): Promise<TeachersListResponseDto> {
    const scope = requireTeacherDirectoryScope();
    const result = await this.repository.list({
      schoolId: scope.schoolId,
      search: query.search,
      accountStatus: query.accountStatus,
      membershipStatus: query.membershipStatus,
      employmentStatus: query.employmentStatus,
      gender: query.gender,
      profileCompleteness: query.profileCompleteness,
      page: query.page,
      limit: query.limit,
    });
    return {
      items: result.items.map(presentTeacherDirectoryListItem),
      pagination: { page: query.page, limit: query.limit, total: result.total },
    };
  }
}
