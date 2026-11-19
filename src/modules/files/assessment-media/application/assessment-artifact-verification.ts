import { readFile } from 'node:fs/promises';
import { addAbortSignal, Readable } from 'node:stream';
import { crc32, createInflate } from 'node:zlib';
import { AssessmentMediaException } from '../domain/assessment-media.contract';

const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');
const PNG_DEPTHS: Readonly<Record<number, readonly number[]>> = {
  0: [1, 2, 4, 8, 16],
  2: [8, 16],
  3: [1, 2, 4, 8],
  4: [8, 16],
  6: [8, 16],
};
const PNG_CHANNELS: Readonly<Record<number, number>> = {
  0: 1,
  2: 3,
  3: 1,
  4: 2,
  6: 4,
};
const ADAM7_PASSES = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
];
const MAX_PDF_XREF_DECODED_BYTES = 32 * 1024 * 1024;

function invalid(): never {
  throw new AssessmentMediaException('verification_failed');
}

/** Checks framing on the same bounded artifact that is hashed and stored. */
export async function inspectAssessmentArtifact(
  path: string,
  mimeType: string,
  bounds: { maximumWidth: number; maximumHeight: number },
  signal: AbortSignal,
): Promise<void> {
  switch (mimeType) {
    case 'image/png':
      return inspectPng(await readFile(path, { signal }), bounds, signal);
    case 'image/jpeg':
      return inspectJpeg(await readFile(path, { signal }), bounds);
    case 'application/pdf':
      return inspectPdf(await readFile(path, { signal }), signal);
  }
}

async function inspectPng(
  bytes: Buffer,
  {
    maximumWidth,
    maximumHeight,
  }: { maximumWidth: number; maximumHeight: number },
  signal: AbortSignal,
): Promise<void> {
  if (
    bytes.length < 45 ||
    !bytes.subarray(0, 8).equals(PNG_SIGNATURE) ||
    bytes.readUInt32BE(8) !== 13 ||
    bytes.toString('ascii', 12, 16) !== 'IHDR'
  )
    invalid();
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const depth = bytes[24];
  const colorType = bytes[25];
  const interlace = bytes[28];
  if (
    width < 1 ||
    width > maximumWidth ||
    height < 1 ||
    height > maximumHeight ||
    !PNG_DEPTHS[colorType]?.includes(depth) ||
    bytes[26] !== 0 ||
    bytes[27] !== 0 ||
    interlace > 1
  )
    invalid();

  const compressed: Buffer[] = [];
  let compressedBytes = 0;
  let hasPalette = false;
  let dataEnded = false;
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('latin1', offset + 4, offset + 8);
    const data = offset + 8;
    const end = data + length;
    if (
      end + 4 > bytes.length ||
      !/^[A-Za-z]{4}$/u.test(type) ||
      crc32(bytes.subarray(offset + 4, end)) !== bytes.readUInt32BE(end)
    )
      invalid();
    if (type === 'IDAT') {
      if (dataEnded || (colorType === 3 && !hasPalette)) invalid();
      compressedBytes += length;
      if (length) compressed.push(bytes.subarray(data, end));
    } else {
      if (compressedBytes > 0) dataEnded = true;
      if (type === 'IEND') {
        if (length !== 0 || end + 4 !== bytes.length || !compressedBytes)
          invalid();
        const passes = interlace ? ADAM7_PASSES : [[0, 0, 1, 1]];
        const rows = passes
          .map(([x, y, dx, dy]) => ({
            count: Math.ceil((height - y) / dy),
            width: Math.ceil((width - x) / dx),
          }))
          .filter(({ count, width: passWidth }) => count > 0 && passWidth > 0)
          .map(({ count, width: passWidth }) => ({
            count,
            size:
              1 + Math.ceil((passWidth * depth * PNG_CHANNELS[colorType]) / 8),
          }));
        return inspectPngScanlines(compressed, compressedBytes, rows, signal);
      }
      if (type === 'PLTE') {
        if (
          dataEnded ||
          hasPalette ||
          colorType === 0 ||
          colorType === 4 ||
          length < 3 ||
          length > 768 ||
          length % 3 !== 0 ||
          (colorType === 3 && length / 3 > 2 ** depth)
        )
          invalid();
        hasPalette = true;
      } else if (
        (type === 'IHDR' && offset !== 8) ||
        (type !== 'IHDR' && /^[A-Z]/u.test(type)) ||
        ['acTL', 'fcTL', 'fdAT'].includes(type)
      )
        invalid();
    }
    offset = end + 4;
  }
  invalid();
}

