import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { StudentTimelineEventResponseDto } from '../dto/student-timeline.dto';
import { requireStudentsScope } from '../domain/students-scope';
import { StudentTimelineRepository } from '../infrastructure/student-timeline.repository';
import { presentStudentTimeline } from '../presenters/student-timeline.presenter';

@Injectable()
export class GetStudentTimelineUseCase {
  constructor(
    private readonly studentTimelineRepository: StudentTimelineRepository,
  ) {}

  async execute(studentId: string): Promise<StudentTimelineEventResponseDto[]> {
    requireStudentsScope();

    const student =
      await this.studentTimelineRepository.findStudentTimelineSource(studentId);
    if (!student) {
      throw new NotFoundDomainException('Student not found', { studentId });
    }

    return presentStudentTimeline(student);
  }
}
