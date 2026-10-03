import { randomUUID } from 'node:crypto';
import {
  AcademicContentAudienceType as Audience,
  AcademicContentAudienceRecipientKind as Kind,
  AcademicContentPublicationStatus as PublicationStatus,
  AcademicContentStatus as ContentStatus,
  AcademicContentTargetScopeType as Scope,
  AcademicContentType as Type,
  StudentEnrollmentStatus as EnrollmentStatus,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { AcademicContentAudienceRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-audience.repository';
import { AcademicContentAudienceResolver } from '../../src/modules/academics/academic-content/application/academic-content-audience.resolver';
import { AcademicContentRevisionAudienceResolver } from '../../src/modules/academics/academic-content/infrastructure/academic-content-revision-audience.resolver';
import { AcademicContentPublicationSnapshotRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-publication-snapshot.repository';
import { AcademicContentPublicationRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-publication.repository';
import { AcademicContentRevisionRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-revision.repository';
import {
  AcademicContentPublicationCommand,
  academicContentRecipientIdentity,
} from '../../src/modules/academics/academic-content/domain/academic-content-publication.policy';

const url = process.env.DATABASE_URL;
const describeDatabase = url ? describe : describe.skip;
describeDatabase(
  'ACC-7C PostgreSQL revision audience publication snapshot',
  () => {
    jest.setTimeout(120_000);
    const prisma = new PrismaService({
      datasourceUrl: url ?? 'postgresql://unused:unused@127.0.0.1:1/unused',
    });
    const secondUrl = new URL(
      url ?? 'postgresql://unused:unused@127.0.0.1:1/unused',
    );
    const applicationName = `acc7c-second-${randomUUID()}`;
    secondUrl.searchParams.set('application_name', applicationName);
    const second = new PrismaService({
      datasourceUrl: secondUrl.toString(),
    });
    const intentRepo = (client = prisma) =>
      new AcademicContentPublicationRepository(
        client,
        new AcademicContentRevisionRepository(client),
      );
    const revisionResolver = (client = prisma) =>
      new AcademicContentRevisionAudienceResolver(
        new AcademicContentAudienceRepository(client),
      );
    const snapshotRepo = (client = prisma) =>
      new AcademicContentPublicationSnapshotRepository(
        client,
        revisionResolver(client),
      );
    const now = new Date('2026-10-03T12:00:00Z');
    const schools: string[] = [],
      users: string[] = [];
    let organizationId: string, actorId: string;
    const action = 'academics.academic_content.publication.publish';

    async function fixture(
      audience: Audience = Audience.STUDENTS_AND_GUARDIANS,
      scopes: Scope[] = [Scope.CLASSROOM],
      qualified = false,
    ) {
      const suffix = randomUUID();
      const schoolId = (
        await prisma.school.create({
          data: {
            organizationId,
            name: `ACC7C ${suffix}`,
            slug: `acc7c-${suffix}`,
          },
        })
      ).id;
      schools.push(schoolId);
      const academicYearId = (
        await prisma.academicYear.create({
          data: {
            schoolId,
            nameAr: 'سنة',
            nameEn: 'Year',
            startDate: new Date('2026-01-01'),
            endDate: new Date('2027-12-31'),
          },
        })
      ).id;
      const termId = (
        await prisma.term.create({
          data: {
            schoolId,
            academicYearId,
            nameAr: 'فصل',
            nameEn: 'Term',
            startDate: new Date('2026-10-01'),
            endDate: new Date('2026-10-31'),
            isActive: true,
          },
        })
      ).id;
      const stageId = (
        await prisma.stage.create({
          data: { schoolId, nameAr: 'مرحلة', nameEn: 'Stage' },
        })
      ).id;
      const gradeId = (
        await prisma.grade.create({
          data: { schoolId, stageId, nameAr: 'صف', nameEn: 'Grade' },
        })
      ).id;
      const sectionId = (
        await prisma.section.create({
          data: { schoolId, gradeId, nameAr: 'قسم', nameEn: 'Section' },
        })
      ).id;
      const classroomId = (
        await prisma.classroom.create({
          data: { schoolId, sectionId, nameAr: 'فصل', nameEn: 'Classroom' },
        })
      ).id;
      const subjectId = (
        await prisma.subject.create({
          data: { schoolId, nameAr: 'موضوع', nameEn: 'Subject' },
        })
      ).id;
      const allocation = await prisma.subjectAllocation.create({
        data: {
          schoolId,
          academicYearId,
          termId,
          gradeId,
          subjectId,
          weeklyHours: 1,
        },
      });
      const content = await prisma.academicContent.create({
        data: {
          schoolId,
          academicYearId,
          termId,
          type: Type.GENERAL_RESOURCE,
          audience,
          title: `ACC7C ${suffix}`,
          description: 'Frozen resource',
          createdByUserId: actorId,
        },
      });
      const targets = await Promise.all(
        scopes.map((scopeType) =>
          prisma.academicContentTarget.create({
            data: {
              schoolId,
              academicContentId: content.id,
              scopeType,
              subjectId: qualified ? subjectId : null,
              stageId: scopeType === Scope.STAGE ? stageId : null,
              gradeId: scopeType === Scope.GRADE ? gradeId : null,
              sectionId: scopeType === Scope.SECTION ? sectionId : null,
              classroomId: scopeType === Scope.CLASSROOM ? classroomId : null,
              identityFingerprint: randomUUID().replace(/-/g, ''),
              createdByUserId: actorId,
            },
          }),
        ),
      );
      return {
        schoolId,
        academicYearId,
        termId,
        stageId,
        gradeId,
        sectionId,
        classroomId,
        subjectId,
        allocation,
        content,
        targets,
      };
    }
    type Fixture = Awaited<ReturnType<typeof fixture>>;
    const mutation = (f: Fixture) => ({
      schoolId: f.schoolId,
      contentId: f.content.id,
      organizationId,
      actorId,
      now,
    });
    const schedule = (
      f: Fixture,
      command: AcademicContentPublicationCommand = {
        clientRequestId: randomUUID(),
      },
    ) => intentRepo().schedule({ ...mutation(f), command });
    type Publication = Awaited<ReturnType<typeof schedule>>;
    const execute = (
      f: Fixture,
      p: Publication,
      client = prisma,
      instant = now,
    ) =>
      snapshotRepo(client).publishScheduledPublication({
        schoolId: f.schoolId,
        contentId: f.content.id,
        publicationId: p.publicationId,
        now: instant,
      });
    async function addStudent(f: Fixture, account = false) {
      let userId: string | null = null;
      if (account) {
        userId = (
          await prisma.user.create({
            data: {
              email: `acc7c-${randomUUID()}@example.test`,
              firstName: 'Student',
              lastName: 'Account',
              userType: UserType.STUDENT,
            },
          })
        ).id;
        users.push(userId);
      }
      const student = await prisma.student.create({
        data: {
          schoolId: f.schoolId,
          organizationId,
          firstName: 'Student',
          lastName: randomUUID(),
          userId,
        },
      });
      const enrollment = await prisma.enrollment.create({
        data: {
          schoolId: f.schoolId,
          studentId: student.id,
          enrolledAt: now,
          academicYearId: f.academicYearId,
          termId: f.termId,
          classroomId: f.classroomId,
        },
      });
      return { student, enrollment };
    }
    type Child = Awaited<ReturnType<typeof addStudent>>;
    async function addGuardian(
      f: Fixture,
      children: Child[],
      preference: boolean | null = false,
      account = false,
    ) {
      let userId: string | null = null;
      if (account) {
        userId = (
          await prisma.user.create({
            data: {
              email: `acc7c-${randomUUID()}@example.test`,
              firstName: 'Guardian',
              lastName: 'Account',
              userType: UserType.PARENT,
            },
          })
        ).id;
        users.push(userId);
      }
      const guardian = await prisma.guardian.create({
        data: {
          schoolId: f.schoolId,
          organizationId,
          firstName: 'Guardian',
          lastName: randomUUID(),
          phone: 'test-phone',
          relation: 'parent',
          userId,
          canReceiveNotifications: preference,
        },
      });
      await prisma.studentGuardian.createMany({
        data: children.map((child) => ({
          schoolId: f.schoolId,
          studentId: child.student.id,
          guardianId: guardian.id,
        })),
      });
      return guardian;
    }
    const resolve = (f: Fixture, p: Publication, client = prisma) =>
      client.$transaction((tx) =>
        revisionResolver(client).resolve(tx, {
          schoolId: f.schoolId,
          contentId: f.content.id,
          revisionId: p.revisionId,
        }),
      );
    async function state(f: Fixture, p: Publication) {
      const [content, publication, recipients, audits] = await Promise.all([
        prisma.academicContent.findUniqueOrThrow({
          where: { id: f.content.id },
        }),
        prisma.academicContentPublication.findUniqueOrThrow({
          where: { id: p.publicationId },
        }),
        prisma.academicContentAudienceRecipient.findMany({
          where: { schoolId: f.schoolId, publicationId: p.publicationId },
          orderBy: { id: 'asc' },
          include: { targets: { orderBy: { id: 'asc' } } },
        }),
        prisma.auditLog.findMany({
          where: { schoolId: f.schoolId, action, resourceId: p.publicationId },
          orderBy: { id: 'asc' },
        }),
      ]);
      return { content, publication, recipients, audits };
    }
    function deferred() {
      let resolve!: () => void;
      const promise = new Promise<void>((done) => {
        resolve = done;
      });
      return { promise, resolve };
    }
    async function waitForParentLock() {
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        const blocked = await prisma.$queryRaw<Array<{ waiting: boolean }>>`
        SELECT (wait_event_type = 'Lock' AND cardinality(pg_blocking_pids(pid)) > 0) AS waiting
        FROM pg_stat_activity WHERE application_name = ${applicationName}
          AND query LIKE '%academic_contents%' AND query LIKE '%FOR UPDATE%'`;
        if (blocked.some((row) => row.waiting)) return;
        await new Promise((done) => setTimeout(done, 20));
      }
      throw new Error('Second PostgreSQL connection did not wait on Content');
    }
    beforeAll(async () => {
      await Promise.all([prisma.$connect(), second.$connect()]);
      const suffix = randomUUID();
      organizationId = (
        await prisma.organization.create({
          data: { name: `ACC7C ${suffix}`, slug: `acc7c-${suffix}` },
        })
      ).id;
      actorId = (
        await prisma.user.create({
          data: {
            email: `acc7c-${suffix}@example.test`,
            firstName: 'ACC',
            lastName: 'Author',
            userType: UserType.SCHOOL_USER,
          },
        })
      ).id;
      users.push(actorId);
    });
    afterAll(async () => {
      try {
        const where = { schoolId: { in: schools } };
        await prisma.academicContentAudienceRecipientTarget.deleteMany({
          where,
        });
        await prisma.academicContentAudienceRecipient.deleteMany({ where });
        await prisma.academicContentPublication.deleteMany({ where });
        await prisma.academicContentApproval.deleteMany({ where });
        await prisma.academicContentRevisionTarget.deleteMany({ where });
        await prisma.academicContentRevisionAsset.deleteMany({ where });
        await prisma.academicContentRevisionLink.deleteMany({ where });
        await prisma.academicContentRevisionTag.deleteMany({ where });
        await prisma.academicContentRevision.deleteMany({ where });
        await prisma.academicContentTarget.deleteMany({ where });
        await prisma.academicContent.deleteMany({ where });
        await prisma.auditLog.deleteMany({ where });
        await prisma.studentGuardian.deleteMany({ where });
        await prisma.enrollment.deleteMany({ where });
        await prisma.guardian.deleteMany({ where });
        await prisma.student.deleteMany({ where });
        await prisma.subjectAllocation.deleteMany({ where });
        await prisma.subject.deleteMany({ where });
        await prisma.classroom.deleteMany({ where });
        await prisma.section.deleteMany({ where });
        await prisma.grade.deleteMany({ where });
        await prisma.stage.deleteMany({ where });
        await prisma.term.deleteMany({ where });
        await prisma.academicYear.deleteMany({ where });
        await prisma.school.deleteMany({ where: { id: { in: schools } } });
        await prisma.organization.delete({ where: { id: organizationId } });
        await prisma.user.deleteMany({ where: { id: { in: users } } });
      } finally {
        await Promise.all([prisma.$disconnect(), second.$disconnect()]);
      }
    });

    it.each([
      Audience.STUDENTS,
      Audience.GUARDIANS,
      Audience.STUDENTS_AND_GUARDIANS,
    ])(
      'preserves ACC-2 business parity for %s with different raw target IDs',
      async (audience) => {
        const f = await fixture(audience, Object.values(Scope), true);
        const a = await addStudent(f),
          b = await addStudent(f, true);
        await addGuardian(f, [a, b], false, true);
        const current = await new AcademicContentAudienceResolver(
          new AcademicContentAudienceRepository(prisma),
        ).resolve(f.content.id, f.schoolId);
        const p = await schedule(f);
        const frozen = await resolve(f, p);
        const frozenTargets =
          await prisma.academicContentRevisionTarget.findMany({
            where: { schoolId: f.schoolId, revisionId: p.revisionId },
          });
        expect(frozenTargets).toHaveLength(5);
        expect(
          frozenTargets.every(
            (t) =>
              !f.targets.some((currentTarget) => currentTarget.id === t.id),
          ),
        ).toBe(true);
        const semantic = (
          targetIds: string[],
          targets: { id: string; identityFingerprint: string }[],
        ) =>
          targetIds
            .map((id) => targets.find((t) => t.id === id)!.identityFingerprint)
            .sort();
        expect(
          frozen.students.map(
            ({ recipientUserId, matchedRevisionTargetIds, ...row }) => ({
              ...row,
              studentUserId: recipientUserId,
              targets: semantic(matchedRevisionTargetIds, frozenTargets),
            }),
          ),
        ).toEqual(
          current.students.map(({ matchedTargetIds, ...row }) => ({
            ...row,
            targets: semantic(matchedTargetIds, f.targets),
          })),
        );
        expect(
          frozen.guardians.map(
            ({
              classroomId,
              guardianCanReceiveNotifications,
              matchedRevisionTargetIds,
              ...row
            }) => ({
              ...row,
              canReceiveNotifications: guardianCanReceiveNotifications,
              targets: semantic(matchedRevisionTargetIds, frozenTargets),
              classroomId,
            }),
          ),
        ).toEqual(
          current.guardians.map(({ matchedTargetIds, ...row }) => ({
            ...row,
            targets: semantic(matchedTargetIds, f.targets),
            classroomId: f.classroomId,
          })),
        );
        for (const row of [...frozen.students, ...frozen.guardians])
          expect(new Set(row.matchedRevisionTargetIds).size).toBe(5);
      },
    );

    it.each([
      'enrollment-status',
      'enrollment-deleted',
      'student-status',
      'student-deleted',
      'classroom-deleted',
      'section-deleted',
      'grade-deleted',
      'stage-deleted',
      'wrong-term',
      'wrong-year',
      'zero-hours',
      'deleted-allocation',
    ])(
      'retains live eligibility rule %s inside the explicit transaction',
      async (rule) => {
        const f = await fixture(Audience.STUDENTS, [Scope.SCHOOL], true);
        const a = await addStudent(f);
        const p = await schedule(f);
        expect((await resolve(f, p)).students).toHaveLength(1);
        if (rule === 'enrollment-status')
          await prisma.enrollment.update({
            where: { id: a.enrollment.id },
            data: { status: EnrollmentStatus.WITHDRAWN },
          });
        if (rule === 'enrollment-deleted')
          await prisma.enrollment.update({
            where: { id: a.enrollment.id },
            data: { deletedAt: now },
          });
        if (rule === 'student-status')
          await prisma.student.update({
            where: { id: a.student.id },
            data: { status: 'WITHDRAWN' },
          });
        if (rule === 'student-deleted')
          await prisma.student.update({
            where: { id: a.student.id },
            data: { deletedAt: now },
          });
        if (rule === 'classroom-deleted')
          await prisma.classroom.update({
            where: { id: f.classroomId },
            data: { deletedAt: now },
          });
        if (rule === 'section-deleted')
          await prisma.section.update({
            where: { id: f.sectionId },
            data: { deletedAt: now },
          });
        if (rule === 'grade-deleted')
          await prisma.grade.update({
            where: { id: f.gradeId },
            data: { deletedAt: now },
          });
        if (rule === 'stage-deleted')
          await prisma.stage.update({
            where: { id: f.stageId },
            data: { deletedAt: now },
          });
        if (rule === 'wrong-term')
          await prisma.enrollment.update({
            where: { id: a.enrollment.id },
            data: { termId: null },
          });
        if (rule === 'wrong-year') {
          const year = await prisma.academicYear.create({
            data: {
              schoolId: f.schoolId,
              nameAr: 'آخر',
              nameEn: 'Other',
              startDate: new Date('2027-01-01'),
              endDate: new Date('2027-12-31'),
            },
          });
          await prisma.enrollment.update({
            where: { id: a.enrollment.id },
            data: { academicYearId: year.id, termId: null },
          });
        }
        if (rule === 'zero-hours')
          await prisma.subjectAllocation.update({
            where: { id: f.allocation.id },
            data: { weeklyHours: 0 },
          });
        if (rule === 'deleted-allocation')
          await prisma.subjectAllocation.update({
            where: { id: f.allocation.id },
            data: { deletedAt: now },
          });
        expect((await resolve(f, p)).students).toEqual([]);
      },
    );
    it('uses frozen targets, year, term, type and audience despite mutable authoring changes', async () => {
      const f = await fixture();
      const a = await addStudent(f);
      await addGuardian(f, [a]);
      const p = await schedule(f);
      const otherYear = await prisma.academicYear.create({
        data: {
          schoolId: f.schoolId,
          nameAr: 'آخر',
          nameEn: 'Other',
          startDate: new Date('2027-01-01'),
          endDate: new Date('2027-12-31'),
        },
      });
      const otherTerm = await prisma.term.create({
        data: {
          schoolId: f.schoolId,
          academicYearId: otherYear.id,
          nameAr: 'آخر',
          nameEn: 'Other',
          startDate: new Date('2027-01-01'),
          endDate: new Date('2027-01-31'),
        },
      });
      await prisma.academicContentTarget.deleteMany({
        where: { academicContentId: f.content.id, schoolId: f.schoolId },
      });
      await prisma.academicContent.update({
        where: { id: f.content.id },
        data: {
          academicYearId: otherYear.id,
          termId: otherTerm.id,
          type: Type.TEACHER_PREPARATION,
          audience: Audience.INTERNAL_STAFF,
        },
      });
      const guarded = prisma.$extends({
        query: {
          academicContentTarget: {
            findMany() {
              throw new Error('Mutable publication targets accessed');
            },
          },
        },
      }) as unknown as PrismaService;
      expect(await execute(f, p, guarded)).toMatchObject({
        outcome: 'PUBLISHED',
        studentRecipientCount: 1,
        guardianRecipientContextCount: 1,
      });
    });
    it.each([false, null])(
      'publishes nullable account contexts and preserves preference %s plus exact target attribution',
      async (preference) => {
        const f = await fixture(Audience.STUDENTS_AND_GUARDIANS, [
          Scope.SCHOOL,
          Scope.CLASSROOM,
        ]);
        const a = await addStudent(f),
          b = await addStudent(f);
        const guardian = await addGuardian(f, [a, b], preference);
        const p = await schedule(f);
        const result = await execute(f, p),
          saved = await state(f, p);
        expect(result).toMatchObject({
          outcome: 'PUBLISHED',
          publishedAt: now,
          studentRecipientCount: 2,
          guardianRecipientContextCount: 2,
        });
        expect(saved.content).toMatchObject({
          status: ContentStatus.PUBLISHED,
          updatedByUserId: null,
        });
        expect(saved.publication).toMatchObject({
          status: PublicationStatus.PUBLISHED,
          publishedAt: now,
        });
        expect(saved.recipients).toHaveLength(4);
        expect(saved.publication.studentRecipientCount).toBe(
          saved.recipients.filter((r) => r.recipientKind === Kind.STUDENT)
            .length,
        );
        expect(saved.publication.guardianRecipientContextCount).toBe(
          saved.recipients.filter((r) => r.recipientKind === Kind.GUARDIAN)
            .length,
        );
        expect(
          saved.recipients
            .filter((r) => r.recipientKind === Kind.GUARDIAN)
            .map((r) => r.guardianId),
        ).toEqual([guardian.id, guardian.id]);
        const targetIds = (
          await prisma.academicContentRevisionTarget.findMany({
            where: { revisionId: p.revisionId },
          })
        )
          .map((t) => t.id)
          .sort();
        for (const r of saved.recipients) {
          expect(r.recipientUserId).toBeNull();
          expect(r.guardianCanReceiveNotifications).toBe(
            r.recipientKind === Kind.GUARDIAN ? preference : null,
          );
          expect(r.targets.map((t) => t.revisionTargetId).sort()).toEqual(
            targetIds,
          );
          expect(r.identityFingerprint).toBe(
            academicContentRecipientIdentity(
              r.recipientKind === Kind.STUDENT
                ? { recipientKind: Kind.STUDENT, enrollmentId: r.enrollmentId }
                : {
                    recipientKind: Kind.GUARDIAN,
                    enrollmentId: r.enrollmentId,
                    studentId: r.studentId,
                    guardianId: r.guardianId!,
                  },
            ).identityFingerprint,
          );
          expect(r.classroomId).toBe(f.classroomId);
        }
        expect(saved.audits).toHaveLength(1);
        expect(saved.audits[0]).toMatchObject({
          actorId: null,
          userType: UserType.SERVICE_ACCOUNT,
          organizationId,
          schoolId: f.schoolId,
          module: 'academic-content',
          action,
          outcome: 'SUCCESS',
          resourceId: p.publicationId,
        });
        expect(saved.audits[0].after).toEqual({
          contentId: f.content.id,
          publicationId: p.publicationId,
          revisionId: p.revisionId,
          status: 'PUBLISHED',
          publishedAt: now.toISOString(),
          publishAt: p.publishAt.toISOString(),
          visibleFrom: p.visibleFrom.toISOString(),
          visibleUntil: null,
          studentRecipientCount: 2,
          guardianRecipientContextCount: 2,
        });
        expect(Object.keys(result).sort()).toEqual(
          [
            'outcome',
            'publicationId',
            'revisionId',
            'status',
            'publishedAt',
            'studentRecipientCount',
            'guardianRecipientContextCount',
          ].sort(),
        );
      },
    );
    it('includes a late eligible student before publishing, then keeps all snapshot fields immutable after relationship and account changes', async () => {
      const f = await fixture();
      const a = await addStudent(f, true);
      const guardian = await addGuardian(f, [a], false, true);
      const p = await schedule(f);
      const b = await addStudent(f);
      await prisma.studentGuardian.create({
        data: {
          schoolId: f.schoolId,
          studentId: b.student.id,
          guardianId: guardian.id,
        },
      });
      expect(await execute(f, p)).toMatchObject({
        studentRecipientCount: 2,
        guardianRecipientContextCount: 2,
      });
      const original = await state(f, p);
      const metadata = JSON.stringify(original.audits[0].after);
      for (const forbidden of [
        'studentId',
        'guardianId',
        'recipientUserId',
        'enrollmentId',
        'recipients',
        'storage',
        'joinUrl',
      ])
        expect(metadata).not.toContain(forbidden);
      for (const id of [
        a.student.id,
        b.student.id,
        guardian.id,
        a.enrollment.id,
        b.enrollment.id,
      ])
        expect(metadata).not.toContain(id);
      const guardianRows = original.recipients.filter(
        (r) => r.recipientKind === Kind.GUARDIAN,
      );
      expect(guardianRows).toHaveLength(2);
      expect(new Set(guardianRows.map((r) => r.identityFingerprint)).size).toBe(
        2,
      );
      expect(new Set(guardianRows.map((r) => r.recipientUserId))).toEqual(
        new Set([guardian.userId]),
      );
      const late = await addStudent(f);
      await addGuardian(f, [late], true);
      await second.$transaction(async (tx) => {
        await tx.enrollment.updateMany({
          where: { schoolId: f.schoolId },
          data: { status: EnrollmentStatus.WITHDRAWN },
        });
        await tx.studentGuardian.deleteMany({
          where: { schoolId: f.schoolId, guardianId: guardian.id },
        });
        await tx.guardian.update({
          where: { id: guardian.id },
          data: { canReceiveNotifications: true, userId: null },
        });
        await tx.student.update({
          where: { id: a.student.id },
          data: { userId: null },
        });
      });
      const guarded = prisma.$extends({
        query: {
          enrollment: {
            findMany() {
              throw new Error('Retry refreshed eligibility');
            },
          },
          studentGuardian: {
            findMany() {
              throw new Error('Retry refreshed guardian links');
            },
          },
        },
      }) as unknown as PrismaService;
      expect(
        await execute(f, p, guarded, new Date(now.getTime() + 5000)),
      ).toMatchObject({
        outcome: 'ALREADY_PUBLISHED',
        publishedAt: now,
        studentRecipientCount: 2,
        guardianRecipientContextCount: 2,
      });
      expect(await state(f, p)).toEqual(original);
      expect(
        original.recipients
          .filter((r) => r.recipientKind === Kind.GUARDIAN)
          .every(
            (r) =>
              r.recipientUserId === guardian.userId &&
              r.guardianCanReceiveNotifications === false,
          ),
      ).toBe(true);
    });
    it('fails closed without any snapshot or lifecycle mutation when frozen Revision Targets are missing', async () => {
      const f = await fixture();
      const child = await addStudent(f);
      await addGuardian(f, [child]);
      const p = await schedule(f);
      await prisma.academicContentRevisionTarget.deleteMany({
        where: { schoolId: f.schoolId, revisionId: p.revisionId },
      });
      const original = await state(f, p);
      await expect(execute(f, p)).rejects.toMatchObject({
        code: 'academic_content.publication.snapshot_conflict',
      });
      const saved = await state(f, p);
      expect(saved).toEqual(original);
      expect(saved.content.status).toBe('SCHEDULED');
      expect(saved.publication).toMatchObject({
        status: 'SCHEDULED',
        publishedAt: null,
        studentRecipientCount: 0,
        guardianRecipientContextCount: 0,
      });
      expect(saved.recipients).toEqual([]);
      expect(saved.audits).toEqual([]);
      expect(
        await prisma.academicContentAudienceRecipientTarget.count({
          where: { schoolId: f.schoolId, revisionId: p.revisionId },
        }),
      ).toBe(0);
    });
    it('publishes a valid zero-audience snapshot with zero counts, zero joins and one audit', async () => {
      const f = await fixture();
      const p = await schedule(f);
      expect(
        await prisma.academicContentRevisionTarget.count({
          where: { schoolId: f.schoolId, revisionId: p.revisionId },
        }),
      ).toBeGreaterThan(0);
      expect(await execute(f, p)).toMatchObject({
        outcome: 'PUBLISHED',
        studentRecipientCount: 0,
        guardianRecipientContextCount: 0,
      });
      const saved = await state(f, p);
      expect(saved.content.status).toBe('PUBLISHED');
      expect(saved.recipients).toEqual([]);
      expect(saved.audits).toHaveLength(1);
      expect(await execute(f, p)).toMatchObject({
        outcome: 'ALREADY_PUBLISHED',
      });
      expect(await state(f, p)).toEqual(saved);
    });
    it.each(['future', 'missed', 'cancelled', 'expired'])(
      'returns %s without any snapshot, lifecycle or audit mutation',
      async (mode) => {
        const f = await fixture();
        await addStudent(f);
        const later = new Date(now.getTime() + 3600000);
        const p = await schedule(f, {
          clientRequestId: randomUUID(),
          ...(mode === 'future' ? { publishAt: later } : {}),
          ...(mode === 'missed' ? { visibleUntil: later } : {}),
        });
        if (mode === 'cancelled')
          await intentRepo().unschedule({
            ...mutation(f),
            publicationId: p.publicationId,
          });
        if (mode === 'expired')
          await prisma.academicContentPublication.update({
            where: { id: p.publicationId },
            data: { status: 'EXPIRED', expiredAt: now },
          });
        const original = await state(f, p);
        expect(
          await execute(
            f,
            p,
            prisma,
            mode === 'missed' ? new Date(later.getTime() + 1) : now,
          ),
        ).toMatchObject({
          outcome:
            mode === 'future'
              ? 'NOT_DUE'
              : mode === 'missed'
                ? 'MISSED_VISIBILITY_WINDOW'
                : 'TERMINAL_NOOP',
        });
        expect(await state(f, p)).toEqual(original);
      },
    );
    it.each(['recipient', 'target', 'publication', 'content', 'audit'])(
      'rolls back recipients, joins, both statuses and audit after %s failure',
      async (step) => {
        const f = await fixture();
        const a = await addStudent(f);
        await addGuardian(f, [a]);
        const p = await schedule(f);
        const original = await state(f, p);
        const failed = prisma.$extends({
          query: {
            academicContentAudienceRecipient: {
              createMany({ args, query }) {
                if (step === 'recipient') throw new Error('injected');
                return query(args);
              },
            },
            academicContentAudienceRecipientTarget: {
              createMany({ args, query }) {
                if (step === 'target') throw new Error('injected');
                return query(args);
              },
            },
            academicContentPublication: {
              updateMany({ args, query }) {
                if (step === 'publication' && args.data.status === 'PUBLISHED')
                  throw new Error('injected');
                return query(args);
              },
            },
            academicContent: {
              updateMany({ args, query }) {
                if (step === 'content' && args.data.status === 'PUBLISHED')
                  throw new Error('injected');
                return query(args);
              },
            },
            auditLog: {
              create({ args, query }) {
                if (step === 'audit' && args.data.action === action)
                  throw new Error('injected');
                return query(args);
              },
            },
          },
        }) as unknown as PrismaService;
        await expect(execute(f, p, failed)).rejects.toThrow('injected');
        expect(await state(f, p)).toEqual(original);
      },
    );
    it('rejects wrong school, missing/deleted parent and wrong content/publication pairs without disclosing recipients', async () => {
      const f = await fixture(),
        other = await fixture();
      await addStudent(f);
      await addStudent(other);
      const p = await schedule(f),
        q = await schedule(other);
      const before = await state(f, p),
        otherBefore = await state(other, q);
      const repo = snapshotRepo();
      for (const input of [
        {
          schoolId: other.schoolId,
          contentId: f.content.id,
          publicationId: p.publicationId,
        },
        {
          schoolId: f.schoolId,
          contentId: randomUUID(),
          publicationId: p.publicationId,
        },
        {
          schoolId: f.schoolId,
          contentId: f.content.id,
          publicationId: q.publicationId,
        },
        {
          schoolId: f.schoolId,
          contentId: f.content.id,
          publicationId: randomUUID(),
        },
      ])
        await expect(
          repo.publishScheduledPublication({ ...input, now }),
        ).rejects.toMatchObject({ code: 'not_found' });
      expect(await state(f, p)).toEqual(before);
      expect(await state(other, q)).toEqual(otherBefore);
      await prisma.academicContent.update({
        where: { id: f.content.id },
        data: { deletedAt: now },
      });
      const deleted = await state(f, p);
      await expect(execute(f, p)).rejects.toMatchObject({ code: 'not_found' });
      expect(await state(f, p)).toEqual(deleted);
    });
    it('rejects wrong revision identity and non-V2 revision before persistence', async () => {
      const f = await fixture(),
        other = await fixture();
      const p = await schedule(f),
        q = await schedule(other);
      await expect(
        prisma.$transaction((tx) =>
          revisionResolver().resolve(tx, {
            schoolId: f.schoolId,
            contentId: f.content.id,
            revisionId: q.revisionId,
          }),
        ),
      ).rejects.toMatchObject({ code: 'not_found' });
      await prisma.academicContentRevision.update({
        where: { id: p.revisionId },
        data: { snapshotContractVersion: 1 },
      });
      const original = await state(f, p);
      await expect(execute(f, p)).rejects.toMatchObject({ code: 'not_found' });
      expect(await state(f, p)).toEqual(original);
    });
    it.each([Type.GENERAL_RESOURCE, Type.TEACHER_PREPARATION])(
      'fails closed for an externally invalid historical %s Revision',
      async (type) => {
        const f = await fixture();
        await addStudent(f);
        const p = await schedule(f);
        await prisma.academicContentRevision.update({
          where: { id: p.revisionId },
          data: { type, audience: Audience.INTERNAL_STAFF },
        });
        const original = await state(f, p);
        await expect(execute(f, p)).rejects.toMatchObject({
          code: 'academic_content.publication.audience_unavailable',
        });
        expect(await state(f, p)).toEqual(original);
      },
    );
    it('uses database backstops for a wrong-content revision and target from another revision', async () => {
      const f = await fixture();
      await addStudent(f);
      const p = await schedule(f);
      const secondContent = await prisma.academicContent.create({
        data: {
          schoolId: f.schoolId,
          academicYearId: f.academicYearId,
          termId: f.termId,
          type: Type.GENERAL_RESOURCE,
          audience: Audience.STUDENTS,
          title: 'Other',
          createdByUserId: actorId,
        },
      });
      await prisma.academicContentTarget.create({
        data: {
          schoolId: f.schoolId,
          academicContentId: secondContent.id,
          scopeType: Scope.SCHOOL,
          identityFingerprint: randomUUID().replace(/-/g, ''),
          createdByUserId: actorId,
        },
      });
      const q = await intentRepo().schedule({
        ...mutation(f),
        contentId: secondContent.id,
        command: { clientRequestId: randomUUID() },
      });
      await expect(
        snapshotRepo().publishScheduledPublication({
          schoolId: f.schoolId,
          contentId: f.content.id,
          publicationId: q.publicationId,
          now,
        }),
      ).rejects.toMatchObject({ code: 'not_found' });
      await expect(
        prisma.$transaction((tx) =>
          revisionResolver().resolve(tx, {
            schoolId: f.schoolId,
            contentId: f.content.id,
            revisionId: q.revisionId,
          }),
        ),
      ).rejects.toMatchObject({ code: 'not_found' });
      await expect(
        prisma.academicContentPublication.update({
          where: { id: p.publicationId },
          data: { revisionId: q.revisionId },
        }),
      ).rejects.toMatchObject({ code: 'P2003' });
      const otherTarget =
        await prisma.academicContentRevisionTarget.findFirstOrThrow({
          where: { revisionId: q.revisionId },
        });
      const corrupted = prisma.$extends({
        query: {
          academicContentAudienceRecipientTarget: {
            createMany({ args, query }) {
              const rows = Array.isArray(args.data) ? args.data : [args.data];
              return query({
                ...args,
                data: rows.map((row) => ({
                  ...row,
                  revisionTargetId: otherTarget.id,
                })),
              });
            },
          },
        },
      }) as unknown as PrismaService;
      const original = await state(f, p);
      await expect(execute(f, p, corrupted)).rejects.toMatchObject({
        code: 'P2003',
      });
      expect(await state(f, p)).toEqual(original);
    });
    it('rejects inconsistent published counts and missing historical target attribution without repairing rows', async () => {
      const f = await fixture();
      await addStudent(f);
      const p = await schedule(f);
      await execute(f, p);
      await prisma.academicContentPublication.update({
        where: { id: p.publicationId },
        data: { studentRecipientCount: 2 },
      });
      const wrongCount = await state(f, p);
      await expect(execute(f, p)).rejects.toMatchObject({
        code: 'academic_content.publication.snapshot_conflict',
      });
      expect(await state(f, p)).toEqual(wrongCount);
      await prisma.academicContentPublication.update({
        where: { id: p.publicationId },
        data: { studentRecipientCount: 1 },
      });
      await prisma.academicContentAudienceRecipientTarget.deleteMany({
        where: {
          schoolId: f.schoolId,
          recipient: { publicationId: p.publicationId },
        },
      });
      const unattributed = await state(f, p);
      await expect(execute(f, p)).rejects.toMatchObject({
        code: 'academic_content.publication.snapshot_conflict',
      });
      expect(await state(f, p)).toEqual(unattributed);
    });
    it('uses tenant and lifecycle predicates on both final writes and locks Content before exact Publication', async () => {
      const f = await fixture();
      await addStudent(f);
      const p = await schedule(f);
      const locks: string[] = [];
      const guarded = prisma.$extends({
        query: {
          $queryRaw({ args, query }) {
            const sql = 'strings' in args ? args.strings.join('') : '';
            locks.push(sql);
            return query(args) as Promise<unknown>;
          },
          academicContentPublication: {
            updateMany({ args, query }) {
              expect(args.where).toEqual({
                id: p.publicationId,
                schoolId: f.schoolId,
                academicContentId: f.content.id,
                revisionId: p.revisionId,
                status: 'SCHEDULED',
              });
              return query(args);
            },
          },
          academicContent: {
            updateMany({ args, query }) {
              expect(args.where).toEqual({
                id: f.content.id,
                schoolId: f.schoolId,
                deletedAt: null,
                status: 'SCHEDULED',
              });
              return query(args);
            },
          },
        },
      }) as unknown as PrismaService;
      await execute(f, p, guarded);
      expect(locks[0]).toContain('FROM academic_contents');
      expect(locks[0]).toContain('deleted_at IS NULL FOR UPDATE');
      expect(locks[1]).toContain('FROM academic_content_publications');
      expect(locks[1]).toContain('academic_content_id');
    });
    it('takes a coherent RepeatableRead audience across two committed connections', async () => {
      const f = await fixture(
        Audience.STUDENTS_AND_GUARDIANS,
        [Scope.CLASSROOM],
        true,
      );
      const a = await addStudent(f),
        b = await addStudent(f);
      await prisma.enrollment.update({
        where: { id: b.enrollment.id },
        data: { status: EnrollmentStatus.WITHDRAWN },
      });
      const guardian = await addGuardian(f, [a], false);
      const p = await schedule(f);
      const reached = deferred(),
        resume = deferred();
      let paused = false;
      const pausedClient = prisma.$extends({
        query: {
          enrollment: {
            async findMany({ args, query }) {
              const rows = await query(args);
              if (!paused) {
                paused = true;
                reached.resolve();
                await resume.promise;
              }
              return rows;
            },
          },
        },
      }) as unknown as PrismaService;
      const running = execute(f, p, pausedClient);
      try {
        await reached.promise;
        await second.$transaction(async (tx) => {
          await tx.enrollment.update({
            where: { id: a.enrollment.id },
            data: { status: EnrollmentStatus.WITHDRAWN },
          });
          await tx.enrollment.update({
            where: { id: b.enrollment.id },
            data: { status: EnrollmentStatus.ACTIVE },
          });
          await tx.studentGuardian.deleteMany({
            where: { schoolId: f.schoolId, guardianId: guardian.id },
          });
          await tx.studentGuardian.create({
            data: {
              schoolId: f.schoolId,
              studentId: b.student.id,
              guardianId: guardian.id,
            },
          });
          await tx.guardian.update({
            where: { id: guardian.id },
            data: { canReceiveNotifications: true },
          });
          await tx.subjectAllocation.update({
            where: { id: f.allocation.id },
            data: { weeklyHours: 0 },
          });
        });
      } finally {
        resume.resolve();
      }
      await running;
      const saved = await state(f, p);
      const students = saved.recipients.filter(
          (r) => r.recipientKind === Kind.STUDENT,
        ),
        guardians = saved.recipients.filter(
          (r) => r.recipientKind === Kind.GUARDIAN,
        );
      expect(students).toHaveLength(1);
      expect(guardians).toHaveLength(1);
      expect(students[0].studentId).toBe(a.student.id);
      expect(guardians[0]).toMatchObject({
        studentId: a.student.id,
        enrollmentId: a.enrollment.id,
        guardianCanReceiveNotifications: false,
      });
    });
    it.each(['publish', 'unschedule'])(
      'serializes publish versus unschedule with %s winning and no partial mixed state',
      async (winner) => {
        const f = await fixture();
        await addStudent(f);
        const p = await schedule(f);
        const reached = deferred(),
          resume = deferred();
        let paused = false;
        const holder = prisma.$extends({
          query: {
            academicContentRevision: {
              async findFirst({ args, query }) {
                const row = await query(args);
                if (winner === 'publish' && !paused) {
                  paused = true;
                  reached.resolve();
                  await resume.promise;
                }
                return row;
              },
            },
            academicContentPublication: {
              async updateMany({ args, query }) {
                if (
                  winner === 'unschedule' &&
                  args.data.status === 'CANCELLED' &&
                  !paused
                ) {
                  paused = true;
                  reached.resolve();
                  await resume.promise;
                }
                return query(args);
              },
            },
          },
        }) as unknown as PrismaService;
        const first =
          winner === 'publish'
            ? execute(f, p, holder)
            : intentRepo(holder).unschedule({
                ...mutation(f),
                publicationId: p.publicationId,
              });
        await reached.promise;
        const contender =
          winner === 'publish'
            ? intentRepo(second).unschedule({
                ...mutation(f),
                publicationId: p.publicationId,
              })
            : execute(f, p, second);
        const outcomes = Promise.allSettled([first, contender]);
        try {
          await waitForParentLock();
        } finally {
          resume.resolve();
        }
        const result = await outcomes,
          saved = await state(f, p);
        expect(result[0].status).toBe('fulfilled');
        if (winner === 'publish') {
          expect(result[1].status).toBe('rejected');
          expect(saved.content.status).toBe('PUBLISHED');
          expect(saved.publication.status).toBe('PUBLISHED');
          expect(saved.recipients).toHaveLength(1);
          expect(saved.audits).toHaveLength(1);
        } else {
          if (result[1].status === 'rejected') throw result[1].reason;
          expect(result[1]).toMatchObject({
            status: 'fulfilled',
            value: { outcome: 'TERMINAL_NOOP' },
          });
          expect(saved.content.status).toBe('DRAFT');
          expect(saved.publication.status).toBe('CANCELLED');
          expect(saved.recipients).toEqual([]);
          expect(saved.audits).toEqual([]);
        }
      },
    );
  },
);
