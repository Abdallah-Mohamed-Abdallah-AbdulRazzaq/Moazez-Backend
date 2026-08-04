#!/usr/bin/env bash

set -euo pipefail

readonly SCENARIO="${1:-}"

if [[ "$#" -ne 1 ]]; then
  printf 'health-runtime: exactly one scenario is required\n' >&2
  exit 64
fi

case "$SCENARIO" in
  startup | redis-recovery | storage-recovery | realtime-reconciliation | graceful-shutdown | forced-timeout | database-recovery) ;;
  *)
    printf 'health-runtime: unsupported scenario\n' >&2
    exit 64
    ;;
esac

if [[ "$SCENARIO" == 'database-recovery' ]]; then
  require_b2_value() {
    local name="$1"
    if [[ -z "${!name:-}" ]]; then
      printf 'health-runtime: required B2 field is absent\n' >&2
      return 64
    fi
  }

  require_b2_bounded_integer() {
    local name="$1"
    local minimum="$2"
    local maximum="$3"
    local value="${!name:-}"
    if [[ ! "$value" =~ ^[1-9][0-9]*$ ]] ||
      (( value < minimum || value > maximum )); then
      printf 'health-runtime: bounded B2 integer is invalid\n' >&2
      return 64
    fi
  }

  validate_b2_compiled_database_policy() {
    node - \
      "$B2_DATABASE_RUNTIME_ROLE" \
      "$B2_DATABASE_CONNECTION_LIMIT" \
      "$B2_DATABASE_POOL_TIMEOUT_SECONDS" \
      "$B2_DATABASE_CONNECT_TIMEOUT_SECONDS" <<'NODE'
const path = require('node:path');

try {
  const role = process.argv[2];
  const requested = {
    connectionLimit: Number(process.argv[3]),
    poolTimeoutSeconds: Number(process.argv[4]),
    connectTimeoutSeconds: Number(process.argv[5]),
  };
  const policy = require(
    path.resolve(
      process.cwd(),
      'dist/infrastructure/database/database-runtime.policy.js',
    ),
  );
  const defaults = policy.resolveDatabaseRuntimeSettings(role);
  const validated = policy.resolveDatabaseRuntimeSettings(role, requested);
  for (const field of [
    'connectionLimit',
    'poolTimeoutSeconds',
    'connectTimeoutSeconds',
  ]) {
    if (validated[field] !== defaults[field]) {
      throw new Error('mismatch');
    }
  }
} catch {
  process.stderr.write('B2 compiled database policy validation failed\n');
  process.exitCode = 1;
}
NODE
  }

  b2_container_for_role() {
    case "$1" in
      api) printf '%s' "${B2_API_CONTAINER_NAME:-}" ;;
      core-worker) printf '%s' "${B2_CORE_WORKER_CONTAINER_NAME:-}" ;;
      media-worker) printf '%s' "${B2_MEDIA_WORKER_CONTAINER_NAME:-}" ;;
      *) return 64 ;;
    esac
  }

  b2_launch_runtime() {
    local role="${B2_ROLE:-}"
    local container
    local command=()

    container="$(b2_container_for_role "$role")"
    require_b2_value B2_RUNTIME_IMAGE_ID
    require_b2_value B2_NETWORK_NAME
    require_b2_value B2_GATE_LABEL
    require_b2_value B2_RUN_LABEL
    require_b2_value B2_DATABASE_RUNTIME_ROLE
    require_b2_value B2_DATABASE_CONNECTION_LIMIT
    require_b2_value B2_DATABASE_POOL_TIMEOUT_SECONDS
    require_b2_value B2_DATABASE_CONNECT_TIMEOUT_SECONDS
    require_b2_value DATABASE_URL
    require_b2_value REDIS_URL
    require_b2_value STORAGE_ENDPOINT
    require_b2_value STORAGE_ACCESS_KEY
    require_b2_value STORAGE_SECRET_KEY
    require_b2_value STORAGE_BUCKET
    require_b2_value STORAGE_PUBLIC_BUCKET
    require_b2_value JWT_ACCESS_SECRET
    require_b2_value JWT_REFRESH_SECRET
    require_b2_value SETTINGS_SECRET_ENCRYPTION_KEY
    if [[ -z "$container" ]]; then
      printf 'health-runtime: B2 runtime container is invalid\n' >&2
      return 64
    fi
    if [[ "$B2_DATABASE_RUNTIME_ROLE" != "$role" ]]; then
      printf 'health-runtime: B2 database runtime role is mismatched\n' >&2
      return 64
    fi
    require_b2_bounded_integer B2_DATABASE_CONNECTION_LIMIT 1 64
    require_b2_bounded_integer B2_DATABASE_POOL_TIMEOUT_SECONDS 1 120
    require_b2_bounded_integer B2_DATABASE_CONNECT_TIMEOUT_SECONDS 1 120
    validate_b2_compiled_database_policy

    case "$role" in
      api) ;;
      core-worker)
        command=(node dist/core-worker)
        ;;
      media-worker)
        command=(node dist/media-worker)
        ;;
      *)
        printf 'health-runtime: B2 runtime role is invalid\n' >&2
        return 64
        ;;
    esac

    local args=(
      run --detach --pull=never --restart=no
      --name "$container"
      --network "$B2_NETWORK_NAME"
      --label "com.moazez.evidence.gate=$B2_GATE_LABEL"
      --label "com.moazez.evidence.run=$B2_RUN_LABEL"
      --tmpfs /tmp:rw,noexec,nosuid,size=67108864
      --env NODE_ENV=test
      --env APP_PORT=3000
      --env APP_PROBE_PORT=9090
      --env APP_URL=http://127.0.0.1:3000
      --env DATABASE_URL
      --env "DATABASE_RUNTIME_ROLE=$B2_DATABASE_RUNTIME_ROLE"
      --env "DATABASE_CONNECTION_LIMIT=$B2_DATABASE_CONNECTION_LIMIT"
      --env "DATABASE_POOL_TIMEOUT_SECONDS=$B2_DATABASE_POOL_TIMEOUT_SECONDS"
      --env "DATABASE_CONNECT_TIMEOUT_SECONDS=$B2_DATABASE_CONNECT_TIMEOUT_SECONDS"
      --env REDIS_URL
      --env APP_CORS_ORIGINS=https://schools.moazez.invalid
      --env SWAGGER_ENABLED=false
      --env APP_SHUTDOWN_TIMEOUT_MS=15000
      --env JWT_ACCESS_SECRET
      --env JWT_REFRESH_SECRET
      --env JWT_ACCESS_TTL=15m
      --env JWT_REFRESH_TTL=7d
      --env SETTINGS_SECRET_ENCRYPTION_KEY
      --env STORAGE_PROVIDER=minio
      --env STORAGE_ENDPOINT
      --env STORAGE_ACCESS_KEY
      --env STORAGE_SECRET_KEY
      --env STORAGE_BUCKET
      --env STORAGE_PUBLIC_BUCKET
      --env STORAGE_CORS_ORIGINS=http://127.0.0.1:3001
      --env FCM_ENABLED=false
      --env FCM_DRY_RUN=true
      --env LOG_LEVEL=info
    )
    if [[ "$role" == 'api' ]]; then
      args+=(--env MEDIA_RUNTIME_ENFORCE_IN_TEST=true)
    fi
    args+=("$B2_RUNTIME_IMAGE_ID")
    args+=("${command[@]}")

    docker "${args[@]}" >/dev/null
    printf '{"launched":true,"role":"%s"}\n' "$role"
  }

  b2_observe_probe() {
    local role="${B2_ROLE:-}"
    local kind="${B2_PROBE_KIND:-}"
    local container

    container="$(b2_container_for_role "$role")"
    case "$kind" in
      startup | liveness | readiness | public-health) ;;
      *)
        printf 'health-runtime: B2 probe kind is invalid\n' >&2
        return 64
        ;;
    esac

    docker exec --interactive "$container" node - "$role" "$kind" <<'NODE'
