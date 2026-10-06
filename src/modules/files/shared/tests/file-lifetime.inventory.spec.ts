import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma } from '@prisma/client';
import { hasRetainedFileReferences } from '../infrastructure/file-lifetime.repository';

const physicalReferences = [
  'SchoolProfile.logoFileId',
  'ApplicationDocument.fileId',
  'ApplicantAdmissionRequestDocument.fileId',
  'AcademicContentAsset.fileId',
  'AcademicContentRevisionAsset.fileId',
  'LessonContentItem.fileId',
  'TeacherProfile.avatarFileId',
  'Student.avatarFileId',
  'StudentCredentialBatch.secretArtifactFileId',
  'StudentDocument.fileId',
  'HomeworkSubmissionAttachment.fileId',
  'HomeworkAssignmentAttachment.fileId',
  'ReinforcementSubmission.proofFileId',
  'RewardCatalogItem.imageFileId',
  'HeroBadge.fileId',
  'CommunicationConversation.avatarFileId',
  'CommunicationMessageAttachment.fileId',
  'CommunicationAnnouncement.imageFileId',
  'CommunicationAnnouncementAttachment.fileId',
  'Attachment.fileId',
  'ImportJob.uploadedFileId',
  'FileUploadSession.fileId',
];

describe('Files shared lifetime inventory contract', () => {
  it('makes every physical File relation and provenance exclusion explicit', async () => {
    const schema = readFileSync(
      join(process.cwd(), 'prisma/schema.prisma'),
      'utf8',
    );
    const generated = readFileSync(
      join(process.cwd(), 'node_modules/.prisma/client/schema.prisma'),
      'utf8',
    );
    expect(generated.replace(/\r\n/g, '\n')).toBe(
      schema.replace(/\r\n/g, '\n'),
    );
    const references = Prisma.dmmf.datamodel.models.flatMap((model) =>
      model.fields
        .filter(
          (field) => field.type === 'File' && field.relationFromFields?.length,
        )
        .map((field) => {
          const index = field.relationToFields!.indexOf('id');
          const scalar = model.fields.find(
            (value) => value.name === field.relationFromFields![index],
          )!;
          return {
            identity: `${model.name}.${scalar.name}`,
            sql: `${model.dbName ?? model.name}.${scalar.dbName ?? scalar.name}`,
          };
        }),
    );
    expect(references.map((row) => row.identity).sort()).toEqual(
      physicalReferences.slice().sort(),
    );

    const queryRaw = jest.fn().mockResolvedValue([{ retained: false }]);
    await expect(
      hasRetainedFileReferences({ $queryRaw: queryRaw } as never, 'file-id'),
    ).resolves.toBe(false);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    const [sql, ...parameters] = queryRaw.mock.calls[0] as [
      TemplateStringsArray,
      ...string[],
    ];
    const statement = sql.join('?');
    const consumers = [
      ...statement.matchAll(/FROM public\.(\w+) WHERE (\w+) =/g),
    ].map((match) => `${match[1]}.${match[2]}`);
    expect(consumers.sort()).toEqual(
      references
        .filter((row) => row.identity !== 'FileUploadSession.fileId')
        .map((row) => row.sql)
        .sort(),
    );
    expect(parameters).toHaveLength(21);
    expect(parameters.every((value) => value === 'file-id')).toBe(true);
    expect(statement).not.toContain('school_id');
    expect(statement.match(/deleted_at IS NULL/g)).toHaveLength(1);
    expect(statement).toContain(
      'academic_content_assets WHERE file_id = ?::uuid AND deleted_at IS NULL',
    );
    expect(statement).not.toContain('file_upload_sessions');

    // These UUID scalars have no physical File relation or retention authority.
    expect(physicalReferences).not.toContain('StudentDocument.sourceFileId');
    expect(physicalReferences).not.toContain('SchoolEmailTemplate.logoFileId');
    for (const [modelName, fieldName] of [
      ['StudentDocument', 'sourceFileId'],
      ['SchoolEmailTemplate', 'logoFileId'],
    ]) {
      const model = Prisma.dmmf.datamodel.models.find(
        (row) => row.name === modelName,
      )!;
      expect(model.fields.find((field) => field.name === fieldName)?.kind).toBe(
        'scalar',
      );
      expect(
        model.fields.some(
          (field) =>
            field.type === 'File' &&
            field.relationFromFields?.includes(fieldName),
        ),
      ).toBe(false);
    }
  });
});