async function inspectPngScanlines(
  compressed: Buffer[],
  compressedBytes: number,
  passes: { count: number; size: number }[],
  signal: AbortSignal,
): Promise<void> {
  const source = Readable.from(compressed, { objectMode: false, signal });
  const inflate = addAbortSignal(signal, createInflate());
  source.on('error', (error) => inflate.destroy(error));
  source.pipe(inflate);
  let pass = 0;
  let row = 0;
  let remaining = 0;
  try {
    for await (const chunk of inflate as AsyncIterable<Buffer>) {
      let offset = 0;
      while (offset < chunk.length) {
        if (!remaining) {
          const current = passes[pass];
          if (!current || chunk[offset] > 4) invalid();
          remaining = current.size;
          if (++row === current.count) {
            pass++;
            row = 0;
          }
        }
        const consumed = Math.min(remaining, chunk.length - offset);
        offset += consumed;
        remaining -= consumed;
      }
    }
    if (
      pass !== passes.length ||
      remaining ||
      inflate.bytesWritten !== compressedBytes
    )
      invalid();
  } catch {
    invalid();
  } finally {
    source.destroy();
    inflate.destroy();
  }
}

function inspectJpeg(
  bytes: Buffer,
  {
    maximumWidth,
    maximumHeight,
  }: { maximumWidth: number; maximumHeight: number },
): void {
  if (bytes.length < 4 || bytes.readUInt16BE(0) !== 0xffd8) invalid();
  let offset = 2;
  let components = 0;
  let hasScan = false;
  let hasQuantizationTable = false;
  let hasHuffmanTable = false;
  while (offset < bytes.length) {
    if (bytes[offset++] !== 0xff) invalid();
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9) {
      if (!hasScan || offset !== bytes.length) invalid();
      return;
    }
    if (
      marker === 0 ||
      marker === 0xd8 ||
      (marker >= 0xd0 && marker <= 0xd7) ||
      offset + 2 > bytes.length
    )
      invalid();
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) invalid();
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (components || length < 11) invalid();
      const height = bytes.readUInt16BE(offset + 3);
      const width = bytes.readUInt16BE(offset + 5);
      components = bytes[offset + 7];
      if (
        components < 1 ||
        components > 4 ||
        length !== 8 + 3 * components ||
        width < 1 ||
        width > maximumWidth ||
        height < 1 ||
        height > maximumHeight
      )
        invalid();
    }
    if (marker === 0xdb) hasQuantizationTable ||= length >= 67;
    if (marker === 0xc4) hasHuffmanTable ||= length >= 20;
    if (marker !== 0xda) {
      offset += length;
      continue;
    }
    const scanComponents = bytes[offset + 2];
    if (
      !hasQuantizationTable ||
      !hasHuffmanTable ||
      !scanComponents ||
      scanComponents > components ||
      length !== 6 + 2 * scanComponents
    )
      invalid();
    const scanStart = offset + length;
    offset = nextJpegMarker(bytes, scanStart);
    if (offset <= scanStart) invalid();
    hasScan = true;
  }
  invalid();
}

function nextJpegMarker(bytes: Buffer, start: number): number {
  for (let offset = start; offset < bytes.length; ) {
    const markerStart = bytes.indexOf(0xff, offset);
    if (markerStart < 0) break;
    let markerOffset = markerStart + 1;
    while (bytes[markerOffset] === 0xff) markerOffset++;
    const marker = bytes[markerOffset];
    if (marker !== 0 && !(marker >= 0xd0 && marker <= 0xd7)) return markerStart;
    offset = markerOffset + 1;
  }
  return -1;
}

async function inspectPdf(bytes: Buffer, signal: AbortSignal): Promise<void> {
  const header = bytes.toString('latin1', 0, 12);
  const tailStart = Math.max(0, bytes.length - 4096);
  const tail = bytes.toString('latin1', tailStart);
  const trailer =
    /[\r\n]startxref[ \t\r\n]+([0-9]{1,10})[ \t\r\n]+%%EOF[ \t\r\n\f]*$/u.exec(
      tail,
    );
  if (!/^%PDF-(1\.[0-7]|2\.0)[\r\n]/u.test(header) || !trailer) invalid();
  const end = tailStart + trailer.index;
  const xref = Number(trailer[1]);
  if (xref < 9 || xref >= end) invalid();
  const section = bytes.toString('latin1', xref, end);
  const table = /^xref[ \t]*(?:\r\n?|\n)/u.exec(section);
  if (table) {
    inspectPdfXrefTable(section, table[0].length, bytes.length);
    return;
  }
  await inspectPdfXrefStream(section, bytes.subarray(xref, end), signal);
}

