import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import {
  csvRecord,
  decodeSpreadsheetText,
  encodeSpreadsheetText,
  resultFilename,
  resultValuePair,
} from './result-csv';

const fixture = JSON.parse(
  readFileSync(
    join(process.cwd(), 'test/fixtures/official-results-text-codec-cases.json'),
    'utf8',
  ),
) as {
  cases: { text: string; encoded: string; decoded: string }[];
};

describe('Official Results CSV text transport', () => {
  it.each(fixture.cases)(
    'reversibly escapes $text',
    ({ text, encoded, decoded }) => {
      expect(encodeSpreadsheetText(text)).toBe(encoded);
      expect(decodeSpreadsheetText(encoded)).toBe(decoded);
      expect(
        parse(
          '\ufeff' + csvRecord(['value', 'other']) + csvRecord([encoded, '0']),
          { bom: true },
        ),
      ).toEqual([
        ['value', 'other'],
        [encoded, '0'],
      ]);
    },
  );

  it('rejects NUL and keeps typed zeros, missing and false distinct', () => {
    expect(() => encodeSpreadsheetText('\u0000=1')).toThrow();
    expect(resultValuePair({ status: 'MISSING' }, true)).toEqual(['', '']);
    expect(resultValuePair({ status: 'ABSENT' }, true)).toEqual(['', 'ABSENT']);
    expect(
      resultValuePair({ status: 'RECORDED', score: '0.00' }, true),
    ).toEqual(['0.00', '']);
    expect(
      resultValuePair({ status: 'RECORDED', boolean: false }, true),
    ).toEqual(['false', '']);
  });

  it('preserves the UUID and uses bounded path-safe names', () => {
    const id = 'c34692f9-ffc1-4fbb-8aa6-b39fda75fbf8';
    const date = '2026-11-21T09:00:00.000Z';
    const filename = resultFilename(
      [
        'SCH-MZ001',
        '../../CON',
        'a'.repeat(200),
        ...Array<string>(20).fill('long-context'),
      ],
      id,
      date,
      'csv',
    );
    expect(filename).toMatch(/^[A-Za-z0-9_.-]{1,180}$/u);
    expect(filename.startsWith('MOAZEZ_RESULTS_SCH-MZ001_')).toBe(true);
    expect(filename.endsWith('20261121T090000Z_' + id + '.csv')).toBe(true);
  });
});
