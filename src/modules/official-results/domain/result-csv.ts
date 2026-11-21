import { randomUUID } from 'node:crypto';
import { buffer } from 'node:stream/consumers';
import { ZipFile } from 'yazl';
import { OfficialResultsError } from './official-results.error';
import type { ResultField } from './result-definition';
import type { ResultValue } from './result-value';
import {
  identityHeaders,
  type ExportManifest,
  type ExportRequest,
  type ExportSheetPlan,
} from './result-export.contract';
import { resultContentDigest } from './result-content-digest';
import { renderResultsXlsx, resultsXlsxMediaType } from './result-xlsx-export';

const prefix = '~mztext:';
const unsafeFirst = new Set(['=', '+', '-', '@', "'"]);
const maxPhysicalCells = 1_000_000;
const maxPackageBytes = 100 * 1024 * 1024;
const packagedInstructions = [
  'Blank VALUE and STATE keep the saved value. Enter 0 to record zero.',
  'An explicit CLEAR command with a reviewed reason resets a cell.',
  'Upload individual EDIT_DRAFT files. READ_PUBLISHED and the ZIP package are read-only.',
];

export function encodeSpreadsheetText(value: string): string {
  if (value.includes('\u0000'))
    throw new OfficialResultsError('cell.invalid_value');
  const first = value.match(/^[\p{White_Space}\p{Cc}\p{Cf}]*([\s\S])/u)?.[1];
  return value.startsWith(prefix) ||
    (first && unsafeFirst.has(first.normalize('NFKC')))
    ? prefix + value
    : value;
}

