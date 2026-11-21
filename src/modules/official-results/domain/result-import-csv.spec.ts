import { csvRecord, decodeSpreadsheetText } from './result-csv';
import { moazezStarterDefinition } from './moazez-starter';
import {
  mergeResultImport,
  parseImportCommand,
} from './result-import-commands';
import {
  declaredExportRef,
  headerLocations,
  parseResultCsv,
  protectedRowMatches,
} from './result-import-csv';
import type { ExportManifest } from './result-export.contract';
import { identityHeaders } from './result-export.contract';
import type { ResultValue } from './result-value';

const score = moazezStarterDefinition().fields.find(
  (field) => field.kind === 'SCORE',
)!;
const text = moazezStarterDefinition().fields.find(
  (field) => field.kind === 'TEXT',
)!;
const recorded = (score: string): ResultValue => ({
  status: 'RECORDED',
  score,
});
const parseScore = (value: string, state = '') =>
  parseImportCommand(score, value, state, decodeSpreadsheetText);

describe('Official Results import transport and semantic comparison', () => {
  it('T062 parses Arabic, commas, quotes and embedded lines with physical record evidence', () => {
    const value = 'ملاحظة, "حضر"\nالسطر التالي';
    const parsed = parseResultCsv(
      Buffer.from(
        '\ufeff' +
          csvRecord(['export_ref', 'text']) +
          csvRecord(['ref-1', value]),
      ),
    );
    expect(parsed.records).toEqual([
      { cells: ['ref-1', value], line: 3, record: 2 },
    ]);
    expect(declaredExportRef(parsed)).toBe('ref-1');
    expect(
      parseResultCsv(Buffer.from('export_ref,text\n1,0\n')).records[0].cells,
    ).toEqual(['1', '0']);
    expect(() => parseResultCsv(Buffer.from([0xc0, 0x80]))).toThrow('UTF-8');
    expect(() => parseResultCsv(Buffer.from('one,two\nbad,"quote'))).toThrow(
      'malformed CSV',
    );
    expect(() => parseResultCsv(Buffer.from('one,two\none,\x00'))).toThrow(
      'UTF-8',
    );
    expect(() =>
      parseResultCsv(Buffer.from('one,two\n1,' + 'a'.repeat(65537))),
    ).toThrow('exceeds');
  });

  it('T065 distinguishes KEEP, zero, clear, blanks and contradictory state commands', () => {
    expect(parseScore('', '')).toEqual({ kind: 'KEEP' });
    expect(parseScore('0')).toMatchObject({
      kind: 'SET',
      value: recorded('0.00'),
    });
    expect(parseScore(' ٠٫٠٠ ')).toMatchObject({
      kind: 'SET',
      normalized: true,
      value: recorded('0.00'),
    });
    expect(parseScore('', 'CLEAR')).toMatchObject({
      kind: 'CLEAR',
      value: { status: 'MISSING' },
    });
    expect(parseScore('', 'RECORDED')).toEqual({
      kind: 'ISSUE',
      issue: 'value_required',
    });
    expect(parseScore('1', 'ABSENT')).toEqual({
      kind: 'ISSUE',
      issue: 'contradictory_command',
    });
    expect(parseScore('', 'MISSING')).toEqual({
      kind: 'ISSUE',
      issue: 'invalid_state',
    });
    expect(
      parseImportCommand(text, 'ABSENT', '', decodeSpreadsheetText),
    ).toMatchObject({ kind: 'SET', value: { text: 'ABSENT' } });
  });

  it('T066 rejects excessive range and precision, invalid options and calculated fields', () => {
    expect(parseScore('200')).toEqual({
      kind: 'ISSUE',
      issue: 'score_out_of_range',
    });
    for (const value of [
      '5.999',
      '2e2',
      '1,0',
      '1٬000',
      '١٠٪',
      '0/2',
      'NaN',
      'Infinity',
      '~mztext:-1',
    ])
      expect(parseScore(value)).toEqual({
        kind: 'ISSUE',
        issue: 'invalid_numeric_value',
      });
    const select = {
      ...text,
      kind: 'SELECT' as const,
      options: [{ code: 'YES', label: text.label, order: 0, active: true }],
    };
    expect(
      parseImportCommand(select, 'UNKNOWN', '', decodeSpreadsheetText),
    ).toEqual({ kind: 'ISSUE', issue: 'invalid_option' });
    const calculated = moazezStarterDefinition().fields.find(
      (field) => field.kind === 'CALCULATED',
    )!;
    expect(
      parseImportCommand(calculated, '90', '', decodeSpreadsheetText),
    ).toEqual({ kind: 'ISSUE', issue: 'readonly_value_changed' });
  });

  it('T069 compares typed baseline, current and incoming independently of formatting', () => {
    expect(
      mergeResultImport(
        recorded('18.00'),
        recorded('18.00'),
        recorded('19.00'),
      ),
    ).toBe('KEEP_CURRENT');
    expect(
      mergeResultImport(
        recorded('18.00'),
        recorded('19.00'),
        recorded('19.00'),
      ),
    ).toBe('CONVERGED');
    expect(
      mergeResultImport(
        recorded('18.00'),
        recorded('20.00'),
        recorded('18.00'),
      ),
    ).toBe('APPLY');
    expect(
      mergeResultImport(
        recorded('18.00'),
        recorded('20.00'),
        recorded('19.00'),
      ),
    ).toBe('CONFLICT');
  });

  it('T063 and T071 resolve reordered columns and reject duplicates, omissions and unknown columns', () => {
    const headers = [...identityHeaders];
    const expected = { headers } as ExportManifest;
    const identity = headers.map((value) => 'value:' + value);
    const reordered = parseResultCsv(
      Buffer.from(
        csvRecord([...headers].reverse()) +
          csvRecord([...identity].reverse()) +
          csvRecord(identity.map((item) => item + '-2').reverse()),
      ),
    );
    const head = headerLocations(reordered, expected);
    expect(head.issues).toEqual([]);
    expect(
      protectedRowMatches(
        reordered,
        reordered.records[0],
        head.positions,
        identity,
      ),
    ).toBe(true);
    expect(
      protectedRowMatches(
        reordered,
        reordered.records[1],
        head.positions,
        identity,
      ),
    ).toBe(false);
    const altered = parseResultCsv(
      Buffer.from(csvRecord([...headers.slice(1), 'new_column', headers[1]])),
    );
    expect(
      headerLocations(altered, expected).issues.map((item) => item.issue),
    ).toEqual(
      expect.arrayContaining([
        'missing_header',
        'unknown_header',
        'duplicate_header',
      ]),
    );
  });

  it('T072 and T073 decode literal and escaped textual values without applying the codec to scores', () => {
    expect(
      parseImportCommand(text, '~mztext:＠raw', '', decodeSpreadsheetText),
    ).toMatchObject({ kind: 'SET', value: { text: '＠raw' } });
    expect(
      parseImportCommand(
        text,
        '~mztext:~mztext:raw',
        '',
        decodeSpreadsheetText,
      ),
    ).toMatchObject({ kind: 'SET', value: { text: '~mztext:raw' } });
    expect(
      parseImportCommand(text, "  'raw ", '', decodeSpreadsheetText),
    ).toMatchObject({ kind: 'SET', value: { text: "  'raw " } });
  });
});
