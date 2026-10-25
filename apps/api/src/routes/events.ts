import { Router, Response } from 'express';
import { AuthenticatedRequest, authenticateApiKey } from '../middleware/auth.js';
import { eventBus } from '../events.js';

export const eventsRouter = Router();

// Handle browser EventSource query param fallback for API key
eventsRouter.use((req: any, res, next) => {
  if (!req.headers['authorization'] && req.query.apiKey) {
    req.headers['authorization'] = `Bearer ${req.query.apiKey}`;
  }
  next();
});

// SSE event stream
eventsRouter.get('/stream', authenticateApiKey, (req: AuthenticatedRequest, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const projectId = req.project!.id;

  // Initial connection acknowledgement
  res.write(`event: connected\ndata: ${JSON.stringify({
    connected: true,
    projectId,
    timestamp: new Date().toISOString(),
  })}\n\n`);

  // Register client
  eventBus.addClient(projectId, res);

  // Keep-alive heartbeat every 15s
  const keepAlive = setInterval(() => {
    try {
      res.write(': keep-alive\n\n');
    } catch {
      clearInterval(keepAlive);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(keepAlive);
  });
});
