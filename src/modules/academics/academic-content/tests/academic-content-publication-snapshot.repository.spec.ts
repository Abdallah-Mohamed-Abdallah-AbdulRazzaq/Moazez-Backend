import { randomUUID } from 'node:crypto';
import {
  AcademicContentAudienceRecipientKind as Kind,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { AcademicContentRevisionAudienceResolver } from '../infrastructure/academic-content-revision-audience.resolver';
import { AcademicContentPublicationSnapshotRepository } from '../infrastructure/academic-content-publication-snapshot.repository';
import { academicContentRecipientIdentity } from '../domain/academic-content-publication.policy';

describe('publication snapshot bounded persistence', () => {
  function fixture() {
    const input = {
      schoolId: randomUUID(),
      contentId: randomUUID(),
      publicationId: randomUUID(),
      now: new Date('2026-10-03T12:00:00Z'),
    };
    const revisionId = randomUUID(),
      targetIds: string[] = [randomUUID(), randomUUID()].sort();
    const students = Array.from({ length: 1001 }, () => ({
      studentId: randomUUID(),
      enrollmentId: randomUUID(),
      classroomId: randomUUID(),
      recipientUserId: null,
      matchedRevisionTargetIds: targetIds,
    }));
    const guardians = students.slice(0, 2).map((row) => ({
      ...row,
      guardianId: randomUUID(),
      guardianCanReceiveNotifications: false,
    }));
    const publication = {
      id: input.publicationId,
      revisionId,
      status: 'SCHEDULED',
      publishedAt: null as Date | null,
      publishAt: input.now,
      visibleFrom: input.now,
      visibleUntil: null as Date | null,
      studentRecipientCount: 0,
      guardianRecipientContextCount: 0,
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: input.contentId }]),
      academicContent: {
        findFirstOrThrow: jest.fn().mockResolvedValue({
          status: 'SCHEDULED',
          school: { organizationId: randomUUID() },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      academicContentPublication: {
        findFirstOrThrow: jest.fn().mockResolvedValue(publication),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      academicContentAudienceRecipient: {
        groupBy: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        createMany: jest.fn(
          ({
            data,
          }: {
            data: Prisma.AcademicContentAudienceRecipientCreateManyInput[];
          }) => Promise.resolve({ count: data.length }),
        ),
      },
      academicContentAudienceRecipientTarget: {
        createMany: jest.fn(
          ({
            data,
          }: {
            data: Prisma.AcademicContentAudienceRecipientTargetCreateManyInput[];
          }) => Promise.resolve({ count: data.length }),
        ),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      academicContentRevision: { count: jest.fn().mockResolvedValue(1) },
    };
    const audience = {
      resolveBatches: jest.fn(async function* () {
        yield await Promise.resolve({
          students: students.slice(0, 500),
          guardians: [],
        });
        expect(
          tx.academicContentAudienceRecipient.createMany,
        ).toHaveBeenCalledTimes(1);
        expect(
          tx.academicContentAudienceRecipientTarget.createMany,
        ).toHaveBeenCalledTimes(2);
        yield { students: students.slice(500, 1000), guardians: [] };
        expect(
          tx.academicContentAudienceRecipient.createMany,
        ).toHaveBeenCalledTimes(2);
        expect(
          tx.academicContentAudienceRecipientTarget.createMany,
        ).toHaveBeenCalledTimes(4);
        yield { students: students.slice(1000), guardians };
      }),
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: unknown) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    const repo = new AcademicContentPublicationSnapshotRepository(
      prisma as unknown as PrismaService,
      audience as unknown as AcademicContentRevisionAudienceResolver,
    );
    return {
      input,
      revisionId,
      targetIds,
      students,
      guardians,
      tx,
      audience,
      prisma,
      repo,
      publication,
    };
  }
  it('persists 1003 contexts and 2006 joins in batches of at most 500 without duplicate skipping', async () => {
    const f = fixture();
    const result = await f.repo.publishScheduledPublication(f.input);
    const calls =
      f.tx.academicContentAudienceRecipient.createMany.mock.calls.map(
        ([args]) => args,
      );
    const joins =
      f.tx.academicContentAudienceRecipientTarget.createMany.mock.calls.map(
        ([args]) => args,
      );
    expect(calls.map((args) => args.data.length)).toEqual([500, 500, 3]);
    expect(joins.map((args) => args.data.length)).toEqual([
      500, 500, 500, 500, 6,
    ]);
    for (const args of [...calls, ...joins])
      expect(Object.keys(args)).toEqual(['data']);
    const rows = calls.flatMap((args) => args.data);
    expect(new Set(rows.map((row) => row.id)).size).toBe(1003);
    expect(rows[0]).toMatchObject({
      recipientKind: Kind.STUDENT,
      recipientUserId: null,
      identityFingerprint: academicContentRecipientIdentity({
        recipientKind: Kind.STUDENT,
        enrollmentId: f.students[0].enrollmentId,
      }).identityFingerprint,
    });
    expect(rows[1001]).toMatchObject({
      recipientKind: Kind.GUARDIAN,
      guardianCanReceiveNotifications: false,
      recipientUserId: null,
    });
    expect(
      joins
        .flatMap((args) => args.data)
        .every(
          (row) =>
            row.revisionId === f.revisionId &&
            f.targetIds.includes(row.revisionTargetId),
        ),
    ).toBe(true);
    expect(f.audience.resolveBatches).toHaveBeenCalledWith(f.tx, {
      schoolId: f.input.schoolId,
      contentId: f.input.contentId,
      revisionId: f.revisionId,
    });
    expect(f.prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: 'RepeatableRead' }),
    );
    expect(result).toEqual({
      outcome: 'PUBLISHED',
      publicationId: f.input.publicationId,
      revisionId: f.revisionId,
      status: 'PUBLISHED',
      publishedAt: f.input.now,
      studentRecipientCount: 1001,
      guardianRecipientContextCount: 2,
    });
    expect(f.tx.academicContentPublication.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: f.input.publicationId,
          schoolId: f.input.schoolId,
          academicContentId: f.input.contentId,
          revisionId: f.revisionId,
          status: 'SCHEDULED',
        },
      }),
    );
    expect(f.tx.academicContent.updateMany).toHaveBeenCalledWith({
      where: {
        id: f.input.contentId,
        schoolId: f.input.schoolId,
        deletedAt: null,
        status: 'SCHEDULED',
      },
      data: { status: 'PUBLISHED', updatedByUserId: null },
    });
  });
  it.each(['recipient', 'target', 'publication', 'content'])(
    'fails closed on an incorrect %s affected-row count',
    async (step) => {
      const f = fixture();
      if (step === 'recipient')
        f.tx.academicContentAudienceRecipient.createMany.mockResolvedValue({
          count: 0,
        });
      if (step === 'target')
        f.tx.academicContentAudienceRecipientTarget.createMany.mockResolvedValue(
          { count: 0 },
        );
      if (step === 'publication')
        f.tx.academicContentPublication.updateMany.mockResolvedValue({
          count: 0,
        });
      if (step === 'content')
        f.tx.academicContent.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        f.repo.publishScheduledPublication(f.input),
      ).rejects.toMatchObject({
        code: 'academic_content.publication.snapshot_conflict',
      });
      expect(f.tx.auditLog.create).not.toHaveBeenCalled();
    },
  );
  const serializationFailure = () =>
    new Prisma.PrismaClientKnownRequestError('serialization failure', {
      code: 'P2034',
      clientVersion: '6.19.3',
    });
  it('retries serialization with a fresh transaction, then stops after three attempts', async () => {
    const f = fixture();
    f.prisma.$transaction
      .mockRejectedValueOnce(serializationFailure())
      .mockRejectedValueOnce(serializationFailure());
    await expect(
      f.repo.publishScheduledPublication(f.input),
    ).resolves.toMatchObject({ outcome: 'PUBLISHED' });
    expect(f.prisma.$transaction).toHaveBeenCalledTimes(3);
    const exhausted = fixture();
    exhausted.prisma.$transaction.mockRejectedValue(serializationFailure());
    await expect(
      exhausted.repo.publishScheduledPublication(exhausted.input),
    ).rejects.toMatchObject({
      code: 'academic_content.publication.snapshot_conflict',
    });
    expect(exhausted.prisma.$transaction).toHaveBeenCalledTimes(3);
    expect(exhausted.audience.resolveBatches).not.toHaveBeenCalled();
  });
  it('propagates a nonserialization failure without retry', async () => {
    const f = fixture();
    f.prisma.$transaction.mockRejectedValue(new Error('injected'));
    await expect(f.repo.publishScheduledPublication(f.input)).rejects.toThrow(
      'injected',
    );
    expect(f.prisma.$transaction).toHaveBeenCalledTimes(1);
  });
  it('restarts streamed discovery after serialization failure during persistence', async () => {
    const f = fixture();
    const starts: string[] = [];
    f.audience.resolveBatches.mockImplementation(async function* () {
      starts.push(f.students[0].enrollmentId);
      yield await Promise.resolve({
        students: f.students.slice(0, 500),
        guardians: [],
      });
      yield { students: f.students.slice(500, 1000), guardians: [] };
      yield { students: f.students.slice(1000), guardians: f.guardians };
    });
    f.tx.academicContentAudienceRecipientTarget.createMany.mockRejectedValueOnce(
      serializationFailure(),
    );
    await expect(
      f.repo.publishScheduledPublication(f.input),
    ).resolves.toMatchObject({
      studentRecipientCount: 1001,
      guardianRecipientContextCount: 2,
    });
    expect(starts).toEqual([
      f.students[0].enrollmentId,
      f.students[0].enrollmentId,
    ]);
    expect(f.prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(f.tx.auditLog.create).toHaveBeenCalledTimes(1);
  });
  it.each([
    'CANCELLED',
    'EXPIRED',
    'NOT_DUE',
    'MISSED_VISIBILITY_WINDOW',
    'ALREADY_PUBLISHED',
  ])(
    'returns %s before audience discovery or snapshot writes',
    async (outcome) => {
      const f = fixture();
      const row = { ...f.publication };
      if (outcome === 'CANCELLED' || outcome === 'EXPIRED')
        row.status = outcome;
      if (outcome === 'NOT_DUE')
        row.publishAt = new Date(f.input.now.getTime() + 1000);
      if (outcome === 'MISSED_VISIBILITY_WINDOW')
        Object.assign(row, { visibleUntil: f.input.now });
      if (outcome === 'ALREADY_PUBLISHED') {
        Object.assign(row, { status: 'PUBLISHED', publishedAt: f.input.now });
        f.tx.academicContent.findFirstOrThrow.mockResolvedValue({
          status: 'PUBLISHED',
          school: { organizationId: randomUUID() },
        });
      }
      f.tx.academicContentPublication.findFirstOrThrow.mockResolvedValue(row);
      await expect(
        f.repo.publishScheduledPublication(f.input),
      ).resolves.toMatchObject({
        outcome:
          outcome === 'CANCELLED' || outcome === 'EXPIRED'
            ? 'TERMINAL_NOOP'
            : outcome,
      });
      expect(f.audience.resolveBatches).not.toHaveBeenCalled();
      expect(
        f.tx.academicContentAudienceRecipient.createMany,
      ).not.toHaveBeenCalled();
      expect(f.tx.auditLog.create).not.toHaveBeenCalled();
    },
  );
  it('keeps publish audit output free of recipient identities and arrays', async () => {
    const f = fixture();
    await f.repo.publishScheduledPublication(f.input);
    const serialized = JSON.stringify(f.tx.auditLog.create.mock.calls);
    expect(serialized).not.toMatch(
      /recipients|identityFingerprint|recipientUserId|studentId|guardianId|enrollmentId|bucket|objectKey|joinUrl/,
    );
    for (const row of f.students) {
      expect(serialized).not.toContain(row.studentId);
      expect(serialized).not.toContain(row.enrollmentId);
    }
  });
  it('retries raw PostgreSQL serialization errors from the parent lock', async () => {
    const f = fixture();
    f.prisma.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('could not serialize access', {
        code: 'P2010',
        clientVersion: '6.19.3',
        meta: { code: '40001' },
      }),
    );
    await expect(
      f.repo.publishScheduledPublication(f.input),
    ).resolves.toMatchObject({ outcome: 'PUBLISHED' });
    expect(f.prisma.$transaction).toHaveBeenCalledTimes(2);
  });
  it.each(['uuid', 'instant'])(
    'rejects invalid %s before entering a transaction',
    async (invalid) => {
      const f = fixture();
      await expect(
        f.repo.publishScheduledPublication({
          ...f.input,
          ...(invalid === 'uuid'
            ? { schoolId: 'invalid' }
            : { now: new Date('invalid') }),
        }),
      ).rejects.toBeDefined();
      expect(f.prisma.$transaction).not.toHaveBeenCalled();
    },
  );
});
