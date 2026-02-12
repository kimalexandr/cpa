import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth';
import meRoutes from './routes/me';
import categoriesRoutes from './routes/categories';
import offersRoutes from './routes/offers';
import supplierRoutes from './routes/supplier';
import affiliateRoutes from './routes/affiliate';
import trackingRoutes from './routes/tracking';
import eventsRoutes from './routes/events';
import pagesRoutes from './routes/pages';

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/me', meRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/offers', offersRoutes);
app.use('/api/supplier', supplierRoutes);
app.use('/api/affiliate', affiliateRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/pages', pagesRoutes);
app.use('/t', trackingRoutes);

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

export default app;
