import { Injectable } from '@nestjs/common';
import type { CreateAssessmentMediaCommand } from '../../../../files/assessment-media/domain/assessment-media.contract';
import { GradeTeacherAuthoringService } from '../../../../grades/assessments/application/grade-teacher-authoring.service';
import type { GradeTeacherAuthoringActor } from '../../../../grades/assessments/domain/grade-teacher-authoring';
import type {
  CreateGradeAssessmentQuestionDto,
  ReorderGradeAssessmentQuestionsDto,
  BulkUpdateGradeAssessmentQuestionPointsDto,
} from '../../../../grades/assessments/dto/grade-assessment-question.dto';
import { TeacherAppAccessService } from '../../../access/teacher-app-access.service';
import type { UpdateTeacherGradeQuestionDto } from '../dto/teacher-grade-authoring.dto';

@Injectable()
export class TeacherGradeAuthoringService {
  constructor(
    private readonly access: TeacherAppAccessService,
    private readonly authoring: GradeTeacherAuthoringService,
  ) {}
  private async actor(
    classId: string,
    assessmentId: string,
  ): Promise<GradeTeacherAuthoringActor> {
    await this.access.assertTeacherOwnsAllocation(classId);
    return { surface: 'teacher', authoring: true, classId, assessmentId };
  }
  async list(classId: string, assessmentId: string) {
    return this.authoring.list(await this.actor(classId, assessmentId));
  }
  async create(
    classId: string,
    assessmentId: string,
    command: CreateGradeAssessmentQuestionDto,
  ) {
    return this.authoring.create(
      await this.actor(classId, assessmentId),
      command,
    );
  }
  async update(
    classId: string,
    assessmentId: string,
    questionId: string,
    command: UpdateTeacherGradeQuestionDto,
  ) {
    return this.authoring.update(
      {
        ...(await this.actor(classId, assessmentId)),
        expectedQuestionUpdatedAt: command.expectedQuestionUpdatedAt,
      },
      questionId,
      command,
    );
  }
  async remove(classId: string, assessmentId: string, questionId: string) {
    return this.authoring.remove(
      await this.actor(classId, assessmentId),
      questionId,
    );
  }
  async reorder(
    classId: string,
    assessmentId: string,
    command: ReorderGradeAssessmentQuestionsDto,
  ) {
    return this.authoring.reorder(
      await this.actor(classId, assessmentId),
      command,
    );
  }
  async points(
    classId: string,
    assessmentId: string,
    command: BulkUpdateGradeAssessmentQuestionPointsDto,
  ) {
    return this.authoring.points(
      await this.actor(classId, assessmentId),
      command,
    );
  }
  async createUpload(
    classId: string,
    assessmentId: string,
    command: CreateAssessmentMediaCommand,
  ) {
    return this.authoring.createUpload(
      await this.actor(classId, assessmentId),
      command,
    );
  }
  async upload(
    classId: string,
    assessmentId: string,
    uploadId: string,
    operation: 'status' | 'complete' | 'cancel',
  ) {
    return this.authoring.upload(
      await this.actor(classId, assessmentId),
      uploadId,
      operation,
    );
  }
}
