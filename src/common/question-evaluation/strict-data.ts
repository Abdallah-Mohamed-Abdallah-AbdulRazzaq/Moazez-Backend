import { isProxy } from 'node:util/types';
import { invalid, type AnswerPhase, type PrivateKeyState } from './contracts';

/** Inspect data descriptors only; never invoke an untrusted accessor or proxy. */
export function record(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    isProxy(value) ||
    Array.isArray(value)
  )
    invalid();
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const keys = Reflect.ownKeys(value);
  if (keys.length > required.length + optional.length) invalid();
  const output = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (
      typeof key !== 'string' ||
      (!required.includes(key) && !optional.includes(key))
    )
      invalid();
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!('value' in descriptor) || !descriptor.enumerable) invalid();
    output[key] = descriptor.value;
  }
  if (required.some((key) => !Object.hasOwn(output, key))) invalid();
  return output;
}

export function list(value: unknown, max: number): unknown[] {
  if (
    !value ||
    typeof value !== 'object' ||
    isProxy(value) ||
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype
  )
    invalid();
  const length = Object.getOwnPropertyDescriptor(value, 'length')!
    .value as number;
  if (length > max || Reflect.ownKeys(value).length !== length + 1) invalid();
  const result: unknown[] = [];
  for (let i = 0; i < length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
      invalid();
    result.push(descriptor.value);
  }
  return result;
}

export function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.length || value.length > max)
    invalid();
  for (const character of value) {
    const code = character.codePointAt(0)!;
    if (
      (code < 32 && code !== 9 && code !== 10 && code !== 13) ||
      (code >= 0x7f && code <= 0x9f) ||
      (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069) ||
      (code >= 0xd800 && code <= 0xdfff)
    )
      invalid();
  }
  return value;
}
export function identifier(value: unknown, max = 64): string {
  const result = text(value, max);
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/u.test(result)) invalid();
  return result;
}
export function bool(value: unknown): boolean {
  if (typeof value !== 'boolean') invalid();
  return value;
}
export function version(value: unknown): 1 {
  if (value !== 1) invalid();
  return 1;
}
export function kind<T extends string>(value: unknown, expected: T): T {
  if (value !== expected) invalid();
  return expected;
}
export function unique(values: readonly string[]): void {
  if (new Set(values).size !== values.length) invalid();
}
export function keyState(value: unknown): PrivateKeyState {
  const item = record(value, ['state'], ['key']);
  if (item.state === 'manual' && !Object.hasOwn(item, 'key'))
    return { state: 'manual' };
  if (item.state === 'configured' && Object.hasOwn(item, 'key'))
    return { state: 'configured', key: item.key };
  return invalid();
}
export function absent(
  value: unknown,
  phase: AnswerPhase,
  required: boolean,
): boolean {
  if (phase !== 'draft' && phase !== 'final') invalid();
  if (typeof required !== 'boolean') invalid();
  if (value !== undefined && value !== null) return false;
  if (phase === 'final' && required) invalid();
  return true;
}
