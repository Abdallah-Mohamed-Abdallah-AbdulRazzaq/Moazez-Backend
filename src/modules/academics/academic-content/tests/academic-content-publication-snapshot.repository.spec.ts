import { randomUUID } from 'node:crypto';
import {
  AcademicContentAudienceRecipientKind as Kind,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { AcademicContentRevisionAudienceResolver } from '../application/academic-content-revision-audience.resolver';
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
        findFirstOrThrow: jest.fn().mockResolvedValue({
          id: input.publicationId,
          revisionId,
          status: 'SCHEDULED',
          publishedAt: null,
          publishAt: input.now,
          visibleFrom: input.now,
          visibleUntil: null,
          studentRecipientCount: 0,
          guardianRecipientContextCount: 0,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      academicContentAudienceRecipient: {
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
    };
    const audience = {
      resolve: jest.fn().mockResolvedValue({ students, guardians }),
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
    expect(f.audience.resolve).toHaveBeenCalledWith(f.tx, {
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
    expect(exhausted.audience.resolve).not.toHaveBeenCalled();
  });
  it('propagates a nonserialization failure without retry', async () => {
    const f = fixture();
    f.prisma.$transaction.mockRejectedValue(new Error('injected'));
    await expect(f.repo.publishScheduledPublication(f.input)).rejects.toThrow(
      'injected',
    );
    expect(f.prisma.$transaction).toHaveBeenCalledTimes(1);
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
