import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { classifyPersistedUrl } from '../../../../infrastructure/storage/provider-url.policy';

const URL_FIELD = /(?:url|uri|href|src|link|endpoint)$/i;
const URL_TOKEN =
  /(?:\b[a-z][a-z0-9+.-]*:\/\/|\b(?:https?|gs|s3):(?=[a-z0-9/]|\[)|\b(?:javascript|vbscript|data|file|blob|mailto):|(?<!:)\/\/)[^\s<>"']+/gi;
const PRIVATE_FIELD =
  /^(?:answerkey|correct.*|iscorrect|acceptedanswers?(?:ar|en)?|sampleanswer(?:ar|en)?|explanation(?:ar|en)?|bucket|objectkey|storagekey|signedurl|credentials?|token|authorization|.*metadata|storage)$/i;
const STORAGE_FIELD =
  /^(?:bucket|bucketname|objectkey|storagekey|signedurl|credentials?|authorization)$/i;
const CAPABILITY_PARAM =
  /^(?:x-goog-.+|x-amz-.+|googleaccessid|awsaccesskeyid|signature|sig|token|access_token|credential|credentials|bucket(?:name)?|object_?key|storage_?key)$/i;

export function isSafeGradeUrl(value: string, depth = 0): boolean {
  if (depth > 4) return false;
  const result = classifyPersistedUrl(value);
  if (result.classification !== 'external_https') return false;
  try {
    const url = new URL(value);
    const parameters = [...url.searchParams];
    if (
      parameters.length > 128 ||
      parameters.some(([key]) => CAPABILITY_PARAM.test(key))
    )
      return false;
    return [...parameters.map(([, nested]) => nested), url.hash.slice(1)].every(
      (nested) =>
        (nested.match(URL_TOKEN) ?? []).every((link) =>
          isSafeGradeUrl(link, depth + 1),
        ),
    );
  } catch {
    return false;
  }
}

/** Bounded JSON inspection; never fetches a link or includes rejected values in errors. */
export function validateGradeQuestionContent(value: unknown): void {
  let remaining = 4096;
  const visit = (node: unknown, field = '', depth = 0): void => {
    if (--remaining < 0 || depth > 16) {
      throw new ValidationDomainException(
        'Question content exceeds validation limits',
        { field: 'metadata' },
      );
    }
    if (typeof node === 'string') {
      if (node.length > 65536) {
        throw new ValidationDomainException(
          'Question content exceeds validation limits',
          { field: 'metadata' },
        );
      }
      const urls =
        URL_FIELD.test(field) && node.trim()
          ? [node.trim()]
          : (node.match(URL_TOKEN) ?? []);
      if (urls.some((url) => !isSafeGradeUrl(url))) {
        throw new ValidationDomainException(
          'Question content contains an unsupported link',
          { field: 'metadata' },
        );
      }
    } else if (Array.isArray(node)) {
      for (const item of node) visit(item, field, depth + 1);
    } else if (node && typeof node === 'object') {
      for (const [key, item] of Object.entries(node)) {
        if (STORAGE_FIELD.test(key.replace(/[_-]/g, ''))) {
          throw new ValidationDomainException(
            'Question content contains unsupported storage metadata',
            { field: 'metadata' },
          );
        }
        // Keys can themselves carry a URL/capability.
        visit(key, '', depth + 1);
        visit(item, key, depth + 1);
      }
    }
  };
  visit(value);
}

/** Fail closed for old persisted JSON as well as newly normalized content. */
export function sanitizeGradeQuestionContent(
  value: unknown,
  publicProjection = false,
): unknown {
  let remaining = 4096;
  const visit = (node: unknown, field = '', depth = 0): unknown => {
    if (--remaining < 0 || depth > 16) return null;
    if (typeof node === 'string') {
      try {
        validateGradeQuestionContent({ [field || 'text']: node });
        return node;
      } catch {
        return null;
      }
    }
    if (Array.isArray(node))
      return node.slice(0, 4096).map((item) => visit(item, field, depth + 1));
    if (!node || typeof node !== 'object') return node ?? null;
    return Object.fromEntries(
      Object.entries(node)
        .slice(0, 4096)
        .filter(
          ([key]) =>
            !STORAGE_FIELD.test(key.replace(/[_-]/g, '')) &&
            !(publicProjection && PRIVATE_FIELD.test(key.replace(/[_-]/g, ''))),
        )
        .filter(([key]) => {
          try {
            validateGradeQuestionContent(key);
            return true;
          } catch {
            return false;
          }
        })
        .map(([key, item]) => [key, visit(item, key, depth + 1)]),
    );
  };
  return visit(value);
}
