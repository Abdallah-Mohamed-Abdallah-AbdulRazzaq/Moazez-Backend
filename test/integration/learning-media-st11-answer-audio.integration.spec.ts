import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import type { AssessmentMediaUploadDto } from '../../src/modules/files/assessment-media/domain/assessment-media.contract';
import { postAssessmentUpload } from '../fixtures/assessment-media.fixture';
import { St11AnswerMediaHttp } from '../fixtures/st11-answer-media.http';
import { st06Json } from '../fixtures/homework-question-assets.http';
import type { St10bDomain } from '../fixtures/st10b-runtime.http';

/** Mandatory media-storage owner: actual locked Linux FFprobe/FFmpeg and owned MinIO. */
describe('ST11-A real audio answers in the canonical media runtime', () => {
  jest.setTimeout(180000);
  const h = new St11AnswerMediaHttp();
  const directory = mkdtempSync(join(tmpdir(), 'moazez-st11-audio-'));
  beforeAll(() => h.start());
  beforeEach(() => h.reset());
  afterEach(() => h.disposeAnswerCase());
  afterAll(async () => {
    await h.close();
    if (
      !resolve(directory).startsWith(resolve(tmpdir()) + '/moazez-st11-audio-')
    )
      throw new Error('Unexpected owned audio directory');
    rmSync(directory, { recursive: true, force: true });
  });
  const cases = (['Homework', 'Grades'] as St10bDomain[]).flatMap((domain) =>
    [
      ['audio/mpeg', 'mp3', 'libmp3lame'],
      ['audio/mp4', 'm4a', 'aac'],
      ['audio/webm', 'webm', 'libopus'],
    ].map(([mime, extension, codec]) => ({ domain, mime, extension, codec })),
  );
  it.each(cases)(
    '$domain verifies, binds, streams and submits actual $mime bytes',
    async ({ domain, mime, extension, codec }) => {
      const f = await h.setupResponse(domain, 'AUDIO_ONLY');
      await h.prisma.schoolAssessmentMediaPolicy.update({
        where: { schoolId: h.fixture.school.schoolId },
        data: {
          allowedMimeTypes: [mime],
          allowInlinePreview: true,
          allowDownload: true,
        },
      });
      const file = join(directory, 'answer.' + extension);
      execFileSync(
        '/usr/bin/ffmpeg',
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-y',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=440:duration=0.3',
          '-c:a',
          codec,
          file,
        ],
        { stdio: 'ignore', timeout: 15000 },
      );
      const bytes = readFileSync(file),
        upload = await h.ready(f.media, bytes, mime);
      const bound = await h
        .http()
        .post(f.media + '/answer-assets')
        .set(h.headers('student'))
        .send({ uploadId: upload.ready.uploadId })
        .expect(201);
      const assetId = st06Json<{ asset: { id: string } }>(bound).asset.id;
      const full = await h
        .http()
        .get(f.media + '/answer-assets/' + assetId + '/download')
        .set(h.headers('student'))
        .buffer(true)
        .expect(200);
      expect(full.body).toEqual(bytes);
      await h
        .http()
        .head(f.media + '/answer-assets/' + assetId + '/preview')
        .set(h.headers('student'))
        .expect(200)
        .expect('Content-Length', String(bytes.length));
      const range = await h
        .http()
        .get(f.media + '/answer-assets/' + assetId + '/preview')
        .set(h.headers('student'))
        .set('Range', 'bytes=0-9')
        .buffer(true)
        .expect(206);
      expect(range.body).toEqual(bytes.subarray(0, 10));
      await h
        .http()
        .post(f.student + '/submission/submit')
        .set(h.headers('student'))
        .send({})
        .expect(domain === 'Homework' ? 200 : 201);
      if (domain === 'Homework') {
        // The repaired review fence must accept actual verified Audio answers,
        // under the existing Teacher review grant, without a Core manage grant.
        await h.prisma.rolePermission.deleteMany({
          where: {
            roleId: h.fixture.actors.teacher.roleId,
            permission: {
              code: {
                notIn: [
                  'homework.submissions.review',
                  'homework.assignments.view',
                  'homework.submissions.view',
                ],
              },
            },
          },
        });
        const submission = await h.prisma.homeworkSubmission.findFirstOrThrow({
          where: { homeworkTargetId: f.contextId },
        });
        const answer = await h.prisma.homeworkSubmissionAnswer.findFirstOrThrow(
          {
            where: {
              homeworkSubmissionId: submission.id,
              homeworkQuestionId: f.questionId,
            },
          },
        );
        const review = f.author + '/submissions/' + submission.id;
        await h
          .http()
          .patch(review + '/answers/' + answer.id + '/review')
          .set(h.headers())
          .send({ awardedPoints: 1 })
          .expect(200);
        await h
          .http()
          .post(review + '/review')
          .set(h.headers())
          .send({})
          .expect(200);
        const reviewed = await h.prisma.homeworkSubmission.findUniqueOrThrow({
          where: { id: submission.id },
        });
        expect(reviewed.status).toBe('REVIEWED');
        expect(Number(reviewed.awardedMarks)).toBe(1);
        expect(
          await h.prisma.gradeItem.count({
            where: { schoolId: submission.schoolId },
          }),
        ).toBe(0);
      }
      const session = await h.prisma.fileUploadSession.findUniqueOrThrow({
        where: { id: upload.ready.uploadId },
      });
      expect(session.durationSeconds).toBeGreaterThan(0);
      expect(session.verificationVersion).toBe('assessment-media-technical-v1');
    },
  );
  it.each([
    { test: 'H.264 MP4', format: 'mp4', codec: 'libx264', failure: null },
    { test: 'VP8 WebM', format: 'webm', codec: 'libvpx', failure: null },
    {
      test: 'unapproved MPEG-4 codec',
      format: 'mp4',
      codec: 'mpeg4',
      failure: 'codec',
    },
    {
      test: 'School dimension limit',
      format: 'mp4',
      codec: 'libx264',
      failure: 'width',
    },
    {
      test: 'actual FFprobe timeout',
      format: 'webm',
      codec: 'libvpx',
      failure: 'timeout',
    },
  ])(
    'verifies actual authoring video for $test',
    async ({ format, codec, failure }) => {
      const mime = `video/${format}`;
      const assessment = await h.fixture.assessment();
      await h.prisma.schoolAssessmentMediaPolicy.update({
        where: { schoolId: h.fixture.school.schoolId },
        data: {
          allowedMimeTypes: [mime],
          ...(failure === 'width' ? { maximumWidth: 40 } : {}),
        },
      });
      const filename = `stimulus.${format}`;
      const local = join(directory, filename);
      execFileSync(
        '/usr/bin/ffmpeg',
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-y',
          '-f',
          'lavfi',
          '-i',
          'color=c=blue:s=64x48:r=8:d=0.5',
          '-an',
          '-c:v',
          codec,
          '-threads',
          '1',
          '-pix_fmt',
          'yuv420p',
          local,
        ],
        { stdio: 'ignore', timeout: 15_000 },
      );
      const bytes = readFileSync(local);
      const path = `/api/v1/grades/assessments/${assessment.id}/authoring/uploads`;
      const headers = h.headers('admin');
      const received = await h
        .http()
        .post(path)
        .set(headers)
        .send({
          clientRequestId: randomUUID(),
          originalName: filename,
          expectedMimeType: mime,
          expectedSizeBytes: String(bytes.length),
        })
        .expect(201);
      const upload = st06Json<AssessmentMediaUploadDto>(received);
      expect(
        (await postAssessmentUpload(upload.uploadCapability!, bytes, mime))
          .status,
      ).toBe(204);
      const config = h.app.get(ConfigService);
      const deadline = config.getOrThrow<number>('FFPROBE_TIMEOUT_MS');
      if (failure === 'timeout') config.set('FFPROBE_TIMEOUT_MS', 1);
      try {
        const completion = await h
          .http()
          .post(path + '/' + upload.uploadId + '/complete')
          .set(headers)
          .send({})
          .expect(failure ? 409 : 201);
        const row = await h.prisma.fileUploadSession.findUniqueOrThrow({
          where: { id: upload.uploadId },
        });
        if (failure) {
          expect(completion.body).toMatchObject({
            error: { code: 'assessment_media.verification_failed' },
          });
          expect(row).toMatchObject({ status: 'FAILED', fileId: null });
        } else {
          expect(row).toMatchObject({
            status: 'READY',
            verifiedMimeType: mime,
            width: 64,
            height: 48,
          });
          expect(row.fileId).toEqual(expect.any(String));
          expect(row.durationSeconds).toBeGreaterThan(0);
        }
      } finally {
        config.set('FFPROBE_TIMEOUT_MS', deadline);
      }
    },
  );

  it('rejects a real answer audio stream above the approved School duration', async () => {
    const f = await h.setupResponse('Homework', 'AUDIO_ONLY');
    const mime = 'audio/mpeg';
    await h.prisma.schoolAssessmentMediaPolicy.update({
      where: { schoolId: h.fixture.school.schoolId },
      data: { allowedMimeTypes: [mime], maximumDurationSeconds: 1 },
    });
    const local = join(directory, 'duration.mp3');
    execFileSync(
      '/usr/bin/ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=3',
        '-c:a',
        'libmp3lame',
        local,
      ],
      { stdio: 'ignore', timeout: 15_000 },
    );
    const bytes = readFileSync(local);
    const { intent } = await h.prepare(f.media, bytes, mime);
    expect(
      (await postAssessmentUpload(intent.uploadCapability!, bytes, mime))
        .status,
    ).toBe(204);
    const denied = await h
      .http()
      .post(f.media + '/answer-uploads/' + intent.uploadId + '/complete')
      .set(h.headers('student'))
      .send({})
      .expect(409);
    expect(denied.body).toMatchObject({
      error: { code: 'assessment_media.verification_failed' },
    });
    expect(
      await h.prisma.fileUploadSession.findUniqueOrThrow({
        where: { id: intent.uploadId },
      }),
    ).toMatchObject({ status: 'FAILED', fileId: null });
  });
});