void (async () => {
  const role = process.argv[2];
  const kind = process.argv[3];
  const isPublic = kind === 'public-health';
  const url = isPublic
    ? 'http://127.0.0.1:3000/api/v1/health'
    : `http://127.0.0.1:9090/internal/probes/${role}/${kind}`;
  const started = process.hrtime.bigint();
  const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error('probe_response_is_not_json');
  }
  process.stdout.write(JSON.stringify({
    role,
    kind,
    statusCode: response.status,
    contentType: response.headers.get('content-type'),
    cacheControl: response.headers.get('cache-control'),
    body,
    elapsedMs: Math.round(Number(process.hrtime.bigint() - started) / 1e6)
  }));
})().catch(() => {
  process.stderr.write('health-runtime: B2 probe observation failed\n');
  process.exitCode = 1;
});
NODE
  }

  b2_readiness_burst() {
    local role="${B2_ROLE:-}"
    local container
    container="$(b2_container_for_role "$role")"
    docker exec --interactive "$container" node - "$role" <<'NODE'
void (async () => {
  const role = process.argv[2];
  const count = 10;
  const url = `http://127.0.0.1:9090/internal/probes/${role}/readiness`;
  const calls = Array.from({ length: count }, async () => {
    const started = process.hrtime.bigint();
    const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error('probe_response_is_not_json');
    }
    return {
      statusCode: response.status,
      body,
      elapsedMs: Math.round(Number(process.hrtime.bigint() - started) / 1e6)
    };
  });
  process.stdout.write(JSON.stringify({ role, kind: 'readiness', results: await Promise.all(calls) }));
})().catch(() => {
  process.stderr.write('health-runtime: B2 readiness burst failed\n');
  process.exitCode = 1;
});
NODE
  }

  b2_provision_storage() {
    require_b2_value B2_API_CONTAINER_NAME
    docker exec --interactive "$B2_API_CONTAINER_NAME" node - <<'NODE'
const { Client } = require('minio');
void (async () => {
  const endpoint = new URL(process.env.STORAGE_ENDPOINT);
  const client = new Client({
    endPoint: endpoint.hostname,
    port: Number(endpoint.port || 80),
    useSSL: endpoint.protocol === 'https:',
    accessKey: process.env.STORAGE_ACCESS_KEY,
    secretKey: process.env.STORAGE_SECRET_KEY
  });
  for (const bucket of [process.env.STORAGE_BUCKET, process.env.STORAGE_PUBLIC_BUCKET]) {
    if (!(await client.bucketExists(bucket))) await client.makeBucket(bucket);
  }
  process.stdout.write('{"storageProvisioned":true}');
})().catch(() => {
  process.stderr.write('health-runtime: B2 storage provisioning failed\n');
  process.exitCode = 1;
});
NODE
  }

  case "${B2_ACTION:-}" in
    launch-runtime) b2_launch_runtime ;;
    observe-probe) b2_observe_probe ;;
    readiness-burst) b2_readiness_burst ;;
    provision-storage) b2_provision_storage ;;
    *)
      printf 'health-runtime: unsupported B2 action\n' >&2
      exit 64
      ;;
  esac
  exit "$?"
fi

sanitize_resource_component() {
  printf '%s' "$1" |
    tr '[:upper:]' '[:lower:]' |
    sed -E 's/[^a-z0-9_.-]+/-/g; s/^-+//; s/-+$//'
}

readonly RUN_COMPONENT="$(sanitize_resource_component "${GITHUB_RUN_ID:-local}")"
readonly ATTEMPT_COMPONENT="$(sanitize_resource_component "${GITHUB_RUN_ATTEMPT:-1}")"
readonly RESOURCE_PREFIX="moazez-health-$(sanitize_resource_component "$SCENARIO")-${RUN_COMPONENT}-${ATTEMPT_COMPONENT}-$$"
readonly APP_CONTAINER="${RESOURCE_PREFIX}-app"
readonly CORE_WORKER_CONTAINER="${RESOURCE_PREFIX}-core-worker"
readonly MEDIA_WORKER_CONTAINER="${RESOURCE_PREFIX}-media-worker"
readonly REDIS_CONTAINER="${RESOURCE_PREFIX}-redis"
readonly PROBE_NETWORK="${RESOURCE_PREFIX}-net"
readonly MINIO_CONTAINER="${HEALTH_MINIO_CONTAINER:-moazez-learning-media-minio}"
readonly RUNTIME_IMAGE="${HEALTH_RUNTIME_IMAGE:-moazez-learning-media:${GITHUB_SHA:-local}}"
readonly PUBLIC_CONTAINER_PORT="${APP_PORT:-3000}"
readonly MANAGEMENT_CONTAINER_PORT="${APP_PROBE_PORT:-9090}"
readonly ARTIFACT_ROOT="${GITHUB_WORKSPACE:-$PWD}/artifacts/health-probes"
readonly ARTIFACT_DIR="${ARTIFACT_ROOT}/${SCENARIO}"
readonly TEMP_ROOT="${RUNNER_TEMP:-/tmp}/${RESOURCE_PREFIX}"
readonly SCENARIO_STARTED_AT="$(date -u +'%Y-%m-%dT%H:%M:%S.%3NZ')"

EXPECTED_TRANSITION='not-set'
PUBLIC_BASE_URL=''
OBSERVED_STATUS='not-observed'
OBSERVED_BODY='{}'
MINIO_PAUSED_BY_SCENARIO='false'

rm -rf -- "$ARTIFACT_DIR"
mkdir -p "$ARTIFACT_DIR" "$TEMP_ROOT"
printf 'scenario=%s\nstart=%s\n' "$SCENARIO" "$SCENARIO_STARTED_AT" \
  >"$ARTIFACT_DIR/scenario.txt"
: >"$ARTIFACT_DIR/transitions.log"

safe_output() {
  node -e '
    const fs = require("node:fs");
    const sensitiveNames = [
      "STORAGE_ACCESS_KEY",
      "STORAGE_SECRET_KEY",
      "JWT_ACCESS_SECRET",
      "JWT_REFRESH_SECRET",
      "SETTINGS_SECRET_ENCRYPTION_KEY",
      "DATABASE_URL",
      "REDIS_URL"
    ];
    const values = [...new Set(
      sensitiveNames
        .map((name) => process.env[name])
        .filter((value) => typeof value === "string" && value.length > 0)
    )].sort((left, right) => right.length - left.length);
    let output = fs.readFileSync(0, "utf8");
    for (const value of values) {
      output = output.split(value).join("[REDACTED]");
    }
    process.stdout.write(output);
  ' |
    sed -E \
    -e 's#([A-Za-z][A-Za-z0-9+.-]*://)[^/@[:space:]]+@#\1[REDACTED]@#g' \
    -e 's#((password|secret|token|authorization|access[_-]?key|jwt)[^=:" ]*[=:][[:space:]]*)[^, }"]+#\1[REDACTED]#Ig'
}

