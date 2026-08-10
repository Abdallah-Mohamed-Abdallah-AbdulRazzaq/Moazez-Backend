import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { load } from 'js-yaml';
import { MediaRuntimeStartupGuard } from '../application/media-runtime-startup.guard';
import { validateEnv } from '../../../../config/env.validation';

describe('learning media upload foundation contract', () => {
  const root = join(__dirname, '../../../../..');

  it('declares the complete Files-owned upload-session schema', () => {
    const schema = readFileSync(join(root, 'prisma/schema.prisma'), 'utf8');

    expect(schema).toContain('enum FileUploadPurpose');
    expect(schema).toContain('enum FileUploadSessionStatus');
    expect(schema).toContain('model FileUploadSession');
    expect(schema).toContain(
      '@@unique([schoolId, createdByUserId, purpose, clientRequestId]',
    );
    expect(schema).toContain('stagingCleanupEligibleAt');
    expect(schema).toContain('finalCleanupEligibleAt');
    expect(schema).toContain('verificationVersion');
    expect(schema).toContain('stagingObjectKey');
    expect(schema).toContain('finalObjectKey');
    expect(schema).toContain('latestUploadUrlExpiresAt');
    expect(schema).toContain('stagingObjectDeletedAt');
    expect(schema).toContain('finalObjectDeletedAt');
    const migration = readFileSync(
      join(
        root,
        'prisma/migrations/20260722160000_learning_media_runtime_upload_foundation/migration.sql',
      ),
      'utf8',
    );
    expect(migration).toContain(
      '("staging_bucket", "staging_object_key") <> ("final_bucket", "final_object_key")',
    );
    expect(migration).toContain(
      'CREATE FUNCTION "normalize_learning_media_original_name"',
    );
    expect(migration).toContain("'finalization_cleanup_pending'");
    expect(migration).toContain('file_upload_sessions_verifying_check');
    const cleanup = readFileSync(
      join(
        root,
        'src/modules/files/uploads/application/learning-media-cleanup.service.ts',
      ),
      'utf8',
    );
    expect(cleanup).toContain('candidate.target');
    expect(cleanup).toContain('expireAbandonedSessions');
    expect(cleanup).toContain('${uploadId}-${target}');
  });

  it('pins the canonical runtime and media verifier contract', () => {
    const dockerfile = readFileSync(join(root, 'Dockerfile'), 'utf8');
    const verifier = readFileSync(
      join(root, 'scripts/verify-media-runtime.cjs'),
      'utf8',
    );
    const runtimeContract = readFileSync(
      join(root, 'scripts/media-runtime-contract.cjs'),
      'utf8',
    );

    expect(dockerfile).toContain(
      'node:22.23.1-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3',
    );
    expect(dockerfile).toContain('FFMPEG_PACKAGE_VERSION=7:5.1.9-0+deb12u1');
    expect(dockerfile).toContain('USER node');
    expect(runtimeContract).toContain('shell: false');
    expect(verifier).toContain('network_protocol_forbidden');

    const uploadsModule = readFileSync(
      join(root, 'src/modules/files/uploads/uploads.module.ts'),
      'utf8',
    );
    const startupGuard = readFileSync(
      join(
        root,
        'src/modules/files/uploads/application/media-runtime-startup.guard.ts',
      ),
      'utf8',
    );
    expect(uploadsModule).toContain('MediaRuntimeStartupGuard');
    expect(startupGuard).toContain('onModuleInit');
    expect(startupGuard).toContain('verifyRuntimeIdentity');
  });

  it('owns a management-only referenced LEGACY verification action', () => {
    const controller = readFileSync(
      join(
        root,
        'src/modules/academics/curriculum/controller/learning-media.controller.ts',
      ),
      'utf8',
    );
    expect(controller).toContain("@Post('legacy/:uploadId/verify')");
    expect(controller).toContain('VerifyLegacyLearningMediaUseCase');
  });

  it('fails application startup before invoking an operator-selected binary', async () => {
    const guard = new MediaRuntimeStartupGuard(
      new ConfigService({
        NODE_ENV: 'test',
        MEDIA_RUNTIME_ENFORCE_IN_TEST: true,
        FFPROBE_PATH: '/usr/bin/ffmpeg',
        MEDIA_VERIFICATION_VERSION: 'ffprobe-5.1.9-debian12-learning-media-v1',
        FFPROBE_TIMEOUT_MS: 15_000,
        FFPROBE_MAX_OUTPUT_BYTES: 1_048_576,
      }),
    );

    await expect(guard.onModuleInit()).rejects.toThrow('version_mismatch');
  });

  it('requires explicit non-wildcard CORS origins outside local/test runtime', () => {
    const base = {
      APP_URL: 'https://api.example.test',
      DATABASE_URL:
        'postgresql://test:test@127.0.0.1:5432/test?sslmode=require',
      QUEUE_REDIS_URL: 'redis://127.0.0.1:6379',
      REALTIME_REDIS_URL: 'redis://127.0.0.1:6380',
      JWT_ACCESS_SECRET: 'access-secret-at-least-sixteen',
      JWT_REFRESH_SECRET: 'refresh-secret-at-least-sixteen',
      JWT_ACCESS_TTL: '15m',
      JWT_REFRESH_TTL: '7d',
      STORAGE_PROVIDER: 'gcs',
      GCP_PROJECT_ID: 'moazez-test-project',
      GCS_SIGNING_SERVICE_ACCOUNT:
        'moazez-gcs-signer@moazez-test-project.iam.gserviceaccount.com',
      STORAGE_BUCKET: 'private',
      STORAGE_PUBLIC_BUCKET: 'public',
    };

    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: 'production',
        APP_CORS_ORIGINS:
          'https://schools.moazez.cloud,https://admin.moazez.cloud',
      }),
    ).toThrow(/STORAGE_CORS_ORIGINS is required/u);
    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: 'staging',
        APP_CORS_ORIGINS:
          'https://staging-schools.moazez.cloud,https://staging-admin.moazez.cloud',
        STORAGE_CORS_ORIGINS: '*',
      }),
    ).toThrow(/Invalid url/u);
    expect(
      validateEnv({
        ...base,
        NODE_ENV: 'production',
        APP_CORS_ORIGINS:
          'https://schools.moazez.cloud,https://admin.moazez.cloud',
        STORAGE_CORS_ORIGINS: 'https://app.example.test',
      }).STORAGE_CORS_ORIGINS,
    ).toEqual(['https://app.example.test']);
  });

  it('runs every affected learning-media and Lesson Content invariant in CI', () => {
    const workflow = readFileSync(
      join(root, '.github/workflows/learning-media-integrity.yml'),
      'utf8',
    );
    const harness = readFileSync(
      join(root, 'scripts/ci/health-probe-runtime.sh'),
      'utf8',
    );
    const parsedWorkflow = load(workflow) as {
      jobs: {
        'learning-media-integrity': {
          env: Record<string, string>;
          steps: Array<{
            id?: string;
            name?: string;
            run?: string;
            uses?: string;
            if?: string;
            'continue-on-error'?: boolean;
          }>;
        };
      };
    };
    const job = parsedWorkflow.jobs['learning-media-integrity'];
    const steps = job.steps;

    for (const requiredPath of [
      'test/integration/learning-media-upload.integration.spec.ts',
      'test/integration/learning-media-verification.integration.spec.ts',
      'test/integration/learning-media-storage.integration.spec.ts',
      'test/integration/learning-media-cleanup.integration.spec.ts',
      'test/e2e/academics-learning-media.e2e-spec.ts',
      'test/security/tenancy.academics-learning-media.spec.ts',
      'src/modules/academics/curriculum/tests/curriculum.use-case.spec.ts',
      'src/modules/academics/curriculum/tests/lesson-content.use-case.spec.ts',
      'src/modules/academics/curriculum/tests/lesson-content-publication.use-case.spec.ts',
      'src/modules/academics/curriculum/tests/lesson-content-publication.controller.spec.ts',
      'src/modules/academics/curriculum/tests/lesson-content-publication.contract.spec.ts',
      'test/integration/lesson-content-publication-constraint.integration.spec.ts',
      'test/integration/lesson-content-publication-atomicity.integration.spec.ts',
      'test/integration/lesson-content-publication-read-adapters.spec.ts',
      'test/e2e/academics-lesson-content-foundation.e2e-spec.ts',
      'test/security/tenancy.academics-lesson-content.spec.ts',
      'test/e2e/student-app-lessons.e2e-spec.ts',
      'test/security/tenancy.student-app-lessons.spec.ts',
      'test/e2e/parent-app-child-lessons.e2e-spec.ts',
      'test/security/tenancy.parent-app-child-lessons.spec.ts',
      'test/e2e/teacher-app-lesson-preparation.e2e-spec.ts',
      'test/security/tenancy.teacher-app-lesson-preparation.spec.ts',
    ]) {
      expect(workflow).toContain(requiredPath);
    }
    expect(
      steps.filter((step) => step.name === 'Verify ffprobe runtime contract'),
    ).toHaveLength(1);

    const minioStartSteps = steps.filter(
      (step) => step.name === 'Start exact MinIO release',
    );
    expect(minioStartSteps).toHaveLength(1);
    expect(minioStartSteps[0].run).toContain(
      '--env MINIO_ROOT_USER="$STORAGE_ACCESS_KEY"',
    );
    expect(minioStartSteps[0].run).toContain(
      '--env MINIO_ROOT_PASSWORD="$STORAGE_SECRET_KEY"',
    );
    expect(minioStartSteps[0].run?.match(/MINIO_ROOT_USER=/gu)).toHaveLength(1);
    expect(
      minioStartSteps[0].run?.match(/MINIO_ROOT_PASSWORD=/gu),
    ).toHaveLength(1);

    const waitForMinioIndex = steps.findIndex(
      (step) => step.name === 'Wait for MinIO',
    );
    const provisionStepIndexes = steps.flatMap((step, index) =>
      step.name === 'Provision required MinIO buckets' ? [index] : [],
    );
    const startupScenarioIndex = steps.findIndex(
      (step) => step.id === 'health_runtime_startup',
    );
    expect(waitForMinioIndex).toBeGreaterThanOrEqual(0);
    expect(provisionStepIndexes).toHaveLength(1);
    expect(waitForMinioIndex).toBeLessThan(provisionStepIndexes[0]);
    expect(provisionStepIndexes[0]).toBeLessThan(startupScenarioIndex);

    const provisionRun = steps[provisionStepIndexes[0]].run ?? '';
    expect(provisionRun).toContain("require('minio')");
    expect(provisionRun).toContain('process.env.STORAGE_BUCKET');
    expect(provisionRun).toContain('process.env.STORAGE_PUBLIC_BUCKET');
    expect(provisionRun).toContain('process.env.STORAGE_ACCESS_KEY');
    expect(provisionRun).toContain('process.env.STORAGE_SECRET_KEY');
    expect(provisionRun).toContain('client.bucketExists(bucket)');
    expect(provisionRun).toContain('client.makeBucket(bucket)');
    expect(provisionRun.indexOf('client.bucketExists(bucket)')).toBeLessThan(
      provisionRun.indexOf('client.makeBucket(bucket)'),
    );

    const scenarios = [
      ['health_runtime_startup', 'startup'],
      ['health_runtime_redis_recovery', 'redis-recovery'],
      ['health_runtime_storage_recovery', 'storage-recovery'],
      ['health_runtime_realtime_reconciliation', 'realtime-reconciliation'],
      ['health_runtime_graceful_shutdown', 'graceful-shutdown'],
      ['health_runtime_forced_timeout', 'forced-timeout'],
    ] as const;
    for (const [id, scenario] of scenarios) {
      const scenarioSteps = steps.filter((step) => step.id === id);
      expect(scenarioSteps).toHaveLength(1);
      expect(scenarioSteps[0]).toMatchObject({
        'continue-on-error': true,
        run: `bash scripts/ci/health-probe-runtime.sh ${scenario}`,
      });
    }

    expect(
      steps.filter((step) => step.name === 'Health runtime scenario summary'),
    ).toEqual([expect.objectContaining({ if: 'always()' })]);
    expect(
      steps.filter((step) => step.name === 'Upload health runtime diagnostics'),
    ).toEqual([
      expect.objectContaining({
        if: 'always()',
        uses: 'actions/upload-artifact@v4',
      }),
    ]);
    expect(
      steps.filter(
        (step) => step.name === 'Clean up learning media containers',
      ),
    ).toEqual([expect.objectContaining({ if: 'always()' })]);
    expect(
      steps.some(
        (step) =>
          step.name === 'Verify application startup with pinned ffprobe',
      ),
    ).toBe(false);

    const dispatchedScenarios = Array.from(
      harness.matchAll(/^  ([a-z-]+)\) scenario_[a-z_]+ ;;/gmu),
      (match) => match[1],
    );
    expect(dispatchedScenarios).toEqual(
      scenarios.map(([, scenario]) => scenario),
    );
    expect(workflow).toContain('STORAGE_CORS_ORIGINS');
    expect(workflow).toContain('postgres:16-alpine');
    expect(workflow).toContain('redis:7-alpine');
    expect(workflow).toContain('npm run db:migrations:check');
    expect(workflow).toContain('npm run db:migrations:status');
  });
});
