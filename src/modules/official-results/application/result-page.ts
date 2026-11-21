import { ValidationDomainException } from '../../../common/exceptions/domain-exception';
import { resultContentDigest } from '../domain/result-content-digest';

export interface ResultListQuery {
  limit?: number;
  cursor?: string;
}

function pageBinding(scope: string, list: string, filters?: object): string {
  return resultContentDigest({ scope, list, filters });
}

export function readResultCursor(
  query: ResultListQuery,
  scope: string,
  list: string,
  filters?: object,
): { limit: number; after: string | null } {
  const limit = query.limit ?? 50;
  if (query.cursor === undefined) return { limit, after: null };
  try {
    if (query.cursor.length > 300 || !/^[a-zA-Z0-9_-]+$/u.test(query.cursor))
      throw new Error();
    const parsed: unknown = JSON.parse(
      Buffer.from(query.cursor, 'base64url').toString('utf8'),
    );
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 2 ||
      parsed[0] !== pageBinding(scope, list, filters) ||
      typeof parsed[1] !== 'string'
    ) {
      throw new Error();
    }
    return { limit, after: parsed[1] };
  } catch {
    throw new ValidationDomainException(
      'The cursor is invalid for this result list',
    );
  }
}

export function presentResultPage<T>(
  rows: T[],
  limit: number,
  key: (item: T) => string,
  scope: string,
  list: string,
  filters?: object,
) {
  const items = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  const nextCursor = hasMore
    ? Buffer.from(
        JSON.stringify([
          pageBinding(scope, list, filters),
          key(items[items.length - 1]),
        ]),
        'utf8',
      ).toString('base64url')
    : null;
  return { items, hasMore, nextCursor };
}