fail_scenario() {
  printf 'health-runtime scenario=%s failure=%s\n' "$SCENARIO" "$1" >&2
  return 1
}

safe_container_state() {
  local name="$1"
  if docker inspect "$name" >/dev/null 2>&1; then
    docker inspect --format \
      'name={{.Name}} id={{.Id}} status={{.State.Status}} running={{.State.Running}} paused={{.State.Paused}} health=not-configured startedAt={{.State.StartedAt}} exitCode={{.State.ExitCode}}' \
      "$name"
  fi
}

collect_diagnostics() {
  local scenario_status="$1"
  local ended_at
  ended_at="$(date -u +'%Y-%m-%dT%H:%M:%S.%3NZ')"

  {
    printf 'expected_transition=%s\n' "$EXPECTED_TRANSITION"
    printf 'end=%s\n' "$ended_at"
    printf 'exit_status=%s\n' "$scenario_status"
  } >>"$ARTIFACT_DIR/scenario.txt"

  {
    safe_container_state "$APP_CONTAINER"
    safe_container_state "$CORE_WORKER_CONTAINER"
    safe_container_state "$MEDIA_WORKER_CONTAINER"
    safe_container_state "$REDIS_CONTAINER"
    if [[ "$SCENARIO" == 'storage-recovery' ]]; then
      safe_container_state "$MINIO_CONTAINER"
    fi
  } >"$ARTIFACT_DIR/containers.txt" 2>/dev/null || true

  docker logs --tail 200 "$APP_CONTAINER" 2>&1 |
    safe_output |
    tail --bytes 32768 >"$ARTIFACT_DIR/application.log" || true
  docker logs --tail 200 "$CORE_WORKER_CONTAINER" 2>&1 |
    safe_output |
    tail --bytes 32768 >"$ARTIFACT_DIR/core-worker.log" || true
  docker logs --tail 200 "$MEDIA_WORKER_CONTAINER" 2>&1 |
    safe_output |
    tail --bytes 32768 >"$ARTIFACT_DIR/media-worker.log" || true

  {
    docker logs --tail 120 "$REDIS_CONTAINER" 2>&1 || true
    if [[ "$SCENARIO" == 'storage-recovery' ]]; then
      docker logs --tail 120 "$MINIO_CONTAINER" 2>&1 || true
    fi
  } | safe_output | tail --bytes 32768 \
    >"$ARTIFACT_DIR/dependencies.log" || true

  docker network inspect --format \
    'name={{.Name}} driver={{.Driver}} containers={{len .Containers}}' \
    "$PROBE_NETWORK" >"$ARTIFACT_DIR/network.txt" 2>/dev/null || true
}

cleanup_resources() {
  if [[ "$MINIO_PAUSED_BY_SCENARIO" == 'true' ]]; then
    docker unpause "$MINIO_CONTAINER" >/dev/null 2>&1 || true
    MINIO_PAUSED_BY_SCENARIO='false'
  fi
  docker rm --force \
    "$APP_CONTAINER" "$CORE_WORKER_CONTAINER" "$MEDIA_WORKER_CONTAINER" \
    "$REDIS_CONTAINER" \
    >/dev/null 2>&1 || true
  docker network rm "$PROBE_NETWORK" >/dev/null 2>&1 || true
  rm -rf -- "$TEMP_ROOT" || true
}

finish_scenario() {
  local original_status="$?"
  trap - EXIT INT TERM
  set +e
  collect_diagnostics "$original_status"
  cleanup_resources
  exit "$original_status"
}

trap finish_scenario EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

record_observation() {
  local role="$1"
  local kind="$2"
  local status="$3"
  local body="$4"
  local safe_body
  safe_body="$(printf '%s' "${body:0:1024}" | safe_output)"
  printf 'timestamp=%s role=%s kind=%s status=%s body=%s\n' \
    "$(date -u +'%Y-%m-%dT%H:%M:%S.%3NZ')" \
    "$role" "$kind" "$status" "$safe_body" \
    >>"$ARTIFACT_DIR/transitions.log"
  printf '%s\n' "$status" >"$ARTIFACT_DIR/last-${role}-${kind}-status.txt"
  printf '%s\n' "$safe_body" >"$ARTIFACT_DIR/last-${role}-${kind}-body.json"
}

create_network() {
  docker network create "$PROBE_NETWORK" >/dev/null
}

start_redis() {
  docker run --detach --name "$REDIS_CONTAINER" \
    --network "$PROBE_NETWORK" redis:7-alpine >/dev/null
  wait_for_redis
}

wait_for_redis() {
  local attempt
  for attempt in {1..30}; do
    if docker exec "$REDIS_CONTAINER" redis-cli ping 2>/dev/null |
      grep --quiet '^PONG$'; then
      return 0
    fi
    sleep 1
  done
  fail_scenario 'dependency=redis expected=PONG observed=unavailable'
}

start_runtime() {
  local runtime_database_url
  local runtime_storage_endpoint

  runtime_database_url="${DATABASE_URL/127.0.0.1/host.docker.internal}"
  runtime_storage_endpoint="${STORAGE_ENDPOINT/127.0.0.1/host.docker.internal}"

  docker image inspect "$RUNTIME_IMAGE" >/dev/null
  docker run --detach --name "$APP_CONTAINER" \
    --network "$PROBE_NETWORK" \
    --add-host host.docker.internal:host-gateway \
    --publish "127.0.0.1::${PUBLIC_CONTAINER_PORT}" \
    --env NODE_ENV=test \
    --env MEDIA_RUNTIME_ENFORCE_IN_TEST=true \
    --env APP_PORT="$PUBLIC_CONTAINER_PORT" \
    --env APP_PROBE_PORT="$MANAGEMENT_CONTAINER_PORT" \
    --env APP_URL="${APP_URL:-http://127.0.0.1:${PUBLIC_CONTAINER_PORT}}" \
    --env DATABASE_URL="$runtime_database_url" \
    --env DATABASE_RUNTIME_ROLE=api \
    --env DATABASE_CONNECTION_LIMIT=5 \
    --env DATABASE_POOL_TIMEOUT_SECONDS=5 \
    --env DATABASE_CONNECT_TIMEOUT_SECONDS=5 \
    --env REDIS_URL="redis://${REDIS_CONTAINER}:6379" \
    --env APP_CORS_ORIGINS="${APP_CORS_ORIGINS:-https://schools.moazez.cloud,https://admin.moazez.cloud}" \
    --env SWAGGER_ENABLED=false \
    --env APP_SHUTDOWN_TIMEOUT_MS=15000 \
    --env JWT_ACCESS_SECRET \
    --env JWT_REFRESH_SECRET \
    --env JWT_ACCESS_TTL \
    --env JWT_REFRESH_TTL \
    --env SETTINGS_SECRET_ENCRYPTION_KEY \
    --env STORAGE_PROVIDER \
    --env STORAGE_ENDPOINT="$runtime_storage_endpoint" \
    --env STORAGE_ACCESS_KEY \
    --env STORAGE_SECRET_KEY \
    --env STORAGE_BUCKET \
    --env STORAGE_PUBLIC_BUCKET \
    --env STORAGE_CORS_ORIGINS \
    --env FCM_ENABLED \
    --env FCM_DRY_RUN \
    --env LOG_LEVEL \
    "$RUNTIME_IMAGE" >/dev/null

  local public_mapping
  public_mapping="$(docker port "$APP_CONTAINER" "${PUBLIC_CONTAINER_PORT}/tcp" | head --lines 1)"
  if [[ -z "$public_mapping" ]]; then
    fail_scenario 'contract=public-port expected=published observed=missing'
    return 1
  fi
  PUBLIC_BASE_URL="http://${public_mapping}"
  wait_for_public_health
}

