export interface PrivateMediaByteRange {
  offset: number;
  length: number;
}

/** One byte range only. Invalid, overflowing and multipart ranges fail closed. */
export function resolvePrivateMediaRange(
  header: string,
  size: number,
): PrivateMediaByteRange | null {
  const match = /^bytes=(\d*)-(\d*)$/u.exec(header.trim());
  if (!match || size === 0 || (!match[1] && !match[2])) return null;
  const integer = (value: string): number | null => {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
  };
  if (!match[1]) {
    const suffix = integer(match[2]);
    if (suffix === null || suffix === 0) return null;
    const length = Math.min(suffix, size);
    return { offset: size - length, length };
  }
  const start = integer(match[1]);
  const end = match[2] ? integer(match[2]) : size - 1;
  if (start === null || end === null || start >= size || end < start)
    return null;
  return { offset: start, length: Math.min(end, size - 1) - start + 1 };
}
