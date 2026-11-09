import { randomBytes } from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';
import { z } from 'zod';
import { metricsMiddleware, ordersTotal, registry, revenueTotal } from './metrics.js';
import {
  SeatAlreadySoldError,
  type InventoryClient,
  type OrderRepository,
  type PaymentGateway,
} from './types.js';

export interface AppDeps {
  orders: OrderRepository;
  inventory: InventoryClient;
  payments: PaymentGateway;
  version: string;
  logger?: Logger;
}

const OrderRequest = z.object({
  hold_id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(120),
});

/** Human-friendly confirmation code, e.g. "SS-7KQ2-M9XD". */
export function confirmationCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(8);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]);
  return `SS-${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}

export function createApp(deps: AppDeps): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10kb' }));
  if (deps.logger) {
    app.use(pinoHttp({ logger: deps.logger, autoLogging: { ignore: (req) => req.url === '/metrics' } }));
  }
  app.use(metricsMiddleware);

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/readyz', async (_req, res) => {
    try {
      await deps.orders.ping();
      res.json({ status: 'ready' });
    } catch (err) {
      res.status(503).json({ status: 'not ready', error: (err as Error).message });
    }
  });

  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', registry.contentType);
    res.send(await registry.metrics());
  });

  app.get('/api/checkout/version', (_req, res) => {
    res.json({ service: 'checkout', version: deps.version });
  });

  app.post('/api/checkout/orders', async (req, res) => {
    const parsed = OrderRequest.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: 'invalid request', issues: parsed.error.issues });
      return;
    }
    const { hold_id: holdId, name, email } = parsed.data;

    const hold = await deps.inventory.getHold(holdId);
    if (!hold) {
      ordersTotal.inc({ result: 'expired' });
      res.status(410).json({ error: 'Your hold expired. Pick your seats again.' });
      return;
    }

    const payment = await deps.payments.charge(hold.total, email);
    if (!payment.approved) {
      ordersTotal.inc({ result: 'payment_declined' });
      res.status(402).json({ error: 'Payment declined by the bank. Try again.' });
      return;
    }

    const code = confirmationCode();
    let order;
    try {
      order = await deps.orders.createOrder({
        code,
        holdId,
        eventId: hold.event_id,
        customerName: name,
        email,
        total: hold.total,
        paymentRef: payment.reference,
        seats: hold.seats,
      });
    } catch (err) {
      if (err instanceof SeatAlreadySoldError) {
        ordersTotal.inc({ result: 'conflict' });
        res.status(409).json({ error: 'One of these seats was already sold.' });
        return;
      }
      throw err;
    }

    // Only now flip the seats to "sold" in inventory. If the hold lapsed in the
    // meantime, undo the order so the seats are not double-booked.
    const committed = await deps.inventory.commitHold(holdId);
    if (!committed) {
      await deps.orders.deleteOrder(code);
      ordersTotal.inc({ result: 'expired' });
      res.status(410).json({ error: 'Your hold expired during payment. You were not charged.' });
      return;
    }

    ordersTotal.inc({ result: 'confirmed' });
    revenueTotal.inc(order.total);
    res.status(201).json(order);
  });

  app.get('/api/checkout/orders/:code', async (req, res) => {
    const order = await deps.orders.getOrder(req.params.code);
    if (!order) {
      res.status(404).json({ error: 'order not found' });
      return;
    }
    res.json(order);
  });

  app.get('/api/checkout/events/:eventId/stats', async (req, res) => {
    res.json(await deps.orders.stats(req.params.eventId));
  });

  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    req.log?.error({ err }, 'unhandled error');
    res.status(500).json({ error: 'internal error' });
  });

  return app;
}
