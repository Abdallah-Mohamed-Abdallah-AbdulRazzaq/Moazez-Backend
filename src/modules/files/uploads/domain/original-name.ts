import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';

export function sanitizeOriginalName(untrustedName: string): string {
  const basename = untrustedName.split(/[\\/]/u).at(-1) ?? '';
  const sanitized = basename.replace(/\p{Cc}/gu, '').trim();
  const codePointLength = Array.from(sanitized).length;
  if (codePointLength === 0 || codePointLength > 255) {
    throw new ValidationDomainException('Original filename is invalid', {
      field: 'originalName',
    });
  }
  return sanitized;
}
