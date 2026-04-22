const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const ENV_PATH = path.join(process.cwd(), '.env');
const SOCKET_TIMEOUT_MS = 1500;

function parseEnvFile(fileContent) {
  return fileContent
    .split(/\r?\n/)
    .reduce((values, rawLine) => {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) {
        return values;
      }

      const separatorIndex = line.indexOf('=');
      if (separatorIndex === -1) {
        return values;
      }

      const key = line.slice(0, separatorIndex).trim();
      let value = line.slice(separatorIndex + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      values[key] = value;
      return values;
    }, {});
}

function loadEnv() {
  const fileValues = fs.existsSync(ENV_PATH)
    ? parseEnvFile(fs.readFileSync(ENV_PATH, 'utf8'))
    : {};

  return {
    ...fileValues,
    ...process.env,
  };
}

function parseServiceTarget(env, key, label, fallbackPort) {
  const value = env[key];
  if (!value) {
    return {
      issue: `\`${key}\` is missing from \`.env\`.`,
    };
  }

  try {
    const parsed = new URL(value);
    return {
      label,
      host: parsed.hostname,
      port: Number(parsed.port || fallbackPort),
    };
  } catch {
    return {
      issue: `\`${key}\` must be a valid URL.`,
    };
  }
}

function checkPortReachability(target) {
  return new Promise((resolve) => {
    const socket = net.createConnection({
      host: target.host,
      port: target.port,
    });

    const finish = (issue) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(issue);
    };

    socket.setTimeout(SOCKET_TIMEOUT_MS);
    socket.once('connect', () => finish(null));
    socket.once('timeout', () => {
      finish(
        `${target.label} is not reachable at ${target.host}:${target.port}.`,
      );
    });
    socket.once('error', () => {
      finish(
        `${target.label} is not reachable at ${target.host}:${target.port}.`,
      );
    });
  });
}

async function main() {
  const issues = [];

  if (!fs.existsSync(ENV_PATH)) {
    issues.push(
      '`.env` is missing. Copy `.env.example` to `.env` before local verification.',
    );
  }

  const env = loadEnv();

  if (!env.JWT_ACCESS_SECRET || env.JWT_ACCESS_SECRET.length < 16) {
    issues.push(
      '`JWT_ACCESS_SECRET` must be at least 16 characters for local verification.',
    );
  }

  if (!env.JWT_REFRESH_SECRET || env.JWT_REFRESH_SECRET.length < 16) {
    issues.push(
      '`JWT_REFRESH_SECRET` must be at least 16 characters for local verification.',
    );
  }

  if (env.SEED_DEMO_DATA !== 'true') {
    issues.push(
      '`SEED_DEMO_DATA` must be `true` so the local demo baseline is seeded.',
    );
  }

  const targets = [
    parseServiceTarget(env, 'DATABASE_URL', 'PostgreSQL', 5432),
    parseServiceTarget(env, 'REDIS_URL', 'Redis', 6379),
    parseServiceTarget(env, 'STORAGE_ENDPOINT', 'MinIO', 9000),
  ];

  for (const target of targets) {
    if (target.issue) {
      issues.push(target.issue);
    }
  }

  const reachableTargets = targets.filter((target) => !target.issue);
  const reachabilityIssues = await Promise.all(
    reachableTargets.map((target) => checkPortReachability(target)),
  );

  for (const issue of reachabilityIssues) {
    if (issue) {
      issues.push(issue);
    }
  }

  if (issues.length > 0) {
    console.error('Local verification preflight failed:');
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    console.error(
      'Action: fix the items above, run `npm run infra:up`, and retry the verification command.',
    );
    process.exit(1);
  }

  console.log(
    'Local verification preflight OK: .env is ready and PostgreSQL, Redis, and MinIO are reachable.',
  );
}

main().catch((error) => {
  console.error(
    `Local verification preflight failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
