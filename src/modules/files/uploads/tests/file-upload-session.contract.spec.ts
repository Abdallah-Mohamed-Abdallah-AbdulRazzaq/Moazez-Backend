import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
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
      DATABASE_URL: 'postgresql://user:pass@example.test/db',
      REDIS_URL: 'redis://example.test:6379',
      JWT_ACCESS_SECRET: 'access-secret-at-least-sixteen',
      JWT_REFRESH_SECRET: 'refresh-secret-at-least-sixteen',
      JWT_ACCESS_TTL: '15m',
      JWT_REFRESH_TTL: '7d',
      STORAGE_ENDPOINT: 'https://storage.example.test',
      STORAGE_ACCESS_KEY: 'access',
      STORAGE_SECRET_KEY: 'secret',
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
    expect(workflow).toContain(
      'Verify application startup with pinned ffprobe',
    );
    expect(workflow).toContain('STORAGE_CORS_ORIGINS');
    expect(workflow).toContain('postgres:16-alpine');
    expect(workflow).toContain('redis:7-alpine');
    expect(workflow).toContain('npm run db:migrations:check');
    expect(workflow).toContain('npm run db:migrations:status');
  });
});
