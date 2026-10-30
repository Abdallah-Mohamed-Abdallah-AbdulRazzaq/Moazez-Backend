/** Pure shared modality rules. Domain adapters own errors, identity and lifecycle. */
export const RESPONSE_MODES = [
  'TEXT_ONLY',
  'FILE_ONLY',
  'AUDIO_ONLY',
  'TEXT_OR_FILE',
  'TEXT_AND_FILE',
  'FILE_OR_AUDIO',
] as const;
export type ResponseMode = (typeof RESPONSE_MODES)[number];
export type ResponseConfigV1 =
  | { version: 1; mode: 'TEXT_ONLY' }
  | { version: 1; mode: Exclude<ResponseMode, 'TEXT_ONLY'>; maxFiles: number };
export const ANSWER_FILES_MAXIMUM = 3;
export const ANSWER_DOCUMENT_MIMES: readonly string[] = Object.freeze([
  'text/plain',
  'application/pdf',
  'image/jpeg',
  'image/png',
]);
export const ANSWER_AUDIO_MIMES: readonly string[] = Object.freeze([
  'audio/mpeg',
  'audio/mp4',
  'audio/webm',
]);
export class ResponseConfigInputError extends Error {
  constructor() {
    super('Invalid question response configuration or modality');
  }
}
function invalid(): never {
  throw new ResponseConfigInputError();
}

export function normalizeResponseConfig(
  value: unknown,
): ResponseConfigV1 | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) invalid();
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).some(
      (key) => !['version', 'mode', 'maxFiles'].includes(key),
    ) ||
    row.version !== 1 ||
    !RESPONSE_MODES.includes(row.mode as ResponseMode)
  )
    invalid();
  if (row.mode === 'TEXT_ONLY') {
    if (Object.hasOwn(row, 'maxFiles')) invalid();
    return { version: 1, mode: 'TEXT_ONLY' };
  }
  const maxFiles = Object.hasOwn(row, 'maxFiles') ? row.maxFiles : 1;
  if (
    typeof maxFiles !== 'number' ||
    !Number.isInteger(maxFiles) ||
    maxFiles < 1 ||
    maxFiles > ANSWER_FILES_MAXIMUM
  )
    invalid();
  return {
    version: 1,
    mode: row.mode as Exclude<ResponseMode, 'TEXT_ONLY'>,
    maxFiles,
  };
}

export function responseAllowsMime(
  config: ResponseConfigV1,
  mime: string,
): boolean {
  if (config.mode === 'TEXT_ONLY') return false;
  const audio = ANSWER_AUDIO_MIMES.includes(mime),
    file = ANSWER_DOCUMENT_MIMES.includes(mime);
  if (config.mode === 'AUDIO_ONLY') return audio;
  if (config.mode === 'FILE_OR_AUDIO') return audio || file;
  return file;
}

/** Only verified, currently eligible assets may be passed by a domain repository. */
export function assertResponseModalities(input: {
  config: ResponseConfigV1;
  hasText: boolean;
  assets: readonly { mimeType: string }[];
  required: boolean;
  phase: 'draft' | 'final';
}): void {
  const { config, hasText, assets, required, phase } = input;
  if (
    assets.some((asset) => !responseAllowsMime(config, asset.mimeType)) ||
    assets.length > (config.mode === 'TEXT_ONLY' ? 0 : config.maxFiles)
  )
    invalid();
  if (
    hasText &&
    ['FILE_ONLY', 'AUDIO_ONLY', 'FILE_OR_AUDIO'].includes(config.mode)
  )
    invalid();
  const hasAsset = assets.length > 0;
  // Optional absence is allowed; supplied partial answers still obey the final mode.
  if (phase === 'draft' || (!required && !hasText && !hasAsset)) return;
  const complete =
    config.mode === 'TEXT_ONLY'
      ? hasText
      : config.mode === 'TEXT_AND_FILE'
        ? hasText && hasAsset
        : config.mode === 'TEXT_OR_FILE'
          ? hasText || hasAsset
          : hasAsset;
  if (!complete) invalid();
}
