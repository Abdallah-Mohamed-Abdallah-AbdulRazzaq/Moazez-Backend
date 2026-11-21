import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { buffer } from 'node:stream/consumers';
import { ZipFile } from 'yazl';
import { openResultXlsx } from './result-xlsx-archive';
import { renderResultsXlsx, resultsXlsxMediaType } from './result-xlsx-export';
import { parseResultsXlsx } from './result-xlsx-import';
import { moazezStarterDefinition } from './moazez-starter';
import { csvRecord, encodeSpreadsheetText, fieldHeaders } from './result-csv';
import { identityHeaders, type ExportManifest } from './result-export.contract';
import { parseImportCommand } from './result-import-commands';
import { parseResultCsv } from './result-import-csv';

const definition = moazezStarterDefinition();
const score = definition.fields.find((field) => field.kind === 'SCORE')!;
const note = definition.fields.find((field) => field.kind === 'TEXT')!;
const boolean = {
  ...note,
  id: '1dbb59bc-ebb9-42fe-8635-18206f9ffa57',
  kind: 'BOOLEAN' as const,
  code: 'present',
};
const fields = [score, note, boolean];
const headers = [
  ...identityHeaders,
  ...fields.flatMap((field) => fieldHeaders(field, false)),
];
const manifest = {
  fields,
  headers,
  request: { mode: 'EDIT_DRAFT' },
  exportRef: '12a704af-fbe8-4131-b492-3846ad1c047e',
  exportedAt: '2026-11-21T09:00:00.000Z',
} as unknown as ExportManifest;
const identity = [
  manifest.exportRef,
  '6f1c3432-8aaa-48af-8a53-864672600165',
  'sheet',
  'slot',
  'enrollment',
  '0000123',
  'مريم عبد الله',
  'مدرسة معزز',
  '٢٠٢٦',
  'الفترة الأولى',
  'الفصل الأول',
  'ابتدائي',
  'الرابع',
  'أ',
  'فصل 1',
  'الرياضيات',
  'schema',
  manifest.exportedAt,
];
const literal = '​＝1+1,\n~mztext:literal "\'_x0041_\t"';
const row = [...identity, '0.00', '', literal, '', 'false', ''];
const eligiblePart = 'xl/worksheets/sheet2.xml';

async function buildZip(parts: Map<string, Buffer>) {
  const archive = new ZipFile();
  const contents = buffer(archive.outputStream);
  for (const [path, bytes] of parts)
    archive.addBuffer(bytes, path, { compress: true });
  archive.end();
  return contents;
}

async function changedWorkbook(change: (parts: Map<string, Buffer>) => void) {
  const parsed = await openResultXlsx(await renderResultsXlsx(manifest, [row]));
  change(parsed);
  return buildZip(parsed);
}

