// 1. IMPORTS: The Express router, authentication and the broker that serves the stream.
import { Router } from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { type EventBrokerService } from '../services/EventBrokerService.js';

/**
 * 📡 EVENT STREAM ROUTE (issue #46): the Server-Sent Events endpoint, moved out of src/app.ts.
 * The path is written in full and the router is mounted at '/' (see authRoutes.ts).
 */
export function createEventRouter(eventBrokerService: EventBrokerService): Router {
  const router = Router();

  // AUTHENTICATED STREAM (issue #35): authMiddleware runs first. The browser's EventSource cannot set
  // an Authorization header, so it sends the session cookie (new EventSource(url, { withCredentials: true })).
  // The broker then keeps the response open and pushes queue events to it.
  router.get('/events', authMiddleware, (req, res) => {
    eventBrokerService.registerSSEClient(req, res);
  });

  return router;
}
