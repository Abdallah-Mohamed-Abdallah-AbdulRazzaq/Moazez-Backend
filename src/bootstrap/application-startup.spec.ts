import { startApplicationRuntime } from './application-startup';

describe('startApplicationRuntime', () => {
  it('installs dual-listener shutdown ownership before startup becomes ready', async () => {
    const order: string[] = [];
    const shutdown = {
      install: jest.fn(() => order.push('shutdown-installed')),
    };

    await expect(
      startApplicationRuntime({
        listenManagement: jest.fn(async () => {
          order.push('management-listening');
        }),
        listenPublic: jest.fn(async () => {
          order.push('public-listening');
        }),
        createShutdownOwnership: jest.fn(() => {
          order.push('shutdown-created');
          return shutdown;
        }),
        markInitializationComplete: jest.fn(() => order.push('ready')),
        markInitializationFailed: jest.fn(),
        closeManagement: jest.fn().mockResolvedValue(undefined),
        closeApplication: jest.fn().mockResolvedValue(undefined),
      }),
    ).resolves.toBe(shutdown);

    expect(order).toEqual([
      'management-listening',
      'public-listening',
      'shutdown-created',
      'shutdown-installed',
      'ready',
    ]);
  });

  it.each(['management', 'public', 'shutdown'] as const)(
    'marks initialization failed and closes both resources after %s failure',
    async (stage) => {
      const failure = new Error(`${stage} failed`);
      const closeManagement = jest.fn().mockResolvedValue(undefined);
      const closeApplication = jest.fn().mockResolvedValue(undefined);
      const markInitializationComplete = jest.fn();
      const markInitializationFailed = jest.fn();

      await expect(
        startApplicationRuntime({
          listenManagement: jest.fn(async () => {
            if (stage === 'management') throw failure;
          }),
          listenPublic: jest.fn(async () => {
            if (stage === 'public') throw failure;
          }),
          createShutdownOwnership: jest.fn(() => ({
            install: () => {
              if (stage === 'shutdown') throw failure;
            },
          })),
          markInitializationComplete,
          markInitializationFailed,
          closeManagement,
          closeApplication,
        }),
      ).rejects.toBe(failure);

      expect(markInitializationFailed).toHaveBeenCalledTimes(1);
      expect(markInitializationComplete).not.toHaveBeenCalled();
      expect(closeManagement).toHaveBeenCalledTimes(1);
      expect(closeApplication).toHaveBeenCalledTimes(1);
    },
  );
});
