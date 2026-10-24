import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActor,
  setActiveMembership,
} from '../../src/common/context/request-context';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { MinioAdapter } from '../../src/infrastructure/storage/minio.adapter';
import { SignedUrlService } from '../../src/infrastructure/storage/signed-url.service';
import { StorageService } from '../../src/infrastructure/storage/storage.service';
import { MediaVerifierService } from '../../src/modules/files/uploads/application/media-verifier.service';
import { PrismaTeacherAllocationOperationalWriteGate } from '../../src/modules/academics/teacher-allocation/infrastructure/prisma-teacher-allocation-operational-write-gate';
import { AssessmentMediaService } from '../../src/modules/files/assessment-media/application/assessment-media.service';
import { AssessmentMediaRuntimePolicy } from '../../src/modules/files/assessment-media/application/assessment-media-runtime.policy';
import { AssessmentMediaRepository } from '../../src/modules/files/assessment-media/infrastructure/assessment-media.repository';
import {
  AssessmentMediaSecurityGate,
  AssessmentMediaVerifier,
  type AssessmentSecurityAttestation,
} from '../../src/modules/files/assessment-media/application/assessment-media-verifier';
import {
  assessmentMediaOwner,
  ASSESSMENT_MEDIA_PURPOSES,
  type AssessmentMediaPurpose,
} from '../../src/modules/files/assessment-media/domain/assessment-media.contract';
import { assertDisposablePostgresTarget } from '../helpers/disposable-postgres-target';
import { AcademicContentEngagementFixture } from './academic-content-engagement.fixture';

export type MediaFixtureActor =
  | 'admin'
  | 'organization'
  | 'teacher'
  | 'otherTeacher'
  | 'foreignTeacher'
  | 'student'
  | 'otherStudent'
  | 'foreignStudent';
type Actor = {
  userId: string;
  userType: UserType;
  membershipId: string;
  roleId: string;
  school: number;
  classroomId: string;
  permissions: string[];
};
const AUTHOR_PERMISSIONS = [
  'homework.attachments.manage',
  'grades.questions.manage',
];
const STUDENT_PERMISSIONS = [
  'homework.submission_attachments.manage',
  'grades.submissions.submit',
];

/** Test contract attestation ONLY. This is not malware scanning or runtime evidence. */
export class TestOnlyAssessmentSecurityAttestation extends AssessmentMediaSecurityGate {
  calls = 0;
  beforeAttest?: (
    input: Parameters<AssessmentMediaSecurityGate['attest']>[0],
  ) => Promise<void>;
  async attest(
    input: Parameters<AssessmentMediaSecurityGate['attest']>[0],
  ): Promise<AssessmentSecurityAttestation> {
    this.calls++;
    await this.beforeAttest?.(input);
    return {
      verdict: 'CLEAN',
      provider: 'test-only-contract-attestation',
      version: 'test-fixture-v1',
      checksumSha256: input.facts.checksumSha256,
    };
  }
}

/** Reuses the established real academic/student graph; all extra rows are owned. */
export class AssessmentMediaFixture extends AcademicContentEngagementFixture {
  readonly actors = {} as Record<MediaFixtureActor, Actor>;
  readonly allocations = {} as Record<
    'teacher' | 'otherTeacher' | 'foreignTeacher',
    string
  >;
  readonly security = new TestOnlyAssessmentSecurityAttestation();
  readonly config: ConfigService;
  readonly storage: StorageService;
  readonly repository: AssessmentMediaRepository;
  readonly service: AssessmentMediaService;

