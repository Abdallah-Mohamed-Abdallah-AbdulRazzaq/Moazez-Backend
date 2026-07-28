import { ApplicationLifecycleState } from './application-lifecycle.state';

describe('ApplicationLifecycleState', () => {
  it('waits for admitted work and rejects intake after draining begins', async () => {
    const state = new ApplicationLifecycleState();
    const http = state.tryAdmit('http');
    const websocket = state.tryAdmit('websocket');

    expect(http).not.toBeNull();
    expect(websocket).not.toBeNull();
    expect(state.getActiveWorkCount()).toBe(2);
    expect(state.beginDraining()).toBe(true);
    expect(state.beginDraining()).toBe(false);
    expect(state.tryAdmit('http')).toBeNull();

    let idle = false;
    const waiting = state.waitForIdle().then(() => {
      idle = true;
    });

    http?.release();
    http?.release();
    expect(idle).toBe(false);
    websocket?.release();
    await waiting;

    expect(idle).toBe(true);
    expect(state.getActiveWorkCount()).toBe(0);
  });
});
