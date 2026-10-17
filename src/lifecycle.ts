// 1. IMPORTS: The structured logger.
import { logger } from './logger.js';

// What the signal handler needs from the running API: a shutdown that releases everything.
export type ShutdownTarget = { shutdown: () => Promise<void> };

// The parts of 'process' the handler uses, so tests can pass a stand-in.
export type ProcessLike = {
  once: (signal: 'SIGTERM' | 'SIGINT', listener: () => void) => unknown;
  exit: (code: number) => void;
};

/**
 * 🛑 GRACEFUL SHUTDOWN ON SIGNALS (issue #51):
 * Kubernetes and Docker stop a container with SIGTERM, then SIGKILL after a grace period
 * (30 seconds by default); Ctrl+C sends SIGINT. Before, the API had no handler: Node.js as the
 * container's PID 1 ignores SIGTERM, so every stop waited for the SIGKILL, and in-flight
 * requests, open event streams and queue messages were cut off.
 *
 * On the first signal the API shuts down in order (see shutdown() in src/app.ts) and exits 0.
 * A second signal is ignored while that runs. If the shutdown does not finish within timeoutMs,
 * the process exits 1 anyway, before the orchestrator's SIGKILL.
 */
export function registerShutdownSignals(target: ShutdownTarget, timeoutMs: number, proc: ProcessLike = process): void {
  let started = false;

  const onSignal = (signal: 'SIGTERM' | 'SIGINT') => () => {
    if (started) return;
    started = true;
    logger.info({ component: 'lifecycle', signal }, 'Shutdown signal received; closing connections');

    // Safety net: a dependency that never answers must not keep the process alive. unref() keeps
    // this timer from holding the event loop open when everything else has closed.
    const forceExit = setTimeout(() => {
      logger.error({ component: 'lifecycle', timeoutMs }, 'Shutdown timed out; exiting');
      proc.exit(1);
    }, timeoutMs);
    forceExit.unref?.();

    target
      .shutdown()
      .then(() => {
        clearTimeout(forceExit);
        logger.info({ component: 'lifecycle' }, 'Shutdown complete');
        proc.exit(0);
      })
      .catch((error: unknown) => {
        clearTimeout(forceExit);
        logger.error({ component: 'lifecycle', err: error }, 'Shutdown failed');
        proc.exit(1);
      });
  };

  proc.once('SIGTERM', onSignal('SIGTERM'));
  proc.once('SIGINT', onSignal('SIGINT'));
}
