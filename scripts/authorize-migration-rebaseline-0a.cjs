'use strict';

const fs = require('node:fs');
const os = require('node:os');

const {
  APPROVED_REBASELINE_BASE_COMMIT,
  APPROVED_REBASELINE_MIGRATION,
  APPROVED_REBASELINE_SAFETY_TAG,
  inspectIncidentRebaselineAuthorization,
} = require('./check-migration-governance.cjs');

function main() {
  const result = inspectIncidentRebaselineAuthorization();

  if (!result.approved) {
    console.log(
      'MIGRATION-RECOVERY-0A one-time authorization was not granted; strict migration governance remains active.',
    );
    for (const problem of result.problems) {
      console.log(`- [${problem.code}] ${problem.message}`);
    }
    return;
  }

  const githubEnvironmentPath = process.env.GITHUB_ENV;
  if (!githubEnvironmentPath) {
    throw new Error(
      'GITHUB_ENV is required to emit the incident-scoped CI authorization.',
    );
  }

  fs.appendFileSync(
    githubEnvironmentPath,
    `MIGRATION_REBASELINE_APPROVED=1${os.EOL}`,
    'utf8',
  );

  console.log(
    [
      'Authorized MIGRATION-RECOVERY-0A for this workflow run only:',
      `base=${APPROVED_REBASELINE_BASE_COMMIT}`,
      `tag=${APPROVED_REBASELINE_SAFETY_TAG}`,
      `baseline=${APPROVED_REBASELINE_MIGRATION}`,
    ].join(' '),
  );
}

try {
  main();
} catch (error) {
  console.error(
    `[REBASELINE_AUTHORIZATION_INTERNAL_ERROR] ${
      error instanceof Error ? error.stack || error.message : String(error)
    }`,
  );
  process.exitCode = 1;
}
