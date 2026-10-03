import type { JobsOptions } from 'bullmq';
import { randomUUID } from 'node:crypto';
import {
  AcademicContentPublicationStatus as Status,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActor,
  setActiveMembership,
} from '../../../../common/context/request-context';
import { BullmqService } from '../../../../infrastructure/queue/bullmq.service';
import { AcademicContentPublicationQueueService } from '../application/academic-content-publication-queue.service';
import { AcademicContentPublicationReconciliationService } from '../application/academic-content-publication-reconciliation.service';
import { AcademicContentPublicationRuntimeRepository } from '../infrastructure/academic-content-publication-runtime.repository';
import { AcademicContentPublicationWorker } from '../infrastructure/academic-content-publication.worker';
import {
  CancelAcademicContentPublicationUseCase,
  ScheduleAcademicContentPublicationUseCase,
} from '../application/academic-content-publication.use-cases';
import {
  academicContentPublicationJobId,
  ACADEMIC_CONTENT_PUBLICATION_QUEUE,
} from '../domain/academic-content-publication-runtime.constants';
import { isAcademicContentPublicationVisibleAt } from '../domain/academic-content-publication.policy';

describe('ACC-7D publication runtime contracts', () => {
  const identity = {
    schoolId: randomUUID(),
    contentId: randomUUID(),
    publicationId: randomUUID(),
  };
  const organizationId = randomUUID(),
    actorId = randomUUID();
  const now = new Date('2026-10-03T12:00:00Z');
  const row = {
    id: identity.publicationId,
    schoolId: identity.schoolId,
    academicContentId: identity.contentId,
    publishAt: new Date(now.getTime() + 60_000),
    visibleUntil: new Date(now.getTime() + 120_000),
    status: Status.SCHEDULED,
  };
  const repository = {
    find: jest.fn(),
    listDuePublish: jest.fn(),
    listDueExpiry: jest.fn(),
  };
  const bullmq = { ensureJobFromPersistedTruth: jest.fn() };
  const producer = new AcademicContentPublicationQueueService(
    bullmq as unknown as BullmqService,
    repository as unknown as AcademicContentPublicationRuntimeRepository,
  );
  beforeEach(() => {
    jest.clearAllMocks();
    repository.find.mockResolvedValue(row);
    bullmq.ensureJobFromPersistedTruth.mockResolvedValue('created');
  });

  it('uses exact deterministic identity, bounded retries, and persisted publish delay', async () => {
    await producer.ensure('publish', identity, now);
    expect(bullmq.ensureJobFromPersistedTruth).toHaveBeenCalledWith(
      ACADEMIC_CONTENT_PUBLICATION_QUEUE,
      'publish',
      identity,
      {
        jobId: academicContentPublicationJobId('publish', identity),
        delay: 60_000,
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: false,
        removeOnFail: false,
      },
    );
  });
  it('uses expiry timing from a fresh tenant-bound persisted read', async () => {
    repository.find.mockResolvedValue({ ...row, status: Status.PUBLISHED });
    await producer.ensure('expire', identity, now);
    expect(repository.find).toHaveBeenCalledWith(identity);
    const call = bullmq.ensureJobFromPersistedTruth.mock.calls[0] as [
      string,
      string,
      typeof identity,
      JobsOptions,
    ];
    expect(call[3]).toMatchObject({
      jobId: academicContentPublicationJobId('expire', identity),
      delay: 120_000,
    });
  });
  it.each([
    null,
    { ...row, status: Status.CANCELLED },
    { ...row, status: Status.EXPIRED },
    { ...row, status: Status.PUBLISHED },
  ])('does not recreate publish work for %j', async (persisted) => {
    repository.find.mockResolvedValue(persisted);
    expect(await producer.ensure('publish', identity, now)).toBe(
      'not_required',
    );
    expect(bullmq.ensureJobFromPersistedTruth).not.toHaveBeenCalled();
  });
  it.each([Status.SCHEDULED, Status.EXPIRED, Status.CANCELLED])(
    'does not fabricate expiry for %s',
    async (status) => {
      repository.find.mockResolvedValue({ ...row, status });
      await producer.ensure('expire', identity, now);
      expect(bullmq.ensureJobFromPersistedTruth).not.toHaveBeenCalled();
    },
  );
  it('never enqueues expiry without visibleUntil', async () => {
    repository.find.mockResolvedValue({
      ...row,
      status: Status.PUBLISHED,
      visibleUntil: null,
    });
    await producer.ensure('expire', identity, now);
    expect(bullmq.ensureJobFromPersistedTruth).not.toHaveBeenCalled();
  });
  it('bounds postcommit outage logging and resolves queue failure', async () => {
    bullmq.ensureJobFromPersistedTruth.mockRejectedValue(
      new Error('secret stack payload'),
    );
    const warn = jest.spyOn(producer['logger'], 'warn').mockImplementation();
    await expect(
      producer.ensureAfterCommit('publish', identity, now),
    ).resolves.toBeUndefined();
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/secret|stack|payload/);
    warn.mockRestore();
  });
  function asActor<T>(
    userType: UserType,
    permissions: string[],
    action: () => T,
  ) {
    return runWithRequestContext(createRequestContext(), () => {
      setActor({ id: actorId, userType });
      setActiveMembership({
        membershipId: randomUUID(),
        schoolId: identity.schoolId,
        organizationId,
        roleId: randomUUID(),
        permissions,
      });
      return action();
    });
  }
  it('waits for schedule commit before producer, returns committed result, and retries same intent', async () => {
    let commit!: (result: object) => void;
    const scheduled = { ...row, publicationId: identity.publicationId };
    const db = {
      schedule: jest.fn().mockReturnValue(
        new Promise((resolve) => {
          commit = resolve;
        }),
      ),
    };
    const ensureAfterCommit = jest.fn().mockResolvedValue(undefined);
    const useCase = new ScheduleAcademicContentPublicationUseCase(
      db as never,
      { ensureAfterCommit } as never,
    );
    const command = { clientRequestId: randomUUID() };
    const result = asActor(
      UserType.SCHOOL_USER,
      ['academics.academic_content.publish'],
      () => useCase.execute(identity.contentId, command),
    );
    expect(ensureAfterCommit).not.toHaveBeenCalled();
    commit(scheduled);
    expect(await result).toBe(scheduled);
    db.schedule.mockResolvedValue(scheduled);
    expect(
      await asActor(
        UserType.ORGANIZATION_USER,
        ['academics.academic_content.publish'],
        () => useCase.execute(identity.contentId, command),
      ),
    ).toBe(scheduled);
    expect(ensureAfterCommit).toHaveBeenCalledTimes(2);
  });
  it.each([Status.PUBLISHED, Status.EXPIRED, Status.CANCELLED])(
    'schedule exact retry does not enqueue %s',
    async (status) => {
      const ensureAfterCommit = jest.fn();
      const useCase = new ScheduleAcademicContentPublicationUseCase(
        {
          schedule: jest.fn().mockResolvedValue({
            ...row,
            status,
            publicationId: identity.publicationId,
          }),
        } as never,
        { ensureAfterCommit } as never,
      );
      await asActor(
        UserType.SCHOOL_USER,
        ['academics.academic_content.publish'],
        () =>
          useCase.execute(identity.contentId, {
            clientRequestId: randomUUID(),
          }),
      );
      expect(ensureAfterCommit).not.toHaveBeenCalled();
    },
  );
  it.each([
    UserType.STUDENT,
    UserType.PARENT,
    UserType.TEACHER,
    UserType.SERVICE_ACCOUNT,
  ])('rejects published cancellation by %s before persistence', (type) => {
    const cancel = jest.fn();
    const useCase = new CancelAcademicContentPublicationUseCase({
      cancel,
    } as never);
    expect(() =>
      asActor(type, ['academics.academic_content.publish'], () =>
        useCase.execute(identity.contentId, identity.publicationId),
      ),
    ).toThrow();
    expect(cancel).not.toHaveBeenCalled();
  });
  it.each([UserType.SCHOOL_USER, UserType.ORGANIZATION_USER])(
    'uses publish permission and exact active scope for %s cancellation',
    async (type) => {
      const cancel = jest
        .fn()
        .mockResolvedValue({ publicationId: identity.publicationId });
      const useCase = new CancelAcademicContentPublicationUseCase({
        cancel,
      } as never);
      expect(() =>
        asActor(type, ['academics.academic_content.manage'], () =>
          useCase.execute(identity.contentId, identity.publicationId),
        ),
      ).toThrow();
      await asActor(type, ['academics.academic_content.publish'], () =>
        useCase.execute(identity.contentId, identity.publicationId),
      );
      expect(cancel).toHaveBeenCalledWith({
        ...identity,
        organizationId,
        actorId,
        now: (cancel.mock.calls[0] as [{ now: Date }])[0].now,
      });
    },
  );
  function worker() {
    const snapshots = { publishScheduledPublication: jest.fn() },
      lifecycle = {
        expire: jest.fn().mockResolvedValue({ outcome: 'EXPIRED' }),
      };
    const queue = { ensureAfterCommit: jest.fn() },
      reconciliation = { reconcile: jest.fn() },
      service = { createWorker: jest.fn() };
    return {
      snapshots,
      lifecycle,
      queue,
      reconciliation,
      service,
      instance: new AcademicContentPublicationWorker(
        service as never,
        snapshots as never,
        lifecycle as never,
        queue as never,
        reconciliation as never,
      ),
    };
  }
  it('registers exactly one managed consumer and dispatches global reconcile', async () => {
    const w = worker();
    w.instance.onModuleInit();
    expect(w.service.createWorker).toHaveBeenCalledTimes(1);
    expect(w.service.createWorker).toHaveBeenCalledWith(
      ACADEMIC_CONTENT_PUBLICATION_QUEUE,
      expect.any(Function),
    );
    await w.instance.process('reconcile', {}, now);
    expect(w.reconciliation.reconcile).toHaveBeenCalledWith(now);
    expect(w.snapshots.publishScheduledPublication).not.toHaveBeenCalled();
  });
  it.each(['PUBLISHED', 'ALREADY_PUBLISHED'])(
    'reuses snapshot primitive for %s and ensures expiry afterward',
    async (outcome) => {
      const w = worker();
      w.snapshots.publishScheduledPublication.mockResolvedValue({ outcome });
      await w.instance.process('publish', identity, now);
      expect(w.snapshots.publishScheduledPublication).toHaveBeenCalledWith({
        ...identity,
        now,
      });
      expect(w.queue.ensureAfterCommit).toHaveBeenCalledWith(
        'expire',
        identity,
        now,
      );
      expect(w.lifecycle.expire).not.toHaveBeenCalled();
    },
  );
  it.each(['NOT_DUE', 'TERMINAL_NOOP'])(
    'does not enqueue or expire for %s',
    async (outcome) => {
      const w = worker();
      w.snapshots.publishScheduledPublication.mockResolvedValue({ outcome });
      await w.instance.process('publish', identity, now);
      expect(w.queue.ensureAfterCommit).not.toHaveBeenCalled();
      expect(w.lifecycle.expire).not.toHaveBeenCalled();
    },
  );
  it('expires a missed window using the exact persisted identity', async () => {
    const w = worker();
    w.snapshots.publishScheduledPublication.mockResolvedValue({
      outcome: 'MISSED_VISIBILITY_WINDOW',
    });
    await w.instance.process('publish', identity, now);
    expect(w.lifecycle.expire).toHaveBeenCalledWith({ ...identity, now });
    expect(w.queue.ensureAfterCommit).not.toHaveBeenCalled();
  });
  it.each([
    ['unknown', identity],
    ['publish', {}],
    ['expire', { publicationId: identity.publicationId }],
    ['publish', { ...identity, schoolId: 'bad' }],
    ['expire', null],
    ['reconcile', { schoolId: identity.schoolId }],
  ])('rejects poison %s %j before DB access', async (name, data) => {
    const w = worker();
    await expect(w.instance.process(name, data, now)).rejects.toThrow(
      /academic_content_publication_job_(unknown|invalid)/,
    );
    expect(w.snapshots.publishScheduledPublication).not.toHaveBeenCalled();
    expect(w.lifecycle.expire).not.toHaveBeenCalled();
    expect(w.reconciliation.reconcile).not.toHaveBeenCalled();
  });
  it('paginates over 100 candidates with stable cursors and bounded summaries', async () => {
    const rows = Array.from({ length: 205 }, (_, i) => ({
      ...row,
      id: String(i).padStart(3, '0'),
      publishAt: now,
    }));
    repository.listDuePublish
      .mockResolvedValueOnce(rows.slice(0, 100))
      .mockResolvedValueOnce(rows.slice(100, 200))
      .mockResolvedValueOnce(rows.slice(200));
    repository.listDueExpiry.mockResolvedValue([]);
    const ensure = jest
      .fn()
      .mockResolvedValueOnce('created')
      .mockResolvedValueOnce('replaced')
      .mockResolvedValueOnce('replacement_contended')
      .mockResolvedValue('preserved');
    const service = new AcademicContentPublicationReconciliationService(
      repository as never,
      { ensure } as never,
    );
    expect(await service.reconcile(now)).toEqual({
      scanned: 205,
      created: 1,
      replaced: 1,
      replacementContended: 1,
      preserved: 202,
      notRequired: 0,
    });
    expect(repository.listDuePublish.mock.calls).toEqual([
      [now, undefined],
      [now, { at: now, id: '099' }],
      [now, { at: now, id: '199' }],
    ]);
    expect(
      new Set(
        ensure.mock.calls.map(
          (call) =>
            (call as [string, { publicationId: string }])[1].publicationId,
        ),
      ).size,
    ).toBe(205);
  });
  it.each([
    [-1, false],
    [0, true],
    [59_999, true],
    [60_000, false],
  ])('visibility is correct at offset %s', (offset, expected) => {
    expect(
      isAcademicContentPublicationVisibleAt(
        {
          status: Status.PUBLISHED,
          publishedAt: now,
          visibleFrom: now,
          visibleUntil: new Date(now.getTime() + 60_000),
        },
        new Date(now.getTime() + offset),
      ),
    ).toBe(expected);
  });
  it.each([Status.EXPIRED, Status.CANCELLED, Status.SCHEDULED])(
    'terminal or scheduled %s is invisible',
    (status) => {
      expect(
        isAcademicContentPublicationVisibleAt(
          { status, publishedAt: now, visibleFrom: now, visibleUntil: null },
          now,
        ),
      ).toBe(false);
    },
  );
});
