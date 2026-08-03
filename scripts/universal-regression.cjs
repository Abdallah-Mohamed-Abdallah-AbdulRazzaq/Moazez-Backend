'use strict';

const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { main, redactText } = require('./prd1-g07-universal-regression.cjs');

const ZERO_SHA = /^0{40}$/u;

function resolveCurrentBase(options = {}) {
  const environment = options.environment ?? process.env;
  const event = environment.GITHUB_EVENT_NAME || 'local';
  const explicit = environment.REGRESSION_BASE_SHA?.trim();
  if (explicit) {
    return {
      base: explicit,
      source:
        environment.REGRESSION_BASE_SOURCE?.trim() ||
        'environment:REGRESSION_BASE_SHA',
      event,
    };
  }

  const payload = options.eventPayload ?? readEventPayload(environment);
  if (event === 'pull_request') {
    const base = payload?.pull_request?.base?.sha;
    if (!base) throw new Error('pull_request base SHA is required');
    return { base, source: 'github.event.pull_request.base.sha', event };
  }

  if (event === 'push') {
    const before = payload?.before;
    if (!before) throw new Error('push before SHA is required');
    if (!ZERO_SHA.test(before)) {
      return { base: before, source: 'github.event.before', event };
    }
    return {
      base: resolveHeadParent(options.repositoryRoot),
      source: 'github.event.before:all-zero-head-parent-fallback',
      event,
    };
  }

  if (event === 'workflow_dispatch') {
    const input = payload?.inputs?.base_sha?.trim();
    if (input) {
      return { base: input, source: 'github.event.inputs.base_sha', event };
    }
    return {
      base: resolveHeadParent(options.repositoryRoot),
      source: 'workflow_dispatch:validated-head-parent-fallback',
      event,
    };
  }

  throw new Error(
    'REGRESSION_BASE_SHA is required outside a supported GitHub event',
  );
}

function createCurrentGateOptions(baseResolution) {
  return {
    mode: 'current',
    gate: 'CURRENT-UNIVERSAL-REGRESSION',
    label: 'Current regression',
    logPrefix: 'REGRESSION',
    base: baseResolution.base,
    baseSource: baseResolution.source,
    event: baseResolution.event,
    expectedBranch: null,
    allowedScopePaths: null,
    forbidHistoricalSchemaAndLockfileScope: false,
    orchestratorTestFiles: [
      'scripts/tests/prd1-g07-universal-regression.test.cjs',
      'scripts/tests/universal-regression.test.cjs',
    ],
    summaryEnvironmentVariable: 'REGRESSION_SUMMARY_PATH',
  };
}

function readEventPayload(environment) {
  if (!environment.GITHUB_EVENT_PATH) return null;
  return JSON.parse(fs.readFileSync(environment.GITHUB_EVENT_PATH, 'utf8'));
}

function resolveHeadParent(repositoryRoot = process.cwd()) {
  return execFileSync('git', ['rev-parse', 'HEAD^'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
}

if (require.main === module) {
  try {
    const resolution = resolveCurrentBase();
    void main(createCurrentGateOptions(resolution)).catch((error) => {
      process.stderr.write(
        `${redactText(error instanceof Error ? error.stack ?? error.message : String(error))}\n`,
      );
      process.exitCode = 1;
    });
  } catch (error) {
    process.stderr.write(
      `${redactText(error instanceof Error ? error.message : String(error))}\n`,
    );
    process.exitCode = 1;
  }
}

module.exports = {
  ZERO_SHA,
  createCurrentGateOptions,
  resolveCurrentBase,
};
