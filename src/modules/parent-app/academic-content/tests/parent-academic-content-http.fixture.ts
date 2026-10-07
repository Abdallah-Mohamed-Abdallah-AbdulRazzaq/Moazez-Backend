import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';

export async function assertParentAcademicContentHttpContract(params: {
  app: INestApplication;
  login: (email: string) => Promise<{ accessToken: string }>;
  parentEmail: string;
  nonParentEmails: string[];
  ownedStudentId: string;
  foreignStudentIds: string[];
}): Promise<void> {
  const server = params.app.getHttpServer() as App;
  const contentId = randomUUID();
  const childPath = `/api/v1/parent/children/${params.ownedStudentId}/academic-content`;
  const childrenPath = `/api/v1/parent/academic-content/${contentId}/accessible-children`;
  const assetPath = `${childPath}/${contentId}/assets/${randomUUID()}/access`;
  const paths = [
    childPath,
    `${childPath}/${contentId}`,
    childrenPath,
    `${assetPath}?mode=download`,
  ];
  for (const path of paths) await request(server).get(path).expect(401);
  const parent = await params.login(params.parentEmail);
  const feed = await request(server)
    .get(childPath)
    .set('Authorization', `Bearer ${parent.accessToken}`)
    .expect(200);
  expect(feed.headers['cache-control']).toBe('no-store, private, max-age=0');
  expect(feed.body as unknown).toMatchObject({
    items: [],
    pagination: { page: 1, limit: 20, total: 0 },
  });
  for (const path of paths.slice(1))
    await request(server)
      .get(path)
      .set('Authorization', `Bearer ${parent.accessToken}`)
      .expect(404);
  for (const studentId of [...params.foreignStudentIds, randomUUID()]) {
    for (const suffix of [
      '',
      `/${contentId}`,
      `/${contentId}/assets/${randomUUID()}/access?mode=download`,
    ]) {
      const response = await request(server)
        .get(`/api/v1/parent/children/${studentId}/academic-content${suffix}`)
        .set('Authorization', `Bearer ${parent.accessToken}`)
        .expect(404);
      expect(response.body as unknown).toMatchObject({
        error: { code: 'parent_app.child.not_found' },
      });
      expect(JSON.stringify(response.body as unknown)).not.toContain('joinUrl');
    }
  }
  for (const email of params.nonParentEmails) {
    const actor = await params.login(email);
    for (const path of paths)
      await request(server)
        .get(path)
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .expect(403);
  }
  for (const query of [
    { type: 'TEACHER_PREPARATION' },
    { guardianId: randomUUID() },
    { termId: randomUUID() },
    { audience: 'GUARDIANS' },
    { limit: '101' },
  ])
    await request(server)
      .get(childPath)
      .query(query)
      .set('Authorization', `Bearer ${parent.accessToken}`)
      .expect(400);
  for (const path of [
    '/api/v1/parent/children/invalid/academic-content',
    `${childPath}/invalid`,
    '/api/v1/parent/academic-content/invalid/accessible-children',
  ])
    await request(server)
      .get(path)
      .set('Authorization', `Bearer ${parent.accessToken}`)
      .expect(400);
  for (const path of paths)
    for (const method of ['post', 'put', 'patch', 'delete'] as const)
      await request(server)
        [method](path)
        .set('Authorization', `Bearer ${parent.accessToken}`)
        .send({})
        .expect(404);
  for (const path of [
    '/api/v1/parent/academic-content',
    `${childPath}/${contentId}/acknowledge`,
  ])
    await request(server)
      .get(path)
      .set('Authorization', `Bearer ${parent.accessToken}`)
      .expect(404);
  for (const suffix of [
    '',
    '?mode=invalid',
    '?mode=DOWNLOAD',
    '?mode=preview&guardianId=chosen',
  ])
    await request(server)
      .get(`${assetPath}${suffix}`)
      .set('Authorization', `Bearer ${parent.accessToken}`)
      .expect(400);
}
