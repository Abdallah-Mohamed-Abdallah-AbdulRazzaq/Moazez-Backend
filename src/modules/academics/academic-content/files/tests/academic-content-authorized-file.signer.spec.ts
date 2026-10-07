import { StorageService } from '../../../../../infrastructure/storage/storage.service';
import { AcademicContentAuthorizedFileSigner } from '../application/academic-content-authorized-file.signer';

describe('ACC-10D shared authorized File signer', () => {
  const storage = { createDownloadUrl: jest.fn() };
  const signer = new AcademicContentAuthorizedFileSigner(
    storage as unknown as StorageService,
  );
  const file = {
    bucket: 'private-fixture',
    objectKey: 'private/object',
    originalName: 'resource.pdf',
    mimeType: 'application/pdf',
  };
  const now = new Date('2026-10-07T12:00:00.000Z');
  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers().setSystemTime(now);
    storage.createDownloadUrl.mockResolvedValue({
      url: 'https://capability.invalid/short-lived',
      expiresAt: now,
      bucket: 'must-not-leave-boundary',
    });
  });
  afterEach(() => jest.useRealTimers());

  it.each(['download', 'preview'] as const)(
    '%s returns only a capability with persisted MIME, disposition and 300 second TTL',
    async (mode) => {
      await expect(
        signer.sign(file, mode, { allowInlinePreview: true }),
      ).resolves.toEqual({ url: 'https://capability.invalid/short-lived' });
      expect(storage.createDownloadUrl).toHaveBeenCalledWith({
        bucket: file.bucket,
        objectKey: file.objectKey,
        expiresInSeconds: 300,
        contentType: file.mimeType,
        downloadFileName: file.originalName,
        disposition: mode === 'preview' ? 'inline' : 'attachment',
      });
    },
  );
  it('sanitizes the original name before signing', async () => {
    await signer.sign(
      { ...file, originalName: '../../resource\r\n.pdf' },
      'download',
      { allowInlinePreview: false },
    );
    const request = (
      storage.createDownloadUrl.mock.calls as [
        Parameters<StorageService['createDownloadUrl']>[0],
      ][]
    )[0][0];
    expect(request.downloadFileName).not.toMatch(/[\\/\r\n]/);
  });
  it.each([90_900, 1_900, 300_900, 900_000])(
    'bounds TTL against finite remaining visibility of %i milliseconds',
    async (remaining) => {
      await signer.sign(
        file,
        'download',
        { allowInlinePreview: false },
        new Date(now.getTime() + remaining),
      );
      expect(storage.createDownloadUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          expiresInSeconds: Math.min(300, Math.floor(remaining / 1000)),
        }),
      );
    },
  );
  it.each([999, 0, -1])(
    'denies %i milliseconds remaining without signing',
    async (remaining) => {
      await expect(
        signer.sign(
          file,
          'download',
          { allowInlinePreview: false },
          new Date(now.getTime() + remaining),
        ),
      ).rejects.toMatchObject({ code: 'not_found', httpStatus: 404 });
      expect(storage.createDownloadUrl).not.toHaveBeenCalled();
    },
  );
  it.each([
    ['resource.pdf', 'application/pdf'],
    ['image.png', 'image/png'],
    ['video.mp4', 'video/mp4'],
    ['audio.mp3', 'audio/mpeg'],
  ])('previews supported %s', async (originalName, mimeType) => {
    await signer.sign({ ...file, originalName, mimeType }, 'preview', {
      allowInlinePreview: true,
    });
    expect(storage.createDownloadUrl).toHaveBeenCalledWith(
      expect.objectContaining({ disposition: 'inline', contentType: mimeType }),
    );
  });
  it.each([
    [
      'document.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    ['archive.zip', 'application/zip'],
    ['mismatch.png', 'application/pdf'],
    ['unsupported.exe', 'application/octet-stream'],
  ])(
    'denies unsupported preview %s while allowing downloads',
    async (originalName, mimeType) => {
      const candidate = { ...file, originalName, mimeType };
      await expect(
        signer.sign(candidate, 'preview', { allowInlinePreview: true }),
      ).rejects.toMatchObject({
        code: 'academic_content.file.preview_unavailable',
        httpStatus: 403,
      });
      expect(storage.createDownloadUrl).not.toHaveBeenCalled();
      await signer.sign(candidate, 'download', { allowInlinePreview: true });
      expect(storage.createDownloadUrl).toHaveBeenCalledTimes(1);
    },
  );
  it('denies disabled inline policy without signing', async () => {
    await expect(
      signer.sign(file, 'preview', { allowInlinePreview: false }),
    ).rejects.toMatchObject({
      code: 'academic_content.file.preview_unavailable',
      httpStatus: 403,
    });
    expect(storage.createDownloadUrl).not.toHaveBeenCalled();
  });
  it('propagates storage failure', async () => {
    const failure = new Error('fixture provider failure');
    storage.createDownloadUrl.mockRejectedValue(failure);
    await expect(
      signer.sign(file, 'download', { allowInlinePreview: false }),
    ).rejects.toBe(failure);
  });
});