start_application_context_runtime() {
  local role="$1"
  local container="$2"
  local entrypoint="$3"
  local runtime_database_url
  local runtime_storage_endpoint
  local database_connection_limit
  local database_pool_timeout_seconds

  runtime_database_url="${DATABASE_URL/127.0.0.1/host.docker.internal}"
  runtime_storage_endpoint="${STORAGE_ENDPOINT/127.0.0.1/host.docker.internal}"

  case "$role" in
    core-worker)
      database_connection_limit=6
      database_pool_timeout_seconds=10
      ;;
    media-worker)
      database_connection_limit=3
      database_pool_timeout_seconds=10
      ;;
    *)
      fail_scenario "contract=database-runtime-role observed=unsupported-role"
      return 1
      ;;
  esac

  docker run --detach --name "$container" \
    --network "$PROBE_NETWORK" \
    --add-host host.docker.internal:host-gateway \
    --env NODE_ENV=test \
    --env APP_PROBE_PORT="$MANAGEMENT_CONTAINER_PORT" \
    --env APP_SHUTDOWN_TIMEOUT_MS=15000 \
    --env APP_URL="${APP_URL:-http://127.0.0.1:${PUBLIC_CONTAINER_PORT}}" \
    --env DATABASE_URL="$runtime_database_url" \
    --env DATABASE_RUNTIME_ROLE="$role" \
    --env DATABASE_CONNECTION_LIMIT="$database_connection_limit" \
    --env DATABASE_POOL_TIMEOUT_SECONDS="$database_pool_timeout_seconds" \
    --env DATABASE_CONNECT_TIMEOUT_SECONDS=5 \
    --env REDIS_URL="redis://${REDIS_CONTAINER}:6379" \
    --env SETTINGS_SECRET_ENCRYPTION_KEY \
    --env STORAGE_PROVIDER \
    --env STORAGE_ENDPOINT="$runtime_storage_endpoint" \
    --env STORAGE_ACCESS_KEY \
    --env STORAGE_SECRET_KEY \
    --env STORAGE_BUCKET \
    --env STORAGE_PUBLIC_BUCKET \
    --env FCM_ENABLED \
    --env FCM_DRY_RUN \
    --env LOG_LEVEL \
    "$RUNTIME_IMAGE" node "$entrypoint" >/dev/null

  wait_for_probe_status "$role" startup 200 30 1
}

wait_for_public_health() {
  local attempt
  for attempt in {1..30}; do
    if curl --fail --silent --connect-timeout 1 --max-time 2 \
      "$PUBLIC_BASE_URL/api/v1/health" >/dev/null; then
      return 0
    fi
    if ! docker inspect --format '{{.State.Running}}' "$APP_CONTAINER" \
      2>/dev/null | grep --quiet '^true$'; then
      fail_scenario 'contract=startup expected=running observed=container-exited'
      return 1
    fi
    sleep 1
  done
  fail_scenario 'contract=public-health expected=available observed=timeout'
}

start_common_runtime() {
  create_network
  start_redis
  start_runtime
  start_application_context_runtime \
    core-worker "$CORE_WORKER_CONTAINER" dist/core-worker
  start_application_context_runtime \
    media-worker "$MEDIA_WORKER_CONTAINER" dist/media-worker
}

assert_container_environment_value() {
  local container="$1"
  local field="$2"
  local expected="$3"

  if ! docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' \
    "$container" | grep --fixed-strings --line-regexp --quiet \
    -- "${field}=${expected}"; then
    fail_scenario "contract=runtime-environment runtime=${container} field=${field} observed=unexpected"
    return 1
  fi
}

assert_container_environment_absent() {
  local container="$1"
  local field="$2"

  if docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' \
    "$container" | grep --extended-regexp --quiet -- "^${field}="; then
    fail_scenario "contract=runtime-environment runtime=${container} field=${field} observed=unexpectedly-present"
    return 1
  fi
}

assert_startup_runtime_environment_contract() {
  assert_container_environment_value "$APP_CONTAINER" NODE_ENV test
  assert_container_environment_value \
    "$APP_CONTAINER" MEDIA_RUNTIME_ENFORCE_IN_TEST true
  assert_container_environment_value \
    "$APP_CONTAINER" DATABASE_RUNTIME_ROLE api
  assert_container_environment_value \
    "$APP_CONTAINER" DATABASE_CONNECTION_LIMIT 5
  assert_container_environment_value \
    "$APP_CONTAINER" DATABASE_POOL_TIMEOUT_SECONDS 5
  assert_container_environment_value \
    "$APP_CONTAINER" DATABASE_CONNECT_TIMEOUT_SECONDS 5

  assert_container_environment_value "$CORE_WORKER_CONTAINER" NODE_ENV test
  assert_container_environment_value \
    "$CORE_WORKER_CONTAINER" DATABASE_RUNTIME_ROLE core-worker
  assert_container_environment_value \
    "$CORE_WORKER_CONTAINER" DATABASE_CONNECTION_LIMIT 6
  assert_container_environment_value \
    "$CORE_WORKER_CONTAINER" DATABASE_POOL_TIMEOUT_SECONDS 10
  assert_container_environment_value \
    "$CORE_WORKER_CONTAINER" DATABASE_CONNECT_TIMEOUT_SECONDS 5
  assert_container_environment_absent \
    "$CORE_WORKER_CONTAINER" MEDIA_RUNTIME_ENFORCE_IN_TEST

  assert_container_environment_value "$MEDIA_WORKER_CONTAINER" NODE_ENV test
  assert_container_environment_value \
    "$MEDIA_WORKER_CONTAINER" DATABASE_RUNTIME_ROLE media-worker
  assert_container_environment_value \
    "$MEDIA_WORKER_CONTAINER" DATABASE_CONNECTION_LIMIT 3
  assert_container_environment_value \
    "$MEDIA_WORKER_CONTAINER" DATABASE_POOL_TIMEOUT_SECONDS 10
  assert_container_environment_value \
    "$MEDIA_WORKER_CONTAINER" DATABASE_CONNECT_TIMEOUT_SECONDS 5
  assert_container_environment_absent \
    "$MEDIA_WORKER_CONTAINER" MEDIA_RUNTIME_ENFORCE_IN_TEST
}

runtime_container_for_role() {
  case "$1" in
    api) printf '%s' "$APP_CONTAINER" ;;
    core-worker) printf '%s' "$CORE_WORKER_CONTAINER" ;;
    media-worker) printf '%s' "$MEDIA_WORKER_CONTAINER" ;;
    *) return 2 ;;
  esac
}

observe_internal_probe() {
  local role="$1"
  local kind="$2"
  local method="${3:-GET}"
  local runtime_container
  local output

  runtime_container="$(runtime_container_for_role "$role")"

  if output="$(
    docker exec --interactive "$runtime_container" \
      node - "$role" "$kind" "$method" <<'NODE'
void (async () => {
  const role = process.argv[2];
  const kind = process.argv[3];
  const method = process.argv[4];
  const response = await fetch(
    `http://127.0.0.1:9090/internal/probes/${role}/${kind}`,
    { method, signal: AbortSignal.timeout(2000) }
  );
  const text = await response.text();
  let body = { status: 'invalid_json' };
  try {
    body = JSON.parse(text);
  } catch {}
  process.stdout.write(`${response.status}\t${JSON.stringify(body)}`);
})().catch(() => process.exit(2));
NODE
  )"; then
    if [[ "$output" == *$'\t'* ]]; then
      OBSERVED_STATUS="${output%%$'\t'*}"
      OBSERVED_BODY="${output#*$'\t'}"
    else
      OBSERVED_STATUS='connection_unavailable'
      OBSERVED_BODY='{}'
    fi
  else
    OBSERVED_STATUS='connection_unavailable'
    OBSERVED_BODY='{}'
  fi
  record_observation "$role" "$kind" "$OBSERVED_STATUS" "$OBSERVED_BODY"
}

