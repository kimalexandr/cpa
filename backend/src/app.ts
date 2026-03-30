import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
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

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json());

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
app.use('/t', trackingRoutes);

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

export default app;
