import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { healthRouter } from './routes/health.js';
import { whoamiRouter } from './routes/whoami.js';
import { projectsRouter } from './routes/projects.js';
import { devicesRouter } from './routes/devices.js';
import { messagesRouter } from './routes/messages.js';
import { otpRouter } from './routes/otp.js';
import { optOutsRouter } from './routes/optouts.js';
import { broadcastsRouter } from './routes/broadcasts.js';
import { webhooksRouter } from './routes/webhooks.js';
import { eventsRouter } from './routes/events.js';

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`[HTTP ${req.method}] ${req.url} (from ${req.ip})`);
  next();
});

// Liveness check
app.use('/health', healthRouter);

// Versioned API routes
app.use('/v1/whoami', whoamiRouter);
app.use('/v1/projects', projectsRouter);
app.use('/v1/devices', devicesRouter);
app.use('/v1', devicesRouter); // mounts /v1/jobs/:id/result directly
app.use('/v1/messages', messagesRouter);
app.use('/v1/otp', otpRouter);
app.use('/v1/opt-outs', optOutsRouter);
app.use('/v1/broadcasts', broadcastsRouter);
app.use('/v1/webhooks', webhooksRouter);
app.use('/v1/events', eventsRouter);

// Root informational endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'SMS Gateway Platform API',
    version: '1.0.0',
    documentation: '/health',
    environment: config.env,
    simulatorMode: config.simulatorMode,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: `Not Found: ${req.method} ${req.path}` });
});

app.listen(config.port, () => {
  console.log(`[SMS Gateway API] Listening on port ${config.port}`);
  console.log(`[SMS Gateway API] Environment: ${config.env}`);
  console.log(`[SMS Gateway API] Simulator Mode: ${config.simulatorMode ? 'ENABLED' : 'DISABLED'}`);
});

export default app;
