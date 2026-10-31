import { createHash } from 'node:crypto';
import { isProxy } from 'node:util/types';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';

/** Closed caller-selected snapshots only; never persists or logs the payload. */
export function gradeReviewFingerprint(value: unknown): string {
  let nodes = 0,
    bytes = 0;
  const seen = new Set<object>();
  const invalid = (): never => {
    throw new ValidationDomainException('Invalid grade review evidence');
  };
  const canonical = (item: unknown, depth: number): string => {
    if (++nodes > 16000 || depth > 16) return invalid();
    if (item === null || typeof item === 'boolean') return JSON.stringify(item);
    if (typeof item === 'number')
      return Number.isFinite(item) ? JSON.stringify(item) : invalid();
    if (typeof item === 'string') {
      bytes += Buffer.byteLength(item, 'utf8');
      if (bytes > 256 * 1024) return invalid();
      return JSON.stringify(item);
    }
    if (!item || typeof item !== 'object' || isProxy(item) || seen.has(item))
      return invalid();
    if (
      Object.getPrototypeOf(item) !==
        (Array.isArray(item) ? Array.prototype : Object.prototype) &&
      Object.getPrototypeOf(item) !== null
    )
      return invalid();
    seen.add(item);
    let result: string;
    if (Array.isArray(item)) {
      if (
        item.length > 2000 ||
        Reflect.ownKeys(item).length !== item.length + 1
      )
        return invalid();
      result =
        '[' +
        Array.from({ length: item.length }, (_, index) => {
          const descriptor = Object.getOwnPropertyDescriptor(
            item,
            String(index),
          );
          return descriptor && 'value' in descriptor
            ? canonical(descriptor.value, depth + 1)
            : invalid();
        }).join(',') +
        ']';
    } else {
      const keys = Reflect.ownKeys(item);
      if (keys.length > 2000 || keys.some((key) => typeof key !== 'string'))
        return invalid();
      result =
        '{' +
        (keys as string[])
          .sort()
          .map((key) => {
            bytes += Buffer.byteLength(key, 'utf8');
            if (bytes > 256 * 1024) return invalid();
            const descriptor = Object.getOwnPropertyDescriptor(item, key)!;
            if (!('value' in descriptor) || !descriptor.enumerable)
              return invalid();
            return (
              JSON.stringify(key) + ':' + canonical(descriptor.value, depth + 1)
            );
          })
          .join(',') +
        '}';
    }
    seen.delete(item);
    return result;
  };
  return createHash('sha256').update(canonical(value, 0)).digest('hex');
}
