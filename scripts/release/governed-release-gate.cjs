'use strict';

const RELEASE_STAGE_IDS = Object.freeze([
  'artifact-and-checksum-preflight',
  'backup-and-data-authority-checkpoint',
  'migration-job',
  'migration-status-and-drift-verification',
  'core-worker-promotion',
  'media-worker-promotion',
  'api-no-traffic-promotion',
  'maintenance-scheduler-promotion',
  'protected-readiness-and-smoke',
  'traffic-promotion',
]);

function assertOperations(operations) {
  if (!operations || typeof operations !== 'object') {
    throw new TypeError('release operations are required');
  }
  for (const stage of RELEASE_STAGE_IDS) {
    if (typeof operations[stage] !== 'function') {
      throw new TypeError(`release operation is missing: ${stage}`);
    }
  }
}

async function runGovernedReleaseSequence(operations, options = {}) {
  assertOperations(operations);
  const onEvent = options.onEvent ?? (() => {});
  const events = [];

  for (const stage of RELEASE_STAGE_IDS) {
    const started = Object.freeze({ stage, status: 'started' });
    events.push(started);
    onEvent(started);
    try {
      await operations[stage]();
      const succeeded = Object.freeze({ stage, status: 'succeeded' });
      events.push(succeeded);
      onEvent(succeeded);
    } catch (cause) {
      const failed = Object.freeze({ stage, status: 'failed' });
      events.push(failed);
      onEvent(failed);
      const error = new Error(`release stage failed: ${stage}`, { cause });
      error.stage = stage;
      error.events = Object.freeze([...events]);
      throw error;
    }
  }

  return Object.freeze({ status: 'succeeded', events: Object.freeze(events) });
}

module.exports = {
  RELEASE_STAGE_IDS,
  runGovernedReleaseSequence,
};
