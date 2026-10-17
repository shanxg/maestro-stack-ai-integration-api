// 1. IMPORTS: The structured logger (a failed check is logged by name, never sent to the client).
import { logger } from '../logger.js';

// One dependency check: resolves true when the dependency can serve requests.
export type DependencyCheck = () => Promise<boolean>;

/**
 * 🩺 READINESS (issue #51):
 * Answers "can this replica serve traffic right now?" for GET /api/v1/health/ready, which the
 * Kubernetes readiness probe calls. A replica that is not ready is taken out of the Service
 * until it recovers, instead of receiving requests that would fail.
 *
 * - Every named check must pass (PostgreSQL answers, the RabbitMQ channel is open).
 * - During a graceful shutdown the replica reports "not ready" at once, so the load balancer
 *   stops sending new requests while the in-flight ones finish.
 * - CHEAP UNDER LOAD: the endpoint is public and sits outside the rate limiters (the probes
 *   alone would exceed the per-IP budget), so the result is reused for cacheMs. However many
 *   requests arrive, a replica runs the checks at most once per cacheMs.
 * - The response says only ready / not ready; which check failed goes to the server log, so
 *   the endpoint does not describe the internal topology to anonymous callers.
 */
export class ReadinessCheck {
  private shuttingDown = false;
  private lastResult: { ready: boolean; checkedAt: number } | null = null;

  constructor(
    private readonly checks: Record<string, DependencyCheck>,
    private readonly cacheMs: number
  ) {}

  // Called when the shutdown starts; from then on the replica is never ready again.
  markShuttingDown(): void {
    this.shuttingDown = true;
  }

  async isReady(): Promise<boolean> {
    if (this.shuttingDown) {
      return false;
    }

    // Reuse a recent result (see CHEAP UNDER LOAD above).
    const now = Date.now();
    if (this.lastResult && now - this.lastResult.checkedAt < this.cacheMs) {
      return this.lastResult.ready;
    }

    // Run the checks in parallel; a check that throws counts as failed.
    const results = await Promise.all(
      Object.entries(this.checks).map(async ([name, check]) => {
        const passed = await check().catch(() => false);
        if (!passed) {
          logger.warn({ component: 'health', check: name }, 'Readiness check failed');
        }
        return passed;
      })
    );

    const ready = results.every(Boolean);
    this.lastResult = { ready, checkedAt: now };
    return ready;
  }
}
