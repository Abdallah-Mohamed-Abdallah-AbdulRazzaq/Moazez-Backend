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
import { AcademicContentWorkflowRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-workflow.repository';
import { AcademicContentRevisionRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-revision.repository';
import { AcademicContentRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content.repository';
import { AcademicContentTargetRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-target.repository';
import { AcademicContentTypeDetailRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-type-detail.repository';
import { AcademicContentWorkflowPolicyRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-workflow-policy.repository';
import { AcademicContentLinksTagsRepository } from '../../src/modules/academics/academic-content/infrastructure/academic-content-links-tags.repository';
import { AcademicContentFileRepository } from '../../src/modules/academics/academic-content/files/infrastructure/academic-content-file.repository';
import {
  normalizeAcademicContentLinks,
  normalizeAcademicContentTags,
} from '../../src/modules/academics/academic-content/domain/academic-content-links-tags.policy';
import { normalizePreparation } from '../../src/modules/academics/academic-content/domain/academic-content-type-detail.policy';
import { normalizeAcademicContentTargets } from '../../src/modules/academics/academic-content/domain/academic-content-target.policy';

const url = process.env.DATABASE_URL;
const describeDatabase = url ? describe : describe.skip;

describeDatabase('ACC-6B atomic PostgreSQL workflow transitions', () => {
  jest.setTimeout(120_000);
  const prisma = new PrismaService({
    datasources: {
      db: { url: url ?? 'postgresql://unused:unused@127.0.0.1:1/unused' },
    },
  });
  const revisions = new AcademicContentRevisionRepository(prisma);
  const workflow = new AcademicContentWorkflowRepository(prisma, revisions);
  const metadata = new AcademicContentRepository(prisma);
  const targets = new AcademicContentTargetRepository(prisma);
  const details = new AcademicContentTypeDetailRepository(prisma);
  const policies = new AcademicContentWorkflowPolicyRepository(prisma);
  const linksTags = new AcademicContentLinksTagsRepository(prisma);
  const files = new AcademicContentFileRepository(prisma);
  const ids: Record<string, string> = {};
  const tag = randomUUID().slice(0, 8);
  const now = new Date('2026-09-27T12:00:00.000Z');

  function failWorkflowAudit(action: string) {
    const client = prisma.$extends({
      query: {
        auditLog: {
          async create({ args, query }) {
            if (args.data.action === action)
              throw new Error('Injected final workflow audit failure');
            return query(args);
          },
        },
      },
    }) as unknown as PrismaService;
    return new AcademicContentWorkflowRepository(
      client,
      new AcademicContentRevisionRepository(client),
    );
  }

  const command = (contentId: string, school: 'A' | 'B' = 'A') => ({
    contentId,
    schoolId: ids[`school${school}`],
    organizationId: ids.organization,
    actorId: ids.user,
    now,
  });
  const prep = (topic: string) =>
    normalizePreparation({
      topic,
      objectives: [],
      learningOutcomes: [],
      teachingStrategies: [],
      activities: [],
    });
  const schoolTarget = () =>
    normalizeAcademicContentTargets(
      AcademicContentType.TEACHER_PREPARATION,
      UserType.SCHOOL_USER,
      [
        {
          scopeType: AcademicContentTargetScopeType.SCHOOL,
          subjectId: ids.subjectA,
        },
      ],
    );

  async function makeContent(
    options: {
      school?: 'A' | 'B';
      type?: AcademicContentType;
      target?: boolean;
      detail?: boolean;
    } = {},
  ) {
    const school = options.school ?? 'A';
    const type = options.type ?? AcademicContentType.TEACHER_PREPARATION;
    const content = await prisma.academicContent.create({
      data: {
        schoolId: ids[`school${school}`],
        academicYearId: ids[`year${school}`],
        termId: ids[`term${school}`],
        type,
        audience:
          type === AcademicContentType.TEACHER_PREPARATION
            ? AcademicContentAudienceType.INTERNAL_STAFF
            : AcademicContentAudienceType.STUDENTS,
        title: `ACC6B ${randomUUID()}`,
        createdByUserId: ids.user,
      },
    });
    if (
      options.target !== false &&
      type === AcademicContentType.TEACHER_PREPARATION
    )
      await prisma.academicContentTarget.create({
        data: {
          schoolId: content.schoolId,
          academicContentId: content.id,
          scopeType: AcademicContentTargetScopeType.SCHOOL,
          subjectId: ids[`subject${school}`],
          identityFingerprint: randomUUID().replace(/-/g, ''),
          createdByUserId: ids.user,
        },
      });
    if (
      options.detail !== false &&
      type === AcademicContentType.TEACHER_PREPARATION
    )
      await prisma.academicContentPreparationDetail.create({
        data: {
          schoolId: content.schoolId,
          academicContentId: content.id,
          topic: 'Initial topic',
        },
      });
    return content;
  }

  async function state(contentId: string) {
    const [content, approval, revision, audits] = await Promise.all([
      prisma.academicContent.findUniqueOrThrow({ where: { id: contentId } }),
      prisma.academicContentApproval.findMany({
        where: { academicContentId: contentId },
        orderBy: { roundNumber: 'asc' },
      }),
      prisma.academicContentRevision.findMany({
        where: { academicContentId: contentId },
        orderBy: { revisionNumber: 'asc' },
        include: { targets: true },
      }),
      prisma.auditLog.findMany({
        where: { resourceId: contentId, module: 'academic-content' },
      }),
    ]);
    return { content, approval, revision, audits };
  }

  beforeAll(async () => {
    await prisma.$connect();
    ids.organization = (
      await prisma.organization.create({
        data: { name: `ACC6B ${tag}`, slug: `acc6b-${tag}` },
      })
    ).id;
    ids.user = (
      await prisma.user.create({
        data: {
          email: `acc6b-${tag}@example.test`,
          firstName: 'ACC',
          lastName: 'Reviewer',
          userType: UserType.SCHOOL_USER,
        },
      })
    ).id;
    for (const school of ['A', 'B'] as const) {
      ids[`school${school}`] = (
        await prisma.school.create({
          data: {
            organizationId: ids.organization,
            name: `ACC6B ${school} ${tag}`,
            slug: `acc6b-${school.toLowerCase()}-${tag}`,
          },
        })
      ).id;
      ids[`year${school}`] = (
        await prisma.academicYear.create({
          data: {
            schoolId: ids[`school${school}`],
            nameAr: `سنة ${school} ${tag}`,
            nameEn: `Year ${school} ${tag}`,
            startDate: new Date('2026-01-01'),
            endDate: new Date('2030-12-31'),
          },
        })
      ).id;
      ids[`term${school}`] = (
        await prisma.term.create({
          data: {
            schoolId: ids[`school${school}`],
            academicYearId: ids[`year${school}`],
            nameAr: `فصل ${school} ${tag}`,
            nameEn: `Term ${school} ${tag}`,
            startDate: new Date('2026-01-01'),
            endDate: new Date('2030-12-31'),
            isActive: true,
          },
        })
      ).id;
      ids[`subject${school}`] = (
        await prisma.subject.create({
          data: {
            schoolId: ids[`school${school}`],
            nameAr: `موضوع ${school}`,
            nameEn: `Subject ${school}`,
          },
        })
      ).id;
    }
    await prisma.academicContentWorkflowPolicy.create({
      data: { schoolId: ids.schoolA, preparationApprovalRequired: true },
    });
  });

  afterAll(async () => {
    if (ids.schoolA) {
      const where = { schoolId: { in: [ids.schoolA, ids.schoolB] } };
      await prisma.academicContentApproval.deleteMany({ where });
      await prisma.academicContentRevisionTarget.deleteMany({ where });
      await prisma.academicContentRevisionAsset.deleteMany({ where });
      await prisma.academicContentRevisionLink.deleteMany({ where });
      await prisma.academicContentRevisionTag.deleteMany({ where });
      await prisma.auditLog.deleteMany({ where });
      await prisma.academicContentRevision.deleteMany({ where });
      await prisma.academicContentTarget.deleteMany({ where });
      await prisma.academicContentAsset.deleteMany({ where });
      await prisma.academicContentLink.deleteMany({ where });
      await prisma.academicContentTag.deleteMany({ where });
      await prisma.academicContentPreparationDetail.deleteMany({ where });
      await prisma.academicContent.deleteMany({ where });
      await prisma.file.deleteMany({ where });
      await prisma.academicContentWorkflowPolicy.deleteMany({ where });
      await prisma.subject.deleteMany({ where });
      await prisma.term.deleteMany({ where });
      await prisma.academicYear.deleteMany({ where });
      await prisma.school.deleteMany({
        where: { id: { in: [ids.schoolA, ids.schoolB] } },
      });
      await prisma.user.delete({ where: { id: ids.user } });
      await prisma.organization.delete({ where: { id: ids.organization } });
    }
    await prisma.$disconnect();
  });

  it('includes School identity in every update and parent identity in Approval decisions', async () => {
    const updates: Array<{ model: string; id: string }> = [];
    const approvalParents: string[] = [];
    const client = prisma.$extends({
      query: {
        $allModels: {
          async update({ model, args, query }) {
            if (
              model === 'AcademicContent' ||
              model === 'AcademicContentApproval'
            ) {
              if (model === 'AcademicContent') {
                expect(args.where).toMatchObject({
                  id_schoolId: {
                    id: expect.any(String) as unknown,
                    schoolId: ids.schoolA,
                  },
                });
                const where = args.where as {
                  id_schoolId: { id: string; schoolId: string };
                };
                updates.push({ model, id: where.id_schoolId.id });
              } else {
                expect(args.where).toMatchObject({
                  id: expect.any(String) as unknown,
                  schoolId: ids.schoolA,
                  academicContentId: expect.any(String) as unknown,
                });
                updates.push({ model, id: args.where.id as string });
                approvalParents.push(
                  (args.where as { academicContentId: string })
                    .academicContentId,
                );
              }
            }
            return query(args);
          },
        },
      },
    }) as unknown as PrismaService;
    const scopedWorkflow = new AcademicContentWorkflowRepository(
      client,
      new AcademicContentRevisionRepository(client),
    );
    const scopedMetadata = new AcademicContentRepository(client);
    const draft = await makeContent();
    for (const action of ['update', 'archive', 'restore', 'delete'] as const) {
      await scopedMetadata.mutate({
        ...command(draft.id),
        id: draft.id,
        action,
        ...(action === 'update' ? { changes: { title: 'Scoped update' } } : {}),
      });
    }
    const content = await makeContent();
    const first = await scopedWorkflow.submit(command(content.id));
    await scopedWorkflow.decide({
      ...command(content.id),
      decision: 'request-changes',
      note: 'Revise topic',
    });
    const second = await scopedWorkflow.submit(command(content.id));
    await scopedWorkflow.decide({
      ...command(content.id),
      decision: 'approve',
      note: null,
    });
    expect(updates).toEqual([
      ...Array.from({ length: 4 }, () => ({
        model: 'AcademicContent',
        id: draft.id,
      })),
      { model: 'AcademicContent', id: content.id },
      { model: 'AcademicContentApproval', id: first.approvalId },
      { model: 'AcademicContent', id: content.id },
      { model: 'AcademicContent', id: content.id },
      { model: 'AcademicContentApproval', id: second.approvalId },
      { model: 'AcademicContent', id: content.id },
    ]);
    expect((await state(content.id)).content.status).toBe(
      AcademicContentStatus.APPROVED,
    );
    expect(approvalParents).toEqual([content.id, content.id]);
    await expect(
      scopedWorkflow.decide({
        ...command(content.id),
        decision: 'approve',
        note: null,
      }),
    ).rejects.toMatchObject({
      code: 'academic_content.approval.invalid_status',
    });
    expect(approvalParents).toEqual([content.id, content.id]);
  });

  it('rejects another parent at the Approval final write and rolls back the decision', async () => {
    const content = await makeContent();
    const otherContent = await makeContent();
    const submitted = await workflow.submit(command(content.id));
    const before = await state(content.id);
    const client = prisma.$extends({
      query: {
        academicContentApproval: {
          async update({ args, query }) {
            expect(args.where).toEqual({
              id: submitted.approvalId,
              schoolId: ids.schoolA,
              academicContentId: content.id,
            });
            return query({
              ...args,
              where: { ...args.where, academicContentId: otherContent.id },
            });
          },
        },
      },
    }) as unknown as PrismaService;
    const scopedWorkflow = new AcademicContentWorkflowRepository(
      client,
      new AcademicContentRevisionRepository(client),
    );
    await expect(
      scopedWorkflow.decide({
        ...command(content.id),
        decision: 'approve',
        note: null,
      }),
    ).rejects.toMatchObject({ code: 'P2025' });
    expect(await state(content.id)).toEqual(before);
    expect((await state(otherContent.id)).approval).toHaveLength(0);
  });

  it('submits, requests changes, edits, resubmits and approves immutable V2 rounds', async () => {
    const content = await makeContent();
    const first = await workflow.submit(command(content.id));
    expect(first).toMatchObject({
      contentStatus: AcademicContentStatus.SUBMITTED,
      approvalStatus: AcademicContentApprovalStatus.PENDING,
      roundNumber: 1,
    });
    await expect(workflow.submit(command(content.id))).rejects.toMatchObject({
      code: 'academic_content.approval.invalid_status',
    });
    let rows = await state(content.id);
    expect(rows.revision).toHaveLength(1);
    expect(rows.revision[0]).toMatchObject({
      id: first.revisionId,
      snapshotContractVersion: 2,
      sourceStatus: AcademicContentStatus.DRAFT,
    });
    expect(rows.revision[0].targets).toHaveLength(1);
    expect(rows.approval).toHaveLength(1);
    const changed = await workflow.decide({
      ...command(content.id),
      decision: 'request-changes',
      note: ' Revise topic ',
    });
    expect(changed).toMatchObject({
      contentStatus: AcademicContentStatus.CHANGES_REQUESTED,
      approvalStatus: AcademicContentApprovalStatus.CHANGES_REQUESTED,
    });
    expect(
      (
        await prisma.academicContentApproval.findUniqueOrThrow({
          where: { id: first.approvalId },
        })
      ).decisionNote,
    ).toBe(' Revise topic ');
    await details.mutate({
      ...command(content.id),
      detail: prep('Revised topic'),
    });
    const second = await workflow.submit(command(content.id));
    expect(second.roundNumber).toBe(2);
    expect(second.revisionId).not.toBe(first.revisionId);
    rows = await state(content.id);
    expect(rows.revision.map((r) => r.sourceStatus)).toEqual([
      AcademicContentStatus.DRAFT,
      AcademicContentStatus.CHANGES_REQUESTED,
    ]);
    expect(rows.approval.map((a) => a.status)).toEqual([
      AcademicContentApprovalStatus.CHANGES_REQUESTED,
      AcademicContentApprovalStatus.PENDING,
    ]);
    expect(rows.revision[0].typeSpecificSnapshot).toEqual(
      expect.objectContaining({
        type: AcademicContentType.TEACHER_PREPARATION,
      }),
    );
    const approved = await workflow.decide({
      ...command(content.id),
      decision: 'approve',
      note: null,
    });
    expect(approved).toMatchObject({
      contentStatus: AcademicContentStatus.APPROVED,
      approvalStatus: AcademicContentApprovalStatus.APPROVED,
      revisionId: second.revisionId,
    });
    rows = await state(content.id);
    expect(rows.content.status).toBe(AcademicContentStatus.APPROVED);
    expect(rows.approval.map((a) => a.status)).toEqual([
      AcademicContentApprovalStatus.CHANGES_REQUESTED,
      AcademicContentApprovalStatus.APPROVED,
    ]);
    expect(
      rows.audits.filter(
        (a) => a.action === 'academics.academic_content.submit',
      ),
    ).toHaveLength(1);
    expect(
      rows.audits.filter(
        (a) => a.action === 'academics.academic_content.resubmit',
      ),
    ).toHaveLength(1);
    expect(
      rows.audits.filter(
        (a) => a.action === 'academics.academic_content.approve',
      ),
    ).toHaveLength(1);
  });

  it('rejects absent approval policy, unsupported type, missing readiness and foreign School without mutation', async () => {
    const foreign = await makeContent({ school: 'B' });
    await expect(workflow.submit(command(foreign.id))).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(
      workflow.decide({
        ...command(foreign.id),
        decision: 'approve',
        note: null,
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      workflow.submit(command(foreign.id, 'B')),
    ).rejects.toMatchObject({ code: 'academic_content.approval.not_required' });
    const unsupported = await makeContent({
      type: AcademicContentType.GENERAL_RESOURCE,
    });
    await expect(
      workflow.submit(command(unsupported.id)),
    ).rejects.toMatchObject({
      code: 'academic_content.approval.type_unsupported',
    });
    for (const options of [{ target: false }, { detail: false }]) {
      const content = await makeContent(options);
      await expect(workflow.submit(command(content.id))).rejects.toMatchObject({
        code: 'academic_content.approval.not_ready',
      });
      const rows = await state(content.id);
      expect(rows.content.status).toBe(AcademicContentStatus.DRAFT);
      expect(rows.revision).toHaveLength(0);
      expect(rows.approval).toHaveLength(0);
    }
    await prisma.term.update({
      where: { id: ids.termA },
      data: { isActive: false },
    });
    const closed = await makeContent();
    await expect(workflow.submit(command(closed.id))).rejects.toMatchObject({
      code: 'academic_content.approval.not_ready',
    });
    await prisma.term.update({
      where: { id: ids.termA },
      data: { isActive: true },
    });
  });

  it('rolls back revision, approval and status when the final submission audit fails', async () => {
    const content = await makeContent();
    await expect(
      failWorkflowAudit('academics.academic_content.submit').submit(
        command(content.id),
      ),
    ).rejects.toThrow();
    const rows = await state(content.id);
    expect(rows.content.status).toBe(AcademicContentStatus.DRAFT);
    expect(rows.revision).toHaveLength(0);
    expect(rows.approval).toHaveLength(0);
  });

  it('rolls back approval decision and content status when its audit fails', async () => {
    const content = await makeContent();
    await workflow.submit(command(content.id));
    await expect(
      failWorkflowAudit('academics.academic_content.approve').decide({
        ...command(content.id),
        decision: 'approve',
        note: null,
      }),
    ).rejects.toThrow();
    const rows = await state(content.id);
    expect(rows.content.status).toBe(AcademicContentStatus.SUBMITTED);
    expect(rows.approval[0].status).toBe(AcademicContentApprovalStatus.PENDING);
  });

  it('allows pending decisions after the School policy is disabled', async () => {
    const content = await makeContent();
    await workflow.submit(command(content.id));
    await policies.updatePolicy({
      ...command(content.id),
      preparationApprovalRequired: false,
    });
    await workflow.decide({
      ...command(content.id),
      decision: 'approve',
      note: null,
    });
    await policies.updatePolicy({
      ...command(content.id),
      preparationApprovalRequired: true,
    });
    expect((await state(content.id)).content.status).toBe(
      AcademicContentStatus.APPROVED,
    );
  });

  it('serializes duplicate submit and competing decisions to one effective mutation', async () => {
    const content = await makeContent();
    const submits = await Promise.allSettled([
      workflow.submit(command(content.id)),
      workflow.submit(command(content.id)),
    ]);
    expect(submits.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    let rows = await state(content.id);
    expect(rows.revision).toHaveLength(1);
    expect(rows.approval).toHaveLength(1);
    const decisions = await Promise.allSettled([
      workflow.decide({
        ...command(content.id),
        decision: 'approve',
        note: null,
      }),
      workflow.decide({
        ...command(content.id),
        decision: 'request-changes',
        note: 'Revise',
      }),
    ]);
    expect(decisions.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    rows = await state(content.id);
    expect(rows.approval).toHaveLength(1);
    expect(rows.approval[0].status).not.toBe(
      AcademicContentApprovalStatus.PENDING,
    );
    expect(rows.content.status).toBe(rows.approval[0].status);
    expect(
      rows.audits.filter((a) =>
        [
          'academics.academic_content.approve',
          'academics.academic_content.request_changes',
        ].includes(a.action),
      ),
    ).toHaveLength(1);
  });

  it('serializes submit against metadata, detail, target replacement and archive', async () => {
    for (const edit of ['metadata', 'detail', 'targets', 'archive'] as const) {
      const content = await makeContent();
      const scope = command(content.id);
      const replacementTargets = schoolTarget();
      const update =
        edit === 'metadata'
          ? () =>
              metadata.mutate({
                id: content.id,
                schoolId: ids.schoolA,
                organizationId: ids.organization,
                actorId: ids.user,
                action: 'update',
                now,
                changes: { title: 'Race winner' },
              })
          : edit === 'detail'
            ? () => details.mutate({ ...scope, detail: prep('Race winner') })
            : edit === 'targets'
              ? () =>
                  targets.replace({
                    content,
                    targets: replacementTargets,
                    actorId: ids.user,
                  })
              : () =>
                  metadata.mutate({
                    id: content.id,
                    schoolId: ids.schoolA,
                    organizationId: ids.organization,
                    actorId: ids.user,
                    action: 'archive',
                    now,
                  });
      const outcomes = await Promise.allSettled([
        workflow.submit(scope),
        update(),
      ]);
      const rows = await state(content.id);
      expect(rows.approval.length).toBe(rows.revision.length);
      expect(rows.approval.length).toBeLessThanOrEqual(1);
      if (rows.approval.length) {
        expect(rows.content.status).toBe(AcademicContentStatus.SUBMITTED);
        expect(rows.revision[0].sourceStatus).toBe(AcademicContentStatus.DRAFT);
        if (outcomes[1].status === 'fulfilled') {
          if (edit === 'metadata')
            expect(rows.revision[0].title).toBe('Race winner');
          if (edit === 'detail')
            expect(
              JSON.stringify(rows.revision[0].typeSpecificSnapshot),
            ).toContain('Race winner');
          if (edit === 'targets')
            expect(rows.revision[0].targets[0].identityFingerprint).toBe(
              replacementTargets[0].identityFingerprint,
            );
        }
      } else expect(rows.content.status).toBe(AcademicContentStatus.ARCHIVED);
    }
  });

  it.each(['approve', 'request-changes'] as const)(
    'applies duplicate %s only once',
    async (decision) => {
      const content = await makeContent();
      await workflow.submit(command(content.id));
      const request = () =>
        workflow.decide({
          ...command(content.id),
          decision,
          note: decision === 'approve' ? null : 'Please revise',
        });
      const results = await Promise.allSettled([request(), request()]);
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      const rows = await state(content.id);
      expect(rows.approval).toHaveLength(1);
      expect(rows.content.status).toBe(rows.approval[0].status);
      expect(
        rows.audits.filter((audit) =>
          [
            'academics.academic_content.approve',
            'academics.academic_content.request_changes',
          ].includes(audit.action),
        ),
      ).toHaveLength(1);
    },
  );

  it('rejects a missing pending round and a V1 revision even while content is submitted', async () => {
    const noPending = await makeContent();
    await prisma.academicContent.update({
      where: { id: noPending.id },
      data: { status: AcademicContentStatus.SUBMITTED },
    });
    await expect(
      workflow.decide({
        ...command(noPending.id),
        decision: 'approve',
        note: null,
      }),
    ).rejects.toMatchObject({
      code: 'academic_content.approval.pending_missing',
    });

    const legacy = await makeContent();
    const revision = await prisma.academicContentRevision.create({
      data: {
        schoolId: ids.schoolA,
        academicContentId: legacy.id,
        revisionNumber: 1,
        snapshotContractVersion: 1,
        academicYearId: legacy.academicYearId,
        termId: legacy.termId,
        type: legacy.type,
        audience: legacy.audience,
        title: legacy.title,
        sourceStatus: AcademicContentStatus.DRAFT,
        capturedByUserId: ids.user,
      },
    });
    await prisma.academicContentApproval.create({
      data: {
        schoolId: ids.schoolA,
        academicContentId: legacy.id,
        revisionId: revision.id,
        roundNumber: 1,
        submittedByUserId: ids.user,
      },
    });
    await prisma.academicContent.update({
      where: { id: legacy.id },
      data: { status: AcademicContentStatus.SUBMITTED },
    });
    await expect(
      workflow.decide({
        ...command(legacy.id),
        decision: 'approve',
        note: null,
      }),
    ).rejects.toMatchObject({
      code: 'academic_content.approval.invalid_revision',
    });
    expect((await state(legacy.id)).approval[0].status).toBe(
      AcademicContentApprovalStatus.PENDING,
    );
  });

  it('rejects a pending approval that is no longer the latest round', async () => {
    const content = await makeContent();
    await workflow.submit(command(content.id));
    const latestRevision = await revisions.capture(command(content.id));
    await prisma.academicContentApproval.create({
      data: {
        schoolId: ids.schoolA,
        academicContentId: content.id,
        revisionId: latestRevision.id,
        roundNumber: 2,
        status: AcademicContentApprovalStatus.APPROVED,
        submittedByUserId: ids.user,
        decidedByUserId: ids.user,
        decidedAt: now,
      },
    });
    await expect(
      workflow.decide({
        ...command(content.id),
        decision: 'approve',
        note: null,
      }),
    ).rejects.toMatchObject({
      code: 'academic_content.approval.invalid_revision',
    });
    expect((await state(content.id)).approval[0].status).toBe(
      AcademicContentApprovalStatus.PENDING,
    );
  });

  it('serializes resubmission with an existing Preparation edit', async () => {
    const content = await makeContent();
    await workflow.submit(command(content.id));
    await workflow.decide({
      ...command(content.id),
      decision: 'request-changes',
      note: 'Edit topic',
    });
    const results = await Promise.allSettled([
      workflow.submit(command(content.id)),
      details.mutate({
        ...command(content.id),
        detail: prep('Concurrent revision'),
      }),
    ]);
    const rows = await state(content.id);
    expect(rows.content.status).toBe(AcademicContentStatus.SUBMITTED);
    expect(rows.approval).toHaveLength(2);
    expect(rows.revision).toHaveLength(2);
    expect(rows.revision[1].sourceStatus).toBe(
      AcademicContentStatus.CHANGES_REQUESTED,
    );
    if (results[1].status === 'fulfilled')
      expect(JSON.stringify(rows.revision[1].typeSpecificSnapshot)).toContain(
        'Concurrent revision',
      );
  });

  it('serializes policy disable against submission and preserves any existing pending round', async () => {
    const content = await makeContent();
    await Promise.allSettled([
      workflow.submit(command(content.id)),
      policies.updatePolicy({
        ...command(content.id),
        preparationApprovalRequired: false,
      }),
    ]);
    const rows = await state(content.id);
    expect(rows.approval).toHaveLength(rows.revision.length);
    expect(rows.approval.length).toBeLessThanOrEqual(1);
    expect(rows.content.status).toBe(
      rows.approval.length
        ? AcademicContentStatus.SUBMITTED
        : AcademicContentStatus.DRAFT,
    );
    if (rows.approval.length)
      await workflow.decide({
        ...command(content.id),
        decision: 'approve',
        note: null,
      });
    await policies.updatePolicy({
      ...command(content.id),
      preparationApprovalRequired: true,
    });
  });

  it('keeps archive eligibility in CHANGES_REQUESTED while delete retains revision-history protection', async () => {
    const content = await makeContent();
    await workflow.submit(command(content.id));
    await workflow.decide({
      ...command(content.id),
      decision: 'request-changes',
      note: 'Revise',
    });
    await expect(
      metadata.mutate({
        id: content.id,
        schoolId: ids.schoolA,
        organizationId: ids.organization,
        actorId: ids.user,
        action: 'delete',
        now,
      }),
    ).rejects.toMatchObject({ code: 'academic_content.revision_history' });
    const archived = await metadata.mutate({
      id: content.id,
      schoolId: ids.schoolA,
      organizationId: ids.organization,
      actorId: ids.user,
      action: 'archive',
      now,
    });
    expect(archived.status).toBe(AcademicContentStatus.ARCHIVED);
    await expect(workflow.submit(command(content.id))).rejects.toMatchObject({
      code: 'academic_content.approval.invalid_status',
    });
  });

  it('uses the existing authoring guards for metadata, targets, detail, links, tags and file eligibility', async () => {
    const content = await makeContent();
    const scope = command(content.id);
    const actions = () => [
      () =>
        metadata.mutate({
          id: content.id,
          schoolId: ids.schoolA,
          organizationId: ids.organization,
          actorId: ids.user,
          action: 'update' as const,
          now,
          changes: { title: 'Mutable title' },
        }),
      () =>
        targets.replace({
          content,
          targets: schoolTarget(),
          actorId: ids.user,
        }),
      () => details.mutate({ ...scope, detail: prep('Mutable topic') }),
      () =>
        linksTags.replaceLinks({
          ...scope,
          links: normalizeAcademicContentLinks([
            { label: 'Reference', url: 'https://example.test/reference' },
          ]),
        }),
      () =>
        linksTags.replaceTags({
          ...scope,
          tags: normalizeAcademicContentTags([{ value: 'Lesson' }]),
        }),
      () =>
        files.withTransaction(async (tx) =>
          tx.lockMutableContent(content.id, ids.schoolA, now),
        ),
    ];
    await workflow.submit(scope);
    for (const action of actions())
      await expect(action()).rejects.toMatchObject({
        code: 'academic_content.status.read_only',
      });
    await workflow.decide({
      ...scope,
      decision: 'request-changes',
      note: 'Revise',
    });
    for (const action of actions()) await action();
    await workflow.submit(scope);
    for (const action of actions())
      await expect(action()).rejects.toMatchObject({
        code: 'academic_content.status.read_only',
      });
    await workflow.decide({ ...scope, decision: 'approve', note: null });
    for (const action of actions())
      await expect(action()).rejects.toMatchObject({
        code: 'academic_content.status.read_only',
      });
  });

  it('creates and unlinks assets after changes are requested while revisions retain their snapshots', async () => {
    const content = await makeContent();
    const scope = command(content.id);
    const file = await prisma.file.create({
      data: {
        organizationId: ids.organization,
        schoolId: ids.schoolA,
        uploaderId: ids.user,
        bucket: 'acc6b-test',
        objectKey: randomUUID(),
        originalName: 'preparation.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1n,
      },
    });
    const addAsset = () =>
      files.withTransaction(async (tx) => {
        await tx.lockMutableContent(content.id, ids.schoolA, now);
        return tx.createAsset({
          schoolId: ids.schoolA,
          academicContentId: content.id,
          fileId: file.id,
          createdByUserId: ids.user,
        });
      });

    await workflow.submit(scope);
    await expect(addAsset()).rejects.toMatchObject({
      code: 'academic_content.status.read_only',
    });
    await workflow.decide({
      ...scope,
      decision: 'request-changes',
      note: 'Attach supporting material',
    });
    const asset = await addAsset();
    expect(asset.fileId).toBe(file.id);
    const second = await workflow.submit(scope);
    expect(
      await prisma.academicContentRevisionAsset.count({
        where: { revisionId: second.revisionId, fileId: file.id },
      }),
    ).toBe(1);
    await workflow.decide({
      ...scope,
      decision: 'request-changes',
      note: 'Remove supporting material',
    });
    const unlinked = await files.withTransaction(async (tx) => {
      await tx.lockMutableContent(content.id, ids.schoolA, now);
      return tx.softDeleteAsset(
        { assetId: asset.id, schoolId: ids.schoolA, contentId: content.id },
        now,
      );
    });
    expect(unlinked.deletedAt).toEqual(now);
    const third = await workflow.submit(scope);
    expect(
      await prisma.academicContentRevisionAsset.count({
        where: { revisionId: second.revisionId, fileId: file.id },
      }),
    ).toBe(1);
    expect(
      await prisma.academicContentRevisionAsset.count({
        where: { revisionId: third.revisionId, fileId: file.id },
      }),
    ).toBe(0);
    await expect(addAsset()).rejects.toMatchObject({
      code: 'academic_content.status.read_only',
    });
    await workflow.decide({ ...scope, decision: 'approve', note: null });
    await expect(addAsset()).rejects.toMatchObject({
      code: 'academic_content.status.read_only',
    });
  });
});
