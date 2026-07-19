import { Injectable } from '@nestjs/common';
import { TeacherProfileNotFoundException } from '../domain/teacher-directory.errors';
import type { TeacherDirectoryDetailDto } from '../dto/teacher-directory.dto';
import { TeacherDirectoryRepository } from '../infrastructure/teacher-directory.repository';
import { presentTeacherDirectoryDetail } from '../presenters/teacher-directory.presenter';
import { requireTeacherDirectoryScope } from '../teacher-directory.context';

@Injectable()
export class GetTeacherUseCase {
  constructor(private readonly repository: TeacherDirectoryRepository) {}

  async execute(teacherId: string): Promise<TeacherDirectoryDetailDto> {
    const scope = requireTeacherDirectoryScope();
    const record = await this.repository.findById({
      schoolId: scope.schoolId,
      teacherId,
    });
    if (!record) throw new TeacherProfileNotFoundException();
    return presentTeacherDirectoryDetail(record);
  }
}
