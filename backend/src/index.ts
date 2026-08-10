import * as dotenv from 'dotenv';
import app from './app';
import { startWebhookRetryWorker } from './lib/postback-queue';
import { startSlaWorker } from './lib/sla-worker';
import { startListingsImportWorker } from './lib/listings-import-queue';
import { logger } from './lib/logger';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
  logger.info('API server listening on http://localhost:' + PORT);
});
startWebhookRetryWorker();
startSlaWorker();
startListingsImportWorker();
