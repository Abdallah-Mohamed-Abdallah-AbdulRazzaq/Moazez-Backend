import { randomUUID } from 'node:crypto';
import {
  CurriculumStatus,
  FileUploadPurpose,
  FileUploadSessionStatus,
  FileVisibility,
  LessonContentItemType,
  LessonContentPublicationStatus,
  LessonPlanItemStatus,
  LessonPlanStatus,
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  SchoolStatus,
  StudentEnrollmentStatus,
  StudentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../../src/common/context/request-context';

export type PlaybackFixture = {
  organizationId: string;
  schoolId: string;
  academicYearId: string;
  termId: string;
  stageId: string;
  gradeId: string;
  sectionId: string;
  classroomId: string;
  subjectId: string;
  curriculumId: string;
  unitId: string;
  lessonId: string;
  lessonPlanId: string;
  lessonPlanItemId: string;
  teacherUserId: string;
  teacherMembershipId: string;
  teacherRoleId: string;
  allocationId: string;
  otherTeacherUserId: string;
  otherAllocationId: string;
  parentUserId: string;
  parentMembershipId: string;
  parentRoleId: string;
  guardianId: string;
  guardianLinkId: string;
  studentId: string;
  enrollmentId: string;
  fileId: string;
  uploadSessionId: string;
  publishedContentItemId: string;
  draftContentItemId: string;
  archivedContentItemId: string;
  bucket: string;
  objectKey: string;
  sizeBytes: bigint;
};

export type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value?: T | PromiseLike<T>) => void;
  reject: (reason: unknown) => void;
};

