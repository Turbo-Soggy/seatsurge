import { pino } from 'pino';
import { createApp } from './app.js';
import { HttpInventoryClient, MockPaymentGateway } from './clients.js';
import { loadConfig } from './config.js';
import { PgOrderRepository } from './db.js';
import { registerBusinessGauges } from './metrics.js';

const logger = pino({ base: { service: 'checkout' } });

async function connectWithRetry(url: string, attempts = 20): Promise<PgOrderRepository> {
  for (let i = 1; ; i++) {
    try {
      return await PgOrderRepository.connect(url);
    } catch (err) {
      if (i >= attempts) throw err;
      logger.warn({ attempt: i }, 'postgres not ready, retrying');
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const orders = await connectWithRetry(config.databaseUrl);
  const app = createApp({
    orders,
    inventory: new HttpInventoryClient(config.inventoryUrl),
    payments: new MockPaymentGateway(config.paymentFailureRate),
    version: config.appVersion,
    logger,
    allowReset: config.allowReset,
  });
  registerBusinessGauges(orders);
  const server = app.listen(config.port, () => {
    logger.info({ port: config.port, version: config.appVersion }, 'checkout listening');
  });

  // Graceful shutdown so Kubernetes rolling updates drain in-flight requests.
  const shutdown = (signal: string) => {
    logger.info({ signal }, 'shutting down');
    server.close(async () => {
      await orders.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'failed to start');
  process.exit(1);
});
