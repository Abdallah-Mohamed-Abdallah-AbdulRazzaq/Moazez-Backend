import { Injectable } from '@nestjs/common';
import { AssessmentMediaService } from '../../../files/assessment-media/application/assessment-media.service';
import type { CreateAssessmentMediaCommand } from '../../../files/assessment-media/domain/assessment-media.contract';
import type { GradeTeacherAuthoringActor } from '../domain/grade-teacher-authoring';
import { GradesAssessmentQuestionsRepository } from '../infrastructure/grades-assessment-questions.repository';
import { presentGradeAssessmentQuestions } from '../presenters/grade-assessment-question.presenter';
import { CreateGradeAssessmentQuestionUseCase } from './create-grade-assessment-question.use-case';
import { UpdateGradeAssessmentQuestionUseCase } from './update-grade-assessment-question.use-case';
import { DeleteGradeAssessmentQuestionUseCase } from './delete-grade-assessment-question.use-case';
import { ReorderGradeAssessmentQuestionsUseCase } from './reorder-grade-assessment-questions.use-case';
import { BulkUpdateGradeAssessmentQuestionPointsUseCase } from './bulk-update-grade-assessment-question-points.use-case';
import type {
  CreateGradeAssessmentQuestionDto,
  UpdateGradeAssessmentQuestionDto,
  ReorderGradeAssessmentQuestionsDto,
  BulkUpdateGradeAssessmentQuestionPointsDto,
} from '../dto/grade-assessment-question.dto';

/** Core owns normalization and mutation; the app supplies no substituted scope. */
@Injectable()
export class GradeTeacherAuthoringService {
  constructor(
    private readonly questions: GradesAssessmentQuestionsRepository,
    private readonly createQuestion: CreateGradeAssessmentQuestionUseCase,
    private readonly updateQuestion: UpdateGradeAssessmentQuestionUseCase,
    private readonly deleteQuestion: DeleteGradeAssessmentQuestionUseCase,
    private readonly reorderQuestions: ReorderGradeAssessmentQuestionsUseCase,
    private readonly updatePoints: BulkUpdateGradeAssessmentQuestionPointsUseCase,
    private readonly uploads: AssessmentMediaService,
  ) {}
  async list(actor: GradeTeacherAuthoringActor) {
    const view = await this.questions.teacherAuthoringView(actor);
    return presentGradeAssessmentQuestions({ ...view, authoring: true });
  }
  async create(
    actor: GradeTeacherAuthoringActor,
    command: CreateGradeAssessmentQuestionDto,
  ) {
    await this.questions.assertTeacherAuthoring(actor);
    return this.createQuestion.execute(actor.assessmentId, command, actor);
  }
  async update(
    actor: GradeTeacherAuthoringActor,
    questionId: string,
    command: UpdateGradeAssessmentQuestionDto,
  ) {
    await this.questions.assertTeacherAuthoring(actor, questionId);
    return this.updateQuestion.execute(questionId, command, actor);
  }
  async remove(actor: GradeTeacherAuthoringActor, questionId: string) {
    await this.questions.assertTeacherAuthoring(actor, questionId);
    return this.deleteQuestion.execute(questionId, actor);
  }
  async reorder(
    actor: GradeTeacherAuthoringActor,
    command: ReorderGradeAssessmentQuestionsDto,
  ) {
    await this.questions.assertTeacherAuthoring(actor);
    return this.reorderQuestions.execute(actor.assessmentId, command, actor);
  }
  async points(
    actor: GradeTeacherAuthoringActor,
    command: BulkUpdateGradeAssessmentQuestionPointsDto,
  ) {
    await this.questions.assertTeacherAuthoring(actor);
    return this.updatePoints.execute(actor.assessmentId, command, actor);
  }
  async createUpload(
    actor: GradeTeacherAuthoringActor,
    command: CreateAssessmentMediaCommand,
  ) {
    await this.questions.assertTeacherAuthoring(actor);
    return this.uploads.createGradeAssessmentUpload(
      actor.assessmentId,
      command,
      actor.classId,
    );
  }
  async upload(
    actor: GradeTeacherAuthoringActor,
    uploadId: string,
    operation: 'status' | 'complete' | 'cancel',
  ) {
    await this.questions.assertTeacherAuthoring(actor);
    return this.uploads[operation](
      'GRADE_ASSESSMENT_MEDIA',
      actor.assessmentId,
      uploadId,
      undefined,
      actor.classId,
    );
  }
}