export async function createPlaybackFixture(
  prisma: PrismaClient,
  prefix: string,
): Promise<PlaybackFixture> {
  const marker = `${prefix}-${randomUUID().split('-')[0]}`;
  const organization = await prisma.organization.create({
    data: {
      slug: `${marker}-org`,
      name: `${marker} Organization`,
      status: OrganizationStatus.ACTIVE,
    },
  });
  const school = await prisma.school.create({
    data: {
      organizationId: organization.id,
      slug: `${marker}-school`,
      name: `${marker} School`,
      status: SchoolStatus.ACTIVE,
    },
  });
  const [teacher, otherTeacher, parent] = await Promise.all([
    createUser(prisma, marker, 'teacher', UserType.TEACHER),
    createUser(prisma, marker, 'other-teacher', UserType.TEACHER),
    createUser(prisma, marker, 'parent', UserType.PARENT),
  ]);
  const academicYear = await prisma.academicYear.create({
    data: {
      schoolId: school.id,
      nameAr: `${marker}-year-ar`,
      nameEn: `${marker}-year`,
      startDate: new Date('2026-09-01T00:00:00.000Z'),
      endDate: new Date('2027-06-30T00:00:00.000Z'),
      isActive: true,
    },
  });
  const term = await prisma.term.create({
    data: {
      schoolId: school.id,
      academicYearId: academicYear.id,
      nameAr: `${marker}-term-ar`,
      nameEn: `${marker}-term`,
      startDate: new Date('2026-09-01T00:00:00.000Z'),
      endDate: new Date('2026-12-31T00:00:00.000Z'),
      isActive: true,
    },
  });
  const stage = await prisma.stage.create({
    data: {
      schoolId: school.id,
      nameAr: `${marker}-stage-ar`,
      nameEn: `${marker}-stage`,
      sortOrder: 1,
    },
  });
  const grade = await prisma.grade.create({
    data: {
      schoolId: school.id,
      stageId: stage.id,
      nameAr: `${marker}-grade-ar`,
      nameEn: `${marker}-grade`,
      sortOrder: 1,
    },
  });
  const section = await prisma.section.create({
    data: {
      schoolId: school.id,
      gradeId: grade.id,
      nameAr: `${marker}-section-ar`,
      nameEn: `${marker}-section`,
      sortOrder: 1,
    },
  });
  const classroom = await prisma.classroom.create({
    data: {
      schoolId: school.id,
      sectionId: section.id,
      nameAr: `${marker}-classroom-ar`,
      nameEn: `${marker}-classroom`,
      sortOrder: 1,
    },
  });
  const [teacherRole, parentRole] = await Promise.all([
    prisma.role.create({
      data: {
        schoolId: school.id,
        key: `${marker}-teacher-role`,
        name: `${marker} Teacher Role`,
      },
    }),
    prisma.role.create({
      data: {
        schoolId: school.id,
        key: `${marker}-parent-role`,
        name: `${marker} Parent Role`,
      },
    }),
  ]);
  const [teacherMembership, parentMembership] = await Promise.all([
    prisma.membership.create({
      data: {
        userId: teacher.id,
        organizationId: organization.id,
        schoolId: school.id,
        roleId: teacherRole.id,
        userType: UserType.TEACHER,
        status: MembershipStatus.ACTIVE,
      },
    }),
    prisma.membership.create({
      data: {
        userId: parent.id,
        organizationId: organization.id,
        schoolId: school.id,
        roleId: parentRole.id,
        userType: UserType.PARENT,
        status: MembershipStatus.ACTIVE,
      },
    }),
  ]);
  const subject = await prisma.subject.create({
    data: {
      schoolId: school.id,
      nameAr: `${marker}-subject-ar`,
      nameEn: `${marker}-subject`,
      code: marker.slice(0, 30).toUpperCase(),
      isActive: true,
    },
  });
  const [allocation, otherAllocation] = await Promise.all([
    prisma.teacherSubjectAllocation.create({
      data: {
        schoolId: school.id,
        teacherUserId: teacher.id,
        subjectId: subject.id,
        classroomId: classroom.id,
        termId: term.id,
      },
    }),
    prisma.teacherSubjectAllocation.create({
      data: {
        schoolId: school.id,
        teacherUserId: otherTeacher.id,
        subjectId: subject.id,
        classroomId: classroom.id,
        termId: term.id,
      },
    }),
  ]);
  const curriculum = await prisma.curriculum.create({
    data: {
      schoolId: school.id,
      academicYearId: academicYear.id,
      termId: term.id,
      gradeId: grade.id,
      subjectId: subject.id,
      title: `${marker}-curriculum`,
      status: CurriculumStatus.ACTIVE,
      createdByUserId: teacher.id,
    },
  });
  const unit = await prisma.curriculumUnit.create({
    data: {
      schoolId: school.id,
      curriculumId: curriculum.id,
      title: `${marker}-unit`,
    },
  });
  const lesson = await prisma.curriculumLesson.create({
    data: {
      schoolId: school.id,
      curriculumId: curriculum.id,
      unitId: unit.id,
      title: `${marker}-lesson`,
    },
  });
  const lessonPlan = await prisma.lessonPlan.create({
    data: {
      schoolId: school.id,
      academicYearId: academicYear.id,
      termId: term.id,
      teacherSubjectAllocationId: allocation.id,
      teacherUserId: teacher.id,
      classroomId: classroom.id,
      subjectId: subject.id,
      curriculumId: curriculum.id,
      title: `${marker}-plan`,
      status: LessonPlanStatus.ACTIVE,
      weekStartDate: new Date('2026-09-14T00:00:00.000Z'),
      weekEndDate: new Date('2026-09-20T00:00:00.000Z'),
      createdByUserId: teacher.id,
    },
  });
  const lessonPlanItem = await prisma.lessonPlanItem.create({
    data: {
      schoolId: school.id,
      lessonPlanId: lessonPlan.id,
      curriculumId: curriculum.id,
      unitId: unit.id,
      lessonId: lesson.id,
      plannedDate: new Date('2026-09-14T00:00:00.000Z'),
      title: `${marker}-item`,
      status: LessonPlanItemStatus.PLANNED,
      createdByUserId: teacher.id,
    },
  });
  const student = await prisma.student.create({
    data: {
      organizationId: organization.id,
      schoolId: school.id,
      firstName: 'Playback',
      lastName: 'Child',
      status: StudentStatus.ACTIVE,
    },
  });
  const enrollment = await prisma.enrollment.create({
    data: {
      schoolId: school.id,
      studentId: student.id,
      academicYearId: academicYear.id,
      termId: term.id,
      classroomId: classroom.id,
      status: StudentEnrollmentStatus.ACTIVE,
      enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
    },
  });
  const guardian = await prisma.guardian.create({
    data: {
      organizationId: organization.id,
      schoolId: school.id,
      userId: parent.id,
      firstName: 'Playback',
      lastName: 'Parent',
      phone: `${marker}-phone`,
      email: `${marker}-guardian@example.test`,
      relation: 'parent',
      isPrimary: true,
    },
  });
  const guardianLink = await prisma.studentGuardian.create({
    data: {
      schoolId: school.id,
      studentId: student.id,
      guardianId: guardian.id,
      isPrimary: true,
    },
  });
  const sizeBytes = BigInt(4096);
  const bucket = `${marker}-final`;
  const objectKey = `${marker}/video/final`;
  const file = await prisma.file.create({
    data: {
      organizationId: organization.id,
      schoolId: school.id,
      uploaderId: teacher.id,
      bucket,
      objectKey,
      originalName: 'playback.mp4',
      mimeType: 'video/mp4',
      sizeBytes,
      checksumSha256: 'a'.repeat(64),
      visibility: FileVisibility.PRIVATE,
    },
  });
  const createdAt = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000);
  const latestUploadUrlExpiresAt = new Date(
    createdAt.getTime() + 60 * 60 * 1000,
  );
  const completedAt = new Date(createdAt.getTime() + 5 * 60 * 1000);
  const uploadSession = await prisma.fileUploadSession.create({
    data: {
      organizationId: organization.id,
      schoolId: school.id,
      createdByUserId: teacher.id,
      clientRequestId: randomUUID(),
      purpose: FileUploadPurpose.LESSON_CONTENT,
      originalName: 'playback.mp4',
      expectedMimeType: 'video/mp4',
      expectedSizeBytes: sizeBytes,
      stagingBucket: `${marker}-staging`,
      stagingObjectKey: `${marker}/video/staging`,
      finalBucket: bucket,
      finalObjectKey: objectKey,
      status: FileUploadSessionStatus.READY,
      createdAt,
      expiresAt: new Date(createdAt.getTime() + 2 * 60 * 60 * 1000),
      latestUploadUrlExpiresAt,
      completedAt,
      stagingCleanupEligibleAt: latestUploadUrlExpiresAt,
      finalCleanupEligibleAt: new Date(
        completedAt.getTime() + 7 * 24 * 60 * 60 * 1000,
      ),
      verifiedMimeType: 'video/mp4',
      actualSizeBytes: sizeBytes,
      checksumSha256: 'a'.repeat(64),
      durationSeconds: 10,
      width: 640,
      height: 360,
      verifiedAt: completedAt,
      verificationVersion: 'ffprobe-5.1.9-debian12-learning-media-v1',
      fileId: file.id,
    },
  });
  const [published, draft, archived] = await Promise.all([
    createContent(prisma, {
      schoolId: school.id,
      curriculumId: curriculum.id,
      unitId: unit.id,
      lessonId: lesson.id,
      teacherUserId: teacher.id,
      fileId: file.id,
      marker,
      publicationStatus: LessonContentPublicationStatus.PUBLISHED,
      sortOrder: 1,
    }),
    createContent(prisma, {
      schoolId: school.id,
      curriculumId: curriculum.id,
      unitId: unit.id,
      lessonId: lesson.id,
      teacherUserId: teacher.id,
      fileId: file.id,
      marker,
      publicationStatus: LessonContentPublicationStatus.DRAFT,
      sortOrder: 2,
    }),
    createContent(prisma, {
      schoolId: school.id,
      curriculumId: curriculum.id,
      unitId: unit.id,
      lessonId: lesson.id,
      teacherUserId: teacher.id,
      fileId: file.id,
      marker,
      publicationStatus: LessonContentPublicationStatus.ARCHIVED,
      sortOrder: 3,
    }),
  ]);

  return {
    organizationId: organization.id,
    schoolId: school.id,
    academicYearId: academicYear.id,
    termId: term.id,
    stageId: stage.id,
    gradeId: grade.id,
    sectionId: section.id,
    classroomId: classroom.id,
    subjectId: subject.id,
    curriculumId: curriculum.id,
    unitId: unit.id,
    lessonId: lesson.id,
    lessonPlanId: lessonPlan.id,
    lessonPlanItemId: lessonPlanItem.id,
    teacherUserId: teacher.id,
    teacherMembershipId: teacherMembership.id,
    teacherRoleId: teacherRole.id,
    allocationId: allocation.id,
    otherTeacherUserId: otherTeacher.id,
    otherAllocationId: otherAllocation.id,
    parentUserId: parent.id,
    parentMembershipId: parentMembership.id,
    parentRoleId: parentRole.id,
    guardianId: guardian.id,
    guardianLinkId: guardianLink.id,
    studentId: student.id,
    enrollmentId: enrollment.id,
    fileId: file.id,
    uploadSessionId: uploadSession.id,
    publishedContentItemId: published.id,
    draftContentItemId: draft.id,
    archivedContentItemId: archived.id,
    bucket,
    objectKey,
    sizeBytes,
  };
}

