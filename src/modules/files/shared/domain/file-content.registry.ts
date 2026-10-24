export type FileContentCategory =
  | 'DOCUMENT'
  | 'IMAGE'
  | 'VIDEO'
  | 'AUDIO'
  | 'ARCHIVE'
  | 'OTHER';
export type FileContentSignature =
  | 'pdf'
  | 'text'
  | 'jpeg'
  | 'png'
  | 'webp'
  | 'gif'
  | 'zip'
  | 'ole'
  | 'sevenZip'
  | 'bmff'
  | 'webm'
  | 'mp3'
  | 'wav'
  | 'ogg';
export type FileContentType = Readonly<{
  extension: string;
  mimeType: string;
  category: FileContentCategory;
  signature: FileContentSignature;
  inlinePreviewSupported: boolean;
}>;

const entries: FileContentType[] = [
  ['.pdf', 'application/pdf', 'DOCUMENT', 'pdf', true],
  ['.txt', 'text/plain', 'DOCUMENT', 'text', true],
  ['.csv', 'text/csv', 'DOCUMENT', 'text', false],
  ['.doc', 'application/msword', 'DOCUMENT', 'ole', false],
  [
    '.docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'DOCUMENT',
    'zip',
    false,
  ],
  ['.xls', 'application/vnd.ms-excel', 'DOCUMENT', 'ole', false],
  [
    '.xlsx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'DOCUMENT',
    'zip',
    false,
  ],
  ['.ppt', 'application/vnd.ms-powerpoint', 'DOCUMENT', 'ole', false],
  [
    '.pptx',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'DOCUMENT',
    'zip',
    false,
  ],
  ['.jpg', 'image/jpeg', 'IMAGE', 'jpeg', true],
  ['.jpeg', 'image/jpeg', 'IMAGE', 'jpeg', true],
  ['.png', 'image/png', 'IMAGE', 'png', true],
  ['.webp', 'image/webp', 'IMAGE', 'webp', true],
  ['.gif', 'image/gif', 'IMAGE', 'gif', true],
  ['.mp4', 'video/mp4', 'VIDEO', 'bmff', true],
  ['.webm', 'video/webm', 'VIDEO', 'webm', true],
  ['.mp3', 'audio/mpeg', 'AUDIO', 'mp3', true],
  ['.m4a', 'audio/mp4', 'AUDIO', 'bmff', true],
  ['.wav', 'audio/wav', 'AUDIO', 'wav', true],
  ['.ogg', 'audio/ogg', 'AUDIO', 'ogg', true],
  ['.webm', 'audio/webm', 'AUDIO', 'webm', true],
  ['.zip', 'application/zip', 'ARCHIVE', 'zip', false],
  ['.7z', 'application/x-7z-compressed', 'ARCHIVE', 'sevenZip', false],
].map(([extension, mimeType, category, signature, inlinePreviewSupported]) => ({
  extension: extension as string,
  mimeType: mimeType as string,
  category: category as FileContentCategory,
  signature: signature as FileContentSignature,
  inlinePreviewSupported: inlinePreviewSupported as boolean,
}));

export const FILE_CONTENT_TYPES: readonly FileContentType[] =
  Object.freeze(entries);

export function resolveFileContentType(
  originalName: string,
  mimeType: string,
): FileContentType | null {
  const extension = /\.[^.]+$/u.exec(originalName)?.[0].toLowerCase();
  const normalizedMime = mimeType.trim().toLowerCase();
  return (
    entries.find(
      (entry) =>
        entry.extension === extension && entry.mimeType === normalizedMime,
    ) ?? null
  );
}

export function verifyFileContentSignature(
  type: FileContentType,
  bytes: Buffer,
): boolean {
  const hex = bytes.toString('hex');
  const ascii = bytes.toString('latin1');
  switch (type.signature) {
    case 'pdf':
      return ascii.startsWith('%PDF-');
    case 'jpeg':
      return hex.startsWith('ffd8ff');
    case 'png':
      return hex.startsWith('89504e470d0a1a0a');
    case 'gif':
      return ascii.startsWith('GIF87a') || ascii.startsWith('GIF89a');
    case 'webp':
      return ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP';
    case 'wav':
      return ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WAVE';
    case 'ogg':
      return ascii.startsWith('OggS');
    case 'zip':
      return (
        hex.startsWith('504b0304') ||
        hex.startsWith('504b0506') ||
        hex.startsWith('504b0708')
      );
    case 'ole':
      return hex.startsWith('d0cf11e0a1b11ae1');
    case 'sevenZip':
      return hex.startsWith('377abcaf271c');
    case 'bmff':
      return (
        bytes.length >= 12 &&
        ascii.slice(4, 8) === 'ftyp' &&
        (type.category === 'AUDIO'
          ? ['M4A ', 'isom', 'iso2', 'mp41', 'mp42'].includes(
              ascii.slice(8, 12),
            )
          : ['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'MSNV'].includes(
              ascii.slice(8, 12),
            ))
      );
    case 'webm':
      return hex.startsWith('1a45dfa3');
    case 'mp3':
      return (
        ascii.startsWith('ID3') ||
        (bytes.length >= 2 &&
          bytes[0] === 0xff &&
          (bytes[1] & 0xe0) === 0xe0 &&
          (bytes[1] & 0x18) !== 0x08)
      );
    case 'text':
      return (
        bytes.length > 0 &&
        !bytes.includes(0) &&
        !bytes.some((byte) => byte < 9 || (byte > 13 && byte < 32)) &&
        new TextDecoder('utf-8', { fatal: true }).decode(bytes, {
          stream: true,
        }).length > 0
      );
  }
}
