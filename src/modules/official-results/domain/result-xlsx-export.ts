import { buffer } from 'node:stream/consumers';
import { ZipFile } from 'yazl';
import type { ExportManifest } from './result-export.contract';
import type { ResultField } from './result-definition';
import { OfficialResultsError } from './official-results.error';

export const resultsXlsxMediaType =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const sheetXmlNamespace =
  'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
export const documentRelationsNamespace =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const packageRelationsNamespace =
  'http://schemas.openxmlformats.org/package/2006/relationships';
const contentNamespace =
  'http://schemas.openxmlformats.org/package/2006/content-types';
const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const worksheetType = resultsXlsxMediaType.replace('.sheet', '.worksheet+xml');
const sheetSize = 5000;
const maxExpanded = 100 * 1024 * 1024;

export function xmlString(value: string): string {
  if (value.includes('\u0000'))
    throw new OfficialResultsError('cell.invalid_value');
  return value
    .replace(/_x[0-9a-fA-F]{4}_/gu, (token) => '_x005F_' + token.slice(1))
    .replace(
      // XML 1.0 cannot carry these characters directly. Open XML defines this encoding.
      // eslint-disable-next-line no-control-regex
      /[\u0001-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/gu,
      (character) =>
        '_x' +
        character.charCodeAt(0).toString(16).padStart(4, '0').toUpperCase() +
        '_',
    )
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
    .replaceAll('\r', '&#13;');
}

export function spreadsheetLiteral(value: string) {
  return value.replace(/_x([0-9a-fA-F]{4})_/gu, (_token, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
}

export function xlsxColumn(index: number) {
  let name = '';
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26))
    name = String.fromCharCode(65 + ((value - 1) % 26)) + name;
  return name;
}

function xml(name: string, ns: string, inner: string) {
  return (
    declaration +
    '<' +
    name +
    ' xmlns="' +
    ns +
    '">' +
    inner +
    '</' +
    name +
    '>'
  );
}

function partRelations(
  entries: { type: string; target: string; id: string }[],
) {
  return xml(
    'Relationships',
    packageRelationsNamespace,
    entries
      .map(
        (part) =>
          '<Relationship Id="' +
          part.id +
          '" Type="' +
          documentRelationsNamespace +
          '/' +
          part.type +
          '" Target="' +
          part.target +
          '"/>',
      )
      .join(''),
  );
}

const styles = xml(
  'styleSheet',
  sheetXmlNamespace,
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF123547"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE0F5F1"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1" applyProtection="1"><protection locked="0"/></xf></cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>',
);

function dataCell(
  key: string,
  value: string,
  style: number,
  type: 'text' | 'number',
) {
  if (!value) return '<c r="' + key + '" s="' + style + '"/>';
  if (type === 'number')
    return (
      '<c r="' + key + '" s="' + style + '" t="n"><v>' + value + '</v></c>'
    );
  return (
    '<c r="' +
    key +
    '" s="' +
    style +
    '" t="inlineStr"><is><t xml:space="preserve">' +
    xmlString(value) +
    '</t></is></c>'
  );
}

const widthOf = (index: number) =>
  index < 5 ? 28 : index === 6 ? 28 : index < 18 ? 20 : 32;
function table(
  rows: string[][],
  fields: ResultField[],
  mode: 'EDIT_DRAFT' | 'READ_PUBLISHED' | 'GUIDE',
) {
  const width = rows[0].length;
  const last = xlsxColumn(width - 1) + rows.length;
  const guide = mode === 'GUIDE';
  const editable = mode === 'EDIT_DRAFT';
  const worksheet = [
    '<dimension ref="A1:' + last + '"/>',
    '<sheetViews><sheetView workbookViewId="0"' +
      (guide
        ? '/>'
        : '><pane xSplit="7" ySplit="1" topLeftCell="H2" activePane="bottomRight" state="frozen"/></sheetView>') +
      '</sheetViews>',
    '<sheetFormatPr defaultRowHeight="15"/>',
    '<cols>' +
      rows[0]
        .map(
          (_, index) =>
            '<col min="' +
            (index + 1) +
            '" max="' +
            (index + 1) +
            '" width="' +
            (guide ? 45 : widthOf(index)) +
            '" customWidth="1"/>',
        )
        .join('') +
      '</cols>',
    '<sheetData>',
  ];
  rows.forEach((row, index) => {
    const line = index + 1;
    worksheet.push(
      '<row r="' +
        line +
        '"' +
        (index ? '' : ' ht="40" customHeight="1"') +
        '>',
    );
    row.forEach((value, column) => {
      const kind =
        index && column >= 18 && column % 2 === 0
          ? fields[(column - 18) / 2]?.kind
          : undefined;
      const numeric =
        (kind === 'SCORE' || kind === 'PERCENTAGE') &&
        /^-?\d+(?:\.\d+)?$/u.test(value);
      worksheet.push(
        dataCell(
          xlsxColumn(column) + line,
          value,
          index === 0 ? 1 : editable && column >= 18 ? 2 : 0,
          numeric ? 'number' : 'text',
        ),
      );
    });
    worksheet.push('</row>');
  });
  worksheet.push('</sheetData>');
  if (!guide) {
    worksheet.push(
      '<sheetProtection sheet="1" selectLockedCells="0" selectUnlockedCells="0" autoFilter="0" sort="0"/>',
    );
    worksheet.push('<autoFilter ref="A1:' + last + '"/>');
  }
  if (editable && rows.length > 1) {
    const validators: string[] = [];
    const validation = (column: number, items: string[]) => {
      const list = items.join(',');
      if (
        !list ||
        list.length > 250 ||
        !items.every((item) => /^[\p{L}\p{N}_.-]+$/u.test(item))
      )
        return;
      const letter = xlsxColumn(column);
      validators.push(
        '<dataValidation type="list" errorStyle="stop" allowBlank="1" showErrorMessage="1" sqref="' +
          letter +
          '2:' +
          letter +
          rows.length +
          '"><formula1>&quot;' +
          xmlString(list) +
          '&quot;</formula1></dataValidation>',
      );
    };
    fields.forEach((field, index) => {
      const value = 18 + index * 2;
      validation(value + 1, [
        ...field.allowedStates.filter((state) => state !== 'MISSING'),
        'CLEAR',
      ]);
      if (field.kind === 'SELECT')
        validation(
          value,
          field.options
            ?.filter((option) => option.active)
            .map((option) => option.code) ?? [],
        );
      if (field.kind === 'PASS_FAIL') validation(value, ['PASS', 'FAIL']);
      if (field.kind === 'BOOLEAN') validation(value, ['true', 'false']);
    });
    if (validators.length)
      worksheet.push(
        '<dataValidations count="' +
          validators.length +
          '">' +
          validators.join('') +
          '</dataValidations>',
      );
  }
  return xml('worksheet', sheetXmlNamespace, worksheet.join(''));
}

export async function renderResultsXlsx(
  manifest: ExportManifest,
  values: string[][],
): Promise<Buffer> {
  const guides = [
    ['MOAZEZ Official Results', 'نتائج معزز الرسمية'],
    [
      'Edit the highlighted values and states. Save as XLSX.',
      'عدّل القيم والحالات المظللة واحفظ بصيغة XLSX.',
    ],
    [
      'Blank value and state keep the saved value. Use 0 to record zero.',
      'الفراغ يبقي القيمة الحالية. استخدم 0 لتسجيل صفر.',
    ],
    [
      'CLEAR requires a reviewed reason and acknowledgment.',
      'يتطلب المسح الصريح سببًا وإقرارًا.',
    ],
    [
      'Keep the identity columns and the exact field headings.',
      'أبق أعمدة الهوية وعناوين الحقول كما هي.',
    ],
    [
      'Worksheet protection helps prevent accidental edits.',
      'حماية ورقة العمل تقلل التغييرات غير المقصودة.',
    ],
    [manifest.request.mode, manifest.exportRef],
    ...manifest.fields.flatMap(
      (field): string[][] =>
        field.options
          ?.filter((option) => option.active)
          .map((option) => [
            field.label.ar,
            option.code,
            option.label.ar,
            option.label.en,
          ]) ?? [],
    ),
  ].map((row) => [...row, ...Array<string>(4 - row.length).fill('')]);
  const tabs = [{ name: 'Instructions', content: table(guides, [], 'GUIDE') }];
  const rowsPerSheet = Array.from(
    { length: Math.ceil(values.length / sheetSize) },
    (_, index) => values.slice(index * sheetSize, (index + 1) * sheetSize),
  );
  if (rowsPerSheet.length > 1) {
    const index = [
      ['Worksheet', 'Rows', 'Export reference'],
      ...rowsPerSheet.map((part, partIndex) => [
        'Grades' + (partIndex + 1),
        String(part.length),
        manifest.exportRef,
      ]),
    ];
    tabs.push({ name: 'Index', content: table(index, [], 'GUIDE') });
  }
  rowsPerSheet.forEach((part, index) =>
    tabs.push({
      name: rowsPerSheet.length === 1 ? 'Grades' : 'Grades' + (index + 1),
      content: table(
        [manifest.headers, ...part],
        manifest.fields,
        manifest.request.mode,
      ),
    }),
  );
  const archive = new ZipFile();
  const contents = buffer(archive.outputStream);
  const time = { mtime: new Date(manifest.exportedAt) };
  let expanded = 0;
  const put = (path: string, item: string) => {
    const bytes = Buffer.from(item);
    expanded += bytes.length;
    if (expanded > maxExpanded)
      throw new OfficialResultsError('scope.limit_exceeded');
    // Deflation remains bounded, including highly repetitive generated workbooks.
    archive.addBuffer(bytes, path, {
      ...time,
      compress: bytes.length <= 20_000,
    });
  };
  put(
    '[Content_Types].xml',
    xml(
      'Types',
      contentNamespace,
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="' +
        resultsXlsxMediaType.replace('.sheet', '.sheet.main+xml') +
        '"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        tabs
          .map(
            (_, index) =>
              '<Override PartName="/xl/worksheets/sheet' +
              (index + 1) +
              '.xml" ContentType="' +
              worksheetType +
              '"/>',
          )
          .join(''),
    ),
  );
  put(
    '_rels/.rels',
    partRelations([
      { id: 'rId1', type: 'officeDocument', target: 'xl/workbook.xml' },
    ]),
  );
  put(
    'xl/workbook.xml',
    declaration +
      '<workbook xmlns="' +
      sheetXmlNamespace +
      '" xmlns:r="' +
      documentRelationsNamespace +
      '"><bookViews><workbookView/></bookViews><sheets>' +
      tabs
        .map(
          (sheet, index) =>
            '<sheet name="' +
            sheet.name +
            '" sheetId="' +
            (index + 1) +
            '" r:id="rId' +
            (index + 1) +
            '"/>',
        )
        .join('') +
      '</sheets></workbook>',
  );
  put(
    'xl/_rels/workbook.xml.rels',
    partRelations([
      ...tabs.map((_, index) => ({
        id: 'rId' + (index + 1),
        type: 'worksheet',
        target: 'worksheets/sheet' + (index + 1) + '.xml',
      })),
      { id: 'rId' + (tabs.length + 1), type: 'styles', target: 'styles.xml' },
    ]),
  );
  put('xl/styles.xml', styles);
  tabs.forEach((sheet, index) =>
    put('xl/worksheets/sheet' + (index + 1) + '.xml', sheet.content),
  );
  archive.end();
  return contents;
}
