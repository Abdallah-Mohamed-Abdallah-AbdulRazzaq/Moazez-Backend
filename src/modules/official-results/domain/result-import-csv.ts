import { parse } from 'csv-parse/sync';
import { decodeSpreadsheetText } from './result-csv';
import { identityHeaders, type ExportManifest } from './result-export.contract';
import { ResultImportFileError } from './result-import.contract';
import { platformResultLimits } from './result-policy';

export type ImportRecord = {
  cells: string[];
  line: number;
  record: number;
  types?: ('text' | 'number' | 'boolean')[];
};
export type TabularImport = {
  header: string[];
  records: ImportRecord[];
  decodeText: (value: string) => string;
};

export function parseResultCsv(
  bytes: Buffer,
  limit: { maxRows: number; maxUploadBytes: number } = platformResultLimits,
): TabularImport {
  if (bytes.length > limit.maxUploadBytes)
    throw new ResultImportFileError('limit_exceeded');
  let input: string;
  try {
    input = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(
      bytes,
    );
  } catch {
    throw new ResultImportFileError('invalid_encoding');
  }
  if (input.includes('\u0000'))
    throw new ResultImportFileError('invalid_encoding');
  let count = 0;
  let cells = 0;
  const records: ImportRecord[] = [];
  try {
    parse(input, {
      bom: false,
      columns: false,
      record_delimiter: ['\r\n', '\n'],
      max_record_size: 1024 * 1024,
      skip_empty_lines: false,
      info: true,
      raw: true,
      on_record: (value) => {
        // csv-parse wraps arrays in their raw and positional evidence with these options.
        const item = value as unknown as {
          record: string[];
          raw: string;
          info: { lines: number };
        };
        count += 1;
        cells += item.record.length;
        if (
          count > limit.maxRows + 1 ||
          cells > 1_000_000 ||
          Buffer.byteLength(item.raw) > 1024 * 1024 ||
          item.record.some((cell) => Buffer.byteLength(cell) > 65536)
        )
          throw new ResultImportFileError('limit_exceeded');
        records.push({
          cells: item.record,
          line: item.info.lines,
          record: count,
        });
        return null;
      },
    });
  } catch (error) {
    if (error instanceof ResultImportFileError) throw error;
    throw new ResultImportFileError(
      (error as { code?: string })?.code === 'CSV_MAX_RECORD_SIZE'
        ? 'limit_exceeded'
        : 'malformed_csv',
    );
  }
  const headings = records.shift();
  if (!headings) throw new ResultImportFileError('missing_header');
  return {
    header: headings.cells.map(decodeSpreadsheetText),
    records,
    decodeText: decodeSpreadsheetText,
  };
}

export function declaredExportRef(parsed: TabularImport): string | null {
  const index = parsed.header.indexOf('export_ref');
  return index >= 0 && parsed.records.length
    ? parsed.decodeText(parsed.records[0].cells[index])
    : null;
}

export function headerLocations(
  parsed: TabularImport,
  manifest: ExportManifest,
) {
  const positions = new Map<string, number>();
  const issues: {
    issue: 'missing_header' | 'unknown_header' | 'duplicate_header';
    column?: number;
  }[] = [];
  const expected = new Set(manifest.headers);
  parsed.header.forEach((header, index) => {
    if (positions.has(header))
      issues.push({ issue: 'duplicate_header', column: index + 1 });
    if (!expected.has(header))
      issues.push({ issue: 'unknown_header', column: index + 1 });
    positions.set(header, index);
  });
  for (const header of manifest.headers)
    if (!positions.has(header)) issues.push({ issue: 'missing_header' });
  return { positions, issues };
}

export function protectedRowMatches(
  parsed: TabularImport,
  record: ImportRecord,
  locations: ReadonlyMap<string, number>,
  protectedValues: string[],
): boolean {
  return identityHeaders.every(
    (header, index) =>
      (!record.types || record.types[locations.get(header)!] === 'text') &&
      parsed.decodeText(record.cells[locations.get(header)!]) ===
        protectedValues[index],
  );
}
