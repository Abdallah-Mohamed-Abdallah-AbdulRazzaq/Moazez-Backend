import { AcademicContentStatus } from '@prisma/client';
import {
  assertAcademicContentArchived,
  assertAcademicContentMutable,
  classifyAcademicContentTerm,
  isAcademicContentTermWritable,
  normalizeAcademicContentDescription,
  normalizeAcademicContentTitle,
} from '../domain/academic-content-lifecycle.policy';

const startDate = new Date('2030-09-01T00:00:00.000Z');
const endDate = new Date('2030-09-30T00:00:00.000Z');
const term = (isActive: boolean) => ({ startDate, endDate, isActive });

describe('ACC-4A envelope and term policy', () => {
  it('trims and validates title without fabricating or truncating', () => {
    expect(normalizeAcademicContentTitle('  Algebra  ')).toBe('Algebra');
    expect(() => normalizeAcademicContentTitle('   ')).toThrow();
    expect(() => normalizeAcademicContentTitle('x'.repeat(181))).toThrow();
    expect(() => normalizeAcademicContentTitle(null)).toThrow();
  });

  it('trims and validates optional description', () => {
    expect(normalizeAcademicContentDescription('  detail  ')).toBe('detail');
    expect(normalizeAcademicContentDescription('   ')).toBeNull();
    expect(normalizeAcademicContentDescription(undefined)).toBeNull();
    expect(() =>
      normalizeAcademicContentDescription('x'.repeat(4001)),
    ).toThrow();
  });

  it.each([
    ['2030-08-31T23:59:59.000Z', false, 'FUTURE_TERM', true],
    ['2030-08-31T23:59:59.000Z', true, 'FUTURE_TERM', true],
    ['2030-09-01T00:00:00.000Z', true, 'CURRENT_TERM', true],
    ['2030-09-30T23:59:59.000Z', true, 'CURRENT_TERM', true],
    ['2030-09-15T12:00:00.000Z', false, 'CURRENT_TERM', false],
    ['2030-10-01T00:00:00.000Z', false, 'HISTORICALLY_ENDED', false],
    ['2030-10-01T00:00:00.000Z', true, 'HISTORICALLY_ENDED', false],
  ] as const)(
    'classifies %s, active=%s as %s, writable=%s',
    (date, active, phase, writable) => {
      const now = new Date(date);
      expect(classifyAcademicContentTerm(term(active), now)).toBe(phase);
      expect(isAcademicContentTermWritable(term(active), now)).toBe(writable);
    },
  );

  it('permits mutation only in DRAFT and restore only from ARCHIVED', () => {
    expect(() =>
      assertAcademicContentMutable(AcademicContentStatus.DRAFT),
    ).not.toThrow();
    expect(() =>
      assertAcademicContentMutable(AcademicContentStatus.ARCHIVED),
    ).toThrow();
    expect(() =>
      assertAcademicContentMutable(AcademicContentStatus.SUBMITTED),
    ).toThrow();
    expect(() =>
      assertAcademicContentArchived(AcademicContentStatus.ARCHIVED),
    ).not.toThrow();
    expect(() =>
      assertAcademicContentArchived(AcademicContentStatus.DRAFT),
    ).toThrow();
  });
});