export async function cleanupPlaybackFixture(
  prisma: PrismaClient,
  fixture: PlaybackFixture | undefined,
): Promise<void> {
  if (!fixture) return;
  await prisma.auditLog.deleteMany({ where: { schoolId: fixture.schoolId } });
  await prisma.lessonContentItem.deleteMany({
    where: { schoolId: fixture.schoolId },
  });
  await prisma.fileUploadSession.deleteMany({
    where: { schoolId: fixture.schoolId },
  });
  await prisma.file.deleteMany({ where: { schoolId: fixture.schoolId } });
  await prisma.lessonPlanItem.deleteMany({
    where: { schoolId: fixture.schoolId },
  });
  await prisma.lessonPlan.deleteMany({ where: { schoolId: fixture.schoolId } });
  await prisma.curriculumLesson.deleteMany({
    where: { schoolId: fixture.schoolId },
  });
  await prisma.curriculumUnit.deleteMany({
    where: { schoolId: fixture.schoolId },
  });
  await prisma.curriculum.deleteMany({
    where: { schoolId: fixture.schoolId },
  });
  await prisma.teacherSubjectAllocation.deleteMany({
    where: { schoolId: fixture.schoolId },
  });
  await prisma.subject.deleteMany({ where: { schoolId: fixture.schoolId } });
  await prisma.enrollment.deleteMany({ where: { schoolId: fixture.schoolId } });
  await prisma.studentGuardian.deleteMany({
    where: { schoolId: fixture.schoolId },
  });
  await prisma.guardian.deleteMany({ where: { schoolId: fixture.schoolId } });
  await prisma.student.deleteMany({ where: { schoolId: fixture.schoolId } });
  await prisma.membership.deleteMany({
    where: { schoolId: fixture.schoolId },
  });
  await prisma.role.deleteMany({ where: { schoolId: fixture.schoolId } });
  await prisma.classroom.deleteMany({ where: { schoolId: fixture.schoolId } });
  await prisma.section.deleteMany({ where: { schoolId: fixture.schoolId } });
  await prisma.grade.deleteMany({ where: { schoolId: fixture.schoolId } });
  await prisma.stage.deleteMany({ where: { schoolId: fixture.schoolId } });
  await prisma.term.deleteMany({ where: { schoolId: fixture.schoolId } });
  await prisma.academicYear.deleteMany({
    where: { schoolId: fixture.schoolId },
  });
  await prisma.user.deleteMany({
    where: {
      id: {
        in: [
          fixture.teacherUserId,
          fixture.otherTeacherUserId,
          fixture.parentUserId,
        ],
      },
    },
  });
  await prisma.school.delete({ where: { id: fixture.schoolId } });
  await prisma.organization.delete({
    where: { id: fixture.organizationId },
  });
}

