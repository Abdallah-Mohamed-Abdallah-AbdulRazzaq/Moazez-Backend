import {
  createRequestContext,
  runWithRequestContext,
  setActor,
  setActiveMembership,
} from '../../src/common/context/request-context';
import { ParentAppAccessService } from '../../src/modules/parent-app/access/parent-app-access.service';
import { ParentAppGuardianReadAdapter } from '../../src/modules/parent-app/access/parent-app-guardian-read.adapter';
import {
  ListParentAcademicContentUseCase,
  GetParentAcademicContentUseCase,
  ListParentAcademicContentAccessibleChildrenUseCase,
} from '../../src/modules/parent-app/academic-content/application/parent-academic-content.use-cases';
import { buildDeepLink } from '../../src/modules/communication/presenters/communication-app-notification.presenter';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  AcademicContentAudienceType as Audience,
  AcademicContentPublicationStatus,
  AcademicContentTargetScopeType as Scope,
  AcademicContentType,
  Prisma,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { AcademicContentCurrentAccessService } from '../../src/modules/academics/academic-content/application/academic-content-current-access.service';
import { AcademicContentAudienceRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-audience.repository';
import { AcademicContentRecipientReadRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-recipient-read.repository';
import { AcademicContentPublicationRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-publication.repository';
import { AcademicContentRevisionRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-revision.repository';
import { AcademicContentPublicationLifecycleRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-publication-lifecycle.repository';
import { AcademicContentPublicationSnapshotRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-publication-snapshot.repository';
import { AcademicContentRevisionAudienceResolver } from '../../src/modules/academics/academic-content/infrastructure/academic-content-revision-audience.resolver';
import { AcademicContentCurrentRecipientContext } from '../../src/modules/academics/academic-content/domain/academic-content-current-access.policy';
import {
  AcademicContentRecipientQuery,
  ParentAcademicContentType,
} from '../../src/modules/academics/academic-content/domain/academic-content-recipient.query';
import { ParentAcademicContentPresenter as Presenter } from '../../src/modules/parent-app/academic-content/presenters/parent-academic-content.presenter';

const url = process.env.DATABASE_URL;
const describeDatabase = url ? describe : describe.skip;
describeDatabase(
  'ACC-10C PostgreSQL Parent immutable recipient surface',
  () => {
    jest.setTimeout(120_000);
    const prisma = new PrismaService({
      datasourceUrl: url ?? 'postgresql://unused:unused@127.0.0.1:1/unused',
    });
    const audience = new AcademicContentAudienceRepository(prisma);
    const service = new AcademicContentCurrentAccessService(
      new AcademicContentRecipientReadRepository(prisma),
      audience,
    );
    const now = new Date(Date.now() - 60_000);
    let organizationId: string,
      schoolId: string,
      foreignSchoolId: string,
      yearId: string,
      termId: string,
      guardianId: string,
      otherYearId: string,
      otherTermId: string,
      sameYearOtherTermId: string,
      otherGradeId: string,
      foreignYearId: string,
      foreignTermId: string;
    let stageId: string,
      gradeId: string,
      sectionId: string,
      classroomId: string,
      otherClassroomId: string,
      subjectId: string,
      otherSubjectId: string;
    const users: string[] = [],
      students: string[] = [],
      enrollments: string[] = [];
    const schoolIds = (): string[] =>
      [schoolId, foreignSchoolId].filter(Boolean);
    const context = (
      index = 0,
    ): Extract<
      AcademicContentCurrentRecipientContext,
      { actorKind: 'PARENT' }
    > => ({
      actorKind: 'PARENT',
      guardianIds: [guardianId],
      schoolId,
      userId: users[3],
      studentId: students[index],
      enrollmentId: enrollments[index],
      classroomId,
      academicYearId: yearId,
      termId,
    });
    const feed = (
      query: AcademicContentRecipientQuery<ParentAcademicContentType> = {},
      actor = context(),
    ) => service.listCurrentParentPublications(actor, query, now);
    const detail = (contentId: string, actor = context()) =>
      service.getCurrentParentContent(actor, contentId, now);
    const deny = async (contentId: string, actor = context()) => {
      await expect(detail(contentId, actor)).rejects.toMatchObject({
        code: 'not_found',
        httpStatus: 404,
      });
      expect((await feed({}, actor)).items).toEqual([]);
    };

    const parentAccess = new ParentAppAccessService(
      new ParentAppGuardianReadAdapter(prisma),
    );
    const parentFeed = new ListParentAcademicContentUseCase(
      parentAccess,
      service,
    );
    const parentDetail = new GetParentAcademicContentUseCase(
      parentAccess,
      service,
    );
    const parentChildren =
      new ListParentAcademicContentAccessibleChildrenUseCase(
        parentAccess,
        service,
      );
    const accessible = (contentId: string) =>
      service.listCurrentParentAccessibleChildren(
        {
          schoolId,
          userId: users[3],
          guardianIds: [guardianId],
          children: students.map((_, i) => context(i)),
        },
        contentId,
        now,
      );
    const asParent = <T>(fn: () => Promise<T>) =>
      runWithRequestContext(createRequestContext(), () => {
        setActor({ id: users[3], userType: UserType.PARENT });
        setActiveMembership({
          membershipId: randomUUID(),
          roleId: randomUUID(),
          schoolId,
          organizationId,
          permissions: ['academics.academic_content.view'],
        });
        return fn();
      });

    beforeAll(async () => {
      await prisma.$connect();
      const tag = randomUUID();
      organizationId = (
        await prisma.organization.create({
          data: { name: 'ACC10C', slug: `acc10c-${tag}` },
        })
      ).id;
      schoolId = (
        await prisma.school.create({
          data: { organizationId, name: 'ACC10C', slug: `acc10c-${tag}` },
        })
      ).id;
      foreignSchoolId = (
        await prisma.school.create({
          data: {
            organizationId,
            name: 'Foreign',
            slug: `acc10c-foreign-${tag}`,
          },
        })
      ).id;
      for (const userType of [
        UserType.SCHOOL_USER,
        UserType.STUDENT,
        UserType.STUDENT,
        UserType.PARENT,
      ])
        users.push(
          (
            await prisma.user.create({
              data: {
                userType,
                email: `acc10c-${randomUUID()}@example.test`,
                firstName: 'Test',
                lastName: 'ACC',
              },
            })
          ).id,
        );
      guardianId = (
        await prisma.guardian.create({
          data: {
            schoolId,
            organizationId,
            userId: users[3],
            firstName: 'Parent',
            lastName: 'ACC',
            phone: 'test-phone',
            relation: 'PARENT',
          },
        })
      ).id;
      for (const name of ['Current', 'Other', 'Foreign']) {
        const year = await prisma.academicYear.create({
          data: {
            schoolId: name === 'Foreign' ? foreignSchoolId : schoolId,
            nameAr: name,
            nameEn: name,
            startDate: new Date('2026-01-01'),
            endDate: new Date('2027-12-31'),
          },
        });
        const term = await prisma.term.create({
          data: {
            schoolId: name === 'Foreign' ? foreignSchoolId : schoolId,
            academicYearId: year.id,
            isActive: true,
            nameAr: 'Term',
            nameEn: 'Term',
            startDate: new Date('2026-01-01'),
            endDate: new Date('2027-12-31'),
          },
        });
        if (name === 'Current') {
          yearId = year.id;
          termId = term.id;
        } else if (name === 'Other') {
          otherYearId = year.id;
          otherTermId = term.id;
        } else {
          foreignYearId = year.id;
          foreignTermId = term.id;
        }
      }
      stageId = (
        await prisma.stage.create({
          data: { schoolId, nameAr: 'Stage', nameEn: 'Stage' },
        })
      ).id;
      gradeId = (
        await prisma.grade.create({
          data: { schoolId, stageId, nameAr: 'Grade', nameEn: 'Grade' },
        })
      ).id;
      sectionId = (
        await prisma.section.create({
          data: { schoolId, gradeId, nameAr: 'Section', nameEn: 'Section' },
        })
      ).id;
      otherGradeId = (
        await prisma.grade.create({
          data: {
            schoolId,
            stageId,
            nameAr: 'Other grade',
            nameEn: 'Other grade',
          },
        })
      ).id;
      sameYearOtherTermId = (
        await prisma.term.create({
          data: {
            schoolId,
            academicYearId: yearId,
            nameAr: 'Other current-year term',
            nameEn: 'Other current-year term',
            startDate: new Date('2026-01-01'),
            endDate: new Date('2027-12-31'),
          },
        })
      ).id;
      for (const name of ['Current', 'Other']) {
        const classroom = await prisma.classroom.create({
          data: { schoolId, sectionId, nameAr: name, nameEn: name },
        });
        if (name === 'Current') classroomId = classroom.id;
        else otherClassroomId = classroom.id;
      }
      for (const name of ['Current', 'Other']) {
        const subject = await prisma.subject.create({
          data: {
            schoolId,
            nameAr: name,
            nameEn: name,
            code: `acc10c-${name}-${tag}`,
          },
        });
        if (name === 'Current') subjectId = subject.id;
        else otherSubjectId = subject.id;
      }
      for (let index = 0; index < 2; index++) {
        const student = await prisma.student.create({
          data: {
            schoolId,
            organizationId,
            userId: users[index + 1],
            firstName: 'Student',
            lastName: String(index),
          },
        });
        students.push(student.id);
        enrollments.push(
          (
            await prisma.enrollment.create({
              data: {
                schoolId,
                studentId: student.id,
                classroomId,
                academicYearId: yearId,
                termId,
                enrolledAt: now,
              },
            })
          ).id,
        );
      }
    });

    async function resetLinks() {
      await prisma.studentGuardian.deleteMany({ where: { guardianId } });
      for (const studentId of students)
        await prisma.studentGuardian.create({
          data: { schoolId, studentId, guardianId },
        });
    }
    async function clearContent() {
      const where = { schoolId: { in: schoolIds() } };
      await prisma.auditLog.deleteMany({ where });
      await prisma.academicContentAudienceRecipientTarget.deleteMany({ where });
      await prisma.academicContentAudienceRecipient.deleteMany({ where });
      await prisma.academicContentPublication.deleteMany({
        where: { ...where, supersedesPublicationId: { not: null } },
      });
      await prisma.academicContentPublication.deleteMany({ where });
      await prisma.academicContentRevisionAsset.deleteMany({ where });
      await prisma.academicContentRevisionLink.deleteMany({ where });
      await prisma.academicContentRevisionTag.deleteMany({ where });
      await prisma.academicContentRevisionTarget.deleteMany({ where });
      await prisma.academicContentRevision.deleteMany({ where });
      await prisma.academicContentAsset.deleteMany({ where });
      await prisma.academicContentLink.deleteMany({ where });
      await prisma.academicContentTag.deleteMany({ where });
      await prisma.academicContentWeeklyPlanDetail.deleteMany({ where });
      await prisma.academicContent.deleteMany({ where });
      await prisma.file.deleteMany({ where });
      await prisma.subjectAllocation.deleteMany({ where });
    }
    beforeEach(async () => {
      await clearContent();
      await prisma.guardian.update({
        where: { id: guardianId },
        data: {
          deletedAt: null,
          canReceiveNotifications: true,
          userId: users[3],
        },
      });
      await resetLinks();
      await prisma.organization.update({
        where: { id: organizationId },
        data: { status: 'ACTIVE', deletedAt: null },
      });
      await prisma.school.updateMany({
        where: { id: { in: schoolIds() } },
        data: { status: 'ACTIVE', deletedAt: null },
      });
      await prisma.student.updateMany({
        where: { schoolId },
        data: { status: 'ACTIVE', deletedAt: null },
      });
      await prisma.user.updateMany({
        where: { id: { in: users } },
        data: { status: 'ACTIVE', deletedAt: null },
      });
      await prisma.enrollment.updateMany({
        where: { schoolId },
        data: {
          status: 'ACTIVE',
          deletedAt: null,
          classroomId,
          academicYearId: yearId,
          termId,
        },
      });
      for (let index = 0; index < 2; index++)
        await prisma.student.update({
          where: { id: students[index] },
          data: { userId: users[index + 1] },
        });
    });
    afterAll(async () => {
      try {
        if (schoolId) {
          await clearContent();
          const where = { schoolId: { in: schoolIds() } };
          await prisma.studentGuardian.deleteMany({ where });
          await prisma.guardian.deleteMany({ where });
          await prisma.enrollment.deleteMany({ where });
          await prisma.student.deleteMany({ where });
          await prisma.subject.deleteMany({ where });
          await prisma.classroom.deleteMany({ where });
          await prisma.section.deleteMany({ where });
          await prisma.grade.deleteMany({ where });
          await prisma.stage.deleteMany({ where });
          await prisma.term.deleteMany({ where });
          await prisma.academicYear.deleteMany({ where });
          await prisma.school.deleteMany({
            where: { id: { in: schoolIds() } },
          });
        }
        await prisma.user.deleteMany({ where: { id: { in: users } } });
        if (organizationId)
          await prisma.organization.delete({ where: { id: organizationId } });
      } finally {
        await prisma.$disconnect();
      }
    });

    async function publish(
      options: {
        type?: AcademicContentType;
        audience?: Audience;
        scope?: Scope;
        qualified?: boolean;
        subject?: string;
        targetClassroom?: string;
        title?: string;
        status?: AcademicContentPublicationStatus;
        visibleFrom?: Date;
        visibleUntil?: Date;
        publishedAt?: Date;
        version?: number;
        historical?: boolean;
        foreign?: boolean;
      } = {},
    ) {
      const type = options.type ?? 'GENERAL_RESOURCE';
      const audienceType = options.audience ?? Audience.GUARDIANS;
      const publicationSchoolId = options.foreign ? foreignSchoolId : schoolId;
      const publicationYearId = options.foreign ? foreignYearId : yearId;
      const publicationTermId = options.foreign ? foreignTermId : termId;
      const content = await prisma.academicContent.create({
        data: {
          schoolId: publicationSchoolId,
          academicYearId: publicationYearId,
          termId: publicationTermId,
          type,
          audience:
            type === 'GUARDIAN_WEEKLY_NOTE'
              ? Audience.GUARDIANS
              : type === 'ONLINE_SESSION'
                ? Audience.STUDENTS
                : audienceType,
          title: 'Mutable authoring',
          createdByUserId: users[0],
        },
      });
      const snapshots: Partial<
        Record<AcademicContentType, Prisma.InputJsonValue>
      > = {
        WEEKLY_PLAN: {
          type,
          state: {
            weekStartDate: '2026-10-05',
            weekEndDate: '2026-10-09',
            objectives: ['Published objective'],
            topics: ['Published topic'],
            expectedHomework: 'Published homework',
            upcomingAssessments: null,
            notes: 'Published note',
            homeworkAssignmentIds: [],
            gradeAssessmentIds: [],
          },
        },
        SUBJECT_RESOURCE: {
          type,
          state: {
            resourceCategory: 'WORKSHEET',
            curriculumId: null,
            curriculumUnitId: null,
            curriculumLessonId: null,
          },
        },
        ONLINE_SESSION: {
          type,
          state: {
            platform: 'ZOOM',
            providerName: 'Published provider',
            joinUrl: 'https://meeting.example.test/published',
            accessCode: 'published-secret',
            instructions: 'Published instructions',
            startAt: '2026-10-07T12:00:00.000Z',
            endAt: '2026-10-07T13:00:00.000Z',
            timezone: 'Africa/Cairo',
            timetableEntryId: null,
          },
        },
        GUARDIAN_WEEKLY_NOTE: {
          type,
          state: {
            body: 'Guardian only',
            priority: 'NORMAL',
            requiresAcknowledgement: true,
          },
        },
      };
      const revision = await prisma.academicContentRevision.create({
        data: {
          schoolId: publicationSchoolId,
          academicContentId: content.id,
          revisionNumber: 1,
          snapshotContractVersion: options.version ?? 2,
          academicYearId: publicationYearId,
          termId: publicationTermId,
          type,
          audience: audienceType,
          title: options.title ?? 'Frozen published title',
          description: 'Frozen published description',
          sourceStatus: 'DRAFT',
          capturedByUserId: users[0],
          typeSpecificSnapshot: snapshots[type] ?? Prisma.DbNull,
        },
      });
      const scope = options.scope ?? Scope.CLASSROOM;
      await prisma.academicContentRevisionTarget.create({
        data: {
          schoolId: publicationSchoolId,
          revisionId: revision.id,
          scopeType: scope,
          stageId: scope === Scope.STAGE ? stageId : null,
          gradeId: scope === Scope.GRADE ? gradeId : null,
          sectionId: scope === Scope.SECTION ? sectionId : null,
          classroomId:
            scope === Scope.CLASSROOM
              ? (options.targetClassroom ?? classroomId)
              : null,
          subjectId: options.qualified ? (options.subject ?? subjectId) : null,
          identityFingerprint: randomBytes(32).toString('hex'),
        },
      });
      const publication = await prisma.academicContentPublication.create({
        data: {
          schoolId: publicationSchoolId,
          academicContentId: content.id,
          revisionId: revision.id,
          status: options.status ?? 'PUBLISHED',
          sourceContentStatus: 'DRAFT',
          publishAt: options.visibleUntil
            ? new Date(now.getTime() - 60_000)
            : new Date(
                Math.min(
                  options.publishedAt?.getTime() ?? now.getTime(),
                  now.getTime(),
                ),
              ),
          publishedAt:
            options.status === 'SCHEDULED'
              ? null
              : (options.publishedAt ?? now),
          visibleFrom:
            options.visibleFrom ??
            (options.visibleUntil ? new Date(now.getTime() - 60_000) : now),
          visibleUntil: options.visibleUntil ?? null,
          cancelledAt: options.status === 'CANCELLED' ? now : null,
          cancellationReason:
            options.status === 'CANCELLED' ? 'WITHDRAWN' : null,
          expiredAt: options.status === 'EXPIRED' ? now : null,
          createdByUserId: users[0],
          clientRequestId: randomUUID(),
          requestFingerprint: randomBytes(32).toString('hex'),
        },
      });
      if (options.historical !== false && !options.foreign)
        await prisma.academicContentAudienceRecipient.create({
          data: {
            schoolId,
            publicationId: publication.id,
            revisionId: revision.id,
            recipientKind: 'GUARDIAN',
            guardianId,
            identityFingerprint: randomBytes(32).toString('hex'),
            studentId: students[0],
            enrollmentId: enrollments[0],
            classroomId,
            recipientUserId: users[3],
          },
        });
      return { content, revision, publication };
    }
    const allocate = (
      data: Partial<Prisma.SubjectAllocationUncheckedCreateInput> = {},
    ) =>
      prisma.subjectAllocation.create({
        data: {
          schoolId,
          academicYearId: yearId,
          termId,
          gradeId,
          subjectId,
          weeklyHours: 2,
          ...data,
        },
      });

    it.each([
      'removed-link',
      'deleted-guardian',
      'wrong-guardian-owner',
      'deleted-user',
      'wrong-user-type',
      'no-guardian-ids',
    ] as const)(
      'revalidates current Parent relationship: %s',
      async (variant) => {
        const p = await publish({ type: 'ONLINE_SESSION' });
        let actor = context();
        if (variant === 'removed-link')
          await prisma.studentGuardian.deleteMany({ where: { guardianId } });
        if (variant === 'deleted-guardian')
          await prisma.guardian.update({
            where: { id: guardianId },
            data: { deletedAt: now },
          });
        if (variant === 'wrong-guardian-owner')
          await prisma.guardian.update({
            where: { id: guardianId },
            data: { userId: users[1] },
          });
        if (variant === 'deleted-user')
          await prisma.user.update({
            where: { id: users[3] },
            data: { deletedAt: now },
          });
        if (variant === 'wrong-user-type')
          actor = { ...actor, userId: users[1] };
        if (variant === 'no-guardian-ids')
          actor = { ...actor, guardianIds: [] };
        await deny(p.content.id, actor);
        await expect(
          service.listCurrentParentAccessibleChildren(
            {
              schoolId,
              userId: actor.userId,
              guardianIds: actor.guardianIds,
              children: [actor],
            },
            p.content.id,
            now,
          ),
        ).rejects.toMatchObject({ httpStatus: 404 });
      },
    );
    it('allows notification opt-out and a late Guardian link without altering the historical snapshot', async () => {
      await prisma.studentGuardian.deleteMany({
        where: { guardianId, studentId: students[1] },
      });
      const p = await publish();
      const snapshot = await prisma.academicContentAudienceRecipient.findMany({
        where: { publicationId: p.publication.id },
      });
      await deny(p.content.id, context(1));
      expect((await accessible(p.content.id)).children).toEqual([
        { studentId: students[0] },
      ]);
      await prisma.studentGuardian.create({
        data: {
          schoolId,
          guardianId,
          studentId: students[1],
        },
      });
      await prisma.guardian.update({
        where: { id: guardianId },
        data: { canReceiveNotifications: false },
      });
      expect((await feed({}, context(1))).pagination.total).toBe(1);
      expect((await detail(p.content.id, context(1))).revisionId).toBe(
        p.revision.id,
      );
      expect((await accessible(p.content.id)).children).toEqual(
        [...students].sort().map((studentId) => ({ studentId })),
      );
      expect(
        await prisma.academicContentAudienceRecipient.findMany({
          where: { publicationId: p.publication.id },
        }),
      ).toEqual(snapshot);
    });
    it('keeps child feeds independent and batches only current children for single and multi-child deep links', async () => {
      await prisma.enrollment.update({
        where: { id: enrollments[1] },
        data: { classroomId: otherClassroomId },
      });
      const a = await publish(),
        b = await publish({ targetClassroom: otherClassroomId });
      expect((await feed()).items.map((i) => i.contentId)).toEqual([
        a.content.id,
      ]);
      expect(
        (
          await feed({}, { ...context(1), classroomId: otherClassroomId })
        ).items.map((i) => i.contentId),
      ).toEqual([b.content.id]);
      const single = buildDeepLink({
        sourceModule: 'ACADEMICS',
        sourceType: 'academic_content_publication',
        sourceId: a.publication.id,
        type: 'ACADEMIC_CONTENT_PUBLISHED',
        metadata: {
          academicContentId: a.content.id,
          studentIds: [students[0]],
        },
      });
      expect(single).toMatchObject({ studentId: students[0] });
      expect(
        (await asParent(() => parentDetail.execute(students[0], a.content.id)))
          .content.publicationId,
      ).toBe(a.publication.id);
      const multi = buildDeepLink({
        sourceModule: 'ACADEMICS',
        sourceType: 'academic_content_publication',
        sourceId: a.publication.id,
        type: 'ACADEMIC_CONTENT_PUBLISHED',
        metadata: { academicContentId: a.content.id, studentIds: students },
      });
      expect(multi).toMatchObject({ studentId: null });
      expect(
        (await asParent(() => parentChildren.execute(a.content.id))).children,
      ).toEqual([{ studentId: students[0] }]);
      await prisma.studentGuardian.deleteMany({
        where: { guardianId, studentId: students[0] },
      });
      await expect(
        asParent(() => parentDetail.execute(students[0], a.content.id)),
      ).rejects.toMatchObject({ httpStatus: 404 });
      await expect(
        asParent(() => parentChildren.execute(a.content.id)),
      ).rejects.toMatchObject({ httpStatus: 404 });
    });
    it('excludes non-owned children even when stale notification metadata names them', async () => {
      const p = await publish();
      await prisma.studentGuardian.deleteMany({
        where: { guardianId, studentId: students[1] },
      });
      const output = await accessible(p.content.id);
      expect(output).toEqual({
        academicContentId: p.content.id,
        publicationId: p.publication.id,
        children: [{ studentId: students[0] }],
      });
      for (const studentId of [students[1], randomUUID()]) {
        await expect(
          asParent(() => parentFeed.execute(studentId)),
        ).rejects.toMatchObject({
          code: 'parent_app.child.not_found',
          httpStatus: 404,
        });
        await expect(
          asParent(() => parentDetail.execute(studentId, p.content.id)),
        ).rejects.toMatchObject({
          code: 'parent_app.child.not_found',
          httpStatus: 404,
        });
      }
      for (const key of [
        'guardianId',
        'guardianIds',
        'enrollmentId',
        'classroomId',
        'targets',
        'recipientUserId',
        'studentRecipientCount',
        'bucket',
        'objectKey',
        'identityFingerprint',
      ])
        expect(JSON.stringify(output)).not.toContain('"' + key + '"');
    });
    it('returns an empty null-term child feed, denies detail and excludes it from accessible children', async () => {
      const p = await publish();
      await prisma.enrollment.update({
        where: { id: enrollments[0] },
        data: { termId: null },
      });
      expect(
        await asParent(() =>
          parentFeed.execute(students[0], { page: 2, limit: 3 }),
        ),
      ).toEqual({ items: [], pagination: { page: 2, limit: 3, total: 0 } });
      await expect(
        asParent(() => parentDetail.execute(students[0], p.content.id)),
      ).rejects.toMatchObject({ code: 'not_found', httpStatus: 404 });
      expect(
        (await asParent(() => parentChildren.execute(p.content.id))).children,
      ).toEqual([{ studentId: students[1] }]);
    });
    it('projects immutable Guardian Note metadata and body without adding acknowledgement state', async () => {
      const p = await publish({ type: 'GUARDIAN_WEEKLY_NOTE' });
      const list = Presenter.presentList(
        await feed({ type: 'GUARDIAN_WEEKLY_NOTE' }),
      );
      expect(list.items[0].summary).toEqual({
        priority: 'NORMAL',
        requiresAcknowledgement: true,
      });
      expect(JSON.stringify(list)).not.toContain('Guardian only');
      expect(
        Presenter.presentDetail(await detail(p.content.id)).content.details,
      ).toEqual({
        body: 'Guardian only',
        priority: 'NORMAL',
        requiresAcknowledgement: true,
      });
      expect(JSON.stringify(list)).not.toContain('isAcknowledged');
    });
    it.each([
      'WEEKLY_PLAN',
      'GUARDIAN_WEEKLY_NOTE',
      'SUBJECT_RESOURCE',
      'ONLINE_SESSION',
      'GENERAL_RESOURCE',
    ] as const)('allows Parent recipient type %s', async (type) => {
      const p = await publish({ type });
      expect((await feed({ type })).pagination.total).toBe(1);
      expect(
        Presenter.presentDetail(await detail(p.content.id)).content.type,
      ).toBe(type);
    });
    it.each([
      'removed-link',
      'enrollment-changed',
      'cancelled',
      'visibility-ended',
    ] as const)(
      'fences the final sensitive read after identity authorization: %s',
      async (variant) => {
        const p = await publish({
          type: 'ONLINE_SESSION',
          ...(variant === 'visibility-ended'
            ? { visibleUntil: new Date(now.getTime() + 1) }
            : {}),
        });
        const reads = new AcademicContentRecipientReadRepository(prisma);
        const identity = await reads.findCurrentParentPublication(
          context(),
          p.content.id,
          now,
        );
        expect(identity).not.toBeNull();
        if (variant === 'removed-link')
          await prisma.studentGuardian.deleteMany({
            where: { guardianId, studentId: students[0] },
          });
        if (variant === 'enrollment-changed')
          await prisma.enrollment.update({
            where: { id: enrollments[0] },
            data: { classroomId: otherClassroomId },
          });
        if (variant === 'cancelled')
          await prisma.academicContentPublication.update({
            where: { id: p.publication.id },
            data: {
              status: 'CANCELLED',
              cancelledAt: now,
              cancellationReason: 'WITHDRAWN',
            },
          });
        expect(
          await reads.findCurrentParentDetail(
            context(),
            identity,
            variant === 'visibility-ended' ? new Date(now.getTime() + 1) : now,
          ),
        ).toBeNull();
      },
    );

    it.each(Object.values(Scope))(
      'matches immutable %s targets identically to ACC-10A',
      async (scope) => {
        const p = await publish({ scope });
        expect((await feed()).items.map((row) => row.publicationId)).toEqual([
          p.publication.id,
        ]);
        expect(
          (
            await service.assertPublicationAccess(
              context(),
              p.publication.id,
              now,
            )
          ).publication.revisionId,
        ).toBe(p.revision.id);
        expect((await detail(p.content.id)).revisionId).toBe(p.revision.id);
      },
    );
    it.each([Audience.GUARDIANS, Audience.STUDENTS_AND_GUARDIANS])(
      'allows Parent audience %s',
      async (audienceType) => {
        const p = await publish({ audience: audienceType });
        expect((await feed()).pagination.total).toBe(1);
        expect((await detail(p.content.id)).audience).toBe(audienceType);
      },
    );
    it.each([
      { audience: Audience.STUDENTS },
      { audience: Audience.INTERNAL_STAFF },
      {
        type: AcademicContentType.TEACHER_PREPARATION,
        audience: Audience.INTERNAL_STAFF,
      },
      {
        type: AcademicContentType.GUARDIAN_WEEKLY_NOTE,
        audience: Audience.STUDENTS,
      },
    ])('denies unavailable audience/type %j', async (options) => {
      const p = await publish(options);
      await deny(p.content.id);
    });

    it.each([
      { visibleFrom: new Date(now.getTime() + 1) },
      { visibleUntil: now },
      { publishedAt: new Date(now.getTime() + 1) },
      { status: AcademicContentPublicationStatus.CANCELLED },
      { status: AcademicContentPublicationStatus.SCHEDULED },
      { status: AcademicContentPublicationStatus.EXPIRED },
      { version: 1 },
    ])('denies non-current visibility/version %j', async (options) => {
      const p = await publish(options);
      await deny(p.content.id);
    });

    it('allows late matching Enrollment without rewriting historical recipients', async () => {
      await prisma.enrollment.update({
        where: { id: enrollments[1] },
        data: { classroomId: otherClassroomId },
      });
      const p = await publish();
      const before = await prisma.academicContentAudienceRecipient.findMany({
        where: { publicationId: p.publication.id },
      });
      await deny(p.content.id, {
        ...context(1),
        classroomId: otherClassroomId,
      });
      await prisma.enrollment.update({
        where: { id: enrollments[1] },
        data: { classroomId },
      });
      expect((await feed({}, context(1))).pagination.total).toBe(1);
      expect((await detail(p.content.id, context(1))).revisionId).toBe(
        p.revision.id,
      );
      expect(
        await prisma.academicContentAudienceRecipient.findMany({
          where: { publicationId: p.publication.id },
        }),
      ).toEqual(before);
    });
    it('denies a historical recipient after Enrollment withdrawal', async () => {
      const p = await publish();
      const before = await prisma.academicContentAudienceRecipient.findMany({
        where: { publicationId: p.publication.id },
      });
      await prisma.enrollment.update({
        where: { id: enrollments[0] },
        data: { status: 'WITHDRAWN' },
      });
      await deny(p.content.id);
      expect(
        await prisma.academicContentAudienceRecipient.findMany({
          where: { publicationId: p.publication.id },
        }),
      ).toEqual(before);
    });

    it.each([
      'wrong-user',
      'wrong-student',
      'wrong-enrollment',
      'wrong-classroom',
      'wrong-year',
      'wrong-term',
      'inactive-student',
      'deleted-student',
      'deleted-enrollment',
      'inactive-user',
      'deleted-content',
      'suspended-school',
      'deleted-school',
      'suspended-organization',
    ] as const)('fails closed on %s', async (variant) => {
      const p = await publish();
      let actor = context();
      if (variant === 'wrong-user') actor = { ...actor, userId: users[1] };
      if (variant === 'wrong-student')
        actor = { ...actor, studentId: students[1] };
      if (variant === 'wrong-enrollment')
        actor = { ...actor, enrollmentId: enrollments[1] };
      if (variant === 'wrong-classroom')
        actor = { ...actor, classroomId: otherClassroomId };
      if (variant === 'wrong-year')
        actor = { ...actor, academicYearId: otherYearId };
      if (variant === 'wrong-term') actor = { ...actor, termId: otherTermId };
      if (variant === 'inactive-student')
        await prisma.student.update({
          where: { id: students[0] },
          data: { status: 'SUSPENDED' },
        });
      if (variant === 'deleted-student')
        await prisma.student.update({
          where: { id: students[0] },
          data: { deletedAt: now },
        });
      if (variant === 'deleted-enrollment')
        await prisma.enrollment.update({
          where: { id: enrollments[0] },
          data: { deletedAt: now },
        });
      if (variant === 'inactive-user')
        await prisma.user.update({
          where: { id: users[3] },
          data: { status: 'DISABLED' },
        });
      if (variant === 'deleted-content')
        await prisma.academicContent.update({
          where: { id: p.content.id },
          data: { deletedAt: now },
        });
      if (variant === 'suspended-school')
        await prisma.school.update({
          where: { id: schoolId },
          data: { status: 'SUSPENDED' },
        });
      if (variant === 'deleted-school')
        await prisma.school.update({
          where: { id: schoolId },
          data: { deletedAt: now },
        });
      if (variant === 'suspended-organization')
        await prisma.organization.update({
          where: { id: organizationId },
          data: { status: 'SUSPENDED' },
        });
      await deny(p.content.id, actor);
    });

    it.each([
      'missing',
      'zero-hours',
      'deleted',
      'wrong-year',
      'wrong-term',
      'wrong-grade',
      'wrong-subject',
    ] as const)('requires current SubjectAllocation: %s', async (variant) => {
      const p = await publish({ qualified: true });
      if (variant !== 'missing')
        await allocate({
          ...(variant === 'zero-hours' ? { weeklyHours: 0 } : {}),
          ...(variant === 'deleted' ? { deletedAt: now } : {}),
          ...(variant === 'wrong-year' ? { academicYearId: otherYearId } : {}),
          ...(variant === 'wrong-term' ? { termId: sameYearOtherTermId } : {}),
          ...(variant === 'wrong-grade' ? { gradeId: otherGradeId } : {}),
          ...(variant === 'wrong-subject' ? { subjectId: otherSubjectId } : {}),
        });
      await deny(p.content.id);
      expect((await feed({ subjectId })).pagination.total).toBe(0);
    });
    it('requires subject qualification on the same currently matching target', async () => {
      const qualified = await publish({ qualified: true });
      await allocate();
      await publish({ title: 'Unqualified' });
      const wrongScope = await publish({
        qualified: true,
        targetClassroom: otherClassroomId,
      });
      expect(
        (await feed({ subjectId })).items.map((row) => row.publicationId),
      ).toEqual([qualified.publication.id]);
      await expect(detail(wrongScope.content.id)).rejects.toMatchObject({
        code: 'not_found',
      });
      expect((await feed({ subjectId: otherSubjectId })).pagination.total).toBe(
        0,
      );
    });

    it('filters and presents immutable weekly title, description, targets, tags, links and details', async () => {
      const p = await publish({
        type: 'WEEKLY_PLAN',
        title: 'Published weekly',
      });
      await prisma.academicContentRevisionTag.create({
        data: {
          schoolId,
          revisionId: p.revision.id,
          displayValue: 'Published Tag',
          normalizedValue: 'published tag',
          sortOrder: 0,
        },
      });
      await prisma.academicContentRevisionLink.create({
        data: {
          schoolId,
          revisionId: p.revision.id,
          label: 'Published',
          url: 'https://example.test/published',
          sortOrder: 0,
        },
      });
      await prisma.academicContent.update({
        where: { id: p.content.id },
        data: {
          title: 'Mutable replacement',
          description: 'Mutable description',
        },
      });
      await prisma.academicContentTarget.create({
        data: {
          schoolId,
          academicContentId: p.content.id,
          scopeType: 'CLASSROOM',
          classroomId: otherClassroomId,
          identityFingerprint: randomBytes(32).toString('hex'),
          createdByUserId: users[0],
        },
      });
      await prisma.academicContentTag.create({
        data: {
          schoolId,
          academicContentId: p.content.id,
          displayValue: 'Mutable Tag',
          normalizedValue: 'mutable tag',
          sortOrder: 0,
          createdByUserId: users[0],
        },
      });
      await prisma.academicContentLink.create({
        data: {
          schoolId,
          academicContentId: p.content.id,
          label: 'Mutable',
          url: 'https://example.test/mutable',
          sortOrder: 0,
          createdByUserId: users[0],
        },
      });
      await prisma.academicContentWeeklyPlanDetail.create({
        data: {
          schoolId,
          academicContentId: p.content.id,
          weekStartDate: new Date('2026-11-02'),
          weekEndDate: new Date('2026-11-06'),
          objectives: ['Mutable objective'],
          topics: ['Mutable topic'],
        },
      });
      for (const query of [
        { type: 'WEEKLY_PLAN' } as const,
        { search: 'published WEEKLY' },
        { search: 'FROZEN PUBLISHED DESCRIPTION' },
        { tag: '  Ｐublished   Tag  ' },
        { weeklyDateFrom: '2026-10-07' },
        { weeklyDateTo: '2026-10-07' },
        { weeklyDateFrom: '2026-10-05', weeklyDateTo: '2026-10-09' },
      ])
        expect((await feed(query)).items.map((row) => row.revisionId)).toEqual([
          p.revision.id,
        ]);
      for (const query of [
        { search: 'Mutable replacement' },
        { tag: 'Mutable Tag' },
        { weeklyDateFrom: '2026-10-10' },
        { weeklyDateTo: '2026-10-04' },
      ])
        expect((await feed(query)).pagination.total).toBe(0);
      const projected = Presenter.presentDetail(
        await detail(p.content.id),
      ).content;
      expect(projected.title).toBe('Published weekly');
      expect(projected.links).toEqual([
        {
          label: 'Published',
          url: 'https://example.test/published',
          sortOrder: 0,
        },
      ]);
      expect(projected.tags).toEqual([
        { value: 'Published Tag', sortOrder: 0 },
      ]);
      expect(projected.details).toMatchObject({
        weekStartDate: '2026-10-05',
        objectives: ['Published objective'],
      });
    });
    it('filters immutable session instants/platform and exposes capabilities only in authorized detail', async () => {
      const p = await publish({ type: 'ONLINE_SESSION' });
      for (const query of [
        { type: 'ONLINE_SESSION' } as const,
        { sessionPlatform: 'ZOOM' } as const,
        { sessionStartAtFrom: '2026-10-07T14:00:00+02:00' },
        { sessionStartAtTo: '2026-10-07T12:00:00Z' },
      ])
        expect((await feed(query)).pagination.total).toBe(1);
      for (const query of [
        { sessionPlatform: 'GOOGLE_MEET' } as const,
        { sessionStartAtFrom: '2026-10-07T12:00:00.001Z' },
        { sessionStartAtTo: '2026-10-07T11:59:59.999Z' },
      ])
        expect((await feed(query)).pagination.total).toBe(0);
      const list = Presenter.presentList(await feed());
      for (const forbidden of [
        'joinUrl',
        'accessCode',
        'instructions',
        'published-secret',
      ])
        expect(JSON.stringify(list)).not.toContain(forbidden);
      expect(
        Presenter.presentDetail(await detail(p.content.id)).content.details,
      ).toMatchObject({
        joinUrl: 'https://meeting.example.test/published',
        accessCode: 'published-secret',
      });
    });
    it.each([
      'future',
      'expired',
      'wrong-audience',
      'former-enrollment',
      'cross-school',
    ] as const)(
      'never exposes Online Session capabilities for %s',
      async (variant) => {
        const p = await publish({
          type: 'ONLINE_SESSION',
          ...(variant === 'future'
            ? { visibleFrom: new Date(now.getTime() + 1) }
            : {}),
          ...(variant === 'expired' ? { visibleUntil: now } : {}),
          ...(variant === 'wrong-audience'
            ? { audience: Audience.STUDENTS }
            : {}),
        });
        if (variant === 'former-enrollment')
          await prisma.enrollment.update({
            where: { id: enrollments[0] },
            data: { status: 'WITHDRAWN' },
          });
        await deny(
          p.content.id,
          variant === 'cross-school'
            ? { ...context(), schoolId: foreignSchoolId }
            : context(),
        );
      },
    );
    it('presents Subject Resource and General Resource immutable details and safe asset metadata', async () => {
      const subject = await publish({ type: 'SUBJECT_RESOURCE' });
      const general = await publish();
      const file = await prisma.file.create({
        data: {
          schoolId,
          originalName: 'Published.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 12n,
          bucket: 'private-test',
          objectKey: randomUUID(),
        },
      });
      await prisma.academicContentRevisionAsset.create({
        data: {
          schoolId,
          revisionId: subject.revision.id,
          fileId: file.id,
          sortOrder: 0,
        },
      });
      const response = Presenter.presentDetail(
        await detail(subject.content.id),
      );
      expect(response.content.assets).toEqual([
        {
          fileId: file.id,
          originalName: 'Published.pdf',
          mimeType: 'application/pdf',
          sizeBytes: '12',
          sortOrder: 0,
        },
      ]);
      expect(response.content.details).toEqual({
        resourceCategory: 'WORKSHEET',
        curriculumId: null,
        curriculumUnitId: null,
        curriculumLessonId: null,
      });
      expect(
        Presenter.presentDetail(await detail(general.content.id)).content
          .details,
      ).toBeNull();
      for (const key of [
        'teacherSubjectAllocationId',
        'targets',
        'recipientUserId',
        'guardianId',
        'studentRecipientCount',
        'guardianRecipientContextCount',
        'bucket',
        'objectKey',
        'approvalId',
        'approvalStatus',
        'capturedByUserId',
        'identityFingerprint',
        'requestFingerprint',
        'isRead',
        'readAt',
        'viewedAt',
        'openedAt',
        'downloadedAt',
        'acknowledgedAt',
        'signedUrl',
      ])
        expect(JSON.stringify(response)).not.toContain(`"${key}"`);
    });
    it('keeps pagination complete and deterministic for tied visibility with an exact total', async () => {
      const ids: string[] = [];
      for (let index = 0; index < 25; index++)
        ids.push(
          (await publish({ title: `Published ${index}` })).publication.id,
        );
      await publish({ visibleFrom: new Date(now.getTime() + 1) });
      const first = await feed(),
        second = await feed({ page: 2 });
      expect(first.pagination).toEqual({ page: 1, limit: 20, total: 25 });
      expect(second.items).toHaveLength(5);
      expect(
        [...first.items, ...second.items].map((row) => row.publicationId),
      ).toEqual(ids.sort().reverse());
      expect(
        new Set(
          [...first.items, ...second.items].map((row) => row.publicationId),
        ).size,
      ).toBe(25);
      expect(
        (await feed({ limit: 3, page: 2 })).items.map(
          (row) => row.publicationId,
        ),
      ).toEqual(ids.slice(3, 6));
      expect((await feed({ page: 3 })).pagination.total).toBe(25);
      expect((await feed({ page: 3 })).items).toEqual([]);
    });
    it('sorts different visibility instants before applying the publication ID tie-break', async () => {
      const older = await publish({
        visibleFrom: new Date(now.getTime() - 1000),
        publishedAt: new Date(now.getTime() - 2000),
      });
      const newer = await publish();
      expect((await feed()).items.map((item) => item.publicationId)).toEqual([
        newer.publication.id,
        older.publication.id,
      ]);
    });
    it('isolates both Schools even with known content, publication and revision identifiers', async () => {
      const p = await publish();
      await deny(p.content.id, { ...context(), schoolId: foreignSchoolId });
      await expect(detail(p.publication.id)).rejects.toMatchObject({
        code: 'not_found',
      });
      await expect(detail(p.revision.id)).rejects.toMatchObject({
        code: 'not_found',
      });
      const foreign = await publish({ foreign: true, scope: Scope.SCHOOL });
      expect((await feed()).items.map((row) => row.contentId)).toEqual([
        p.content.id,
      ]);
      for (const identifier of [
        foreign.content.id,
        foreign.publication.id,
        foreign.revision.id,
      ])
        await expect(detail(identifier)).rejects.toMatchObject({
          code: 'not_found',
        });
    });
    it('resolves only the current successor after the governed revision and publication lifecycle', async () => {
      const content = await prisma.academicContent.create({
        data: {
          schoolId,
          academicYearId: yearId,
          termId,
          type: 'GENERAL_RESOURCE',
          audience: 'GUARDIANS',
          title: 'Original governed title',
          createdByUserId: users[0],
        },
      });
      await prisma.academicContentTarget.create({
        data: {
          schoolId,
          academicContentId: content.id,
          scopeType: 'CLASSROOM',
          classroomId,
          createdByUserId: users[0],
          identityFingerprint: randomBytes(32).toString('hex'),
        },
      });
      await prisma.academicContentLink.create({
        data: {
          schoolId,
          academicContentId: content.id,
          label: 'Governed resource',
          url: 'https://example.test/governed-resource',
          sortOrder: 0,
          createdByUserId: users[0],
        },
      });
      const mutations = {
        schoolId,
        contentId: content.id,
        actorId: users[0],
        organizationId,
        now,
      };
      const publications = new AcademicContentPublicationRepository(
        prisma,
        new AcademicContentRevisionRepository(prisma),
      );
      const snapshots = new AcademicContentPublicationSnapshotRepository(
        prisma,
        new AcademicContentRevisionAudienceResolver(audience),
      );
      const old = await publications.schedule({
        ...mutations,
        command: { clientRequestId: randomUUID() },
      });
      await snapshots.publishScheduledPublication({
        schoolId,
        contentId: content.id,
        publicationId: old.publicationId,
        now,
      });
      await new AcademicContentPublicationLifecycleRepository(
        prisma,
      ).startRevision({ ...mutations, publicationId: old.publicationId });
      await prisma.academicContent.update({
        where: { id: content.id },
        data: { title: 'Successor governed title' },
      });
      await expect(detail(content.id)).rejects.toMatchObject({
        code: 'not_found',
      });
      const next = await publications.schedule({
        ...mutations,
        command: { clientRequestId: randomUUID() },
      });
      await snapshots.publishScheduledPublication({
        schoolId,
        contentId: content.id,
        publicationId: next.publicationId,
        now,
      });
      const result = await detail(content.id);
      expect(result.publicationId).toBe(next.publicationId);
      expect(result.revisionId).toBe(next.revisionId);
      expect(result.revisionId).not.toBe(old.revisionId);
      expect(result.title).toBe('Successor governed title');
      const oldLink = buildDeepLink({
        sourceModule: 'ACADEMICS',
        sourceType: 'academic_content_publication',
        type: 'ACADEMIC_CONTENT_PUBLISHED',
        sourceId: old.publicationId,
        metadata: {
          academicContentId: content.id,
          publicationId: old.publicationId,
          studentIds: students,
        },
      });
      expect(oldLink).toMatchObject({
        studentId: null,
        publicationId: old.publicationId,
      });
      expect((await accessible(content.id)).publicationId).toBe(
        next.publicationId,
      );
      expect((await feed()).items.map((row) => row.publicationId)).toEqual([
        next.publicationId,
      ]);
    });
  },
);