assert_internal_probe() {
  local role="$1"
  local kind="$2"
  local expected_code="$3"
  local expected_status="$4"
  local method="${5:-GET}"
  local runtime_container
  local output

  runtime_container="$(runtime_container_for_role "$role")"

  if ! output="$(
    docker exec --interactive "$runtime_container" node - \
      "$role" "$kind" "$expected_code" "$expected_status" "$method" <<'NODE'
void (async () => {
  const role = process.argv[2];
  const kind = process.argv[3];
  const expectedCode = Number(process.argv[4]);
  const expectedStatus = process.argv[5];
  const method = process.argv[6];
  const response = await fetch(
    `http://127.0.0.1:9090/internal/probes/${role}/${kind}`,
    { method, signal: AbortSignal.timeout(2000) }
  );
  const body = await response.json();
  const keys = Object.keys(body).sort();
  const canonicalTimestamp =
    typeof body.timestamp === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(body.timestamp) &&
    new Date(body.timestamp).toISOString() === body.timestamp;
  const serialized = JSON.stringify(body);
  const valid =
    response.status === expectedCode &&
    response.headers.get('content-type') === 'application/json' &&
    response.headers.get('cache-control') === 'no-store' &&
    (expectedCode !== 405 || response.headers.get('allow') === 'GET') &&
    JSON.stringify(keys) === JSON.stringify(['status', 'timestamp', 'version']) &&
    body.status === expectedStatus &&
    body.version === require('./package.json').version &&
    canonicalTimestamp &&
    !/database|redis|storage|queue|email|provider|topology|secret|credential|url|path|object|bucket/i.test(serialized);
  process.stdout.write(`${response.status}\t${serialized}`);
  if (!valid) process.exit(1);
})().catch(() => process.exit(1));
NODE
  )"; then
    observe_internal_probe "$role" "$kind" "$method"
    printf 'health-runtime scenario=%s role=%s kind=%s expected=%s observed=%s\n' \
      "$SCENARIO" "$role" "$kind" "$expected_code" "$OBSERVED_STATUS" >&2
    return 1
  fi

  if [[ "$output" != *$'\t'* ]]; then
    observe_internal_probe "$role" "$kind" "$method"
    printf 'health-runtime scenario=%s role=%s kind=%s expected=%s observed=%s\n' \
      "$SCENARIO" "$role" "$kind" "$expected_code" "$OBSERVED_STATUS" >&2
    return 1
  fi

  OBSERVED_STATUS="${output%%$'\t'*}"
  OBSERVED_BODY="${output#*$'\t'}"
  record_observation "$role" "$kind" "$OBSERVED_STATUS" "$OBSERVED_BODY"
}

assert_special_internal_probe() {
  local path="$1"
  local label="$2"
  local expected_code="$3"
  local expected_status="$4"
  local method="${5:-GET}"
  local output
  local contract_valid
  local observed_code
  local observed_body
  local observed_headers

  if ! output="$(
    MSYS_NO_PATHCONV=1 docker exec --interactive "$APP_CONTAINER" node - \
      "$path" "$expected_code" "$expected_status" "$method" <<'NODE'
void (async () => {
  const path = process.argv[2];
  const expectedCode = Number(process.argv[3]);
  const expectedStatus = process.argv[4];
  const method = process.argv[5];
  let response;
  try {
    response = await fetch(`http://127.0.0.1:9090${path}`, {
      method,
      signal: AbortSignal.timeout(2000)
    });
  } catch {
    process.stderr.write(
      `special-probe-fetch-failed path=${String(path).slice(0, 80)} method=${String(method).slice(0, 12)}\n`
    );
    process.exit(1);
  }
  let body;
  try {
    body = await response.json();
  } catch {
    process.stderr.write(`special-probe-json-failed status=${response.status}\n`);
    process.exit(1);
  }
  const keys = Object.keys(body).sort();
  const canonicalTimestamp =
    typeof body.timestamp === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(body.timestamp) &&
    new Date(body.timestamp).toISOString() === body.timestamp;
  const serialized = JSON.stringify(body);
  const valid =
    response.status === expectedCode &&
    response.headers.get('content-type') === 'application/json' &&
    response.headers.get('cache-control') === 'no-store' &&
    (expectedCode !== 405 || response.headers.get('allow') === 'GET') &&
    JSON.stringify(keys) === JSON.stringify(['status', 'timestamp', 'version']) &&
    body.status === expectedStatus &&
    body.version === require('./package.json').version &&
    canonicalTimestamp &&
    !/database|redis|storage|queue|email|provider|topology|secret|credential|url|path|object|bucket/i.test(serialized);
  process.stdout.write([
    valid ? 'valid' : 'invalid',
    response.status,
    serialized,
    JSON.stringify({
      contentType: response.headers.get('content-type'),
      cacheControl: response.headers.get('cache-control'),
      allow: response.headers.get('allow')
    })
  ].join('\t'));
})().catch(() => {
  process.stderr.write('special-probe-observation-failed\n');
  process.exit(1);
});
NODE
  )"; then
    fail_scenario "contract=${label} expected=${expected_code} observed=mismatch"
    return 1
  fi

  IFS=$'\t' read -r contract_valid observed_code observed_body observed_headers \
    <<<"$output"
  if [[ -z "$contract_valid" || -z "$observed_code" || -z "$observed_body" ]]; then
    fail_scenario "contract=${label} expected=${expected_code} observed=no-response"
    return 1
  fi

  OBSERVED_STATUS="$observed_code"
  OBSERVED_BODY="$observed_body"
  record_observation "$label" 'contract' "$OBSERVED_STATUS" "$OBSERVED_BODY"
  printf '%s\n' "$observed_headers" | safe_output \
    >"$ARTIFACT_DIR/${label}-headers.json"

  if [[ "$contract_valid" != 'valid' ]]; then
    fail_scenario "contract=${label} expected=${expected_code} observed=${OBSERVED_STATUS}"
    return 1
  fi
}

wait_for_probe_status() {
  local role="$1"
  local kind="$2"
  local expected_code="$3"
  local attempts="$4"
  local delay_seconds="$5"
  local expected_status
  local attempt

  case "$expected_code" in
    200) expected_status='ok' ;;
    503) expected_status='unavailable' ;;
    *) return 2 ;;
  esac

  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    observe_internal_probe "$role" "$kind"
    if [[ "$OBSERVED_STATUS" == "$expected_code" ]]; then
      assert_internal_probe "$role" "$kind" "$expected_code" "$expected_status"
      return "$?"
    fi
    sleep "$delay_seconds"
  done

  printf 'health-runtime scenario=%s role=%s kind=%s expected=%s observed=%s\n' \
    "$SCENARIO" "$role" "$kind" "$expected_code" "$OBSERVED_STATUS" >&2
  return 1
}

