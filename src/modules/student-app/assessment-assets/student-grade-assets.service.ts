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
  ) {}
  private actor(surface: Surface): GradeAssetActor {
    return {
      surface,
      authorize: async (tx, assessmentId) => {
        const { context } = await this.access.getCurrentStudentWithEnrollment();
        await (
          surface === 'student-exams' ? this.exams : this.grades
        ).assertAssetAccess(tx, context, assessmentId);
      },
    };
  }
  metadata(surface: Surface, assessmentId: string) {
    return this.assets.studentAssets(this.actor(surface), assessmentId);
  }
  openContent(
    surface: Surface,
    input: GradeAssetResource & { assetId: string },
    request: PrivateMediaContentRequest,
  ) {
    return this.assets.openContent(this.actor(surface), input, request);
  }
}
