import {
  HomeworkQuestionAssetsHttp,
  st06Json,
} from './homework-question-assets.http';
import {
  st09bcTeacher,
  st09bcStudent,
  createHomeworkEightTypes,
} from './homework-eight-type.fixture';
import { st10bCases } from './st10b-question-contracts.fixture';
import {
  GRADE_EIGHT_TYPES,
  gradeEightAuthor,
  gradeEightAnswer,
} from './grades-eight-types.fixture';

export type St10bDomain = 'Homework' | 'Grades';
export type St10bCase = (typeof st10bCases)[number];
export type St10bAnswer = {
  questionId: string;
  textAnswer?: string | null;
  answerText?: string | null;
  selectedOptionIds?: string[] | null;
  answerJson?: unknown;
};
const permissions = [
  'grades.assessments.view',
  'grades.assessments.manage',
  'grades.assessments.publish',
  'grades.questions.view',
  'grades.questions.manage',
  'grades.submissions.view',
  'grades.submissions.start',
  'grades.submissions.save',
  'grades.submissions.submit',
  'grades.submissions.review',
  'grades.items.manage',
  'grades.items.view',
  'grades.gradebook.view',
  'homework.answers.manage',
  'homework.submissions.save',
  'homework.submissions.submit',
  'homework.submissions.review',
];