describe('Official Results native XLSX wire format', () => {
  it('T081 and T084 round-trip literal text, leading-zero codes, Arabic, recorded zero and false with typed CSV parity', async () => {
    expect(resultsXlsxMediaType).toContain('spreadsheetml');
    const bytes = await renderResultsXlsx(manifest, [row]);
    if (process.env.MOAZEZ_XLSX_EDITOR_FIXTURE)
      writeFileSync(process.env.MOAZEZ_XLSX_EDITOR_FIXTURE, bytes);
    expect(bytes).toEqual(await renderResultsXlsx(manifest, [row]));
    const native = await parseResultsXlsx(bytes);
    const portable = parseResultCsv(
      Buffer.from(
        csvRecord(headers.map(encodeSpreadsheetText)) +
          csvRecord([
            ...identity.map(encodeSpreadsheetText),
            '0.00',
            '',
            encodeSpreadsheetText(literal),
            '',
            'false',
            '',
          ]),
      ),
    );
    expect(native.header).toEqual(portable.header);
    expect(native.records[0].cells).toEqual(row);
    expect(native.records[0].types?.[5]).toBe('text');
    expect(native.records[0].types?.[18]).toBe('number');
    expect(native.records[0].types?.[22]).toBe('text');
    const semantic = (input: typeof native) =>
      fields.map((field, index) =>
        parseImportCommand(
          field,
          input.records[0].cells[18 + 2 * index],
          input.records[0].cells[19 + 2 * index],
          input.decodeText,
        ),
      );
    expect(semantic(native)).toEqual(semantic(portable));
    const parts = await openResultXlsx(bytes);
    expect(parts.get(eligiblePart)?.toString()).toContain('state="frozen"');
    expect(parts.get(eligiblePart)?.toString()).toContain(
      'dataValidation type="list"',
    );
    expect(parts.get(eligiblePart)?.toString()).toContain('<sheetProtection');
    expect(parts.get(eligiblePart)?.toString()).toContain('<autoFilter');
    expect(parts.get('xl/workbook.xml')?.toString()).toContain(
      'name="Instructions"',
    );
  });

  const resaved = process.env.MOAZEZ_XLSX_EDITOR_RESAVED;
  if (resaved) {
    it('reads the workbook saved by the configured spreadsheet editor', async () => {
      const workbook = await parseResultsXlsx(readFileSync(resaved));
      expect(workbook.header).toEqual(headers);
      expect(workbook.records).toHaveLength(1);
      expect(workbook.records[0].cells.slice(0, 18)).toEqual(identity);
      expect(workbook.records[0].cells[20]).toBe(literal);
      expect(workbook.records[0].cells[22]).toBe('false');
    });
  }

  it.each([
    [
      'cached formula',
      (parts: Map<string, Buffer>) => {
        const original = parts.get(eligiblePart)!.toString();
        parts.set(
          eligiblePart,
          Buffer.from(original.replace('<v>0.00</v>', '<f>1+1</f><v>2</v>')),
        );
      },
      'formula_not_allowed',
    ],
    [
      'macro entry',
      (parts: Map<string, Buffer>) => {
        parts.set('xl/vbaProject.bin', Buffer.from('unsupported'));
      },
      'workbook_invalid',
    ],
    [
      'external relationship',
      (parts: Map<string, Buffer>) => {
        const path = 'xl/_rels/workbook.xml.rels';
        const original = parts.get(path)!.toString();
        parts.set(
          path,
          Buffer.from(
            original.replace(
              'Target="styles.xml"',
              'TargetMode="External" Target="https://example.invalid/styles.xml"',
            ),
          ),
        );
      },
      'workbook_invalid',
    ],
    [
      'date cell',
      (parts: Map<string, Buffer>) => {
        const original = parts.get(eligiblePart)!.toString();
        parts.set(
          eligiblePart,
          Buffer.from(
            original.replace('r="S2" s="2" t="n"', 'r="S2" s="2" t="d"'),
          ),
        );
      },
      'workbook_invalid',
    ],
    [
      'XML entity declaration',
      (parts: Map<string, Buffer>) => {
        const original = parts.get(eligiblePart)!.toString();
        parts.set(
          eligiblePart,
          Buffer.from(
            original.replace(
              '<worksheet',
              '<!DOCTYPE worksheet SYSTEM "https://example.invalid/entity"><worksheet',
            ),
          ),
        );
      },
      'workbook_invalid',
    ],
    [
      'XML depth',
      (parts: Map<string, Buffer>) => {
        const original = parts.get(eligiblePart)!.toString();
        parts.set(
          eligiblePart,
          Buffer.from(
            original.replace(
              '</worksheet>',
              '<deep>'.repeat(65) + '</deep>'.repeat(65) + '</worksheet>',
            ),
          ),
        );
      },
      'limit_exceeded',
    ],
    [
      'excess ratio',
      (parts: Map<string, Buffer>) => {
        parts.set(eligiblePart, Buffer.alloc(300_000, 65));
      },
      'limit_exceeded',
    ],
    [
      'excess entries',
      (parts: Map<string, Buffer>) => {
        for (let index = 1; index <= 500; index++) {
          parts.set(
            'xl/worksheets/sheet' + (600 + index) + '.xml',
            randomBytes(4),
          );
        }
      },
      'limit_exceeded',
    ],
  ] as const)('T082/T083 rejects %s', async (_label, change, issue) => {
    await expect(
      parseResultsXlsx(await changedWorkbook(change)),
    ).rejects.toMatchObject({ issue });
  });

  it('rejects encrypted archive flags and traversal filenames before reading data', async () => {
    const original = await renderResultsXlsx(manifest, [row]);
    const encrypted = Buffer.from(original);
    const firstEntry = encrypted.indexOf(Buffer.from('504b0102', 'hex'));
    encrypted.writeUInt16LE(
      encrypted.readUInt16LE(firstEntry + 8) | 1,
      firstEntry + 8,
    );
    await expect(parseResultsXlsx(encrypted)).rejects.toMatchObject({
      issue: 'workbook_invalid',
    });
    const traversal = Buffer.from(original);
    const standard = Buffer.from('xl/workbook.xml');
    const path = Buffer.from('../workbook.xml');
    expect(standard.length).toBe(path.length);
    for (
      let offset = traversal.indexOf(standard);
      offset !== -1;
      offset = traversal.indexOf(standard, offset + path.length)
    )
      path.copy(traversal, offset);
    await expect(parseResultsXlsx(traversal)).rejects.toMatchObject({
      issue: 'workbook_invalid',
    });
  });
});
