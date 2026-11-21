import { posix } from 'node:path';
import { SaxesParser, type SaxesTagNS } from 'saxes';
import type { ImportRecord, TabularImport } from './result-import-csv';
import { ResultImportFileError } from './result-import.contract';
import { platformResultLimits } from './result-policy';
import { openResultXlsx } from './result-xlsx-archive';
import {
  documentRelationsNamespace,
  sheetXmlNamespace,
  spreadsheetLiteral,
} from './result-xlsx-export';

type CellType = 'text' | 'number' | 'boolean';
type Cell = { value: string; type: CellType };
type Matrix = Map<number, Map<number, Cell>>;
const workbookName = 'xl/workbook.xml';
const sharedName = 'xl/sharedStrings.xml';
const relationNs =
  'http://schemas.openxmlformats.org/package/2006/relationships';
const typeNs = 'http://schemas.openxmlformats.org/package/2006/content-types';
const allowedNumericFormat = new Set([
  0, 1, 2, 3, 4, 9, 10, 11, 12, 13, 37, 38, 39, 40, 48, 49,
]);
const maxColumns = 18 + 2 * 256;
const allowedSheet = /^(?:Instructions|Index|Grades(?:[1-9][0-9]{0,2})?)$/u;

function fail(
  issue: ConstructorParameters<
    typeof ResultImportFileError
  >[0] = 'workbook_invalid',
): never {
  throw new ResultImportFileError(issue);
}

function attribute(tag: SaxesTagNS, name: string): string | undefined {
  return tag.attributes[name]?.value;
}

function document(
  input: Buffer | undefined,
  root: readonly [string, string],
  handlers: {
    open?: (tag: SaxesTagNS, parent: SaxesTagNS | undefined) => void;
    close?: (tag: SaxesTagNS, parent: SaxesTagNS | undefined) => void;
    text?: (value: string, tag: SaxesTagNS | undefined) => void;
  },
) {
  if (!input) fail();
  const parser = new SaxesParser({ xmlns: true, fragment: false });
  const stack: SaxesTagNS[] = [];
  parser.on('doctype', () => fail());
  parser.on('processinginstruction', () => fail());
  parser.on('error', () => fail());
  parser.on('opentag', (tag) => {
    if (stack.length >= 64) fail('limit_exceeded');
    if (!stack.length && (root[0] !== tag.local || root[1] !== tag.uri)) fail();
    if (Object.keys(tag.attributes).length > 96) fail('limit_exceeded');
    handlers.open?.(tag, stack.at(-1));
    stack.push(tag);
  });
  parser.on('closetag', (tag) => {
    stack.pop();
    handlers.close?.(tag, stack.at(-1));
  });
  parser.on('text', (value) => handlers.text?.(value, stack.at(-1)));
  parser.on('cdata', (value) => handlers.text?.(value, stack.at(-1)));
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    for (let offset = 0; offset < input.length; offset += 32768)
      parser.write(
        decoder.decode(input.subarray(offset, offset + 32768), {
          stream: true,
        }),
      );
    parser.write(decoder.decode()).close();
  } catch (error) {
    if (error instanceof ResultImportFileError) throw error;
    fail();
  }
}