/** Owned disposable roles only. No seed or production permission changes. */
export class St10bRuntimeHttp extends HomeworkQuestionAssetsHttp {
  async reset(): Promise<void> {
    await super.reset();
    for (const actor of Object.values(this.fixture.actors)) {
      await this.fixture.grantAssets(actor.roleId, permissions);
      actor.permissions = [...new Set([...actor.permissions, ...permissions])];
    }
    await this.fixture.grantAssets(this.fixture.parentRoleId, [
      'grades.items.view',
      'grades.assessments.view',
      'grades.submissions.view',
    ]);
    for (const school of this.fixture.schools)
      await this.prisma.academicYear.update({
        where: { id: school.yearId },
        data: { isActive: true },
      });
  }
  async disposeRuntimeCase(): Promise<void> {
    jest.restoreAllMocks();
    const where = {
      schoolId: { in: this.fixture.schools.map((school) => school.schoolId) },
    };
    await this.prisma.gradeSubmissionAnswerOption.deleteMany({ where });
    await this.prisma.gradeItem.deleteMany({ where });
    await this.prisma.gradeSubmissionAnswer.deleteMany({ where });
    await this.prisma.gradeSubmission.deleteMany({ where });
    await this.prisma.gradeAssessmentQuestionOption.deleteMany({ where });
    await this.prisma.gradeAssessmentQuestion.deleteMany({ where });
    await this.prisma.homeworkSubmissionAnswer.deleteMany({ where });
    await this.prisma.homeworkSubmission.deleteMany({ where });
    await this.disposeCase();
  }
  async question(domain: St10bDomain, c: St10bCase, required = true) {
    if (domain === 'Homework') {
      const graph = await this.fixture.graph();
      const author = st09bcTeacher(this, graph);
      await this.http()
        .patch(author)
        .set(this.headers())
        .send({ isGraded: true, totalMarks: 1 })
        .expect(200);
      for (const q of graph.questions)
        await this.http()
          .delete(author + '/questions/' + q.id)
          .set(this.headers())
          .expect(204);
      const response = await this.http()
        .post(author + '/questions')
        .set(this.headers())
        .send({
          type: c.type,
          prompt: 'ST10-B ' + c.type,
          points: 1,
          isRequired: required,
          metadata: c.definition,
          answerKey: { state: 'value', value: c.key },
        })
        .expect(201);
      const question = st06Json<{ question: { questionId: string } }>(
        response,
      ).question;
      return {
        domain,
        parentId: graph.homework.id,
        questionId: question.questionId,
        collection: author + '/questions',
        questionPath: author + '/questions/' + question.questionId,
        publish: author + '/publish',
        author: 'teacher' as const,
        student: st09bcStudent(graph),
        graph,
      };
    }
    const assessment = await this.fixture.assessment();
    await this.prisma.gradeAssessment.update({
      where: { id: assessment.id },
      data: { maxScore: 1 },
    });
    const collection = `/api/v1/grades/assessments/${assessment.id}/questions`;
    const response = await this.http()
      .post(collection)
      .set(this.headers('admin'))
      .send({
        type: c.type,
        prompt: 'ST10-B ' + c.type,
        points: 1,
        required,
        metadata: c.definition,
        answerKey: c.key,
      })
      .expect(201);
    const question = st06Json<{ id: string }>(response);
    return {
      domain,
      parentId: assessment.id,
      questionId: question.id,
      collection,
      questionPath: '/api/v1/grades/questions/' + question.id,
      publish: `/api/v1/grades/assessments/${assessment.id}/publish`,
      author: 'admin' as const,
      student: `/api/v1/student/exams/${assessment.id}`,
      graph: null,
    };
  }
  async stored(domain: St10bDomain, id: string) {
    return domain === 'Homework'
      ? this.prisma.homeworkQuestion.findUniqueOrThrow({ where: { id } })
      : this.prisma.gradeAssessmentQuestion.findUniqueOrThrow({
          where: { id },
        });
  }
  async mixed(domain: St10bDomain) {
    if (domain === 'Homework') {
      const f = await createHomeworkEightTypes(this);
      const answers: St10bAnswer[] = [...f.answers];
      for (const c of st10bCases) {
        const response = await this.http()
          .post(f.teacher + '/questions')
          .set(this.headers())
          .send({
            type: c.type,
            prompt: 'ST10-B ' + c.type,
            points: 1,
            metadata: c.definition,
            answerKey: { state: 'value', value: c.key },
          })
          .expect(201);
        const question = st06Json<{ question: { questionId: string } }>(
          response,
        ).question;
        answers.push({ questionId: question.questionId, answerJson: c.answer });
      }
      await this.http()
        .patch(f.teacher)
        .set(this.headers())
        .send({ isGraded: true, totalMarks: 11 })
        .expect(200);
      return {
        domain,
        parentId: f.graph.homework.id,
        authorPath: f.teacher,
        publish: f.teacher + '/publish',
        student: f.student,
        author: 'teacher' as const,
        answers,
      };
    }
    const f = await this.question(domain, st10bCases[0]);
    const answers: St10bAnswer[] = [
      { questionId: f.questionId, answerJson: st10bCases[0].answer },
    ];
    for (const c of st10bCases.slice(1)) {
      const response = await this.http()
        .post(f.collection)
        .set(this.headers('admin'))
        .send({
          type: c.type,
          prompt: 'ST10-B ' + c.type,
          points: 1,
          metadata: c.definition,
          answerKey: c.key,
        })
        .expect(201);
      answers.push({
        questionId: st06Json<{ id: string }>(response).id,
        answerJson: c.answer,
      });
    }
    for (const type of GRADE_EIGHT_TYPES) {
      const response = await this.http()
        .post(f.collection)
        .set(this.headers('admin'))
        .send({ ...gradeEightAuthor(type), points: 1 })
        .expect(201);
      const question = st06Json<{ id: string; options: Array<{ id: string }> }>(
        response,
      );
      answers.push({
        questionId: question.id,
        ...gradeEightAnswer(
          type,
          question.options.map((option) => option.id),
        ),
      });
    }
    await this.prisma.gradeAssessment.update({
      where: { id: f.parentId },
      data: { maxScore: 11 },
    });
    return {
      domain,
      parentId: f.parentId,
      authorPath: `/api/v1/grades/assessments/${f.parentId}`,
      publish: f.publish,
      student: f.student,
      author: 'admin' as const,
      answers,
    };
  }
}
