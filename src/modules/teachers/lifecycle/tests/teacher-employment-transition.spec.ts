import { TeacherEmploymentStatus } from '@prisma/client';
import {
  isAllowedTeacherEmploymentTransition,
  resolveTeacherEmploymentEffectiveAt,
} from '../domain/teacher-employment-transition';

describe('Teacher employment transition policy', () => {
  it.each([
    [TeacherEmploymentStatus.ACTIVE, TeacherEmploymentStatus.INACTIVE],
    [TeacherEmploymentStatus.ACTIVE, TeacherEmploymentStatus.TERMINATED],
    [TeacherEmploymentStatus.INACTIVE, TeacherEmploymentStatus.ACTIVE],
    [TeacherEmploymentStatus.INACTIVE, TeacherEmploymentStatus.TERMINATED],
  ])('allows %s -> %s', (previous, next) => {
    expect(isAllowedTeacherEmploymentTransition(previous, next)).toBe(true);
  });

  it.each([
    [TeacherEmploymentStatus.ACTIVE, TeacherEmploymentStatus.ACTIVE],
    [TeacherEmploymentStatus.INACTIVE, TeacherEmploymentStatus.INACTIVE],
    [TeacherEmploymentStatus.TERMINATED, TeacherEmploymentStatus.TERMINATED],
    [TeacherEmploymentStatus.TERMINATED, TeacherEmploymentStatus.ACTIVE],
    [TeacherEmploymentStatus.TERMINATED, TeacherEmploymentStatus.INACTIVE],
  ])('rejects %s -> %s', (previous, next) => {
    expect(isAllowedTeacherEmploymentTransition(previous, next)).toBe(false);
  });

  it.each([
    '2025-02-29T00:00:00Z',
    '2026-02-31T00:00:00Z',
    '2026-04-31T00:00:00Z',
    '2026-01-01T24:00:00Z',
    '2026-01-01T00:60:00Z',
    '2026-01-01T00:00:60Z',
    '2026-01-01T00:00:00+24:00',
    '2026-01-01T00:00:00+01:60',
  ])('rejects calendar-invalid effectiveAt %s', (raw) => {
    expect(() =>
      resolveTeacherEmploymentEffectiveAt(
        raw,
        new Date('2028-03-01T00:00:00.000Z'),
      ),
    ).toThrow('effectiveAt must be an exact non-future ISO timestamp');
  });

  it.each([
    ['2028-02-29T00:00:00Z', '2028-02-29T00:00:00.000Z'],
    ['2026-07-18T19:36:19.198+03:00', '2026-07-18T16:36:19.198Z'],
    ['2026-07-18T13:36:19.198-03:00', '2026-07-18T16:36:19.198Z'],
  ])('preserves the exact instant for %s', (raw, expected) => {
    expect(
      resolveTeacherEmploymentEffectiveAt(
        raw,
        new Date('2028-03-01T00:00:00.000Z'),
      ).toISOString(),
    ).toBe(expected);
  });

  it('rejects a future effectiveAt and copies the fixed request time by value', () => {
    const now = new Date('2026-07-19T12:00:00.000Z');
    expect(() =>
      resolveTeacherEmploymentEffectiveAt('2026-07-19T12:00:00.001Z', now),
    ).toThrow('effectiveAt must be an exact non-future ISO timestamp');
    const resolved = resolveTeacherEmploymentEffectiveAt(undefined, now);
    expect(resolved).not.toBe(now);
    expect(resolved.toISOString()).toBe(now.toISOString());
  });
});
