import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { SchoolAssessmentMediaPolicy } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActor,
  setActiveMembership,
} from '../../../../common/context/request-context';
import { AssessmentMediaRuntimePolicy } from '../application/assessment-media-runtime.policy';
import {
  assessmentMediaOwner,
  assertAssessmentTransition,
  assertAssessmentUuid,
} from '../domain/assessment-media.contract';
import {
  ASSESSMENT_MEDIA_CAPS,
  assertAssessmentUploadPolicy,
  effectiveAssessmentMediaPolicy,
} from '../domain/assessment-media.policy';

function row(
  overrides: Partial<SchoolAssessmentMediaPolicy> = {},
): SchoolAssessmentMediaPolicy {
  return {
    id: randomUUID(),
    schoolId: randomUUID(),
    uploadsEnabled: true,
    teacherUploadsEnabled: true,
    studentUploadsEnabled: true,
    allowedMimeTypes: ['text/plain', 'video/mp4'],
    maximumFileSizeBytes: 209_715_200n,
    maximumFilesPerResource: 8,
    maximumResourceBytes: 83_886_080n,
    maximumSchoolBytes: 1_073_741_824n,
    maximumConcurrentUploads: 2,
    maximumUploadsPerHour: 30,
    maximumDurationSeconds: 3600,
    maximumWidth: 1920,
    maximumHeight: 1080,
    allowInlinePreview: false,
    allowDownload: false,
    allowGuardianVisibility: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
function owner() {
  return runWithRequestContext(createRequestContext(), () => {
    setActor({ id: randomUUID(), userType: 'STUDENT' });
    setActiveMembership({
      membershipId: randomUUID(),
      schoolId: randomUUID(),
      organizationId: randomUUID(),
      roleId: randomUUID(),
      permissions: ['homework.submission_attachments.manage'],
    });
    return assessmentMediaOwner('HOMEWORK_SUBMISSION_MEDIA', randomUUID());
  });
}

describe('Assessment Media policy and runtime boundaries', () => {
  it('disables every actor/category/read capability when school policy is missing', () => {
    const policy = effectiveAssessmentMediaPolicy(null);
    expect(policy).toMatchObject({
      uploadsEnabled: false,
      teacherUploadsEnabled: false,
      studentUploadsEnabled: false,
      allowedMimeTypes: [],
      allowInlinePreview: false,
      allowDownload: false,
      allowGuardianVisibility: false,
    });
    expectCode(
      () => assertAssessmentUploadPolicy(policy, owner(), 'text/plain', 1n),
      'assessment_media.policy_denied',
    );
  });

  it('clamps over-limit settings and removes active/unknown MIME values', () => {
    const policy = effectiveAssessmentMediaPolicy(
      row({
        maximumFileSizeBytes: 999_999_999n,
        maximumFilesPerResource: 999,
        maximumConcurrentUploads: 999,
        maximumUploadsPerHour: 999,
        maximumDurationSeconds: 999_999,
        maximumWidth: 99_999,
        maximumHeight: 99_999,
        allowedMimeTypes: [
          'text/html',
          'image/svg+xml',
          'application/zip',
          'text/plain',
        ],
      }),
    );
    expect(policy).toMatchObject({
      maximumFileSizeBytes: ASSESSMENT_MEDIA_CAPS.videoBytes,
      maximumFilesPerResource: 8,
      maximumConcurrentUploads: 2,
      maximumUploadsPerHour: 30,
      maximumDurationSeconds: 3600,
      maximumWidth: 4096,
      maximumHeight: 4096,
      allowedMimeTypes: ['text/plain'],
    });
    expectCode(
      () => assertAssessmentUploadPolicy(policy, owner(), 'text/html', 100n),
      'assessment_media.policy_denied',
    );
  });

  it('keeps the 10 MiB technical non-video ceiling even under a larger school setting', () => {
    const policy = effectiveAssessmentMediaPolicy(row());
    expect(() =>
      assertAssessmentUploadPolicy(policy, owner(), 'text/plain', 10_485_760n),
    ).not.toThrow();
    expectCode(
      () =>
        assertAssessmentUploadPolicy(
          policy,
          owner(),
          'text/plain',
          10_485_761n,
        ),
      'assessment_media.policy_denied',
    );
    expectCode(
      () =>
        assertAssessmentUploadPolicy(
          policy,
          owner(),
          'video/mp4',
          209_715_201n,
        ),
      'assessment_media.policy_denied',
    );
  });

  it('preserves narrower school limits and separate student eligibility', () => {
    expectCode(
      () =>
        assertAssessmentUploadPolicy(
          effectiveAssessmentMediaPolicy(row({ maximumFileSizeBytes: 20n })),
          owner(),
          'text/plain',
          21n,
        ),
      'assessment_media.policy_denied',
    );
    expectCode(
      () =>
        assertAssessmentUploadPolicy(
          effectiveAssessmentMediaPolicy(row({ studentUploadsEnabled: false })),
          owner(),
          'text/plain',
          1n,
        ),
      'assessment_media.policy_denied',
    );
  });

  it.each([false, undefined])(
    'does not enable execution by default (%s)',
    (enabled) => {
      const runtime = new AssessmentMediaRuntimePolicy(
        new ConfigService({
          NODE_ENV: 'test',
          ASSESSMENT_MEDIA_UPLOADS_ENABLED: enabled,
        }),
      );
      expectCode(
        () => runtime.assertUploadExecutionEnabled(),
        'assessment_media.disabled',
      );
    },
  );

  it('rejects Production even if a caller supplies a true feature setting', () => {
    const runtime = new AssessmentMediaRuntimePolicy(
      new ConfigService({
        NODE_ENV: 'production',
        ASSESSMENT_MEDIA_UPLOADS_ENABLED: true,
      }),
    );
    expectCode(
      () => runtime.assertUploadExecutionEnabled(),
      'assessment_media.disabled',
    );
  });

  it('allows an explicit isolated test execution setting without claiming a security provider', () => {
    const runtime = new AssessmentMediaRuntimePolicy(
      new ConfigService({
        NODE_ENV: 'test',
        ASSESSMENT_MEDIA_UPLOADS_ENABLED: true,
      }),
    );
    expect(() => runtime.assertUploadExecutionEnabled()).not.toThrow();
  });

  it('rejects cross-actor purpose selection even if the cached role has authoring permission', () => {
    runWithRequestContext(createRequestContext(), () => {
      setActor({ id: randomUUID(), userType: 'STUDENT' });
      setActiveMembership({
        membershipId: randomUUID(),
        schoolId: randomUUID(),
        organizationId: randomUUID(),
        roleId: randomUUID(),
        permissions: ['grades.questions.manage'],
      });
      expectCode(
        () => assessmentMediaOwner('GRADE_ASSESSMENT_MEDIA', randomUUID()),
        'assessment_media.upload_not_found',
      );
    });
  });

  it.each([
    'READY',
    'LEGACY',
    'PURGED',
    'CANCELLED',
    'FAILED',
    'EXPIRED',
  ] as const)('cannot reopen %s into an assessment upload', (status) => {
    expectCode(
      () => assertAssessmentTransition(status, 'UPLOADING'),
      'assessment_media.state_conflict',
    );
  });

  it('does not confuse existing object upload with verified READY', () => {
    expectCode(
      () => assertAssessmentTransition('UPLOADING', 'READY'),
      'assessment_media.state_conflict',
    );
    expect(() =>
      assertAssessmentTransition('UPLOADING', 'VERIFYING'),
    ).not.toThrow();
  });

  it('validates UUID syntax without imposing a new version restriction on historical resource IDs', () => {
    expect(() =>
      assertAssessmentUuid('00000000-0000-0000-0000-000000000001'),
    ).not.toThrow();
    expectCode(
      () => assertAssessmentUuid("x' OR true"),
      'assessment_media.invalid_request',
    );
  });
});

function expectCode(operation: () => unknown, code: string): void {
  let caught: unknown;
  try {
    operation();
  } catch (error) {
    caught = error;
  }
  expect(caught).toMatchObject({ code });
}
