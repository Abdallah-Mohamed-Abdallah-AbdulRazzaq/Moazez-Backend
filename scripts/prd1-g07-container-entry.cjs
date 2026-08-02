'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const SOURCE_ROOT = '/workspace-source';
const WORK_ROOT = '/workspace';
const EXCLUDED_NAMES = new Set([
  '.env',
  '.git',
  'coverage',
  'dist',
  'node_modules',
]);

function isExcluded(name) {
  return EXCLUDED_NAMES.has(name) ||
    (name.startsWith('.env.') && name !== '.env.example');
}

function prepareWorkspace() {
  fs.mkdirSync(WORK_ROOT, { recursive: true });
  for (const entry of fs.readdirSync(SOURCE_ROOT, { withFileTypes: true })) {
    if (isExcluded(entry.name)) continue;
    const target = path.join(WORK_ROOT, entry.name);
    if (!fs.existsSync(target)) {
      fs.cpSync(path.join(SOURCE_ROOT, entry.name), target, {
        recursive: entry.isDirectory(),
        force: false,
        errorOnExist: true,
      });
    }
  }

  const nodeModules = path.join(WORK_ROOT, 'node_modules');
  if (!fs.existsSync(nodeModules)) {
    fs.symlinkSync('/app/node_modules', nodeModules, 'dir');
  }
}

async function main() {
  const separator = process.argv.indexOf('--');
  const command = separator >= 0 ? process.argv[separator + 1] : undefined;
  const args = separator >= 0 ? process.argv.slice(separator + 2) : [];
  if (!command) throw new Error('G07 container entry requires a command');

  prepareWorkspace();
  const child = spawn(command, args, {
    cwd: WORK_ROOT,
    env: process.env,
    shell: false,
    stdio: 'inherit',
  });

  const forward = (signal) => {
    if (!child.killed) child.kill(signal);
  };
  process.once('SIGTERM', () => forward('SIGTERM'));
  process.once('SIGINT', () => forward('SIGINT'));

  const result = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  if (result.signal) {
    process.kill(process.pid, result.signal);
    return;
  }
  process.exitCode = result.code ?? 1;
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'container_entry_failed'}\n`,
    );
    process.exitCode = 1;
  });
}

module.exports = { EXCLUDED_NAMES, isExcluded, prepareWorkspace };
