import type { ApiPropertyOptions } from '@nestjs/swagger';

export const RESPONSE_CONFIG_OPENAPI: ApiPropertyOptions = {
  nullable: true,
  description:
    'Closed ST11 V1 configuration on supported text questions; null/absence preserves legacy behavior.',
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['version', 'mode'],
      properties: {
        version: { type: 'integer', enum: [1] },
        mode: { type: 'string', enum: ['TEXT_ONLY'] },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['version', 'mode'],
      properties: {
        version: { type: 'integer', enum: [1] },
        mode: {
          type: 'string',
          enum: [
            'FILE_ONLY',
            'AUDIO_ONLY',
            'TEXT_OR_FILE',
            'TEXT_AND_FILE',
            'FILE_OR_AUDIO',
          ],
        },
        maxFiles: { type: 'integer', minimum: 1, maximum: 3, default: 1 },
      },
    },
  ],
};
