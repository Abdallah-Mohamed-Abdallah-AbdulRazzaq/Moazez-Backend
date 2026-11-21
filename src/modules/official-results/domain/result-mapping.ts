import { z } from 'zod/v4';

export const fieldMappingSchema = z.strictObject({
  fromFieldId: z.uuid(),
  toFieldId: z.uuid().optional(),
  action: z.enum(['PRESERVE', 'COPY', 'RETIRE']),
});
