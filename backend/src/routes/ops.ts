import { Router, Response } from 'express';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth';

const router = Router();
router.use(requireAuth);
router.use(requireRole('admin'));

router.get('/readiness', (_req: AuthRequest, res: Response) => {
  res.json({
    legal: [
      'Оферта с правилами трафика',
      'Dispute flow',
      'KYC для крупных выплат',
    ],
    backup: {
      postgresDump: 'pg_dump "$DATABASE_URL" > backup.sql',
      postgresRestore: 'psql "$DATABASE_URL" < backup.sql',
      verify: 'Восстановить дамп в тестовую БД и проверить health + логин',
    },
    security: [
      '2FA для admin',
      'API key scopes + revoke',
      'Immutable audit logs',
    ],
  });
});

export default router;

