import type { RichQuestionContent } from '../../src/common/rich-content/rich-content.types';
import type { QuestionGroupContext } from '../../src/common/question-groups/question-group.projection';
import { assertDisposablePostgresTarget } from '../helpers/disposable-postgres-target';
import { St11AnswerMediaHttp } from './st11-answer-media.http';
import type { St10bDomain } from './st10b-runtime.http';
import { st06Json } from './homework-question-assets.http';

export const groupTextStimulus = (
  text = 'Shared passage',
): RichQuestionContent => ({
  contentVersion: 1,
  kind: 'question',
  stem: {
    language: 'en',
    direction: 'ltr',
    blocks: [{ type: 'paragraph', children: [{ type: 'text', text }] }],
  },
});
export const groupAssetStimulus = (assetId: string): RichQuestionContent => ({
  contentVersion: 1,
  kind: 'question',
  stem: {
    language: 'en',
    direction: 'ltr',
    blocks: [
      {
        type: 'paragraph',
        children: [
          {
            type: 'assetReference',
            assetId,
            kind: 'document',
            altText: 'Shared source',
          },
        ],
      },
    ],
  },
});

export class St11MultipartHttp extends St11AnswerMediaHttp {
  async grouped(domain: St10bDomain) {
    const f = await this.mixed(domain);
    const groups = f.authorPath + '/groups';
    const response = await this.http()
      .post(groups)
      .set(this.headers(f.author))
      .send({
        title: 'Multipart passage',
        sharedStimulus: groupTextStimulus(),
        layoutOrder: 1,
      })
      .expect(201);
    const group = st06Json<QuestionGroupContext>(response).groups[0];
    const changed = await this.http()
      .put(groups + '/layout')
      .set(this.headers(f.author))
      .send({
        questions: f.answers.slice(0, 2).map((a, index) => ({
          questionId: a.questionId,
          expectedGroupId: null,
          groupId: group.id,
          layoutOrder: 1 - index,
        })),
        blocks: [{ kind: 'group', id: group.id, layoutOrder: 1 }],
      })
      .expect(200);
    return {
      ...f,
      groups,
      groupId: group.id,
      context: st06Json<QuestionGroupContext>(changed),
    };
  }
  async disposeMultipartCase() {
    assertDisposablePostgresTarget({
      databaseUrl: process.env.DATABASE_URL,
      nodeEnv: process.env.NODE_ENV,
      universalRegressionMarker:
        process.env.MOAZEZ_UNIVERSAL_REGRESSION_DISPOSABLE_DB,
      localDatabasePredicate: (name) => /^ci_[0-9a-f]{12,64}$/u.test(name),
      errorMessage: 'Multipart teardown requires owned disposable DB',
    });
    const where = {
      schoolId: { in: this.fixture.schools.map((s) => s.schoolId) },
    };
    await this.prisma.homeworkQuestionGroupAsset.deleteMany({ where });
    await this.prisma.gradeAssessmentQuestionGroupAsset.deleteMany({ where });
    await this.prisma.homeworkQuestion.updateMany({
      where,
      data: { groupId: null },
    });
    await this.prisma.gradeAssessmentQuestion.updateMany({
      where,
      data: { groupId: null },
    });
    await this.prisma.homeworkQuestionGroup.deleteMany({ where });
    await this.prisma.gradeAssessmentQuestionGroup.deleteMany({ where });
    await this.prisma.gradeAssessmentQuestionAsset.deleteMany({ where });
    await this.prisma.gradeAssessmentAsset.deleteMany({ where });
    await this.disposeAnswerCase();
  }
}
