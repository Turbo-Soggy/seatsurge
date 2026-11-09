import type { Availability, Hold, Order, SalesStats, Venue } from './types';

export class ApiError extends Error {
  readonly status: number;
  readonly detail?: unknown;

  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = body.detail ?? body;
    const message =
      (typeof detail === 'string' && detail) || detail?.message || body.error || `Request failed (${res.status})`;
    throw new ApiError(res.status, message, detail);
  }
  return body as T;
}

export const EVENT_ID = 'neon-atlas-blr';

export const api = {
  venue: () => request<Venue>(`/api/inventory/events/${EVENT_ID}`),
  availability: () => request<Availability>(`/api/inventory/events/${EVENT_ID}/availability`),
  hold: (seatIds: string[], sessionId: string) =>
    request<Hold>('/api/inventory/holds', {
      method: 'POST',
      body: JSON.stringify({ event_id: EVENT_ID, seat_ids: seatIds, session_id: sessionId }),
    }),
  release: (holdId: string) => request<void>(`/api/inventory/holds/${holdId}`, { method: 'DELETE' }),
  checkout: (holdId: string, name: string, email: string) =>
    request<Order>('/api/checkout/orders', {
      method: 'POST',
      body: JSON.stringify({ hold_id: holdId, name, email }),
    }),
  stats: () => request<SalesStats>(`/api/checkout/events/${EVENT_ID}/stats`),
  version: (service: 'inventory' | 'checkout') =>
    request<{ service: string; version: string }>(`/api/${service}/version`),
};

export function sessionId(): string {
  const KEY = 'seatsurge-session';
  try {
    const existing = sessionStorage.getItem(KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem(KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}
