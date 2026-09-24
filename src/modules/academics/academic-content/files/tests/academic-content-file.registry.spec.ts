import {
  ACADEMIC_CONTENT_FILE_TYPES,
  resolveAcademicContentFileType,
  verifyAcademicContentSignature,
} from '../domain/academic-content-file.registry';

describe('ACC file registry', () => {
  it('covers the approved V1 pairs without a universal binary fallback', () => {
    expect(ACADEMIC_CONTENT_FILE_TYPES).toHaveLength(23);
    expect(
      resolveAcademicContentFileType('report.PDF', ' APPLICATION/PDF '),
    ).toMatchObject({ category: 'DOCUMENT', inlinePreviewSupported: true });
    expect(
      resolveAcademicContentFileType('report.pdf', 'application/octet-stream'),
    ).toBeNull();
    expect(
      resolveAcademicContentFileType('report.exe', 'application/pdf'),
    ).toBeNull();
    expect(
      resolveAcademicContentFileType(
        'report.docm',
        'application/vnd.ms-word.document.macroEnabled.12',
      ),
    ).toBeNull();
    expect(resolveAcademicContentFileType('movie.mp4', 'audio/mp4')).toBeNull();
  });

  it.each([
    ['x.pdf', 'application/pdf', Buffer.from('%PDF-1.7')],
    ['x.jpg', 'image/jpeg', Buffer.from([0xff, 0xd8, 0xff])],
    ['x.png', 'image/png', Buffer.from('89504e470d0a1a0a', 'hex')],
    [
      'x.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      Buffer.from('504b0304', 'hex'),
    ],
    ['x.doc', 'application/msword', Buffer.from('d0cf11e0a1b11ae1', 'hex')],
    ['x.7z', 'application/x-7z-compressed', Buffer.from('377abcaf271c', 'hex')],
    ['x.mp3', 'audio/mpeg', Buffer.from('ID3')],
    ['x.webp', 'image/webp', Buffer.from('RIFF0000WEBP')],
    ['x.gif', 'image/gif', Buffer.from('GIF89a')],
    ['x.zip', 'application/zip', Buffer.from('504b0304', 'hex')],
    ['x.mp4', 'video/mp4', Buffer.from('0000ftypisom')],
    ['x.m4a', 'audio/mp4', Buffer.from('0000ftypM4A ')],
    ['x.webm', 'video/webm', Buffer.from('1a45dfa3', 'hex')],
    ['x.wav', 'audio/wav', Buffer.from('RIFF0000WAVE')],
    ['x.ogg', 'audio/ogg', Buffer.from('OggS')],
    ['x.txt', 'text/plain', Buffer.from('hello world')],
  ])('recognizes bounded signature for %s', (name, mime, bytes) => {
    const type = resolveAcademicContentFileType(name, mime);
    expect(type).not.toBeNull();
    expect(verifyAcademicContentSignature(type!, bytes)).toBe(true);
    expect(verifyAcademicContentSignature(type!, Buffer.from([0, 1, 2]))).toBe(
      false,
    );
  });

  it('rejects binary payloads disguised as text', () => {
    const type = resolveAcademicContentFileType('notes.txt', 'text/plain');
    expect(type).not.toBeNull();
    expect(
      verifyAcademicContentSignature(type!, Buffer.from([0x41, 0x00, 0x42])),
    ).toBe(false);
    expect(
      verifyAcademicContentSignature(type!, Buffer.from([0xff, 0xfe, 0x00])),
    ).toBe(false);
  });

  it('does not treat unrelated ISO-BMFF brands as MP4', () => {
    const type = resolveAcademicContentFileType('video.mp4', 'video/mp4');
    expect(type).not.toBeNull();
    expect(
      verifyAcademicContentSignature(type!, Buffer.from('0000ftypheic')),
    ).toBe(false);
  });
});