assert_all_roles() {
  local kind="$1"
  local expected_code="$2"
  local expected_status="$3"
  local role
  for role in api core-worker media-worker; do
    assert_internal_probe "$role" "$kind" "$expected_code" "$expected_status"
  done
}

poll_roles_independently() {
  local expected_code="$1"
  local attempts="$2"
  local delay_seconds="$3"
  shift 3
  local failed_roles=()
  local role

  for role in "$@"; do
    if wait_for_probe_status "$role" readiness "$expected_code" \
      "$attempts" "$delay_seconds"; then
      :
    else
      failed_roles+=("$role")
    fi
  done

  for role in api core-worker media-worker; do
    observe_internal_probe "$role" readiness
  done

  if [[ "${#failed_roles[@]}" -ne 0 ]]; then
    fail_scenario "contract=readiness-transition expected=${expected_code} failed_roles=$(IFS=,; printf '%s' "${failed_roles[*]}")"
    return 1
  fi
}

assert_public_health_contract() {
  local public_health
  local expected_version

  public_health="$(
    curl --fail --silent --connect-timeout 1 --max-time 2 \
      "$PUBLIC_BASE_URL/api/v1/health"
  )"
  expected_version="$(
    docker exec "$APP_CONTAINER" node -p 'require("./package.json").version'
  )"

  if ! node - "$public_health" "$expected_version" <<'NODE'
const report = JSON.parse(process.argv[2]);
const expectedVersion = process.argv[3];
const keys = Object.keys(report).sort();
const canonicalTimestamp =
  typeof report.timestamp === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(report.timestamp) &&
  new Date(report.timestamp).toISOString() === report.timestamp;
if (
  JSON.stringify(keys) !== JSON.stringify(['status', 'timestamp', 'version']) ||
  report.status !== 'ok' ||
  report.version !== expectedVersion ||
  !canonicalTimestamp
) {
  process.exit(1);
}
NODE
  then
    fail_scenario 'contract=public-health expected=bounded-schema observed=mismatch'
    return 1
  fi
  record_observation 'public' 'health' '200' "$public_health"
}

assert_container_identity() {
  local name="$1"
  local expected_id="$2"
  local expected_started_at="$3"
  local actual_id
  local actual_started_at

  actual_id="$(docker inspect --format '{{.Id}}' "$name")"
  actual_started_at="$(docker inspect --format '{{.State.StartedAt}}' "$name")"
  if [[ "$actual_id" != "$expected_id" || "$actual_started_at" != "$expected_started_at" ]]; then
    fail_scenario "contract=container-identity resource=${name} observed=changed"
    return 1
  fi
}

wait_for_minio() {
  local attempt
  local ready_url="${HEALTH_MINIO_READY_URL:-http://127.0.0.1:9000/minio/health/ready}"
  for attempt in {1..40}; do
    if curl --fail --silent --connect-timeout 1 --max-time 2 \
      "$ready_url" >/dev/null; then
      return 0
    fi
    sleep 0.25
  done
  fail_scenario 'dependency=minio expected=ready observed=unavailable'
}

scenario_startup() {
  EXPECTED_TRANSITION='canonical image -> public health -> isolated internal probes healthy'
  start_common_runtime
  assert_startup_runtime_environment_contract
  printf 'api_media_runtime_verification=enforced-in-test\n' \
    >>"$ARTIFACT_DIR/scenario.txt"
  assert_public_health_contract

  if [[ -z "$(docker port "$APP_CONTAINER" "${PUBLIC_CONTAINER_PORT}/tcp")" ]]; then
    fail_scenario 'contract=public-port expected=published observed=missing'
    return 1
  fi
  local runtime_container
  for runtime_container in \
    "$APP_CONTAINER" "$CORE_WORKER_CONTAINER" "$MEDIA_WORKER_CONTAINER"; do
    if docker port "$runtime_container" "${MANAGEMENT_CONTAINER_PORT}/tcp" \
      >/dev/null 2>&1; then
      fail_scenario "contract=management-port runtime=${runtime_container} expected=not-published observed=published"
      return 1
    fi
  done
  for runtime_container in "$CORE_WORKER_CONTAINER" "$MEDIA_WORKER_CONTAINER"; do
    if docker port "$runtime_container" "${PUBLIC_CONTAINER_PORT}/tcp" \
      >/dev/null 2>&1; then
      fail_scenario "contract=public-port runtime=${runtime_container} expected=not-published observed=published"
      return 1
    fi
  done

  local role
  local kind
  local public_path
  local public_code
  local failed_probes=()
  for role in api core-worker media-worker; do
    for kind in startup liveness readiness; do
      for public_path in \
        "/internal/probes/${role}/${kind}" \
        "/api/v1/internal/probes/${role}/${kind}"; do
        public_code="$(
          curl --silent --output /dev/null --write-out '%{http_code}' \
            --connect-timeout 1 --max-time 2 \
            "${PUBLIC_BASE_URL}${public_path}"
        )"
        if [[ "$public_code" != '404' ]]; then
          fail_scenario "contract=public-probe-isolation path=${public_path} expected=404 observed=${public_code}"
          return 1
        fi
      done
      if assert_internal_probe "$role" "$kind" 200 ok; then
        :
      else
        failed_probes+=("${role}-${kind}")
      fi
    done
  done

  if ! assert_special_internal_probe \
    '/internal/probes/unknown' unknown 404 not_found; then
    failed_probes+=('unknown-path')
  fi
  if ! assert_special_internal_probe \
    '/internal/probes/api/readiness' api-readiness-post \
    405 method_not_allowed POST; then
    failed_probes+=('api-readiness-post')
  fi

  if [[ "${#failed_probes[@]}" -ne 0 ]]; then
    fail_scenario "contract=startup-probes failed=$(IFS=,; printf '%s' "${failed_probes[*]}")"
    return 1
  fi
}

scenario_redis_recovery() {
  EXPECTED_TRANSITION='readiness 200 -> Redis pause -> readiness 503 -> same Redis resume -> readiness 200'
  start_common_runtime
  poll_roles_independently 200 1 0 api core-worker media-worker
  assert_all_roles liveness 200 ok

  local app_id
  local app_started_at
  local core_worker_id
  local core_worker_started_at
  local media_worker_id
  local media_worker_started_at
  local redis_id
  local redis_started_at
  app_id="$(docker inspect --format '{{.Id}}' "$APP_CONTAINER")"
  app_started_at="$(docker inspect --format '{{.State.StartedAt}}' "$APP_CONTAINER")"
  core_worker_id="$(docker inspect --format '{{.Id}}' "$CORE_WORKER_CONTAINER")"
  core_worker_started_at="$(docker inspect --format '{{.State.StartedAt}}' "$CORE_WORKER_CONTAINER")"
  media_worker_id="$(docker inspect --format '{{.Id}}' "$MEDIA_WORKER_CONTAINER")"
  media_worker_started_at="$(docker inspect --format '{{.State.StartedAt}}' "$MEDIA_WORKER_CONTAINER")"
  redis_id="$(docker inspect --format '{{.Id}}' "$REDIS_CONTAINER")"
  redis_started_at="$(docker inspect --format '{{.State.StartedAt}}' "$REDIS_CONTAINER")"

  docker pause "$REDIS_CONTAINER" >/dev/null
  if [[ "$(docker inspect --format '{{.State.Paused}}' "$REDIS_CONTAINER")" != 'true' ]]; then
    fail_scenario 'dependency=redis expected=paused observed=not-paused'
    return 1
  fi
  poll_roles_independently 503 30 0.25 api core-worker media-worker
  assert_all_roles liveness 200 ok

  docker unpause "$REDIS_CONTAINER" >/dev/null
  wait_for_redis
  assert_container_identity "$APP_CONTAINER" "$app_id" "$app_started_at"
  assert_container_identity \
    "$CORE_WORKER_CONTAINER" "$core_worker_id" "$core_worker_started_at"
  assert_container_identity \
    "$MEDIA_WORKER_CONTAINER" "$media_worker_id" "$media_worker_started_at"
  assert_container_identity "$REDIS_CONTAINER" "$redis_id" "$redis_started_at"
  if [[ "$(docker inspect --format '{{.State.Paused}}' "$REDIS_CONTAINER")" != 'false' ]]; then
    fail_scenario 'dependency=redis expected=unpaused observed=paused'
    return 1
  fi
  poll_roles_independently 200 60 0.5 api core-worker media-worker
}