  constructor(prisma: PrismaService) {
    super(prisma);
    assertDisposablePostgresTarget({
      databaseUrl: process.env.DATABASE_URL,
      nodeEnv: process.env.NODE_ENV,
      universalRegressionMarker:
        process.env.MOAZEZ_UNIVERSAL_REGRESSION_DISPOSABLE_DB,
      localDatabasePredicate: (name) => /^ci_[0-9a-f]{12,64}$/u.test(name),
      errorMessage:
        'Assessment Media requires an owned disposable test database',
    });
    const endpoint = new URL(
      process.env.STORAGE_ENDPOINT ?? 'http://invalid.invalid',
    );
    if (
      !['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname) &&
      !(
        process.env.MOAZEZ_UNIVERSAL_REGRESSION_DISPOSABLE_DB === '1' &&
        /^g07-[a-z0-9-]+-minio$/u.test(endpoint.hostname)
      )
    )
      throw new Error('Assessment Media requires owned loopback/CI storage');
    if (process.env.STORAGE_PROVIDER !== 'minio')
      throw new Error('Assessment Media fixture is MinIO only');
    this.config = new ConfigService({
      ...process.env,
      NODE_ENV: 'test',
      ASSESSMENT_MEDIA_UPLOADS_ENABLED: true,
      FFPROBE_TIMEOUT_MS: 1000,
      FFPROBE_MAX_OUTPUT_BYTES: 1_048_576,
    });
    const adapter = new MinioAdapter(this.config);
    this.storage = new StorageService(
      adapter,
      new SignedUrlService(adapter, this.config),
    );
    this.repository = new AssessmentMediaRepository(
      prisma,
      new PrismaTeacherAllocationOperationalWriteGate(),
    );
    this.service = this.serviceWithSecurity(this.security);
  }

  serviceWithSecurity(
    security: AssessmentMediaSecurityGate,
  ): AssessmentMediaService {
    return new AssessmentMediaService(
      this.repository,
      this.storage,
      new AssessmentMediaVerifier(
        this.storage,
        new MediaVerifierService(this.storage, this.config),
        security,
      ),
      new AssessmentMediaRuntimePolicy(this.config),
      this.config,
    );
  }

  async create(): Promise<void> {
    await super.create();
    await this.addActor('admin', this.authorId, 'SCHOOL_USER', 0);
    await this.addActor('organization', randomUUID(), 'ORGANIZATION_USER', 0);
    await this.addActor('teacher', randomUUID(), 'TEACHER', 0);
    const secondClass = await this.prisma.classroom.create({
      data: {
        schoolId: this.school.schoolId,
        sectionId: this.school.sectionId,
        nameAr: 'Other',
        nameEn: 'Other',
      },
    });
    await this.addActor(
      'otherTeacher',
      randomUUID(),
      'TEACHER',
      0,
      secondClass.id,
    );
    await this.addActor('foreignTeacher', randomUUID(), 'TEACHER', 1);
    for (const [name, childIndex] of [
      ['student', 0],
      ['otherStudent', 1],
      ['foreignStudent', 2],
    ] as const) {
      const child = this.children[childIndex];
      this.actors[name] = {
        userId: child.userId,
        userType: 'STUDENT',
        membershipId: child.membershipId,
        roleId: child.roleId,
        school: child.school,
        classroomId: this.schools[child.school].classroomId,
        permissions: [...STUDENT_PERMISSIONS],
      };
      await this.grant(child.roleId, STUDENT_PERMISSIONS);
    }
    for (const name of ['teacher', 'otherTeacher', 'foreignTeacher'] as const) {
      const actor = this.actors[name],
        school = this.schools[actor.school];
      this.allocations[name] = (
        await this.prisma.teacherSubjectAllocation.create({
          data: {
            schoolId: school.schoolId,
            teacherUserId: actor.userId,
            classroomId: actor.classroomId,
            subjectId: school.subjectId,
            termId: school.termId,
          },
        })
      ).id;
    }
    for (const school of this.schools)
      await this.prisma.schoolAssessmentMediaPolicy.create({
        data: {
          schoolId: school.schoolId,
          uploadsEnabled: true,
          teacherUploadsEnabled: true,
          studentUploadsEnabled: true,
          allowedMimeTypes: ['text/plain'],
        },
      });
  }

  private async grant(roleId: string, codes: readonly string[]): Promise<void> {
    for (const code of codes) {
      const [module, resource, action] = code.split('.');
      const permission = await this.prisma.permission.upsert({
        where: { code },
        create: { code, module, resource, action },
        update: {},
      });
      await this.prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId: permission.id } },
        create: { roleId, permissionId: permission.id },
        update: {},
      });
    }
  }

  private async addActor(
    name: MediaFixtureActor,
    userId: ReturnType<typeof randomUUID>,
    userType: UserType,
    schoolIndex: number,
    classroomId: string = this.schools[schoolIndex].classroomId,
  ): Promise<void> {
    const school = this.schools[schoolIndex];
    if (!this.users.includes(userId)) {
      this.users.push(userId);
      await this.prisma.user.create({
        data: {
          id: userId,
          userType,
          firstName: 'Assessment',
          lastName: 'Fixture',
          email: `${userId}@assessment-fixture.test`,
        },
      });
    }
    const role = await this.prisma.role.create({
      data: {
        schoolId: userType === 'ORGANIZATION_USER' ? null : school.schoolId,
        key: `assessment-${randomUUID()}`,
        name: 'Owned Assessment fixture',
      },
    });
    await this.grant(role.id, AUTHOR_PERMISSIONS);
    const membership = await this.prisma.membership.create({
      data: {
        userId,
        userType,
        roleId: role.id,
        schoolId: userType === 'ORGANIZATION_USER' ? null : school.schoolId,
        organizationId: school.organizationId,
      },
    });
    this.actors[name] = {
      userId,
      userType,
      membershipId: membership.id,
      roleId: role.id,
      school: schoolIndex,
      classroomId,
      permissions: [...AUTHOR_PERMISSIONS],
    };
  }

  asMediaActor<T>(
    name: MediaFixtureActor,
    operation: () => Promise<T>,
    selectedSchool?: number,
  ): Promise<T> {
    const actor = this.actors[name],
      school = this.schools[selectedSchool ?? actor.school];
    return runWithRequestContext(createRequestContext(), () => {
      setActor({ id: actor.userId, userType: actor.userType });
      setActiveMembership({
        membershipId: actor.membershipId,
        roleId: actor.roleId,
        schoolId: school.schoolId,
        organizationId: school.organizationId,
        permissions: [...actor.permissions],
      });
      return operation();
    });
  }

  async homework(
    status: 'DRAFT' | 'PUBLISHED' = 'DRAFT',
    actorName: 'teacher' | 'otherTeacher' | 'foreignTeacher' = 'teacher',
  ) {
    const actor = this.actors[actorName],
      school = this.schools[actor.school];
    return this.prisma.homeworkAssignment.create({
      data: {
        schoolId: school.schoolId,
        academicYearId: school.yearId,
        termId: school.termId,
        classroomId: actor.classroomId,
        subjectId: school.subjectId,
        teacherUserId: actor.userId,
        teacherSubjectAllocationId: this.allocations[actorName],
        title: 'Owned assessment media fixture',
        dueAt: new Date(Date.now() + 86_400_000),
        createdByUserId: actor.userId,
        status,
        ...(status === 'PUBLISHED'
          ? { publishedAt: new Date(), publishedByUserId: actor.userId }
          : {}),
      },
    });
  }

  async target(childIndex = 0) {
    const child = this.children[childIndex],
      school = this.schools[child.school];
    const homework = await this.homework(
      'PUBLISHED',
      child.school === 1 ? 'foreignTeacher' : 'teacher',
    );
    return this.prisma.homeworkTarget.create({
      data: {
        schoolId: school.schoolId,
        homeworkAssignmentId: homework.id,
        studentId: child.studentId,
        enrollmentId: child.enrollmentId,
      },
    });
  }

  async assessment(
    actorName: 'teacher' | 'otherTeacher' | 'foreignTeacher' = 'teacher',
    published = false,
  ) {
    const actor = this.actors[actorName],
      school = this.schools[actor.school];
    return this.prisma.gradeAssessment.create({
      data: {
        schoolId: school.schoolId,
        academicYearId: school.yearId,
        termId: school.termId,
        subjectId: school.subjectId,
        scopeType: 'CLASSROOM',
        scopeKey: actor.classroomId,
        stageId: school.stageId,
        gradeId: school.gradeId,
        sectionId: school.sectionId,
        classroomId: actor.classroomId,
        titleEn: 'Owned assessment fixture',
        type: 'QUIZ',
        deliveryMode: 'QUESTION_BASED',
        date: new Date(),
        weight: 1,
        maxScore: 100,
        createdById: actor.userId,
        ...(published
          ? {
              approvalStatus: 'PUBLISHED' as const,
              publishedAt: new Date(),
              publishedById: actor.userId,
            }
          : {}),
      },
    });
  }

  async submission(childIndex = 0) {
    const child = this.children[childIndex],
      school = this.schools[child.school];
    const assessment = await this.assessment(
      child.school === 1 ? 'foreignTeacher' : 'teacher',
      true,
    );
    return this.prisma.gradeSubmission.create({
      data: {
        schoolId: school.schoolId,
        assessmentId: assessment.id,
        termId: school.termId,
        studentId: child.studentId,
        enrollmentId: child.enrollmentId,
      },
    });
  }

  async upload(
    contextId: string,
    bytes = Buffer.from('actual owned fixture text\n'),
    purpose: AssessmentMediaPurpose = 'HOMEWORK_ASSIGNMENT_MEDIA',
    name = 'response.txt',
    mime = 'text/plain',
    service = this.service,
  ) {
    const command = {
      clientRequestId: randomUUID(),
      originalName: name,
      expectedMimeType: mime,
      expectedSizeBytes: String(bytes.length),
    };
    const intent =
      purpose === 'HOMEWORK_ASSIGNMENT_MEDIA'
        ? await service.createHomeworkAssignmentUpload(contextId, command)
        : purpose === 'GRADE_ASSESSMENT_MEDIA'
          ? await service.createGradeAssessmentUpload(contextId, command)
          : purpose === 'HOMEWORK_SUBMISSION_MEDIA'
            ? await service.createHomeworkSubmissionUpload(contextId, command)
            : await service.createGradeSubmissionUpload(contextId, command);
    if (
      !intent.uploadCapability ||
      intent.uploadCapability.mode !== 'signed-post'
    )
      throw new Error('Owned fixture requires actual bounded POST capability');
    const result = await postAssessmentUpload(
      intent.uploadCapability,
      bytes,
      mime,
    );
    if (!result.ok) throw new Error('Owned bounded POST fixture failed');
    const session = await this.prisma.fileUploadSession.findUniqueOrThrow({
      where: { id: intent.uploadId },
    });
    return { intent, session, bytes, command };
  }

  owner(
    name: MediaFixtureActor,
    purpose: AssessmentMediaPurpose,
    contextId: string,
  ) {
    return this.asMediaActor(name, () =>
      Promise.resolve(assessmentMediaOwner(purpose, contextId)),
    );
  }

  async dispose(): Promise<void> {
    const schoolIds = this.schools.map((school) => school.schoolId),
      where = { schoolId: { in: schoolIds } };
    const uploads = await this.prisma.fileUploadSession.findMany({
      where: { ...where, purpose: { in: [...ASSESSMENT_MEDIA_PURPOSES] } },
      select: {
        schoolId: true,
        stagingBucket: true,
        stagingObjectKey: true,
        finalBucket: true,
        finalObjectKey: true,
      },
    });
    for (const upload of uploads) {
      for (const [bucket, objectKey] of [
        [upload.stagingBucket, upload.stagingObjectKey],
        [upload.finalBucket, upload.finalObjectKey],
      ]) {
        if (!bucket || !objectKey) continue;
        if (
          bucket !== this.storage.resolveBucket('PRIVATE') ||
          !objectKey.startsWith(`assessment-media/${upload.schoolId}/`)
        )
          throw new Error('Fixture refuses unrelated object cleanup');
        if (await this.storage.objectExists({ bucket, objectKey }))
          await this.storage.deleteObject({ bucket, objectKey });
      }
    }
    await this.prisma.fileUploadSession.deleteMany({ where });
    await this.prisma.schoolAssessmentMediaPolicy.deleteMany({ where });
    await this.prisma.attachment.deleteMany({ where });
    await this.prisma.homeworkSubmissionAttachment.deleteMany({ where });
    await this.prisma.homeworkSubmission.deleteMany({ where });
    await this.prisma.homeworkTarget.deleteMany({ where });
    await this.prisma.homeworkAssignmentAttachment.deleteMany({ where });
    await this.prisma.homeworkAssignment.deleteMany({ where });
    await this.prisma.gradeSubmission.deleteMany({ where });
    await this.prisma.gradeAssessment.deleteMany({ where });
    await this.prisma.teacherSubjectAllocation.deleteMany({ where });
    await this.prisma.auditLog.deleteMany({ where });
    const actors = Object.values(this.actors);
    await this.prisma.membership.deleteMany({
      where: { id: { in: actors.map((actor) => actor.membershipId) } },
    });
    await this.prisma.role.deleteMany({
      where: { id: { in: actors.map((actor) => actor.roleId) } },
    });
    await super.dispose();
  }
}

export function deferred() {
  let resolve: () => void = () => {
    throw new Error('Deferred not initialized');
  };
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

export async function postAssessmentUpload(
  capability: NonNullable<
    import('../../src/modules/files/assessment-media/domain/assessment-media.contract').AssessmentMediaUploadDto['uploadCapability']
  >,
  bytes: Buffer,
  mime: string,
) {
  const form = new FormData();
  for (const [key, value] of Object.entries(capability.formFields ?? {}))
    form.append(key, key === 'Content-Type' ? mime : value);
  form.append(
    'file',
    new Blob([Uint8Array.from(bytes)], { type: mime }),
    'fixture',
  );
  return fetch(capability.url, { method: 'POST', body: form });
}
