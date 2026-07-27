export const BOOTSTRAP_FAILURE_EVENT = 'Application bootstrap failed';

interface BootstrapFailureProcess {
  exitCode?: string | number | null;
}

interface BootstrapFailureDependencies {
  log: (message: string) => void;
  processTarget: BootstrapFailureProcess;
}

export function handleBootstrapFailure(
  _error: unknown,
  dependencies: BootstrapFailureDependencies = {
    log: (message) => console.error(message),
    processTarget: process,
  },
): void {
  dependencies.log(BOOTSTRAP_FAILURE_EVENT);
  dependencies.processTarget.exitCode = 1;
}