scenario_storage_recovery() {
  EXPECTED_TRANSITION='readiness 200 -> MinIO pause -> all storage-owning runtimes 503 -> same MinIO resume -> recovery'
  docker inspect "$MINIO_CONTAINER" >/dev/null
  wait_for_minio

  local minio_id
  local minio_started_at
  minio_id="$(docker inspect --format '{{.Id}}' "$MINIO_CONTAINER")"
  minio_started_at="$(docker inspect --format '{{.State.StartedAt}}' "$MINIO_CONTAINER")"

  start_common_runtime
  poll_roles_independently 200 1 0 api core-worker media-worker
  assert_all_roles liveness 200 ok

  docker pause "$MINIO_CONTAINER" >/dev/null
  MINIO_PAUSED_BY_SCENARIO='true'
  if [[ "$(docker inspect --format '{{.State.Paused}}' "$MINIO_CONTAINER")" != 'true' ]]; then
    fail_scenario 'dependency=minio expected=paused observed=not-paused'
    return 1
  fi

  poll_roles_independently 503 30 0.25 api core-worker media-worker
  assert_all_roles liveness 200 ok

  docker unpause "$MINIO_CONTAINER" >/dev/null
  MINIO_PAUSED_BY_SCENARIO='false'
  wait_for_minio
  assert_container_identity "$MINIO_CONTAINER" "$minio_id" "$minio_started_at"
  if [[ "$(docker inspect --format '{{.State.Paused}}' "$MINIO_CONTAINER")" != 'false' ]]; then
    fail_scenario 'dependency=minio expected=unpaused observed=paused'
    return 1
  fi

  poll_roles_independently 200 60 0.5 api core-worker media-worker
  for role in api core-worker media-worker; do
    observe_internal_probe "$role" readiness
  done
}

scenario_realtime_reconciliation() {
  EXPECTED_TRANSITION='stable Redis proxy outage -> local fallback ownership -> exact Redis reconciliation'
  create_network
  start_redis

  timeout 45s docker run --name "$APP_CONTAINER" --interactive \
    --network "$PROBE_NETWORK" \
    --env "TARGET_REDIS_URL=redis://${REDIS_CONTAINER}:6379" \
    --entrypoint node "$RUNTIME_IMAGE" - <<'NODE'
const { randomUUID } = require('node:crypto');
const { createConnection, createServer } = require('node:net');
const { ConfigService } = require('@nestjs/config');
const RedisModule = require('ioredis');
const IORedis = RedisModule.default ?? RedisModule;
const {
  RealtimeStateStoreService
} = require(
  './dist/infrastructure/realtime/realtime-state-store.service'
);

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
const suffix = randomUUID();
const schoolId = `school-${suffix}`;
const userId = `user-${suffix}`;
const conversationId = `conversation-${suffix}`;
const expiredConversationId = `expired-${suffix}`;
const targetUrl = process.env.TARGET_REDIS_URL;
const proxyPort = 16379;
const sockets = new Set();
let proxy;

async function startProxy() {
  proxy = createServer((downstream) => {
    const target = new URL(targetUrl);
    const upstream = createConnection({
      host: target.hostname,
      port: Number(target.port)
    });
    sockets.add(downstream);
    sockets.add(upstream);
    const cleanup = () => {
      sockets.delete(downstream);
      sockets.delete(upstream);
      downstream.destroy();
      upstream.destroy();
    };
    downstream.on('error', cleanup);
    upstream.on('error', cleanup);
    downstream.on('close', cleanup);
    upstream.on('close', cleanup);
    downstream.pipe(upstream);
    upstream.pipe(downstream);
  });
  await new Promise((resolve, reject) => {
    proxy.once('error', reject);
    proxy.listen(proxyPort, '127.0.0.1', resolve);
  });
}

async function stopProxy() {
  for (const socket of sockets) socket.destroy();
  sockets.clear();
  if (!proxy) return;
  const closing = proxy;
  proxy = undefined;
  await new Promise((resolve) => closing.close(resolve));
}

const presenceUser = `realtime:presence:school:${schoolId}:user:${userId}`;
const presenceSockets = `${presenceUser}:sockets`;
const presenceUsers = `realtime:presence:school:${schoolId}:users`;
const typingUser =
  `realtime:typing:school:${schoolId}:conversation:${conversationId}:user:${userId}`;
const typingUsers =
  `realtime:typing:school:${schoolId}:conversation:${conversationId}:users`;
const expiredTypingUser =
  `realtime:typing:school:${schoolId}:conversation:${expiredConversationId}:user:${userId}`;
const expiredTypingUsers =
  `realtime:typing:school:${schoolId}:conversation:${expiredConversationId}:users`;

void (async () => {
  const admin = new IORedis(targetUrl, { maxRetriesPerRequest: 1 });
  const stateStore = new RealtimeStateStoreService(
    new ConfigService({ REDIS_URL: `redis://127.0.0.1:${proxyPort}` })
  );
  try {
    await startProxy();
    await stateStore.checkReadiness();
    await stateStore.incrementPresence(
      schoolId,
      userId,
      'socket-before-outage',
      1
    );

    await stopProxy();
    await delay(1100);
    const latestPresence = await stateStore.incrementPresence(
      schoolId,
      userId,
      'socket-during-outage',
      90
    );
    await stateStore.setTyping(schoolId, conversationId, userId, 8);
    await stateStore.setTyping(schoolId, expiredConversationId, userId, 1);
    await delay(1100);
    await stateStore.checkReadiness().then(
      () => {
        throw new Error('Readiness recovered while Redis was isolated');
      },
      () => undefined
    );

    await startProxy();
    await stateStore.checkReadiness();

    const restoredSockets = (await admin.smembers(presenceSockets)).sort();
    const schoolUsers = await admin.smembers(presenceUsers);
    const timestamp = await admin.get(presenceUser);
    const presenceTtl = await admin.ttl(presenceUser);
    const presenceIndexTtl = await admin.ttl(presenceUsers);
    const activeTyping = await admin.get(typingUser);
    const activeTypingUsers = await admin.smembers(typingUsers);
    const activeTypingTtl = await admin.ttl(typingUser);
    const expiredTypingExists = await admin.exists(
      expiredTypingUser,
      expiredTypingUsers
    );

    if (
      JSON.stringify(restoredSockets) !==
        JSON.stringify(['socket-before-outage', 'socket-during-outage']) ||
      !schoolUsers.includes(userId) ||
      timestamp !== latestPresence.updatedAt ||
      presenceTtl <= 0 ||
      presenceTtl > 90 ||
      presenceIndexTtl <= 0 ||
      presenceIndexTtl > 150 ||
      typeof activeTyping !== 'string' ||
      !activeTypingUsers.includes(userId) ||
      activeTypingTtl <= 0 ||
      activeTypingTtl >= 8 ||
      expiredTypingExists !== 0
    ) {
      throw new Error('Realtime fallback reconciliation mismatch');
    }
  } finally {
    await stateStore.onModuleDestroy();
    await stopProxy();
    await admin.del(
      presenceUser,
      presenceSockets,
      presenceUsers,
      typingUser,
      typingUsers,
      expiredTypingUser,
      expiredTypingUsers
    );
    await admin.quit();
  }
})().catch(() => process.exit(1));
NODE
}