export function runInActorScope<T>(
  fixture: PlaybackFixture,
  actor: 'parent' | 'teacher',
  operation: () => Promise<T>,
): Promise<T> {
  const requestContext = createRequestContext();
  const parent = actor === 'parent';
  requestContext.actor = {
    id: parent ? fixture.parentUserId : fixture.teacherUserId,
    userType: parent ? UserType.PARENT : UserType.TEACHER,
  };
  requestContext.activeMembership = {
    membershipId: parent
      ? fixture.parentMembershipId
      : fixture.teacherMembershipId,
    schoolId: fixture.schoolId,
    organizationId: fixture.organizationId,
    roleId: parent ? fixture.parentRoleId : fixture.teacherRoleId,
    permissions: [
      'academics.lesson_plans.view',
      'academics.curriculum.view',
      ...(parent ? [] : ['teacher.lesson_preparation.view']),
    ],
  };
  return runWithRequestContext(requestContext, operation);
}

export function deferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>['resolve'];
  let reject!: Deferred<T>['reject'];
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

export function buildObserverDatabaseUrl(label: string): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(`DATABASE_URL is required for ${label}`);
  }
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error(`DATABASE_URL is malformed for ${label}`);
  }
  url.searchParams.set('connection_limit', '1');
  url.searchParams.set('pool_timeout', '10');
  return url.toString();
}

