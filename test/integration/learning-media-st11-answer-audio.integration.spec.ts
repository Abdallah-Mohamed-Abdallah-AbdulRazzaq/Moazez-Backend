import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
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
      const session = await h.prisma.fileUploadSession.findUniqueOrThrow({
        where: { id: upload.ready.uploadId },
      });
      expect(session.durationSeconds).toBeGreaterThan(0);
      expect(session.verificationVersion).toBe('assessment-media-attested-v1');
    },
  );
});
