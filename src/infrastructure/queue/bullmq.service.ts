import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobsOptions, Processor, Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';

const DEFAULT_REMOVE_ON_COMPLETE = 100;
const DEFAULT_REMOVE_ON_FAIL = 500;

@Injectable()
export class BullmqService implements OnModuleDestroy {
  private readonly connection: IORedis;
  private readonly queues = new Map<string, Queue>();
  private readonly workers: Worker[] = [];

  constructor(private readonly configService: ConfigService) {
    this.connection = new IORedis(
      this.configService.getOrThrow<string>('REDIS_URL'),
      {
        lazyConnect: true,
        maxRetriesPerRequest: null,
      },
    );
  }

  getQueue(name: string): Queue {
    const existingQueue = this.queues.get(name);
    if (existingQueue) {
      return existingQueue;
    }

    const queue = new Queue(name, {
      connection: this.connection,
      defaultJobOptions: {
        removeOnComplete: DEFAULT_REMOVE_ON_COMPLETE,
        removeOnFail: DEFAULT_REMOVE_ON_FAIL,
      },
    });

    this.queues.set(name, queue);
    return queue;
  }

  addJob<TData extends object>(
    queueName: string,
    jobName: string,
    data: TData,
    options?: JobsOptions,
  ) {
    return this.getQueue(queueName).add(jobName, data, options);
  }

  createWorker<TData extends object, TResult = unknown>(
    queueName: string,
    processor: Processor<TData, TResult, string>,
  ): Worker<TData, TResult, string> {
    const worker = new Worker<TData, TResult, string>(queueName, processor, {
      connection: this.connection,
    });

    this.workers.push(worker as unknown as Worker);
    return worker;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(
      this.workers.map((worker) => worker.close()),
    );

    await Promise.all(
      [...this.queues.values()].map((queue) => queue.close()),
    );

    if (
      this.connection.status === 'ready' ||
      this.connection.status === 'connect' ||
      this.connection.status === 'reconnecting'
    ) {
      await this.connection.quit();
      return;
    }

    this.connection.disconnect();
  }
}
