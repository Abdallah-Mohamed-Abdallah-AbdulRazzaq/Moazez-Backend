import {
  normalizeResponseConfig,
  ResponseConfigInputError,
  type ResponseConfigV1,
} from '../../../common/assessment-answer/response-config';
import { HomeworkQuestionInvalidTypePayloadException } from './homework-question.exceptions';

export function homeworkResponseConfig(
  type: string,
  value: unknown,
): ResponseConfigV1 | null {
  try {
    const config = normalizeResponseConfig(value);
    if (config && !['SHORT_TEXT', 'LONG_TEXT'].includes(type))
      throw new ResponseConfigInputError();
    return config;
  } catch (error) {
    if (!(error instanceof ResponseConfigInputError)) throw error;
    throw new HomeworkQuestionInvalidTypePayloadException({
      reason: 'invalid_response_config',
    });
  }
}
