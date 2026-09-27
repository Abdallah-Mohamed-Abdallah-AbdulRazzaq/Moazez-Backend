import { randomUUID } from 'node:crypto';
import {
  AcademicContentApprovalStatus,
  AcademicContentAudienceType,
  AcademicContentStatus,
  AcademicContentTargetScopeType,
  AcademicContentType,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { AcademicContentReviewRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-review.repository';
import { AcademicContentRevisionRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-revision.repository';
import { AcademicContentWorkflowRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-workflow.repository';
import {
  presentAcademicContentApprovalHistory,
  presentAcademicContentReviewQueue,
} from '../../src/modules/academics/academic-content/presenters/academic-content-review.presenter';

const url = process.env.DATABASE_URL;
const describeDatabase = url ? describe : describe.skip;
type TargetFixture = {
  scopeType: AcademicContentTargetScopeType;
  stageId?: string | null;
  gradeId?: string | null;
  sectionId?: string | null;
  classroomId?: string | null;
  subjectId?: string | null;
  teacherSubjectAllocationId?: string | null;
};

describeDatabase('ACC-6C PostgreSQL review queue and approval history', () => {
  jest.setTimeout(120_000);
  const prisma = new PrismaService({
    datasources: {
      db: { url: url ?? 'postgresql://unused:unused@127.0.0.1:1/unused' },
    },
  });
  const reviews = new AcademicContentReviewRepository(prisma);
  const revisions = new AcademicContentRevisionRepository(prisma);
  const workflow = new AcademicContentWorkflowRepository(prisma, revisions);
  const id: Record<string, string> = {};
  const suffix = randomUUID().slice(0, 8);
  const submittedAt = new Date('2026-09-26T09:00:00.000Z');
  let order = 0;
  const target = (
    scopeType: AcademicContentTargetScopeType,
    extra: Omit<TargetFixture, 'scopeType'> = {},
  ): TargetFixture => ({
    scopeType,
    ...extra,
  });

  async function makeRound(
    options: {
      school?: 'A' | 'B';
      type?: AcademicContentType;
      contentStatus?: AcademicContentStatus;
      approvalStatus?: AcademicContentApprovalStatus;
      title?: string;
      description?: string;
      year?: string;
      term?: string;
      targets?: ReturnType<typeof target>[];
      tags?: string[];
      deleted?: boolean;
      submittedAt?: Date;
    } = {},
  ) {
    const school = options.school ?? 'A';
    const schoolId = id[`school${school}`];
    const type = options.type ?? AcademicContentType.TEACHER_PREPARATION;
    const year = options.year ?? id[`year${school}`];
    const term = options.term ?? id[`term${school}`];
    const content = await prisma.academicContent.create({
      data: {
        schoolId,
        academicYearId: year,
        termId: term,
        type,
        audience: AcademicContentAudienceType.INTERNAL_STAFF,
        title: 'Mutable authoring title',
        createdByUserId: id.user,
        status: options.contentStatus ?? AcademicContentStatus.SUBMITTED,
        deletedAt: options.deleted ? new Date() : null,
      },
    });
    const revision = await prisma.academicContentRevision.create({
      data: {
        schoolId,
        academicContentId: content.id,
        revisionNumber: 1,
        snapshotContractVersion: 2,
        academicYearId: year,
        termId: term,
        type,
        audience: AcademicContentAudienceType.INTERNAL_STAFF,
        title: options.title ?? 'Submitted algebra',
        description: options.description ?? null,
        sourceStatus: AcademicContentStatus.DRAFT,
        capturedByUserId: id.user,
        typeSpecificSnapshot: { teacherNotes: 'private review body' },
      },
    });
    for (const [index, value] of (
      options.targets ?? [
        target(AcademicContentTargetScopeType.SCHOOL, {
          subjectId: id.subjectA,
        }),
      ]
    ).entries()) {
      await prisma.academicContentRevisionTarget.create({
        data: {
          schoolId,
          revisionId: revision.id,
          scopeType: value.scopeType,
          stageId: value.stageId ?? null,
          gradeId: value.gradeId ?? null,
          sectionId: value.sectionId ?? null,
          classroomId: value.classroomId ?? null,
          subjectId: value.subjectId ?? null,
          teacherSubjectAllocationId: value.teacherSubjectAllocationId ?? null,
          identityFingerprint: `${index}${randomUUID().replace(/-/g, '')}`,
        },
      });
    }
    for (const [index, normalizedValue] of (options.tags ?? []).entries())
      await prisma.academicContentRevisionTag.create({
        data: {
          schoolId,
          revisionId: revision.id,
          displayValue: normalizedValue,
          normalizedValue,
          sortOrder: index,
        },
      });
    const approval = await prisma.academicContentApproval.create({
      data: {
        schoolId,
        academicContentId: content.id,
        revisionId: revision.id,
        roundNumber: 1,
        status: options.approvalStatus ?? AcademicContentApprovalStatus.PENDING,
        submittedByUserId: id.user,
        submittedAt:
          options.submittedAt ??
          new Date(submittedAt.getTime() + order++ * 1000),
        decidedByUserId:
          options.approvalStatus &&
          options.approvalStatus !== AcademicContentApprovalStatus.PENDING
            ? id.user
            : null,
        decidedAt:
          options.approvalStatus &&
          options.approvalStatus !== AcademicContentApprovalStatus.PENDING
            ? new Date()
            : null,
        decisionNote:
          options.approvalStatus ===
          AcademicContentApprovalStatus.CHANGES_REQUESTED
            ? 'Revise'
            : null,
      },
    });
    return { content, revision, approval };
  }

  beforeAll(async () => {
    await prisma.$connect();
    id.organization = (
      await prisma.organization.create({
        data: { name: `ACC6C ${suffix}`, slug: `acc6c-${suffix}` },
      })
    ).id;
    id.user = (
      await prisma.user.create({
        data: {
          email: `acc6c-${suffix}@example.test`,
          firstName: 'Review',
          lastName: 'Reader',
          userType: UserType.SCHOOL_USER,
        },
      })
    ).id;
    id.teacher = (
      await prisma.user.create({
        data: {
          email: `acc6c-teacher-${suffix}@example.test`,
          firstName: 'Review',
          lastName: 'Teacher',
          userType: UserType.TEACHER,
        },
      })
    ).id;
    for (const school of ['A', 'B'] as const) {
      id[`school${school}`] = (
        await prisma.school.create({
          data: {
            organizationId: id.organization,
            name: `ACC6C ${school} ${suffix}`,
            slug: `acc6c-${school.toLowerCase()}-${suffix}`,
          },
        })
      ).id;
      id[`year${school}`] = (
        await prisma.academicYear.create({
          data: {
            schoolId: id[`school${school}`],
            nameAr: `سنة ${school} ${suffix}`,
            nameEn: `Year ${school} ${suffix}`,
            startDate: new Date('2026-01-01'),
            endDate: new Date('2030-12-31'),
            isActive: true,
          },
        })
      ).id;
      id[`term${school}`] = (
        await prisma.term.create({
          data: {
            schoolId: id[`school${school}`],
            academicYearId: id[`year${school}`],
            nameAr: `فصل ${school} ${suffix}`,
            nameEn: `Term ${school} ${suffix}`,
            startDate: new Date('2026-01-01'),
            endDate: new Date('2030-12-31'),
            isActive: true,
          },
        })
      ).id;
      id[`stage${school}`] = (
        await prisma.stage.create({
          data: {
            schoolId: id[`school${school}`],
            nameAr: `مرحلة ${school} ${suffix}`,
            nameEn: `Stage ${school} ${suffix}`,
          },
        })
      ).id;
      id[`grade${school}`] = (
        await prisma.grade.create({
          data: {
            schoolId: id[`school${school}`],
            stageId: id[`stage${school}`],
            nameAr: `صف ${school} ${suffix}`,
            nameEn: `Grade ${school} ${suffix}`,
          },
        })
      ).id;
      id[`section${school}`] = (
        await prisma.section.create({
          data: {
            schoolId: id[`school${school}`],
            gradeId: id[`grade${school}`],
            nameAr: `شعبة ${school} ${suffix}`,
            nameEn: `Section ${school} ${suffix}`,
          },
        })
      ).id;
      id[`classroom${school}`] = (
        await prisma.classroom.create({
          data: {
            schoolId: id[`school${school}`],
            sectionId: id[`section${school}`],
            nameAr: `فصل دراسي ${school} ${suffix}`,
            nameEn: `Classroom ${school} ${suffix}`,
          },
        })
      ).id;
      id[`subject${school}`] = (
        await prisma.subject.create({
          data: {
            schoolId: id[`school${school}`],
            nameAr: `مادة ${school} ${suffix}`,
            nameEn: `Subject ${school} ${suffix}`,
          },
        })
      ).id;
    }
    id.year2 = (
      await prisma.academicYear.create({
        data: {
          schoolId: id.schoolA,
          nameAr: `سنة ثانية ${suffix}`,
          nameEn: `Year Two ${suffix}`,
          startDate: new Date('2031-01-01'),
          endDate: new Date('2035-12-31'),
        },
      })
    ).id;
    id.term2 = (
      await prisma.term.create({
        data: {
          schoolId: id.schoolA,
          academicYearId: id.year2,
          nameAr: `فصل ثاني ${suffix}`,
          nameEn: `Term Two ${suffix}`,
          startDate: new Date('2031-01-01'),
          endDate: new Date('2035-12-31'),
        },
      })
    ).id;
    id.subjectAllocation = (
      await prisma.subjectAllocation.create({
        data: {
          schoolId: id.schoolA,
          academicYearId: id.yearA,
          termId: id.termA,
          gradeId: id.gradeA,
          subjectId: id.subjectA,
          weeklyHours: 3,
        },
      })
    ).id;
    id.teacherAllocation = (
      await prisma.teacherSubjectAllocation.create({
        data: {
          schoolId: id.schoolA,
          teacherUserId: id.teacher,
          subjectId: id.subjectA,
          classroomId: id.classroomA,
          termId: id.termA,
        },
      })
    ).id;
    await prisma.academicContentWorkflowPolicy.create({
      data: { schoolId: id.schoolA, preparationApprovalRequired: true },
    });
  });

  afterAll(async () => {
    if (id.schoolA) {
      const where = { schoolId: { in: [id.schoolA, id.schoolB] } };
      await prisma.auditLog.deleteMany({ where });
      await prisma.academicContentApproval.deleteMany({ where });
      await prisma.academicContentRevisionTarget.deleteMany({ where });
      await prisma.academicContentRevisionTag.deleteMany({ where });
      await prisma.academicContentRevision.deleteMany({ where });
      await prisma.academicContentTarget.deleteMany({ where });
      await prisma.academicContentPreparationDetail.deleteMany({ where });
      await prisma.academicContent.deleteMany({ where });
      await prisma.academicContentWorkflowPolicy.deleteMany({ where });
      await prisma.teacherSubjectAllocation.deleteMany({ where });
      await prisma.subjectAllocation.deleteMany({ where });
      await prisma.subject.deleteMany({ where });
      await prisma.classroom.deleteMany({ where });
      await prisma.section.deleteMany({ where });
      await prisma.grade.deleteMany({ where });
      await prisma.stage.deleteMany({ where });
      await prisma.term.deleteMany({ where });
      await prisma.academicYear.deleteMany({ where });
      await prisma.school.deleteMany({
        where: { id: { in: [id.schoolA, id.schoolB] } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [id.user, id.teacher] } },
      });
      await prisma.organization.delete({ where: { id: id.organization } });
    }
    await prisma.$disconnect();
  });

  const queue = (
    schoolId: string,
    query: Record<string, string | number> = {},
  ) => reviews.queue(schoolId, { page: 1, limit: 50, ...query });

  it('uses the current pending Approval revision, effective targets and stable bounded filtering', async () => {
    const first = await makeRound({
      title: 'Submitted algebra',
      description: 'Immutable review description',
      tags: ['geometry'],
      targets: [
        target(AcademicContentTargetScopeType.SCHOOL, {
          subjectId: id.subjectA,
        }),
        target(AcademicContentTargetScopeType.CLASSROOM, {
          stageId: id.stageA,
          gradeId: id.gradeA,
          sectionId: id.sectionA,
          classroomId: id.classroomA,
          subjectId: id.subjectA,
          teacherSubjectAllocationId: id.teacherAllocation,
        }),
      ],
    });
    const second = await makeRound({
      title: 'Second request',
      targets: [
        target(AcademicContentTargetScopeType.STAGE, {
          stageId: id.stageA,
          subjectId: id.subjectA,
        }),
      ],
    });
    const third = await makeRound({
      title: 'Third request',
      targets: [
        target(AcademicContentTargetScopeType.GRADE, {
          stageId: id.stageA,
          gradeId: id.gradeA,
          subjectId: id.subjectA,
        }),
      ],
    });
    const fourth = await makeRound({
      title: 'Fourth request',
      targets: [
        target(AcademicContentTargetScopeType.SECTION, {
          stageId: id.stageA,
          gradeId: id.gradeA,
          sectionId: id.sectionA,
          subjectId: id.subjectA,
        }),
      ],
    });
    await makeRound({ school: 'B', title: 'Foreign request' });
    await makeRound({
      type: AcademicContentType.GENERAL_RESOURCE,
      title: 'Wrong type',
    });
    await makeRound({
      contentStatus: AcademicContentStatus.DRAFT,
      title: 'Wrong status',
    });
    await makeRound({ deleted: true, title: 'Deleted' });
    await makeRound({
      approvalStatus: AcademicContentApprovalStatus.APPROVED,
      title: 'Decided',
    });
    const later = await makeRound({ title: 'Stale pending' });
    const laterRevision = await prisma.academicContentRevision.create({
      data: {
        schoolId: id.schoolA,
        academicContentId: later.content.id,
        revisionNumber: 2,
        snapshotContractVersion: 2,
        academicYearId: id.yearA,
        termId: id.termA,
        type: AcademicContentType.TEACHER_PREPARATION,
        audience: AcademicContentAudienceType.INTERNAL_STAFF,
        title: 'Later decided',
        sourceStatus: AcademicContentStatus.DRAFT,
        capturedByUserId: id.user,
      },
    });
    await prisma.academicContentApproval.create({
      data: {
        schoolId: id.schoolA,
        academicContentId: later.content.id,
        revisionId: laterRevision.id,
        roundNumber: 2,
        status: AcademicContentApprovalStatus.APPROVED,
        submittedByUserId: id.user,
        decidedByUserId: id.user,
        decidedAt: new Date(),
      },
    });
    const yearTwo = await makeRound({
      year: id.year2,
      term: id.term2,
      title: 'Future year',
      targets: [
        target(AcademicContentTargetScopeType.SCHOOL, { subjectId: null }),
      ],
    });
    await prisma.academicContent.update({
      where: { id: first.content.id },
      data: {
        title: 'Edited current title',
        academicYearId: id.year2,
        termId: id.term2,
      },
    });
    await prisma.academicContentTarget.create({
      data: {
        schoolId: id.schoolA,
        academicContentId: first.content.id,
        scopeType: AcademicContentTargetScopeType.SCHOOL,
        identityFingerprint: randomUUID().replace(/-/g, ''),
        createdByUserId: id.user,
      },
    });
    const all = await queue(id.schoolA);
    expect(all.total).toBe(5);
    expect(all.items.map((item) => item.contentId)).toEqual([
      first.content.id,
      second.content.id,
      third.content.id,
      fourth.content.id,
      yearTwo.content.id,
    ]);
    const firstRow = all.items[0];
    expect(firstRow.title).toBe('Submitted algebra');
    expect(firstRow.academicYearId).toBe(id.yearA);
    expect(firstRow.termId).toBe(id.termA);
    expect(firstRow.submittedRevisionId).toBe(first.revision.id);
    expect(firstRow.targets).toHaveLength(2);
    expect(firstRow.targets[0]).not.toHaveProperty('identityFingerprint');
    expect(JSON.stringify(presentAcademicContentReviewQueue(all))).not.toMatch(
      /private review body|schoolId|identityFingerprint|teacherNotes/,
    );
    expect(
      (await queue(id.schoolA, { academicYearId: id.yearA, termId: id.termA }))
        .total,
    ).toBe(4);
    expect(
      (
        await queue(id.schoolA, { academicYearId: id.year2, termId: id.term2 })
      ).items.map((item) => item.contentId),
    ).toEqual([yearTwo.content.id]);
    for (const [key, expected] of [
      ['stageId', 3],
      ['gradeId', 4],
      ['sectionId', 5],
      ['classroomId', 5],
    ] as const)
      expect(
        (await queue(id.schoolA, { [key]: id[key.replace('Id', '') + 'A'] }))
          .total,
      ).toBe(expected);
    expect(
      (
        await queue(id.schoolA, {
          classroomId: id.classroomA,
          subjectId: id.subjectA,
        })
      ).total,
    ).toBe(4);
    expect((await queue(id.schoolA, { subjectId: id.subjectA })).total).toBe(4);
    expect(
      (await queue(id.schoolA, { teacherUserId: id.teacher })).items.map(
        (item) => item.contentId,
      ),
    ).toEqual([first.content.id]);
    expect((await queue(id.schoolA, { teacherUserId: id.user })).total).toBe(0);
    expect(
      (await queue(id.schoolA, { search: '  ＧＥＯＭＥＴＲＹ  ' })).items.map(
        (item) => item.contentId,
      ),
    ).toEqual([first.content.id]);
    expect((await queue(id.schoolA, { search: 'description' })).total).toBe(1);
    expect(
      (await queue(id.schoolA, { search: 'submitted ALGEBRA' })).items.map(
        (item) => item.contentId,
      ),
    ).toEqual([first.content.id]);
    expect(
      (await queue(id.schoolA, { search: 'Edited current title' })).total,
    ).toBe(0);
    expect(
      (await queue(id.schoolA, { classroomId: id.classroomB })).total,
    ).toBe(0);
    expect(
      (await queue(id.schoolA, { stageId: id.stageB, gradeId: id.gradeA }))
        .total,
    ).toBe(0);
    const pageTwo = await reviews.queue(id.schoolA, { page: 2, limit: 2 });
    expect(pageTwo.total).toBe(5);
    expect(pageTwo.items.map((item) => item.contentId)).toEqual([
      third.content.id,
      fourth.content.id,
    ]);
    const revisionDetail = await revisions.detail({
      schoolId: id.schoolA,
      contentId: first.content.id,
      revisionId: first.revision.id,
    });
    expect(revisionDetail?.title).toBe(firstRow.title);
  });

  it('uses approval ID as the tie-breaker for equal submission times', async () => {
    const sameTime = new Date('2026-09-26T08:00:00.000Z');
    const left = await makeRound({
      title: 'Tie case left',
      submittedAt: sameTime,
    });
    const right = await makeRound({
      title: 'Tie case right',
      submittedAt: sameTime,
    });
    const expected = [left.approval.id, right.approval.id].sort();
    const firstPage = await reviews.queue(id.schoolA, {
      search: 'Tie case',
      page: 1,
      limit: 1,
    });
    const secondPage = await reviews.queue(id.schoolA, {
      search: 'Tie case',
      page: 2,
      limit: 1,
    });
    expect(firstPage.total).toBe(2);
    expect([
      firstPage.items[0].approvalId,
      secondPage.items[0].approvalId,
    ]).toEqual(expected);
  });

  it('returns local approval history newest first and hides foreign or deleted content', async () => {
    const item = await makeRound({ title: 'History round one' });
    await prisma.academicContentApproval.update({
      where: { id: item.approval.id },
      data: {
        status: AcademicContentApprovalStatus.CHANGES_REQUESTED,
        decidedByUserId: id.user,
        decidedAt: new Date(),
        decisionNote: 'Clarify examples',
      },
    });
    const secondRevision = await prisma.academicContentRevision.create({
      data: {
        schoolId: id.schoolA,
        academicContentId: item.content.id,
        revisionNumber: 2,
        snapshotContractVersion: 2,
        academicYearId: id.yearA,
        termId: id.termA,
        type: AcademicContentType.TEACHER_PREPARATION,
        audience: AcademicContentAudienceType.INTERNAL_STAFF,
        title: 'History round two',
        sourceStatus: AcademicContentStatus.CHANGES_REQUESTED,
        capturedByUserId: id.user,
      },
    });
    const secondApproval = await prisma.academicContentApproval.create({
      data: {
        schoolId: id.schoolA,
        academicContentId: item.content.id,
        revisionId: secondRevision.id,
        roundNumber: 2,
        submittedByUserId: id.user,
      },
    });
    const history = await reviews.history({
      schoolId: id.schoolA,
      contentId: item.content.id,
      page: 1,
      limit: 1,
    });
    expect(history.total).toBe(2);
    expect(history.items[0].id).toBe(secondApproval.id);
    const older = await reviews.history({
      schoolId: id.schoolA,
      contentId: item.content.id,
      page: 2,
      limit: 1,
    });
    expect(older.items[0].decisionNote).toBe('Clarify examples');
    expect(presentAcademicContentApprovalHistory(older).items[0]).toEqual({
      approvalId: item.approval.id,
      revisionId: item.revision.id,
      roundNumber: 1,
      status: 'CHANGES_REQUESTED',
      submittedByUserId: id.user,
      submittedAt: older.items[0].submittedAt.toISOString(),
      decidedByUserId: id.user,
      decidedAt: older.items[0].decidedAt?.toISOString() ?? null,
      decisionNote: 'Clarify examples',
    });
    const localEmpty = await prisma.academicContent.create({
      data: {
        schoolId: id.schoolA,
        academicYearId: id.yearA,
        termId: id.termA,
        type: AcademicContentType.TEACHER_PREPARATION,
        audience: AcademicContentAudienceType.INTERNAL_STAFF,
        title: 'No approval',
        createdByUserId: id.user,
      },
    });
    expect(
      (
        await reviews.history({
          schoolId: id.schoolA,
          contentId: localEmpty.id,
          page: 1,
          limit: 50,
        })
      ).total,
    ).toBe(0);
    const foreign = await makeRound({ school: 'B' });
    await expect(
      reviews.history({
        schoolId: id.schoolA,
        contentId: foreign.content.id,
        page: 1,
        limit: 50,
      }),
    ).rejects.toThrow('not found');
    const deleted = await makeRound({ deleted: true });
    await expect(
      reviews.history({
        schoolId: id.schoolA,
        contentId: deleted.content.id,
        page: 1,
        limit: 50,
      }),
    ).rejects.toThrow('not found');
  });

  it('tracks real submit, request changes, resubmit and approve transitions', async () => {
    const content = await prisma.academicContent.create({
      data: {
        schoolId: id.schoolA,
        academicYearId: id.yearA,
        termId: id.termA,
        type: AcademicContentType.TEACHER_PREPARATION,
        audience: AcademicContentAudienceType.INTERNAL_STAFF,
        title: 'Original submitted title',
        createdByUserId: id.user,
      },
    });
    await prisma.academicContentTarget.create({
      data: {
        schoolId: id.schoolA,
        academicContentId: content.id,
        scopeType: AcademicContentTargetScopeType.SCHOOL,
        subjectId: id.subjectA,
        identityFingerprint: randomUUID().replace(/-/g, ''),
        createdByUserId: id.user,
      },
    });
    await prisma.academicContentPreparationDetail.create({
      data: {
        schoolId: id.schoolA,
        academicContentId: content.id,
        topic: 'First topic',
      },
    });
    const command = {
      contentId: content.id,
      schoolId: id.schoolA,
      organizationId: id.organization,
      actorId: id.user,
      now: new Date(),
    };
    const roundOne = await workflow.submit(command);
    let visible = (await queue(id.schoolA)).items.find(
      (item) => item.contentId === content.id,
    );
    expect(visible).toMatchObject({
      title: 'Original submitted title',
      roundNumber: 1,
      submittedRevisionId: roundOne.revisionId,
    });
    expect(
      (
        await reviews.history({
          schoolId: id.schoolA,
          contentId: content.id,
          page: 1,
          limit: 50,
        })
      ).items[0].status,
    ).toBe('PENDING');
    await prisma.academicContent.update({
      where: { id: content.id },
      data: { title: 'Changed current title' },
    });
    visible = (await queue(id.schoolA)).items.find(
      (item) => item.contentId === content.id,
    );
    expect(visible?.title).toBe('Original submitted title');
    const roundOneDetail = await revisions.detail({
      schoolId: id.schoolA,
      contentId: content.id,
      revisionId: roundOne.revisionId,
    });
    expect(roundOneDetail.title).toBe(visible?.title);
    await workflow.decide({
      ...command,
      decision: 'request-changes',
      note: 'Improve examples',
    });
    expect(
      (await queue(id.schoolA)).items.some(
        (item) => item.contentId === content.id,
      ),
    ).toBe(false);
    const decidedOne = (
      await reviews.history({
        schoolId: id.schoolA,
        contentId: content.id,
        page: 1,
        limit: 50,
      })
    ).items[0];
    expect(decidedOne.decisionNote).toBe('Improve examples');
    await prisma.academicContentPreparationDetail.update({
      where: {
        schoolId_academicContentId: {
          schoolId: id.schoolA,
          academicContentId: content.id,
        },
      },
      data: { topic: 'Revised topic' },
    });
    const roundTwo = await workflow.submit({
      ...command,
      now: new Date(Date.now() + 1000),
    });
    expect(roundTwo.revisionId).not.toBe(roundOne.revisionId);
    visible = (await queue(id.schoolA)).items.find(
      (item) => item.contentId === content.id,
    );
    expect(visible).toMatchObject({
      roundNumber: 2,
      submittedRevisionId: roundTwo.revisionId,
    });
    let history = await reviews.history({
      schoolId: id.schoolA,
      contentId: content.id,
      page: 1,
      limit: 50,
    });
    expect(history.items.map((item) => item.roundNumber)).toEqual([2, 1]);
    expect(history.items.map((item) => item.revisionId)).toEqual([
      roundTwo.revisionId,
      roundOne.revisionId,
    ]);
    expect(history.items[1]).toMatchObject({
      decisionNote: decidedOne.decisionNote,
      submittedAt: decidedOne.submittedAt,
      decidedAt: decidedOne.decidedAt,
    });
    const roundTwoDetail = await revisions.detail({
      schoolId: id.schoolA,
      contentId: content.id,
      revisionId: roundTwo.revisionId,
    });
    expect(roundTwoDetail.title).toBe(visible?.title);
    await workflow.decide({ ...command, decision: 'approve', note: null });
    expect(
      (await queue(id.schoolA)).items.some(
        (item) => item.contentId === content.id,
      ),
    ).toBe(false);
    history = await reviews.history({
      schoolId: id.schoolA,
      contentId: content.id,
      page: 1,
      limit: 50,
    });
    expect(history.items.map((item) => item.status)).toEqual([
      'APPROVED',
      'CHANGES_REQUESTED',
    ]);
    expect(history.items[0].decidedByUserId).toBe(id.user);
    expect(history.items[1].decisionNote).toBe('Improve examples');
  });
});