scenario_graceful_shutdown() {
  EXPECTED_TRANSITION='fresh started runtime -> SIGTERM -> intake stopped -> bounded clean exit'
  create_network
  start_redis
  start_runtime

  local shutdown_started_ms
  local intake_stopped='false'
  local attempt
  local draining_status
  local post_stop_http_code
  local post_stop_curl_status
  local runtime_status
  local shutdown_elapsed_ms
  local runtime_exit_code
  local shutdown_log="$TEMP_ROOT/runtime-shutdown.log"

  shutdown_started_ms="$(date +%s%3N)"
  docker kill --signal SIGTERM "$APP_CONTAINER" >/dev/null

  for attempt in {1..100}; do
    docker logs --tail 500 "$APP_CONTAINER" >"$shutdown_log" 2>&1
    if grep --quiet 'lifecycle.shutdown.intake_stopped' "$shutdown_log"; then
      intake_stopped='true'
      break
    fi
    sleep 0.1
  done
  if [[ "$intake_stopped" != 'true' ]]; then
    fail_scenario 'contract=graceful-shutdown expected=intake-stopped observed=missing'
    return 1
  fi

  observe_internal_probe api readiness
  draining_status="$OBSERVED_STATUS"
  if [[ "$draining_status" == '200' ]]; then
    fail_scenario 'contract=draining-readiness expected=not-200 observed=200'
    return 1
  fi

  set +e
  post_stop_http_code="$(
    curl --silent --output /dev/null --write-out '%{http_code}' \
      --connect-timeout 1 --max-time 2 "$PUBLIC_BASE_URL/api/v1/health"
  )"
  post_stop_curl_status="$?"
  set -e
  if [[ "$post_stop_curl_status" -eq 0 && "$post_stop_http_code" =~ ^2[0-9][0-9]$ ]]; then
    fail_scenario 'contract=post-intake-http expected=non-2xx observed=2xx'
    return 1
  fi

  for attempt in {1..200}; do
    runtime_status="$(
      docker inspect --format '{{.State.Status}}' "$APP_CONTAINER" 2>/dev/null
    )"
    if [[ "$runtime_status" == 'exited' ]]; then
      break
    fi
    sleep 0.1
  done
  if [[ "$runtime_status" != 'exited' ]]; then
    fail_scenario 'contract=graceful-shutdown expected=bounded-exit observed=running'
    return 1
  fi

  shutdown_elapsed_ms="$(( $(date +%s%3N) - shutdown_started_ms ))"
  runtime_exit_code="$(docker inspect --format '{{.State.ExitCode}}' "$APP_CONTAINER")"
  docker logs --tail 500 "$APP_CONTAINER" >"$shutdown_log" 2>&1

  test "$runtime_exit_code" -eq 0
  test "$shutdown_elapsed_ms" -le 20000
  test "$(grep --count 'lifecycle.shutdown.started' "$shutdown_log")" -eq 1
  test "$(grep --count 'lifecycle.shutdown.intake_stopped' "$shutdown_log")" -eq 1
  test "$(grep --count 'lifecycle.shutdown.completed' "$shutdown_log")" -eq 1

  set +e
  curl --fail --silent --connect-timeout 1 --max-time 2 \
    "$PUBLIC_BASE_URL/api/v1/health" >/dev/null
  local public_listener_status="$?"
  docker exec "$APP_CONTAINER" node -e 'process.exit(0)' >/dev/null 2>&1
  local management_listener_owner_status="$?"
  set -e
  if [[ "$public_listener_status" -eq 0 || "$management_listener_owner_status" -eq 0 ]]; then
    fail_scenario 'contract=listener-shutdown expected=both-unavailable observed=available'
    return 1
  fi
}

scenario_forced_timeout() {
  EXPECTED_TRANSITION='1000ms shutdown deadline -> timed-out event -> exit 1 without completion'
  create_network

  local timeout_log="$TEMP_ROOT/forced-timeout.log"
  local timeout_started_ms
  local timeout_exit_code
  local timeout_wait_status
  local timeout_elapsed_ms
  local timeout_event_elapsed_ms

  timeout_started_ms="$(date +%s%3N)"
  docker run --detach --name "$APP_CONTAINER" \
    --network "$PROBE_NETWORK" \
    --entrypoint node "$RUNTIME_IMAGE" \
    -e '
      const { ApplicationLifecycleState } =
        require("./dist/bootstrap/application-lifecycle.state");
      const { GracefulShutdownCoordinator } =
        require("./dist/bootstrap/graceful-shutdown");
      const lifecycle = new ApplicationLifecycleState();
      const coordinator = new GracefulShutdownCoordinator({
        app: { close: () => new Promise(() => undefined) },
        httpServer: { close: (callback) => callback() },
        managementServer: { close: (callback) => callback() },
        lifecycle,
        queue: { beginWorkerDrain: () => Promise.resolve() },
        realtime: { disconnectSocketsForShutdown: () => Promise.resolve() },
        timeoutMs: 1000,
        logger: {
          log: (event) => console.log(JSON.stringify(event)),
          error: (event) => console.error(JSON.stringify(event))
        }
      });
      coordinator.handleSignal("SIGTERM");
    ' >/dev/null

  set +e
  timeout_exit_code="$(timeout 10s docker wait "$APP_CONTAINER")"
  timeout_wait_status="$?"
  set -e
  timeout_elapsed_ms="$(( $(date +%s%3N) - timeout_started_ms ))"
  docker logs --tail 200 "$APP_CONTAINER" >"$timeout_log" 2>&1

  test "$timeout_wait_status" -eq 0
  test "$timeout_exit_code" -eq 1
  test "$timeout_elapsed_ms" -ge 1000
  test "$timeout_elapsed_ms" -le 10000
  timeout_event_elapsed_ms="$(
    grep 'lifecycle.shutdown.timed_out' "$timeout_log" |
      grep --only-matching '"elapsedMs":[0-9]*' |
      tail --lines 1 |
      cut --delimiter : --fields 2
  )"
  test "$timeout_event_elapsed_ms" -ge 1000
  test "$timeout_event_elapsed_ms" -le 1500
  grep --quiet 'lifecycle.shutdown.timed_out' "$timeout_log"
  if grep --quiet 'lifecycle.shutdown.completed' "$timeout_log"; then
    fail_scenario 'contract=forced-timeout expected=no-completion observed=completed'
    return 1
  fi
}

case "$SCENARIO" in
  startup) scenario_startup ;;
  redis-recovery) scenario_redis_recovery ;;
  storage-recovery) scenario_storage_recovery ;;
  realtime-reconciliation) scenario_realtime_reconciliation ;;
  graceful-shutdown) scenario_graceful_shutdown ;;
  forced-timeout) scenario_forced_timeout ;;
esac
