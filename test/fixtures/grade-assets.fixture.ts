import type { GradeAssessmentQuestion } from '@prisma/client';
import { HomeworkQuestionAssetsFixture } from './homework-question-assets.fixture';
import type { MediaFixtureActor } from './assessment-media.fixture';
/** Owns only fixture tenant rows and explicitly registered, genuinely verified private objects. */
export class GradeAssetsFixture extends HomeworkQuestionAssetsFixture {
  async create(): Promise<void> {
    await super.create();
    for (const actor of Object.values(this.actors)) {
      const permissions =
        actor.userType === 'STUDENT'
          ? ['grades.assessments.view']
          : [
              'grades.assessments.view',
              'grades.assessments.manage',
              'grades.assessments.publish',
              'grades.questions.view',
              'grades.questions.manage',
            ];
      await this.grantAssets(actor.roleId, permissions);
      actor.permissions = [...new Set([...actor.permissions, ...permissions])];
    }
  }
  async gradeGraph(
    actor: 'teacher' | 'otherTeacher' | 'foreignTeacher' = 'teacher',
    mode: 'SCORE_ONLY' | 'QUESTION_BASED' = 'QUESTION_BASED',
  ) {
    let assessment = await this.assessment(actor);
    assessment = await this.prisma.gradeAssessment.update({
      where: { id: assessment.id },
      data: { deliveryMode: mode, maxScore: 3 },
    });
    const questions: GradeAssessmentQuestion[] = [];
    if (mode === 'QUESTION_BASED')
      for (const prompt of ['Question A', 'Question B', 'No assets'])
        questions.push(
          await this.prisma.gradeAssessmentQuestion.create({
            data: {
              schoolId: assessment.schoolId,
              assessmentId: assessment.id,
              type: 'SHORT_ANSWER',
              prompt,
              points: 1,
              required: true,
              sortOrder: questions.length,
            },
          }),
        );
    return { assessment, questions };
  }
  readyGrade(
    contextId: string,
    actor: MediaFixtureActor = 'teacher',
    bytes?: Buffer,
    filename?: string,
  ) {
    return this.ready(
      contextId,
      actor,
      bytes,
      'GRADE_ASSESSMENT_MEDIA',
      filename,
    );
  }
  async dispose(): Promise<void> {
    const where = { schoolId: { in: this.schools.map((row) => row.schoolId) } };
    await this.prisma.gradeAssessmentQuestionAsset.deleteMany({ where });
    await this.prisma.gradeAssessmentAsset.deleteMany({ where });
    await this.prisma.gradeSubmissionAnswerOption.deleteMany({ where });
    await this.prisma.gradeSubmissionAnswer.deleteMany({ where });
    await this.prisma.gradeItem.deleteMany({ where });
    await this.prisma.gradeAssessmentQuestionOption.deleteMany({ where });
    await this.prisma.gradeAssessmentQuestion.deleteMany({ where });
    await super.dispose();
  }
}
