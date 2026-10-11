import { Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { pipeline } from 'node:stream/promises';
import type {
  PrivateMediaContent,
  PrivateMediaContentRequest,
} from './private-media-content.service';

export function privateMediaContentRequest(
  request: Request,
  response: Response,
  disposition: 'inline' | 'attachment',
): PrivateMediaContentRequest {
  const controller = new AbortController();
  response.once('close', () => controller.abort());
  if (request.aborted || response.destroyed) controller.abort();
  return {
    range: request.header('range'),
    ifRange: request.header('if-range'),
    head: request.method === 'HEAD',
    signal: controller.signal,
    disposition,
  };
}

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
    response.status(content.statusCode);
    response.setHeader('Content-Type', content.mimeType);
    response.setHeader('Content-Length', String(content.sizeBytes));
    response.setHeader(
      'Content-Disposition',
      contentDisposition(disposition, content.originalName),
    );
    response.setHeader('Cache-Control', 'no-store, private, max-age=0');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Accept-Ranges', 'bytes');
    response.setHeader(
      'Access-Control-Expose-Headers',
      'Content-Disposition,Content-Range,Accept-Ranges,ETag',
    );
    if (content.etag) response.setHeader('ETag', content.etag);
    if (content.statusCode === 416)
      response.setHeader('Content-Range', `bytes */${content.totalSizeBytes}`);
    else if (content.range)
      response.setHeader(
        'Content-Range',
        `bytes ${content.range.offset}-${content.range.offset + content.range.length - 1}/${content.totalSizeBytes}`,
      );
    if (content.head || content.statusCode === 416) {
      content.stream.destroy();
      response.end();
      return;
    }
    await pipeline(content.stream, response);
  } catch {
    logger.error({ event: 'private_media.content.stream_failed' });
    if (!content.stream.destroyed) content.stream.destroy();
    if (!response.destroyed) response.destroy();
  }
}

function contentDisposition(disposition: string, originalName: string): string {
  const name =
    Array.from(originalName, (character) => {
      const code = character.charCodeAt(0);
      return character.length === 1 && code >= 0xd800 && code <= 0xdfff
        ? '\ufffd'
        : character;
    })
      .filter((character) => {
        const code = character.charCodeAt(0);
        return (
          code >= 0x20 &&
          code !== 0x7f &&
          character !== '"' &&
          character !== '\\' &&
          character !== '/'
        );
      })
      .slice(0, 240)
      .join('')
      .trim() || 'download';
  const fallback = name.replace(/[^\u0020-\u007e]/gu, '_');
  const encoded = encodeURIComponent(name).replace(
    /['()*]/gu,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
