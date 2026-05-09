import { Injectable } from '@nestjs/common';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import {
  ParentGradesListResponseDto,
  ParentGradesQueryDto,
} from '../dto/parent-grades.dto';
import { ParentGradesReadAdapter } from '../infrastructure/parent-grades-read.adapter';
import { ParentGradesPresenter } from '../presenters/parent-grades.presenter';

@Injectable()
export class ListParentChildGradesUseCase {
  constructor(
    private readonly accessService: ParentAppAccessService,
    private readonly readAdapter: ParentGradesReadAdapter,
  ) {}

  async execute(
    studentId: string,
    query?: ParentGradesQueryDto,
  ): Promise<ParentGradesListResponseDto> {
    const child = await this.accessService.assertParentOwnsStudent(studentId);
    const result = await this.readAdapter.listGrades({ child, query });

    return ParentGradesPresenter.presentList(result);
  }
}
