import type { Response } from 'supertest';
import { StorageService } from '../../src/infrastructure/storage/storage.service';
import { St11AnswerMediaHttp } from '../fixtures/st11-answer-media.http';

const prefix = '/api/v1';
const filePermissions = [
  'communication.messages.view',
  'communication.messages.attachments.manage',
  'communication.announcements.view',
  'communication.announcements.manage',
  'files.downloads.view',
  'files.uploads.manage',
];

function absent(response: Response) {
  const body = response.body as { error?: { code?: string } };
  expect(body.error?.code).toEqual(expect.any(String));
  expect(response.headers.location).toBeUndefined();
  expect(JSON.stringify(response.body)).not.toMatch(
    /objectKey|bucket|securityEvidence|storage\.invalid/i,
  );
}

describe('Assessment File provenance on general HTTP consumers', () => {
  jest.setTimeout(180_000);
  const h = new St11AnswerMediaHttp();
  beforeAll(() => h.start());
  beforeEach(async () => {
    await h.reset();
    for (const actor of ['admin', 'teacher', 'organization'] as const)
      await h.fixture.grantAssets(
        h.fixture.actors[actor].roleId,
        filePermissions,
      );
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    const where = { schoolId: h.fixture.school.schoolId };
    await h.prisma.communicationMessageAttachment.deleteMany({ where });
    await h.prisma.communicationMessage.deleteMany({ where });
    await h.prisma.communicationConversationParticipant.deleteMany({ where });
    await h.prisma.communicationConversation.deleteMany({ where });
    await h.prisma.communicationAnnouncementAttachment.deleteMany({ where });
    await h.prisma.communicationAnnouncement.deleteMany({ where });
    await h.disposeAnswerCase();
  });
  afterAll(() => h.close());

  async function message() {
    const schoolId = h.fixture.school.schoolId;
    const adminId = h.fixture.actors.admin.userId;
    const teacherId = h.fixture.actors.teacher.userId;
    const conversation = await h.prisma.communicationConversation.create({
      data: {
        schoolId,
        createdById: adminId,
        type: 'GROUP',
        titleEn: 'Disposable conversation',
      },
    });
    await h.prisma.communicationConversationParticipant.createMany({
      data: [
        {
          schoolId,
          conversationId: conversation.id,
          userId: adminId,
          role: 'OWNER',
        },
        {
          schoolId,
          conversationId: conversation.id,
          userId: teacherId,
          role: 'MEMBER',
        },
      ],
    });
    return h.prisma.communicationMessage.create({
      data: {
        schoolId,
        conversationId: conversation.id,
        senderUserId: adminId,
        body: 'Disposable message',
      },
    });
  }

  it.each(['Homework', 'Grades'] as const)(
    'keeps %s Answer Files within their original resource and excludes legacy general references',
    async (domain) => {
      const f = await h.setupResponse(domain);
      await h.prisma.schoolAssessmentMediaPolicy.update({
        where: { schoolId: h.fixture.school.schoolId },
        data: { allowDownload: true },
      });
      const owned = await h.bindReady(f.media);
      const target = await message();
      const base = `${prefix}/communication/messages/${target.id}/attachments`;
      const headers = h.headers('admin');
      absent(
        await h
          .http()
          .post(base)
          .set(headers)
          .send({ fileId: owned.asset.fileId })
          .expect(404),
      );
      expect(
        await h.prisma.communicationMessageAttachment.count({
          where: { messageId: target.id },
        }),
      ).toBe(0);

      // Seed an old, inadmissible relationship only in this disposable database.
      const historicalLink =
        await h.prisma.communicationMessageAttachment.create({
          data: {
            schoolId: target.schoolId,
            conversationId: target.conversationId,
            messageId: target.id,
            uploadedById: target.senderUserId,
            fileId: owned.asset.fileId,
          },
        });
      const messages = `${prefix}/teacher/messages/conversations/${target.conversationId}/messages`;
      const adapter = `${messages}/${target.id}/attachments/${historicalLink.id}`;
      const teacherHeaders = h.headers('teacher');
      const visible = await h
        .http()
        .get(messages)
        .set(teacherHeaders)
        .expect(200);
      expect(visible.body).toMatchObject({
        messages: [{ messageId: target.id, attachments: [] }],
      });
      const storage = h.app.get(StorageService);
      const unexpected = new Error('Ineligible attachment reached storage');
      const signing = jest
        .spyOn(storage, 'createDownloadUrl')
        .mockRejectedValue(unexpected);
      const stat = jest
        .spyOn(storage, 'statObject')
        .mockRejectedValue(unexpected);
      const read = jest
        .spyOn(storage, 'getObject')
        .mockRejectedValue(unexpected);
      for (const mode of ['download', 'preview']) {
        absent(
          await h
            .http()
            .get(`${adapter}/${mode}`)
            .set(teacherHeaders)
            .expect(404),
        );
        absent(
          await h
            .http()
            .get(`${adapter}/${mode}/content`)
            .set(teacherHeaders)
            .set('Range', 'bytes=0-1')
            .expect(404),
        );
        const head = await h
          .http()
          .head(`${adapter}/${mode}/content`)
          .set(teacherHeaders)
          .expect(404);
        expect(head.headers.location).toBeUndefined();
        expect(head.headers['content-range']).toBeUndefined();
      }
      expect(signing).not.toHaveBeenCalled();
      expect(stat).not.toHaveBeenCalled();
      expect(read).not.toHaveBeenCalled();
      jest.restoreAllMocks();
      const listed = await h.http().get(base).set(headers).expect(200);
      expect(listed.body).toMatchObject({ items: [] });
      expect(
        await h.prisma.communicationMessageAttachment.count({
          where: { id: historicalLink.id },
        }),
      ).toBe(1);

      await h
        .http()
        .get(`${f.media}/answer-assets/${owned.asset.id}/download`)
        .set(h.headers('student'))
        .expect(200)
        .expect(owned.bytes.toString());
    },
  );

  it('allows general attachment uploads while filtering technical, historical and foreign Assessment Files from announcements', async () => {
    const schoolId = h.fixture.school.schoolId;
    const teacher = await h.fixture.graph();
    const foreign = await h.fixture.graph('foreignTeacher');
    const technical = await h.fixture.ready(teacher.homework.id);
    const attested = await h.fixture.historicalHomeworkReady(
      teacher.homework.id,
    );
    const otherSchool = await h.fixture.ready(
      foreign.homework.id,
      'foreignTeacher',
    );
    const announcement = await h.prisma.communicationAnnouncement.create({
      data: {
        schoolId,
        title: 'Disposable announcement',
        body: 'Test content',
      },
    });
    const path = `${prefix}/communication/announcements/${announcement.id}/attachments`;
    const headers = h.headers('admin');
    for (const fileId of [
      technical.fileId,
      attested.fileId,
      otherSchool.fileId,
    ]) {
      absent(
        await h.http().post(path).set(headers).send({ fileId }).expect(404),
      );
    }
    absent(
      await h
        .http()
        .post(path)
        .set(h.headers('organization'))
        .send({ fileId: technical.fileId })
        .expect(404),
    );
    expect(
      await h.prisma.communicationAnnouncementAttachment.count({
        where: { announcementId: announcement.id },
      }),
    ).toBe(0);
    await h.prisma.communicationAnnouncementAttachment.create({
      data: {
        schoolId,
        announcementId: announcement.id,
        fileId: attested.fileId,
      },
    });
    const listed = await h.http().get(path).set(headers).expect(200);
    expect(listed.body).toMatchObject({ items: [] });

    const bytes = Buffer.from('ordinary general attachment');
    const uploaded = await h
      .http()
      .post(prefix + '/files')
      .set(headers)
      .attach('file', bytes, {
        filename: 'ordinary.txt',
        contentType: 'text/plain',
      })
      .expect(201);
    const fileId = (uploaded.body as { id: string }).id;
    const file = await h.prisma.file.findUniqueOrThrow({
      where: { id: fileId },
    });
    try {
      await h.http().post(path).set(headers).send({ fileId }).expect(201);
      const current = await h.http().get(path).set(headers).expect(200);
      expect((current.body as { items: unknown[] }).items).toHaveLength(1);
      const redirect = await h
        .http()
        .get(`${prefix}/files/${fileId}/download`)
        .set(headers)
        .expect(307);
      const url = new URL(String(redirect.headers.location));
      expect(url.origin).toBe(new URL(process.env.STORAGE_ENDPOINT!).origin);
      const download = await fetch(url);
      expect(download.status).toBe(200);
      expect(Buffer.from(await download.arrayBuffer())).toEqual(bytes);
    } finally {
      await h.fixture.storage.deleteObject({
        bucket: file.bucket,
        objectKey: file.objectKey,
      });
    }
  });
});
