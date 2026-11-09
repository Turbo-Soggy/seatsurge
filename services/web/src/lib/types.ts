export interface Seat {
  id: string;
  section: string;
  tier: string;
  row: string;
  number: number;
  x: number;
  y: number;
  price: number;
}

export interface Tier {
  code: string;
  name: string;
  price: number;
  color: string;
}

export interface Venue {
  id: string;
  artist: string;
  tour: string;
  venue: string;
  date: string;
  currency: string;
  viewbox: { width: number; height: number };
  stage: { x: number; y: number; width: number; height: number };
  tiers: Tier[];
  seats: Seat[];
  hold_policy: { ttl_seconds: number; max_seats: number };
}

export interface Availability {
  held: string[];
  sold: string[];
  counts: { total: number; available: number; held: number; sold: number };
}

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

export interface Order {
  code: string;
  customerName: string;
  email: string;
  total: number;
  seats: HoldSeat[];
  createdAt: string;
}

export interface SalesStats {
  orders: number;
  seats: number;
  revenue: number;
}

export type SeatStatus = 'available' | 'selected' | 'mine' | 'held' | 'sold';
