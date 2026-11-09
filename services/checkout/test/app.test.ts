import request from 'supertest';
import { describe, expect, it, beforeEach } from 'vitest';
import { confirmationCode, createApp } from '../src/app.js';
import { MockPaymentGateway } from '../src/clients.js';
import {
  SeatAlreadySoldError,
  type Hold,
  type InventoryClient,
  type NewOrder,
  type Order,
  type OrderRepository,
  type PaymentGateway,
} from '../src/types.js';

const HOLD: Hold = {
  hold_id: 'hold-1',
  event_id: 'neon-atlas-blr',
  seat_ids: ['FL1-A1', 'FL1-A2'],
  seats: [
    { id: 'FL1-A1', section: 'FL1', row: 'A', number: 1, price: 7999 },
    { id: 'FL1-A2', section: 'FL1', row: 'A', number: 2, price: 7999 },
  ],
  total: 15998,
  expires_at: Date.now() / 1000 + 60,
};

class MemoryOrders implements OrderRepository {
  orders = new Map<string, Order>();
  soldSeats = new Set<string>();
  healthy = true;

  async createOrder(order: NewOrder): Promise<Order> {
    if (order.seats.some((s) => this.soldSeats.has(s.id))) throw new SeatAlreadySoldError();
    order.seats.forEach((s) => this.soldSeats.add(s.id));
    const saved = { ...order, createdAt: new Date().toISOString() };
    this.orders.set(order.code, saved);
    return saved;
  }
  async deleteOrder(code: string): Promise<void> {
    this.orders.get(code)?.seats.forEach((s) => this.soldSeats.delete(s.id));
    this.orders.delete(code);
  }
  async getOrder(code: string) {
    return this.orders.get(code) ?? null;
  }
  async stats() {
    const all = [...this.orders.values()];
    return { orders: all.length, seats: this.soldSeats.size, revenue: all.reduce((a, o) => a + o.total, 0) };
  }
  async ping() {
    if (!this.healthy) throw new Error('db down');
  }
}

class FakeInventory implements InventoryClient {
  holds = new Map<string, Hold>([[HOLD.hold_id, HOLD]]);
  expireOnCommit = false;
  async getHold(id: string) {
    return this.holds.get(id) ?? null;
  }
  async commitHold(id: string) {
    if (this.expireOnCommit) return null;
    const hold = this.holds.get(id) ?? null;
    this.holds.delete(id);
    return hold;
  }
}

const approve: PaymentGateway = { charge: async () => ({ approved: true, reference: 'pay_ok' }) };
const decline: PaymentGateway = { charge: async () => ({ approved: false, reference: 'pay_no' }) };

const body = { hold_id: 'hold-1', name: 'Asha Rao', email: 'asha@example.com' };

describe('checkout API', () => {
  let orders: MemoryOrders;
  let inventory: FakeInventory;

  beforeEach(() => {
    orders = new MemoryOrders();
    inventory = new FakeInventory();
  });

  const app = (payments: PaymentGateway = approve) =>
    createApp({ orders, inventory, payments, version: 'test' });

  it('reports health, readiness and version', async () => {
    await request(app()).get('/healthz').expect(200, { status: 'ok' });
    await request(app()).get('/readyz').expect(200);
    orders.healthy = false;
    await request(app()).get('/readyz').expect(503);
    const res = await request(app()).get('/api/checkout/version').expect(200);
    expect(res.body.version).toBe('test');
  });

  it('confirms an order for a valid hold', async () => {
    const res = await request(app()).post('/api/checkout/orders').send(body).expect(201);
    expect(res.body.code).toMatch(/^SS-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(res.body.total).toBe(15998);
    expect(inventory.holds.has('hold-1')).toBe(false);

    const fetched = await request(app()).get(`/api/checkout/orders/${res.body.code}`).expect(200);
    expect(fetched.body.customerName).toBe('Asha Rao');
  });

  it('rejects invalid input with 422', async () => {
    await request(app()).post('/api/checkout/orders').send({ ...body, email: 'nope' }).expect(422);
  });

  it('returns 410 when the hold has expired', async () => {
    await request(app()).post('/api/checkout/orders').send({ ...body, hold_id: 'gone' }).expect(410);
  });

  it('returns 402 when payment is declined', async () => {
    await request(app(decline)).post('/api/checkout/orders').send(body).expect(402);
    expect(orders.orders.size).toBe(0);
  });

  it('returns 409 and never double-sells a seat', async () => {
    orders.soldSeats.add('FL1-A2');
    await request(app()).post('/api/checkout/orders').send(body).expect(409);
  });

  it('rolls the order back if the hold lapses during payment', async () => {
    inventory.expireOnCommit = true;
    await request(app()).post('/api/checkout/orders').send(body).expect(410);
    expect(orders.orders.size).toBe(0);
    expect(orders.soldSeats.size).toBe(0);
  });

  it('serves sales stats and prometheus metrics', async () => {
    await request(app()).post('/api/checkout/orders').send(body).expect(201);
    const stats = await request(app()).get('/api/checkout/events/neon-atlas-blr/stats').expect(200);
    expect(stats.body).toEqual({ orders: 1, seats: 2, revenue: 15998 });
    const metrics = await request(app()).get('/metrics').expect(200);
    expect(metrics.text).toContain('seatsurge_orders_total');
    expect(metrics.text).toContain('seatsurge_revenue_inr_total');
  });

  it('returns 404 for unknown orders', async () => {
    await request(app()).get('/api/checkout/orders/SS-NONE-NONE').expect(404);
  });
});

describe('helpers', () => {
  it('generates distinct confirmation codes', () => {
    const codes = new Set(Array.from({ length: 200 }, confirmationCode));
    expect(codes.size).toBe(200);
  });

  it('mock gateway declines according to failure rate', async () => {
    const alwaysFail = new MockPaymentGateway(1, () => 0.5);
    const neverFail = new MockPaymentGateway(0, () => 0.5);
    expect((await alwaysFail.charge(100, 'a@b.c')).approved).toBe(false);
    expect((await neverFail.charge(100, 'a@b.c')).approved).toBe(true);
  });
});
