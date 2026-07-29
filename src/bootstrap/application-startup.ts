export interface ShutdownOwnership {
  install(): void;
}

export interface ApplicationStartupSteps {
  listenManagement(): Promise<void>;
  listenPublic(): Promise<void>;
  createShutdownOwnership(): ShutdownOwnership;
  markInitializationComplete(): void;
  markInitializationFailed(): void;
  closeManagement(): Promise<void>;
  closeApplication(): Promise<void>;
}

export async function startApplicationRuntime(
  steps: ApplicationStartupSteps,
): Promise<ShutdownOwnership> {
  try {
    await steps.listenManagement();
    await steps.listenPublic();
    const shutdown = steps.createShutdownOwnership();
    shutdown.install();
    steps.markInitializationComplete();
    return shutdown;
  } catch (error) {
    steps.markInitializationFailed();
    await Promise.allSettled([
      steps.closeManagement(),
      steps.closeApplication(),
    ]);
    throw error;
  }
}
