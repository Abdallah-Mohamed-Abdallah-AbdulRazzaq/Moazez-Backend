import { crc32, deflateSync } from 'node:zlib';
import { randomUUID } from 'node:crypto';
import type request from 'supertest';
import type { AssessmentMediaUploadDto } from '../../src/modules/files/assessment-media/domain/assessment-media.contract';
import { postAssessmentUpload } from './assessment-media.fixture';

export async function completeAssessmentAuthoringUpload(
  http: ReturnType<typeof request>,
  path: string,
  headers: Record<string, string>,
  originalName: string,
  mime: string,
  bytes: Buffer,
) {
  const created = (
    await http
      .post(path)
      .set(headers)
      .send({
        clientRequestId: randomUUID(),
        originalName,
        expectedMimeType: mime,
        expectedSizeBytes: String(bytes.length),
      })
      .expect(201)
      .expect('Cache-Control', 'private, no-store')
  ).body as AssessmentMediaUploadDto;
  expect(created.status).toBe('UPLOADING');
  expect(
    (await postAssessmentUpload(created.uploadCapability!, bytes, mime)).status,
  ).toBe(204);
  const ready = (
    await http
      .post(path + '/' + created.uploadId + '/complete')
      .set(headers)
      .send({})
      .expect(201)
  ).body as AssessmentMediaUploadDto;
  expect(ready.status).toBe('READY');
  expect(ready.uploadCapability).toBeUndefined();
  await http
    .post(path + '/' + created.uploadId + '/complete')
    .set(headers)
    .send({})
    .expect(201)
    .expect(ready);
  await http
    .get(path + '/' + created.uploadId)
    .set(headers)
    .expect(200)
    .expect(ready);
  return ready;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length);
  chunk.write(type, 4, 'ascii');
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, -4)), chunk.length - 4);
  return chunk;
}

/** A real grayscale PNG with one unfiltered scanline. */
export function assessmentPng(width = 2): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(Buffer.alloc(width + 1, 0))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

export const assessmentJpeg = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD8sXvrmR2d7iV3Y5LM5JJ9TRRRX61H4Uc1b+JL1Z//2Q==',
  'base64',
);

/** A one-page PDF with a conventional cross-reference table and trailer. */
export function assessmentPdf(): Buffer {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 72] >>',
  ];
  let document = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(document.length);
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = document.length;
  const references = offsets
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  document += 'xref\n0 4\n0000000000 65535 f \n' + references;
  document += `trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(document, 'ascii');
}
