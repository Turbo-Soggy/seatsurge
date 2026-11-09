import pg from 'pg';
import {
  SeatAlreadySoldError,
  type NewOrder,
  type Order,
  type OrderRepository,
  type SalesStats,
} from './types.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS orders (
  code          TEXT PRIMARY KEY,
  hold_id       TEXT NOT NULL UNIQUE,
  event_id      TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  email         TEXT NOT NULL,
  total         INTEGER NOT NULL,
  payment_ref   TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- The primary key on (event_id, seat_id) is the last line of defence against
-- double-selling: two orders can never contain the same seat.
CREATE TABLE IF NOT EXISTS order_seats (
  event_id   TEXT NOT NULL,
  seat_id    TEXT NOT NULL,
  order_code TEXT NOT NULL REFERENCES orders(code) ON DELETE CASCADE,
  section    TEXT NOT NULL,
  row_label  TEXT NOT NULL,
  number     INTEGER NOT NULL,
  price      INTEGER NOT NULL,
  PRIMARY KEY (event_id, seat_id)
);
`;

const UNIQUE_VIOLATION = '23505';

export class PgOrderRepository implements OrderRepository {
  constructor(private readonly pool: pg.Pool) {}

  static async connect(databaseUrl: string): Promise<PgOrderRepository> {
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 10 });
    await pool.query(SCHEMA);
    return new PgOrderRepository(pool);
  }

  async ping(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async createOrder(order: NewOrder): Promise<Order> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<{ created_at: Date }>(
        `INSERT INTO orders (code, hold_id, event_id, customer_name, email, total, payment_ref)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING created_at`,
        [order.code, order.holdId, order.eventId, order.customerName, order.email, order.total, order.paymentRef],
      );
      for (const seat of order.seats) {
        await client.query(
          `INSERT INTO order_seats (event_id, seat_id, order_code, section, row_label, number, price)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [order.eventId, seat.id, order.code, seat.section, seat.row, seat.number, seat.price],
        );
      }
      await client.query('COMMIT');
      return { ...order, createdAt: rows[0].created_at.toISOString() };
    } catch (err) {
      await client.query('ROLLBACK');
      if ((err as { code?: string }).code === UNIQUE_VIOLATION) throw new SeatAlreadySoldError();
      throw err;
    } finally {
      client.release();
    }
  }

  async deleteOrder(code: string): Promise<void> {
    await this.pool.query('DELETE FROM orders WHERE code = $1', [code]);
  }

  async getOrder(code: string): Promise<Order | null> {
    const { rows } = await this.pool.query(
      `SELECT o.*, json_agg(json_build_object(
          'id', s.seat_id, 'section', s.section, 'row', s.row_label,
          'number', s.number, 'price', s.price) ORDER BY s.seat_id) AS seats
       FROM orders o JOIN order_seats s ON s.order_code = o.code
       WHERE o.code = $1 GROUP BY o.code`,
      [code],
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      code: r.code,
      holdId: r.hold_id,
      eventId: r.event_id,
      customerName: r.customer_name,
      email: r.email,
      total: r.total,
      paymentRef: r.payment_ref,
      seats: r.seats,
      createdAt: new Date(r.created_at).toISOString(),
    };
  }

  async stats(eventId: string): Promise<SalesStats> {
    const { rows } = await this.pool.query(
      `SELECT count(DISTINCT o.code)::int AS orders, count(s.seat_id)::int AS seats,
              coalesce(sum(s.price), 0)::int AS revenue
       FROM orders o JOIN order_seats s ON s.order_code = o.code WHERE o.event_id = $1`,
      [eventId],
    );
    return rows[0];
  }
}
