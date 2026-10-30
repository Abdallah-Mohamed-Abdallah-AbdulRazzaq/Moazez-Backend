const readRoutes = (prefix: string) => [
  `GET ${prefix}/answer-assets`,
  ...(['GET', 'HEAD'] as const).flatMap((method) =>
    ['preview', 'download'].map(
      (operation) => `${method} ${prefix}/answer-assets/:assetId/${operation}`,
    ),
  ),
];
export const ST11_STUDENT_ANSWER_MEDIA_ROUTES = [
  '/api/v1/student/homeworks/:homeworkId/questions/:questionId',
  '/api/v1/student/exams/:assessmentId/submissions/:submissionId/questions/:questionId',
].flatMap((prefix) => [
  ...readRoutes(prefix),
  `POST ${prefix}/answer-uploads`,
  `GET ${prefix}/answer-uploads/:uploadId`,
  `POST ${prefix}/answer-uploads/:uploadId/complete`,
  `POST ${prefix}/answer-uploads/:uploadId/cancel`,
  `POST ${prefix}/answer-assets`,
  `DELETE ${prefix}/answer-assets/:assetId`,
]);
export const ST11_CORE_HOMEWORK_ANSWER_MEDIA_ROUTES = readRoutes(
  '/api/v1/homework/assignments/:homeworkId/submissions/:submissionId/questions/:questionId',
);
export const ST11_TEACHER_ANSWER_MEDIA_ROUTES = [
  '/api/v1/teacher/homeworks/classes/:classId/assignments/:homeworkId/submissions/:submissionId/questions/:questionId',
  '/api/v1/teacher/classroom/:classId/grades/assessments/:assessmentId/submissions/:submissionId/questions/:questionId',
].flatMap(readRoutes);
