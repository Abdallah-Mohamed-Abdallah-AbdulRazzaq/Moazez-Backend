import { randomUUID } from 'node:crypto';
import {
  AcademicContentACC12JourneyFixture,
  JourneyContent,
  JourneyDetail,
  JourneyPublication,
} from '../fixtures/academic-content-acc12-journey.fixture';
import {
  ACADEMIC_CONTENT_PUBLICATION_QUEUE,
  academicContentPublicationJobId,
} from '../../src/modules/academics/academic-content/domain/academic-content-publication-runtime.constants';

describe('ACC-12 private file and immutable link composed journeys', () => {
  jest.setTimeout(120_000);
  const f = new AcademicContentACC12JourneyFixture();
  beforeAll(() => f.start());
  afterAll(() => f.stop());
  async function author(type: 'SUBJECT_RESOURCE' | 'GENERAL_RESOURCE') {
    const result = await f.http<JourneyContent>(
      'post',
      'academics/academic-content',
      'school',
      {
        academicYearId: f.school.yearId,
        termId: f.school.termId,
        type,
        audience: 'STUDENTS_AND_GUARDIANS',
        title: `ACC12 ${type}`,
      },
    );
    await f.http(
      'put',
      `academics/academic-content/${result.body.id}/targets`,
      'school',
      {
        targets: [
          {
            scopeType: 'CLASSROOM',
            classroomId: f.school.classroomId,
            ...(type === 'SUBJECT_RESOURCE'
              ? { subjectId: f.school.subjectId }
              : {}),
          },
        ],
      },
    );
    return result.body.id;
  }
  async function publish(id: string) {
    const intent = await f.http<JourneyPublication>(
      'post',
      `academics/academic-content/${id}/publications`,
      'school',
      { clientRequestId: randomUUID() },
    );
    await f.completed(
      ACADEMIC_CONTENT_PUBLICATION_QUEUE,
      academicContentPublicationJobId('publish', {
        schoolId: f.school.schoolId,
        contentId: id,
        publicationId: intent.body.publicationId,
      }),
    );
    return intent.body;
  }

  it('J6: guarded upload with ACC12IsolatedStorageProviderContractDouble verifies bytes and grants 307 private capabilities', async () => {
    const id = await author('SUBJECT_RESOURCE'),
      path = `academics/academic-content/${id}`;
    await f.http('put', `${path}/details/subject-resource`, 'school', {
      resourceCategory: 'DOCUMENT',
    });
    const bytes = Buffer.from('%PDF-1.7\nACC12 private bytes\n');
    const uploadBody = () => ({
      clientRequestId: randomUUID(),
      originalName: 'acc12.pdf',
      expectedMimeType: 'application/pdf',
      expectedSizeBytes: String(bytes.length),
    });
    await f.http('post', `${path}/uploads`, 'student', uploadBody(), 403);
    await f.http(
      'post',
      `${path}/uploads`,
      'school',
      { ...uploadBody(), expectedMimeType: 'text/html' },
      400,
    );
    // A wrong provider MIME is rejected by the real verifier, not the double.
    const rejected = await f.http<{ uploadId: string }>(
      'post',
      `${path}/uploads`,
      'school',
      uploadBody(),
    );
    const rejectedSession = await f.prisma.fileUploadSession.findUniqueOrThrow({
      where: { id: rejected.body.uploadId },
    });
    await f.storage.putObject({
      bucket: rejectedSession.finalBucket,
      objectKey: rejectedSession.finalObjectKey,
      body: bytes,
      contentType: 'text/plain',
    });
    await f.http(
      'post',
      `${path}/uploads/${rejected.body.uploadId}/complete`,
      'school',
      undefined,
      409,
    );
    expect(
      await f.prisma.academicContentAsset.count({
        where: { academicContentId: id },
      }),
    ).toBe(0);
    const intent = await f.http<{
      uploadId: string;
      capabilityExpiresAt: string;
      sessionUrl: string;
    }>('post', `${path}/uploads`, 'school', uploadBody());
    expect(intent.headers['cache-control']).toBe(
      'no-store, private, max-age=0',
    );
    const session = await f.prisma.fileUploadSession.findUniqueOrThrow({
      where: { id: intent.body.uploadId },
    });
    expect(
      JSON.stringify(session, (_key, value: unknown) =>
        typeof value === 'bigint' ? value.toString() : value,
      ),
    ).not.toContain(intent.body.sessionUrl);
    await f.storage.putObject({
      bucket: session.finalBucket,
      objectKey: session.finalObjectKey,
      body: bytes,
      contentType: 'application/pdf',
    });
    const completed = await f.http<{
      file: { id: string; mimeType: string; sizeBytes: string };
      asset: { fileId: string };
    }>(
      'post',
      `${path}/uploads/${intent.body.uploadId}/complete`,
      'school',
      undefined,
      200,
    );
    expect(completed.body.file).toMatchObject({
      mimeType: 'application/pdf',
      sizeBytes: String(bytes.length),
    });
    expect(completed.body.asset.fileId).toBe(completed.body.file.id);
    const verified = await f.prisma.fileUploadSession.findUniqueOrThrow({
      where: { id: intent.body.uploadId },
    });
    expect(verified).toMatchObject({
      status: 'READY',
      verifiedMimeType: 'application/pdf',
      actualSizeBytes: BigInt(bytes.length),
    });
    const publication = await publish(id);
    expect(
      await f.prisma.academicContentRevisionAsset.count({
        where: {
          revisionId: publication.revisionId,
          fileId: completed.body.file.id,
        },
      }),
    ).toBe(1);
    const detail = await f.http<JourneyDetail>(
      'get',
      `student/academic-content/${id}`,
      'student',
    );
    expect(detail.body.content.assets.map((a) => a.fileId)).toContain(
      completed.body.file.id,
    );
    const capabilityPath = `student/academic-content/${id}/assets/${completed.body.file.id}/access`;
    await f.http(
      'get',
      `${capabilityPath}?mode=preview`,
      'foreignStudent',
      undefined,
      404,
    );
    for (const mode of ['preview', 'download'] as const) {
      const access = await f.http(
        'get',
        `${capabilityPath}?mode=${mode}`,
        'student',
        undefined,
        307,
      );
      expect(access.headers['cache-control']).toBe(
        'no-store, private, max-age=0',
      );
      expect(access.headers.location).toMatch(
        /^https:\/\/storage\.acc12\.invalid\/get\?capability=/,
      );
      await f.http(
        'post',
        `student/academic-content/${id}/engagement-events`,
        'student',
        {
          expectedPublicationId: publication.publicationId,
          clientRequestId: randomUUID(),
          fileId: completed.body.file.id,
          eventType: mode === 'preview' ? 'FILE_PREVIEWED' : 'FILE_DOWNLOADED',
        },
        200,
      );
    }
    expect(
      f.storage.issuedGets.map(
        (g) => g.overrides?.contentDisposition?.split(';')[0],
      ),
    ).toEqual(['inline', 'attachment']);
    expect(
      f.storage.issuedGets.every(
        (g) => g.expiresInSeconds > 0 && g.expiresInSeconds <= 900,
      ),
    ).toBe(true);
    const events = await f.prisma.academicContentEngagementEvent.findMany({
      where: { academicContentId: id },
    });
    expect(events.map((e) => e.eventType).sort()).toEqual([
      'FILE_DOWNLOADED',
      'FILE_PREVIEWED',
    ]);
    expect(
      events.every(
        (e) =>
          e.publicationId === publication.publicationId &&
          e.fileId === completed.body.file.id,
      ),
    ).toBe(true);
  });

  it('J7: published RevisionLink and exact click attribution survive governed authoring replacement', async () => {
    const id = await author('GENERAL_RESOURCE'),
      path = `academics/academic-content/${id}`;
    await f.http('put', `${path}/links`, 'school', {
      links: [{ label: 'Original', url: 'https://example.org/acc12/original' }],
    });
    const publication = await publish(id);
    const detail = await f.http<JourneyDetail>(
      'get',
      `student/academic-content/${id}`,
      'student',
    );
    const link = detail.body.content.links[0];
    expect(link.url).toBe('https://example.org/acc12/original');
    await f.http(
      'post',
      `student/academic-content/${id}/engagement-events`,
      'student',
      {
        expectedPublicationId: publication.publicationId,
        clientRequestId: randomUUID(),
        eventType: 'LINK_CLICKED',
        revisionLinkId: randomUUID(),
      },
      404,
    );
    await f.http(
      'post',
      `student/academic-content/${id}/engagement-events`,
      'parent',
      {
        expectedPublicationId: publication.publicationId,
        clientRequestId: randomUUID(),
        eventType: 'LINK_CLICKED',
        revisionLinkId: link.revisionLinkId,
      },
      403,
    );
    const click = await f.http<{ eventId: string }>(
      'post',
      `student/academic-content/${id}/engagement-events`,
      'student',
      {
        expectedPublicationId: publication.publicationId,
        clientRequestId: randomUUID(),
        eventType: 'LINK_CLICKED',
        revisionLinkId: link.revisionLinkId,
      },
      200,
    );
    const history =
      await f.prisma.academicContentRevisionLink.findUniqueOrThrow({
        where: { id: link.revisionLinkId },
      });
    const attribution =
      await f.prisma.academicContentEngagementEvent.findUniqueOrThrow({
        where: { id: click.body.eventId },
      });
    await f.http(
      'post',
      `${path}/publications/${publication.publicationId}/revise`,
      'school',
      {},
      200,
    );
    await f.http('put', `${path}/links`, 'school', {
      links: [
        { label: 'Replacement', url: 'https://example.org/acc12/replacement' },
      ],
    });
    expect(
      await f.prisma.academicContentRevisionLink.findUniqueOrThrow({
        where: { id: history.id },
      }),
    ).toEqual(history);
    expect(
      await f.prisma.academicContentEngagementEvent.findUniqueOrThrow({
        where: { id: attribution.id },
      }),
    ).toEqual(attribution);
    expect(attribution).toMatchObject({
      revisionLinkId: history.id,
      publicationId: publication.publicationId,
      revisionId: publication.revisionId,
    });
    await f.http(
      'post',
      `student/academic-content/${id}/engagement-events`,
      'student',
      {
        expectedPublicationId: publication.publicationId,
        clientRequestId: randomUUID(),
        eventType: 'LINK_CLICKED',
        revisionLinkId: history.id,
      },
      404,
    );
  });
});