export function decodeSpreadsheetText(value: string): string {
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

export function csvRecord(cells: readonly string[]): string {
  return (
    cells
      .map((cell) =>
        /[",\r\n]/u.test(cell) ? '"' + cell.replaceAll('"', '""') + '"' : cell,
      )
      .join(',') + '\r\n'
  );
}

export function resultValuePair(
  value: ResultValue,
  escapeText: boolean,
): [string, string] {
  if (value.status !== 'RECORDED')
    return ['', value.status === 'MISSING' ? '' : value.status];
  const encode = escapeText ? encodeSpreadsheetText : (text: string) => text;
  if ('text' in value) return [encode(value.text), ''];
  if ('optionCode' in value) return [encode(value.optionCode), ''];
  if ('score' in value) return [value.score, ''];
  if ('percentage' in value) return [value.percentage, ''];
  if ('boolean' in value) return [String(value.boolean), ''];
  return [value.outcome, ''];
}

export function fieldHeaders(field: ResultField, readOnly: boolean) {
  const max =
    'maxScore' in field.constraints
      ? ' /' + field.constraints.maxScore
      : 'maxPercentage' in field.constraints
        ? ' /' + field.constraints.maxPercentage
        : '';
  const token = (readOnly ? 'r:' : 'f:') + field.id;
  return [
    field.label.ar + max + ' [' + token + ':value]',
    'حالة ' + field.label.ar + ' [' + token + ':state]',
  ];
}

export type RenderedExportFile = {
  id: string;
  filename: string;
  mediaType: string;
  bytes: Buffer;
  manifest?: ExportManifest;
};

export function resultFilename(
  parts: readonly string[],
  id: string,
  date: string,
  extension: string,
): string {
  const context = parts
    .map((part) => part.replace(/[^A-Za-z0-9-]/gu, '').slice(0, 16))
    .filter(Boolean)
    .join('_');
  const time = date.replace(/\.\d+Z$/u, 'Z').replace(/[-:]/gu, '');
  const suffix = '_' + time + '_' + id + '.' + extension;
  return ('MOAZEZ_RESULTS_' + context).slice(0, 180 - suffix.length) + suffix;
}

export function compatibleExportGroups(sheets: readonly ExportSheetPlan[]) {
  const groups = new Map<string, ExportSheetPlan[]>();
  for (const sheet of sheets) {
    const signature = resultContentDigest({
      definition: sheet.definition,
      fields: sheet.fields.map((field) => field.id),
      version: 'MOAZEZ_RESULTS_CSV_V1',
    });
    const existing = groups.get(signature);
    if (existing) existing.push(sheet);
    else groups.set(signature, [sheet]);
  }
  return groups.values();
}

export async function renderResultFiles(input: {
  exportId: string;
  creatorId: string;
  schoolId: string;
  request: ExportRequest;
  exportedAt: string;
  reuseUntil: string;
  sheets: ExportSheetPlan[];
  priorFiles?: { id: string; manifest: ExportManifest | null }[];
}): Promise<RenderedExportFile[]> {
  const { sheets, priorFiles, ...binding } = input;
  const files: RenderedExportFile[] = [];
  const xlsx = input.request.format === 'XLSX';
  let totalBytes = 0;

  for (const group of compatibleExportGroups(sheets)) {
    const representative = group[0];
    const fields = representative.fields;
    const readonly = input.request.mode === 'READ_PUBLISHED';
    const headers = [
      ...identityHeaders,
      ...fields.flatMap((field) => fieldHeaders(field, readonly)),
    ];
    const header = '\ufeff' + csvRecord(headers.map(encodeSpreadsheetText));
    const maxRows = Math.min(
      Math.floor(maxPhysicalCells / headers.length) - 1,
      ...group.map((sheet) => sheet.maxRows),
    );
    const maxBytes = Math.min(...group.map((sheet) => sheet.uploadBytes));
    const nextId = () => priorFiles?.[files.length]?.id ?? randomUUID();
    let id = nextId();
    let usedBytes = Buffer.byteLength(header);
    let records = [header];
    let worksheet: string[][] = [];
    let rows: ExportManifest['rows'] = [];
    let units = new Map<string, ExportSheetPlan['context']>();

    const finish = async () => {
      const manifest: ExportManifest = {
        ...binding,
        version: xlsx ? 'MOAZEZ_RESULTS_XLSX_V1' : 'MOAZEZ_RESULTS_CSV_V1',
        codec: xlsx ? 'XLSX_TYPED' : 'MOAZEZ_TEXT_ESCAPE_V1',
        exportRef: id,
        headers,
        fields,
        sheets: [...units.values()],
        rows,
      };
      const bytes = xlsx
        ? await renderResultsXlsx(manifest, worksheet)
        : Buffer.from(records.join(''));
      if (
        files.length >= 497 ||
        bytes.length > maxBytes ||
        totalBytes + bytes.length > maxPackageBytes
      )
        throw new OfficialResultsError('scope.limit_exceeded');
      totalBytes += bytes.length;
      files.push({
        id,
        filename: resultFilename(
          [
            ...representative.filenameCodes,
            ...(group.length > 1 ? ['MULTI'] : []),
            'P' + (files.length + 1),
          ],
          input.exportId,
          input.exportedAt,
          xlsx ? 'xlsx' : 'csv',
        ),
        mediaType: xlsx ? resultsXlsxMediaType : 'text/csv; charset=utf-8',
        bytes,
        manifest,
      });
      id = nextId();
      usedBytes = Buffer.byteLength(header);
      records = [header];
      worksheet = [];
      rows = [];
      units = new Map();
    };

    for (const sheet of group) {
      for (const row of sheet.rows) {
        const nextRowRef = () =>
          priorFiles?.[files.length]?.manifest?.rows[rows.length]?.rowRef ??
          randomUUID();
        let rowRef = nextRowRef();
        const values = () =>
          identityHeaders.map((column) => {
            switch (column) {
              case 'export_ref':
                return id;
              case 'row_ref':
                return rowRef;
              case 'schema_version':
                return sheet.context.definitionVersionId;
              case 'exported_at_utc':
                return input.exportedAt;
              default:
                return row.identity[column];
            }
          });
        const base = row.base.flatMap((cell) =>
          resultValuePair(cell.value, !xlsx),
        );
        let protectedValues = values();
        let record = csvRecord([
          ...protectedValues.map(encodeSpreadsheetText),
          ...base,
        ]);
        const size =
          Buffer.byteLength(record) + (xlsx ? headers.length * 100 : 0);
        if (size > 1024 * 1024)
          throw new OfficialResultsError('scope.limit_exceeded');
        if (
          rows.length &&
          (rows.length >= maxRows ||
            usedBytes + size + (xlsx ? 32_000 : 0) > maxBytes)
        ) {
          await finish();
          rowRef = nextRowRef();
          protectedValues = values();
          record = csvRecord([
            ...protectedValues.map(encodeSpreadsheetText),
            ...base,
          ]);
        }
        units.set(sheet.context.id, sheet.context);
        rows.push({ ...row, rowRef, protectedValues });
        if (xlsx) worksheet.push([...protectedValues, ...base]);
        else records.push(record);
        usedBytes += size;
      }
    }
    if (rows.length) await finish();
  }

  if (files.length <= 1) return files;
  const zip = new ZipFile();
  const zipOptions = { mtime: new Date(input.exportedAt) };
  const zipBytes = buffer(zip.outputStream);
  const names = new Map(sheets.map((sheet) => [sheet.context.id, sheet]));
  const index = [
    [
      'file',
      'export_ref',
      'rows',
      'school',
      'classrooms',
      'groups',
      'schema_versions',
    ],
  ];
  for (const file of files) {
    const manifest = file.manifest!;
    const scope = manifest.sheets.map((sheet) => names.get(sheet.id)!);
    index.push([
      file.filename,
      file.id,
      String(manifest.rows.length),
      manifest.rows[0].identity.school,
      [...new Set(scope.map((sheet) => sheet.classroomLabel))].join(' / '),
      [...new Set(scope.map((sheet) => sheet.groupLabel))].join(' / '),
      [
        ...new Set(manifest.sheets.map((sheet) => sheet.definitionVersionId)),
      ].join(' / '),
    ]);
    zip.addBuffer(file.bytes, file.filename, zipOptions);
  }
  zip.addBuffer(
    Buffer.from(
      '\ufeff' +
        index.map((row) => csvRecord(row.map(encodeSpreadsheetText))).join(''),
    ),
    'index.csv',
    zipOptions,
  );
  const instructions = [
    xlsx ? 'MOAZEZ_RESULTS_XLSX_V1' : 'MOAZEZ_RESULTS_CSV_V1',
    ...packagedInstructions,
    ...(xlsx
      ? ['Keep the workbook as XLSX and leave the identity values unchanged.']
      : [
          'Do not change identity values or headers. Keep the file as UTF-8 CSV.',
          'Sensitive leading text is prefixed with ~mztext:; repeat the prefix to enter it literally.',
        ]),
    ...new Set(
      sheets.flatMap((sheet) =>
        sheet.fields.flatMap((field) =>
          field.options
            ? [
                field.label.ar +
                  ' [' +
                  field.code +
                  ']: ' +
                  field.options
                    .filter((option) => option.active)
                    .map((option) => option.code)
                    .join(', '),
              ]
            : [],
        ),
      ),
    ),
  ];
  zip.addBuffer(
    Buffer.from(instructions.map(encodeSpreadsheetText).join('\r\n') + '\r\n'),
    'instructions.txt',
    zipOptions,
  );
  zip.end();
  files.push({
    id: priorFiles?.[files.length]?.id ?? randomUUID(),
    filename: resultFilename(
      [sheets[0].filenameCodes[0], 'SCOPE'],
      input.exportId,
      input.exportedAt,
      'zip',
    ),
    mediaType: 'application/zip',
    bytes: await zipBytes,
  });
  return files;
}