function inspectPdfXrefTable(
  section: string,
  start: number,
  fileSize: number,
): void {
  const subsection = /[ \t\r\n]*(\d{1,10})[ \t]+(\d{1,10})[ \t]*(?:\r\n?|\n)/uy;
  const entry = /([0-9]{10}) ([0-9]{5}) ([nf])[ \t]*(?:\r\n?|\n)/uy;
  let cursor = start;
  let hasEntries = false;
  while (cursor < section.length) {
    subsection.lastIndex = cursor;
    const header = subsection.exec(section);
    if (!header) break;
    const count = Number(header[2]);
    cursor = subsection.lastIndex;
    if (count < 1 || count > (section.length - cursor) / 18) invalid();
    for (let index = 0; index < count; index++) {
      entry.lastIndex = cursor;
      const row = entry.exec(section);
      if (
        !row ||
        (row[3] === 'n' && (Number(row[1]) < 9 || Number(row[1]) >= fileSize))
      )
        invalid();
      cursor = entry.lastIndex;
    }
    hasEntries = true;
  }
  const trailer = section.slice(cursor).trimEnd();
  if (
    !hasEntries ||
    !/^[ \t\r\n]*trailer[ \t\r\n]*<</u.test(trailer) ||
    !trailer.endsWith('>>')
  )
    invalid();
}

async function inspectPdfXrefStream(
  section: string,
  bytes: Buffer,
  signal: AbortSignal,
): Promise<void> {
  const header = section.slice(0, 4096);
  const streamStart = />>[ \t\r\n]*stream(?:\r\n|\n|\r)/u.exec(header);
  if (!streamStart) invalid();
  const dictionary = header.slice(0, streamStart.index);
  const length =
    /\/Length[ \t\r\n]+([0-9]{1,10})(?=$|[ \t\r\n/>])(?![ \t\r\n]+\d+[ \t\r\n]+R\b)/u.exec(
      dictionary,
    );
  const widths =
    /\/W[ \t\r\n]*\[[ \t\r\n]*(\d+)[ \t\r\n]+(\d+)[ \t\r\n]+(\d+)[ \t\r\n]*\]/u.exec(
      dictionary,
    );
  const size = /\/Size[ \t\r\n]+([0-9]{1,10})\b/u.exec(dictionary);
  if (
    !/^\d+[ \t]+\d+[ \t\r\n]+obj[ \t\r\n]*<</u.test(dictionary) ||
    !/\/Type[ \t\r\n]*\/XRef\b/u.test(dictionary) ||
    !length ||
    Number(length[1]) < 1 ||
    !size ||
    Number(size[1]) < 1 ||
    !widths ||
    widths.slice(1).every((value) => Number(value) === 0)
  )
    invalid();
  const dataStart = streamStart.index + streamStart[0].length;
  const dataEnd = dataStart + Number(length[1]);
  if (
    !/^[\r\n]+endstream[ \t\r\n]+endobj[ \t\r\n]*$/u.test(
      section.slice(dataEnd),
    )
  )
    invalid();
  const flate =
    /\/Filter[ \t\r\n]*(?:\/FlateDecode\b|\[[ \t\r\n]*\/FlateDecode[ \t\r\n]*\])/u;
  if (flate.test(dictionary)) {
    const compressed = bytes.subarray(dataStart, dataEnd);
    const inflate = addAbortSignal(signal, createInflate());
    let decodedBytes = 0;
    try {
      inflate.end(compressed);
      for await (const chunk of inflate as AsyncIterable<Buffer>) {
        decodedBytes += chunk.length;
        if (decodedBytes > MAX_PDF_XREF_DECODED_BYTES) invalid();
      }
      if (!decodedBytes || inflate.bytesWritten !== compressed.length)
        invalid();
    } catch {
      invalid();
    } finally {
      inflate.destroy();
    }
  }
}
