'use strict';

const CI_PARENT_RUN_ID_PATTERN = /^[a-f0-9]{14}$/u;

function resolveCiParentRunId(value, createFallbackRunId) {
  if (value === undefined) {
    if (typeof createFallbackRunId !== 'function') {
      throw new TypeError('createFallbackRunId must be a function');
    }
    return createFallbackRunId();
  }
  if (typeof value !== 'string' || !CI_PARENT_RUN_ID_PATTERN.test(value)) {
    throw new Error(
      'MOAZEZ_CI_PARENT_RUN_ID must be exactly 14 lowercase hexadecimal characters',
    );
  }
  return value;
}

module.exports = {
  CI_PARENT_RUN_ID_PATTERN,
  resolveCiParentRunId,
};
