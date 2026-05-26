import { LessonContentItemType, Prisma } from '@prisma/client';
import {
  LessonContentInvalidTypePayloadException,
  LessonContentInvalidUrlException,
} from './lesson-content.exceptions';

export type NormalizedLessonContentPayload = {
  type: LessonContentItemType;
  title: string;
  bodyText: string | null;
  url: string | null;
  fileId: string | null;
  isRequired: boolean;
  estimatedMinutes: number | null;
  metadata: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
};

type LessonContentInput = {
  type?: LessonContentItemType;
  title?: string;
  bodyText?: string | null;
  url?: string | null;
  fileId?: string | null;
  isRequired?: boolean;
  estimatedMinutes?: number | null;
  metadata?: Record<string, unknown> | null;
};

type ExistingLessonContentState = {
  type: LessonContentItemType;
  title: string;
  bodyText: string | null;
  url: string | null;
  fileId: string | null;
  isRequired: boolean;
  estimatedMinutes: number | null;
  metadata: Prisma.JsonValue;
};

export function normalizeCreateLessonContentInput(
  input: LessonContentInput & {
    type: LessonContentItemType;
    title: string;
  },
): NormalizedLessonContentPayload {
  const title = normalizeRequiredTitle(input.title);
  const state = {
    type: input.type,
    title,
    bodyText: normalizeNullableText(input.bodyText),
    url: normalizeNullableUrl(input.url),
    fileId: normalizeNullableId(input.fileId),
    isRequired: input.isRequired ?? false,
    estimatedMinutes: input.estimatedMinutes ?? null,
    metadata: metadataToPrisma(input.metadata),
  };

  return validateLessonContentPayload(state, input);
}

export function normalizeUpdateLessonContentInput(
  existing: ExistingLessonContentState,
  input: LessonContentInput,
): NormalizedLessonContentPayload {
  const targetType = input.type ?? existing.type;
  const state = {
    type: targetType,
    title:
      input.title !== undefined
        ? normalizeRequiredTitle(input.title)
        : existing.title,
    bodyText:
      input.bodyText !== undefined
        ? normalizeNullableText(input.bodyText)
        : existing.bodyText,
    url:
      input.url !== undefined ? normalizeNullableUrl(input.url) : existing.url,
    fileId:
      input.fileId !== undefined
        ? normalizeNullableId(input.fileId)
        : existing.fileId,
    isRequired:
      input.isRequired !== undefined ? input.isRequired : existing.isRequired,
    estimatedMinutes:
      input.estimatedMinutes !== undefined
        ? input.estimatedMinutes
        : existing.estimatedMinutes,
    metadata:
      input.metadata !== undefined
        ? metadataToPrisma(input.metadata)
        : jsonToPrisma(existing.metadata),
  };

  const normalized = validateLessonContentPayload(state, input);

  if (input.type !== undefined && input.type !== existing.type) {
    return clearFieldsForType(normalized);
  }

  return normalized;
}

function validateLessonContentPayload(
  state: NormalizedLessonContentPayload,
  input: LessonContentInput,
): NormalizedLessonContentPayload {
  switch (state.type) {
    case LessonContentItemType.TEXT:
      if (!state.bodyText) {
        throw new LessonContentInvalidTypePayloadException({
          field: 'bodyText',
          type: state.type,
        });
      }
      rejectProvidedValue(input.url, 'url', state.type);
      rejectProvidedValue(input.fileId, 'fileId', state.type);
      return { ...state, url: null, fileId: null };

    case LessonContentItemType.FILE:
      if (!state.fileId) {
        throw new LessonContentInvalidTypePayloadException({
          field: 'fileId',
          type: state.type,
        });
      }
      rejectProvidedValue(input.url, 'url', state.type);
      return { ...state, url: null };

    case LessonContentItemType.VIDEO_LINK:
    case LessonContentItemType.EXTERNAL_LINK:
      if (!state.url) {
        throw new LessonContentInvalidTypePayloadException({
          field: 'url',
          type: state.type,
        });
      }
      rejectProvidedValue(input.fileId, 'fileId', state.type);
      return { ...state, url: normalizeSafeUrl(state.url), fileId: null };

    default:
      throw new LessonContentInvalidTypePayloadException({
        field: 'type',
        type: state.type,
      });
  }
}

function clearFieldsForType(
  state: NormalizedLessonContentPayload,
): NormalizedLessonContentPayload {
  if (state.type === LessonContentItemType.TEXT) {
    return { ...state, url: null, fileId: null };
  }

  if (state.type === LessonContentItemType.FILE) {
    return { ...state, url: null };
  }

  return { ...state, fileId: null };
}

export function normalizeRequiredTitle(value: string): string {
  const title = value.trim();
  if (title.length === 0) {
    throw new LessonContentInvalidTypePayloadException({ field: 'title' });
  }

  return title;
}

export function normalizeNullableText(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeNullableUrl(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeNullableId(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeSafeUrl(value: string): string {
  const normalized = value.trim();
  let parsed: URL;

  try {
    parsed = new URL(normalized);
  } catch {
    throw new LessonContentInvalidUrlException({ url: value });
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'https:' && protocol !== 'http:') {
    throw new LessonContentInvalidUrlException({
      url: value,
      protocol,
    });
  }

  if (!parsed.hostname) {
    throw new LessonContentInvalidUrlException({ url: value });
  }

  return parsed.toString();
}

function rejectProvidedValue(
  value: string | null | undefined,
  field: string,
  type: LessonContentItemType,
): void {
  if (value === undefined || value === null) {
    return;
  }

  if (String(value).trim().length === 0) {
    return;
  }

  throw new LessonContentInvalidTypePayloadException({ field, type });
}

function metadataToPrisma(
  value: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  if (value === undefined || value === null) {
    return Prisma.DbNull;
  }

  return value as Prisma.InputJsonValue;
}

function jsonToPrisma(
  value: Prisma.JsonValue,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  if (value === null) {
    return Prisma.DbNull;
  }

  return value as Prisma.InputJsonValue;
}