export async function waitUntilAnyBackendIsBlocked(
  observer: PrismaClient,
): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const rows = await observer.$queryRaw<Array<{ blockedCount: bigint }>>`
      SELECT COUNT(*)::bigint AS "blockedCount"
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND cardinality(pg_blocking_pids(pid)) > 0
    `;
    if ((rows[0]?.blockedCount ?? BigInt(0)) > BigInt(0)) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Expected PostgreSQL playback race wait was not observed');
}

async function createUser(
  prisma: PrismaClient,
  marker: string,
  label: string,
  userType: UserType,
): Promise<{ id: string }> {
  return prisma.user.create({
    data: {
      email: `${marker}-${label}@example.test`,
      firstName: 'Playback',
      lastName: label,
      userType,
      status: UserStatus.ACTIVE,
    },
    select: { id: true },
  });
}

async function createContent(
  prisma: PrismaClient,
  params: {
    schoolId: string;
    curriculumId: string;
    unitId: string;
    lessonId: string;
    teacherUserId: string;
    fileId: string;
    marker: string;
    publicationStatus: LessonContentPublicationStatus;
    sortOrder: number;
  },
): Promise<{ id: string }> {
  const published =
    params.publicationStatus === LessonContentPublicationStatus.PUBLISHED;
  const archived =
    params.publicationStatus === LessonContentPublicationStatus.ARCHIVED;
  return prisma.lessonContentItem.create({
    data: {
      schoolId: params.schoolId,
      curriculumId: params.curriculumId,
      unitId: params.unitId,
      lessonId: params.lessonId,
      type: LessonContentItemType.FILE,
      title: `${params.marker}-${params.publicationStatus}`,
      fileId: params.fileId,
      sortOrder: params.sortOrder,
      createdByUserId: params.teacherUserId,
      publicationStatus: params.publicationStatus,
      publishedAt: published || archived ? new Date() : null,
      publishedByUserId: published || archived ? params.teacherUserId : null,
      archivedAt: archived ? new Date() : null,
      archivedByUserId: archived ? params.teacherUserId : null,
    },
    select: { id: true },
  });
}
