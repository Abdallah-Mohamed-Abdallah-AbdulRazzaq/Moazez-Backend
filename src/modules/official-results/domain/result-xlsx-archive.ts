import { crc32 } from 'node:zlib';
import { fromBuffer } from 'yauzl';
import { ResultImportFileError } from './result-import.contract';

const maxExpanded = 100 * 1024 * 1024;
const maxEntries = 500;
const permittedPart =
  /^(?:\[Content_Types\]\.xml|_rels\/\.rels|docProps\/(?:app|core|custom)\.xml|xl\/(?:workbook|styles|sharedStrings)\.xml|xl\/_rels\/workbook\.xml\.rels|xl\/(?:worksheets\/sheet[1-9]\d{0,3}|theme\/theme[1-9]\d{0,2})\.xml)$/u;

export async function openResultXlsx(
  bytes: Buffer,
): Promise<Map<string, Buffer>> {
  if (
    bytes.length < 22 ||
    !bytes.subarray(0, 4).equals(Buffer.from('504b0304', 'hex'))
  )
    throw new ResultImportFileError('workbook_invalid');
  return new Promise((resolve, reject) => {
    fromBuffer(
      bytes,
      { lazyEntries: true, validateEntrySizes: true, strictFileNames: true },
      (error, archive) => {
        if (error || !archive)
          return reject(new ResultImportFileError('workbook_invalid'));
        let expanded = 0;
        let finished = false;
        const parts = new Map<string, Buffer>();
        const fail = (
          reason = new ResultImportFileError('workbook_invalid'),
        ) => {
          if (finished) return;
          finished = true;
          archive.close();
          reject(reason);
        };
        archive.once('error', () => fail());
        archive.once('end', () => {
          if (finished) return;
          finished = true;
          archive.close();
          resolve(parts);
        });
        if (archive.entryCount > maxEntries)
          return fail(new ResultImportFileError('limit_exceeded'));
        archive.on('entry', (entry) => {
          const name = entry.fileName;
          const path = name.split('/');
          if (
            path.some((segment) => segment === '..' || segment === '.') ||
            name.startsWith('/') ||
            name.includes('\\') ||
            /[:\p{Cc}]/u.test(name) ||
            (entry.generalPurposeBitFlag & 0x41) !== 0 ||
            (entry.compressionMethod !== 0 && entry.compressionMethod !== 8)
          )
            return fail();
          if (
            name.endsWith('/') &&
            /^(?:_rels|docProps|xl|xl\/(?:_rels|worksheets|theme))\/$/u.test(
              name,
            ) &&
            !entry.uncompressedSize
          ) {
            archive.readEntry();
            return;
          }
          if (!permittedPart.test(name) || parts.has(name)) return fail();
          expanded += entry.uncompressedSize;
          if (
            expanded > maxExpanded ||
            entry.uncompressedSize > 100 * Math.max(entry.compressedSize, 1)
          )
            return fail(new ResultImportFileError('limit_exceeded'));
          archive.openReadStream(entry, (readError, stream) => {
            if (readError || !stream) return fail();
            const chunks: Buffer[] = [];
            let size = 0;
            let checksum = 0;
            stream.on('data', (chunk: Buffer) => {
              size += chunk.length;
              if (size > entry.uncompressedSize) {
                stream.destroy();
                fail(new ResultImportFileError('limit_exceeded'));
                return;
              }
              checksum = crc32(chunk, checksum);
              chunks.push(chunk);
            });
            stream.once('error', () => fail());
            stream.once('end', () => {
              if (finished) return;
              if (size !== entry.uncompressedSize || checksum !== entry.crc32)
                return fail();
              parts.set(name, Buffer.concat(chunks, size));
              archive.readEntry();
            });
          });
        });
        archive.readEntry();
      },
    );
  });
}