function relationshipTarget(value: string, directory: string) {
  if (
    !value ||
    value.includes('\\') ||
    /[?#:%\p{Cc} ]/u.test(value) ||
    value.split('/').some((segment) => segment === '..' || segment === '.')
  )
    fail();
  return value.startsWith('/') ? value.slice(1) : posix.join(directory, value);
}

function relations(
  parts: Map<string, Buffer>,
  file: string,
  directory: string,
) {
  const entries = new Map<string, { type: string; target: string }>();
  document(parts.get(file), ['Relationships', relationNs], {
    open: (tag, parent) => {
      if (!parent) return;
      if (
        tag.uri !== relationNs ||
        tag.local !== 'Relationship' ||
        parent.local !== 'Relationships'
      )
        fail();
      if ((attribute(tag, 'TargetMode') ?? 'Internal') !== 'Internal') fail();
      const id = attribute(tag, 'Id');
      const fullType = attribute(tag, 'Type');
      const value = attribute(tag, 'Target');
      if (!id || !fullType || !value || entries.has(id)) fail();
      const type = fullType.split('/').at(-1)!;
      if (
        !fullType.startsWith(documentRelationsNamespace + '/') &&
        fullType !== relationNs + '/metadata/core-properties'
      )
        fail();
      const target = relationshipTarget(value, directory);
      if (!parts.has(target)) fail();
      entries.set(id, { type, target });
    },
  });
  return entries;
}

function strings(input?: Buffer) {
  if (!input) return [];
  const values: string[] = [];
  let current = '';
  document(input, ['sst', sheetXmlNamespace], {
    open: (tag) => {
      if (tag.local === 'si') current = '';
    },
    text: (value, tag) => {
      if (tag?.local !== 't') return;
      current += value;
      if (current.length > 65536) fail('limit_exceeded');
    },
    close: (tag) => {
      if (tag.local !== 'si') return;
      if (values.length >= 1_000_000) fail('limit_exceeded');
      const literal = spreadsheetLiteral(current);
      if (literal.includes('\u0000') || Buffer.byteLength(literal) > 65536)
        fail('limit_exceeded');
      values.push(literal);
    },
  });
  return values;
}

function numericStyles(input?: Buffer) {
  const formats: number[] = [];
  const custom = new Map<number, string>();
  if (input)
    document(input, ['styleSheet', sheetXmlNamespace], {
      open: (tag, parent) => {
        if (parent?.local === 'numFmts' && tag.local === 'numFmt') {
          const format = Number(attribute(tag, 'numFmtId'));
          const code = attribute(tag, 'formatCode');
          if (!Number.isInteger(format) || !code) fail();
          custom.set(format, code);
        }
        if (parent?.local === 'cellXfs' && tag.local === 'xf') {
          const index = Number(attribute(tag, 'numFmtId') ?? '0');
          if (
            !Number.isInteger(index) ||
            index < 0 ||
            formats.length >= 100_000
          )
            fail();
          formats.push(index);
        }
      },
    });
  return formats.map((index) => {
    if (allowedNumericFormat.has(index)) return true;
    const format = custom.get(index);
    if (!format) return false;
    if (format.toLowerCase() === 'general') return true;
    const visible = format.replace(
      /"[^"]*"|\\.|[_*].|\[(?!(?:h|m|s)\])[^\]]*\]/giu,
      '',
    );
    return !/[yymmdhs]|AM\/PM/iu.test(visible) && /[0#?]/u.test(visible);
  });
}

function columnIndex(value: string) {
  let number = 0;
  for (const letter of value) number = number * 26 + letter.charCodeAt(0) - 64;
  return number - 1;
}

function worksheet(
  bytes: Buffer | undefined,
  shared: string[],
  numeric: boolean[],
  limit: { maxRows: number; cells: number },
  guide: boolean,
): Matrix {
  const rows: Matrix = new Map();
  let rowNumber = 0;
  let row: Map<number, Cell> | null = null;
  let seen: Set<number> | null = null;
  let cell: {
    index: number;
    type: string;
    style: number;
    raw: string;
    inline: string;
  } | null = null;
  document(bytes, ['worksheet', sheetXmlNamespace], {
    open: (tag, parent) => {
      if (tag.uri !== sheetXmlNamespace) return;
      if (tag.local === 'f') fail('formula_not_allowed');
      if (
        [
          'mergeCell',
          'hyperlink',
          'drawing',
          'legacyDrawing',
          'oleObject',
          'picture',
          'control',
        ].includes(tag.local)
      )
        fail();
      if (tag.local === 'row') {
        if (
          parent?.local !== 'sheetData' ||
          !/^[1-9]\d{0,5}$/u.test(attribute(tag, 'r') ?? '')
        )
          fail();
        const next = Number(attribute(tag, 'r'));
        if (next <= rowNumber || next > (guide ? 20000 : limit.maxRows + 1))
          fail('limit_exceeded');
        rowNumber = next;
        row = new Map();
        seen = new Set();
      }
      if (tag.local === 'c') {
        if (parent?.local !== 'row' || !row || !seen || cell) fail();
        const location = /^([A-Z]{1,3})([1-9]\d{0,5})$/u.exec(
          attribute(tag, 'r') ?? '',
        );
        if (!location || Number(location[2]) !== rowNumber) fail();
        const index = columnIndex(location[1]);
        if (index >= (guide ? 32 : maxColumns) || ++limit.cells > 1_000_000)
          fail('limit_exceeded');
        if (seen.has(index)) fail();
        seen.add(index);
        const card = attribute(tag, 's') ?? '0';
        if (!/^\d{1,5}$/u.test(card)) fail();
        cell = {
          index,
          type: attribute(tag, 't') ?? 'n',
          style: Number(card),
          raw: '',
          inline: '',
        };
      }
    },
    text: (value, tag) => {
      if (!cell || tag?.uri !== sheetXmlNamespace) return;
      if (tag.local === 'v') cell.raw += value;
      if (tag.local === 't') cell.inline += value;
      if (cell.raw.length + cell.inline.length > 65536) fail('limit_exceeded');
    },
    close: (tag) => {
      if (tag.uri !== sheetXmlNamespace) return;
      if (tag.local === 'c') {
        if (!cell || !row) fail();
        let value = '';
        let type: CellType = 'text';
        switch (cell.type) {
          case 's': {
            if (!/^\d{1,7}$/u.test(cell.raw)) fail();
            value = shared[Number(cell.raw)];
            if (value === undefined) fail();
            break;
          }
          case 'inlineStr':
            value = spreadsheetLiteral(cell.inline);
            break;
          case 'n':
            if (!cell.raw) break;
            if (
              numeric[cell.style] === false ||
              (cell.style && numeric[cell.style] === undefined)
            )
              fail();
            if (!/^-?\d+(?:\.\d+)?$/u.test(cell.raw) || cell.raw.length > 21)
              fail('invalid_numeric_value');
            value = cell.raw;
            type = 'number';
            break;
          case 'b':
            if (cell.raw !== '0' && cell.raw !== '1') fail();
            value = cell.raw === '1' ? 'true' : 'false';
            type = 'boolean';
            break;
          default:
            // Includes dates, cell errors and cached string formula outputs.
            fail();
        }
        if (value.includes('\u0000')) fail();
        if (Buffer.byteLength(value) > 65536) fail('limit_exceeded');
        if (value) row.set(cell.index, { value, type });
        cell = null;
      }
      if (tag.local === 'row') {
        if (row?.size) rows.set(rowNumber, row);
        row = null;
        seen = null;
      }
    },
  });
  return rows;
}

export async function parseResultsXlsx(
  bytes: Buffer,
  limits: { maxUploadBytes: number; maxRows: number } = platformResultLimits,
): Promise<TabularImport> {
  if (bytes.length > limits.maxUploadBytes) fail('limit_exceeded');
  const parts = await openResultXlsx(bytes);
  const available = new Map<string, string>();
  document(parts.get('[Content_Types].xml'), ['Types', typeNs], {
    open: (tag, parent) => {
      if (!parent) return;
      if (tag.uri !== typeNs || !['Default', 'Override'].includes(tag.local))
        fail();
      const type = attribute(tag, 'ContentType') ?? '';
      if (/macro|external|vba|ole|activex|encrypted/iu.test(type)) fail();
      if (tag.local === 'Override') {
        const path = attribute(tag, 'PartName');
        if (
          !path?.startsWith('/') ||
          !parts.has(path.slice(1)) ||
          available.has(path.slice(1))
        )
          fail();
        available.set(path.slice(1), type);
      }
    },
  });
  if (
    available.get(workbookName) !==
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml'
  )
    fail();
  const root = relations(parts, '_rels/.rels', '');
  if (
    [...root.values()].filter(
      (entry) =>
        entry.type === 'officeDocument' && entry.target === workbookName,
    ).length !== 1 ||
    [...root.values()].some(
      (entry) =>
        ![
          'officeDocument',
          'core-properties',
          'extended-properties',
          'custom-properties',
        ].includes(entry.type) ||
        (entry.type === 'officeDocument'
          ? entry.target !== workbookName
          : !entry.target.startsWith('docProps/')),
    )
  )
    fail();
  const lookup = relations(parts, 'xl/_rels/workbook.xml.rels', 'xl');
  const typed = [...lookup.values()];
  const expectedRelations = new Map([
    ['styles', 'xl/styles.xml'],
    ['sharedStrings', sharedName],
  ]);
  if (
    typed.some((relation) => {
      const match = expectedRelations.get(relation.type);
      if (match) return match !== relation.target;
      if (relation.type === 'theme')
        return !/^xl\/theme\/theme[1-9]\d{0,2}\.xml$/u.test(relation.target);
      return (
        relation.type !== 'worksheet' ||
        !/^xl\/worksheets\/sheet[1-9]\d{0,3}\.xml$/u.test(relation.target) ||
        available.get(relation.target) !==
          'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml'
      );
    })
  )
    fail();
  const tabs = new Map<string, string>();
  const used = new Set<string>();
  document(parts.get(workbookName), ['workbook', sheetXmlNamespace], {
    open: (tag, parent) => {
      if (['externalReference', 'externalReferences'].includes(tag.local))
        fail();
      if (
        tag.local === 'workbookProtection' &&
        Object.keys(tag.attributes).some((name) =>
          /password|hash|salt|algorithm|spinCount/iu.test(name),
        )
      )
        fail();
      if (tag.local !== 'sheet' || tag.uri !== sheetXmlNamespace) return;
      if (parent?.local !== 'sheets') fail();
      const name = attribute(tag, 'name');
      const ref = Object.values(tag.attributes).find(
        (item) =>
          item.uri === documentRelationsNamespace && item.local === 'id',
      )?.value;
      const target = ref ? lookup.get(ref) : undefined;
      if (
        !name ||
        tabs.has(name) ||
        !target ||
        target.type !== 'worksheet' ||
        used.has(target.target)
      )
        fail();
      tabs.set(name, target.target);
      used.add(target.target);
    },
  });
  const worksheetParts = [...parts.keys()].filter((name) =>
    name.startsWith('xl/worksheets/'),
  );
  if (
    worksheetParts.length !== tabs.size ||
    worksheetParts.some((name) => !used.has(name))
  )
    fail();
  const shared = strings(parts.get(sharedName));
  const styles = numericStyles(parts.get('xl/styles.xml'));
  const limit = { maxRows: limits.maxRows, cells: 0 };
  const records: ImportRecord[] = [];
  let header: string[] | undefined;
  let hasData = false;
  for (const [name, path] of tabs) {
    const isData = /^Grades(?:[1-9][0-9]{0,2})?$/u.test(name);
    const matrix = worksheet(parts.get(path), shared, styles, limit, !isData);
    if (!allowedSheet.test(name) && matrix.size) fail();
    if (!isData) continue;
    hasData = true;
    const headings = matrix.get(1);
    if (!headings?.size) fail('missing_header');
    const positions = [...headings.keys()];
    const count = Math.max(...positions) + 1;
    const names = Array.from({ length: count }, (_, index) => {
      const cell = headings.get(index);
      if (cell?.type !== 'text') fail('missing_header');
      return cell.value;
    });
    header ??= names;
    const positionsByName = new Map(names.map((name, index) => [name, index]));
    if (positionsByName.size !== names.length) fail('duplicate_header');
    if (
      header.length !== count ||
      header.some((name) => !positionsByName.has(name))
    )
      fail('unknown_header');
    const columnOrder = header.map((name) => positionsByName.get(name)!);
    for (const [line, row] of matrix) {
      if (line === 1) continue;
      if (records.length >= limit.maxRows) fail('limit_exceeded');
      if ([...row.keys()].some((index) => index >= count))
        fail('unknown_header');
      const cells = columnOrder.map((index) => row.get(index)?.value ?? '');
      const types = columnOrder.map((index) => row.get(index)?.type ?? 'text');
      records.push({ cells, types, line, record: records.length + 2 });
    }
  }
  if (!hasData || !header) fail('missing_header');
  return { header, records, decodeText: (value: string) => value };
}
