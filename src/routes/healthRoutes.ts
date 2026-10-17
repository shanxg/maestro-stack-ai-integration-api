// 1. IMPORTS: The Express router and the readiness state.
import { Router } from 'express';
import { type ReadinessCheck } from '../health/readiness.js';

/**
 * 🩺 HEALTH ROUTES (issue #51): the two endpoints the Kubernetes probes call (k8s/deployment.yaml).
 * Public (probes send no credentials) and registered before the rate limiters in src/app.ts, so
 * the probes never use up the per-IP budget and never get a 429 that would restart a healthy pod.
 * Under /api/v1 like every other route (issue #49).
 */
export function createHealthRouter(readiness: ReadinessCheck): Router {
  const router = Router();

  // LIVENESS: the process is up and its event loop answers. No dependency is checked here: a
  // database outage must not make Kubernetes restart every replica, it only makes them not ready.
  router.get('/api/v1/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // READINESS: the replica can serve traffic (dependencies answer and it is not shutting down).
  // 503 takes it out of the Service until it recovers.
  router.get('/api/v1/health/ready', async (_req, res) => {
    const ready = await readiness.isReady();
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready' });
  });

  return router;
}
