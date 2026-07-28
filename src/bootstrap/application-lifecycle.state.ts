import { Injectable } from '@nestjs/common';

export type ApplicationWorkKind = 'http' | 'websocket';

export interface ApplicationWorkLease {
  release(): void;
}

@Injectable()
export class ApplicationLifecycleState {
  private draining = false;
  private activeWork = 0;
  private readonly idleWaiters = new Set<() => void>();

  isDraining(): boolean {
    return this.draining;
  }

  beginDraining(): boolean {
    if (this.draining) return false;
    this.draining = true;
    return true;
  }

  tryAdmit(_kind: ApplicationWorkKind): ApplicationWorkLease | null {
    if (this.draining) return null;

    this.activeWork += 1;
    let released = false;

    return {
      release: () => {
        if (released) return;
        released = true;
        this.activeWork -= 1;
        if (this.activeWork === 0) {
          for (const resolve of this.idleWaiters) resolve();
          this.idleWaiters.clear();
        }
      },
    };
  }

  getActiveWorkCount(): number {
    return this.activeWork;
  }

  waitForIdle(): Promise<void> {
    if (this.activeWork === 0) return Promise.resolve();

    return new Promise<void>((resolve) => {
      this.idleWaiters.add(resolve);
    });
  }
}
