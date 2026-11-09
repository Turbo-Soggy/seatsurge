export interface HoldSeat {
  id: string;
  section: string;
  row: string;
  number: number;
  price: number;
}

export interface Hold {
  hold_id: string;
  event_id: string;
  seat_ids: string[];
  seats: HoldSeat[];
  total: number;
  expires_at: number;
}

export interface NewOrder {
  code: string;
  holdId: string;
  eventId: string;
  customerName: string;
  email: string;
  total: number;
  paymentRef: string;
  seats: HoldSeat[];
}

export interface Order extends NewOrder {
  createdAt: string;
}

export interface SalesStats {
  orders: number;
  seats: number;
  revenue: number;
}

export interface EventSales extends SalesStats {
  eventId: string;
}

export class SeatAlreadySoldError extends Error {
  constructor() {
    super('seat already sold');
  }
}

export interface OrderRepository {
  createOrder(order: NewOrder): Promise<Order>;
  deleteOrder(code: string): Promise<void>;
  getOrder(code: string): Promise<Order | null>;
  stats(eventId: string): Promise<SalesStats>;
  /** Sales totals for every event, used by the business metrics gauges. */
  salesByEvent(): Promise<EventSales[]>;
  /** Deletes every order of an event and returns how many were removed. */
  resetEvent(eventId: string): Promise<number>;
  ping(): Promise<void>;
}

export interface InventoryClient {
  /** Returns null when the hold does not exist or has expired. */
  getHold(holdId: string): Promise<Hold | null>;
  /** Returns null when the hold expired before it could be committed. */
  commitHold(holdId: string): Promise<Hold | null>;
}

export interface PaymentGateway {
  charge(amount: number, email: string): Promise<{ approved: boolean; reference: string }>;
}
