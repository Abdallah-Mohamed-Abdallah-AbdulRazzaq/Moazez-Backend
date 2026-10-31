import { Optional } from '@nestjs/common';
import { GradeQuestionGroupsService } from '../../grades/assessments/application/grade-question-groups.service';
import { Injectable } from '@nestjs/common';
import { GradeAssetsService } from '../../grades/assessments/application/grade-assets.service';
import type {
  GradeAssetActor,
  GradeAssetResource,
} from '../../grades/assessments/domain/grade-asset';
import type { PrivateMediaContentRequest } from '../../../infrastructure/storage/private-media-content.service';
import { StudentAppAccessService } from '../access/student-app-access.service';
import { StudentExamsReadAdapter } from '../exams/infrastructure/student-exams-read.adapter';
import { StudentGradesReadAdapter } from '../grades/infrastructure/student-grades-read.adapter';
type Surface = 'student-exams' | 'student-grades';
@Injectable()
export class StudentGradeAssetsService {
  constructor(
    private readonly access: StudentAppAccessService,
    private readonly exams: StudentExamsReadAdapter,
    private readonly grades: StudentGradesReadAdapter,
    private readonly assets: GradeAssetsService,
    @Optional() private readonly groups?: GradeQuestionGroupsService,
  ) {}
  private async actor(surface: Surface): Promise<GradeAssetActor> {
    const { context } = await this.access.getCurrentStudentWithEnrollment();
    return {
      surface,
      authorize: (tx, assessmentId) =>
        (surface === 'student-exams'
          ? this.exams
          : this.grades
        ).assertAssetAccess(tx, context, assessmentId),
    };
  }
  async groupMetadata(surface: Surface, assessmentId: string) {
    if (!this.groups) throw new Error('Group integration unavailable');
    return this.groups.list(await this.actor(surface), { assessmentId });
  }
  groupContent(
    surface: Surface,
    input: { assessmentId: string; groupId: string; assetId: string },
    request: PrivateMediaContentRequest,
  ) {
    if (!this.groups) throw new Error('Group integration unavailable');
    return this.groups.open(() => this.actor(surface), input, request);
  }
  async metadata(surface: Surface, assessmentId: string) {
    return this.assets.studentAssets(await this.actor(surface), assessmentId);
  }
  openContent(
    surface: Surface,
    input: GradeAssetResource & { assetId: string },
    request: PrivateMediaContentRequest,
  ) {
    return this.assets.openContent(() => this.actor(surface), input, request);
  }
}
