import {
  normalizeResponseConfig,
  ResponseConfigInputError,
  type ResponseConfigV1,
} from '../../../../common/assessment-answer/response-config';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';

export function gradeResponseConfig(
  type: string,
  value: unknown,
): ResponseConfigV1 | null {
  try {
    const config = normalizeResponseConfig(value);
    if (config && !['SHORT_ANSWER', 'ESSAY'].includes(type))
      throw new ResponseConfigInputError();
    return config;
  } catch (error) {
    if (!(error instanceof ResponseConfigInputError)) throw error;
    throw new ValidationDomainException(
      'Question response configuration is invalid',
      { field: 'responseConfig' },
    );
  }
}
