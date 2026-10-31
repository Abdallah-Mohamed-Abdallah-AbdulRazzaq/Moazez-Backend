import {
  St11MultipartHttp,
  groupAssetStimulus,
} from '../fixtures/st11-multipart.http';
import type { St10bDomain } from '../fixtures/st10b-runtime.http';
import { st06Json } from '../fixtures/homework-question-assets.http';
import { hasRetainedFileReferences } from '../../src/modules/files/shared/infrastructure/file-lifetime.repository';

describe('ST11-B actual group-owned private media and File lifetime', () => {
  jest.setTimeout(180000);
  const h = new St11MultipartHttp();
  beforeAll(() => h.start());
  beforeEach(() => h.reset());
  afterEach(() => h.disposeMultipartCase());
  afterAll(() => h.close());
  const domains = ['Homework', 'Grades'] as St10bDomain[];
  it.each(domains)(
    '%s rejects publication when a referenced shared File becomes unavailable',
    async (domain) => {
      const f = await h.grouped(domain);
      const ready = await h.fixture.ready(
        f.parentId,
        f.author,
        Buffer.from('Required publication display'),
        domain === 'Homework'
          ? 'HOMEWORK_ASSIGNMENT_MEDIA'
          : 'GRADE_ASSESSMENT_MEDIA',
      );
      const created = await h
        .http()
        .post(f.groups + '/' + f.groupId + '/assets')
        .set(h.headers(f.author))
        .send({
          sourceType: 'MANAGED_FILE',
          fileId: ready.fileId,
          uploadId: ready.uploadId,
        })
        .expect(201);
      const asset = st06Json<{ id: string }>(created);
      const updated = await h
        .http()
        .patch(f.groups + '/' + f.groupId + '/assets/' + asset.id)
        .set(h.headers(f.author))
        .send({
          title: 'Updated shared document',
          description: 'Current display metadata',
          sortOrder: 7,
        })
        .expect(200);
      expect(
        st06Json<{ id: string; title: string; sortOrder: number }>(updated),
      ).toMatchObject({
        id: asset.id,
        title: 'Updated shared document',
        sortOrder: 7,
      });
      expect(JSON.stringify(st06Json(updated))).not.toMatch(
        /"(?:bucket|objectKey|uploadCapability)"/u,
      );
      await h
        .http()
        .patch(f.groups + '/' + f.groupId + '/assets/' + asset.id)
        .set(h.headers(f.author))
        .send({ fileId: ready.fileId })
        .expect(400);
      await h
        .http()
        .patch(f.groups + '/' + f.groupId)
        .set(h.headers(f.author))
        .send({ sharedStimulus: groupAssetStimulus(asset.id) })
        .expect(200);
      await h.prisma.file.update({
        where: { id: ready.fileId },
        data: { deletedAt: new Date() },
      });
      const view = st06Json<{
        groups: Array<{
          sharedStimulusSupported: boolean;
          sharedStimulus?: unknown;
          assets: Array<{ available: boolean }>;
        }>;
      }>(await h.http().get(f.groups).set(h.headers(f.author)).expect(200));
      expect(view.groups[0].sharedStimulusSupported).toBe(false);
      expect(view.groups[0]).not.toHaveProperty('sharedStimulus');
      expect(view.groups[0].assets[0].available).toBe(false);
      await h
        .http()
        .post(f.publish)
        .set(h.headers(f.author))
        .send({})
        .expect(400);
      const status =
        domain === 'Homework'
          ? (
              await h.prisma.homeworkAssignment.findUniqueOrThrow({
                where: { id: f.parentId },
              })
            ).status
          : (
              await h.prisma.gradeAssessment.findUniqueOrThrow({
                where: { id: f.parentId },
              })
            ).approvalStatus;
      expect(status).toBe('DRAFT');
    },
  );
  it.each(domains)(
    '%s enforces safe external group sources and the shared parent reference limit',
    async (domain) => {
      const f = await h.grouped(domain),
        assetPath = f.groups + '/' + f.groupId + '/assets';
      for (const externalUrl of [
        'http://example.org/source',
        'https://127.0.0.1/source',
        'https://objects.s3.amazonaws.com/source',
        'https://example.org/source?credential=secret',
      ])
        await h
          .http()
          .post(assetPath)
          .set(h.headers(f.author))
          .send({
            sourceType: 'EXTERNAL_HTTPS',
            category: 'DOCUMENT',
            externalUrl,
          })
          .expect(400);
      const existingReferences =
        domain === 'Homework'
          ? await h.prisma.homeworkQuestionAsset.count({
              where: {
                deletedAt: null,
                homeworkQuestion: {
                  homeworkAssignmentId: f.parentId,
                  deletedAt: null,
                },
              },
            })
          : await h.prisma.gradeAssessmentQuestionAsset.count({
              where: {
                deletedAt: null,
                gradeAssessmentQuestion: {
                  assessmentId: f.parentId,
                  deletedAt: null,
                },
              },
            });
      for (let index = 0; index < 8 - existingReferences; index++) {
        const result = await h
          .http()
          .post(assetPath)
          .set(h.headers(f.author))
          .send({
            sourceType: 'EXTERNAL_HTTPS',
            category: 'DOCUMENT',
            externalUrl: 'https://example.org/source' + index,
          })
          .expect(201);
        expect(
          st06Json<{ available: boolean; externalUrl: string }>(result),
        ).toMatchObject({
          available: true,
          externalUrl: 'https://example.org/source' + index,
        });
      }
      const command = {
        sourceType: 'EXTERNAL_HTTPS',
        category: 'DOCUMENT',
        externalUrl: 'https://example.org/excess',
      };
      await h
        .http()
        .post(assetPath)
        .set(h.headers(f.author))
        .send(command)
        .expect(400);
      await h
        .http()
        .post(
          f.authorPath + '/questions/' + f.answers[0].questionId + '/assets',
        )
        .set(h.headers(f.author))
        .send(command)
        .expect(409);
      if (domain === 'Grades')
        await h
          .http()
          .post(f.authorPath + '/assets')
          .set(h.headers(f.author))
          .send(command)
          .expect(409);
    },
  );
  it.each(domains)(
    '%s verifies parent-scoped source reuse and actual Student/Teacher GET HEAD Range bytes',
    async (domain) => {
      const f = await h.grouped(domain),
        bytes = Buffer.from('ST11 owned group source bytes\n');
      await h.prisma.schoolAssessmentMediaPolicy.update({
        where: { schoolId: h.fixture.school.schoolId },
        data: { allowInlinePreview: true, allowDownload: true },
      });
      const ready = await h.fixture.ready(
        f.parentId,
        f.author,
        bytes,
        domain === 'Homework'
          ? 'HOMEWORK_ASSIGNMENT_MEDIA'
          : 'GRADE_ASSESSMENT_MEDIA',
      );
      const command = {
        sourceType: 'MANAGED_FILE',
        uploadId: ready.uploadId,
        fileId: ready.fileId,
      };
      const created = await h
        .http()
        .post(f.groups + '/' + f.groupId + '/assets')
        .set(h.headers(f.author))
        .send(command)
        .expect(201);
      const asset = st06Json<{ id: string }>(created);
      const second = await h
        .http()
        .post(f.groups)
        .set(h.headers(f.author))
        .send({ title: 'Shared source second group' })
        .expect(201);
      const groups = st06Json<{ groups: Array<{ id: string }> }>(second).groups,
        g2 = groups.find((g) => g.id !== f.groupId)!.id;
      await h
        .http()
        .patch(f.groups + '/' + g2)
        .set(h.headers(f.author))
        .send({ sharedStimulus: groupAssetStimulus(asset.id) })
        .expect(400);
      const reused = await h
        .http()
        .post(f.groups + '/' + g2 + '/assets')
        .set(h.headers(f.author))
        .send(command)
        .expect(201);
      expect(st06Json<{ id: string }>(reused).id).not.toBe(asset.id);
      const questionAssets =
        f.authorPath + '/questions/' + f.answers[2].questionId + '/assets';
      await h
        .http()
        .post(questionAssets)
        .set(h.headers(f.author))
        .send(command)
        .expect(201);
      if (domain === 'Grades')
        await h
          .http()
          .post(f.authorPath + '/assets')
          .set(h.headers(f.author))
          .send(command)
          .expect(201);
      expect(
        await h.prisma.fileUploadSession.count({
          where: { purposeContextId: f.parentId, status: 'READY' },
        }),
      ).toBe(1);
      await h
        .http()
        .patch(f.groups + '/' + f.groupId)
        .set(h.headers(f.author))
        .send({ sharedStimulus: groupAssetStimulus(asset.id) })
        .expect(200);
      await h
        .http()
        .post(f.publish)
        .set(h.headers(f.author))
        .send({})
        .expect(domain === 'Homework' ? 200 : 201);
      const content =
        f.student + '/groups/' + f.groupId + '/assets/' + asset.id;
      const full = await h
        .http()
        .get(content + '/download')
        .set(h.headers('student'))
        .expect(200);
      expect(full.text).toBe(bytes.toString());
      expect(full.headers['cache-control']).toContain('no-store');
      expect(full.headers['x-content-type-options']).toBe('nosniff');
      const part = await h
        .http()
        .get(content + '/preview')
        .set(h.headers('student'))
        .set('Range', 'bytes=2-7')
        .expect(206);
      expect(part.text).toBe(bytes.subarray(2, 8).toString());
      await h
        .http()
        .head(content + '/download')
        .set(h.headers('student'))
        .set('Range', 'bytes=2-7')
        .expect(200)
        .expect('Content-Length', String(bytes.length));
      await h
        .http()
        .get(content + '/download')
        .set(h.headers('student'))
        .set('Range', 'bytes=9999-')
        .expect(416);
      const fallback = await h
        .http()
        .get(content + '/download')
        .set(h.headers('student'))
        .set('Range', 'bytes=2-7')
        .set('If-Range', '"stale"')
        .expect(200);
      expect(fallback.text).toBe(bytes.toString());
      const reviewer =
        domain === 'Homework'
          ? f.groups
          : `/api/v1/teacher/classroom/${h.fixture.allocations.teacher}/grades/assessments/${f.parentId}/groups`;
      await h
        .http()
        .get(reviewer + '/' + f.groupId + '/assets/' + asset.id + '/download')
        .set(h.headers())
        .expect(200);
      if (domain === 'Grades')
        await h
          .http()
          .get(content + '/download')
          .set(h.headers('otherStudent'))
          .expect(200);
      else
        await h
          .http()
          .get(content + '/download')
          .set(h.headers('otherStudent'))
          .expect(404);
      for (const actor of ['foreignStudent', 'parent'] as const) {
        const denied = await h
          .http()
          .get(content + '/download')
          .set(h.headers(actor));
        expect([403, 404]).toContain(denied.status);
      }
      const wrong = reviewer.replace(
        h.fixture.allocations.teacher,
        h.fixture.allocations.otherTeacher,
      );
      const denied = await h
        .http()
        .get(wrong + '/' + f.groupId + '/assets/' + asset.id + '/download')
        .set(h.headers('otherTeacher'));
      expect([403, 404]).toContain(denied.status);
      await h.prisma.schoolAssessmentMediaPolicy.update({
        where: { schoolId: h.fixture.school.schoolId },
        data: { allowInlinePreview: false, allowDownload: false },
      });
      await h
        .http()
        .get(content + '/download')
        .set(h.headers('student'))
        .expect(404);
    },
  );
  it.each(domains)(
    '%s safely detaches deleted groups, prevents stale reference revival and retains physical Files',
    async (domain) => {
      const f = await h.grouped(domain),
        ready = await h.fixture.ready(
          f.parentId,
          f.author,
          Buffer.from('retained'),
          domain === 'Homework'
            ? 'HOMEWORK_ASSIGNMENT_MEDIA'
            : 'GRADE_ASSESSMENT_MEDIA',
        );
      const created = await h
        .http()
        .post(f.groups + '/' + f.groupId + '/assets')
        .set(h.headers(f.author))
        .send({
          sourceType: 'MANAGED_FILE',
          uploadId: ready.uploadId,
          fileId: ready.fileId,
        })
        .expect(201);
      const asset = st06Json<{ id: string }>(created);
      await h
        .http()
        .patch(f.groups + '/' + f.groupId)
        .set(h.headers(f.author))
        .send({ sharedStimulus: groupAssetStimulus(asset.id) })
        .expect(200);
      await h
        .http()
        .delete(f.groups + '/' + f.groupId + '/assets/' + asset.id)
        .set(h.headers(f.author))
        .expect(400);
      await h
        .http()
        .delete(f.groups + '/' + f.groupId)
        .set(h.headers(f.author))
        .expect(204);
      const list = await h
        .http()
        .get(f.groups)
        .set(h.headers(f.author))
        .expect(200);
      expect(
        st06Json<{ groups: object[]; displayItems: object[] }>(list).groups,
      ).toHaveLength(0);
      expect(
        st06Json<{ displayItems: object[] }>(list).displayItems,
      ).toHaveLength(11);
      expect(
        (await h.stored(domain, f.answers[0].questionId)).groupId,
      ).toBeNull();
      expect(
        await h.prisma.$transaction((tx) =>
          hasRetainedFileReferences(tx, ready.fileId),
        ),
      ).toBe(true);
      await expect(
        h.prisma.file.delete({ where: { id: ready.fileId } }),
      ).rejects.toThrow();
      const revive =
        domain === 'Homework'
          ? h.prisma.homeworkQuestionGroupAsset.update({
              where: { id: asset.id },
              data: { deletedAt: null },
            })
          : h.prisma.gradeAssessmentQuestionGroupAsset.update({
              where: { id: asset.id },
              data: { deletedAt: null },
            });
      await expect(revive).rejects.toThrow();
      await h
        .http()
        .get(f.groups + '/' + f.groupId + '/assets/' + asset.id + '/download')
        .set(h.headers(f.author))
        .expect(404);
      expect(
        (await h.prisma.file.findUniqueOrThrow({ where: { id: ready.fileId } }))
          .deletedAt,
      ).toBeNull();
    },
  );
});
