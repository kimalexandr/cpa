import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import * as Sentry from '@sentry/node';
import { PrismaClient } from '@prisma/client';
import authRoutes from './routes/auth';
import meRoutes from './routes/me';
import categoriesRoutes from './routes/categories';
import locationsRoutes from './routes/locations';
import offersRoutes from './routes/offers';
import supplierRoutes from './routes/supplier';
import affiliateRoutes from './routes/affiliate';
import trackingRoutes from './routes/tracking';
import eventsRoutes from './routes/events';
import pagesRoutes from './routes/pages';
import adminRoutes from './routes/admin';
import restoreAdminRoutes from './routes/restore-admin';
import statusCenterRoutes from './routes/status-center';
import realtimeRoutes from './routes/realtime';
import onboardingRoutes from './routes/onboarding';
import integrationsRoutes from './routes/integrations';
import v1Routes from './routes/v1';
import opsRoutes from './routes/ops';
import internalLeadRoutes from './routes/internal-lead';
import { logger } from './lib/logger';
import { httpRequestDuration, metricsText } from './lib/metrics';

const app = express();
const prisma = new PrismaClient();
if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN });
}
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(pinoHttp({ logger }));
app.use(express.json());
app.use(rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000),
  limit: Number(process.env.RATE_LIMIT_MAX || 300),
  standardHeaders: true,
  legacyHeaders: false,
}));
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const route = req.route?.path || req.path || 'unknown';
    httpRequestDuration.labels(req.method, String(route), String(res.statusCode)).observe(Date.now() - start);
  });
  next();
});
app.use((req, res, next) => {
  res.on('finish', async () => {
    try {
      const isWrite = req.method === 'POST' || req.method === 'PATCH' || req.method === 'DELETE' || req.method === 'PUT';
      const isAdminOrSensitive = req.path.startsWith('/api/admin') || req.path.startsWith('/api/me/2fa') || req.path.indexOf('/payout') !== -1;
      if (!isWrite || !isAdminOrSensitive) return;
      const auth = req.headers.authorization || '';
      const actorToken = auth.startsWith('Bearer ') ? auth.slice(7) : null;
      await prisma.auditLog.create({
        data: {
          actorId: null,
          actorRole: null,
          action: req.method + ' ' + req.path,
          entityType: 'http',
          entityId: req.path,
          before: null,
          after: JSON.stringify({ statusCode: res.statusCode, body: req.body || null }).slice(0, 8000),
          ip: req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : (req.socket.remoteAddress || null),
          userAgent: req.headers['user-agent'] ? String(req.headers['user-agent']) : null,
        },
      });
      if (!actorToken) return;
    } catch (_e) {}
  });
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/me', meRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/locations', locationsRoutes);
app.use('/api/offers', offersRoutes);
app.use('/api/supplier', supplierRoutes);
app.use('/api/affiliate', affiliateRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/pages', pagesRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/restore-admin', restoreAdminRoutes);
app.use('/api/status-center', statusCenterRoutes);
app.use('/api/realtime', realtimeRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/integrations', integrationsRoutes);
app.use('/api/v1', v1Routes);
app.use('/api/ops', opsRoutes);
app.use('/api/internal-lead', internalLeadRoutes);
app.use('/t', trackingRoutes);

app.get('/metrics', async (_req, res) => {
  res.setHeader('Content-Type', 'text/plain; version=0.0.4');
  res.send(await metricsText());
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

export default app;
