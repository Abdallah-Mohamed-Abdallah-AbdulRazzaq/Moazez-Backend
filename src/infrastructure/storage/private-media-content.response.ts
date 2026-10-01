import { Logger } from '@nestjs/common';
import type { Response } from 'express';
import { pipeline } from 'node:stream/promises';
import type { PrivateMediaContent } from './private-media-content.service';

const logger = new Logger('PrivateMediaContentResponse');

export async function streamPrivateMediaContent(
  content: PrivateMediaContent,
  response: Response,
  disposition: 'attachment' | 'inline',
): Promise<void> {
  try {
    if (response.destroyed) {
      content.stream.destroy();
      return;
    }
    response.status(200);
    response.setHeader('Content-Type', content.mimeType);
    response.setHeader('Content-Length', String(content.sizeBytes));
    response.setHeader(
      'Content-Disposition',
      contentDisposition(disposition, content.originalName),
    );
    response.setHeader('Cache-Control', 'no-store, private, max-age=0');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    await pipeline(content.stream, response);
  } catch {
    logger.error({ event: 'private_media.content.stream_failed' });
    if (!content.stream.destroyed) content.stream.destroy();
    if (!response.destroyed) response.destroy();
  }
}

function contentDisposition(disposition: string, originalName: string): string {
  const name =
    originalName.replace(/["\\\u0000-\u001f\u007f]/gu, '').trim() || 'download';
  const fallback = name.replace(/[^\u0020-\u007e]/gu, '_');
  const encoded = encodeURIComponent(name).replace(
    /['()*]/gu,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
